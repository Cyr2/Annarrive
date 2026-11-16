# 04 — Musculation, placement dans l'agenda, spécificités des coureuses

Date de rédaction : 2026-11-16. Périmètre : règles déterministes et sourcées pour un moteur de placement, applicables à n'importe quel coureur. Le LLM ne fait que reformuler ou expliquer à l'intérieur de ces règles.

**Légende des niveaux de preuve**
- **MA** : méta-analyse ou revue systématique avec méta-analyse
- **RS** : revue systématique sans méta-analyse
- **ECR** : essai contrôlé (randomisé ou croisé)
- **OBS** : observationnel (y compris données de capteurs portés)
- **CONS** : consensus d'experts ou d'institution (CIO, etc.)
- **COACH** : pratique d'entraîneurs ou documentation produit
- **OPINION** : choix de conception de ce document, sans source directe

**Statut de vérification.** « Vérifié » veut dire que le résumé ou la notice bibliographique a été consulté (PubMed, PMC, Europe PMC, éditeur, dépôt institutionnel ou recherche web citant l'abstract). « Non vérifié » veut dire que la source est citée de seconde main et que je n'ai pas pu l'ouvrir. Les textes intégraux n'ont été lus que pour Blagrove 2018 (PMC) et Bruggisser 2023 (PMC).

---

## 1. Combiner course et musculation (entraînement concurrent)

### 1.1 L'effet d'interférence : ce qu'il touche, ce qu'il ne touche pas

| Constat | Source | Niveau |
|---|---|---|
| L'endurance ajoutée à la musculation réduit surtout les gains de **puissance** (ES ≈ 0,55 en concurrent contre 0,91 en musculation seule), un peu ceux de force et d'hypertrophie. L'interférence augmente avec la fréquence et la durée de l'endurance, et elle est plus marquée quand l'endurance est de la **course** plutôt que du vélo. | Wilson JM et al., 2012, *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises*, J Strength Cond Res 26(8):2293-2307. doi:10.1519/JSC.0b013e31823a3e2d. Chiffres vus sur des miroirs de l'abstract, texte intégral non lu. | MA |
| Revue des mécanismes : les voies AMPK et mTOR expliquent mal l'interférence observée chez l'humain. Les variables qui comptent sont l'ordre dans la séance, la récupération entre modalités, puis le volume et l'intensité de l'endurance. | Fyfe JJ, Bishop DJ, Stepto NK, 2014, *Interference between concurrent resistance and endurance exercise: molecular bases and the role of individual training variables*, Sports Med 44(6):743-762. https://doi.org/10.1007/s40279-014-0162-1 | Revue narrative (OPINION d'experts) |
| Mise à jour sur 43 études : pas d'interférence sur la force maximale (SMD −0,06) ni sur l'hypertrophie (−0,01). Les gains de **force explosive** sont réduits (−0,28), surtout quand les deux modalités sont faites **dans la même séance**. Ces résultats ne dépendent pas du niveau d'entraînement. | Schumann M et al., 2022, *Compatibility of concurrent aerobic and strength training for skeletal muscle size and function: an updated systematic review and meta-analysis*, Sports Med 52(3):601-612. https://pubmed.ncbi.nlm.nih.gov/34757594/ (SMD tirés de la prépublication SportRxiv) | MA |
| 59 études, 1 346 adultes. Chez les **femmes**, la force du bas du corps n'est **pas** freinée par l'entraînement concurrent (SMD +0,08), alors qu'elle l'est chez les hommes (−0,43 ; p = 0,03). Les sujets déjà entraînés en endurance ne voient pas leur gain de VO2max diminuer. | Huiberts RO, Wüst RCI, van der Zwaard S, 2024, *Concurrent Strength and Endurance Training: A Systematic Review and Meta-Analysis on the Impact of Sex and Training Status*, Sports Med 54(2):485-503. https://doi.org/10.1007/s40279-023-01943-9 | MA |

**Conséquence pour l'app.** Pour une coureuse, l'enjeu n'est pas que la course gêne ses gains en muscu : cet effet est faible, et quasi nul chez les femmes d'après Huiberts 2024. L'enjeu réel est que la **fatigue d'une muscu jambes dégrade la qualité des séances de course qui suivent**. C'est ce point qui doit piloter le placement (§1.2).

### 1.2 Effet d'une séance de muscu jambes sur les courses suivantes (délais)

| Constat | Source | Niveau |
|---|---|---|
| Une séance de musculation laisse une fatigue résiduelle qui dégrade les séances d'endurance des heures, voire des jours, suivants. Mécanismes proposés : recrutement neuromusculaire altéré, cinématique modifiée, coût énergétique accru, courbatures, glycogène bas. Les auteurs ne donnent **pas de délai universel**. | Doma K, Deakin GB, Bentley DJ, 2017, *Implications of Impaired Endurance Performance following Single Bouts of Resistance Training: An Alternate Concurrent Training Perspective*, Sports Med 47(11):2187-2200. https://pubmed.ncbi.nlm.nih.gov/28702901/ | Revue narrative |
| Coureurs entraînés (n = 12) : l'économie de course est **dégradée 6 h** après une séance de force et le coût de course reste augmenté **le lendemain**. | Doma K, Deakin GB, 2013, *The effects of combined strength and endurance training on running performance the following day*, Int J Sport Health Sci 11:1-9. https://www.jstage.jst.go.jp/article/ijshs/11/0/11_201230/_article | ECR (croisé, petit effectif) |
| Hommes non entraînés en musculation, 3 séances de 6RM jambes : la course sous-maximale est altérée à 24 h et 48 h. L'effet de répétition (*repeated bout effect*) protège à partir de la **3e séance**. Recommandation des auteurs : éviter la course sous-maximale **≥ 48 h** après la muscu tant que l'on n'a pas fait 3 séances, et prévoir **davantage** avant une course maximale. | Doma K, Schumann M, Leicht AS et al., 2017, *The repeated bout effect of traditional resistance exercises on running performance across three bouts*, Appl Physiol Nutr Metab 42(9). https://researchonline.jcu.edu.au/49494/ | ECR (petit effectif, non pratiquants de muscu) |
| Pas de différence d'économie de course à 6 h ni à 24-30 h après une muscu jambes. Cité de seconde main, **non vérifié**. | Doma K, Deakin GB, 2014 (cité par une revue secondaire) | ECR, non vérifié |
| 58 rugbymen amateurs, 7 semaines. Avec un délai de **0 h** entre force et aérobie, les gains de force sont moindres qu'avec 6 h ou 24 h. Le gain de VO2peak est meilleur avec **24 h** qu'avec 0 h ou 6 h. | Robineau J et al., 2016, *Specific Training Effects of Concurrent Aerobic and Strength Exercises Depend on Recovery Duration*, J Strength Cond Res 30(3):672-683. https://pubmed.ncbi.nlm.nih.gov/25546450/ | ECR (population non coureuse) |
| La plupart des études incluses plaçaient la muscu **un autre jour** que la course. La seule étude qui la plaçait juste après la course n'a pas trouvé de bénéfice et l'attribue à une fatigue résiduelle. La revue ne prescrit **ni ordre ni délai**. | Blagrove RC, Howatson G, Hayes PR, 2018, *Effects of Strength Training on the Physiological Determinants of Middle- and Long-Distance Running Performance: A Systematic Review*, Sports Med 48(5):1117-1149. https://pmc.ncbi.nlm.nih.gov/articles/PMC5889786/ (texte intégral lu) | RS |

**Divergence.** Doma 2013 trouve une altération à 6 h et le lendemain, Doma 2014 (non vérifié) n'en trouve pas à 6 h ni à 24-30 h. Doma 2017 recommande 48 h, mais chez des sujets **non habitués** à la muscu.

**Choix par défaut**
- **≥ 24 h** entre la fin d'une muscu jambes ou complète et le début d'une séance de qualité ou d'une sortie longue : **contrainte dure**.
- Entre **24 et 48 h** : **pénalité souple**. Elle est plus forte pendant les 3 premières semaines où la coureuse fait de la muscu jambes, puis diminue (effet de répétition, Doma 2017).
- Justification : la seule preuve chez des coureurs entraînés (Doma 2013) montre un effet à 6 h et le lendemain. Robineau 2016 favorise 24 h. Imposer 48 h en dur rendrait souvent la semaine infaisable avec 3-4 séances de muscu et 3-4 courses.

### 1.3 Ordre dans une même journée

| Constat | Source | Niveau |
|---|---|---|
| Faire la musculation **avant** l'endurance améliore la force dynamique du bas du corps (+6,9 %) par rapport à l'ordre inverse. Aucun effet de l'ordre sur l'hypertrophie ni sur la VO2max. | Eddens L, van Someren K, Howatson G, 2018, *The Role of Intra-Session Exercise Sequence in the Interference Effect: A Systematic Review with Meta-Analysis*, Sports Med 48(1):177-188. https://pmc.ncbi.nlm.nih.gov/articles/PMC5752732/ | MA |
| Même résultat : +3,96 kg de 1RM jambes si la force passe en premier, aucun effet de l'ordre sur la VO2max (+0,39 ml/kg/min, IC incluant 0). | Murlasits Z, Kneffel Z, Thalib L, 2018, *The physiological effects of concurrent strength and endurance training sequence: A systematic review and meta-analysis*, J Sports Sci 36(11):1212-1219. doi:10.1080/02640414.2017.1364405 | MA |

**Divergence.** Ces méta-analyses optimisent la **force**. Pour une coureuse dont l'objectif est la course, faire les jambes en premier dégrade la séance de course qui suit (Doma 2013). La VO2max n'est pas affectée par l'ordre.

**Choix par défaut.** Si une course de qualité et une muscu jambes tombent le même jour : **course d'abord, muscu ensuite**, avec idéalement **≥ 6 h** d'écart (Robineau 2016 : 6 h vaut mieux que 0 h pour la force). Une course de qualité **après** les jambes le même jour est interdite par la règle des 24 h. Un footing facile avant ou après les jambes est toléré, avec une pénalité si l'écart est inférieur à 6 h.

Placer les séances dures le même jour que la muscu (« hard days hard », pour garder les autres jours vraiment faciles) relève de la pratique d'entraîneurs. Rønnestad & Mujika 2014 sont souvent cités sur ce point, mais je n'ai pas pu vérifier leur recommandation de planification : **non vérifié**. Rønnestad BR, Mujika I, 2014, *Optimizing strength training for running and cycling endurance performance: A review*, Scand J Med Sci Sports 24(4):603-612. https://pubmed.ncbi.nlm.nih.gov/23914932/

### 1.4 La muscu améliore l'économie de course (pourquoi l'app doit la protéger, pas la décourager)

| Constat | Source | Niveau |
|---|---|---|
| Un mésocycle de force améliore la performance en demi-fond et en fond (SMD 0,52), l'économie (0,65), la force maximale (0,99) et la puissance (0,50). La force maximale (charges lourdes) donne les meilleurs résultats. Le bénéfice ne dépend pas du niveau. | Berryman N et al., 2018, *Strength Training for Middle- and Long-Distance Performance: A Meta-Analysis*, Int J Sports Physiol Perform 13(1):57-63. https://pubmed.ncbi.nlm.nih.gov/28459360/ | MA |
| Économie de course améliorée d'environ **2 à 8 %**, ainsi que les contre-la-montre de 1,5 à 10 km. VO2max inchangée, composition corporelle non dégradée. Recommandation : **2 à 3 séances de force par semaine**. | Blagrove 2018 (cf. §1.2) | RS |
| Les charges lourdes (effet faible) et les méthodes combinées (effet modéré) améliorent l'économie. La pliométrie l'améliore aux vitesses ≤ 12 km/h. Pas d'effet des charges sous-maximales ni de l'isométrie. Certitude des preuves modérée, faible pour les méthodes combinées. | Llanos-Lagos C et al., 2024, *Effect of Strength Training Programs in Middle- and Long-Distance Runners' Economy at Different Running Speeds: A Systematic Review with Meta-analysis*, Sports Med 54(4):895-932. https://doi.org/10.1007/s40279-023-01978-y | MA |

**Conséquence.** L'app ne doit jamais pousser à supprimer la muscu jambes pour « faire de la place ». C'est la course qui s'adapte aux blocs muscu posés par l'utilisatrice, jamais l'inverse.

### 1.5 Classer un bloc muscu à partir de son seul nom

Aucune source ne traite ce sujet : c'est un **choix de conception (OPINION)** fondé sur §1.2 à §1.4. Le principe est d'être conservateur : en cas de doute, on suppose une séance jambes **lourde**.

| Classe | Mots-clés (FR/EN, insensibles à la casse et aux accents) | Effet sur le placement |
|---|---|---|
| `JAMBES` | jambe, legs, lower, bas du corps, squat, deadlift, soulevé, SDT, fessier, glute, cuisse, quadri, ischio, hamstring, mollet, calf, fente, lunge, pliométrie, plyo, saut, jump, hip thrust | Règles des 24 h (dure) et des 24-48 h (souple) avant une séance de qualité ou une sortie longue |
| `COMPLET` | full, complet, total, full body, circuit, crossfit, hyrox, cross-training, functional | Traité comme `JAMBES` |
| `HAUT` | haut, upper, push, pull, pec, chest, dos, back, bras, arm, épaule, shoulder, biceps, triceps, tirage | Aucune contrainte dure. Pénalité légère si < 3 h avant une séance de qualité (OPINION) |
| `GAINAGE` | gainage, core, abdo, abs, pilates, mobilité, mobility, yoga, étirement, stretch, PPG légère | Aucune contrainte |
| `INCONNU` | aucun mot-clé reconnu | Traité comme `JAMBES`, et l'app demande une seule fois de confirmer la classe |

Règles de résolution :
1. Si un nom contient à la fois des mots-clés `JAMBES` et `HAUT` (par exemple « push + jambes »), `JAMBES` l'emporte.
2. La classe confirmée par l'utilisatrice est **mémorisée par nom de bloc** et prime sur le lexique.
3. L'intensité est inconnue. On suppose « lourde ». Une option permet à l'utilisatrice de marquer un bloc comme « léger », ce qui ramène la règle dure à 12 h (OPINION).

---

## 2. Placement automatique dans l'agenda

### 2.1 Ce que font les autres applications (pratique observée, niveau COACH)

| App | Mécanisme documenté | Source |
|---|---|---|
| **Runna** | L'onboarding demande le niveau, le nombre de courses par semaine, les jours disponibles et le jour préféré de la sortie longue. Le moteur répartit les séances dans la semaine. **Une seule course planifiée par jour**, mais une séance de force, yoga ou Pilates peut partager ce jour. Déplacement manuel séance par séance, limité à ±1 semaine. Un **avertissement** s'affiche si un changement peut nuire à l'entraînement, et c'est l'utilisatrice qui décide. Aucune règle publique sur l'espacement force/sortie longue. | https://intercom.help/runna/en/articles/10137793-how-to-use-and-manage-your-training-calendar (vérifié) |
| **TrainAsONE** | Disponibilités définies par jour. Le système est pondéré pour **utiliser** les jours disponibles. Un jour rendu indisponible régénère le plan. On ne déplace pas une séance par glisser-déposer : une séance faite un autre jour est réanalysée et le plan futur est recalculé. | https://taow.trainasone.com/faqs/2022/how-do-i-tell-trainasone-that-i-cannot-run-on-a-specific-day ; https://taow.trainasone.com/faqs/2022/can-i-move-a-scheduled-workout-to-another-day (vérifiés via recherche) |
| **Garmin Coach** | L'utilisatrice choisit ses jours d'entraînement et de repos. Le plan ne propose jamais de courir un jour exclu. Les séances s'adaptent à la performance. Des séances de force complémentaires sont possibles avec Run Coach. Granularité au **jour**, pas à l'heure. | https://connect.garmin.com/features/coach ; the5krunner 2018 (vérifiés via recherche) |
| **Reclaim.ai** | Les « Habits » ont une durée, des jours et horaires idéaux, une **priorité** et un niveau de défense (*Free/Busy*, de « plus flexible » à « plus défensif »). En cas de conflit, les blocs flexibles se déplacent **par ordre de priorité**. L'algorithme exact n'est pas publié. | https://help.reclaim.ai/en/articles/6332766-how-to-use-reclaim-habits-to-create-focus-time (vérifié via recherche) |
| **Motion** | Classement combiné priorité, échéance et durée, sans règle linéaire unique. Les événements des calendriers connectés **priment toujours** sur les tâches. Une tâche en retard passe au prochain créneau libre. Formule exacte non publiée. | https://www.usemotion.com/help/time-management/auto-scheduling/reference-auto-scheduling/how-auto-scheduling-works-behind-the-scenes (vérifié via recherche) |

**Bilan.** Les apps de course raisonnent au **jour**, les apps d'agenda à l'**heure** mais sans physiologie. Aucune ne publie ses poids. La combinaison proposée ici (heure + règles physiologiques + poids explicites) n'a pas d'équivalent documenté.

### 2.2 Formulation : satisfaction de contraintes avec pénalités

- **Variables** : pour chaque course de la semaine, le couple (jour, heure de début). La durée et le type viennent du plan d'entraînement, qui est un autre module.
- **Types de séances** : `Q` = qualité (fractionné, seuil, tempo) ; `L` = sortie longue ; `E` = footing facile ou récupération. « Dur » = `Q` ou `L`.
- **Événements fixes** : cours importés de l'ICS, blocs de révision, blocs muscu (avec leur classe §1.5), examens, sommeil habituel, et tout ce que l'utilisatrice a **épinglé** ou **déplacé à la main**.
- **Objectif lexicographique** :
  1. respecter toutes les contraintes dures ;
  2. minimiser la somme pondérée des contraintes souples ;
  3. départager par l'heure de début la plus proche de l'heure préférée, puis par le jour le plus tôt. Ce départage garantit un résultat **déterministe**.
- **Replanification** : c'est un *minimal perturbation problem*. On cherche une solution proche de la précédente quand le problème change. Barták R, Müller T, Rudová H, *A New Approach to Modeling and Solving Minimal Perturbation Problems*, Recent Advances in Constraints, Springer LNCS, 2004 ; Müller T, Rudová H, Barták R, *Minimal Perturbation Problem in Course Timetabling*, PATAT V, LNCS, 2005. https://doi.org/10.1007/11593577_8 (notices vérifiées, texte intégral non lu). Niveau : littérature d'optimisation (méthode, pas physiologie).

### 2.3 Heure de la journée, sommeil, examens

| Constat | Source | Niveau |
|---|---|---|
| 23 études. L'exercice du soir **ne dégrade pas** le sommeil, et augmente même légèrement le sommeil lent profond. **Exception** : un exercice **vigoureux terminé ≤ 1 h avant le coucher** peut retarder l'endormissement et réduire la durée et l'efficacité du sommeil. L'auteur reconnaît que cette observation repose sur une seule étude. | Stutz J, Eiholzer R, Spengler CM, 2019, *Effects of Evening Exercise on Sleep in Healthy Participants: A Systematic Review and Meta-Analysis*, Sports Med 49(2). https://doi.org/10.1007/s40279-018-1015-0 | MA (sous-groupe : 1 étude) |
| Environ 14 700 personnes, environ 4 millions de nuits mesurées par capteur. Un exercice **terminé ≥ 4 h avant l'endormissement** n'est pas associé à une modification du sommeil, quelle que soit la charge. Plus il finit tard et plus la charge est élevée, plus l'endormissement est tardif, le sommeil court et la fréquence cardiaque nocturne élevée (variabilité cardiaque plus basse). | Leota J et al., 2025, Nature Communications 16. https://doi.org/10.1038/s41467-025-58271-x (abstract vérifié) | OBS |
| 31 études. Performance d'endurance **meilleure l'après-midi ou le soir** que le matin (g = −0,65). La fréquence cardiaque à l'effort est plus élevée le soir, ce qui compte si l'on pilote les séances à la FC. | Kang J et al., 2023, *Time-of-Day Effects of Exercise on Cardiorespiratory Responses and Endurance Performance: A Systematic Review and Meta-Analysis*, J Strength Cond Res. doi:10.1519/JSC.0000000000004497 | MA |
| Pour les **adaptations** à l'entraînement, aucune preuve en faveur ou en défaveur d'un horaire. Effet un peu plus grand quand l'entraînement et le test ont lieu à la **même heure**. | Bruggisser F, Knaier R et al., 2023, *Best Time of Day for Strength and Endurance Training to Improve Health and Performance? A Systematic Review with Meta-analysis*, Sports Med Open. https://doi.org/10.1186/s40798-023-00577-5 (texte lu) | MA |
| Une perte aiguë de sommeil (≤ 6 h sur 24 h) dégrade la performance physique, y compris en endurance. L'effet est plus net quand l'exercice a lieu le soir. Les méta-analyses divergent sur la relation dose-effet. | Craven J et al., 2022, *Effects of Acute Sleep Loss on Physical Performance: A Systematic and Meta-Analytical Review*, Sports Med. doi:10.1007/s40279-022-01706-y (vérifié via résumés secondaires) | MA |

**Divergence.** Stutz 2019 fixe la limite à 1 h, Leota 2025 à 4 h. Ce sont des niveaux de preuve différents : un essai sur une seule étude d'un côté, une très grande base observationnelle de l'autre.

**Choix par défaut**
- Fin de toute course **≥ 1 h** avant le coucher habituel : **dure**.
- Fin d'une séance `Q` ou `L` **≥ 4 h** avant le coucher : **souple, poids fort**.
- Aucune préférence horaire imposée par la physiologie. Kang 2023 favorise légèrement le soir pour la performance, mais Bruggisser 2023 ne trouve aucun horaire optimal pour les adaptations. C'est la préférence de l'utilisatrice qui décide, avec une prime à la **régularité** et un horaire proche de celui de la course visée.

**Examens.** Aucune étude ne traite « courir la veille d'un examen ». La règle s'appuie par analogie sur le sommeil (Leota 2025, Craven 2022) : **OPINION**. Pas de `Q` ni de `L` dont la fin tombe moins de 4 h avant le coucher la veille d'un examen. Un `E` placé le matin ou le midi reste encouragé.

---

## 3. Spécificités des coureuses (module **optionnel**, avec consentement explicite)

### 3.1 Cycle menstruel et performance : preuves faibles

| Constat | Source | Niveau |
|---|---|---|
| 78 études. La performance serait **trivialement** réduite en phase folliculaire précoce (ES0,5 = −0,06 ; IC crédible de −0,16 à 0,04). Forte variance entre études, **qualité des preuves « faible »**. Les auteurs recommandent une approche **individualisée**, pas de règle de groupe. | McNulty KL et al., 2020, *The Effects of Menstrual Cycle Phase on Exercise Performance in Eumenorrheic Women: A Systematic Review and Meta-Analysis*, Sports Med 50(10):1813-1827. https://doi.org/10.1007/s40279-020-01319-3 | MA (preuves de faible qualité) |
| Revue « parapluie » de 5 revues : la phase du cycle n'a **pas d'influence** démontrée sur la force aiguë ni sur les adaptations à la musculation. Aucune base pour une prescription systématique par phase. | Colenso-Semple LM et al., 2023, *Current evidence shows no influence of women's menstrual cycle phase on acute strength performance or adaptations to resistance exercise training*, Front Sports Act Living 5:1054542. https://doi.org/10.3389/fspor.2023.1054542 | Revue parapluie |
| 22 études : la phase folliculaire précoce serait défavorable à la force maximale, avec un pic de force isométrique en folliculaire tardive. **Diverge** de Colenso-Semple. | Niering M et al., 2024, *The Influence of Menstrual Cycle Phases on Maximal Strength Performance in Healthy Female Adults: A Systematic Review with Meta-Analysis*, Sports (MDPI). https://pmc.ncbi.nlm.nih.gov/articles/PMC10818650/ (volume non vérifié) | MA |
| Standards méthodologiques : la plupart des études ne vérifient pas les phases par dosage hormonal, ce qui explique en partie la faiblesse des preuves. | Elliott-Sale KJ et al., 2021, *Methodological Considerations for Studies in Sport and Exercise Science with Women as Participants: A Working Guide for Standards of Practice for Research on Women*, Sports Med 51(5):843-861. https://pmc.ncbi.nlm.nih.gov/articles/PMC8053180 | CONS (méthodologie) |
| Enquête auprès de 6 812 femmes (recrutées via Strava) : symptômes très fréquents (humeur 91 %, fatigue 86 %, crampes 84 %). L'indice de symptômes est associé au fait de manquer ou modifier un entraînement. **Conflit d'intérêts** : plusieurs auteurs sont liés à l'app FitrWoman. | Bruinvels G et al., 2021, étude des symptômes du cycle chez 6 812 femmes recrutées via Strava (titre exact non vérifié), Br J Sports Med 55(8):438-443. https://research.stmarys.ac.uk/id/eprint/4379/ | OBS (transversal) |

**Choix par défaut.** **Aucune périodisation automatique par phase.** Les preuves sont faibles, les effets triviaux et les sources divergentes. Ce qui est défendable, c'est un ajustement **piloté par les symptômes du jour** : l'utilisatrice signale « règles douloureuses » ou « fatigue », et l'app **propose** d'échanger la séance `Q` du jour avec un `E` de la semaine. Elle ne l'impose jamais. Après **≥ 3 cycles** enregistrés, l'app peut montrer à l'utilisatrice ses propres régularités (par exemple « tes séances `Q` des jours 1-2 sont plus souvent écourtées »), sans en tirer de règle.

### 3.2 Contraception hormonale

| Constat | Source | Niveau |
|---|---|---|
| 42 études, 590 participantes. Les utilisatrices de pilule auraient une performance **légèrement inférieure** en moyenne, mais l'effet est probablement **trivial** à l'échelle du groupe. Pas de différence entre semaine de prise et semaine d'arrêt. 83 % des études sont de qualité modérée à très faible. Les preuves ne justifient **aucune recommandation générale**. | Elliott-Sale KJ et al., 2020, *The Effects of Oral Contraceptives on Exercise Performance in Women: A Systematic Review and Meta-analysis*, Sports Med 50(10):1785-1812. https://doi.org/10.1007/s40279-020-01317-5 | MA |

**Actionnable.** On demande le type de contraception, **uniquement pour interpréter** les données de saignement : sous contraception hormonale combinée, les saignements de privation ne reflètent pas le cycle naturel (§3.3). L'app **ne recommande jamais** de commencer, d'arrêter ou de changer de contraception.

### 3.3 REDs / disponibilité énergétique

| Constat | Source | Niveau |
|---|---|---|
| Le REDs est un syndrome d'effets délétères sur la santé et la performance causé par une **faible disponibilité énergétique (LEA)**. La LEA va d'un état **adaptatif** à un état **problématique**. Ajouts de 2023 : rôle de la faible disponibilité en glucides, santé mentale, athlètes masculins. Introduction de l'outil clinique **IOC REDs CAT2**. Prévalence estimée de 15 à 80 % selon le sport. | Mountjoy M et al., 2023, *2023 International Olympic Committee's (IOC) consensus statement on Relative Energy Deficiency in Sport (REDs)*, Br J Sports Med 57(17):1073-1098. https://doi.org/10.1136/bjsports-2023-106994 (abstract vérifié, texte intégral inaccessible, erreur 403) | CONS |
| CAT2 : processus en 3 étapes (dépistage, stratification par indicateurs primaires et secondaires, **diagnostic médical**). D'après une source secondaire, l'**aménorrhée secondaire** et un faible taux d'hormones sexuelles font partie des indicateurs primaires. La **contraception hormonale empêche d'évaluer** le statut menstruel. | Stellingwerff T et al., 2023, article présentant l'IOC REDs CAT2, Br J Sports Med 57(17):1109-1118 (titre exact non vérifié). Grille détaillée des indicateurs **non vérifiée** dans le texte original. | CONS |
| Le seuil de 30 kcal/kg de masse maigre par jour vient des travaux antérieurs (2014/2018). D'après des sources secondaires, le consensus 2023 n'en fait pas un seuil universel. **Non vérifié** dans le texte 2023. | Mountjoy 2018 / 2023 | CONS, non vérifié |
| Guide du sous-groupe du CIO sur la composition corporelle : traiter ces données de façon **confidentielle**, avec une approche centrée sur la santé et une équipe pluridisciplinaire, pour limiter les troubles alimentaires. | Sous-groupe du consensus CIO REDs, 2023, Br J Sports Med 57(17) (premier auteur non vérifié). https://doi.org/10.1136/bjsports-2023-106812 (abstract vérifié) | CONS |

**Actionnable**
- L'app **ne peut pas calculer** la disponibilité énergétique : il faudrait les apports, la dépense et la masse maigre. Elle ne doit pas prétendre le faire.
- Elle peut repérer des **signaux d'alerte non diagnostiques**, uniquement si les données correspondantes ont été consenties :
  - absence de règles ≥ 90 jours chez une utilisatrice sans contraception hormonale (définition clinique usuelle de l'aménorrhée secondaire ; seuil retenu ici, à valider par un médecin) ;
  - fracture de fatigue déclarée ;
  - performance en baisse avec fatigue persistante malgré une charge stable.
- Réponse à ces signaux : un message neutre qui oriente vers un médecin ou une diététicienne du sport, et **gel de toute progression de charge** jusqu'à ce que l'utilisatrice le lève (OPINION).
- **Interdits** :
  - objectifs de poids, affichage du poids à côté de la performance ;
  - conseils caloriques ;
  - classement des séances par calories brûlées ;
  - toute formulation qui valorise la minceur.

### 3.4 Fer et ferritine

| Constat | Source | Niveau |
|---|---|---|
| Stades de carence : ferritine **< 35 µg/L** = déplétion (stade 1) ; < 20 µg/L avec saturation de la transferrine < 16 % = érythropoïèse déficiente en fer ; < 12 µg/L avec hémoglobine basse = anémie. L'hepcidine atteint son **pic 3-6 h après l'effort** et limite alors l'absorption intestinale. | Sim M et al., 2019, *Iron considerations for the athlete: a narrative review*, Eur J Appl Physiol 119:1463-1478 (manuscrit auteur via ACU, vérifié via recherche) | Revue narrative |
| Divergence sur les seuils : certaines sources jugent 35-50 µg/L « sous-optimal » et associent 50 µg/L au seuil d'hepcidine en dessous duquel l'absorption augmente. D'autres retiennent > 30 µg/L. | Revues 2022-2024 citées dans la recherche, dont https://doi.org/10.3389/fspor.2022.903937 | Revues narratives |
| Chez des femmes avec réserves basses, prendre le fer **un jour sur deux** donne une meilleure absorption fractionnelle qu'une prise quotidienne (≈ 22 % contre 16 %). | Stoffel NU et al., 2017, Lancet Haematol (vérifié via résumés secondaires ; volume et pages non vérifiés) | ECR |
| Coureurs entraînés (10 hommes, 6 femmes, ferritine < 50) : absorption du fer **plus élevée au petit-déjeuner suivant une course matinale** qu'au repos ou qu'au dîner. | McCormick R et al., 2019, *The Impact of Morning versus Afternoon Exercise on Iron Absorption in Athletes*, Med Sci Sports Exerc 51(10):2147-2155. https://pubmed.ncbi.nlm.nih.gov/31058762/ | ECR (croisé, petit effectif) |

**Choix par défaut.** Retenir **35 µg/L** comme seuil d'alerte (Sim 2019, la source la plus citée), en signalant que certains praticiens visent 50 µg/L.

**Actionnable**
- Champ facultatif « ferritine + date du dosage ». Sous 35 µg/L, message « à discuter avec ton médecin » et rappel de recontrôle après 8 à 12 semaines (OPINION).
- Rubrique d'information éducative et sourcée (un jour sur deux, matin après la course), **pas de posologie** : ce sont des décisions médicales.
- **Non actionnable** : diagnostic d'anémie, prescription de suppléments.

### 3.5 Éthique, consentement, données

- Le cycle, la contraception, la ferritine et les blessures sont des **données de santé**, une catégorie particulière au sens de l'art. 9 du RGPD. Il faut un **consentement explicite et distinct par catégorie**, révocable, avec suppression effective. Règlement (UE) 2016/679, art. 9 : https://eur-lex.europa.eu/eli/reg/2016/679/oj (référence juridique, à valider par un juriste).
- Ces données ne sont jamais utilisées pour la publicité, le profilage ou un partage tiers. Minimisation : ne stocker que ce qui sert une règle de ce document.
- Le LLM peut **expliquer** une règle ou un message. Il ne peut ni **diagnostiquer**, ni conseiller médicaments, contraception ou apports caloriques, ni modifier une règle.
- Tout message santé indique sa source et son niveau de preuve, et précise : « ceci n'est pas un avis médical ».

---

## Règles prêtes pour l'algo

Notation :
- `fin(x)` / `début(x)` : heure de fin et de début d'un événement.
- `coucher` : heure de coucher habituelle déclarée à l'onboarding.
- Dur = `Q` ou `L`.
- `MJ` = muscu `JAMBES`, `COMPLET` ou `INCONNU`.
- Une course **épinglée** ou **déplacée à la main** est une donnée fixe, jamais déplacée automatiquement. Si elle viole une règle dure, l'app **avertit sans bloquer**, comme Runna.

### Contraintes dures (H)

| Id | Règle | Paramètres par défaut | Source / niveau |
|---|---|---|---|
| H1 | Pas de chevauchement avec un cours, une révision, une muscu, un examen ou un événement ICS, **tampons compris** | Tampon avant course = trajet (onboarding, 0 si départ du domicile) ; tampon après course = 30 min (douche, repas) ; si l'événement suivant est sur le campus, ajouter le trajet campus | OPINION (paramètres d'onboarding) |
| H2 | Respect des règles d'onboarding | `heure_min_début` (ex. 07:00), `heure_max_fin`, jours interdits | Choix de l'utilisatrice |
| H3 | Au plus 1 course par jour | — | COACH (Runna) |
| H4 | Pas deux séances dures des jours calendaires consécutifs | Écart ≥ 1 jour plein entre deux `Q`/`L` | COACH (principe dur/facile ; Seiler 2010, IJSPP 5(3):276-291, https://pubmed.ncbi.nlm.nih.gov/20861519/, revue descriptive) — **relâchable** (voir R1) |
| H5 | `MJ` → séance dure : `début(dur) − fin(MJ) ≥ 24 h` | 24 h (12 h si bloc marqué « léger ») | Doma 2013 (ECR), Robineau 2016 (ECR) |
| H6 | Séance dure et `MJ` le même jour : la course **précède** la muscu | Écart ≥ 1 h (logistique) | Doma 2013 ; MA Eddens/Murlasits (l'ordre n'affecte pas la VO2max) |
| H7 | Toute course se termine ≥ 1 h avant le coucher | 1 h | Stutz 2019 (MA, sous-groupe d'une étude) |
| H8 | Sortie longue = un seul bloc continu ; jamais découpée | — | OPINION |

### Contraintes souples (S), pénalités en points

| Id | Règle | Pénalité | Source / niveau |
|---|---|---|---|
| S1 | Séance dure terminée < 4 h avant le coucher | 30 | Leota 2025 (OBS) |
| S2 | `MJ` → séance dure avec un écart entre 24 et 48 h | 40 × (48 − écart)/24 ; ×0,5 après ≥ 3 semaines de muscu jambes régulière | Doma 2017 (ECR, effet de répétition) |
| S3 | `MJ` → `E` avec un écart < 6 h | 15 | Doma 2013 (ECR) |
| S4 | Séance dure suivie d'une `MJ` le même jour avec un écart < 6 h | 10 | Robineau 2016 (ECR) |
| S5 | Séance dure la veille d'un examen et terminée < 4 h avant le coucher | 50 | OPINION (par analogie avec Leota 2025 et Craven 2022) |
| S6 | Course pendant les 3 h qui précèdent le début d'un examen | 40 | OPINION |
| S7 | Écart à la plage horaire préférée | 5 par heure, plafonné à 20 | Préférence de l'utilisatrice |
| S8 | Sortie longue hors du jour préféré | 20 | COACH (Runna) |
| S9 | Irrégularité : jour ou heure différents de la même séance la semaine précédente | 5 par séance (heure : écart > 2 h) | Bruggisser 2023 (MA, « même heure ») ; OPINION |
| S10 | Plus de 2 jours consécutifs sans course (si ≥ 3 courses dans la semaine) | 10 | OPINION |
| S11 | Muscu `HAUT` dans les 3 h qui précèdent une séance dure | 5 | OPINION |
| S12 | Deux séances dures séparées de moins de 48 h (H4 respectée mais écart serré) | 10 | COACH |

### Replanification minimale (quand un événement bouge)

1. **Périmètre** : ne recalculer que la semaine en cours et la suivante. Les séances déjà réalisées, épinglées ou déplacées à la main restent fixes.
2. **Gel** : une séance qui commence dans les **12 h** n'est jamais déplacée automatiquement. L'app propose le changement et attend l'accord de l'utilisatrice (OPINION).
3. **Coût de perturbation**, ajouté à l'objectif et évalué **avant** les pénalités souples (ordre lexicographique) :
   1. nombre de séances déplacées (minimiser) ;
   2. nombre de séances qui changent de jour ;
   3. somme des décalages en heures.
   Une solution qui bouge 1 séance l'emporte toujours sur une solution qui en bouge 2, même avec plus de pénalités souples, **sauf** si cela fait gagner ≥ 50 points de pénalité (OPINION, seuil réglable).
4. **Ordre d'essai** : d'abord un autre créneau **le même jour**, puis un **échange** avec une autre course de la semaine, puis un **autre jour**.
5. **R1, si c'est infaisable** : relâcher dans cet ordre.
   - (a) H4 devient souple (pénalité 100) ;
   - (b) raccourcir un `E` jusqu'à −30 % ;
   - (c) supprimer un `E` ;
   - (d) dégrader une `Q` en `E`.
   - Ne jamais supprimer la sortie longue ni la dernière `Q` de la semaine sans en informer explicitement l'utilisatrice.
   - Ne **jamais** déplacer ni supprimer un bloc muscu, une révision ou un cours.
6. **Déterminisme** : à égalité de coût, choisir le créneau le plus tôt, puis l'identifiant de séance le plus petit.

### Module coureuse (consentement explicite, désactivé par défaut)

| Id | Règle | Paramètres | Source / niveau |
|---|---|---|---|
| F1 | Aucune modification du plan selon la phase du cycle | — | McNulty 2020, Colenso-Semple 2023 (preuves faibles) |
| F2 | Symptômes déclarés le jour même → **proposer** d'échanger la `Q` du jour avec un `E` de la semaine (H/S réévaluées) | Déclenché par un signalement manuel | Bruinvels 2021 (OBS) ; OPINION |
| F3 | Absence de règles ≥ 90 jours, sans contraception hormonale → message d'orientation médicale + gel de la progression de charge | 90 jours | IOC REDs 2023 / CAT2 (CONS) |
| F4 | Sous contraception hormonale, aucune déduction tirée des saignements | — | CAT2 (CONS) ; Elliott-Sale 2020 |
| F5 | Ferritine déclarée < 35 µg/L → message « à discuter avec ton médecin » + rappel de recontrôle | 35 µg/L ; rappel à 10 semaines | Sim 2019 (revue) |
| F6 | Jamais de poids, de calories ni de composition corporelle affichés ou exploités | — | IOC 2023 sous-groupe composition corporelle (CONS) |

---

## Questions ouvertes

1. **Délai muscu jambes → course dure chez des coureuses entraînées et pratiquantes de muscu** : les données de délai (Doma) viennent surtout d'**hommes non pratiquants**. Le 24 h dur + 24-48 h souple est un compromis à valider, idéalement par les données de l'app (allure et FC des `Q` en fonction de l'écart avec la dernière `MJ`).
2. **Intensité réelle des blocs muscu** : le nom ne dit rien de la charge. Faut-il demander un RPE après la séance pour moduler H5 et S2 ?
3. **Muscu dans les 7-10 jours avant une course** : réduire ou supprimer les jambes lourdes ? Rønnestad & Mujika 2014 évoquent un maintien, mais c'est **non vérifié**. À traiter avec le module d'affûtage.
4. **Doubles séances** (course + course le même jour) : exclues ici (H3). À revoir si l'app vise des coureurs avancés.
5. **Examens** : aucune source directe sur l'exercice la veille ou le jour d'un examen. S5 et S6 sont des opinions. Faut-il plutôt *favoriser* un `E` court avant une révision (effets cognitifs aigus de l'exercice, non étudiés ici) ?
6. **Poids des contraintes souples** : choisis à la main. Ils doivent être calibrés avec des cas tests (semaines réelles de l'utilisatrice) et rendus visibles dans l'interface (« pourquoi ce créneau ? »).
7. **Seuil de ferritine** (35 contre 50 µg/L) et **seuils REDs** : à faire valider par un médecin du sport avant mise en production. Le texte intégral du consensus CIO 2023 et du CAT2 reste à lire (accès 403).
8. **Apprentissage individuel du cycle (F2 après ≥ 3 cycles)** : quel critère statistique minimal pour montrer une régularité sans sur-interpréter du bruit ?
9. **Chronotype** : Kang 2023 favorise le soir, mais la variabilité individuelle n'est pas couverte ici. Faut-il un questionnaire de chronotype à l'onboarding ?
10. **Cadre réglementaire** : à partir de quelle fonctionnalité (alerte ferritine, dépistage REDs) l'app pourrait-elle relever du statut de dispositif médical (règlement UE 2017/745) ? À vérifier juridiquement.
