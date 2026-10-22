import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();


app.use('*', cors());


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
    
    const geminiRequest = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': c.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: fullPrompt }]
        }]
      })
    };

    let geminiResponse;
    for (let attempt = 0; attempt < 3; attempt++) {
      geminiResponse = await fetch(geminiUrl, geminiRequest);

      if (geminiResponse.ok || geminiResponse.status !== 503 || attempt === 2) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text();
      console.error('Erreur Gemini:', errorData);

      if (geminiResponse.status === 503) {
        return c.json({ error: 'Le service IA est temporairement indisponible. Réessayez.' }, 503);
      }

      return c.json({ error: 'Erreur lors de l\'appel à l\'IA.' }, 502);
    }

    const geminiData = await geminiResponse.json();
    
   
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return c.json({ error: 'L\'IA n\'a pas pu générer de réponse.' }, 500);
    }

    
    return c.json({
      success: true,
      tier: tier,
      result: generatedText
    });

  } catch (error) {
    console.error('Erreur interne:', error);
    return c.json({ error: 'Erreur interne du serveur.' }, 500);
  }
});

export default app;