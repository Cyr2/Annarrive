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
| Sauvegarde | Chaque nuit à 3 h 30 | Copie cohérente de la base dans `/app/data/backups` (`VACUUM INTO`), 30 jours gardés. Les sauvegardes de volume Coolify vers un stockage externe protègent si le serveur disparaît. Efface aussi les incidents de plus de 30 jours |
| Montre | Après chaque changement | Envoie ou met à jour la séance dans le calendrier Garmin, avec nouvel essai en cas d'échec |

- **Notifications** : Web Push (clés VAPID en variables d'environnement). iOS 26 les accepte pour une PWA installée sur l'écran d'accueil. L'abonnement est revérifié à chaque ouverture de l'app.
- **Connexion** : quelques comptes fixes (Anna, Darius, l'instance de test), créés en ligne de commande, sans inscription publique. Toute connexion pose une session de 180 jours dans un cookie httpOnly `__Host-annarrive_session`.
  - Premier accès sur un appareil : identifiant et mot de passe (hash scrypt ; par adresse IP, 5 essais ratés bloquent les mots de passe 15 min et au plus 10 essais par minute, derrière Traefik l'adresse est la dernière de X-Forwarded-For, remplacée par `CF-Connecting-IP` seulement si cette dernière appartient aux plages publiées de Cloudflare, copiées dans `app.ts` et à rafraîchir depuis https://www.cloudflare.com/ips si Cloudflare en annonce de nouvelles). Le lien de connexion et Face ID sont limités à 30 essais par minute et par adresse, et le formulaire du lien à 4 Ko. L'écran « Tu es connectée » propose ensuite « Utiliser Face ID », qui enregistre une clé d'accès (passkey WebAuthn, authentificateur de l'appareil, clé découvrable, vérification de l'utilisateur exigée).
  - Ensuite : un seul bouton « Se connecter avec Face ID », sans rien taper ; là où le navigateur le permet, la clé est aussi proposée dans les suggestions du champ Identifiant. Le site des clés (rpID) est l'hôte de `PUBLIC_URL`. Défis gardés 5 min côté serveur, à usage unique ; compteur de signature vérifié par `@simplewebauthn/server`.
  - Secours : le mot de passe marche toujours, et le lien à usage unique reste pour l'admin.
  - Commandes (dans le conteneur, depuis `/app/apps/server` ; en local, `pnpm --filter @annarrive/server <users|login-link> …`) :
    - `node --import tsx src/cli/users.ts password <nom>` : crée le compte s'il manque, lui donne un nouveau mot de passe, l'affiche une fois et ferme les sessions du compte.
    - `node --import tsx src/cli/users.ts list` : comptes et clés d'accès (id, ajout, dernier usage).
    - `node --import tsx src/cli/users.ts revoke <id>` : supprime une clé d'accès (téléphone perdu) et ferme les sessions du compte.
    - `node --import tsx src/cli/login-link.ts [nom]` : lien de connexion valable 15 min. Avec un nom, il mène ensuite à l'offre Face ID.
- **Journal des incidents** : Darius ne teste pas sur l'iPhone d'Anna, alors l'app note elle-même ce qui casse, sur son propre serveur, sans service tiers.
  - Côté app (`apps/web/src/api/journal.ts`, branché dans `main.tsx`, `App.tsx` et `api/http.ts`) : les 50 derniers gestes (écran, feuille ouverte ou fermée, bouton touché par son nom accessible ou `data-crumb`, appel au serveur avec méthode, chemin sans paramètres, statut et durée, app visible ou cachée, réseau, nouvelle version). Un incident part sur erreur JavaScript, promesse rejetée, erreur attrapée par React (avec la pile des composants), fichier d'écran qui ne charge pas, appel en 5xx ou sans réponse en ligne, réponse illisible pour les schémas, appel de plus de 3 s, et « Signaler un souci » (Programme). Chaque incident porte type, message, pile, gestes, route, appareil (navigateur, taille d'écran, PWA installée ou non, iOS ou Android, fichier d'entrée `index-<hash>.js` pour retrouver le build, fuseau, réseau). Envoi groupé par 3 avec `fetch keepalive`, file gardée dans `localStorage` hors ligne et renvoyée au retour du réseau, 20 incidents au plus par chargement, un même message une seule fois.
  - Jamais envoyé : ce qu'elle tape (Reggie, champs, notes), cookies, jetons, paramètres d'URL, adresses e-mail, longues chaînes opaques (`redact` de `packages/protocol`, appliqué par l'app puis à nouveau par le serveur). Seule exception : la phrase qu'elle écrit elle-même dans « Signaler un souci ».
  - Côté serveur : `POST /api/incidents` (session, même origine, zod avec tailles plafonnées, 30 requêtes par 10 min et par session), table `incident`. Les erreurs inattendues des routes (`app.onError`) y vont aussi : route, nom, message et pile, jamais le corps de la requête. Gardés 30 jours.
  - Lecture (dans le conteneur, depuis `/app/apps/server` ; en local, `pnpm --filter @annarrive/server incidents …`) :
    - `node --import tsx src/cli/incidents.ts` : les incidents des 7 derniers jours, du plus récent au plus ancien, chacun avec sa chronologie de gestes à l'heure de Paris.
    - `--since 2d` (aussi `12h`, `30m`), `--id <id>` pour un seul, `--json` pour le coller à un agent.
    - Pour une pile illisible : reconstruire le commit déployé avec `build.sourcemap: "hidden"`, vérifier que le fichier d'entrée a le même nom que `version`, puis lire la ligne dans la carte.
- **Diagnostic du niveau** : `node --import tsx src/cli/level.ts [nom]` (dans le conteneur, depuis `/app/apps/server` ; en local, `pnpm --filter @annarrive/server level`). Lecture seule : imprime comment F10 lit son niveau aujourd'hui, à coller tel quel. Courses lues sur 12 semaines (et combien ont leurs tours), FC max observée, VO2max Garmin (30 j), chrono déclaré et son VDOT, les 8 meilleurs efforts (date, distance, temps, allure, lecture `course/max`, `seuil (FC)` ou `plancher`, VDOT), le VDOT retenu avec sa source et ses allures E, M, T, I, R, puis le niveau en service. Les tours Garmin sont lus une fois par course à la synchro (`activityLaps`) ; les courses d'avant ce changement les reçoivent à la prochaine synchro tant qu'elles figurent dans les 20 dernières.
- **Vérifier une sauvegarde** : `node --import tsx src/cli/restore-check.ts <fichier>` (dans le conteneur, depuis `/app/apps/server`, par exemple `/app/data/backups/annarrive-2026-11-19.db`). Ouvre la copie en lecture seule (jamais la base vivante, rien n'est migré ni écrit), lance `PRAGMA integrity_check`, imprime la version du schéma (comparée à celle de l'application), le nombre de lignes par table et la date de la dernière modification du plan. Code de sortie 0 si la sauvegarde est utilisable, 1 sinon (intégrité différente de « ok », schéma plus récent que l'application, fichier illisible).
- **Restaurer une sauvegarde** (la base est cassée ou un mauvais état doit être défait ; les sauvegardes de nuit sont dans le volume, elles ne protègent pas d'un serveur perdu : pour cela, les sauvegardes de volume Coolify) :
  1. Coolify, projet Annarrivé, l'application, onglet « Terminal » (l'app tourne encore) : `ls /app/data/backups`, puis `cd /app/apps/server && node --import tsx src/cli/restore-check.ts /app/data/backups/annarrive-AAAA-MM-JJ.db`. Choisir la copie la plus récente qui dit « utilisable » et dont la dernière modification est celle attendue.
  2. Coolify, l'application : bouton « Stop ». Plus rien n'écrit dans la base.
  3. Sur le serveur (SSH), repérer le volume : Coolify, l'application, « Persistent Storage », ligne montée sur `/app/data` (son nom commence par l'identifiant de l'application ; `docker volume ls` le liste). Puis, en remplaçant `VOLUME` et la date :

         docker run --rm -v VOLUME:/data alpine sh -c 'cp /data/annarrive.db /data/annarrive.db.avant-restauration && rm -f /data/annarrive.db-wal /data/annarrive.db-shm && cp /data/backups/annarrive-AAAA-MM-JJ.db /data/annarrive.db'

     Les fichiers `-wal` et `-shm` sont supprimés : laissés à côté de la copie restaurée, SQLite rejouerait les écritures de l'ancienne base dessus. L'ancienne base reste dans `annarrive.db.avant-restauration`.
  4. Coolify, l'application : bouton « Start » (ou « Deploy »). Au démarrage, une copie dont le schéma est plus ancien est migrée toute seule.
  5. Vérifier : l'app s'ouvre et se connecte, `node --import tsx src/cli/level.ts` répond, le plan de la semaine est celui attendu. Une fois sûr, supprimer `annarrive.db.avant-restauration`.
- **Test montre** : `node --import tsx src/cli/watch-test.ts <commande>` (dans le conteneur de test, depuis `/app/apps/server`). Parle au bridge du compte Garmin de Darius (`DARIUS_BRIDGE_URL`, `DARIUS_BRIDGE_SECRET`), jamais à celui d'Anna (`BRIDGE_URL` n'est pas lue). Chaque séance créée s'appelle « Annarrivé test · … » : c'est la seule chose que l'outil liste ou supprime, les plans et séances Garmin Coach ne sont jamais touchés.
  - `send --date AAAA-MM-JJ [--type I|T|E|L] [--vdot 40]` : construit une séance du vrai catalogue (échauffement, groupe « Répéter » pour I et E, allure cible unique), la crée et la programme par le chemin du serveur (`toWorkoutRequest`), imprime l'id et ce qui est parti (étapes, répétitions, allure cible en m'ss /km et zone de vitesse en m/s).
  - `delete <id>` : supprime la séance et sa programmation, seulement si elle porte le préfixe de l'outil.
  - `list` : les séances créées par l'outil.
  - `activities [--days 7]` : courses récentes avec leurs tours (distance, temps, allure, FC) et la lecture F18 du coach. Lecture seule. La FC max vient de ces courses seules : elle peut être plus basse que celle de l'app (12 mois).

### apps/garmin-bridge

- Python, géré avec `uv`. Deux accès à Garmin : la Personal API officielle (lecture seule, clé `GARMIN_API_KEY`) et `python-garminconnect` (connexion non officielle).
- Joignable seulement par le serveur, sur le réseau interne Docker, protégé par un secret partagé.
- Routes : activités récentes, détail d'une activité (dont ressenti et RPE si présents), sommeil, FC de repos, stress, Body Battery, VO2max, création et programmation d'une séance structurée, suppression d'une séance programmée, liste des séances par préfixe de nom (lecture seule, pour l'outil de test montre).
- **Instance de test** : `GARMIN_WRITE=off` coupe toute écriture vers Garmin (création, mise à jour, suppression de séance) dans le client du bridge du serveur (`apps/server/src/garmin/bridge-client.ts`), qui refuse toute requête autre qu'une lecture avant qu'elle parte. Les lectures continuent (historique, VO2max, sommeil). Chaque séance affiche alors « Montre pas reliée », comme sur une instance sans bridge. Absente ou `on` : envoi actif.
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
- Modèle : choisi sur des faits. Un jeu de 20 scénarios réels (douleur, malade, déplacer, pourquoi cette allure, demande hors règles) est passé sur Sonnet 5.5 (`sonnet`) et Opus 5.5 (`opus`). On garde Sonnet 5.5 s'il fait aussi bien (plus rapide en conversation), sinon Opus 5.5. Vérifier l'identifiant exact du modèle dans la doc avant de le figer. Le jeu compte 31 scénarios (`pnpm --filter @annarrive/server eval:reggie`, 20 par défaut) ; `eval:latency` chronomètre 5 messages typiques.
- Latence : chaque réponse laisse un processus du SDK déjà démarré pour la suivante (`startup()`), ce qui retire environ 0,4 s au message suivant ; il garde 250 Mo environ en mémoire tant qu'il attend.

## Données

Tables principales (SQLite) : `profile` (réglages de l'onboarding), `program` (objectif, phases), `planned_session`, `calendar_event` (cours importés, muscu, révisions, indispos), `activity` (courses Garmin), `daily_signal` (sommeil, FC repos, Body Battery, stress), `fitness_estimate` (VDOT et historique), `change_log` (toute modification, avec son annulation), `chat_message`, `push_subscription`, `incident` (journal des incidents, 30 jours).

Toute modification passe par `change_log` : c'est ce qui rend le bouton Annuler fiable.

## Secrets (variables d'environnement Coolify, `.env` local jamais commité)

`GARMIN_EMAIL`, `GARMIN_PASSWORD`, `GARMIN_API_KEY`, `GARMIN_WRITE` (pas un secret : réglage d'instance, voir plus haut), `CLAUDE_CODE_OAUTH_TOKEN` ou `ANTHROPIC_API_KEY`, `REGGIE_MODEL`, `ICS_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SESSION_SECRET`, `BRIDGE_SECRET`.

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

À vérifier par le propriétaire du serveur :

- [ ] Les sauvegardes (`/app/data/backups`) contiennent en clair la santé d'Anna, ses messages à Reggie et le lien de son emploi du temps. Elles restent sur le volume privé du serveur, jamais copiées ailleurs à la main.
- [ ] Si les sauvegardes de volume Coolify vers un stockage externe sont activées, ce stockage est un bucket S3 privé (aucun accès public) et chiffré.
- [ ] `BRIDGE_SECRET` est long et aléatoire : le bridge partage le réseau Docker `coolify` avec d'autres services.
- [ ] Les plages d'adresses de Cloudflare copiées dans `apps/server/src/app.ts` sont à jour (https://www.cloudflare.com/ips).

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
