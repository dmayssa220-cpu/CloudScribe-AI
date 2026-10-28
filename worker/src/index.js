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

export default app;