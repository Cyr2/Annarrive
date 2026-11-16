# 03 — Gestion de la charge et adaptation au jour le jour

Périmètre : métriques de charge, règles de progression, entraînement guidé par la VFC (HRV), sommeil et stress, décisions quotidiennes, séances ratées, maladie, douleur, usage du RPE. Tout paramètre est **générique** : chaque seuil est soit une constante de la littérature, soit calculé sur l'historique propre du coureur (ligne de base). Aucune valeur n'est propre à l'utilisatrice pilote.

**Codes de niveau de preuve** : **MA** méta-analyse / revue systématique · **ECR** essai contrôlé randomisé · **OBS** cohorte/observationnel · **CONS** consensus d'experts ou d'entraîneurs publié · **OP** opinion (dont nos choix par défaut). « *non vérifié* » = source citée de mémoire ou dont je n'ai pas pu ouvrir le texte ni l'abstract.

---

## 0. Données disponibles (montre Garmin) et conséquences

| Donnée | vivoactive 4 | Usage dans l'algo |
|---|---|---|
| FC pendant l'activité (optique poignet), durée, distance, allure | oui | TRIMP, distance par séance, volume |
| FC de repos quotidienne | oui | signal de récupération secondaire |
| Sommeil (durée, phases) | oui | durée totale seulement (phases peu fiables, §5.4) |
| Stress Garmin (0–100, dérivé VFC + FC) | oui | information secondaire |
| Body Battery | oui | information secondaire, jamais seul critère (§5.4) |
| VFC nocturne brute / « HRV Status » | **probablement non** sur vivoactive 4 (fonction apparue sur des modèles ultérieurs, ex. vivoactive 5, Forerunner 255/955) — *non vérifié* sur fiche officielle | module VFC désactivable, voir §4.6 |
| Training Readiness | **probablement non** sur vivoactive 4 — *non vérifié* | ne pas en dépendre |
| Ressenti / effort perçu post-activité | saisie Garmin Connect (selon modèle/firmware, *non vérifié* pour vivoactive 4) | l'app collecte de toute façon son propre RPE CR-10 |

Conséquence de conception : l'algorithme doit fonctionner avec un **socle minimal** (durée + RPE de séance + distance) et monter en gamme si des données supplémentaires existent (FC → TRIMP ; VFC nocturne → module VFC). Chaque règle déclare ses entrées requises ; si une entrée manque, la règle est sautée, jamais devinée.

---

## 1. Métriques de charge

### 1.1 Formules

| Métrique | Formule | Entrées | Source | Preuve |
|---|---|---|---|---|
| **TRIMP Banister** | `TRIMP = D × x × a·e^(b·x)`, `x = (FCmoy − FCrepos)/(FCmax − FCrepos)`, D en min ; femmes a=0,86 b=1,67 ; hommes a=0,64 b=1,92 | FC moy, FCrepos, FCmax | Banister 1991 (chapitre *Physiological Testing of the High-Performance Athlete*) ; coefficients Morton, Fitz-Clarke & Banister 1990, *J Appl Physiol* 69:1171 — *non vérifié* (formule reproduite partout) | modèle physiologique, validation indirecte |
| **TRIMP Edwards** (zones additionnées) | `Σ (minutes en zone i × i)`, zones 50–60 % FCmax ×1, 60–70 ×2, 70–80 ×3, 80–90 ×4, 90–100 ×5 | FC seconde par seconde, FCmax | Edwards S., 1993, *The Heart Rate Monitor Book*, Polar Electro — *non vérifié* (livre) | idem |
| **TRIMP Lucia** | `Σ (min zone1 ×1 + zone2 ×2 + zone3 ×3)`, zones bornées par SV1 et SV2 | FC + seuils ventilatoires (test labo) | Lucia et al. 2003, *Med Sci Sports Exerc* 35(5):872-878, « Tour de France versus Vuelta a España: which is harder? » | idem ; corrélé à Edwards r = 0,92 (rapporté en secondaire) |
| **sRPE** (Foster) | `charge (UA) = RPE CR-10 de la séance × durée (min)`, RPE demandé ~30 min après la fin | durée, RPE | Foster et al. 2001, *J Strength Cond Res* 15(1):109-115, « A new approach to monitoring exercise training » ; revue Haddad et al. 2017, *Front Neurosci* 11:612 (36 études de validité/fiabilité) [lien](https://www.frontiersin.org/articles/10.3389/fnins.2017.00612/full) | validé contre TRIMP FC dans de nombreux sports (MA/revue narrative systématisée) |
| **Distance par séance / par semaine** | km | GPS | — | indispensable car les études blessures-course (§2) sont exprimées en distance |

### 1.2 Lesquelles sont calculables avec une Garmin

- **sRPE** : oui, partout, y compris **musculation** (où la FC sous-estime la charge). Ne dépend pas de la qualité du capteur optique.
- **Edwards** : oui (FC + FCmax). FCmax doit venir d'un test ou d'une valeur observée ; une FCmax estimée par l'âge biaise toutes les zones.
- **Banister** : oui (FC moy, FC repos fournie par la montre, FCmax). Sensible à FCmax et FCrepos.
- **Lucia** : non sans test ventilatoire ; approximation possible via seuils estimés, mais alors ce n'est plus Lucia.
- Limite commune des TRIMP FC : FC optique au poignet moins fiable en fractionné court et pour les changements rapides (à confirmer par l'étude de validation du doc capteurs) ; FC ne reflète pas la charge mécanique ni la musculation.

### 1.3 Choix par défaut

**Métrique de charge interne principale : sRPE (UA)**, toutes activités confondues (course, muscu, vélo…). Justification : (1) seule métrique homogène course + muscu, essentielle avec 3–4 séances de muscu/semaine ; (2) validée (Foster 2001 ; Haddad 2017) ; (3) indépendante du capteur ; (4) l'utilisatrice est déjà sollicitée pour le ressenti.
**Charge externe course : distance** (par séance et par semaine), parce que les règles de blessure (§2) sont formulées en distance.
**Secondaire : TRIMP Edwards** pour la course quand la FC est exploitable, utilisé pour détecter une dérive (même allure, TRIMP plus élevé) — pas pour décider seul.
Si le RPE n'est pas saisi : imputer `RPE = RPE prévu de la séance` et marquer la charge « estimée » ; ne jamais déclencher une règle restrictive sur une charge estimée seule.

---

## 2. Modèles de charge cumulée

### 2.1 Modèle impulsion-réponse (fitness-fatigue) et CTL/ATL/TSB

- Banister et al. 1975, « A systems model of training for athletic performance », *Aust J Sports Med* 7:57-61 ; Calvert, Banister et al. 1976, *IEEE Trans Syst Man Cybern* : performance = forme − fatigue, deux réponses du premier ordre, constantes **τ forme ≈ 50 j, τ fatigue ≈ 15 j** dans l'article original (rapporté en secondaire). **Preuve : modèle, validé sur petits effectifs.**
- Implémentation « logicielle » usuelle (TrainingPeaks/Coggan, CONS) : `CTL_t = CTL_{t−1} + (L_t − CTL_{t−1})·(1 − e^(−1/42))`, `ATL` idem avec τ = 7, `TSB_t = CTL_{t−1} − ATL_{t−1}`. Les valeurs 42/7 sont une convention, pas un résultat d'étude.
- Limites : Hellard et al. 2006, « Assessing the limitations of the Banister model in monitoring training », *J Sports Sci* 24(5):509-520 [doi:10.1080/02640410500244697](https://doi.org/10.1080/02640410500244697) — bon ajustement (R² = 0,79) mais IC à 95 % des paramètres très larges et paramètres fortement corrélés → **interprétation individuelle des paramètres « sans valeur »**. Le modèle est linéaire, n'a pas de saturation, et réduit toute séance à un nombre. (OBS / méthodologique)

**Choix par défaut** : calculer CTL/ATL/TSB sur la charge sRPE **à titre descriptif** (graphiques, explication à l'utilisatrice, détection d'une semaine anormalement chargée). **Ne pas** en faire un critère de blessure ni de décision quotidienne. Pas de prédiction de performance par ajustement individuel de paramètres (instable, Hellard 2006).

### 2.2 ACWR (ratio charge aiguë / chronique)

- Promotion : Gabbett 2016, « The training-injury prevention paradox: should athletes be training smarter and harder? », *BJSM* 50:273-280 [PMC4789704](https://pmc.ncbi.nlm.nih.gov/articles/PMC4789704) — zone « sûre » 0,8–1,3, risque accru > 1,5 (sports collectifs). **OBS**, effectifs d'équipes pro.
- Variante EWMA : Williams et al. 2017, *BJSM* 51(3):209-210, « Better way to determine the acute:chronic workload ratio? » (τ 7 et 28 j) ; réponse Sampson et al. 2017 : aucune preuve qu'une méthode soit supérieure. (OP/lettres)
- Critiques :
  - Lolli et al. 2019 (en ligne 2017), « Mathematical coupling causes spurious correlation within the conventional acute-to-chronic workload ratio calculations », *BJSM* 53(15):921-922 [doi:10.1136/bjsports-2017-098110](https://bjsm.bmj.com/content/53/15/921) : la semaine aiguë est incluse dans la chronique → corrélation artefactuelle.
  - Impellizzeri et al. 2020, « Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls », *IJSPP* 15(6):907-913 [doi:10.1123/ijspp.2019-0864](https://pmc.ncbi.nlm.nih.gov/articles/PMC7534938) : le ratio ne normalise pas, ajoute du bruit, aucune étude n'a estimé un effet causal → **aucune preuve pour l'utiliser dans un système de gestion de charge ou pour des recommandations visant à réduire les blessures**.
  - Spécifique course : Frandsen et al. 2025 (§3.3) — dans la cohorte Garmin-RUNSAFE, les « pics » d'ACWR hebdomadaire apparaissaient **protecteurs**, et la variation semaine/semaine n'était pas associée au risque ; seul le pic de distance **d'une séance** l'était.

**Divergence** : Gabbett (OBS, sports collectifs) vs Impellizzeri/Lolli (critique méthodologique) + Frandsen 2025 (OBS, coureurs, n ≈ 5 200). **Choix par défaut** : **pas d'ACWR comme règle de décision.** On peut l'afficher (version EWMA découplée) mais les garde-fous de progression sont ceux du §3, formulés en distance et par séance.

---

## 3. Règles de progression

### 3.1 « Règle des 10 % »

- Buist et al. 2008, « No effect of a graded training program on the number of running-related injuries in novice runners: a randomized controlled trial », *Am J Sports Med* 36(1):33-39 (GRONORUN, n = 532 débutants) : programme gradué 13 sem. basé sur +10 %/sem vs standard 8 sem. → blessures **20,8 % vs 20,3 %**, pas de différence. **ECR.** [PEDro](https://search.pedro.org.au/search-results/record-detail/20220)
- Nielsen et al. 2012, « Training errors and running related injuries: a systematic review », *Int J Sports Phys Ther* [PMID 22389869](https://pubmed.ncbi.nlm.nih.gov/22389869/) : impossible d'identifier quelles erreurs d'entraînement causent les blessures, résultats contradictoires. **MA/RS.**

### 3.2 Progression hebdomadaire

- Nielsen et al. 2014, « Excessive progression in weekly running distance and risk of running-related injuries: an association which varies according to type of injury », *JOSPT* 44(10):739-747 [doi:10.2519/jospt.2014.5164](https://doi.org/10.2519/jospt.2014.5164) : cohorte 1 an, débutants ; groupes < 10 %, 10–30 %, > 30 % ; **pas de différence globale** ; pour les blessures « liées à la distance » (syndrome fémoro-patellaire, bandelette ilio-tibiale…) HR = 1,59 (IC95 0,96–2,66 ; p = 0,07) pour > 30 %. Recommandation des auteurs : < 30 % sur 2 semaines chez le débutant. **OBS.**
- Damsted et al. 2018, *JOSPT* (semi-marathon) : +20 à 60 % hebdo associé à plus de blessures à 21 jours, pas à 56/98 jours. **OBS.** [résumé](https://runsafe.au.dk/display/artikel/a-new-study-on-training-load-in-half-marathon-runners)

### 3.3 Pics de distance d'une seule sortie (le résultat le plus actionnable)

- Frandsen (Schuster Brandt Frandsen) et al. 2025, « How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study », *BJSM* 59:1203-1210 ; données Garmin, 18 mois. Référence = plus longue sortie des **30 jours précédents**. Par rapport à une séance ≤ +10 % : **+10–30 % HRR 1,64 ; +30–100 % HRR 1,52 ; > +100 % HRR 2,28**. Variation hebdomadaire : non associée ; ACWR : pics « protecteurs ». **OBS** (grande cohorte, données objectives, blessures auto-déclarées). [blog BJSM](https://blogs.bmj.com/bjsm/?p=11751) — chiffres issus de résumés secondaires, texte intégral *non ouvert*.

**Synthèse et choix par défaut**
- La règle des 10 % **hebdomadaire** n'a pas de preuve d'efficacité (ECR négatif) ; elle reste un plafond prudent de consensus.
- La meilleure preuve actuelle porte sur la **séance unique** : `distance_séance ≤ 1,10 × max(distance des sorties sur J−30…J−1)`.
- Défauts : (a) séance unique ≤ +10 % vs plus longue sortie 30 j (Frandsen 2025, OBS) — **règle dure** ; (b) volume hebdo ≤ +10 % visé, **plafond dur +30 %** sur 2 semaines glissantes (Nielsen 2014, OBS + CONS) ; (c) semaine allégée (−20 à −30 % de volume) toutes les 3–4 semaines (CONS ; structure 3:1 utilisée par Vesterinen 2016).
- Effet utile : après un arrêt, la « plus longue sortie des 30 jours » baisse mécaniquement → la règle (a) bride automatiquement la reprise.

---

## 4. Entraînement guidé par la VFC (HRV)

### 4.1 Essais contrôlés

| Étude | Population | Protocole VFC | Résultat | Preuve |
|---|---|---|---|---|
| Kiviniemi et al. 2007, « Endurance training guided individually by daily heart rate variability measurements », *Eur J Appl Physiol* 101(6):743-751 [PMID 17849143](https://pubmed.ncbi.nlm.nih.gov/17849143/) | 26 hommes modérément entraînés | VFC matinale ; baisse → séance facile/repos | VO2pic : pas de différence significative entre groupes ; auteurs concluent à une amélioration efficace | ECR (petit) |
| Kiviniemi et al. 2010, « Daily exercise prescription on the basis of HR variability among men and women », *Med Sci Sports Exerc* 42(7):1355-1363 [PMID 20575165](https://pubmed.ncbi.nlm.nih.gov/20575165/) | 32 femmes, 21 hommes | idem | Hommes : charge max +30 vs +18 W (p = 0,033) ; **femmes : pas de différence** de gain ; VO2pic identique | ECR |
| Vesterinen et al. 2016, « Individual endurance training prescription with heart rate variability », *Med Sci Sports Exerc* 48(7):1347-1354 [PMID 26909534](https://pubmed.ncbi.nlm.nih.gov/26909534/) ; manuscrit [JYX](https://jyx.jyu.fi/bitstream/handle/123456789/50625/vesterinenetalindividualendurancemsse.pdf) (lu) | 40 coureurs loisir | voir §4.2 | 3000 m : −2,1 % (VFC) vs −1,1 % NS (prédéfini), ES = 0,42 ; moins de séances dures (13,2 vs 17,7) | ECR |
| Javaloyes et al. 2019, « Training prescription guided by heart-rate variability in cycling », *IJSPP* 14:23-32 [PMID 29809080](https://pubmed.ncbi.nlm.nih.gov/29809080/) | 17 cyclistes entraînés | VFC matinale, SWC | Gains PMA, SV2, CLM 40 min dans le groupe VFC | ECR (petit) ; détails du seuil *non vérifiés* |
| Javaloyes et al. (vs périodisation par blocs), 20 cyclistes | | | Performances similaires | ECR |

### 4.2 Protocole de Vesterinen 2016 (vérifié dans le manuscrit)

- Mesure **chaque matin au réveil, après la miction, 4 min couché**, respiration libre, ceinture thoracique.
- Indice : **RMSSD** ; **moyenne glissante 7 jours** (`RMSSD7j`), plus sensible que les valeurs journalières (Plews).
- **SWC = moyenne ± 0,5 × ET** des RMSSD sur **4 semaines** de référence (Plews ; Hopkins).
- Règle : `RMSSD7j` **dans** la SWC → séances modérées/intenses autorisées ; **hors SWC (au-dessus OU en dessous)** → basse intensité ou repos ; reprise des séances dures seulement quand `RMSSD7j` **revient à la moyenne**, pas simplement dans la bande.
- Nombre de séances et de jours de repos par semaine inchangé (seule l'intensité est modulée).
- SWC **recalculée après 4 semaines** ; la ligne de base ne doit pas être mesurée en période de stress (travail, maladie). Cas rapporté : un sujet a fait 5 semaines en basse intensité à cause d'un stress professionnel → limite pratique.

### 4.3 Méthodologie de suivi (Plews)

- Plews et al. 2013, « Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring », *Sports Med* 43(9):773-781 [doi:10.1007/s40279-013-0071-8](https://doi.org/10.1007/s40279-013-0071-8) : préférer les tendances (moyenne 7 j de **ln RMSSD**) et son coefficient de variation à la valeur du jour. **Revue/OP** (texte intégral *non ouvert*, contenu via citations).
- Plews et al. (IJSPP, « Monitoring training with heart rate variability: how much compliance is needed for valid assessment? ») : **minimum 3 mesures valides par semaine** (rapporté en secondaire). **OBS.**

### 4.4 Méta-analyses

- Düking et al. 2021, *J Sci Med Sport* [doi:10.1016/j.jsams.2021.04.012](https://doi.org/10.1016/j.jsams.2021.04.012) : 8 études, 198 participants ; performance g = 0,079 (NS) ; VO2pic NS ; paramètres sous-maximaux g = 0,296 (p = 0,028) ; **moins de non-répondeurs** avec la VFC. **MA.**
- Manresa-Rocamora et al. 2021, *Int J Environ Res Public Health* [PMC8507742](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8507742/) : performance SMD = 0,20 (IC −0,09 à 0,48, NS) ; indices vagaux SMD = 0,50 ; « au mieux une petite marge ». **MA.**
- Granero-Gallegos et al. 2020 (*IJERPH*) : effet plus grand sur VO2max — *non vérifié* ; critiqué (groupe comme unité d'analyse).

**Synthèse** : la VFC guidée n'améliore pas nettement la performance moyenne, mais obtient des résultats égaux ou un peu meilleurs **avec moins de séances dures** et moins de non-répondeurs. Bénéfice chez les femmes non démontré (Kiviniemi 2010). Intérêt pour une app : sécurité et individualisation plus que gain de performance.

### 4.5 Fiabilité de la VFC Garmin

- Dial et al. 2025, « Validation of nocturnal resting heart rate and heart rate variability in consumer wearables », *Physiol Rep* [doi:10.14814/phy2.70527](https://pmc.ncbi.nlm.nih.gov/articles/PMC12367097/) ; 13 adultes, 536 nuits, réf. ECG : RMSSD nocturne **Garmin CCC = 0,87, MAPE = 10,5 %** (« accord faible » selon les auteurs) vs Oura Gen4 0,99, WHOOP 0,94, Polar 0,82. FC repos Garmin exclue de l'analyse. Modèle Garmin testé : *non vérifié* (page non accessible ; une source secondaire cite un Fenix 6). **OBS.**
- Une erreur de ~10 % est du même ordre que la SWC (0,5 ET) → une valeur journalière Garmin n'est pas décisionnelle ; la moyenne 7 j est le minimum.

### 4.6 Choix par défaut VFC

- Si VFC nocturne disponible (≥ 3 nuits valides/7) et ligne de base ≥ 28 jours **avec ≥ 20 valeurs** : appliquer la règle Vesterinen sur **ln RMSSD 7 j**, SWC ±0,5 ET, recalcul toutes les 4 semaines (fenêtre glissante 28–60 j, excluant les jours marqués maladie).
- La VFC module **l'intensité** (séance dure → facile), pas le volume, sauf combinaison avec d'autres signaux (§10).
- VFC **au-dessus** de la SWC : ne déclencher l'allègement que si un autre signal négatif coexiste (fatigue, maladie, FC repos haute). Justification : Vesterinen l'applique, mais l'élévation peut aussi refléter une bonne adaptation ; trop de faux positifs pour une app grand public. **OP** (divergence explicite avec le protocole Vesterinen).
- Sans VFC (cas vivoactive 4 probable) : substitut = **FC repos** nocturne/matinale, moyenne 7 j vs ligne de base 28 j ; seuil > +5 bpm ou > +2 ET. Preuve faible (Buchheit 2014, « Monitoring training status with HR measures: do all roads lead to Rome? », *Front Physiol* 5:73 — *non vérifié* en détail). **OP/CONS.**

---

## 5. Sommeil, stress perçu, charge académique

### 5.1 Sommeil

- Milewski et al. 2014, « Chronic lack of sleep is associated with increased sports injuries in adolescent athletes », *J Pediatr Orthop* 34:129-133 : 112 adolescents ; ≥ 8 h/nuit → **68 % moins de blessures** (p = 0,04). **OBS** (petit, rétrospectif, auto-déclaré).
- Hamlin et al. 2021, *Front Sports Act Living* (82 étudiants-athlètes) : ≥ 8 h ou meilleure qualité de sommeil → moins de blessures/maladies. **OBS.**
- Walsh et al. 2021, « Sleep and the athlete: narrative review and 2021 expert consensus recommendations », *BJSM* 55(7):356-368 [doi:10.1136/bjsports-2020-102025](https://doi.org/10.1136/bjsports-2020-102025) : pas de cible unique (7–9 h « pas idéal ») → **besoin individualisé** ; facteurs : sexe féminin, stress, anxiété. **CONS.**

### 5.2 Stress et charge académique

- Hamlin et al. 2019, « Monitoring training loads and perceived stress in young elite university athletes », *Front Physiol* 10:34 [PMC6361803](https://pmc.ncbi.nlm.nih.gov/articles/PMC6361803) : 182 étudiants-athlètes, 4 ans ; blessure prédite par **humeur basse, sommeil court, stress académique élevé** ; énergie et sommeil se dégradent vers les **examens** ; hausse brutale de charge en pré-saison → plus de blessures/maladies. **OBS.**
- Mann et al. 2016, « Effect of physical and academic stress on illness and injury in Division 1 college football players », *J Strength Cond Res* 30(1):20-25 [PMID 26049791](https://pubmed.ncbi.nlm.nih.gov/26049791/) : semaines de stress académique élevé → risque de restriction ×3,19 (presse) vs faible stress académique. **OBS.**
- Ivarsson et al. 2017, « Psychosocial factors and sport injuries: meta-analyses for prediction and prevention », *Sports Med* 47(2):353-365 [PMID 27406221](https://pubmed.ncbi.nlm.nih.gov/27406221/) : stress des événements de vie négatifs et réactivité au stress = prédicteurs les plus nets ; les interventions psychologiques réduisent le risque. **MA.**

### 5.3 Seuils actionnables (aucun n'est validé comme seuil de décision → **OP** fondée sur les OBS ci-dessus)

- Besoin de sommeil individuel `S_ref` = médiane de la durée de sommeil sur 28 nuits hors période d'examens, ou valeur déclarée si historique insuffisant.
- **Nuit courte** : `sommeil(J−1) < min(6 h, S_ref − 1,5 h)` → pas de séance dure ce jour (déplacer).
- **Dette** : `moyenne 3 nuits < S_ref − 1 h` → intensité limitée, volume −20 %.
- **Période d'examens** (déclarée par l'utilisatrice ou calendrier) : objectif de la semaine = maintien (volume ≤ semaine précédente, pas de pic séance, max 1 séance dure), sauf avis contraire de l'utilisatrice.
- **Stress perçu** (question quotidienne 1–5) : ≥ 4 deux jours consécutifs → traité comme un signal négatif (§10).

### 5.4 Fiabilité des métriques Garmin

- **Sommeil** : Schyvens et al. 2024 (*JMIR mHealth uHealth*, revue systématique, Fitbit Charge 4 / Garmin Vivosmart 4 / WHOOP) : précision **modérée** pour phases et durée ; Schyvens et al. 2025 (*SLEEP Advances*, 62 adultes vs PSG) : bonne détection du sommeil, **spécificité faible (≈ 29–52 %) pour l'éveil**, écarts sur durée totale et éveil intra-nuit [uhasselt](https://documentserver.uhasselt.be/handle/1942/42890). **OBS.** → utiliser la **durée totale en tendance**, jamais les phases.
- **Body Battery / Training Readiness / Stress** : algorithmes propriétaires (Firstbeat) ; **aucune validation indépendante évaluée par les pairs trouvée** (recherche web, nov. 2026). Une prépublication rapporte une corrélation modérée (≈ −0,6) entre stress Garmin et RMSSD — *non vérifié*. → informatif, affichable, **jamais critère seul**.

---

## 6. Usage du ressenti (RPE)

- Échelle : **CR-10 de Borg modifiée** (Foster 2001), saisie ~30 min après la séance pour la charge ; ressenti Garmin (si dispo) converti mais l'app pose sa propre question.
- Chaque séance planifiée porte un **RPE cible** (ex. footing 2–3, seuil 6–7, VO2 8–9 ; table dans le doc plan).
- Règles (OP/CONS, pas d'étude de validation de ces seuils) :
  - `RPE_réel − RPE_cible ≥ +2` sur une séance facile ou de seuil → signal négatif du jour suivant.
  - même écart sur **2 séances consécutives du même type** → allures cibles de ce type ralenties de **2–3 %** (ou FC cible inchangée) jusqu'à nouvel ajustement ; si ≥ 3 séances, proposer un test.
  - `RPE_réel − RPE_cible ≤ −2` sur 3 séances du même type **et** aucun signal négatif → allures accélérées de 1–2 % (une seule fois par bloc de 2 semaines).
- La dérive cardiaque à allure égale (TRIMP/min plus élevé) corrobore mais ne décide pas.

---

## 7. Décisions pour une séance : alléger, remplacer, décaler, annuler

| Action | Définition | Déclencheurs | Preuve |
|---|---|---|---|
| **Maintenir** | séance telle que prévue | aucun signal | — |
| **Alléger** | même type, −20 à −30 % de volume ou de répétitions, intensité inchangée | 1 signal négatif léger ; garde-fou de progression proche du plafond | CONS |
| **Remplacer** | séance dure → footing facile (RPE ≤ 3) de même durée ou plus court ; ou course → cross-training sans impact | VFC hors SWC (Vesterinen 2016, **ECR**) ; ≥ 2 signaux négatifs ; douleur 3–5/10 (§9) | ECR pour la VFC ; CONS sinon |
| **Décaler** | déplacer la séance clé à J+1/J+2 si contraintes respectées | nuit courte, examen le jour même, signal transitoire | CONS |
| **Annuler** | repos | fièvre, symptômes sous le cou, douleur > 5/10 ou signal rouge, ≥ 3 signaux négatifs | CONS (maladie : IOC 2022) |

Seule la modulation de l'intensité par la VFC est issue d'essais contrôlés. Tout le reste relève du consensus d'entraîneurs ou de notre choix.

---

## 8. Séances ratées, déplacées, arrêts

### 8.1 Priorité des séances (CONS/OP)

Ordre de conservation (sauter d'abord le bas de la liste) :
1. Sortie longue (si objectif ≥ semi) ou séance spécifique d'objectif.
2. Séance de qualité principale de la semaine (seuil/VO2).
3. Deuxième séance de qualité.
4. Footings d'endurance.
5. Footings de récupération, séances optionnelles.

En phase d'affûtage/course, la priorité 1 devient la séance spécifique à allure de course.

### 8.2 Règles de placement

- **Jamais deux séances dures consécutives** (dure = qualité RPE cible ≥ 6, sortie longue, compétition, ou muscu lourde des membres inférieurs). Principe « dur/facile » (Bowerman) et distribution polarisée (Seiler) — **CONS**, pas d'ECR sur la règle elle-même.
- ≥ 48 h entre deux séances dures de course (CONS).
- Muscu lourde des jambes : de préférence le **même jour** qu'une séance dure (après) ou le lendemain d'un footing, jamais la veille d'une séance clé (CONS/OP ; à harmoniser avec le doc muscu).
- **Pas de rattrapage** : une séance ratée n'est pas ajoutée au volume restant ; si une séance clé est ratée, elle remplace la séance de priorité inférieure suivante **si** les règles de placement et le plafond hebdo sont respectés, sinon elle est perdue (CONS).
- Une séance déplacée garde ses contrôles (pic séance, plafond hebdo).

### 8.3 Reprise après arrêt (hors blessure/maladie, qui ont leurs propres règles)

Base physiologique : Mujika & Padilla 2000, « Detraining: loss of training-induced physiological and performance adaptations. Part I », *Sports Med* 30(2):79-87 [PMID 10966148](https://pubmed.ncbi.nlm.nih.gov/10966148/) : en < 4 semaines, baisse rapide de VO2max et du volume sanguin, du seuil lactique, des enzymes oxydatives ; pertes plus modérées chez les sujets récemment entraînés. **Revue.** Aucun essai ne fixe de pourcentages de reprise : le tableau est un **choix par défaut (OP)** inspiré des pratiques d'entraîneurs (ex. tables de Daniels, *Daniels' Running Formula* — *non vérifié*).

| Durée d'arrêt | Semaine 1 (volume vs avant) | Intensité | Suite |
|---|---|---|---|
| 1–2 j | 100 % | inchangée | ne rien rattraper |
| 3–6 j | 80–90 % | 1re séance facile ; qualité après 2 footings sans signal | normal semaine 2 |
| 7–13 j | 70 % | pas de qualité semaine 1 ; allures −2 % semaine 2 | S2 85–90 %, S3 100 % |
| 14–27 j | 50–60 % | qualité réintroduite en S2, allures −3 à −5 % | +10–15 %/sem jusqu'à 100 % |
| ≥ 28 j | 40–50 % | footings seuls 2 sem. ; recalibrer les allures par test | ≥ 4 sem. de remontée |

La règle du pic de séance (§3.3) s'applique en plus et prime.

---

## 9. Maladie

### 9.1 Règle « au-dessus / en dessous du cou »

- Origine : Eichner 1993, *Phys Sportsmed* (« neck check ») — *non vérifié*.
- Appui expérimental : Weidner et al. 1998, « The effect of exercise training on the severity and duration of a viral upper respiratory illness », *Med Sci Sports Exerc* 30(11):1578-1583 [PMID 9813869](https://pubmed.ncbi.nlm.nih.gov/9813869/) : rhinovirus inoculé, exercice à 70 % FCR un jour sur deux pendant 10 j → **ni aggravation ni prolongation**. **ECR** (jeunes, rhume seulement).
- Consensus : Schwellnus et al. 2022, « IOC consensus statement on acute respiratory illness in athletes part 1: acute respiratory infections », *BJSM* 56:1066-1088 [doi:10.1136/bjsports-2022-105759](https://bjsm.bmj.com/content/early/2022/07/21/bjsports-2022-105759) — inclut des lignes directrices de retour au sport (détails *non ouverts*). **CONS.**
- Données : Snyders et al. 2022, *BJSM* 56:223-232 (MA, 54 études, 31 065 athlètes) : durée moyenne des symptômes **7,1 j** (IC 6,2–8,0) ; **80 % des infections respiratoires sans jour perdu** ; jours avant reprise 0–8,5 (4 études). **MA.**

Règle par défaut (CONS) :
- Symptômes **au-dessus du cou seulement** (nez qui coule, éternuements, mal de gorge léger), **sans fièvre** : footing facile autorisé, RPE ≤ 3, durée ≤ 50 % prévue ; pas d'intensité ; arrêt si aggravation.
- **Fièvre (≥ 38,0 °C), courbatures généralisées, toux grasse, oppression, diarrhée/vomissements, fatigue marquée** : repos complet ; reprise ≥ 24 h sans fièvre ni antipyrétique.
- Message « malade jusqu'à jeudi » → statut maladie jusqu'à la date + au moins 1 jour de reprise facile ; puis tableau §8.3 selon la durée.

### 9.2 COVID-19 et infections avec symptômes sous le cou

- Elliott et al. 2020, « Infographic. Graduated return to play guidance following COVID-19 infection », *BJSM* 54(19):1174-1175 [doi:10.1136/bjsports-2020-102637](https://doi.org/10.1136/bjsports-2020-102637) (texte lu) : avant la reprise, capable de vie quotidienne et de **marcher 500 m à plat** sans fatigue ou essoufflement excessifs ; **≥ 10 jours de repos et 7 jours sans symptômes** ; si un symptôme réapparaît (dont fatigue excessive) → **revenir au stade précédent après ≥ 24 h de repos sans symptôme** ; certains mettent > 3 semaines. **CONS.**
- Mise à jour 2022 (blog BJSM, mêmes auteurs) [lien](https://blogs.bmj.com/bjsm/2022/04/23/graduated-return-to-play-after-sars-cov-2-infection-what-have-we-learned-and-why-weve-updated-the-guidance/) : symptômes **sous le cou** → minimum **10 jours** : stade 1 repos ≥ 5 j, stade 2 activité légère ≥ 48 h, stade 3 ≥ 48 h, entraînement normal possible à J10 ; **au-dessus du cou seulement** → minimum **5 jours** (stade 2 48 h, stade 3 48 h) ; positif asymptomatique → départ stade 3 avec surveillance FC, VFC, RPE ; hors hospitalisés. **CONS.**
- **Signaux rouges** (arrêt + avis médical, ne pas reprendre) : douleur thoracique, palpitations, essoufflement disproportionné, malaise/syncope, FC anormalement élevée pour l'effort.

---

## 10. Douleur et blessures

### 10.1 Modèle de surveillance de la douleur

- Silbernagel et al. 2007, « Continued sports activity, using a pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy », *Am J Sports Med* 35(6):897-906 : 38 patients, poursuite de la course sous surveillance vs repos 6 sem. → **aucun effet négatif**, amélioration équivalente. **ECR.** Règles du modèle (rapportées en secondaire, seuil exact divergent selon les résumés — « jusqu'à 5 » vs « ne pas atteindre 5 ») : douleur pendant l'activité **≤ 5/10** ; douleur après l'activité **revenue au niveau de base le lendemain matin** ; douleur et raideur matinale **ne doivent pas augmenter de semaine en semaine**.
- Thomeé 1997, *Phys Ther* 77(12):1690 (fémoro-patellaire) : zones 0–2 « sûr », 2–5 « acceptable », 5–10 « risque élevé » — zones *non vérifiées* dans le texte primaire.
- Choix par défaut : seuil **« ≤ 4/10 autorisé, 5 = stop »** (lecture prudente de la divergence) ; s'applique à la course et aux douleurs de type tendineux/surcharge, **pas** aux douleurs osseuses.

### 10.2 Signaux qui imposent l'arrêt et l'orientation vers un professionnel (CONS)

- Douleur **osseuse localisée** (point précis douloureux à la pression : tibia, métatarse, hanche, bassin) ou qui augmente pendant la course → suspicion de fracture de fatigue : arrêt course, consultation.
- Douleur **au repos ou nocturne**, gonflement, rougeur/chaleur, blocage, instabilité, boiterie, impossibilité d'appui.
- Douleur > 5/10 pendant l'effort, ou non revenue au niveau de base 24 h après.
- Douleur qui persiste ou réapparaît **> 2 semaines** malgré l'allègement.
- Traumatisme (chute, entorse), engourdissement/fourmillements, faiblesse.
- Tout signal cardio-respiratoire (§9.2).
- Aménorrhée / cycles absents ≥ 3 mois, fractures de fatigue répétées → orienter (déficit énergétique relatif, RED-S ; consensus CIO 2023 — *non vérifié*).

### 10.3 Ce que l'app ne doit **pas** faire

- Poser un diagnostic, nommer une pathologie comme certaine, ou proposer un traitement (médicament, protocole de rééducation spécifique).
- Autoriser la reprise après signal rouge sans confirmation explicite qu'un professionnel a été consulté.
- Laisser le LLM réduire un niveau de gravité déterminé par les règles, ou interpréter « ça va mieux » comme une levée de restriction sans repasser par les seuils.
- Pousser à s'entraîner malgré un message de douleur ou de maladie ; l'utilisatrice peut refuser un allègement, mais **jamais forcer** une séance dure contre un signal rouge (l'app informe et consigne le choix).
- Interpréter Body Battery/Training Readiness comme un avis médical.

---

## 11. Règles prêtes pour l'algo

Conventions : `J` = jour courant ; toutes les lignes de base sont **calculées par utilisateur** sur ses données ; si une entrée manque, la règle est ignorée (pas d'imputation restrictive). Les paramètres numériques sont des constantes globales configurables, identiques pour tous les coureurs. « Dure » = séance de qualité (RPE cible ≥ 6), sortie longue, compétition, muscu lourde jambes.

### 11.1 Calculs quotidiens (avant décision)

- `charge_J` = Σ RPE × durée (min) des séances de J (UA).
- `CTL`, `ATL`, `TSB` : EWMA τ 42/7 sur `charge` (affichage seulement).
- `long30` = max(distance des sorties sur J−30…J−1).
- `vol7` = km sur J−6…J ; `vol7_prec` = km sur J−13…J−7 ; `vol14`, `vol14_prec` sur 14 j.
- `S_ref` = médiane du sommeil sur 28 nuits hors maladie/examens (≥ 14 nuits, sinon valeur déclarée ou 8 h).
- `FCR_ref` = moyenne et ET de la FC repos sur 28 j ; `FCR7` = moyenne 7 j.
- Si VFC : `lnRMSSD7` = moyenne 7 j de ln RMSSD (≥ 3 valeurs) ; `SWC` = moyenne ± 0,5 ET sur 28–60 j (≥ 20 valeurs, hors maladie) ; recalcul toutes les 4 semaines.

### 11.2 Arbre de décision quotidien (évalué dans l'ordre ; la première branche bloquante fixe le plafond, les suivantes ne peuvent que restreindre davantage)

**Étape 1 — Signal rouge médical** (message ou questionnaire)
- SI douleur thoracique, palpitations, malaise, essoufflement disproportionné → **ANNULER tout** ; message « consulter rapidement » ; bloquer jusqu'à confirmation d'avis médical.
- SI douleur osseuse localisée, douleur au repos/nocturne, gonflement, boiterie, traumatisme → **ANNULER course** ; cross-training sans douleur autorisé ; orienter vers un professionnel ; bloquer la course jusqu'à confirmation.

**Étape 2 — Maladie**
- SI fièvre ≥ 38,0 °C OU symptômes sous le cou OU troubles digestifs → **REPOS**. Reprise quand ≥ 24 h sans fièvre ni antipyrétique ET symptômes résolus ; si sous le cou ≥ 2 j ou COVID : protocole par stades, total ≥ 10 j depuis le début (repos ≥ 5 j, léger ≥ 48 h, modéré ≥ 48 h) ; rechute de symptôme → stade précédent après 24 h sans symptôme.
- SINON SI symptômes au-dessus du cou seulement → **REMPLACER** par footing RPE ≤ 3, durée ≤ 50 % ; aucune séance dure ; COVID au-dessus du cou : total ≥ 5 j avant entraînement normal.
- SI maladie déclarée avec date de fin → statut maladie jusqu'à cette date + 1 jour de footing facile.

**Étape 3 — Douleur (échelle 0–10, pendant/après la dernière séance et le matin)**
- SI douleur pendant l'effort ≥ 5 OU douleur matinale > niveau de base de la veille OU douleur augmentant d'une semaine à l'autre → **ANNULER course** (cross-training sans douleur), réévaluer à J+1 ; SI persiste ≥ 3 j → orienter vers un professionnel ; SI persiste > 14 j malgré allègement → orientation obligatoire.
- SINON SI douleur 3–4 → **REMPLACER** séance dure par footing facile sur terrain souple, volume −30 % ; pas de pic de séance.
- SINON SI douleur 1–2 stable → **MAINTENIR** avec surveillance.
- Message « pas de fractionné aujourd'hui » → interdire toute séance dure à J (respect inconditionnel), proposer footing ou repos.

**Étape 4 — Reprise après arrêt** (jours sans course `n` ≥ 3)
- Appliquer le tableau §8.3 (plafonds de volume et d'intensité) pendant la durée indiquée.

**Étape 5 — Garde-fous de charge (s'appliquent à la séance prévue)**
- SI distance prévue > 1,10 × `long30` → **RÉDUIRE** la séance à 1,10 × `long30`.
- SI `vol7` prévu > 1,10 × `vol7_prec` → **ALLÉGER** les séances non prioritaires (§8.1, bas de liste d'abord) jusqu'à ≤ 1,10 (plafond doux).
- SI `vol14` prévu > 1,30 × `vol14_prec` → **ALLÉGER** obligatoirement (plafond dur).
- SI 3 semaines consécutives de charge croissante sans semaine allégée → semaine suivante −20 à −30 %.

**Étape 6 — État de récupération (compter les signaux négatifs `N`)**
Chaque condition vraie = +1 :
1. VFC : `lnRMSSD7` < borne basse SWC (si disponible).
2. VFC : `lnRMSSD7` > borne haute SWC **et** au moins un autre signal ci-dessous (si disponible).
3. `FCR7` > `FCR_ref` + max(5 bpm ; 2 ET).
4. Sommeil(J−1) < min(6 h ; `S_ref` − 1,5 h) **ou** moyenne 3 nuits < `S_ref` − 1 h.
5. Fatigue/forme subjective (1–5) ≤ 2.
6. Stress perçu ≥ 4 deux jours consécutifs, ou examen à J/J+1.
7. Dernière séance : RPE réel ≥ RPE cible + 2.
8. Courbatures (1–5) ≥ 4.

Décision pour une séance **dure** prévue :
- `N` = 0 → **MAINTENIR**.
- `N` = 1 → **MAINTENIR** si le signal est 7 ou 8 seul, sinon **DÉCALER** à J+1 si placement possible (étape 7), sinon **ALLÉGER**.
- `N` ≥ 2 OU signal 1 présent → **REMPLACER** par footing facile (RPE ≤ 3) ; reprise des séances dures quand `lnRMSSD7` revient à la moyenne de la SWC (si VFC) ou quand `N` = 0.
- `N` ≥ 4 → **REPOS** ou activité très légère au choix.
Décision pour une séance **facile** prévue :
- `N` ≤ 2 → **MAINTENIR** ; `N` = 3 → **ALLÉGER** −30 % ; `N` ≥ 4 → **REPOS** proposé.

**Étape 7 — Placement de la semaine (après tout décalage/annulation)**
- Interdire deux jours « durs » consécutifs (course ou muscu lourde jambes).
- ≥ 48 h entre deux séances dures de course.
- Séance clé ratée : la placer à la place de la séance de priorité la plus basse restante **si** étapes 5 et 7 respectées ; sinon la supprimer. Aucun rattrapage de volume.
- Muscu lourde jambes : jamais la veille d'une séance de priorité 1–2.

**Étape 8 — Après la séance (ajustements d'allure)**
- RPE réel − cible ≥ +2 sur 2 séances consécutives du même type → allures de ce type −2 à −3 %.
- RPE réel − cible ≤ −2 sur 3 séances du même type et `N` = 0 sur la période → allures +1 à 2 % (max une fois / 2 semaines).

**Étape 9 — Notification et réversibilité**
- Toute modification produit : action, règle déclenchée (identifiant), données utilisées, source. L'utilisatrice peut annuler une modification **sauf** celles des étapes 1, 2 (fièvre/sous le cou) et 3 (douleur ≥ 5) — pour celles-ci, l'app consigne le désaccord et informe des risques sans reprogrammer de séance dure.
- Le LLM peut : extraire une intention d'un message (maladie, douleur, date, contrainte), formuler les explications, proposer un choix entre options **déjà autorisées** par l'arbre. Il ne peut ni créer une séance hors des plafonds, ni baisser un niveau de restriction.

---

## 12. Questions ouvertes

1. **Disponibilité réelle des données** vivoactive 4 via l'API Garmin : VFC nocturne, FC repos, RPE/ressenti saisi sur la montre ? Conditionne l'activation du module VFC (§4.6).
2. **Validité de la VFC poignet Garmin** pour une règle SWC à 0,5 ET : l'erreur (MAPE ≈ 10 %, Dial 2025) est du même ordre que la SWC. Faut-il élargir la SWC (ex. 0,75–1 ET) pour les montres moins précises ? Aucune étude.
3. **Femmes et cycle menstruel** : VFC et FC repos varient selon la phase ; Kiviniemi 2010 ne montre pas de bénéfice chez les femmes. Faut-il une ligne de base par phase ? Données insuffisantes.
4. **Seuil exact du modèle de Silbernagel** (< 5 ou ≤ 5) : texte primaire non lu ; à vérifier sur l'article 2007 (et Silbernagel 2001).
5. **Frandsen 2025** : IC et ajustements non lus dans le texte intégral ; la règle s'applique-t-elle aux coureurs expérimentés autant qu'aux débutants, et aux séances de fractionné (distance faible, intensité forte) ?
6. **Charge muscu dans la sRPE** : un même total d'UA en muscu et en course n'a pas le même coût mécanique pour les tissus de la course ; faut-il deux compteurs séparés pour les garde-fous ? (Proposition : garde-fous de blessure course en **distance course** seulement ; sRPE totale pour la fatigue.)
7. **Pourcentages de reprise après arrêt** (§8.3) : aucune étude ; à valider avec un entraîneur et à ajuster sur les retours d'usage.
8. **Seuils sommeil/stress** : dérivés d'associations observationnelles (souvent adolescents ou sports collectifs) ; pas de seuil validé pour coureurs adultes loisir.
9. **Body Battery / Training Readiness** : aucune validation indépendante trouvée ; à surveiller dans la littérature.
10. **Détails IOC 2022 sur le retour au sport après infection** non lus ; à confronter aux règles de §9.
11. **Signaux de RED-S** et santé osseuse : à traiter dans un document dédié (nutrition/santé), avec un professionnel.
