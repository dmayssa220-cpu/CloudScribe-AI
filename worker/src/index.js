import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const app = new Hono();
app.use('*', cors());


const getSupabaseAuth = (env, token) => {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
};


const getSupabaseAdmin = (env) => {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
};

app.get('/api/health', (c) => c.json({ status: 'ok' }));


app.post('/api/generate', async (c) => {
  try {
    
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Non autorisé' }, 401);
    const token = authHeader.replace('Bearer ', '');
    
    const supabase = getSupabaseAuth(c.env, token);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: 'Token invalide' }, 401);

  
    const body = await c.req.json();
    const notes = body.notes || '';
    const tier = body.tier || 'normal';
    const imageBase64 = body.image;
    const imageMimeType = body.mimeType;

    
    if (!notes.trim() && !imageBase64) {
      return c.json({ error: 'Les notes et l\'image sont vides.' }, 400);
    }

    
    if (tier === 'premium') {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('user_id', user.id)
        .single();

      if (!sub || sub.plan !== 'premium') {
        return c.json({ error: 'Abonnement Premium requis pour ce niveau.' }, 403);
      }
    }

   
    let systemPrompt = '';
        if (tier === 'premium') {
      systemPrompt = "Tu es un assistant exécutif. Génère un compte rendu détaillé avec : un titre principal (en utilisant ##), un résumé exécutif (3 phrases), des points clés (4-6), et un plan d'action avec responsables et échéances si mentionnés. Utilise le format Markdown pour les titres (##, ###), le gras (**texte**) et les listes à puces (-). Sois formel et structuré.";
    } else if (tier === 'pro') {
      systemPrompt = "Tu es un assistant professionnel. Génère un compte rendu structuré avec : un titre (##), un résumé (3 phrases), des points clés (3-5), et des actions à suivre. Utilise le format Markdown (## pour les titres, ** pour le gras, - pour les listes). Sois clair et concis.";
    } else {
      systemPrompt = "Tu es un assistant concis. Génère un compte rendu simple avec : un titre (##) et 3 points clés maximum. Utilise le format Markdown. Va droit au but.";
    }

    const fullPrompt = `${systemPrompt}\n\nVoici les notes brutes à transformer :\n"""\n${notes}\n"""\n\nRéponds uniquement avec le compte rendu formaté, sans aucune introduction.`;

    
    const parts = [{ text: fullPrompt }];
    
    if (imageBase64 && imageMimeType) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64
        }
      });
    }

    
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': c.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: parts }]
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text();
      console.error('Erreur Gemini:', errorData);
      return c.json({ error: 'Erreur lors de l\'appel à l\'IA.' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) return c.json({ error: 'L\'IA n\'a pas pu générer de réponse.' }, 500);

   
    const { data, error: dbError } = await supabase
      .from('reports')
      .insert({
        raw_notes: notes,
        generated_text: generatedText,
        tier: tier,
        user_id: user.id,
         image_base64: imageBase64 || null,     
        image_mime_type: imageMimeType || null  
      })
      .select()
      .single();

    if (dbError) {
      console.error('Erreur Supabase insert:', dbError);
      return c.json({ success: true, tier, result: generatedText, warning: 'Non sauvegardé.' });
    }

    return c.json({ success: true, tier, result: generatedText, id: data.id });

  } catch (error) {
    console.error('Erreur interne:', error);
    return c.json({ error: 'Erreur interne du serveur.' }, 500);
  }
});


app.get('/api/history', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Non autorisé' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAuth(c.env, token);

    const { data, error } = await supabase
      .from('reports')
      .select('id, created_at, tier, generated_text, image_base64, image_mime_type')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return c.json({ error: 'Impossible de récupérer l\'historique.' }, 500);

    return c.json({ history: data });
  } catch (error) {
    return c.json({ error: 'Erreur interne du serveur.' }, 500);
  }
});


app.post('/api/create-checkout-session', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Non autorisé' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAuth(c.env, token);
    const { data: { user } } = await supabase.auth.getUser();

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: c.env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }], 
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: user.id, 
      success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing`,
    });

    return c.json({ url: session.url });
  } catch (error) {
    console.error('Erreur Stripe Checkout:', error);
    return c.json({ error: 'Impossible de créer la session.' }, 500);
  }
});


app.post('/api/stripe-webhook', async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();
  let event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return c.text(`Webhook Error: ${err.message}`, 400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id; 

    if (userId) {
      const supabaseAdmin = getSupabaseAdmin(c.env);
   
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .upsert({ user_id: userId, plan: 'premium', updated_at: new Date() });
      
      if (error) console.error('Erreur mise à jour abonnement:', error);
      else console.log('Abonnement Premium activé pour:', userId);
    }
  }

  return c.json({ received: true });
});

app.post('/api/chat', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Non autorisé' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAuth(c.env, token);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: 'Token invalide' }, 401);

    const { document, question, history } = await c.req.json();

    if (!document || !question) {
      return c.json({ error: 'Document ou question manquant.' }, 400);
    }

  
    const systemPrompt = `Tu es un assistant intelligent qui répond aux questions basées UNIQUEMENT sur le document fourni ci-dessous. 
Si la réponse ne se trouve pas dans le document, dis simplement "Je ne trouve pas cette information dans le document."
Sois concis et précis.

--- DOCUMENT ---
${document}
----------------

Historique de la conversation :
${(history || []).map(msg => `${msg.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${msg.content}`).join('\n')}

Question actuelle de l'utilisateur : ${question}`;

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': c.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
      })
    });

    if (!geminiResponse.ok) throw new Error('Erreur API Gemini');

    const geminiData = await geminiResponse.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    return c.json({ answer });

  } catch (error) {
    console.error(error);
    return c.json({ error: 'Erreur lors de la discussion.' }, 500);
  }
});

app.post('/api/extract-tasks', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Non autorisé' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAuth(c.env, token);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: 'Token invalide' }, 401);

    const { reportId, text } = await c.req.json();
    if (typeof text !== 'string' || !text.trim()) {
      return c.json({ error: 'Le compte rendu est vide.' }, 400);
    }

    const prompt = `Extrais toutes les actions et tâches à faire à partir du document suivant. 
Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour. Format : [{"content": "Description de la tâche"}]
Si aucune tâche n'est trouvée, renvoie [].

Document :
${text}`;

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
    let tasks = [];
    let usedFallback = false;
    try {
      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 512 }
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!geminiResponse.ok) {
        throw new Error(`Gemini HTTP ${geminiResponse.status}: ${await geminiResponse.text()}`);
      }

      const geminiData = await geminiResponse.json();
      const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error('Gemini a renvoyé une réponse vide.');

      tasks = JSON.parse(textResponse.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (!Array.isArray(tasks) || tasks.some((task) => typeof task.content !== 'string')) {
        throw new Error('Format de tâches Gemini invalide.');
      }
    } catch (error) {
      console.error('Gemini indisponible pour extract-tasks, utilisation du repli local:', error);
      usedFallback = true;
      const lines = text.split('\n');
      let inActionSection = false;
      const actionLines = [];

      for (const line of lines) {
        const heading = line.match(/^\s*#{1,6}\s+(.+)$/);
        if (heading) {
          inActionSection = /action|tâche|a faire|à faire|suivi|prochaine étape/i.test(heading[1]);
          continue;
        }

        const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
        if (inActionSection && item) actionLines.push(item[1].trim());
      }

      tasks = [...new Set(actionLines.filter(Boolean))].map((content) => ({ content }));
    }

    if (reportId && tasks.length > 0) {
      const tasksToInsert = tasks.map(t => ({
        report_id: reportId,
        user_id: user.id,
        content: t.content
      }));
      const { error: insertError } = await supabase.from('tasks').insert(tasksToInsert);
      if (insertError) {
        console.error('Erreur Supabase insert tasks:', insertError);
        return c.json({ tasks, warning: 'Les tâches ont été extraites mais n’ont pas pu être sauvegardées.', usedFallback });
      }
    }

    return c.json({
      tasks,
      ...(usedFallback ? { warning: tasks.length ? 'Gemini est indisponible; les actions ont été extraites des puces de la section Actions.' : 'Gemini est indisponible et aucune puce de la section Actions n’a été trouvée.' } : {})
    });
  } catch (error) {
    console.error('Erreur extraction des tâches:', error);
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return c.json({ error: 'Le service IA met trop de temps à répondre. Réessayez.' }, 504);
    }
    return c.json({ error: 'Erreur lors de l’extraction des tâches.' }, 500);
  }
});

app.post('/api/translate', async (c) => {
  try {
  
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Non autorisé' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAuth(c.env, token);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: 'Token invalide' }, 401);

    const { text, language } = await c.req.json();
    if (!text || !language) return c.json({ error: 'Texte ou langue manquant.' }, 400);

   
    const prompt = `Tu es un traducteur professionnel. Traduis le texte suivant en ${language}.
RÈGLES IMPORTANTES :
- Conserve EXACTEMENT le format Markdown (les titres ##, le gras **, les listes -).
- Ne traduis pas les noms propres ou les termes techniques s'ils n'ont pas d'équivalent.
- Ne réponds qu'avec la traduction, sans aucune phrase d'introduction ni explication.

Voici le texte à traduire :
---
${text}
---`;

   
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': c.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });

    if (!geminiResponse.ok) throw new Error('Erreur API Gemini');

    const geminiData = await geminiResponse.json();
    const translatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!translatedText) throw new Error('Traduction vide');

    return c.json({ translatedText });

  } catch (error) {
    console.error('Erreur traduction:', error);
    return c.json({ error: 'Erreur lors de la traduction.' }, 500);
  }
});
export default app;