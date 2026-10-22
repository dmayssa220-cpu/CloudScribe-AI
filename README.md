# CloudScribe AI

CloudScribe AI est un projet de générateur de comptes rendus automatisés. Il vise à aider les équipes et les étudiants à transformer des notes de réunion ou de cours en résumés structurés, sans devoir les rédiger manuellement.

## Objectif

L’application doit permettre à un utilisateur de fournir ses notes, puis de générer un compte rendu contenant notamment :

- un titre ;
- les points clés ;
- les actions à suivre.

Le résultat pourra ensuite être enregistré et consulté dans un historique. L’architecture visée s’appuie sur un frontend web, un backend serverless, une API de modèle de langage et une base de données hébergée.


## Technologies

- **Frontend :** Vue 3, TypeScript, Vite, Vue Router et Pinia.
- **Backend :** Cloudflare Workers, Wrangler et Hono.
- **IA prévue :** API Gemini.
- **Stockage prévu :** Supabase.
- **Conteneurisation locale :** Docker.

Les offres gratuites et leurs quotas peuvent changer

## Structure du projet

```text
cloudescribe/
├── cloudscribe-frontend/   # Application Vue
└── worker/                 # Worker Cloudflare
```

## Prérequis

- Node.js `22.18+` (ou `24.12+`), conformément au `package.json` du frontend ;
- npm ;
- Docker Desktop

## Lancer le frontend

```powershell
cd cloudscribe-frontend
npm install
npm run dev
```

Vite affiche l’adresse locale à ouvrir dans le navigateur.

Pour vérifier le frontend :

```powershell
npm run build
npm run test:unit
```

## Lancer le Worker avec Docker

Depuis le dossier `worker`, on crée  `.dev.vars` pour les secrets du développement local
```dotenv
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
STRIPE_SECRET_KEY=
```



Construisez l’image, puis démarrez Wrangler depuis la racine du dossier `worker` :

```powershell
cd worker
docker build -t cloudscribe-worker .
docker run -it --rm -p 8787:8787 -v "${PWD}:/workspace" -w /workspace cloudscribe-worker /app/node_modules/.bin/wrangler dev --ip 0.0.0.0
```

Le point de contrôle du Worker est disponible à l’adresse `http://localhost:8787/api/health`.

## Variables d’environnement

Wrangler charge les valeurs locales depuis `worker/.dev.vars`.
