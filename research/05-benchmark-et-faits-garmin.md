# 05 — Benchmark des coachs adaptatifs et faits techniques Garmin / iOS

Recherche du 16/11/2026. Confiance : **É** = élevée (source officielle ou primaire), **M** = moyenne (presse spécialisée, forum avec réponse d'un modérateur Garmin, plusieurs sources concordantes), **F** = faible (source unique, marketing, concurrent). « Non vérifié » = rien de fiable trouvé.

---

## Partie 1 — Benchmark produit

### 1.1 Garmin Coach : plans experts et Run Coach adaptatif

**Ce que c'est**
- Trois générations coexistent ([runningworkout.fr, concurrent, F/M](https://www.runningworkout.fr/garmin-coach-ou-coach-ia?lang=en)) :
  - **Run Coach** : 5K à marathon, distance libre, 6 à 52 semaines ;
  - **plans experts** : Jeff Galloway (course-marche), Greg McMillan, Amy Parkerson-Mitchell (cardio) ; 5K, 10K et semi seulement ;
  - **plans « self-guided »** : statiques, sans adaptation.
- Correction du brief : les sources trouvées citent Galloway, McMillan et Parkerson-Mitchell, jamais Daniels ni Hudson. Rien n'indique que Daniels ou Hudson fassent partie de Garmin Coach (non vérifié) ([shoulditrain, F](https://www.shoulditrain.com/blog/garmin-coach-review)).
- En septembre 2024, l'outil est renommé Garmin Run Coach, et ses plans « s'adaptent selon vos données de performance et de récupération ». La liste des montres compatibles comprend les FR165/255/265/955/965 et les fēnix/epix 7, **sans la vivoactive 4** ([Notebookcheck 20/09/2024, M](https://www.notebookcheck.net/Garmin-announces-new-smart-training-plans-for-smartwatches.890940.0.html)). Une liste plus récente ne la cite pas non plus ([runningworkout.fr, F](https://www.runningworkout.fr/garmin-coach-ou-coach-ia?lang=en)).

**Données d'entrée**
- **Run Coach** : Training Readiness, score de sommeil, charge d'entraînement, Training Status, VO2max ([TechRadar, M](https://www.techradar.com/health-fitness/garmins-run-coach-just-got-a-lot-smarter-heres-how-to-try-it-before-everyone-else) ; [wiki garminrumors via recherche, F](https://wiki.garminrumors.com/Garmin_Coach)).
- **Plans experts** : questionnaire initial (niveau, jours disponibles, jour de la sortie longue), puis « benchmark runs » périodiques qui recalibrent les allures ([shoulditrain, F](https://www.shoulditrain.com/blog/garmin-coach-review)).

**Règles d'adaptation connues**
- Avec une mauvaise nuit et une charge élevée, Run Coach propose une sortie de base ou de récupération. Avec une Training Readiness proche de 100, il propose une séance plus longue ou plus intense ([TechRadar, M](https://www.techradar.com/health-fitness/garmins-run-coach-just-got-a-lot-smarter-heres-how-to-try-it-before-everyone-else)).
- Les seuils exacts ne sont pas publiés. L'algorithme est déterministe (métriques Firstbeat) ; aucun LLM n'est documenté.

**UX**
- Un widget Garmin Coach sur la montre affiche la séance du jour, à lancer en un geste ([manuel vivoactive 4, É](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-A64EC949-00DE-4536-96F6-CA5FA770CCB1.html)).
- Les plans Run Coach adaptatifs **ne permettent pas de déplacer une séance** ; les plans experts le permettent. Source : réponses communautaires, pas de doc officielle ([forum Garmin, M](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-mobile-andriod/396535/garmin-run-coach-plan-unable-to-re-schedule-runs-even-on-web-version-of-garmin-connect) ; [forum 2, M](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/408633/why-can-t-i-reschedule-garmin-coach-workouts)).

**Reproches fréquents**
- La séance change dans la journée parce que la readiness fluctue : une sortie longue devient une sortie de base ([forum FR265, M](https://forums.garmin.com/sports-fitness/running-multisport/f/forerunner-265-series/398290/garmin-coach-changing-workouts-throughout-the-day)).
- Impossible de déplacer une séance ([forums ci-dessus, M](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/408633/why-can-t-i-reschedule-garmin-coach-workouts)).
- Volume initial trop agressif pour les coureurs âgés ou débutants, plans répétitifs vers la 8e semaine, prédictions de course optimistes, jours de repos remplacés par des footings ([shoulditrain, F : l'article vend une app concurrente](https://www.shoulditrain.com/blog/garmin-coach-review)).

**Points forts** : gratuit, intégré à la montre, recalage sur benchmark ([shoulditrain, F](https://www.shoulditrain.com/blog/garmin-coach-review)).

### 1.2 Garmin Daily Suggested Workouts (DSW)

- **Entrées** : Training Status, charge et « load focus » (aérobie basse, aérobie haute, anaérobie), VO2max, temps de récupération, sommeil, historique ; HRV et readiness sur les montres récentes ([Fleet Feet, M](https://www.fleetfeet.com/blog/how-to-use-garmin-daily-suggested-workouts) ; [forum Garmin, M](https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/epix-2/289477/running-today-s-suggestion-always-the-same)).
- **Prérequis** : la montre doit avoir un Training Status et une VO2max ([manuel Garmin FR945, É](https://www8.garmin.com/manuals/webhelp/forerunner945/EN-US/GUID-1F857C7A-31A2-46AF-A639-2C3F5ECC3AF1.html)). La vivoactive 4 n'a pas de Training Status (voir 2.1), elle n'a donc probablement pas de DSW (M, déduction).
- **Logique** : équilibrer les trois catégories de load focus. Le système est entièrement déterministe ([forum Garmin, M](https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/epix-2/289477/running-today-s-suggestion-always-the-same)).
- **Reproches** : pas de périodisation, impossible d'indiquer la course visée, suggestions instables d'un jour à l'autre ([Fleet Feet, M](https://www.fleetfeet.com/blog/how-to-use-garmin-daily-suggested-workouts) ; [the5krunner, M](https://the5krunner.com/garmin-features/training/daily-suggested-workouts/)).

### 1.3 Runna (Strava depuis avril 2025)

- **Rachat** : Strava a racheté Runna en avril 2025 ([DC Rainmaker, M](https://dcrainmaker.com/2025/04/strava-acquires-runna-thoughts-forward.html)).
- **Entrées** : niveau actuel exprimé par un temps de course estimé, expérience, jours disponibles, course et date. **Un seul temps estimé fixe toutes les allures du plan** ([Runna help, É](https://support.runna.com/en/articles/6205998-adjusting-your-estimated-race-time-and-pace-targets) ; [the5krunner 28/09/2026, M](https://the5krunner.com/2026/09/28/is-runna-ai/)).
- **Adaptation**
  - **Pace Insights** analyse les séances de vitesse. Il faut un schéma constant, une seule séance rapide ne suffit pas, et les répétitions aberrantes sont ignorées. L'utilisateur **accepte ou refuse** la proposition, et la structure du plan ne change pas, seules les allures ([Runna help, É](https://support.runna.com/en/articles/14656203-what-are-pace-insights-and-how-do-they-work) ; [the5krunner, M](https://the5krunner.com/2026/09/28/is-runna-ai/)).
  - « Not Feeling 100% » : sur 3 à 14 jours, pause ou allègement, sans effet rétroactif ([Runna help, É](https://support.runna.com/en/articles/12809806-feeling-unwell-how-to-adapt-your-training-plan)).
  - **Skip ou déplacer** : sauter une séance est une décision explicite qui la retire du plan ; déplacer la conserve, mais seulement dans la semaine en cours ou une semaine future ([Runna help, É](https://support.runna.com/en/articles/15012850-how-and-when-to-skip-a-run-managing-missed-sessions-in-your-training-plan)).
  - « Adapt for Heat » corrige les allures selon la météo prévue ([the5krunner, M](https://the5krunner.com/2026/07/29/runna-launches-adapt-for-heat-to-adjust-pace-for-weather/)).
- **Part IA** : « Runna dit que ses plans ne sont pas créés par IA » ; ils sont conçus par des coachs puis adaptés par un algorithme non publié. « Runna AI » est une couche séparée qui explique les ajustements ([the5krunner, M](https://the5krunner.com/2026/09/28/is-runna-ai/)).
- **Montre** : Runna envoie les séances vers le calendrier Garmin Connect, qui les transmet à la montre : 2 semaines glissantes en premium, séances de course uniquement. Les séances faites ou sautées sont retirées du calendrier ([Runna help, É](https://support.runna.com/en/articles/6169639-using-your-garmin-watch-with-runna)). « Toute montre Garmin compatible Garmin Coach fait tourner les plans Runna » ([the5krunner, M](https://the5krunner.com/2026/09/28/is-runna-ai/)).
- **Reproches**
  - **Blessures** : fractures de fatigue, périostites, tendinopathies d'Achille. Le WSJ rapporte des kinés voyant plusieurs cas par semaine, avec des allures « limites trop rapides » et des footings qui restent durs ([the5krunner 21/02/2026, M](https://the5krunner.com/2026/02/21/runna-ai-marathon-training-injury/) ; [TechRadar, M](https://www.techradar.com/health-fitness/are-ai-training-apps-like-runna-putting-you-at-risk-of-injury-i-asked-a-real-life-running-coach)). Aucune étude comparative ne le prouve.
  - **Réponse de Runna** : réglage d'intensité du plan, puis partenariat avec l'université de Loughborough ([the5krunner, M](https://the5krunner.com/2026/08/25/runna-loughborough-university-partnership/)).

### 1.4 TrainAsONE

- **Entrées** : historique des montres et apps synchronisées, objectif, ressenti optionnel après chaque séance, qui sert à filtrer le bruit GPS et à estimer la fatigue. Seules les courses construisent le plan ([site TrainAsONE, F marketing](https://taow.trainasone.com/how-it-works) ; [FAQ, F](https://taow.trainasone.com/faqs/2025/how-do-i-use-trainasone)).
- **Adaptation** : le plan futur est recalculé après chaque course. « Les séances manquées sont des données, pas des dettes à rembourser » : elles ne sont jamais rattrapées. Protection contre les pics de charge, intensité réduite en cas de signes de surmenage ([F](https://taow.trainasone.com/how-it-works)).
- **Part IA** : machine learning sur une base d'utilisateurs, avec « human-in-the-loop ». Ce n'est pas un LLM et les règles ne sont pas publiées ([F](https://taow.trainasone.com/features/ai-training-plans)).
- **Avis utilisateurs** : non vérifié, faute de source indépendante consultée.

### 1.5 COROS (Training Hub, EvoLab)

- **Modèle de charge** : Base Fitness (charge sur 42 jours), Load Impact (7 jours), Intensity Trend (rapport des deux) et statuts allant d'« Excessive » à « Decreasing ». Le Recovery Timer combine Base Fitness, charge et énergie restante ([support COROS, É](https://support.coros.com/hc/en-us/articles/4412789816724) ; [COROS, É](https://coros.com/stories/coros-metrics/c/your-coros-recovery-metrics-explained)).
- **Planification prédictive** : le Training Hub montre l'effet des séances planifiées sur ces métriques à 12 semaines. C'est une bonne UX pour expliquer la charge ([DC Rainmaker 2021, M](https://dcrainmaker.com/2021/05/revamped-training-explainer.html)).
- **Plans** : le plan marathon personnalisé synchronise automatiquement les 2 semaines suivantes sur la montre ([support COROS, É](https://support.coros.com/hc/en-us/articles/20959039543828-Personalized-Marathon-Plans)). Depuis janvier 2026, un plan peut démarrer en cours de route et s'ajuste au temps restant ([COROS, É](https://coros.com/ca/stories/coros-metrics/c/january-2026)). Les séances sont mises à l'échelle via les zones EvoLab.
- **Coach IA** : aucun coach IA COROS officiel qui réécrit le plan n'a été trouvé (non vérifié). Un « COROS MCP Server » en bêta (mai 2026) reste non vérifié ([Tredict, F](https://www.tredict.com/blog/coros_chatgpt_claude_ai_training/)).

### 1.6 Coopah

- **Fonctionnement** : plans 5K à ultra, jours d'entraînement choisis, séances déplaçables. Les allures s'ajustent selon les données saisies. Rapport hebdomadaire du coach et accès à des coachs humains combinés à des réponses IA ([TechRadar, M](https://techradar.com/health-fitness/coopah-app-review-an-ideal-reasonably-priced-running-companion-app) ; [the5krunner 28/10/2026, M](https://the5krunner.com/2026/10/28/coopah-vs-runna/)).
- **Reproches** : app « confuse », aucun contact humain effectif, une seule anecdote ([the5krunner, F](https://the5krunner.com/2026/10/28/coopah-vs-runna/)) ; pas de guidage pendant la course ([TechRadar, M](https://techradar.com/health-fitness/coopah-app-review-an-ideal-reasonably-priced-running-companion-app)).
- **Règles d'adaptation précises** : non vérifiées.

### 1.7 Athletica

- **Modèle annoncé** : modèle de charge Banister, HRV nocturne comparée à une ligne de base (alerte et feu tricolore de readiness), RPE et notes libres. Les séances manquées sont prises en compte, avec des alternatives plus légères, similaires ou plus dures. Intégrations Garmin et intervals.icu ([Athletica, F marketing](https://athletica.ai/self-coached-athlete-guide/) ; [FAQ, F](https://athletica.ai/frequently-asked-questions)).
- **Évaluation indépendante** : aucune trouvée ; une comparaison faite par un concurrent ([SensAI, F](https://www.sensai.fit/blog/best-ai-marathon-training-apps-2026)).
- **Garmin Connect+ « Active Intelligence »** : abonnement lancé en mars 2025 qui produit des résumés IA. Les premiers retours le jugent « simpliste », et le modèle sous-jacent n'est pas publié ([Android Central, M](https://www.androidcentral.com/wearables/new-garmin-connect-plus-subscription-adds-active-intelligence-beta-enhanced-smarts) ; [Marathon Handbook, M](https://marathonhandbook.com/garmin-connect-the-future-of-wearable-data-or-a-paywall-too-far/)).

### 1.8 Coachs LLM : ce que disent les études

- **Düking et al. 2024**, *J Sports Sci Med* 23:56-72 ([abstract, É](https://jssm.org/jssm-23-56.xml-abst)). Trois plans ChatGPT de 6 semaines, générés avec de plus en plus d'informations, ont été notés par des experts sur 22 critères (échelle 1 à 5).
  - Plan 1 : médiane sous 3 sur 19 critères.
  - Plan 3, le plus renseigné : médiane au-dessus de 3 sur 13 critères.
  - Les auteurs déconseillent d'utiliser ces plans sans retour d'un coach.
  - Une synthèse ajoute qu'il manque le dépistage, le suivi et l'ajustement, et que ChatGPT ne pose pas de questions de suivi ([Marathon Handbook, M](https://marathonhandbook.com/expert-coaches-examine-chatgpts-ability-to-create-running-training-plans/)).
- **arXiv 2509.26593 (2025)**, un seul sujet sur 2 mois, préparation d'un semi avec ChatGPT ([arXiv, M : cas unique](https://arxiv.org/html/2509.26593v1)). Garde-fous « émulés dans la conversation plutôt qu'appliqués systématiquement ». Pas de plafond explicite de progression de charge. Profil athlète non persistant, à resaisir. L'outil ne détecte pas la baisse de motivation si elle n'est pas dite. Les auteurs recommandent une logique de sécurité explicite et auditable, plus un modèle athlète persistant, avec le LLM limité au dialogue et à l'explication.
- **Comparatif multi-LLM** (Claude 3.5, GPT-4, Gemini 2.0, DeepSeek R1) sur des plans marathon de 6 mois : il existe, mais les résultats n'ont pas été lus (non vérifié) ([SportRxiv, F](https://sportrxiv.org/index.php/server/preprint/download/512/1104/1027)).

### 1.9 Synthèse : déterministe vs IA chez les acteurs

| Produit | Moteur d'adaptation | Rôle de l'IA générative | Déplacement de séance |
|---|---|---|---|
| Garmin Run Coach | Règles sur readiness, sommeil et charge (Firstbeat) | Aucun documenté | Non (adaptatif) |
| Garmin plans experts | Plan d'auteur, recalage par benchmark | Aucun | Oui |
| Garmin DSW | Équilibre du load focus | Aucun | Sans objet |
| Runna | Plans écrits par des coachs, algorithme d'allures avec accord de l'utilisateur | « Runna AI » explique | Oui, semaine en cours ou future |
| TrainAsONE | ML recalculé à chaque course | Aucun LLM documenté | Pas de rattrapage |
| COROS | Modèle de charge et plans à l'échelle des zones | Aucun officiel trouvé | Non vérifié |
| Athletica | Banister, HRV et RPE | Couche d'explication | Non vérifié |

Tous les acteurs sérieux gardent la prescription dans un moteur déterministe ou statistique ; l'IA générative, quand elle existe, explique.

---

## Partie 2 — Faits techniques

### 2.1 vivoactive 4 : capacités

| Fonction | Statut | Confiance et source |
|---|---|---|
| Workouts structurés envoyés depuis Garmin Connect | **Oui**, étapes multiples, chacune avec un objectif (distance, temps, répétitions) | É, [manuel VA4 « Workouts »](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-D5F4F37C-EE1C-49E6-B743-FF5D40B903BE.html) |
| Affichage d'une cible pendant l'étape | **Oui** : la montre affiche l'étape, la note, la cible (optionnelle) et les données | É, [manuel VA4 « Starting a Workout »](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-E86E82B5-6FF6-47C9-B46D-D3F6333697E4.html) |
| Cibles d'allure et de FC dans un workout | Probable, mais le manuel ne détaille pas les types de cible. Le manuel VA4 documente des alertes de plage d'allure et de FC hors workout | M, [alertes VA4](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-46450946-24A7-45C1-8CCE-569E379D9600.html). **À tester sur la montre** |
| Calendrier d'entraînement (séances programmées) | **Oui** : menu Training Calendar, séances triées par date | É, [manuel VA4](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-D9E73E73-4F56-48D0-BF4D-6F179CF6298F.html) ; [DCR](https://www.dcrainmaker.com/2020/02/garmin-vivoactive-4-gps-smartwatch-in-depth-review.html) |
| Plans Garmin Coach experts | Oui, selon une modératrice Garmin, si le type de plan est supporté | M, [forum Garmin](https://forums.garmin.com/sports-fitness/healthandwellness/f/vivoactive-4-series/396855/garmin-coach-not-capatible-with-vivoactive-4s) ; widget Coach cité dans le [manuel](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-GB/GUID-71798B16-A9A9-4D0F-BF64-50DD65AFC0D5.html) |
| Run Coach adaptatif (2024+) | **Non**, absent des listes de compatibilité | M, [Notebookcheck](https://www.notebookcheck.net/Garmin-announces-new-smart-training-plans-for-smartwatches.890940.0.html) |
| Évaluation après activité (ressenti et RPE) | **Probablement non** : pas de rubrique « Self Evaluation » dans le manuel VA4, alors qu'elle existe sur vivoactive 5 et fēnix 6 | M, [table des matières VA4](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/suitehelp_topic_list.html) ; [manuel VA5](https://www8.garmin.com/manuals-apac/webhelp/vivoactive5/EN-SG/GUID-70DBF334-51AA-445E-8F6A-D82383DB5A8D-7015.html). Non vérifié sur l'appareil |
| VO2max | **Oui** : après une marche ou course extérieure de 15 min minimum avec FC | É, [manuel VA4](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-544723AB-D323-480F-8A07-911E89C043A4.html) |
| Body Battery, stress | **Oui** | É, [manuel VA4](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-87E1392B-2C55-40B7-A1FF-3AB9252DA0A0.html) |
| Sommeil | **Oui**, suivi automatique et détail dans Garmin Connect. Score de sommeil : non vérifié | É, [manuel VA4](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-70D41BFB-2BB2-4933-BF95-47FF63140112.html) ; [DCR](https://www.dcrainmaker.com/2020/02/garmin-vivoactive-4-gps-smartwatch-in-depth-review.html) |
| Pulse Ox | **Oui** | É, [manuel VA4](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-2EE28BB8-91F1-4BCE-AE13-6CAEF50AD5C4.html) |
| HRV status (nocturne) | **Non** : la HRV ne sert qu'au calcul du stress | M, rubrique « HRV and Stress Level » seule dans le [manuel](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/GUID-9282196F-D969-404D-B678-F48A13D8D0CB.html) ; [fiche specs, F](https://gadgetsandwearables.com/technical-specs/garmin-vivoactive-4s/) |
| Training Readiness | **Non** | M, absent du manuel ; réservé aux montres récentes ([the5krunner](https://the5krunner.com/garmin-features/training/daily-suggested-workouts/)) |
| Training Load, temps de récupération | **Non** : « pas suivis sur la série vivoactive/Venu » | M+, [DCR](https://www.dcrainmaker.com/2020/02/garmin-vivoactive-4-gps-smartwatch-in-depth-review.html) |
| Training Effect | **Non**, selon un représentant Garmin | M, [forum Garmin](https://forums.garmin.com/sports-fitness/healthandwellness/f/vivoactive-4-series/252859/feature-request-training-effect) |
| Training Status | **Non** sur la montre | M, [fiche specs VA4S (PDF)](https://woo.gpscentral.ca/wp-content/uploads/Product-Specifications-vivoactive-4S.pdf) |
| Prédicteur de course | **Non** | M, même fiche ; absent du manuel |
| Daily Suggested Workouts | **Probablement non**, car le Training Status manque | M, déduction du [prérequis Garmin](https://www8.garmin.com/manuals/webhelp/forerunner945/EN-US/GUID-1F857C7A-31A2-46AF-A639-2C3F5ECC3AF1.html) |
| Mises à jour firmware | Dernière version vue 8.40 (date inconnue) ; Garmin ne publie pas de date de fin de support | F, [forum](https://forums.garmin.com/sports-fitness/healthandwellness/f/vivoactive-4-series/374333/software-version-8-30/1810140) |

**Conséquence** : pour cette utilisatrice, l'app ne peut compter ni sur l'HRV status, ni sur la readiness, ni sur la charge Garmin. Elle dispose de la FC (repos et en activité), du sommeil, du Body Battery, du stress, de la VO2max et des activités détaillées. La charge et le ressenti doivent être calculés ou collectés par l'app elle-même.

### 2.2 Format JSON des workouts Garmin Connect (python-garminconnect / garmin_mcp)

Sources : [workout.py](https://github.com/cyberjunky/python-garminconnect/blob/master/garminconnect/workout.py) et [api/workouts.py](https://github.com/cyberjunky/python-garminconnect/blob/master/garminconnect/api/workouts.py), lus le 16/11/2026 (É pour le code, M pour l'exactitude vis-à-vis de Garmin).

**Endpoints non officiels**
- `POST /workout-service/workout` : création, renvoie un `workoutId`.
- `PUT /workout-service/workout/{id}` : remplacement complet ; l'id et les programmations sont conservés.
- `POST /workout-service/schedule/{workoutId}` avec le corps `{"date":"YYYY-MM-DD"}` : programmation dans le calendrier.
- `DELETE /workout-service/schedule/{scheduleId}` : déprogrammation.
- `GET /workout-service/schedule/workoutScheduleByPeriod` : lecture des séances programmées, plans adaptatifs compris.
- `GET /workout-service/workout/FIT/{id}` : téléchargement du FIT.
- Envoi direct vers une montre : `POST /device-service/devicemessage/messages` (ajouté en 0.3.7) ([issue #400](https://github.com/cyberjunky/python-garminconnect/issues/400)).

**Structure**
- Racine : `workoutName`, `sportType {sportTypeId:1, sportTypeKey:"running"}`, `workoutSegments[]`.
- Chaque segment contient `sportType` et `workoutSteps[]`.
- Étape exécutable (`ExecutableStepDTO`) :
  - `stepOrder` ;
  - `stepType` : warmup 1, cooldown 2, interval 3, recovery 4, rest 5, repeat 6, other 7, main 8 ;
  - `endCondition {conditionTypeId, conditionTypeKey}` : lap.button 1, time 2, distance 3, calories 4, power 5, heart.rate 6, iterations 7 ;
  - `endConditionValue` : en secondes ou en mètres ;
  - `targetType {workoutTargetTypeId, workoutTargetTypeKey}` : no.target 1, power.zone 2, cadence 3, heart.rate.zone 4, speed.zone 5, pace.zone 6 ;
  - `targetValueOne`, `targetValueTwo` ou `zoneNumber` ;
  - `description` optionnelle.
- Répétition (`RepeatGroupDTO`) : `numberOfIterations`, `workoutSteps[]` imbriquées, `smartRepeat`, `skipLastRestStep`.

**Cibles**
- Une allure s'exprime **en m/s**, l'allure lente étant la borne basse. Le helper `pace_to_mps(min, s, "km")` fait la conversion.
- La FC s'exprime soit en zone (`zoneNumber`), soit en plage de bpm (`targetValueOne`/`Two` avec `heart.rate.zone`).

**Fragilité observée**
- En 2026, les identifiants de `ConditionType` et `TargetType` de la bibliothèque étaient faux (DISTANCE valait 1, soit lap.button). Corrigé en 0.3.6, avec des tests qui figent désormais les identifiants ([#370](https://github.com/cyberjunky/python-garminconnect/issues/370), [#333](https://github.com/cyberjunky/python-garminconnect/issues/333)). La source de vérité reste `GET /workout-service/workout/types`.
- Garmin n'a pas de type de sport « walking » pour les workouts : les appels correspondants lèvent une `ValueError` ([README, É](https://github.com/cyberjunky/python-garminconnect)).

**garmin_mcp**
- Huit outils « workouts » : librairie, upload, programmation, suppression, calendrier, et constructeurs haut niveau `create_walk_run_workout`, `create_z2_walk_workout` et `schedule_week` ([README garmin_mcp, É](https://github.com/taxuspt/garmin_mcp)).
- Les jetons sont stockés dans `~/.garminconnect`, valables environ 6 mois. Le serveur applique un timeout de 90 s, car l'API Garmin « bloque parfois une requête indéfiniment ».

### 2.3 Risques de la connexion non officielle

- **Ruptures fréquentes et récentes** (É, GitHub)
  - Mars 2026 : Cloudflare renvoie un 429 sur toute nouvelle connexion, même depuis un simple curl ([garth #217](https://github.com/matin/garth/issues/217)).
  - **garth est abandonné** : « Garmin a changé son flux d'auth, cassant l'approche mobile » ([README garth](https://github.com/matin/garth)).
  - python-garminconnect a réécrit son authentification en 0.3.0, puis publié 10 versions entre le 19/08 et le 23/10/2026 ([CHANGELOG](https://raw.githubusercontent.com/cyberjunky/python-garminconnect/master/CHANGELOG.md)) :
    - 0.3.20 : la connexion mobile renvoyait un 429 à chaque tentative ;
    - 0.3.17 : Garmin peut bloquer sur l'empreinte du client, pas seulement sur l'IP ;
    - 0.3.18 et 0.3.19 : erreurs 403 Cloudflare, et le contournement passe par l'imitation TLS `curl_cffi` ([#444](https://github.com/cyberjunky/python-garminconnect/issues/444)).
  - Juin 2026 : un 401 « Token is not active » selon la région ou le compte ([#369](https://github.com/cyberjunky/python-garminconnect/issues/369)).
  - Un fil du forum Garmin signale du « TLS fingerprinting » contre les clients non navigateur ([forum, M](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/433892/tls-fingerprinting-blocks-third-party-clients/2022560)).
- **MFA** : supportée via `return_on_mfa` et `resume_login`. Bug en août 2026 : un mauvais code détruisait la session ([#416](https://github.com/cyberjunky/python-garminconnect/issues/416)). Un compte créé fin 2025 a la MFA imposée par défaut et se connecte, alors qu'un ancien compte prenait un 401 ([#332](https://github.com/cyberjunky/python-garminconnect/issues/332), M).
- **Sanctions de compte** : le mainteneur n'a connaissance d'aucune suspension, puisque le trafic imite l'app mobile. Il a contacté Garmin, qui ne vend de licence que pour des projets fermés et commerciaux (environ 1 000 $ à l'époque, refusée pour de l'open source) ([#362, M](https://github.com/cyberjunky/python-garminconnect/issues/362)).
- **Conditions d'utilisation** : la clause exacte de Garmin sur l'accès automatisé n'a pas été retrouvée (**non vérifié**). L'accès reste non autorisé et non supporté.
- **Durcissement Garmin en octobre 2026**
  - Garmin applique strictement la clause 5.1(o) de son contrat développeur, qui interdit de repasser les données à des tiers non approuvés. Intervals Pro a fermé le 12/10/2026 ([the5krunner, M](https://the5krunner.com/2026/10/14/garmin-api-intervals-third-party-apps/) ; [forum intervals.icu, M](https://forum.intervals.icu/t/api-access-to-intervals-icu/609?page=38)).
  - Un contributeur craint une répression accrue de l'accès non officiel maintenant qu'une API officielle existe ([#476, F](https://github.com/cyberjunky/python-garminconnect/issues/476)).

### 2.4 Alternatives officielles

- **Personal API** (nouvelle, octobre 2026)
  - Clé générée par l'utilisateur dans Garmin Connect, sans procédure d'approbation ([the5krunner 22/10/2026, M](https://the5krunner.com/2026/10/22/garmin-personal-api/) ; [Garmin overview, É](https://developer.garmin.com/gc-developer-program/overview/)).
  - Jeton valable 24 h, sans refresh ; la clé expire au bout de 30 jours à 1 an ([Personal FAQ, É](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)).
  - Données : activités (JSON et FIT), santé, santé féminine. **Lecture seule** : ni Training API ni Courses API, donc **impossible d'envoyer des workouts** ([Garmin overview, É](https://developer.garmin.com/gc-developer-program/overview/)).
  - « Pas destinée aux applications commerciales servant plusieurs utilisateurs » ([FAQ, É](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)).
  - Environ 35 points de données contre plus de 300 dans la bibliothèque non officielle, selon son mainteneur ([#476, M](https://github.com/cyberjunky/python-garminconnect/issues/476)).
  - Client Python officiel : [garmin/connect-personal-api-python](https://github.com/garmin/connect-personal-api-python) (É).
  - Disponibilité de HRV, sommeil et Body Battery : non vérifiée en détail, voir la doc Swagger.
- **Business, palier Starter**
  - Comprend les API Activity, Health, Training (« publier des workouts et plans dans le calendrier Garmin Connect », que l'utilisateur synchronise ensuite sur sa montre), Courses et Women's Health. Livraison en push uniquement, sans historique, nombre d'utilisateurs limité ([Garmin overview, É](https://developer.garmin.com/gc-developer-program/overview/) ; [Training API, É](https://developer.garmin.com/gc-developer-program/training-api)).
  - Gratuit « pour les développeurs business approuvés ». Une app Starter porte un label « unverified » jusqu'à revue ([the5krunner, M](https://the5krunner.com/2026/10/22/garmin-personal-api/)).
  - Le programme a été fermé aux nouvelles candidatures pendant environ 7 mois, puis rouvert en octobre 2026 ([the5krunner, M](https://the5krunner.com/2026/10/22/garmin-personal-api/) ; [Terra, M](https://tryterra.co/blog/garmin-connect-developer-program-pause)).
  - Éligibilité d'un particulier sans structure : **non vérifiée**. La page dit « des développeurs individuels aux grandes entreprises », mais le palier s'appelle Business.
  - Une copie non officielle de la spec mentionne une revue de production avec au moins 2 utilisateurs Garmin ([Scribd, F](https://www.scribd.com/document/794187143/Garmin-Connect-Developer-Program-Training-API)).

### 2.5 Notifications push d'une web app installée sur iPhone

- **Conditions** (É)
  - iOS ou iPadOS 16.4 ou plus.
  - Site ajouté à l'écran d'accueil, avec un manifest `display: standalone` ou `fullscreen`.
  - Permission demandée en réponse à un geste de l'utilisateur, par exemple un bouton.
  - Passage par APNs, sans compte Apple Developer. Le serveur doit autoriser `*.push.apple.com`.
  - Les notifications s'affichent sur l'écran verrouillé, dans le centre de notifications et sur l'Apple Watch, avec badge et modes Concentration.
  - Source : [WebKit, É](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- **Pas de push silencieux** : `userVisibleOnly: true` est obligatoire. « Si le handler n'affiche pas la notification, nous révoquons l'abonnement » ([WebKit Declarative Web Push, É](https://webkit.org/?p=16535)). Afficher la notification après une opération asynchrone sans `event.waitUntil()` compte comme un push silencieux ([Progressier, M](https://dev.to/progressier/how-to-fix-ios-push-subscriptions-being-terminated-after-3-notifications-39a7)).
- **Declarative Web Push** (iOS 18.4+) : la notification s'affiche sans exécuter de service worker, ce qui la rend plus robuste ([firt.dev, M](https://firt.dev/notes/pwa-ios/)).
- **Ni Background Sync ni Background Fetch** : impossible de rafraîchir des données en arrière-plan ([firt.dev, M](https://firt.dev/notes/pwa-ios/)).
- **Fiabilité**
  - Abonnements révoqués hors action de l'utilisateur ; `pushsubscriptionchange` n'est pas supporté ([WebKit bug 273063, É](https://bugs.webkit.org/show_bug.cgi?id=273063)).
  - Notifications qui s'arrêtent après quelques jours ou semaines, et endpoint qui change sous iOS 18.1.1 ([forums Apple, M](https://origin-devforums.apple.com/forums/thread/728796) ; [Discourse, M](https://meta.discourse.org/t/not-getting-ios-pwa-push-notifications/274806)).
  - Conclusion : il faut revérifier l'abonnement à chaque ouverture et se réabonner si besoin.
- **UE** : Apple avait retiré les web apps d'écran d'accueil dans la bêta d'iOS 17.4 au titre du DMA, puis a fait marche arrière en mars 2024 ([Engadget, M](https://www.engadget.com/apple-backtracks-on-plans-to-get-rid-of-web-apps-on-iphones-in-the-eu-195232177.html)).

---

## À reprendre / à éviter

**À reprendre**
- **Le plan est écrit par des règles sourcées, le LLM explique et dialogue.** C'est le modèle de Runna (plans de coachs, algorithme, couche IA explicative), d'Athletica (Banister, HRV, RPE, avec explication IA) et la recommandation des études ([Düking 2024](https://jssm.org/jssm-23-56.xml-abst), [arXiv 2509.26593](https://arxiv.org/html/2509.26593v1)).
- **Allures pilotées par un seul paramètre de niveau** (temps de course estimé, VDOT ou équivalent), modifiées **seulement sur un schéma constant**, avec rejet des répétitions aberrantes et **accord explicite** de l'utilisatrice (Runna Pace Insights).
- **Distinguer « sauter » et « déplacer »**, et ne pas rattraper les séances manquées (Runna, TrainAsONE).
- **Mode « pas en forme »** sur N jours : pause ou allègement (Runna).
- **Recalage par séances test** (plans experts Garmin), indispensable ici car la vivoactive 4 n'a ni charge ni readiness.
- **Fenêtre glissante de 2 semaines** poussée au calendrier Garmin, retrait des séances faites ou sautées (Runna, COROS).
- **Visualiser l'effet des séances planifiées sur la charge** (COROS Training Hub).
- **Persistance d'un profil athlète structuré** hors du LLM (arXiv 2509.26593).

**À éviter**
- **Changer la séance du jour en cours de journée** sur une métrique fluctuante (reproche Run Coach). Il faut la figer à heure fixe, ou après confirmation.
- **Interdire le déplacement** des séances (Run Coach).
- **Rampe de volume ou d'intensité agressive** et footings trop rapides (vague de blessures Runna) : plafonds de progression codés en dur.
- **Remplacer systématiquement les jours de repos** par des footings (reproche Garmin Coach).
- **Laisser le LLM générer librement un plan** ou appliquer des garde-fous seulement « par la conversation » (études).
- **Dépendre de métriques absentes de la vivoactive 4** (HRV status, Training Readiness, Training Load, DSW, Run Coach).
- **Compter sur le push iOS comme canal critique**, ou sur un traitement en arrière-plan côté iPhone.

**Répartition recommandée**
- **Déterministe** : progression et plafonds de charge, structure des séances, calcul des allures et des zones FC, règles d'allègement ou de pause, validation du JSON Garmin, décision finale.
- **LLM** : interprétation du ressenti en texte libre vers des champs structurés, choix entre options prévalidées par le moteur, explication en langage naturel, questions de suivi.
- **Contrôle** : toute sortie du LLM passe par le validateur de règles avant envoi à la montre.

---

## Questions ouvertes

1. La vivoactive 4 de l'utilisatrice affiche-t-elle et alerte-t-elle sur les cibles `pace.zone` (plage m/s) et `heart.rate.zone` (plage bpm) d'un workout ? Seul un test réel le dira.
2. La vivoactive 4 propose-t-elle l'auto-évaluation après activité (ressenti et RPE) ? C'est absent du manuel ; à vérifier dans le menu Activités. Sinon, le RPE doit être collecté dans la web app.
3. Version du firmware de la montre, et existence d'un score de sommeil sur cette version.
4. Un particulier peut-il obtenir l'accès Business Starter (Training API) pour un projet perso à 1 ou 2 utilisateurs, et dans quel délai ? Il faut poser la question directement à Garmin.
5. Que renvoie la Personal API (Swagger) pour cette montre : sommeil, FC de repos, stress, Body Battery, VO2max, activités FIT ? Si elle suffit en lecture, l'accès non officiel ne servirait qu'à l'écriture des workouts.
6. Quelle tolérance accepter face aux ruptures de l'accès non officiel (plusieurs par an en 2026) ? Quel mode dégradé prévoir : export FIT de workout à importer manuellement, ou saisie manuelle ?
7. La clause des conditions d'utilisation de Garmin sur l'accès automatisé : texte exact non retrouvé.
8. Résultats du comparatif multi-LLM sur les plans marathon (SportRxiv) : à lire si l'on veut chiffrer le risque d'un LLM « libre ».
9. Les règles précises de Coopah et de TrainAsONE, et les avis indépendants sur ces deux apps, n'ont pas été trouvés.
