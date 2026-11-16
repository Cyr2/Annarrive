# 01 — Estimation de la forme et calcul des allures / zones

Périmètre : estimer la forme d'un coureur, puis en tirer des allures et des zones FC ; recalibrer le tout dans le temps. Ce document ne contient aucune valeur propre à l'utilisatrice : chaque paramètre est une fonction de données mesurées.

**Niveaux de preuve utilisés** : `MA` méta-analyse / revue systématique · `EC` essai contrôlé ou étude de validation en laboratoire · `OBS` observationnel (bases de courses, cohortes) · `CE` consensus d'entraîneurs / livre de référence · `OP` opinion ou choix de conception (le nôtre ou celui d'un auteur isolé).
**Statut de vérification** : `[vérifié]` = source primaire ou résumé PubMed/PMC ouvert pendant cette recherche · `[secondaire]` = vu seulement via une source secondaire fiable · `[non vérifié]` = cité de mémoire, à contrôler avant implémentation.

---

## 1. Modèles d'estimation de la forme à partir d'un chrono

### 1.1 VDOT (Daniels & Gilbert)

**Source** : Daniels J, Gilbert J. *Oxygen Power: Performance Tables for Distance Runners*, 1979 (auto-édité) ; repris dans Daniels J. *Daniels' Running Formula*, Human Kinetics, 3e éd. 2014 / 4e éd. 2021. `CE` (équations ajustées sur des données de laboratoire et de courses d'athlètes entraînés, méthode d'ajustement non publiée dans une revue à comité de lecture). Équations `[secondaire]` : retrouvées à l'identique dans plusieurs implémentations publiques (ex. https://notes.billmill.org/fitness/calculating_v02_max.html, https://rundida.com/tools/vo2max-calculator/) et recoupées par un calcul de contrôle ; livre non ouvert.

Variables : `v` vitesse en m/min, `t` durée de course en min.

1. **Coût en O2 de la course à vitesse v** (ml·kg⁻¹·min⁻¹) :
   `VO2(v) = −4.60 + 0.182258·v + 0.000104·v²`
2. **Fraction de VO2max tenable pendant t** :
   `F(t) = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)`
   (attention : certaines sources omettent le 2e terme exponentiel, ce qui surestime F pour les durées courtes ; garder les trois termes.)
3. **VDOT** = `VO2(v) / F(t)` avec `v = D / t`.

**Inversions nécessaires à l'algo**
- Vitesse pour une consommation cible `X` (ml/kg/min) : racine positive de `0.000104·v² + 0.182258·v − (4.60 + X) = 0`, soit
  `v = (−0.182258 + √(0.182258² + 4·0.000104·(4.60 + X))) / (2·0.000104)`.
- Temps prédit sur une distance `D` : résoudre `VDOT·F(t) = VO2(D/t)` en `t`. Le membre gauche décroît et le droit décroît plus vite avec `t` → une seule racine ; résolution numérique par bissection sur [D/500 ; D/50] min (bornes larges).

**Exemple de contrôle** (illustratif, pas un paramètre) : 21,0975 km en 110 min → v = 191,8 m/min ; VO2 = 34,18 ; F(110) = 0,8465 ; VDOT ≈ 40,4.

**Propriétés utiles (dérivées des équations, vérifiables par calcul)** : F(≈11 min) ≈ 1,00 → la vitesse à VO2max « effective » (vVDOT) ≈ vitesse de course tenable ~11 min ; F(60 min) ≈ 0,888 → l'allure T de Daniels (~88 % VDOT) ≈ allure de course d'une heure.

**Limites**
- Le VDOT n'est pas la VO2max de laboratoire : il intègre l'économie de course. Ne pas le comparer directement à la VO2max Garmin (échelles proches mais conceptuellement différentes).
- Validité annoncée par Daniels : courses d'environ 1500 m au marathon. Le marathon prédit est optimiste chez les coureurs peu kilométrés (voir 1.2, Vickers 2016) `OBS`.
- Hypothèse de course à plat, conditions neutres, effort maximal.

### 1.2 Riegel (loi de puissance)

**Formule** : `T2 = T1 · (D2/D1)^k`, k = 1,06.
**Source** : Riegel PS. « Athletic Records and Human Endurance ». *American Scientist* 1981;69(3):285-290. `OBS` (ajusté sur des records du monde). `[secondaire]` (article non ouvert ; référence et domaine 3,5–230 min confirmés par plusieurs sources : https://en.wikipedia.org/wiki/Peter_Riegel).

**Limites**
- Domaine de validité indiqué par Riegel : efforts d'environ 3,5 à 230 min.
- k = 1,06 vient d'athlètes d'élite. Chez les coureurs loisirs, **Riegel est bien calibré jusqu'au semi mais sous-estime nettement le marathon** : résidu médian ≈ −10 min, et la moitié des coureurs courent ≥ 10 min plus lentement que la prédiction. Vickers AJ, Vertosick EA. « An empirical study of race times in recreational endurance runners ». *BMC Sports Sci Med Rehabil* 2016;8:26. https://pmc.ncbi.nlm.nih.gov/articles/PMC5000509/ `OBS` (n = 2303, enquête en ligne, validation 2:1) `[vérifié]`.
  - Leur modèle 1 utilise k = 1,07 et ajoute le **kilométrage hebdomadaire habituel** comme seul prédicteur d'entraînement retenu (30 → 50 miles/sem ≈ 25 min de différence au marathon chez l'homme, 32 min chez la femme). Coefficients exacts dans le fichier additionnel 1 `[non vérifié]`.
  - Modèle 2 : avec deux courses, calculer l'exposant individuel `k = ln(T2/T1) / ln(D2/D1)` puis l'extrapoler.
- Exposant individuel : varie selon le profil (plus élevé chez les coureurs « vitesse » ou peu endurants). Plages chiffrées souvent citées (1,05 élite, ≥ 1,08 débutants) : `[non vérifié]`.

### 1.3 McMillan

**Source** : McMillan G. McMillan Running Calculator (https://www.mcmillanrunning.com). `CE`/`OP`. **Méthodologie et équations non publiées** `[non vérifié]` : tables issues de l'expérience d'entraîneur et de données de coureurs, propriétaires. Inutilisable comme règle sourcée et reproductible ; à n'employer que comme comparaison qualitative.

### 1.4 Vitesse critique (CS) et D'

**Modèle linéaire distance-temps** : `D = CS · t + D'` (CS en m/s, D' en m). Avec deux essais maximaux (t1, D1) et (t2, D2) : `CS = (D2 − D1)/(t2 − t1)`, `D' = D1 − CS·t1`. Avec ≥ 3 essais : régression linéaire ; un R² < 0,99 ou une erreur-type de CS > 2 % signale des essais incohérents (seuil d'usage courant `[non vérifié]`).
**Forme hyperbolique équivalente** : `t_lim = D' / (v − CS)` pour v > CS → temps limite à une allure supra-CS ; sert aussi à prédire un temps sur distance courte : `t = (D − D')/CS`.

**Sources**
- Jones AM, Vanhatalo A. « The 'Critical Power' Concept: Applications to Sports Performance with a Focus on Intermittent High-Intensity Exercise ». *Sports Med* 2017;47(Suppl 1):65-78. https://pmc.ncbi.nlm.nih.gov/articles/PMC5371646/ `MA`/revue narrative `[vérifié]`. Points retenus : essais déterminants entre **~2 et ~15 min** ; CS se situe au-dessus du seuil lactique, « plus proche » de l'état stable maximal de lactate ; CS ≈ 70–90 % VO2max selon le niveau ; marathoniens d'élite courent à **96 ± 2 % de CS** (93–100 %). Bilan de D' en intermittent (W'bal, Skiba) : `τ = 546·e^(−0.01·D_CP) + 316` s (cyclisme, puissance).
- Galbraith A, Hopker J, et al. « A single-visit field test of critical speed ». *IJSPP* 2014;9:931-935. `EC` `[secondaire]` (résumé via https://repository.uel.ac.uk/item/85879) : 3600, 2400, 1200 m sur piste dans une même séance (30–60 min de récup) → **CS concorde avec le protocole labo, D' ne concorde pas**.

**Divergence et choix** : CS est plus physiologique (frontière domaines « lourd/sévère ») et se calcule à partir de données d'entraînement, mais D' est peu fiable sur le terrain et CS seule ne prédit pas le marathon (marathon ≈ 93–100 % CS chez l'élite, nettement moins chez le loisir — non quantifié de façon fiable). **Choix par défaut** : VDOT comme variable d'état principale (publiée, déterministe, couvre 1,5 km–marathon, donne directement les allures) ; CS comme **estimateur secondaire** calculé dès que ≥ 2 efforts maximaux de 3–15 min existent dans les 6 dernières semaines, utilisé pour confirmer/infirmer le VDOT et borner l'allure T (T ≤ CS).

### 1.5 Comparaison synthétique

| Modèle | Entrée | Sortie | Domaine | Transparence | Preuve |
|---|---|---|---|---|---|
| VDOT | 1 course | VDOT, temps prédits, allures | ~1,5 km – marathon | équations publiques | CE |
| Riegel | 1 course (2 pour k individuel) | temps prédits | 3,5–230 min | formule publique | OBS ; biais marathon loisir prouvé (Vickers) |
| Vickers 2016 | 1–2 courses + km/sem | temps marathon | marathon | coefficients en annexe | OBS |
| McMillan | 1 course | temps, allures | 100 m – marathon | propriétaire | OP |
| CS / D' | ≥ 2 efforts 2–15 min | CS, D' | domaine sévère | formule publique | EC |

---

## 2. Allures d'entraînement

### 2.1 Allures Daniels (E/M/T/I/R)

Source : Daniels, *Daniels' Running Formula* (2014/2021) `CE`. Pourcentages ci-dessous `[secondaire]` (sources tierces concordantes sur E et I, **discordantes sur M et T** ; le livre fournit des tables par VDOT qui font foi).

| Allure | Définition opérationnelle (dérivable des équations 1.1) | %VO2max (VDOT) | %FCmax | Usage / dose (Daniels) |
|---|---|---|---|---|
| E (facile) | v telle que VO2(v) = 0,59–0,74 × VDOT | 59–74 % | 65–79 % | footing, sortie longue |
| M (marathon) | vitesse du marathon prédit (résoudre 1.1 avec D = 42 195 m) | ~75–84 % `[secondaire, discordant]` | ~80–90 % | blocs à allure course |
| T (seuil) | VO2(v) = ~0,88 × VDOT ≈ allure course de 60 min | ~83–88 % `[discordant : 85–90 % ailleurs]` | ~88–92 % | 20 min continus ou cruise intervals |
| I (intervalle) | VO2(v) ≈ 0,975–1,00 × VDOT ≈ allure tenable ~11 min | 95–100 % | 98–100 % | fractions 3–5 min |
| R (répétition) | ≈ allure course du mile ; règle d'usage : I − 6 s/400 m `[non vérifié]` | > 100 % | n/a | 200–400 m, récup complète |

**Choix par défaut** : calculer T et I comme vitesses de course de durée fixe (60 min et 11 min) via 1.1 — ces deux ancrages sont cohérents avec les deux jeux de pourcentages et sont reproductibles ; vérifier le résultat contre les tables publiées du livre pour 5 valeurs de VDOT (30, 40, 50, 60, 70) avant mise en production. E affichée comme **plage** (pas une cible).

### 2.2 Équivalents dans d'autres systèmes

- **Friel (zones d'allure, course)** : % de l'allure seuil (moyenne du test 30 min, cf. 3.1). Z1 > 129 %, Z2 114–129 %, Z3 106–113 %, Z4 101–105 %, Z5a 97–100 %, Z5b 90–96 %, Z5c < 90 % du **temps au km** au seuil. `CE` `[non vérifié]` (Friel, *The Triathlete's Training Bible*, 4e éd. 2016 ; TrainingPeaks https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/ non ouvert).
- **Pfitzinger** (*Advanced Marathoning*, 3e éd. 2019) : footing de récupération < 70–76 % FCmax, endurance 74–84 %, seuil (LT) 82–91 %, VO2max 93–98 % `CE` `[non vérifié]`.
- **Modèle 3 zones (Seiler)** : Z1 < LT1 ; Z2 LT1–LT2 ; Z3 > LT2. Seiler KS, Kjerland GØ. *Scand J Med Sci Sports* 2006;16:49-56 `OBS` `[non vérifié]`. Correspondance approximative : E = Z1 ; M ≈ Z1/Z2 ; T ≈ haut Z2 ; I et R = Z3.
- **Magness** (*The Science of Running*, 2014) : allures exprimées en % de l'allure de course cible (« pace spectrum ») `CE` `[non vérifié]`.

---

## 3. Zones de fréquence cardiaque

### 3.1 Ancres

| Ancre | Méthode | Source | Preuve |
|---|---|---|---|
| FCmax mesurée | max observé : fin de course 5 km ou côte répétée ≥ 3 × 2–3 min à fond ; garder le max des 12 derniers mois, filtré des artefacts | consensus | CE |
| FCmax estimée | **Tanaka : 208 − 0,7 × âge** (ET ≈ 10 bpm, pas de différence H/F ni selon l'activité) | Tanaka H, Monahan KD, Seals DR. *J Am Coll Cardiol* 2001;37:153-156. https://pubmed.ncbi.nlm.nih.gov/11153730/ | MA (351 études) + EC (n = 514) `[vérifié]` |
| FCmax estimée (femmes) | Gulati : 206 − 0,88 × âge | Gulati M et al. *Circulation* 2010;122:130-137 | OBS `[non vérifié]` |
| FC repos | moyenne 7 j de la FC repos nocturne Garmin | — | OP |
| LTHR | **test 30 min Friel** : course solo à fond 30 min, LTHR = FC moyenne des 20 dernières min ; allure seuil = allure moyenne des 30 min | Friel J, *The Triathlete's Training Bible* ; https://www.trainingpeaks.com/blog/joe-friel/ | CE `[secondaire]` ; une étude (27 coureurs/triathlètes) rapporte la concordance avec un seuil labo `[non vérifié]` |
| LTHR (sans test) | FC moyenne d'une course de 50–65 min courue à fond (≈ seuil) | dérivé de Daniels (T ≈ course 60 min) | OP |

Erreur de Tanaka : ±10 bpm à 1 ET ⇒ ±20 bpm pour 95 % des individus : **une FCmax estimée ne doit jamais servir de borne dure** ; elle est remplacée dès qu'une FC plus haute est observée.

### 3.2 Méthodes de zonage

- **%FCmax** : simple, mais ignore la FC repos.
- **Karvonen / FC de réserve** : `FC_cible = FC_repos + p × (FCmax − FC_repos)`. Karvonen MJ, Kentala E, Mustala O. *Ann Med Exp Biol Fenn* 1957;35:307-315 `EC` `[non vérifié]`. %FCR ≈ %VO2R (et non %VO2max) : Swain DP, Leutholtz BC. *Med Sci Sports Exerc* 1997;29:410-414 `EC` `[non vérifié]`.
- **%LTHR (Friel, course)** : Z1 < 85 %, Z2 85–89 %, Z3 90–94 %, Z4 95–99 %, Z5a 100–102 %, Z5b 103–106 %, Z5c > 106 %. `CE` `[secondaire]` (https://the5krunner.com/2012/02/21/run-bike-swim-hr-training-zones-quick-definitive-guide-to-setting-heart-rate-2/). Attention : les zones **vélo** de Friel (Z1 < 81 %, Z2 81–89 %…) sont parfois présentées par erreur comme générales.
- **Revue comparative** : Mann T, Lamberts RP, Lambert MI. « Methods of prescribing relative exercise intensity ». *Sports Med* 2013;43:613-625. https://pubmed.ncbi.nlm.nih.gov/23620244/ `MA`/revue `[vérifié, résumé]` : les % de FCmax/VO2max produisent une forte variabilité inter-individuelle de la réponse métabolique ; les ancrages sur seuils sont physiologiquement meilleurs mais plus coûteux à obtenir ; aucune méthode ne domine partout.

**Choix par défaut** : zones ancrées sur **LTHR** (Friel course) dès qu'un LTHR mesuré existe (test ou course ~1 h) ; sinon **Karvonen** avec FCmax observée (ou Tanaka à défaut) et FC repos Garmin. Justification : Mann 2013 — ancrage seuil > ancrage max ; Karvonen intègre la FC repos disponible gratuitement.

### 3.3 Correspondance allure ↔ FC

Ne pas utiliser de table générique : **calculer la relation individuelle**. Sur chaque sortie à allure stable (segments ≥ 5 min, pente |i| < 2 %, après 10 min d'échauffement, hors fractionné), régresser `FC = a + b·v`. Agréger les segments des 28 derniers jours (régression robuste). Donne :
- `v(LTHR)` → estimation indépendante de l'allure seuil ;
- les plages FC attendues pour E et M (FC prédite aux bornes d'allure) ;
- une alerte si la FC observée à une allure donnée s'écarte de > 5 bpm de la prédiction (voir §5).
Fondement : relation FC–VO2 quasi linéaire en sous-maximal (base de l'estimation Firstbeat/Garmin et des tests sous-maximaux ACSM) `CE`. La pente dépend de la chaleur, de l'hydratation, de la fatigue et de la dérive cardiaque → c'est une **mesure**, pas une constante.

---

## 4. Estimer la forme sans course récente

### 4.1 Tests de terrain standardisés

| Test | Protocole | Sortie | Source / preuve |
|---|---|---|---|
| 30 min Friel | 30 min seul à fond, plat | LTHR (20 dernières min), allure seuil (30 min) ; aussi VDOT via 1.1 (t = 30) | Friel `CE` `[secondaire]` |
| CS 2 essais (3 + 12 min) | 3 min à fond et 12 min à fond, jours différents ou ≥ 30 min de récup | CS, D' (D' peu fiable) | protocole d'usage courant `CE` `[non vérifié en tant que protocole validé]` ; fondement Jones & Vanhatalo 2017 (essais 2–15 min) |
| CS 3 essais (Galbraith) | 3600, 2400, 1200 m piste, 30 min récup | CS fiable, D' non | Galbraith 2014 `EC` `[secondaire]` |
| Contre-la-montre 5 km | course officielle ou solo | VDOT | Daniels `CE` |
| Cooper 12 min | distance max en 12 min | VDOT (t = 12) — plus cohérent que l'équation de Cooper | Cooper KH. *JAMA* 1968;203:201-204 `EC` `[non vérifié]` |

**Choix par défaut** : 5 km à fond (course ou solo) ou test 30 min ; le 30 min donne en un seul effort VDOT + LTHR + allure seuil. Les tests CS ne sont proposés qu'en complément (plus de séances maximales, D' inutilisable).

### 4.2 À partir des sorties d'entraînement (sans test)

1. **Meilleurs efforts glissants** : extraire des fichiers FIT les meilleurs temps sur 1, 3, 5, 10 km et sur 3, 6, 12, 20 min. Un effort n'est **éligible** que si FC moyenne ≥ 90 % FCmax (ou ≥ 97 % LTHR) sur sa 2e moitié, RPE Garmin ≥ 8/10 si disponible, pente moyenne |i| < 1 %. VDOT = max des VDOT éligibles des 6 dernières semaines. `OP` (règle de conception ; un effort non maximal sous-estime toujours la forme, d'où le max).
2. **Relation FC–allure** (3.3) : allure à LTHR ⇒ VDOT via `F(60)` ; ou allure à x % FCR ⇒ via Swain (%FCR ≈ %VO2R) et VO2(v) ⇒ VO2max estimée. Erreur attendue de ce type d'estimation ≈ 5–10 % (comparable aux montres) `OBS` ; fortement sensible à la FCmax : une FCmax fausse de 15 bpm ⇒ ~7–9 % d'erreur sur VO2max (chiffre Firstbeat `[secondaire]`, https://sites.udel.edu/coe-engex/?p=1762).
3. **Découplage aérobie (Pa:HR)** : `EF = vitesse / FC` ; `découplage = (EF_1re moitié − EF_2e moitié) / EF_1re moitié`. Seuil < 5 % = endurance « solide » à cette intensité : heuristique Friel/TrainingPeaks `OP` (https://www.trainingpeaks.com/learn/articles/aerobic-endurance-and-decoupling/ `[secondaire]`). Le rapport FC/vitesse est proposé comme marqueur de terrain de la « durabilité » (Maunder E, Seiler S, et al. *Sports Med* 2021 `[non vérifié]`), mais il est **confondu par la chaleur et la déshydratation** (Hunter et al., *Eur J Sport Sci* 2025 `[secondaire]`). Usage : indicateur de tendance, pas estimateur de VDOT.

### 4.3 VO2max et prédicteur de course Garmin

- **Algorithme** : Firstbeat (propriétaire) — relation FC–vitesse en sous-maximal sur sorties GPS + FCmax. Validation constructeur ≈ 5 % MAPE (≈ 3,5 ml/kg/min) sur 2690 courses / 79 coureurs (livre blanc Firstbeat 2017, `[secondaire]`, auto-validation).
- **Études indépendantes** :
  - Engel, Masur, Sperlich, Düking. « Validity of V̇O2max estimates from the Forerunner 245 smartwatch in highly vs. moderately trained endurance athletes ». *Eur J Appl Physiol* 2025;126:591-603. https://pmc.ncbi.nlm.nih.gov/articles/PMC12881131/ `EC` `[vérifié]` : n = 35 ; biais −4 à −5 ml/kg/min (sous-estimation), LoA ≈ −12,8 à +3,9 ; MAPE 6,7–7,9 %. **Modérément entraînés (< 60) : MAPE 2,8–4,1 %** ; très entraînés : 9,4–10,4 %, accord médiocre. Amélioration à la 2e sortie.
  - Düking et al. 2022 (Forerunner 245) : MAPE ≈ 5,6–5,7 % ; Carrier et al. 2023 (Garmin) : MAPE 6,85 % ; revue systématique Molina-García et al. 2022 : biais moyen ≈ −0,09, LoA −9,9 à +9,7 ml/kg/min (exact au niveau population, large au niveau individu) — tous cités dans Engel 2025 `[secondaire]`.
  - **vivoactive 4 : aucune étude de validation spécifique trouvée.** Même famille d'algorithme présumée, non démontré.
- **Prédicteur de course Garmin** : **aucune validation à comité de lecture trouvée** ; il hérite des erreurs de la VO2max. Disponibilité sur vivoactive 4 non confirmée `[non vérifié]`.

**Choix par défaut** : la VO2max Garmin sert de **prior faible** quand il n'existe aucun effort éligible (convertie en VDOT par identité numérique, avec incertitude ±4 ml/kg/min), et comme **signal de tendance** (variation soutenue). Elle ne remplace jamais un VDOT issu d'une course ou d'un test. Justification : LoA individuelles ≈ ±8–10 ml/kg/min ≫ les écarts de VDOT qui changent les allures (1 VDOT ≈ 1,5–2 % d'allure).

---

## 5. Recalibrage dans le temps

Les seuils ci-dessous sont des **choix de conception** (`OP`) appuyés sur les sources citées ; ils doivent être paramétrables et journalisés.

| Déclencheur | Règle | Source |
|---|---|---|
| Course officielle ou test (effort éligible) | VDOT_nouveau = VDOT calculé, corrigé conditions (§6). Si > VDOT courant : remplacer. Si < VDOT courant de ≥ 1,5 sans explication (chaleur, dénivelé, maladie, RPE < 8) : remplacer ; sinon ignorer. | Daniels (la meilleure course récente fait foi) `CE` |
| Pas de course, séances bien tolérées | +1 VDOT au plus toutes les 4 semaines si ≥ 2 séances T ou I réussies à l'allure prescrite avec FC ≤ prédiction et RPE ≤ cible | Daniels recommande de ne monter d'un VDOT qu'après ~3–4 semaines `CE` `[non vérifié, page non retrouvée]` |
| Séances clés ratées | ≥ 2 séances T/I consécutives non tenues (allure < 97 % de la cible ou abandon) sans facteur externe : −1 VDOT | OP |
| Dérive FC–allure | FC à allure E standardisée (régression 3.3, 28 j) en hausse ≥ 5 bpm vs ligne de base sur ≥ 3 sorties hors chaleur : suspendre toute hausse, signaler fatigue ; si persistant 14 j : −1 VDOT. Baisse ≥ 5 bpm durable : déclenche la proposition d'un test. | OP ; fondement 3.3 |
| VO2max Garmin | Variation ≥ 2 ml/kg/min maintenue ≥ 14 j : propose un test, ne modifie pas le VDOT seule | OP ; erreur d'Engel 2025 |
| Arrêt (détraining) | Multiplier le VDOT par un facteur selon la durée d'arrêt (table Daniels « FVDOT ») : ≤ 5 j : 1,00 ; 14 j : 0,973 (0,986 si entraînement croisé) ; ~3 sem : ~0,95 ; ≥ 10 sem : ~0,80. Lignes intermédiaires `[non vérifié]` — récupérer la table complète (https://news.vdoto2.com/?p=1285). | Daniels `CE` `[secondaire]` |
| Fondement physiologique du détraining | VO2max −4 à −14 % en < 4 semaines d'arrêt chez les très entraînés, moins chez les récemment entraînés | Mujika I, Padilla S. *Sports Med* 2000;30:79-87. https://pubmed.ncbi.nlm.nih.gov/10966148/ `MA`/revue `[vérifié, résumé]` ; Coyle EF et al. *J Appl Physiol* 1984;57:1857-1864 (n = 7, suivi 12–84 j ; chiffres exacts discordants entre sources secondaires) `[non vérifié]` |
| Péremption | Effort éligible > 12 semaines : ne compte plus seul ; appliquer la table d'arrêt si le volume a chuté de ≥ 50 % | OP |
| FCmax | FC observée > FCmax courante (artefact exclu : pic < 10 s ou saut > 20 bpm en 2 s) : remplacer et recalculer les zones | CE |
| LTHR | Recalcul à chaque test 30 min ou course 50–65 min ; sinon toutes les 8 semaines via v(LTHR) régressée | Friel (retest toutes les 4–8 sem.) `CE` `[non vérifié]` |

---

## 6. Corrections chaleur / dénivelé / vent

**Chaleur** — Ely MR, Cheuvront SN, Roberts WO, Montain SJ. « Impact of weather on marathon-running performance ». *Med Sci Sports Exerc* 2007;39:487-493. https://experts.umn.edu/en/publications/impact-of-weather-on-marathon-running-performance/ `OBS` `[secondaire, résumé]` : performance dégradée progressivement de WBGT 5 à 25 °C ; élite masculine : +1,7 / 2,5 / 3,3 / 4,5 % vs record pour WBGT 5–10 / 10–15 / 15–20 / 20–25 °C ; **les coureurs plus lents sont davantage pénalisés**. Pas de formule individuelle standardisée.
→ **Choix par défaut** : (a) pour **interpréter** une course : ne pas réduire le VDOT si la course a eu lieu à WBGT (ou température, à défaut) > 15 °C et que le VDOT obtenu est plus bas ; (b) pour **prescrire** : au-delà de ~20 °C, les séances E/M/T passent en pilotage FC/RPE (allure indicative) plutôt que de corriger l'allure par un coefficient non validé pour le coureur loisir.

**Dénivelé** — Minetti AE et al. « Energy cost of walking and running at extreme uphill and downhill slopes ». *J Appl Physiol* 2002;93:1039-1046. `EC` (n = 10, pente −45 à +45 %). Cr à plat = 3,40 J/kg/m, indépendant de la vitesse `[vérifié, résumé]`. Polynôme d'ajustement (i = pente en fraction) `[non vérifié — PDF inaccessible]` :
`Cr(i) = 155,4 i⁵ − 30,4 i⁴ − 43,3 i³ + 46,3 i² + 19,5 i + 3,6` (J·kg⁻¹·m⁻¹).
Allure ajustée (« GAP ») : `v_plat_équivalente = v · Cr(i) / Cr(0)`. Limites : coût minimal vers −10/−20 % ; en descente, le coût métabolique sous-estime la charge musculaire. **Choix** : appliquer pour |i| ≤ 15 % uniquement au calcul d'efforts éligibles et à la relation FC–allure ; séances en côte pilotées FC/RPE.

**Tapis** — 1 % de pente reproduit le coût de la course extérieure entre 2,92 et 5,0 m/s : Jones AM, Doust JH. *J Sports Sci* 1996;14:321-327 `EC` `[secondaire]`.

**Vent** — coût de la résistance de l'air (Pugh LGCE. *J Physiol* 1971;213:255-276) : `VO2 (L/min) = 0,00354 · Ap · v³` (Ap aire frontale m², v m/s, air calme) `EC` `[secondaire]` (via revue *Front Physiol* 2019, https://www.frontiersin.org/articles/10.3389/fphys.2019.00079). Correction individuelle à partir d'une météo à pas horaire = trop imprécise. **Choix** : pas de correction automatique ; vent > ~25 km/h (seuil `OP`) ⇒ pilotage FC/RPE et effort marqué non éligible au recalibrage.

---

## 7. Piloter à l'allure, à la FC ou au RPE

Fondements : retard de la FC à l'effort (cinétique de plusieurs dizaines de secondes à 1–2 min) ; dérive cardiaque en effort prolongé et à la chaleur ; FC optique au poignet moins précise lors des variations rapides d'intensité (Gillinov S et al. *Med Sci Sports Exerc* 2017;49:1697-1703 `EC` `[non vérifié]`) ; RPE valide comme mesure de charge interne (Foster C et al. *J Strength Cond Res* 2001;15:109-115, session-RPE `EC` `[non vérifié]`) ; Mann 2013 (§3.2).

| Séance | Pilote primaire | Garde-fou | Raison |
|---|---|---|---|
| E / récup / sortie longue | **FC plafond** (haut de E / Z2 Friel) | allure indicative | protège contre l'excès d'intensité ; insensible au terrain |
| M (blocs) | allure | FC ≤ FC_M prédite + 5 bpm | spécificité course |
| T (seuil) | allure sur plat | FC ≤ LTHR (+2 bpm en fin de bloc) ; en côte/chaleur → FC | FC stable en effort ≥ 10 min |
| I (3–5 min) | allure (ou RPE 8–9) | FC non utilisée pour piloter (latence) ; FC fin de fraction ≥ 95 % FCmax = confirme l'intensité | latence FC |
| R, accélérations, côtes courtes | RPE / allure | aucun | FC non pertinente < 2 min |
| Chaleur > ~20 °C, vent fort, trail, dénivelé | **FC ou RPE** | allure informative | l'allure n'est plus comparable |
| Retour de blessure / message « j'ai mal » | RPE ≤ 4/10 et FC plafond E | aucune allure imposée | sécurité |

---

## Règles prêtes pour l'algo

Unités : v en m/min, t en min, FC en bpm, VDOT en ml·kg⁻¹·min⁻¹. Tous les seuils sont des paramètres configurables ; leurs valeurs par défaut sont indiquées.

**R1 — Calcul du VDOT**. SI un effort a distance D (m) et durée t (min) ALORS `VDOT = (−4,60 + 0,182258·v + 0,000104·v²) / (0,8 + 0,1894393·e^(−0,012778·t) + 0,2989558·e^(−0,1932605·t))`, v = D/t.

**R2 — Éligibilité d'un effort**. Un effort est éligible SI 3 ≤ t ≤ 230 min ET pente moyenne |i| < 1 % (ou corrigée par R13) ET [course officielle OU test planifié OU (FC moyenne 2e moitié ≥ 0,90·FCmax OU ≥ 0,97·LTHR)] ET non marqué « conditions défavorables » (R14, R15).

**R3 — État initial**. SI ≥ 1 effort éligible ≤ 6 semaines ALORS VDOT = max(VDOT éligibles) ; SINON SI effort éligible entre 6 et 12 semaines ALORS VDOT = VDOT de cet effort × facteur de détraining (R10) ; SINON VDOT = VO2max Garmin, statut « provisoire », ET planifier un test (5 km à fond ou 30 min Friel) dans les 14 jours.

**R4 — Prédiction de temps**. Temps sur D = racine de `VDOT·F(t) − VO2(D/t) = 0` (bissection). SI D = 42 195 m ET kilométrage moyen 8 semaines faible ALORS afficher en plus Riegel k = 1,07 et prendre la valeur la plus lente (Vickers 2016). Seuil « faible » : à définir (Q4).

**R5 — Allures**. E = plage [v(0,59·VDOT) ; v(0,74·VDOT)] ; M = vitesse prédite R4 pour 42 195 m ; T = vitesse de course tenable 60 min (F(60)·VDOT) ; I = vitesse tenable 11 min (≈ VDOT) ; R = I − 6 s/400 m. SI CS connue ET T > CS ALORS T = CS.

**R6 — FCmax**. FCmax = max observé (12 mois, artefacts exclus : durée du pic < 10 s ou saut > 20 bpm/2 s) ; SI aucune FC ≥ 0,95 × Tanaka observée ALORS FCmax = max(observé, 208 − 0,7·âge), flag « estimée ».

**R7 — Zones FC**. SI LTHR mesuré (≤ 8 semaines) ALORS zones Friel course (% LTHR : < 85, 85–89, 90–94, 95–99, 100–102, 103–106, > 106) ; SINON Karvonen avec FC repos = moyenne 7 j : E = 59–74 % FCR, T = 84–88 % FCR (bornes provisoires `OP`, Q2).

**R8 — LTHR**. SI test 30 min ALORS LTHR = FC moyenne [10 ; 30] min, allure seuil = allure moyenne [0 ; 30] min. SI course éligible de 50–65 min ALORS LTHR = FC moyenne [10 min ; fin].

**R9 — Relation FC–allure**. Chaque jour, régression robuste FC = a + b·v sur segments stables (≥ 5 min, |i| < 2 %, après 10 min, température < 20 °C) des 28 derniers jours ; exige ≥ 6 segments ; sinon conserver la précédente.

**R10 — Détraining**. SI aucune course ≥ N jours ALORS VDOT × facteur : N ≤ 5 → 1,00 ; N = 14 → 0,973 (0,986 si activité aérobie croisée ≥ 3×/sem) ; interpolation linéaire entre points de la table Daniels ; N ≥ 70 → 0,80. (Table complète à vérifier, Q1.)

**R11 — Hausse sans course**. SI 28 jours depuis la dernière hausse ET ≥ 2 séances T/I réalisées à ≥ 100 % de l'allure cible avec FC ≤ prédiction R9 + 3 bpm ET RPE ≤ RPE cible ALORS VDOT += 1.

**R12 — Baisse**. SI ≥ 2 séances T/I consécutives < 97 % de l'allure cible sans facteur externe (chaleur, vent, dénivelé, maladie, sommeil signalé) ALORS VDOT −= 1. SI FC à allure E de référence (R9) ≥ ligne de base + 5 bpm sur ≥ 3 sorties ET persistant 14 j ALORS VDOT −= 1 et notifier.

**R13 — Dénivelé**. Allure équivalente plat = v · Cr(i)/Cr(0) (Minetti) pour |i| ≤ 15 % ; au-delà, segment exclu des calculs.

**R14 — Chaleur**. SI température (ou WBGT) > 20 °C ALORS séances E/M/T pilotées FC/RPE ; SI > 15 °C ET VDOT obtenu < VDOT courant ALORS l'effort ne peut pas faire baisser le VDOT.

**R15 — Vent / terrain**. SI vent moyen > 25 km/h OU surface non routière ALORS effort non éligible à la baisse du VDOT et séance pilotée FC/RPE.

**R16 — VO2max Garmin**. Utilisée seulement en R3 (prior) et comme déclencheur : SI variation ≥ 2 ml/kg/min soutenue 14 j ALORS proposer un test ; jamais de modification directe du VDOT.

**R17 — Mode de pilotage**. Appliquer la table §7 ; le LLM peut seulement basculer une séance vers un mode plus conservateur (FC → RPE plafond), jamais l'inverse.

---

## Questions ouvertes

1. **Table de détraining Daniels complète** (lignes 6 j – 10 sem., FVDOT-1/FVDOT-2) : à extraire du livre (4e éd.) ou de https://news.vdoto2.com/?p=1285 avant implémentation.
2. **Pourcentages M et T de Daniels** : sources tierces divergentes (T 83–88 % vs 85–90 %). Valider l'ancrage « course 60 min / 11 min » contre les tables publiées.
3. **Zones Friel en allure et seuils %LTHR** : contrôler dans *The Triathlete's Training Bible* (4e éd.) ; seule la version FC course est recoupée.
4. **Correction marathon loisir** : coefficients exacts de Vickers 2016 (fichier additionnel 1) et définition chiffrée du « faible kilométrage ».
5. **vivoactive 4** : aucune validation publiée de sa VO2max ; prédicteur de course probablement absent ; quelles données l'API Garmin expose réellement (VO2max, FC repos, LTHR auto-détectée ?) → à traiter dans le document sur les données.
6. **Coefficients du polynôme de Minetti** : à vérifier dans le PDF original (accès refusé ici).
7. **Correction chaleur individualisée** : pas de modèle validé pour coureurs loisir ; Ely 2007 = données de marathon agrégées. Étudier Mantzios et al. 2022 (*MSSE*, 1258 courses) `[non vérifié]`.
8. **Protocole CS 3 min + 12 min** : largement utilisé mais validation de terrain du couple précis non trouvée ; D' non fiable en extérieur.
9. **Seuils de recalibrage (±1 VDOT, 5 bpm, 4 semaines, 97 %)** : choix de conception non validés ; à évaluer rétrospectivement sur des historiques Garmin (erreur de prédiction de la course suivante).
10. **Influence de la musculation** (3–4 séances/sem.) sur la FC à allure donnée et sur les efforts « éligibles » le lendemain : non traité ici, à croiser avec le document charge/fatigue.
11. **Cycle menstruel** et relation FC–allure : effet sur FC repos/HRV possiblement non négligeable ; non couvert.
