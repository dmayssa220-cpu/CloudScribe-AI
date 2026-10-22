# CloudScribe AI

CloudScribe AI est un projet de générateur de comptes rendus automatisés. Il vise à aider les équipes et les étudiants à transformer des notes de réunion ou de cours en résumés structurés, sans devoir les rédiger manuellement.

## Objectif

L’application doit permettre à un utilisateur de fournir ses notes, puis de générer un compte rendu contenant notamment :

- un titre ;
- les points clés ;
- les actions à suivre.

Le résultat pourra ensuite être enregistré et consulté dans un historique. L’architecture visée s’appuie sur un frontend web, un backend serverless, une API de modèle de langage et une base de données hébergée.

## État actuel

Le projet est encore en phase de démarrage : les fonctionnalités de génération, d’enregistrement et d’historique ne sont pas encore implémentées.

- Le frontend est une application Vue 3 avec Vite. Les vues et le routeur sont encore des squelettes.
- Le Worker Cloudflare utilise Hono et expose actuellement `GET /api/health`.
- Les intégrations Gemini, Supabase et Stripe restent à réaliser.

## Technologies

- **Frontend :** Vue 3, TypeScript, Vite, Vue Router et Pinia.
- **Backend :** Cloudflare Workers, Wrangler et Hono.
- **IA prévue :** API Gemini.
- **Stockage prévu :** Supabase.
- **Conteneurisation locale :** Docker.

Les offres gratuites et leurs quotas peuvent changer ; vérifiez les conditions des fournisseurs avant le déploiement.

## Structure du projet

```text
cloudescribe/
├── cloudscribe-frontend/   # Application Vue
└── worker/                 # Worker Cloudflare
```

## Prérequis

- Node.js `22.18+` (ou `24.12+`), conformément au `package.json` du frontend ;
- npm ;
- Docker Desktop, si vous lancez le Worker dans un conteneur ;
- un compte et des clés API pour les services externes lorsque leurs intégrations seront mises en place.

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

Depuis le dossier `worker`, créez un fichier `.dev.vars` pour les secrets du développement local. Exemple de noms de variables à configurer lorsque les intégrations correspondantes seront utilisées :

```dotenv
GEMINI_API_KEY=remplacer-par-votre-cle
SUPABASE_URL=remplacer-par-votre-url
SUPABASE_ANON_KEY=remplacer-par-votre-cle
STRIPE_SECRET_KEY=remplacer-par-votre-cle
```

Ne mettez jamais de vraies clés dans le dépôt. Le fichier `.dev.vars` est exclu par les règles Git et Docker.

Construisez l’image, puis démarrez Wrangler depuis la racine du dossier `worker` :

```powershell
cd worker
docker build -t cloudscribe-worker .
docker run -it --rm -p 8787:8787 -v "${PWD}:/workspace" -w /workspace cloudscribe-worker /app/node_modules/.bin/wrangler dev --ip 0.0.0.0
```

Le point de contrôle du Worker est disponible à l’adresse `http://localhost:8787/api/health`. La racine `/` peut répondre `404` : aucune route racine n’est actuellement définie.

## Variables d’environnement

Wrangler charge les valeurs locales depuis `worker/.dev.vars`. Pour un déploiement, configurez les secrets dans Cloudflare plutôt que de copier ce fichier. Le Worker devra d’abord être déployé et les secrets déclarés pour son nom Wrangler.

## Sécurité et Git

Avant tout commit, vérifiez que les fichiers de secrets ne sont pas suivis :

```powershell
git status --short
git check-ignore worker/.dev.vars
```

Si un fichier de secrets a déjà été ajouté à l’index, l’ignorer ne suffit pas : retirez-le de l’index sans supprimer votre copie locale, puis révoquez et remplacez toute clé qui a été publiée.
