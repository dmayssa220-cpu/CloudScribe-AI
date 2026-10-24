import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const app = new Hono();
app.use('*', cors());


const getSupabase = (env) => {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
};


app.get('/api/health', (c) => {
  return c.json({ status: 'ok', message: 'CloudScribe AI Backend is running!' });
});


app.post('/api/generate', async (c) => {
  try {
    const body = await c.req.json();
    const notes = body.notes;
    const tier = body.tier || 'normal';

    if (!notes || notes.trim() === '') {
      return c.json({ error: 'Les notes sont vides.' }, 400);
    }

   
    let systemPrompt = '';
    if (tier === 'premium') {
      systemPrompt = "Tu es un assistant exécutif. Génère un compte rendu détaillé avec : un titre, un résumé exécutif (3 phrases), des points clés (4-6), et un plan d'action avec responsables et échéances si mentionnés. Sois formel et structuré.";
    } else if (tier === 'pro') {
      systemPrompt = "Tu es un assistant professionnel. Génère un compte rendu structuré avec : un titre, un résumé (3 phrases), des points clés (3-5), et des actions à suivre. Sois clair et concis.";
    } else {
      systemPrompt = "Tu es un assistant concis. Génère un compte rendu simple avec : un titre et 3 points clés maximum. Va droit au but.";
    }

    const fullPrompt = `${systemPrompt}\n\nVoici les notes brutes à transformer :\n"""\n${notes}\n"""\n\nRéponds uniquement avec le compte rendu formaté, sans aucune introduction.`;

    
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': c.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }]
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text();
      console.error('Erreur Gemini:', errorData);
      return c.json({ error: 'Erreur lors de l\'appel à l\'IA.' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return c.json({ error: 'L\'IA n\'a pas pu générer de réponse.' }, 500);
    }

  
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('reports')
      .insert({
        raw_notes: notes,
        generated_text: generatedText,
        tier: tier
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur Supabase insert:', error);
     
      return c.json({
        success: true,
        tier: tier,
        result: generatedText,
        warning: 'Le résultat n\'a pas pu être sauvegardé.'
      });
    }

    return c.json({
      success: true,
      tier: tier,
      result: generatedText,
      id: data.id
    });

  } catch (error) {
    console.error('Erreur interne:', error);
    return c.json({ error: 'Erreur interne du serveur.' }, 500);
  }
});


app.get('/api/history', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('reports')
      .select('id, created_at, tier, generated_text')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Erreur Supabase select:', error);
      return c.json({ error: 'Impossible de récupérer l\'historique.' }, 500);
    }

    return c.json({ history: data });
  } catch (error) {
    console.error('Erreur interne:', error);
    return c.json({ error: 'Erreur interne du serveur.' }, 500);
  }
});
app.post('/api/create-checkout-session', async (c) => {
  try {

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(), 
    });

  
    const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: 'price_1UUAkP2MEXC8IhrOuDRMlJia',
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing`,
    });

    return c.json({ url: session.url });
  } catch (error) {
    console.error('Erreur Stripe Checkout:', error);
    return c.json({ error: 'Impossible de créer la session de paiement.' }, 500);
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
   
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Erreur de vérification Webhook:', err.message);
    return c.text('Webhook Error', 400);
  }


  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Paiement réussi pour la session:', session.id);
    
    
  }

  return c.json({ received: true });
});

export default app;