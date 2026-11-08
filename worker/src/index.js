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
    const workspaceId = body.workspaceId || null;
    const template = body.template;
    const outputLanguage = body.outputLanguage;
    const supabaseAdmin = getSupabaseAdmin(c.env);
    

    if (!notes.trim() && !imageBase64) {
      return c.json({ error: 'Les notes et l\'image sont vides.' }, 400);
    }

    if (workspaceId) {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('workspace_members')
        .select('workspace_id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        console.error('Erreur de vérification de l’équipe du compte rendu:', membershipError);
        return c.json({ error: 'Impossible de vérifier l’équipe sélectionnée.' }, 500);
      }
      if (!membership) return c.json({ error: 'Vous ne faites pas partie de cette équipe.' }, 403);
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
      if (geminiResponse.status === 429) {
        let retryMessage = '';
        try {
          const retryDelay = JSON.parse(errorData).error?.details
            ?.find((detail) => detail['@type']?.endsWith('RetryInfo'))?.retryDelay;
          const retrySeconds = Number.parseInt(retryDelay, 10);
          if (Number.isFinite(retrySeconds)) {
            const totalMinutes = Math.ceil(retrySeconds / 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            retryMessage = ` Réessayez dans environ ${hours} h ${minutes} min.`;
          }
        } catch {
         
        }

        return c.json({
          error: `Le quota quotidien de l’IA est épuisé.${retryMessage} Vous pouvez attendre son renouvellement ou vérifier la facturation et les limites dans Google AI Studio.`
        }, 429);
      }
      if (geminiResponse.status === 503) {
        return c.json({ error: 'Le service IA est temporairement surchargé. Réessayez dans quelques minutes.' }, 503);
      }
      return c.json({ error: 'Erreur lors de l\'appel à l\'IA.' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) return c.json({ error: 'L\'IA n\'a pas pu générer de réponse.' }, 500);
      
    let sentimentData = { sentiment: 'Neutre', score: 50, explication: 'Aucune analyse disponible.' };
    try {
      const sentimentPrompt = `Analyse le ton de ces notes de réunion. 
Réponds UNIQUEMENT avec un objet JSON valide (sans markdown) contenant :
- "sentiment": "Positif", "Neutre" ou "Négatif"
- "score": un nombre de 0 à 100 (0 = très négatif, 100 = très positif)
- "explication": une phrase courte expliquant pourquoi.

Notes : ${notes}`;

    const sentResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: sentimentPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      
      if (sentResponse.ok) {
        const sentData = await sentResponse.json();
        sentimentData = JSON.parse(sentData.candidates[0].content.parts[0].text);
      }
    } catch (e) {
      console.error("Erreur analyse sentiment:", e);
    }
    const { data: settings } = await supabase.from('user_settings').select('custom_prompt').eq('user_id', user.id).single();
    const customPrompt = settings?.custom_prompt || '';
    let templateInstruction = "";
if (template === 'agile') {
  templateInstruction = "Structure le compte rendu avec les titres suivants : ## Hier, ## Aujourd'hui, ## Blocages.";
} else if (template === 'commercial') {
  templateInstruction = "Structure le compte rendu avec les titres suivants : ## Besoin du client, ## Solution proposée, ## Prochaines étapes.";
}
const languageInstruction = `Génère le compte rendu en langue : ${outputLanguage || 'Français'}.`;
const finalPrompt = `${systemPrompt}\n${templateInstruction}\n${languageInstruction}\nInstructions supplémentaires de l'utilisateur : ${customPrompt}\n\nVoici les notes :\n${notes}`;
    const { data, error: dbError } = await supabaseAdmin
      .from('reports')
      .insert({
        raw_notes: notes,
        generated_text: generatedText,
        tier: tier,
        user_id: user.id,
        workspace_id: workspaceId,
        image_base64: imageBase64 || null,     
        image_mime_type: imageMimeType || null  ,
        sentiment: sentimentData.sentiment,      
        sentiment_score: sentimentData.score,  
        sentiment_explication: sentimentData.explication 
      })
      .select()
      .single();

    if (dbError) {
      console.error('Erreur Supabase insert:', dbError);
      return c.json({ error: 'Le compte rendu a été généré, mais n’a pas pu être sauvegardé.', details: dbError.message }, 500);
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: 'Token invalide' }, 401);

    const supabaseAdmin = getSupabaseAdmin(c.env);
    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id);

    if (membershipsError) {
      console.error('Erreur récupération des équipes pour l’historique:', membershipsError);
      return c.json({ error: 'Impossible de récupérer l\'historique.' }, 500);
    }

    const workspaceIds = memberships.map((membership) => membership.workspace_id);
    let query = supabaseAdmin
      .from('reports')
      .select('id, created_at, tier, generated_text, image_base64, image_mime_type')
      .order('created_at', { ascending: false })
      .limit(20);
    query = workspaceIds.length
      ? query.or(`user_id.eq.${user.id},workspace_id.in.(${workspaceIds.join(',')})`)
      : query.eq('user_id', user.id);
    const { data, error } = await query;

    if (error) {
      console.error('Erreur récupération de l’historique:', error);
      return c.json({ error: 'Impossible de récupérer l\'historique.' }, 500);
    }

    return c.json({ history: data });
  } catch (error) {
    console.error('Erreur interne lors de la récupération de l’historique:', error);
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

    if (!geminiResponse.ok) {
      const errorDetails = await geminiResponse.text();
      console.error('Erreur Gemini chat:', errorDetails);
      if (geminiResponse.status === 503) {
        return c.json({ error: 'Le service IA est temporairement surchargé. Réessayez dans quelques minutes.' }, 503);
      }
      if (geminiResponse.status === 429) {
        return c.json({ error: 'Le quota Gemini est épuisé. Vérifiez vos limites et la facturation Google AI Studio.' }, 429);
      }
      return c.json({ error: 'Le service IA n’a pas pu répondre à cette question.' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) return c.json({ error: 'Le service IA a renvoyé une réponse vide.' }, 502);

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

    const prompt = `Extrais les tâches concrètes à réaliser à partir du document suivant.
  Considère les actions explicites, les décisions à mettre en œuvre, les engagements et les suivis à effectuer, même s'ils ne sont pas présentés sous un titre « Actions ».
  Reformule chaque élément comme une tâche courte commençant par un verbe. Ignore les informations purement descriptives, les faits déjà accomplis et les simples sujets discutés.
  Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour. Format : [{"content": "Description de la tâche"}]
  Renvoie [] uniquement si le document ne contient vraiment aucune action future ou aucun suivi concret.

Document :
${text}`;

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
    let tasks = [];
    let usedFallback = false;
    let fallbackReason = 'Gemini est temporairement indisponible';
    try {
      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 512 }
        }),
        signal: AbortSignal.timeout(300000)
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
      if (tasks.length === 0) {
        throw new Error('Gemini n’a détecté aucune tâche; vérification locale du compte rendu.');
      }
    } catch (error) {
      const noTasksDetected = error instanceof Error && error.message.includes('aucune tâche');
      if (noTasksDetected) {
        fallbackReason = 'Gemini n’a détecté aucune tâche';
        console.info('Gemini n’a détecté aucune tâche; vérification locale du compte rendu.');
      } else {
        console.error('Échec de l’extraction Gemini, utilisation du repli local:', error);
      }
      usedFallback = true;
      const lines = text.split('\n');
      let inActionSection = false;
      const actionLines = [];
      const allBulletLines = [];
      const actionParagraphs = [];
      const directiveLines = [];
      const directivePattern = /(?:^\s*(?:envoyer|contacter|planifier|préparer|preparer|créer|creer|mettre en place|définir|definir|vérifier|verifier|confirmer|transmettre|organiser|réaliser|realiser|terminer|suivre|relancer|finaliser|attribuer|prévoir|prevoir|établir|etablir|présenter|presenter|choisir|décider|decider|répondre|repondre|communiquer|partager|mettre à jour|mettre au point|identifier|analyser|évaluer|evaluer|valider|lancer|développer|developper|livrer|examiner|documenter|coordonner|approuver|commencer|poursuivre)\b|\b(?:doit|doivent|devra|devront|il faut|à faire|a faire|à réaliser|a realiser|est chargé de|sont chargés de|prévoir de|prevoir de|prévoit de|prevoient de|nous allons|on va|action requise|engagement|suivi à|suivi a|must|should|needs? to|to do)\b)/i;

      for (const line of lines) {
        const heading = line.trim()
          .replace(/^#{1,6}\s*/, '')
          .replace(/^\d+[.)]?\s*/, '')
          .replace(/\*\*/g, '')
          .replace(/[*_`]/g, '')
          .replace(/[’‘]/g, "'")
          .replace(/[:：]+$/, '')
          .trim();
        const normalizedHeading = heading.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/^(plan d'action|actions?( a| à)?|taches?( a| à)?|a faire|suivi|prochaines? etapes?|decisions?( a| a mettre en oeuvre)?|engagements?|recommandations?)(\b|\s|:)/i.test(normalizedHeading)) {
          inActionSection = true;
          continue;
        }
        if (/^#{1,6}\s/.test(line.trim()) || /^\*\*.+\*\*:?$/.test(line.trim())) {
          inActionSection = false;
        }

        const item = line.match(/^\s*(?:[-*•–—☐☑✓]|\d+[.)])\s+(?:\[[ xX]\]|[☐☑✓])?\s*(.+)$/);
        if (!item) {
          const paragraph = line.replace(/^\s*\*\*|\*\*\s*$/g, '').trim();
          if (paragraph && inActionSection) actionParagraphs.push(paragraph);
          if (paragraph && directivePattern.test(paragraph)) directiveLines.push(paragraph);
          continue;
        }

        const content = item[1].replace(/\*\*/g, '').trim();
        if (inActionSection) actionLines.push(content);
        allBulletLines.push(content);
      }

      const actionVerb = /^(?:a|à)\s+faire\b|^(?:envoyer|contacter|planifier|préparer|preparer|créer|creer|mettre en place|définir|definir|vérifier|verifier|confirmer|transmettre|organiser|réaliser|realiser|terminer|suivre|relancer|finaliser|attribuer|prévoir|prevoir|établir|etablir|présenter|presenter|choisir|décider|decider|répondre|repondre|communiquer|partager|mettre à jour|mettre au point|identifier|analyser|évaluer|evaluer|valider|lancer|développer|developper|livrer|examiner|documenter|coordonner|approuver|commencer|poursuivre)\b/i;
      const splitParagraphs = (paragraphs) => paragraphs.flatMap((paragraph) => paragraph
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.replace(/\*\*/g, '').replace(/^[-*•\s]+/, '').trim())
        .filter(Boolean));
      const candidates = actionLines.length
        ? actionLines
        : splitParagraphs(actionParagraphs).length
          ? splitParagraphs(actionParagraphs)
          : allBulletLines.filter((content) => actionVerb.test(content)).length
            ? allBulletLines.filter((content) => actionVerb.test(content))
            : splitParagraphs(directiveLines);
      tasks = [...new Set(candidates.filter(Boolean))].map((content) => ({ content }));
    }

    if (reportId && tasks.length > 0) {
      const tasksToInsert = tasks.map(t => ({
        report_id: reportId,
        user_id: user.id,
        content: t.content
      }));
      const { data: savedTasks, error: insertError } = await supabase
        .from('tasks')
        .insert(tasksToInsert)
        .select('id, content, is_done');
      if (insertError) {
        console.error('Erreur Supabase insert tasks:', insertError);
        return c.json({ tasks, warning: 'Les tâches ont été extraites mais n’ont pas pu être sauvegardées.', usedFallback });
      }
      tasks = savedTasks || tasks;
    }

    return c.json({
      tasks,
      ...(usedFallback ? { warning: tasks.length ? `${fallbackReason}; les actions ont été extraites du compte rendu.` : `${fallbackReason} et aucune action identifiable n’a été trouvée dans le compte rendu.` } : {})
    });
  } catch (error) {
    console.error('Erreur extraction des tâches:', error);
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return c.json({ error: 'Le service IA met trop de temps à répondre. Réessayez.' }, 504);
    }
    return c.json({ error: 'Erreur lors de l’extraction des tâches.' }, 500);
  }
});

app.post('/api/share', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Non autorisé' }, 401);
    const supabase = getSupabaseAuth(c.env, authHeader.replace('Bearer ', ''));
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: 'Token invalide' }, 401);

    const { reportId } = await c.req.json();
    if (!reportId) return c.json({ error: 'Identifiant du compte rendu manquant.' }, 400);
    const supabaseAdmin = getSupabaseAdmin(c.env);
    const { data: report, error: reportError } = await supabaseAdmin
      .from('reports')
      .select('id, user_id, workspace_id')
      .eq('id', reportId)
      .maybeSingle();

    if (reportError) {
      console.error('Erreur de vérification du compte rendu à partager:', reportError);
      return c.json({ error: 'Impossible de vérifier le compte rendu.' }, 500);
    }
    if (!report) return c.json({ error: 'Compte rendu introuvable.' }, 404);

    let canShare = report.user_id === user.id;
    if (!canShare && report.workspace_id) {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('workspace_members')
        .select('workspace_id')
        .eq('workspace_id', report.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        console.error('Erreur de vérification de l’équipe du compte rendu à partager:', membershipError);
        return c.json({ error: 'Impossible de vérifier les droits de partage.' }, 500);
      }
      canShare = Boolean(membership);
    }
    if (!canShare) return c.json({ error: 'Vous n’êtes pas autorisé à partager ce compte rendu.' }, 403);

    const { data, error } = await supabaseAdmin
      .from('reports')
      .update({ share_token: crypto.randomUUID() })
      .eq('id', reportId)
      .select('share_token')
      .single();

    if (error) {
      console.error('Erreur Supabase partage:', error);
      return c.json({ error: 'Erreur lors de la création du lien de partage.', details: error.message }, 500);
    }
    return c.json({ shareToken: data.share_token });
  } catch (error) {
    console.error('Erreur interne lors du partage:', error);
    return c.json({ error: 'Erreur interne lors de la création du lien de partage.' }, 500);
  }
});


app.get('/api/share/:token', async (c) => {
  const shareToken = c.req.param('token');
  const supabaseAdmin = getSupabaseAdmin(c.env);
  
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('generated_text, tier, created_at, sentiment, sentiment_score, sentiment_explication')
    .eq('share_token', shareToken)
    .single();

  if (error || !data) return c.json({ error: 'Lien introuvable ou expiré.' }, 404);
  return c.json({ report: data });
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
app.post('/api/workspaces', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Non autorisé' }, 401);
    const supabase = getSupabaseAuth(c.env, authHeader.replace('Bearer ', ''));
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: 'Token invalide' }, 401);

    const { name } = await c.req.json();
    const workspaceName = typeof name === 'string' ? name.trim() : '';
    if (!workspaceName) return c.json({ error: 'Le nom de l’équipe est obligatoire.' }, 400);

    const supabaseAdmin = getSupabaseAdmin(c.env);
    const { data: workspace, error: wsError } = await supabaseAdmin
      .from('workspaces')
      .insert({ name: workspaceName, owner_id: user.id })
      .select()
      .single();

    if (wsError) {
      console.error('Erreur Supabase création équipe:', wsError);
      return c.json({ error: 'Erreur lors de la création de l’équipe.', details: wsError.message }, 500);
    }

    const { error: memberError } = await supabaseAdmin
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' });

    if (memberError) {
      console.error('Erreur Supabase ajout du propriétaire à l’équipe:', memberError);
      const { error: cleanupError } = await supabaseAdmin
        .from('workspaces')
        .delete()
        .eq('id', workspace.id);
      if (cleanupError) console.error('Erreur nettoyage de l’équipe incomplète:', cleanupError);
      return c.json({ error: 'L’équipe a été créée, mais son propriétaire n’a pas pu être ajouté.', details: memberError.message }, 500);
    }

    return c.json({ workspace });
  } catch (error) {
    console.error('Erreur interne création équipe:', error);
    return c.json({ error: 'Erreur interne lors de la création de l’équipe.' }, 500);
  }
});
app.get('/api/workspaces', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Non autorisé' }, 401);
    const supabase = getSupabaseAuth(c.env, authHeader.replace('Bearer ', ''));
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: 'Token invalide' }, 401);

    const supabaseAdmin = getSupabaseAdmin(c.env);
    const { data, error } = await supabaseAdmin
      .from('workspace_members')
      .select('workspace_id, role, workspaces(name)')
      .eq('user_id', user.id);

    if (error) {
      console.error('Erreur Supabase récupération équipes:', error);
      return c.json({ error: 'Erreur lors de la récupération des équipes.', details: error.message }, 500);
    }
    return c.json({ workspaces: data });
  } catch (error) {
    console.error('Erreur interne récupération équipes:', error);
    return c.json({ error: 'Erreur interne lors de la récupération des équipes.' }, 500);
  }
});

app.post('/api/workspaces/invite', async (c) => {
  const authHeader = c.req.header('Authorization');
  const supabase = getSupabaseAuth(c.env, authHeader.replace('Bearer ', ''));
  const { workspaceId, email } = await c.req.json();

  
  const { error } = await supabase
    .from('workspace_invitations')
    .insert({ workspace_id: workspaceId, email: email });

  if (error) return c.json({ error: 'Erreur lors de l\'invitation' }, 500);
  return c.json({ success: true, message: 'Invitation envoyée (simulée).' });
});

app.post('/api/workspaces/accept-invites', async (c) => {
  const authHeader = c.req.header('Authorization');
  const supabase = getSupabaseAuth(c.env, authHeader.replace('Bearer ', ''));
  const { data: { user } } = await supabase.auth.getUser();
  const { data: invites } = await supabase
    .from('workspace_invitations')
    .select('*')
    .eq('email', user.email)
    .eq('status', 'pending');

  if (invites && invites.length > 0) {
    for (const invite of invites) {
    
      await supabase.from('workspace_members').insert({
        workspace_id: invite.workspace_id,
        user_id: user.id,
        role: 'member'
      });
     
      await supabase.from('workspace_invitations').update({ status: 'accepted' }).eq('id', invite.id);
    }
  }
  return c.json({ success: true });
});
app.post('/api/comments', async (c) => {
  const authHeader = c.req.header('Authorization');
  const supabase = getSupabaseAuth(c.env, authHeader.replace('Bearer ', ''));
  const { data: { user } } = await supabase.auth.getUser();
  
  const { reportId, selectedText, commentText } = await c.req.json();
  
  const { error } = await supabase.from('comments').insert({
    report_id: reportId,
    user_id: user.id,
    selected_text: selectedText,
    comment_text: commentText
  });
  
  if (error) return c.json({ error: 'Erreur' }, 500);
  return c.json({ success: true });
});
export default app;