# CloudScribe AI — Frontend

Frontend Vue 3 et Vite du projet CloudScribe AI. La description du produit, l’état des fonctionnalités et les instructions pour le Worker sont dans le [README du projet](../README.md).

## Développement local

Prérequis : Node.js `22.18+` (ou `24.12+`) et npm.

Avant le démarrage, créez `cloudscribe-frontend/.env.local` à partir du modèle :

```powershell
Copy-Item .env.example .env.local
```

Renseignez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` avec l’URL du projet Supabase et sa clé publishable/anon, disponibles dans les paramètres API du projet. N’utilisez jamais la clé `service_role` dans le frontend. Après modification du fichier, redémarrez Vite.

```powershell
npm install
npm run dev
```

Vérifications disponibles :

```powershell
npm run build
npm run test:unit
```
