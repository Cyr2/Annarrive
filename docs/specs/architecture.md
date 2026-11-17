# Annarrivé : architecture

## Vue d'ensemble

Un monorepo TypeScript (pnpm), plus un petit service Python dédié à Garmin. Le tout tourne sur le serveur Coolify de Darius.

```
apps/
  web/             PWA React (ce qu'Anna installe sur son iPhone)
  server/          API Hono, base SQLite, tâches planifiées, Reggie, notifications
  garmin-bridge/   Service Python interne : lecture Garmin et envoi des séances
packages/
  coach/           L'algo : fonctions pures, sans E/S (spec : docs/specs/algo.md)
  protocol/        Schémas zod partagés entre web et server
e2e/               Tests Playwright des parcours principaux
```

Pourquoi ce découpage :
- **TypeScript partout sauf Garmin.** Mêmes types et mêmes schémas zod du serveur à l'écran, une seule chaîne d'outils, et la stack déjà éprouvée sur annamour (performances, PWA, glisse, déploiement Coolify).
- **Python pour Garmin seulement.** La lib la mieux maintenue pour Garmin Connect est `python-garminconnect` (base de `garmin_mcp`). Le service reste minuscule : quelques routes, rien d'autre.
- **L'algo isolé** dans `packages/coach` pour être testé à fond sans serveur ni réseau.

## Composants

### apps/web

- Vite, React 19, Tailwind 4, `vite-plugin-pwa` (mise à jour au choix de l'app, jamais au milieu d'une action).
- glisse pour les contrôles Liquid Glass, utilisé uniquement à travers `apps/web/src/ui/`.
- Motion pour les ressorts, Vaul pour les feuilles, Sonner pour le bandeau Annuler, dnd-kit pour le glisser-déposer.
- zustand (un store par domaine), wouter pour les routes, zod sur toute donnée entrante.
- Polices locales (fontsource), icônes lucide.
- Couches : `ui/` (présentation pure) → `features/<écran>/` → `api/` (réseau).

### apps/server

- Hono sur Node, base `node:sqlite` dans un volume Coolify (`/app/data`).
- Couches : routes (validation zod) → services (règles, appellent `packages/coach`) → stockage. Une route ne touche jamais la base.
- Sert aussi la PWA construite : une seule image Docker pour web et serveur.
- **Tâches planifiées** (dans le processus, pas de service en plus) :

| Tâche | Fréquence | Rôle |
|---|---|---|
| Emploi du temps | Toutes les 20 min de 6 h à 23 h, toutes les 2 h la nuit, et à la demande (Actualiser) | Télécharge l'ICS, compare avec la version stockée, applique les changements, déclenche une replanification si une course est touchée |
| Garmin, activités | Toutes les 15 min de 6 h à 23 h | Récupère les nouvelles activités, rattache chaque course à sa séance prévue |
| Garmin, récupération | Au réveil (dès que le sommeil de la nuit est disponible, au plus tard 10 h) | Sommeil, FC de repos, Body Battery, stress |
| Décision du matin | Juste après la récupération | Applique la règle d'allègement du jour, fige la séance, envoie la montre si besoin |
| Semaine suivante | Dimanche 18 h | Construit la semaine, l'envoie sur la montre, notifie « Ta semaine est prête » |
| Sauvegarde | Chaque nuit à 3 h 30 | Copie cohérente de la base dans `/app/data/backups` (`VACUUM INTO`), 30 jours gardés. Les sauvegardes de volume Coolify vers un stockage externe protègent si le serveur disparaît |
| Montre | Après chaque changement | Envoie ou met à jour la séance dans le calendrier Garmin, avec nouvel essai en cas d'échec |

- **Notifications** : Web Push (clés VAPID en variables d'environnement). iOS 26 les accepte pour une PWA installée sur l'écran d'accueil. L'abonnement est revérifié à chaque ouverture de l'app.
- **Connexion** : une seule utilisatrice. Darius génère un lien de connexion à usage unique (commande sur le serveur), qui pose une session longue dans un cookie httpOnly. Face ID (passkey) en option ensuite.

### apps/garmin-bridge

- Python, géré avec `uv`. Deux accès à Garmin : la Personal API officielle (lecture seule, clé `GARMIN_API_KEY`) et `python-garminconnect` (connexion non officielle).
- Joignable seulement par le serveur, sur le réseau interne Docker, protégé par un secret partagé.
- Routes : activités récentes, détail d'une activité (dont ressenti et RPE si présents), sommeil, FC de repos, stress, Body Battery, VO2max, création et programmation d'une séance structurée, suppression d'une séance programmée.
- Jetons de session Garmin stockés dans le volume, valables environ 6 mois. La première connexion peut demander un code de double authentification.
- **Ce qui est lu où** (doc : [Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-api/), [Swagger](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/), [client Python de Garmin](https://github.com/garmin/connect-personal-api-python)) :

| Donnée | API officielle (`https://personal.connectapi.garmin.com`) | Secours non officiel |
|---|---|---|
| Activités récentes, ressenti, RPE | `/activitylist-service/activities/search/activities` | `get_activities`, valeur par valeur, appariée par id |
| FC de repos, stress moyen, Body Battery (réveil, max) | `/usersummary-service/usersummary/daily` | `get_user_summary` |
| Sommeil (durée, score) | `/sleep-service/sleep/dailySleep` | `get_sleep_data` |
| VO2max | `/metrics-service/metrics/maxmet/daily/{j}/{j}` (absent du Swagger, appelé par le client de Garmin) | `get_max_metrics` |
| Tours d'une activité | aucun endpoint | `get_activity_splits` uniquement |
| Créer, programmer, supprimer une séance | impossible (API en lecture seule) | toujours non officiel |

- **Règles** : la clé est échangée contre un jeton de 24 h (`POST /personalapitoken-service/personal-api/personal-api-key/token`, en-tête `Authorization: ApiKey …`), puis chaque lecture envoie `Authorization: Bearer …`. Une valeur absente côté officiel est complétée par la connexion non officielle, ouverte seulement dans ce cas. Si ce complément échoue, le bridge rend les données officielles partielles. 401 ou 403 : avertissement dans les logs, sans la clé, et lecture non officielle (clé refusée : pause de 10 min avant de la réessayer). 429 : l'API officielle n'est plus appelée pendant la durée de `Retry-After` (5 min sans en-tête), la lecture passe par le secours. Garmin ne publie aucune limite de débit.
- **À vérifier avec la vraie clé** : ce que la vivoactive 4 renvoie réellement (sommeil, Body Battery, VO2max), la forme exacte de la réponse VO2max et la clé `overall` des scores de sommeil.

### Reggie

- Construit avec le Claude Agent SDK TypeScript (`@anthropic-ai/claude-agent-sdk`) dans `apps/server`. Le SDK embarque son binaire, pas d'installation à part.
- **Authentification, une variable au choix** :
  - `CLAUDE_CODE_OAUTH_TOKEN` : l'abonnement Claude de Darius (jeton créé avec `claude setup-token`, valable un an). Choix de Darius au démarrage.
  - `ANTHROPIC_API_KEY` : une clé API facturée à l'usage. Bascule sans changer de code.
  - Les conditions d'Anthropic (code.claude.com/docs/en/legal-and-compliance) n'autorisent pas à faire passer par un abonnement Pro ou Max les requêtes d'autres personnes. Reggie sert Anna : la clé API est la voie conforme si Darius veut éviter ce risque sur son compte.
- **Options du SDK** : `tools` limité à WebSearch et WebFetch, avec des règles de permission par domaine autorisé, `disallowedTools` sur Bash, Read, Write, Edit par sécurité, `permissionMode: "dontAsk"`, `settingSources: []`, `mcpServers` avec un serveur interne (`createSdkMcpServer`) qui expose les actions de l'app, `allowedTools` limité à ces actions, `maxTurns` bas, `effort` réglé par l'évaluation.
- **Recherche web encadrée** pour les questions de santé et d'entraînement (douleur, maladie, nutrition, matériel) :
  - Ordre fixe : d'abord ce qu'il sait du plan et de `research/`, puis une recherche web seulement si la question le demande.
  - Domaines autorisés uniquement (liste dans le code, modifiable) : sources médicales et sportives reconnues, par exemple ameli.fr, has-sante.fr, nhs.uk, mayoclinic.org, bjsm.bmj.com, pubmed.ncbi.nlm.nih.gov. Au plus 2 recherches par question.
  - Réponse courte avec une source en lien. Jamais de diagnostic : en cas de douleur qui dure ou dépasse 4 sur 10, il oriente vers un professionnel (règle de `docs/specs/algo.md`).
  - Pendant la recherche, l'écran affiche « Je vérifie » pour que l'attente soit comprise.
- Hormis cette recherche encadrée, aucun outil générique (pas de fichiers, pas de terminal). Ses seuls outils sont les actions de l'app : lire le plan et la semaine, lire les données récentes, proposer des créneaux, déplacer, changer, pas dispo, modifier un réglage. Chaque action passe par `packages/coach`, qui refuse tout ce qui casse une règle.
- Répond en texte court plus des widgets (boutons de réponse, curseur, créneaux, aperçu de séance, carte de changement), décrits dans `docs/interactions.md`.
- Modèle : choisi sur des faits. Un jeu de 20 scénarios réels (douleur, malade, déplacer, pourquoi cette allure, demande hors règles) est passé sur Sonnet 5.5 (`sonnet`) et Opus 5.5 (`opus`). On garde Sonnet 5.5 s'il fait aussi bien (plus rapide en conversation), sinon Opus 5.5. Vérifier l'identifiant exact du modèle dans la doc avant de le figer.

## Données

Tables principales (SQLite) : `profile` (réglages de l'onboarding), `program` (objectif, phases), `planned_session`, `calendar_event` (cours importés, muscu, révisions, indispos), `activity` (courses Garmin), `daily_signal` (sommeil, FC repos, Body Battery, stress), `fitness_estimate` (VDOT et historique), `change_log` (toute modification, avec son annulation), `chat_message`, `push_subscription`.

Toute modification passe par `change_log` : c'est ce qui rend le bouton Annuler fiable.

## Secrets (variables d'environnement Coolify, `.env` local jamais commité)

`GARMIN_EMAIL`, `GARMIN_PASSWORD`, `GARMIN_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` ou `ANTHROPIC_API_KEY`, `REGGIE_MODEL`, `ICS_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SESSION_SECRET`, `BRIDGE_SECRET`.

## Qualité

| Domaine | Exigence |
|---|---|
| Lighthouse (mobile) | Au moins 95 en performance, accessibilité, bonnes pratiques et SEO, vérifié en CI |
| Premier écran | Un seul fichier JS initial, polices locales, tout le reste chargé à la demande |
| Tests | `packages/coach` : 90 % des lignes et 85 % des branches. `apps/server` : 80 % et 75 %. `apps/garmin-bridge` : tests des routes avec Garmin simulé |
| E2E | Playwright : onboarding, déplacer une séance, pas dispo douleur, glisser-déposer, Annuler |
| Interface | Cibles de 44 px, contraste 4,5:1, focus visible, réduction des animations et de la transparence respectées, passe `break-ui` avant livraison |

## CI (GitHub Actions)

Lint (Biome), types, tests avec seuils de couverture, build, image Docker et test de démarrage, Lighthouse CI avec seuils, tests du bridge Python. Une PR qui échoue ne se fusionne pas.

## Déploiement

Coolify : un service pour l'app (web et serveur), un pour le garmin-bridge, un volume pour `/app/data`. Domaine HTTPS obligatoire (PWA, notifications).

## Plan de construction

Chaque étape est une ou plusieurs PR, avec CI verte.

| Étape | Contenu | Terminé quand |
|---|---|---|
| 0. Socle | Monorepo, Biome, TypeScript strict, Vitest, CI, Dockerfile, `.env.example` | CI verte sur une app vide qui démarre en Docker |
| 1. Algo | `packages/coach` complet selon `docs/specs/algo.md` | Tous les cas de test de la spec passent, couverture atteinte |
| 2. Serveur et données | Schéma SQLite, services, routes, `change_log`, connexion | Tests serveur verts, Annuler fonctionne sur chaque action |
| 3. Emploi du temps | Import ICS, comparaison, replanification | Un cours ajouté sur une course déplace la course dans les tests |
| 4. Garmin | Bridge Python, lecture, envoi des séances | Une séance structurée apparaît sur la Forerunner 265 de test |
| 5. Écrans | Tous les écrans des maquettes, animations de `docs/interactions.md` | Comparés aux maquettes, E2E verts |
| 6. Reggie | Outils, widgets, choix du modèle sur les 20 scénarios | Les 20 scénarios passent, aucune action hors règles |
| 7. Onboarding | Maquette puis écrans | Un profil complet est créé et une première semaine générée |
| 8. Notifications | Web Push, événements | Notification reçue sur iPhone pour chaque événement |
| 9. Passe finale | Performance, accessibilité, `break-ui`, revue de sécurité | Lighthouse au moins 95 partout, revue de sécurité sans point bloquant |
| 10. Mise en ligne | Coolify, secrets, domaine | Anna installe l'app et reçoit sa première semaine |
