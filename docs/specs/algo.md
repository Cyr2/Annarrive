# Talaria : spécification de l'algorithme (`packages/coach`)

Consolide `research/01` à `05` et applique les décisions produit. Cible : un paquet TypeScript de fonctions pures (aucune E/S, aucune horloge interne, aucun hasard), testé à 90 %. Toutes les valeurs ci-dessous sont des constantes nommées, globales, identiques pour tous les coureurs. Aucune valeur propre à Anna n'est codée.

## 0. Conventions

| Élément                              | Convention                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unités                               | durée en min, vitesse `v` en m/min, allure en s/km, FC en bpm, VDOT en ml·kg⁻¹·min⁻¹, sommeil en min, dates ISO 8601 en heure locale                 |
| Volume d'entraînement                | minutes de course par semaine (lundi à dimanche). Le km est dérivé. La muscu n'entre jamais dans le volume ni dans la charge                         |
| Temps                                | `now` est toujours passé en argument. Aucune fonction ne lit l'horloge                                                                               |
| Sortie de toute fonction qui modifie | `{ state, changes: Change[], warnings: Warning[] }`. Chaque `Change` porte `ruleId`, données utilisées et source, pour l'explication et pour Annuler |
| Niveau de preuve (un mot)            | `MA` méta-analyse, `ECR` essai contrôlé, `OBS` observationnel, `CONS` consensus d'entraîneurs ou livre, `OP` choix de conception                     |
| `défaut à calibrer`                  | valeur choisie par nous ou extrapolée, à revoir sur les données d'usage                                                                              |
| Dur                                  | séance `Q` (qualité : T, CRUISE, I, R ≥ 3 km, SPE, COTES_L, TEST) ou `L` (sortie longue, toujours dure pour le placement)                            |
| `manual`                             | drapeau posé sur tout ce qu'Anna a créé, déplacé ou changé à la main. Aucune règle automatique ne le modifie ensuite                                 |

### 0.1 Cycle de décision (décisions produit)

| Moment                                                                                                            | Fonction          | Peut faire                                                                      | Ne peut pas faire                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Dimanche 18:00 (`H_BUILD`, défaut à calibrer)                                                                     | `buildWeek`       | construire le squelette lundi à dimanche suivant à partir du plan et du réalisé | modifier la semaine en cours                                                                                          |
| Chaque matin, après la synchro sommeil                                                                            | `dailyDecision`   | **alléger** la séance du jour, une seule fois, puis la figer                    | alourdir, déplacer, toucher une séance `manual`                                                                       |
| Événement réel : changement d'emploi du temps, séance ratée, maladie, déplacement par Anna, changement de réglage | `replan`          | replanification minimale de la semaine en cours et de la suivante               | bouger une séance qui commence dans moins de 12 h sans accord, bouger une séance `manual`, rattraper une séance ratée |
| Action d'Anna ou de Reggie                                                                                        | `events.*`        | ce que fait le bouton correspondant                                             | dépasser la charge prévue (Changer), sortir des règles sans avertissement                                             |
| Course, test, séance clé nettement meilleure ou pire                                                              | `recalibration.*` | **proposer** un nouveau niveau, accepté en un tap                               | appliquer seul un changement d'allure                                                                                 |

Une déviation ne déclenche rien tant qu'elle n'est pas **claire et confirmée** : deux signaux distincts le même jour, ou le même signal deux jours de suite.

### 0.2 Reggie

Reggie n'appelle que les fonctions de `events` et `readOnly` (lecture du plan, de la semaine, des signaux, `explain(ruleId)`). Tout résultat passe par `guards.validateWeek` avant d'être enregistré. Reggie ne reçoit jamais une fonction qui écrit une séance libre.

---

## 1. Carte des modules

| #   | Module                                          | Entrées                                       | Sorties                                             | Fonctions publiques                                                                                                                                |
| --- | ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `fitness` (VDOT, allures, zones FC)             | efforts, historique, FC, âge                  | VDOT, temps prédits, allures, zones                 | `vdot`, `predictTime`, `paces`, `isEligibleEffort`, `initialFitness`, `detrainingFactor`, `hrMax`, `hrZones`, `hrPaceModel`                        |
| M2  | `plan` (génération, périodisation, faisabilité) | objectif, profil, historique volume, VDOT     | `Plan` (phases, volumes hebdo, gabarits de séances) | `feasibility`, `phaseSplit`, `peakVolume`, `volumeCurve`, `generatePlan`, `weekTemplate`, `replanFromActual`                                       |
| M3  | `catalog` (séances)                             | type, volume hebdo, allures                   | `Session` dimensionnée, options équivalentes        | `buildSession`, `sessionLoad`, `isHard`, `equivalents`, `feelToRpe`                                                                                |
| M4  | `placement` (solveur de contraintes)            | séances de la semaine, agenda, réglages       | créneaux, pénalités, raisons                        | `freeSlots`, `checkHard`, `softPenalty`, `placeWeek`, `replan`, `proposeMoveSlots`                                                                 |
| M5  | `readiness` (lignes de base, décision du matin) | signaux quotidiens, ressenti, agenda          | décision du jour, signaux                           | `baseline`, `dailySignals`, `isConfirmed`, `dailyDecision`                                                                                         |
| M6  | `guards` (charge et progression)                | séances prévues et réalisées                  | séances plafonnées, validation                      | `spikeCap`, `weeklyCaps`, `distributionCheck`, `validateWeek`                                                                                      |
| M7  | `events` (actions des boutons)                  | état, action, `now`                           | nouvel état, changements, avertissements            | `moveSession`, `changeOptions`, `applyChange`, `reportUnavailable`, `feelBetter`, `updateSettings`, `onTimetableChange`, `detectMissed`, `logFeel` |
| M8  | `recalibration`                                 | activités, séances clés, propositions passées | `Proposal` ou rien                                  | `evaluateRace`, `evaluateKeySessions`, `evaluateTrends`, `acceptProposal`                                                                          |
| M9  | `maintenance` (mode entretien)                  | historique 8 sem., réglages                   | gabarit de semaine                                  | `maintenanceWeek`, `postRaceWeek`, `exitMaintenance`                                                                                               |

### 1.1 Types communs (abrégés)

```ts
type RunType = "E" | "RECUP" | "L" | "T" | "CRUISE" | "I" | "R" | "SPE" | "COTES_C" | "COTES_L" | "FARTLEK" | "TEST";
type Step = {
  kind: "warmup" | "work" | "recover" | "cooldown" | "strides";
  durMin?: number;
  distM?: number;
  reps?: number;
  target: { paceSKm?: [number, number]; hrBpm?: [number, number]; rpe?: number };
};
type Session = {
  id: string;
  type: RunType;
  start: string;
  durMin: number;
  steps: Step[];
  rpeTarget: number;
  priority: 1 | 2 | 3 | 4 | 5;
  status: "planned" | "done" | "missed" | "skipped" | "cancelled";
  manual: boolean;
  frozen: boolean;
  pilot: "pace" | "hr" | "rpe";
};
type CalEvent = {
  id: string;
  kind: "class" | "exam" | "strength" | "revision" | "unavailable";
  start: string;
  end: string;
  legs?: boolean;
  light?: boolean;
  manual: boolean;
};
type Settings = {
  runsPerWeek: 3 | 4 | 5;
  earliest: string;
  latestEnd: string;
  noRunDays: number[];
  bedtime: string;
  preferredLongDay?: number;
  preferredHour?: string;
  useSleepHr: boolean;
  travelMin: number;
};
type Goal = { distanceM: 5000 | 10000 | 21097.5 | 42195; date: string; targetMin?: number } | null;
type DailySignal = {
  date: string;
  rhr?: number;
  sleepMin?: number;
  bodyBatteryWake?: number;
  stressAvg?: number;
  vo2max?: number;
};
type Activity = {
  id: string;
  start: string;
  durMin: number;
  distM: number;
  avgHr?: number;
  hrSeries?: number[];
  elevGainM?: number;
  isRace?: boolean;
  isTest?: boolean;
  tempC?: number;
  feel?: "easy" | "ok" | "hard";
};
type Proposal = {
  kind: "vdot" | "test" | "goal";
  from: number;
  to: number;
  ruleId: string;
  evidence: string[];
  expiresOn: string;
};
```

---

## M1. `fitness` : forme, allures, zones FC

### Signatures

```ts
vo2(vMpm: number): number
fractionF(tMin: number): number
vdot(distM: number, tMin: number): number
predictTime(vdot: number, distM: number): number                      // min, bissection
speedForVo2(x: number): number                                         // m/min
paces(vdot: number): { E: [number, number]; M: number; T: number; I: number; R: number }  // s/km
isEligibleEffort(a: Activity, ctx: { hrMax: number; lthr?: number }): { ok: boolean; reason?: string }
detrainingFactor(daysOff: number, crossTrainingPerWeek?: number): number
initialFitness(h: { activities: Activity[]; vo2maxGarmin?: number; declared?: { distM: number; tMin: number } },
               now: string): { vdot: number; status: 'measured'|'provisional'; source: string; testWeek?: [2, 4] }
hrMax(observedMax12m: number|undefined, age: number|undefined): { value: number; estimated: boolean }
hrZones(hrMax: number, rhr7: number, lthr?: number): Zones
hrPaceModel(segments: Segment[]): { a: number; b: number } | null     // FC = a + b·v
```

### Règles

| Id  | Règle                                                                                                                                                                                                                                                                                                                                                                                         | Paramètres                        | Source                                                   | Niveau |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------- | ------ |
| F1  | `VO2(v) = -4,60 + 0,182258·v + 0,000104·v²`                                                                                                                                                                                                                                                                                                                                                   | v en m/min                        | Daniels & Gilbert 1979                                   | CONS   |
| F2  | `F(t) = 0,8 + 0,1894393·e^(-0,012778·t) + 0,2989558·e^(-0,1932605·t)`. Garder les trois termes                                                                                                                                                                                                                                                                                                | t en min                          | Daniels & Gilbert 1979                                   | CONS   |
| F3  | `VDOT = VO2(D/t) / F(t)`                                                                                                                                                                                                                                                                                                                                                                      |                                   | Daniels & Gilbert 1979                                   | CONS   |
| F4  | Inversion : `v(X) = (-0,182258 + √(0,182258² + 4·0,000104·(4,60 + X))) / (2·0,000104)`                                                                                                                                                                                                                                                                                                        |                                   | dérivé de F1                                             | CONS   |
| F5  | Temps prédit sur D : racine de `VDOT·F(t) - VO2(D/t) = 0` par bissection sur [D/500 ; D/50] min, 60 itérations                                                                                                                                                                                                                                                                                | tolérance 0,01 min                | Daniels 2014                                             | CONS   |
| F6  | Marathon et volume moyen 8 sem. < 240 min/sem : afficher aussi Riegel `T2 = T1·(D2/D1)^1,07` et retenir le plus lent                                                                                                                                                                                                                                                                          | seuil 240 min, défaut à calibrer  | Vickers & Vertosick 2016                                 | OBS    |
| F7  | Allures : E = [v(0,59·VDOT) ; v(0,74·VDOT)] affichée en plage ; M = vitesse prédite F5 pour 42 195 m ; T = v(F(60)·VDOT) ; I = v(F(11)·VDOT) ; R = allure I - 15 s/km (6 s/400 m)                                                                                                                                                                                                             | ancrages 60 et 11 min             | Daniels 2014                                             | CONS   |
| F8  | Si vitesse critique CS connue (≥ 2 efforts max de 3 à 15 min en 6 sem.) et T > CS : T = CS                                                                                                                                                                                                                                                                                                    |                                   | Jones & Vanhatalo 2017                                   | ECR    |
| F9  | Effort éligible si : 3 ≤ t ≤ 230 min ET pente moyenne < 1 % (ou corrigée Minetti si ≤ 15 %) ET (course officielle OU test planifié OU FC moyenne 2e moitié ≥ 0,90·FCmax OU ≥ 0,97·LTHR) ET pas de conditions défavorables (temp. > 20 °C, vent > 25 km/h, hors route)                                                                                                                         |                                   | Daniels 2014 ; règle de conception                       | OP     |
| F10 | État initial (décision : historique Garmin d'abord) : (a) VDOT max des efforts éligibles ≤ 6 sem. ; sinon (b) effort éligible de 6 à 12 sem. × `detrainingFactor(plus longue interruption depuis l'effort)` ; sinon (c) **provisoire** = min(VDOT de la VO2max Garmin, VDOT du chrono déclaré), le seul disponible si un seul ; un test (5 km à fond ou 30 min) est planifié en semaine 2 à 4 | 6 et 12 sem.                      | Daniels 2014 ; Engel 2025 (VO2max Garmin : MAPE 3 à 8 %) | OP     |
| F11 | Détraining : interpolation linéaire entre (5 j ; 1,00), (14 j ; 0,973), (21 j ; 0,95), (70 j ; 0,80) ; constant au-delà. Si cross-training ≥ 3×/sem : point 14 j = 0,986                                                                                                                                                                                                                      | table à vérifier                  | Daniels 2014 (via vdoto2) ; Mujika & Padilla 2000        | CONS   |
| F12 | FCmax = max observé sur 12 mois (artefact exclu : pic < 10 s ou saut > 20 bpm en 2 s). Si aucune FC ≥ 0,95·(208 - 0,7·âge) : FCmax = max(observé, 208 - 0,7·âge), drapeau `estimated`. Sans âge ni FC : pas de zones FC, pilotage RPE                                                                                                                                                         |                                   | Tanaka 2001                                              | MA     |
| F13 | Zones : LTHR mesuré ≤ 8 sem. → Friel course (% LTHR : < 85, 85 à 89, 90 à 94, 95 à 99, 100 à 102, 103 à 106, > 106) ; sinon Karvonen avec FC repos moyenne 7 j : E = 59 à 74 % FCR, T = 84 à 88 % FCR                                                                                                                                                                                         | bornes Karvonen défaut à calibrer | Friel 2016 ; Karvonen 1957 ; Mann 2013                   | CONS   |
| F14 | LTHR : test 30 min → FC moyenne de 10 à 30 min ; course éligible de 50 à 65 min → FC moyenne de 10 min à la fin                                                                                                                                                                                                                                                                               |                                   | Friel 2016                                               | CONS   |
| F15 | Relation FC-allure : régression robuste `FC = a + b·v` sur segments stables (≥ 5 min, pente < 2 %, après 10 min, temp. < 20 °C) des 28 derniers jours ; exige ≥ 6 segments, sinon garder la précédente                                                                                                                                                                                        |                                   | règle de conception                                      | OP     |
| F16 | Pilotage : E, RECUP, L → plafond FC (haut de E) ; M, T → allure avec garde FC ; I → allure ; R, côtes, strides → RPE ; chaleur > 20 °C, vent, trail, retour de douleur → FC ou RPE. Reggie peut seulement passer vers plus conservateur                                                                                                                                                       |                                   | Mann 2013 ; Gillinov 2017                                | CONS   |
| F17 | VO2max Garmin : jamais modifiée en VDOT directement, sauf F10 (c) ; sert de déclencheur en M8                                                                                                                                                                                                                                                                                                 |                                   | Engel 2025                                               | ECR    |

### Tests

Valeurs de référence Daniels : **à vérifier contre la table officielle** (_Daniels' Running Formula_, 4e éd.) avant figement. Les valeurs « formule » sont calculées avec F1 à F7 ; tolérance de test ±0,05 VDOT, ±3 s sur les temps.

| #    | Entrée                                                                                              | Sortie attendue                                                                  |
| ---- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| F-1  | `vdot(5000, 24+8/60)` (table VDOT 40 : 24:08)                                                       | 39,94                                                                            |
| F-2  | `vdot(21097.5, 110)` (1 h 50 au semi)                                                               | 40,38 (`F(110)` = 0,8465 ; `VO2` = 34,18)                                        |
| F-3  | `vdot(42195, 229.75)` (table VDOT 40 : 3:49:45)                                                     | 39,97                                                                            |
| F-4  | `vdot(10000, 41.35)` (table VDOT 50 : 41:21)                                                        | 49,97                                                                            |
| F-5  | `vdot(5000, 30+40/60)` (table VDOT 30) ; `vdot(21097.5, 78.15)` (table VDOT 60)                     | 30,02 ; 59,99                                                                    |
| F-6  | `predictTime(40, 5000)` ; `predictTime(50, 21097.5)` ; `predictTime(60, 42195)`                     | 24:06 ; 1:31:31 ; 2:43:22 (table : 24:08 ; 1:31:35 ; 2:43:25)                    |
| F-7  | `paces(40)`                                                                                         | E 5:51 à 6:59 /km ; M 5:27 ; T 5:03 ; I 4:36 ; R 4:21 (à comparer à la table)    |
| F-8  | `paces(50)`                                                                                         | E 4:54 à 5:52 ; M 4:31 ; T 4:13 ; I 3:50 ; R 3:35                                |
| F-9  | `fractionF(11)` ; `fractionF(60)`                                                                   | 1,0003 ; 0,888                                                                   |
| F-10 | `isEligibleEffort` : 2,5 min à fond                                                                 | `ok: false`, `reason: 'duration'`                                                |
| F-11 | `isEligibleEffort` : course officielle 240 min                                                      | `ok: false`, `reason: 'duration'`                                                |
| F-12 | `isEligibleEffort` : sortie 40 min, FC 2e moitié 0,82·FCmax, non course                             | `ok: false`, `reason: 'not_max'`                                                 |
| F-13 | `isEligibleEffort` : course 10 km, 24 °C                                                            | `ok: false`, `reason: 'conditions'`                                              |
| F-14 | `detrainingFactor(3)` ; `(10)` ; `(14)` ; `(21)` ; `(45)` ; `(100)`                                 | 1,00 ; 0,985 ; 0,973 ; 0,95 ; 0,8765 ; 0,80                                      |
| F-15 | `initialFitness` : effort éligible il y a 3 sem. VDOT 41,2 et un autre il y a 5 sem. VDOT 40,1      | 41,2, `measured`                                                                 |
| F-16 | `initialFitness` : seul effort éligible il y a 8 sem. VDOT 42, plus longue interruption depuis 14 j | 40,87, `measured`                                                                |
| F-17 | `initialFitness` : aucun effort, VO2max Garmin 44, déclaré semi 110 min                             | 40,38, `provisional`, `testWeek: [2, 4]`                                         |
| F-18 | `initialFitness` : aucun effort, aucune VO2max, rien déclaré                                        | erreur `NO_FITNESS_DATA` (l'app demande un chrono ou lance le test en semaine 1) |
| F-19 | `hrMax(192, 21)`                                                                                    | 192, `estimated: false` (seuil 0,95·193,3 = 183,6)                               |
| F-20 | `hrMax(175, 21)`                                                                                    | 193,3, `estimated: true`                                                         |
| F-21 | `hrZones(195, 55)` sans LTHR                                                                        | E = 138 à 159 bpm ; T = 173 à 178 bpm                                            |
| F-22 | `hrPaceModel` avec 5 segments                                                                       | `null` (garder le modèle précédent)                                              |

---

## M2. `plan` : génération, périodisation, faisabilité

### Signatures

```ts
feasibility(p0Min: number, targetMin: number|undefined, weeksToRace: number, profile: Profile):
  { gain: number; gainMax: number; class: 'conservateur'|'réaliste'|'ambitieux'|'irréaliste'; proposedMin: number; uncertain: boolean }
phaseSplit(goal: Goal, weeksTotal: number, lowBase: boolean): { base: number; dev: number; spe: number; taper: number; short: boolean }
peakVolume(distM: number, v0: number, loadWeeks: number, max12m: number): { vPeak: number; warning?: 'peak_below_min' }
volumeCurve(split: Split, v0: number, vPeak: number, cycle: '3:1'|'2:1', distM: number): number[]   // min/sem
weekTemplate(phase: Phase, runsPerWeek: 3|4|5, distM: number, weekIdx: number): RunType[]
generatePlan(goal: Goal, profile: Profile, history: Activity[], fitness: Fitness, now: string): Plan
replanFromActual(plan: Plan, actualWeeks: number[], now: string): Plan
```

### Règles

| Id  | Règle                                                                                                                                                                                                                                                                                                                                                     | Paramètres                              | Source                                     | Niveau |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------ | ------ |
| P1  | Objectif absent → M9. Sinon mode plan                                                                                                                                                                                                                                                                                                                     |                                         |                                            |        |
| P2  | `V0` = moyenne des 4 dernières semaines complètes (hors semaines de maladie). < 2 sem. de données : `V0 = min(déclaré, 150)`, drapeau provisoire. Arrêt ≥ 28 j : `V0 = 0,5 × moyenne avant l'arrêt`                                                                                                                                                       | 150 min, 0,5 : défaut à calibrer        | Coyle 1984                                 | OP     |
| P3  | `S_tot` = nombre de semaines complètes du lundi suivant au dimanche de la course inclus                                                                                                                                                                                                                                                                   |                                         |                                            |        |
| P4  | `S_aff` : 5 km 1 ; 10 km 1 ; semi 2 ; marathon 3 (2 si `S_tot` < 16)                                                                                                                                                                                                                                                                                      |                                         | Bosquet 2007 ; Wang 2023                   | MA     |
| P5  | Minimum : 5 km 6, 10 km 8, semi 10, marathon 12 sem. En dessous : avertir « plan court » et générer quand même                                                                                                                                                                                                                                            |                                         | plans Daniels, Pfitzinger                  | CONS   |
| P6  | Répartition : `R = S_tot - S_aff` ; `base = max(2, round(0,30·R))` ; `spe = max(3, round(0,35·R))` (4 au marathon) ; `dev = R - base - spe`. Si `dev < 0` : `dev = 0` puis réduire `base` jusqu'à 1, puis `spe = R - base`. `round` = arrondi au plus proche, 0,5 vers le haut                                                                            | 30/35/35 % défaut à calibrer            | Daniels, Pfitzinger                        | CONS   |
| P7  | Base faible (`V0 < 0,5 × pic mini` ou < 3 courses/sem dans l'historique) : `ajout = min(8, dev)` ; `base += ajout` ; `dev -= ajout`                                                                                                                                                                                                                       |                                         | règle de conception                        | OP     |
| P8  | Pic : `V_pic = min(pic cible haut, V0 × 1,10^(semaines de charge en Base + Dév), 1,20 × max hebdo 12 mois)`. Pic mini / cible haut (min/sem) : 5 km 120/240 ; 10 km 150/280 ; semi 180/330 ; marathon 240/450. `V_pic < pic mini` → avertissement                                                                                                         | défaut à calibrer                       | Vickers 2016 ; règle de conception         | OP     |
| P9  | Cycle : 2:1 si âge ≥ 40, blessure < 6 mois (onboarding) ou fatigue confirmée M5 sur ≥ 3 jours de la semaine précédente ; sinon 3:1. Décharge : `V = 0,75 × V(semaine précédente)`, fractions des Q × 2/3, L × 0,75                                                                                                                                        |                                         | pratique universelle des plans             | CONS   |
| P10 | Semaine de charge : `V(s+1) = min(V_pic, 1,10 × V(dernière semaine de charge))`. Spécifique : plateau `V_pic` ±10 %                                                                                                                                                                                                                                       | 1,10                                    | Damsted 2019                               | OBS    |
| P11 | Nombre de Q : Base 0 (+ strides, côtes courtes) ; Dév 1 (3 courses) ou 2 (4 à 5) ; Spé 1 Q + L spécifique (3 courses) ou 2 Q (4 à 5) ; Affûtage comme Spé. Plafond absolu : 2 Q + L                                                                                                                                                                       |                                         | Seiler 2010 ; Daniels                      | CONS   |
| P12 | Contenu : Base = E, L, strides 1 à 2×/sem, côtes courtes 1×/sem, fartlek la dernière semaine. Dév = I et T en alternance, côtes longues possibles, strides 1×/sem. Spé = Q1 spécifique (5 km : I ; 10 km : I ou T ; semi : T long + allure semi ; marathon : M dans la L + T), Q2 = l'autre qualité, L avec bloc spécifique 1 sem. sur 2 (semi, marathon) |                                         | Daniels ; Pfitzinger ; Canova (secondaire) | CONS   |
| P13 | Gabarits : 3 courses : Q1 · E+strides · L ; 4 : Q1 · E · Q2 · L ; 5 : Q1 · E · Q2 · RECUP · L. En Base, Q remplacées par E+strides et E+côtes courtes                                                                                                                                                                                                     |                                         | Daniels ; Pfitzinger                       | CONS   |
| P14 | Sortie longue : `L = min(Lpct × V, Lmax, 1,10 × L la plus longue sur 30 j)` ; `Lpct` = 40/35/30 % pour 3/4/5 courses ; `Lmax` = 90 (5 km), 105 (10 km), 120 (semi), 150 (marathon ; 180 si V ≥ 300)                                                                                                                                                       | Lpct défaut à calibrer                  | Daniels ; Frandsen 2025                    | OBS    |
| P15 | Reste du volume en E (≥ 30 min) et RECUP (20 à 40 min)                                                                                                                                                                                                                                                                                                    |                                         |                                            | CONS   |
| P16 | Distribution hebdo (temps planifié) : Z1 ≥ 75 % (≥ 90 % en Base), Z3 ≤ 10 %. Sinon réduire d'abord la Q la plus intense                                                                                                                                                                                                                                   |                                         | Rosenblat 2025 ; Festa 2020                | MA     |
| P17 | Progression des Q par semaine de charge : +1 fraction ou +1 à 2 min par fraction, allure inchangée                                                                                                                                                                                                                                                        |                                         | Daniels                                    | CONS   |
| P18 | Affûtage (en % de `V_pic`) : 5 et 10 km : semaine de course 50 % (10 km avec `S_tot` ≥ 14 : S-2 70 %) ; semi : S-2 70 %, S-1 50 % ; marathon : S-3 80 %, S-2 62 %, S-1 45 %. Fréquence ≥ 80 % des courses habituelles ; Q gardées, fractions × 0,55, même allure ; dernière Q à J-4 ; dernière L à J-14 (semi), J-21 (marathon)                           |                                         | Bosquet 2007 ; Wang 2023                   | MA     |
| P19 | Faisabilité : `P0 = predictTime(VDOT, D)` (F5, F6) ; `g = (P0 - T_cible)/P0` ; `g_max = min(r × (S_tot - S_aff), plafond)` avec r/plafond : reprise 0,6 %/12 % ; régulier 0,35 %/7 % ; avancé 0,15 %/3 %. Classe : `g ≤ 0,5·g_max` conservateur ; `≤ g_max` réaliste ; `≤ 1,5·g_max` ambitieux ; au-delà irréaliste                                       | r et plafonds défaut à calibrer         | Muñoz 2014 (≈ 0,4 %/sem)                   | OP     |
| P20 | Chrono proposé (décision : ambitieux mais atteignable, jamais pessimiste) : `T_prop = P0 × (1 - g_max)`, arrondi aux 30 s les plus proches. C'est le chrono le plus rapide encore classé réaliste. Proposé si pas de cible ou si cible irréaliste. Anna tranche. Si VDOT provisoire : classement marqué provisoire jusqu'au test                          | facteur 1,0 × `g_max` défaut à calibrer | règle de conception                        | OP     |
| P21 | Les allures d'entraînement viennent du VDOT actuel, jamais de la cible. Les blocs à allure de course utilisent l'allure cible seulement si la cible est au plus ambitieuse                                                                                                                                                                                |                                         | Daniels                                    | CONS   |
| P22 | Replanification hebdo (dimanche) à partir du **réalisé** : si réalisé < 80 % du prévu deux semaines de suite → pas de hausse, et phase décalée d'1 sem. si la marge le permet, sinon Dév compressé                                                                                                                                                        | 80 %                                    | règle de conception                        | OP     |
| P23 | Après la course : 1 semaine à 45 % du volume habituel, footings seuls, puis M9                                                                                                                                                                                                                                                                            | 45 % défaut à calibrer                  |                                            | OP     |

### Tests

| #    | Entrée                                                                                    | Sortie attendue                                                    |
| ---- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P-1  | `phaseSplit` semi, aujourd'hui lundi 2026-11-16, course dimanche 2027-03-21, base normale | `S_tot` 17 ; taper 2, base 5, dev 5, spe 5, `short: false`         |
| P-2  | `phaseSplit` 5 km, `S_tot` = 4                                                            | taper 1, base 1, dev 0, spe 2, `short: true`                       |
| P-3  | `phaseSplit` marathon, `S_tot` = 14                                                       | taper 2, base 4, dev 4, spe 4, `short: false`                      |
| P-4  | `phaseSplit` semi, `S_tot` 17, `lowBase: true`                                            | base 10, dev 0, spe 5, taper 2                                     |
| P-5  | `peakVolume` semi, V0 150, 8 semaines de charge, max 12 mois 200                          | `vPeak` 240 (min(330 ; 321,5 ; 240)), pas d'avertissement          |
| P-6  | `peakVolume` marathon, V0 90, 6 semaines de charge, max 12 mois 150                       | `vPeak` 159,4 → avertissement `peak_below_min` (< 240)             |
| P-7  | Cycle : âge 42, sans blessure                                                             | 2:1                                                                |
| P-8  | `volumeCurve` 3:1, V0 150, V_pic 240, 4 premières semaines                                | 165, 181,5, 199,7, 149,7                                           |
| P-9  | L : 3 courses, V 200, semi, plus longue sur 30 j 80                                       | 80 (min(80 ; 120 ; 88))                                            |
| P-10 | `feasibility(110, 105, 15, régulier)`                                                     | g 0,0455 ; g_max 0,0525 ; réaliste ; `proposedMin` 104,0 (1:44:00) |
| P-11 | `feasibility(110, 100, 15, régulier)`                                                     | g 0,0909 > 0,0788 → irréaliste ; propose 1:44:00                   |
| P-12 | `feasibility(110, 108, 15, régulier)`                                                     | g 0,0182 ≤ 0,0263 → conservateur                                   |
| P-13 | `feasibility(110, undefined, 30, régulier)`                                               | g_max plafonné à 0,07 ; propose 102,3 → 1:42:30                    |
| P-14 | Semaine Base, 4 courses                                                                   | `['E+strides', 'E', 'E+COTES_C', 'L']`, 0 Q                        |
| P-15 | Distribution prévue Z3 = 12 %                                                             | la Q de type I perd des fractions jusqu'à Z3 ≤ 10 %                |
| P-16 | `replanFromActual` : réalisé 70 % puis 75 % du prévu                                      | semaine suivante = volume de la dernière semaine, pas de hausse    |

---

## M3. `catalog` : séances

### Signatures

```ts
buildSession(type: RunType, ctx: { weeklyMin: number; paces: Paces; phase: Phase; progressionStep: number; distM: number }): Session
sessionLoad(s: Session): number             // Σ durée d'étape × RPE cible de l'étape (UA prévues)
isHard(s: Session): boolean
equivalents(s: Session, paces: Paces): Session[]   // même objectif, charge ≤ prévue
feelToRpe(feel: 'easy'|'ok'|'hard', rpeTarget: number): number
```

### Catalogue (défauts)

Q = échauffement 15 min E + corps + retour au calme 10 min E (défaut à calibrer). `V_km = V_min / allure E moyenne`.

| Type    | Corps de séance                                    | RPE cible | Dure                   | Plafond par séance                                             | Progression                                | Source           | Niveau |
| ------- | -------------------------------------------------- | --------- | ---------------------- | -------------------------------------------------------------- | ------------------------------------------ | ---------------- | ------ |
| E       | continu, plafond FC haut de E                      | 3         | non                    | 30 à 75 min                                                    | durée                                      | Daniels          | CONS   |
| RECUP   | très lent                                          | 2         | non                    | 20 à 40 min, ≤ 0,6 × un E                                      | aucune                                     | Daniels          | CONS   |
| L       | continu E, bloc spécifique possible en Spé         | 4         | oui                    | P14                                                            | +5 à 10 min/sem, ≤ 1,10 × plus longue 30 j | Frandsen 2025    | OBS    |
| T       | continu au seuil                                   | 7         | oui                    | ≤ 0,10 × `V_km` en distance, continu ≤ 20 min                  | 15 → 20 min, puis CRUISE                   | Daniels          | CONS   |
| CRUISE  | fractions T 5 à 15 min, récup 1 min par 5 min      | 7         | oui                    | idem T                                                         | 3×5 → 3×10 → 2×15 min                      | Daniels          | CONS   |
| I       | fractions 3 à 5 min à I, récup = durée de l'effort | 8         | oui                    | ≤ min(0,08 × `V_km`, 10 km), fraction ≤ 5 min                  | 5×3 → 5×4 → 5×5 min                        | Bacon 2013       | MA     |
| R       | 200 à 400 m à R, récup 2 à 3 × l'effort            | 8         | oui si ≥ 3 km          | ≤ min(0,05 × `V_km`, 8 km)                                     | +1 répétition                              | Daniels          | CONS   |
| SPE     | blocs à l'allure de course (M ou semi)             | 6         | oui                    | M ≤ min(0,20 × `V_km`, 29 km) ; semi 2×3 → 3×4 km → 12 à 16 km | % de la distance à l'allure                | Daniels ; Canova | CONS   |
| COTES_C | 6 à 10 × 8 à 12 s, récup complète, dans un E       | 3         | non                    | ≤ 2 min d'effort                                               | +2 répétitions                             | Hudson 2008      | CONS   |
| COTES_L | 6 à 10 × 60 à 120 s en côte                        | 8         | oui                    | comme I                                                        | +1 répétition                              | Daniels          | CONS   |
| FARTLEK | variations libres dans un E                        | 5         | oui si > 6 min rapides | 6 à 20 min rapides cumulées                                    | +2 min                                     | Lydiard          | CONS   |
| strides | 4 à 8 × 15 à 20 s en fin de E                      | n/a       | non                    | ≤ 3 min d'effort                                               | aucune                                     | Daniels          | CONS   |
| TEST    | 5 km à fond, ou 30 min à fond (donne VDOT + LTHR)  | 9         | oui                    |                                                                |                                            | Friel 2016       | CONS   |

### Règles

| Id  | Règle                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Paramètres                                         | Source              | Niveau |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------- | ------ |
| C1  | Dimensionnement : nombre de fractions = `floor(plafond / durée de fraction)`, minimum 2 ; durée continue arrondie à la minute inférieure                                                                                                                                                                                                                                                                                                                     |                                                    |                     | OP     |
| C2  | Équivalent (Changer) : même famille d'abord. I : fractions de 3 min si la fraction prévue > 3 min, sinon 4 min ; nombre = `floor(temps à I prévu / nouvelle durée)`. T ↔ CRUISE, temps au seuil réduit jusqu'à ce que durée totale et charge soient ≤ prévues (récupérations comprises). SPE : blocs plus courts à temps égal ou inférieur. L : aucun équivalent (option absente). Si aucune forme de même famille : un cran en dessous (I → T, T → FARTLEK) | contrôle `sessionLoad(équiv) ≤ sessionLoad(prévu)` | règle de conception | OP     |
| C3  | Ressenti (vivoactive 4 sans auto-évaluation) : `easy` = cible - 2, `ok` = cible, `hard` = cible + 2 (borné 1 à 10). Ressenti absent : RPE = cible, charge marquée `estimated`, jamais utilisée pour une règle restrictive                                                                                                                                                                                                                                    |                                                    | Foster 2001         | ECR    |
| C4  | Allure E affichée en plage, jamais en cible unique                                                                                                                                                                                                                                                                                                                                                                                                           |                                                    | Daniels             | CONS   |

### Tests

| #   | Entrée                                                                                          | Sortie attendue                                     |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| C-1 | `buildSession('T', { weeklyMin: 200, paces: VDOT 40 })` (E moyenne 6:25 → `V_km` 31,2 ; T 5:03) | corps 15 min continus (plafond 3,12 km = 15,7 min)  |
| C-2 | `buildSession('I', idem)`                                                                       | plafond 2,49 km = 11,5 min → 3 × 3 min, récup 3 min |
| C-3 | `isHard` : L de 75 min ; E+strides ; FARTLEK 5 min rapides ; R 2,4 km                           | true ; false ; false ; false                        |
| C-4 | `equivalents` de 6 × 800 m à I (VDOT 40, 3,68 min par fraction, 22,1 min à I)                   | 7 × 3 min, récup 3 min ; `sessionLoad` ≤ prévue     |
| C-5 | `equivalents` d'une L                                                                           | `[]`                                                |
| C-6 | `equivalents` d'un T continu 20 min (140 UA)                                                    | CRUISE 2 × 9 min, récup 2 min (20 min, 130 UA)      |
| C-7 | `feelToRpe('hard', 3)` ; `('easy', 2)` ; `('hard', 9)`                                          | 5 ; 1 (borné) ; 10 (borné)                          |
| C-8 | `sessionLoad` : 15 min E (3) + 4 × 5 min T (7) + 3 × 1 min récup (2) + 10 min E (3)             | 45 + 140 + 6 + 30 = 221 UA                          |

---

## M4. `placement` : solveur de contraintes

### Signatures

```ts
freeSlots(day: string, cal: CalEvent[], s: Settings, durMin: number): Slot[]          // pas de 30 min
checkHard(session: Session, slot: Slot, week: WeekState, s: Settings): Violation[]    // [] = valide
softPenalty(session: Session, slot: Slot, week: WeekState, s: Settings): { total: number; items: { id: string; pts: number }[] }
placeWeek(sessions: Session[], cal: CalEvent[], s: Settings, prevWeek?: WeekState): { week: WeekState; relaxations: string[] }
replan(week: WeekState, trigger: Trigger, now: string): { week: WeekState; proposals: MoveProposal[] }
proposeMoveSlots(sessionId: string, week: WeekState, now: string): { best: SlotWithReason[3]; forbidden: { slot: Slot; reason: string }[]; sideEffects: Change[] }
```

### Contraintes dures

| Id  | Règle                                                                                                                   | Paramètres                           | Source                    | Niveau |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------- | ------ |
| H1  | Aucun chevauchement avec cours, examen, muscu, révision, indispo, tampons compris                                       | avant = `travelMin` ; après = 30 min | onboarding                | OP     |
| H2  | Début ≥ `earliest`, fin ≤ `latestEnd`, jamais un jour de `noRunDays`                                                    | réglages                             | choix d'Anna              | OP     |
| H3  | Au plus 1 course par jour                                                                                               |                                      | Runna                     | CONS   |
| H4  | Jamais deux séances dures des jours calendaires consécutifs                                                             | relâchable (R-a)                     | Seiler 2010               | CONS   |
| H5  | Muscu jambes → séance dure (Q ou L) : `début(dure) - fin(jambes) ≥ 24 h` (12 h si bloc marqué léger)                    | 24 h                                 | Doma 2013 ; Robineau 2016 | ECR    |
| H6  | Dure et jambes le même jour : la course avant, écart ≥ 1 h                                                              | 1 h                                  | Doma 2013                 | ECR    |
| H7  | Toute course finit ≥ 1 h avant `bedtime`                                                                                | 1 h                                  | Stutz 2019                | MA     |
| H8  | L en un seul bloc                                                                                                       |                                      |                           | OP     |
| H9  | Gel : une séance qui commence dans moins de 12 h n'est jamais déplacée automatiquement ; l'algo renvoie une proposition | 12 h                                 | décision produit          | OP     |
| H10 | Séance `manual` ou faite : fixe. Si elle viole une règle, avertir sans bloquer                                          |                                      | Runna                     | CONS   |
| H11 | Muscu, révision, cours, examen : jamais déplacés ni supprimés par l'algo                                                |                                      | décision produit          | OP     |

### Contraintes souples (points)

| Id  | Règle                                                                    | Pénalité             | Source                           | Niveau |
| --- | ------------------------------------------------------------------------ | -------------------- | -------------------------------- | ------ |
| S1  | Dure finie < 4 h avant `bedtime`                                         | 30                   | Leota 2025                       | OBS    |
| S2  | Jambes → dure avec un écart de 24 à 48 h                                 | 40 × (48 - écart)/24 | Doma 2017                        | ECR    |
| S3  | Jambes → E avec un écart < 6 h                                           | 15                   | Doma 2013                        | ECR    |
| S4  | Dure suivie de jambes le même jour avec un écart < 6 h                   | 10                   | Robineau 2016                    | ECR    |
| S5  | Dure la veille d'un examen et finie < 4 h avant `bedtime`                | 50                   | analogie Leota 2025, Craven 2022 | OP     |
| S6  | Course dans les 3 h avant un examen                                      | 40                   |                                  | OP     |
| S7  | Écart à `preferredHour`                                                  | 5 par heure, max 20  | préférence                       | OP     |
| S8  | L hors `preferredLongDay`                                                | 20                   | Runna                            | CONS   |
| S9  | Jour ou heure (> 2 h) différents de la même séance la semaine précédente | 5                    | Bruggisser 2023                  | MA     |
| S10 | > 2 jours consécutifs sans course (si ≥ 3 courses)                       | 10                   |                                  | OP     |
| S11 | Muscu non jambes < 3 h avant une dure                                    | 5                    |                                  | OP     |
| S12 | Deux dures à moins de 48 h (H4 respectée)                                | 10                   |                                  | CONS   |

Toutes les pénalités : défaut à calibrer.

### Algorithme

| Étape | Règle                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | Placer dans l'ordre de priorité : L, Q1, Q2, E, RECUP (pour 5 et 10 km : Q1 avant L). Recherche avec retour arrière sur les créneaux de `freeSlots` filtrés par `checkHard`, triés par pénalité croissante                                                                                                                                                                                      |
| A2    | Objectif lexicographique : (1) contraintes dures ; (2) en replanification, coût de perturbation : nb de séances déplacées, puis nb de changements de jour, puis somme des décalages en heures ; (3) somme des pénalités souples ; (4) départage : créneau le plus tôt, puis `id` le plus petit. Exception à (2) : une solution qui bouge une séance de plus l'emporte si elle gagne ≥ 50 points |
| A3    | Ordre d'essai en replanification : autre créneau le même jour, puis échange avec une autre course de la semaine, puis autre jour                                                                                                                                                                                                                                                                |
| A4    | Infaisable : relâcher dans l'ordre (a) H4 devient souple à 100 points ; (b) raccourcir un E jusqu'à -30 % ; (c) supprimer un E ; (d) dégrader une Q en E. Jamais supprimer la L ni la dernière Q sans `warning` explicite                                                                                                                                                                       |
| A5    | Périmètre : semaine en cours et suivante. Séances faites, `manual`, gelées (H9) : fixes                                                                                                                                                                                                                                                                                                         |
| A6    | `proposeMoveSlots` : 3 meilleurs créneaux valides de la semaine en cours avec une raison courte (pénalité dominante évitée) ; liste des créneaux interdits avec la raison de la première violation ; effets de bord annoncés avant validation                                                                                                                                                   |

### Tests

Contexte commun : `earliest` 07:00, `latestEnd` 22:30, `bedtime` 23:00, `travelMin` 0, semaine du lundi 2026-11-23, muscu jambes mardi 18:00 à 19:00.

| #     | Entrée                                                                                            | Sortie attendue                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PL-1  | `checkHard` Q 60 min mercredi 17:00                                                               | violation H5 « Moins de 24 h après ta séance jambes » (22 h)                                                                                                                |
| PL-2  | `checkHard` Q 60 min mercredi 19:30                                                               | `[]` (24 h 30) ; `softPenalty` contient S2 = 40 × 23,5/24 = 39,2 et S1 = 30 (fin 20:30, 2 h 30 avant le coucher)                                                            |
| PL-3  | `checkHard` E 45 min lundi 21:30                                                                  | violation H7 (fin 22:15 > 22:00)                                                                                                                                            |
| PL-4  | `checkHard` E 45 min lundi 06:30                                                                  | violation H2                                                                                                                                                                |
| PL-5  | `placeWeek` : 4 courses (Q1, E, Q2, L), seuls créneaux libres lundi à jeudi soir                  | 3 dures sur 4 jours consécutifs : infaisable sous H4 → `relaxations: ['A4a']`, une seule paire de jours durs consécutifs, `warning` ; résultat identique à chaque exécution |
| PL-6  | Deux créneaux de coût égal, mardi 07:00 et mardi 12:00                                            | mardi 07:00                                                                                                                                                                 |
| PL-7  | `replan` : nouveau cours jeudi 17:00 à 19:00 chevauchant un E jeudi 18:00, `now` = mercredi 10:00 | E déplacé jeudi 19:30 (même jour), 1 seul changement                                                                                                                        |
| PL-8  | `replan` : même chose avec `now` = jeudi 08:00 (séance dans 10 h)                                 | séance non déplacée ; `proposals` = 3 créneaux à confirmer                                                                                                                  |
| PL-9  | Séance `manual` L samedi, la veille d'une Q dimanche                                              | la L reste ; `warning` H4 ; la Q dimanche est déplacée si possible, sinon dégradée en E                                                                                     |
| PL-10 | Replan : solution A bouge 1 séance (pénalité 60), solution B en bouge 2 (pénalité 20)             | A (gain 40 < 50)                                                                                                                                                            |
| PL-11 | `proposeMoveSlots` Q, aucun créneau valide dans la semaine                                        | `best: []`, et l'action propose « Remplacer par un footing ce soir » ou « Passer cette séance »                                                                             |

---

## M5. `readiness` : lignes de base et décision du matin

### Signatures

```ts
baseline(values: { date: string; v?: number }[], excludeDates: string[], now: string, window = 28):
  { mean: number; sd: number; median: number; n: number } | null
dailySignals(today: DailySignal, history: DailySignal[], ctx: { lastFeels: FeelLog[]; cal: CalEvent[]; sick: string[]; settings: Settings }):
  { signals: SignalId[]; missing: SignalId[]; usedDefaults: SignalId[] }
isConfirmed(today: SignalId[], yesterday: SignalId[] | null): boolean
dailyDecision(session: Session | null, signals: SignalId[], yesterday: SignalId[] | null, now: string):
  { action: 'keep'|'easier'|'shorter'|'proposeRest'|'none'; frozen: true; ruleIds: string[] }
```

### Lignes de base personnelles (décision : sa norme, pas des seuils universels)

| Id  | Règle                                                                                                                                                                                                                                                | Paramètres        | Source                            | Niveau |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- | ------ |
| B1  | Fenêtre glissante 28 j se terminant la veille, jours de maladie exclus. Moyenne et écart-type (échantillon) ; médiane pour le sommeil                                                                                                                | 28 j              | Plews 2013 (méthode) ; Walsh 2021 | CONS   |
| B2  | Ligne de base valide si n ≥ 14 valeurs. Sinon : défauts de la recherche (B3)                                                                                                                                                                         | 14                |                                   | OP     |
| B3  | Défauts sans historique suffisant : FC repos : si n ≥ 7, seuil = moyenne disponible + 5 bpm ; si n < 7, signal ignoré. Sommeil : seuil = min(6 h, 8 h - 1,5 h) avec 8 h ou la valeur déclarée. Body Battery et stress : ignorés (aucun seuil validé) | 5 bpm ; 6 h       | Buchheit 2014 ; Craven 2022       | OBS    |
| B4  | Écart-type plancher pour éviter les seuils trop serrés : FC repos 1,5 bpm ; sommeil 30 min ; Body Battery 5 ; stress 3                                                                                                                               | défaut à calibrer |                                   | OP     |

### Signaux du matin

| Id  | Signal (vrai = négatif)                                                                                             | Seuil personnel                                                                 | Source                         | Niveau |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ | ------ |
| SG1 | FC repos                                                                                                            | `rhr_J ≥ μ + max(2σ, 3 bpm)`                                                    | Buchheit 2014                  | OBS    |
| SG2 | Sommeil                                                                                                             | `sommeil_J-1 ≤ médiane - max(2σ, 60 min)` OU moyenne 3 nuits ≤ médiane - 60 min | Craven 2022 ; Walsh 2021       | MA     |
| SG3 | Garmin (Body Battery et stress comptent pour **un seul** signal, car tous deux dérivés de la même mesure Firstbeat) | `BB_réveil ≤ μ - 2σ` OU `stress_J-1 ≥ μ + 2σ`                                   | aucune validation indépendante | OP     |
| SG4 | Ressenti                                                                                                            | dernière course des 48 h notée `hard` alors que RPE cible ≤ 4                   | Foster 2001                    | ECR    |
| SG5 | Examen                                                                                                              | examen dans l'ICS à J ou J+1                                                    | Hamlin 2019 ; Mann 2016        | OBS    |

### Décision (une fois par jour, puis gel)

| Id  | Règle                                                                                                                                                                                       | Paramètres                   | Source                             | Niveau |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------- | ------ |
| D1  | Moment : à la première synchro qui contient la nuit. Sans synchro avant `min(10:00, début de séance - 2 h)` : décider avec les signaux présents ; signaux absents = ignorés, jamais imputés | 10:00, 2 h défaut à calibrer | Run Coach (reproche d'instabilité) | OP     |
| D2  | Confirmation : `N_J ≥ 2` signaux distincts, OU un même signal vrai à J-1 et à J. Sinon `keep`                                                                                               |                              | décision produit                   | OP     |
| D3  | Séance dure, confirmé, N < 4 → `easier` (E même durée, RPE ≤ 3, pilotage FC)                                                                                                                |                              | Vesterinen 2016 (principe) ; CONS  | ECR    |
| D4  | Séance facile, confirmé : N ≤ 2 → `keep` ; N = 3 → `shorter` (-25 %)                                                                                                                        |                              |                                    | CONS   |
| D5  | N ≥ 4 (toute séance) → `proposeRest` : la séance reste, Anna choisit repos ou maintien                                                                                                      |                              |                                    | CONS   |
| D6  | Séance `manual`, déjà changée par Anna, ou déjà commencée : `none` (information seulement)                                                                                                  |                              | décision produit                   | OP     |
| D7  | Après décision : `frozen = true`. Aucune autre modification automatique ce jour, même si de nouvelles données arrivent                                                                      |                              | décision produit                   | OP     |
| D8  | Interrupteur « Sommeil et fréquence cardiaque » désactivé : SG1 à SG3 ignorés, seuls SG4 et SG5 comptent                                                                                    |                              | réglage                            | OP     |
| D9  | Aucune décision ne peut alourdir, allonger ou déplacer la séance                                                                                                                            |                              | décision produit                   | OP     |

### Tests

Ligne de base commune (28 valeurs) : FC repos μ 52, σ 2 ; sommeil médiane 450 min, σ 40 ; BB μ 70, σ 10 ; stress μ 30, σ 6.

| #     | Entrée                                                       | Sortie attendue                                            |
| ----- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| RD-1  | Q prévue ; FC repos 57, le reste normal ; veille sans signal | signaux [SG1] ; `keep`                                     |
| RD-2  | Q prévue ; FC repos 57 et sommeil 310 min                    | [SG1, SG2] ; `easier`                                      |
| RD-3  | Q prévue ; FC repos 57 aujourd'hui, SG1 déjà vrai hier       | confirmé ; `easier`                                        |
| RD-4  | E prévu ; SG1, SG2, SG3                                      | `shorter` (-25 %)                                          |
| RD-5  | E prévu ; SG1, SG2, SG3, SG4                                 | `proposeRest`                                              |
| RD-6  | BB 45 et stress 45 (les deux hors norme), rien d'autre       | [SG3] seul ; `keep`                                        |
| RD-7  | 10 jours d'historique ; FC repos moyenne 52 ; aujourd'hui 56 | seuil défaut +5 → pas de SG1 ; `usedDefaults` contient SG1 |
| RD-8  | 5 jours d'historique, sommeil 5 h 40                         | SG1 ignoré ; SG2 vrai (< 6 h) ; N = 1 → `keep`             |
| RD-9  | Aucune synchro à 10:00                                       | `missing` = [SG1, SG2, SG3] ; `keep`                       |
| RD-10 | Séance déplacée à la main hier, SG1 et SG2 vrais             | `none`                                                     |
| RD-11 | Décision prise à 08:00 ; nouvelle synchro à 14:00 avec SG2   | aucun changement (gel)                                     |
| RD-12 | σ FC repos calculé = 0,5                                     | plancher 1,5 → seuil μ + 3                                 |

---

## M6. `guards` : charge et progression

### Signatures

```ts
spikeCap(s: Session, longest30dMin: number, longest30dM?: number): { session: Session; surplusMin: number }
weeklyCaps(week: Session[], prev: WeekActual[]): { week: Session[]; changes: Change[] }
distributionCheck(week: Session[], phase: Phase): { ok: boolean; z1: number; z3: number }
validateWeek(week: WeekState, ctx: Ctx): { ok: boolean; violations: { ruleId: string; sessionId: string }[] }
```

### Règles

| Id  | Règle                                                                                                                                                                                                                                                                 | Paramètres        | Source                      | Niveau |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------- | ------ |
| G1  | Pic de séance : durée ≤ 1,10 × plus longue course des 30 j ; distance prévue (durée × allure) ≤ 1,10 × plus longue distance des 30 j. Le surplus va sur un E de la semaine si cet E reste sous G1, sinon il est perdu                                                 | 1,10              | Frandsen 2025               | OBS    |
| G2  | Semaine : volume course 7 j ≤ 1,10 × 7 j précédents (souple : alléger les séances de priorité la plus basse d'abord)                                                                                                                                                  | 1,10              | Damsted 2019                | OBS    |
| G3  | 14 j ≤ 1,30 × 14 j précédents (dur)                                                                                                                                                                                                                                   | 1,30              | Damsted 2019 ; Nielsen 2014 | OBS    |
| G4  | 3 semaines de hausse sans semaine allégée → semaine suivante -25 %                                                                                                                                                                                                    |                   |                             | CONS   |
| G5  | Muscu exclue de tous les compteurs (décision)                                                                                                                                                                                                                         |                   | décision produit            | OP     |
| G6  | Charge interne sRPE (course seulement) = RPE × durée ; affichage CTL/ATL (τ 42/7 j) sans décision                                                                                                                                                                     |                   | Foster 2001 ; Banister 1991 | ECR    |
| G7  | Reprise après arrêt sans maladie ni douleur (jours sans course n) : 3 à 6 j → S1 85 %, première séance facile ; 7 à 13 j → S1 70 %, pas de Q, allures -2 % en S2 ; 14 à 27 j → S1 55 %, Q en S2, allures -4 % ; ≥ 28 j → S1 45 %, footings seuls 2 sem., test proposé | défaut à calibrer | Mujika & Padilla 2000       | OP     |
| G8  | `validateWeek` = H1 à H11 + G1 + G3 + P11 (≤ 2 Q + L) + Changer jamais au-dessus de la charge prévue. Toute action de Reggie passe ici                                                                                                                                |                   |                             |        |

### Tests

| #   | Entrée                                                                           | Sortie attendue                                      |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| G-1 | L prévue 100 min, plus longue sur 30 j 80 min, un E de 40 min (plus longue 80)   | L 88 min ; E 52 min                                  |
| G-2 | L prévue 100, plus longue 80, aucun E sous plafond                               | L 88 ; surplus perdu ; `change` G1                   |
| G-3 | 7 j prévus 220 min, 7 j précédents 190                                           | 220 > 209 → E de priorité 4 ou 5 réduits jusqu'à 209 |
| G-4 | 14 j prévus 400, 14 j précédents 300                                             | 400 > 390 → réduction obligatoire à 390              |
| G-5 | Semaine avec 4 h de muscu jambes et 180 min de course, semaine d'avant 180       | aucun changement (muscu non comptée)                 |
| G-6 | `validateWeek` : Reggie propose une Q lundi et une Q mardi                       | `ok: false`, violation H4                            |
| G-7 | `validateWeek` : option Changer de charge 240 UA pour une séance prévue à 221 UA | `ok: false`, violation `CHANGE_LOAD`                 |
| G-8 | Arrêt de 10 j, puis semaine prévue 200 min                                       | S1 140 min, aucune Q                                 |

---

## M7. `events` : actions des boutons et de Reggie

### Signatures

```ts
moveSession(st: State, id: string, slot: Slot, now: string): Result                         // Déplacer
changeOptions(st: State, id: string): { shorter: Session; easier: Session; equivalent?: Session; jog30: Session }
applyChange(st: State, id: string, option: 'shorter'|'easier'|'equivalent'|'jog30', now: string): Result
reportUnavailable(st: State, r: Unavailable, now: string): Result
  // Unavailable = { reason: 'no_time' } | { reason: 'tired' } | { reason: 'sick'; feverOrChest: boolean }
  //             | { reason: 'pain'; where: 'mollet'|'genou'|'cheville'|'hanche'|'pied'|'autre'; walking0to10: number }
  //             & { until?: string }   // absent = aujourd'hui seulement ; ignoré pour 'sick'
feelBetter(st: State, now: string): Result                                                  // « Ça va mieux »
updateSettings(st: State, patch: Partial<Settings>, now: string): Result
onTimetableChange(st: State, newEvents: CalEvent[], now: string): Result
detectMissed(st: State, activities: Activity[], lastSync: string, now: string): Result
logFeel(st: State, sessionId: string, feel: 'easy'|'ok'|'hard'): Result
```

Tout `Result` porte `manual: true` sur ce qu'Anna a choisi, passe par `validateWeek`, et contient l'état antérieur nécessaire à Annuler.

### Règles

| Id   | Règle                                                                                                                                                                                                                                                                                                                                                                                          | Paramètres | Source                                    | Niveau |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------- | ------ |
| EV1  | Déplacer : garde le contenu. Créneau valide → appliqué, `manual`. Si une autre course doit bouger, l'annoncer avant validation. Créneau forcé qui viole H4, H5 ou H7 : accepté, avertissement d'une ligne, contenu adapté (Q → E de même durée)                                                                                                                                                |            | interactions.md ; Runna                   | CONS   |
| EV2  | Changer, plus court : fractions × 0,75 arrondi à l'inférieur (min 2), ou durée continue × 0,75 arrondie aux 5 min                                                                                                                                                                                                                                                                              | -25 %      | Mujika & Padilla 2000 (alléger)           | CONS   |
| EV3  | Changer, plus facile : même durée totale, tout en E, RPE ≤ 3                                                                                                                                                                                                                                                                                                                                   |            |                                           | CONS   |
| EV4  | Changer, équivalente : C2 ; absente si C2 ne renvoie rien                                                                                                                                                                                                                                                                                                                                      |            |                                           | OP     |
| EV5  | Changer, footing tranquille : `min(30, durée prévue)` min en E                                                                                                                                                                                                                                                                                                                                 |            |                                           | OP     |
| EV6  | Aucune option Changer ne dépasse `sessionLoad` prévue ni la durée prévue                                                                                                                                                                                                                                                                                                                       |            | décision produit                          | OP     |
| EV7  | Pas le temps : `proposeMoveSlots` dans la semaine en cours ; si vide → statut `skipped`, jamais rattrapée                                                                                                                                                                                                                                                                                      |            | Runna                                     | CONS   |
| EV8  | Fatiguée : séance du jour → repos. Si la prochaine séance dure tombe demain → `shorter` (-25 %). Avec `until` : repos chaque jour jusqu'à la date, puis G7 selon la durée                                                                                                                                                                                                                      |            | interactions.md                           | CONS   |
| EV9  | Malade, fièvre ou poitrine = oui : statut `pause`, toutes les courses annulées jusqu'à `feelBetter`. Puis semaine de retour : J1 à J3 E seuls, ≤ 50 % des durées prévues, ≤ 30 min ; J4 à J7 ≤ 75 %, une Q possible à partir de J5 dégradée d'un cran (I → T) et × 2/3 ; si la pause a duré ≥ 14 j, appliquer G7 à la place si plus prudent                                                    | 7 j        | Schwellnus 2022 ; Elliott 2020            | CONS   |
| EV10 | Malade, non (au-dessus du cou) : statut `rhume` jusqu'à `feelBetter`. Chaque jour : séance → repos, avec option footing très facile `min(0,5 × durée prévue, 30)` min, RPE ≤ 3. Aucune Q                                                                                                                                                                                                       |            | Weidner 1998                              | ECR    |
| EV11 | Douleur 0 à 3 en marchant : séance → footing très facile (`min(durée prévue, 30)` min, RPE ≤ 3, pilotage RPE) ou vélo facile de même durée, au choix. Aucune Q tant que le statut dure                                                                                                                                                                                                         | 0 à 3      | Silbernagel 2007 (modèle de surveillance) | ECR    |
| EV12 | Douleur ≥ 4 : aucune course tant que le statut dure. Si une douleur ≥ 4 est signalée sur une période de plus de 3 jours : message « voir un kiné ou un médecin » (une fois par épisode). Retour : G7 selon la durée                                                                                                                                                                            | 4 ; 3 j    | Silbernagel 2007 ; consensus orientation  | CONS   |
| EV13 | `feelBetter` ne lève qu'un statut `pause`, `rhume` ou `douleur`, et lance le retour (EV9 ou G7). Il n'est jamais déduit d'un message ambigu par Reggie : il faut le bouton ou une réponse oui explicite                                                                                                                                                                                        |            | recherche 03 §10.3                        | CONS   |
| EV14 | Réglages : semaine en cours et suivantes replacées (M4), séances `manual` gardées. Changement d'objectif : semaines futures régénérées (M2), semaine en cours inchangée sauf conflit dur                                                                                                                                                                                                       |            | interactions.md                           | OP     |
| EV15 | Emploi du temps : diff ICS (ajouts, suppressions, changements d'heure) ; seules les séances en conflit ou dont une règle dépend (H1, H5 via muscu, S5, S6) sont replanifiées (M4). Séances < 12 h : proposition seulement                                                                                                                                                                      |            | décision produit                          | OP     |
| EV16 | Séance ratée : prévue, jour terminé, synchro postérieure à la fin du jour, aucune course ≥ 50 % de la durée prévue ce jour-là → `missed`. Jamais rattrapée, jamais échangée. La semaine est revérifiée (G1 à G3, H4) sans ajout. Si une course a eu lieu un autre jour sans séance prévue : rattachée à la séance la plus proche de J-1 à J+1 non faite, traitée comme un déplacement par Anna | 50 %       | Runna ; décision produit                  | CONS   |
| EV17 | Synchro absente ou plus ancienne que la fin du jour : pas de `missed`, statut inconnu ; l'app demande « Tu as couru ? »                                                                                                                                                                                                                                                                        |            |                                           | OP     |
| EV18 | Message de Reggie signalant douleur thoracique, palpitations ou malaise : branche EV9 + drapeau `orientation: 'urgente'` (message consulter rapidement)                                                                                                                                                                                                                                        |            | Elliott 2020                              | CONS   |

### Tests

| #     | Entrée                                                                            | Sortie attendue                                                                    |
| ----- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| EV-1  | Déplacer Q jeudi → mercredi 19:30 (jambes mardi 18:00 à 19:00)                    | appliqué, `manual: true`, montre à mettre à jour                                   |
| EV-2  | Déplacer Q forcé mercredi 17:00 (violation H5)                                    | appliqué en E de même durée ; `warning` « Moins de 24 h après ta séance jambes »   |
| EV-3  | `changeOptions` 6 × 800 m I                                                       | shorter 4 × 800 m ; easier même durée en E ; equivalent 7 × 3 min ; jog30 30 min E |
| EV-4  | `changeOptions` RECUP 25 min                                                      | jog30 = 25 min ; equivalent absent                                                 |
| EV-5  | Pas le temps, créneau libre ce soir 19:30                                         | 3 créneaux proposés, rien d'appliqué avant choix                                   |
| EV-6  | Pas le temps, aucun créneau                                                       | statut `skipped` ; aucune séance ajoutée ailleurs                                  |
| EV-7  | Fatiguée aujourd'hui, Q prévue demain                                             | aujourd'hui repos ; Q de demain × 0,75                                             |
| EV-8  | Fatiguée aujourd'hui, prochaine Q dans 3 jours                                    | aujourd'hui repos ; Q inchangée                                                    |
| EV-9  | Malade oui ; `feelBetter` 5 jours après ; E prévu 45 min à J1                     | J1 E 22 min (≤ 50 %, ≤ 30) ; aucune Q avant J5                                     |
| EV-10 | Malade non ; Q 50 min prévue                                                      | repos, option footing 25 min RPE ≤ 3 ; Q non proposée                              |
| EV-11 | Douleur genou 2 ; E 45 min prévu                                                  | footing 30 min RPE ≤ 3 ou vélo 45 min                                              |
| EV-12 | Douleur cheville 5, `until` dans 5 jours ; nouveau signalement ≥ 4 au jour 4      | aucune course ; message kiné ou médecin envoyé une fois                            |
| EV-13 | Douleur 4 un seul jour                                                            | aucune course aujourd'hui ; pas de message d'orientation                           |
| EV-14 | ICS : cours ajouté vendredi 17:00 à 19:00 sur un E vendredi 18:00, `now` mercredi | E déplacé (M4), bannière « 1 cours ajouté vendredi · 1 course déplacée »           |
| EV-15 | Q mardi non faite, synchro mercredi 07:00                                         | `missed` ; semaine sans ajout                                                      |
| EV-16 | Q mardi non faite, dernière synchro mardi 16:00                                   | statut inconnu, question posée                                                     |
| EV-17 | `bedtime` passe de 23:00 à 22:00 ; E `manual` jeudi finissant à 21:30             | E gardé avec `warning` H7 ; autres séances replacées                               |
| EV-18 | Course faite mercredi alors que l'E était prévu jeudi                             | E rattaché, marqué fait, traité comme déplacé par Anna                             |

---

## M8. `recalibration` : propositions de niveau

Modèle Runna Pace Insights : preuve forte uniquement, proposition acceptée ou refusée en un tap, seules les allures changent, jamais la structure.

### Signatures

```ts
evaluateRace(a: Activity, current: Fitness, ctx: Ctx): Proposal | null
evaluateKeySessions(done: { session: Session; activity: Activity }[], current: Fitness, history: Proposal[], now: string): Proposal | null
evaluateTrends(signals: DailySignal[], hrModel: HrPace[], now: string): Proposal | null
acceptProposal(st: State, p: Proposal, now: string): Result     // allures futures, hors séances gelées et manual
```

### Règles

| Id   | Règle                                                                                                                                                                                                                                   | Paramètres   | Source                        | Niveau |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------- | ------ |
| RC1  | Course ou test éligible (F9) : VDOT calculé > courant + 0,5 → proposer le VDOT calculé (pas de plafond d'un point)                                                                                                                      | 0,5          | Daniels 2014                  | CONS   |
| RC2  | Course ou test éligible plus lent : écart ≥ 1,5 sans explication (chaleur > 15 °C, dénivelé, maladie dans les 14 j, ressenti `easy`) → proposer le VDOT calculé ; sinon ignorer                                                         | 1,5          | Daniels 2014 ; Ely 2007       | OBS    |
| RC3  | Hausse sans course : ≥ 28 j depuis le dernier changement ET ≥ 2 séances T ou I (fractions aberrantes exclues : < 90 % ou > 110 % de la cible) à ≥ 100 % de l'allure cible, FC ≤ prédiction F15 + 3 bpm, ressenti ≠ `hard` → proposer +1 | 28 j ; 3 bpm | Daniels 2014 ; Runna          | CONS   |
| RC4  | Baisse : ≥ 2 séances T ou I consécutives < 97 % de l'allure cible sans facteur externe (chaleur, vent, dénivelé, maladie, nuit courte SG2) → proposer -1                                                                                | 97 %         | règle de conception           | OP     |
| RC5  | Trois `hard` de suite sur des séances faciles → proposer -1 ou un test (au choix d'Anna)                                                                                                                                                | 3            | interactions.md ; Foster 2001 | OP     |
| RC6  | FC à allure E de référence (F15) ≥ ligne de base + 5 bpm sur ≥ 3 sorties hors chaleur et persistant 14 j → proposer -1                                                                                                                  | 5 bpm ; 14 j | Buchheit 2014                 | OBS    |
| RC7  | VO2max Garmin : variation ≥ 2 maintenue 14 j → proposer un test, jamais un VDOT                                                                                                                                                         | 2 ; 14 j     | Engel 2025                    | ECR    |
| RC8  | Proposition refusée : même sens non reproposé avant 14 j, sauf course ou test                                                                                                                                                           | 14 j         |                               | OP     |
| RC9  | Proposition acceptée : allures des séances futures non gelées et non `manual` recalculées (F7). Zones FC inchangées sauf nouveau LTHR                                                                                                   |              | Runna                         | CONS   |
| RC10 | Objectif : après une réévaluation (course, test, ou toutes les 4 sem.), si la projection `P0 × (1 - r × S_restant)` s'écarte de la cible de > 2 % deux fois de suite → proposer un nouveau chrono (P20)                                 | 2 %          | règle de conception           | OP     |
| RC11 | Un changement automatique d'allure après une séance n'existe pas (tout passe par une proposition)                                                                                                                                       |              | décision produit              | OP     |

### Tests

| #     | Entrée                                                                                  | Sortie attendue                                                                              |
| ----- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RC-1  | VDOT 40,38 ; semi officiel en 105:00, 12 °C, plat                                       | `Proposal` vdot 40,38 → 42,64                                                                |
| RC-2  | VDOT 40,38 ; 10 km officiel en 52:00 (VDOT 38,21), 12 °C                                | écart 2,17 sans explication → proposer 38,21                                                 |
| RC-3  | Même 10 km à 22 °C                                                                      | `null`                                                                                       |
| RC-4  | Écart -1,0 sans explication                                                             | `null`                                                                                       |
| RC-5  | 2 séances T à 101 % de l'allure, FC ≤ prédiction + 2, 30 j depuis le dernier changement | +1                                                                                           |
| RC-6  | 1 seule séance à 103 %                                                                  | `null`                                                                                       |
| RC-7  | 2 séances à 101 % mais 20 j depuis le dernier changement                                | `null`                                                                                       |
| RC-8  | 2 séances I consécutives à 95 % sans facteur externe                                    | -1                                                                                           |
| RC-9  | 2 séances à 95 %, la 2e après une nuit SG2                                              | `null`                                                                                       |
| RC-10 | +1 refusé il y a 10 j ; nouvelles preuves de hausse                                     | `null`                                                                                       |
| RC-11 | VO2max Garmin 42 → 44,5 pendant 14 j                                                    | proposition `test`                                                                           |
| RC-12 | `acceptProposal` +1, séance du jour gelée, Q `manual` jeudi                             | ni la séance du jour ni la Q jeudi ne changent ; les autres prennent les allures de VDOT + 1 |

---

## M9. `maintenance` : mode entretien

### Signatures

```ts
maintenanceWeek(history8w: number[], settings: Settings, weekIdx: number, fitness: Fitness): Session[]
postRaceWeek(usualMin: number): Session[]
exitMaintenance(history4w: number[], goal: Goal, now: string): { v0: number; planStart: string }
```

### Règles

| Id  | Règle                                                                                           | Paramètres   | Source                                        | Niveau |
| --- | ----------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------- | ------ |
| MA1 | Volume `V = max(90, 0,5 × moyenne des 8 dernières semaines)`                                    | 90 min ; 0,5 | Spiering 2021                                 | CONS   |
| MA2 | Fréquence `n = max(2, min(runsPerWeek, 3))`                                                     |              | Spiering 2021 ; Hickson 1985                  | ECR    |
| MA3 | 1 Q par semaine obligatoire, rotation T → I → FARTLEK ; strides 1×/sem                          |              | Hickson 1985 (l'intensité maintient la forme) | ECR    |
| MA4 | L facultative, ≤ min(75, 0,40 × V)                                                              |              |                                               | OP     |
| MA5 | Pas de décharge planifiée ; Z1 ≥ 75 %                                                           |              |                                               | OP     |
| MA6 | Après la course : P23, puis MA1                                                                 |              |                                               | OP     |
| MA7 | Objectif saisi : `V0` = moyenne des 4 semaines d'entretien, plan au lundi suivant (M2)          |              |                                               | OP     |
| MA8 | Arrêter le programme (bouton) : MA1 à partir de la semaine suivante, semaine en cours inchangée |              | interactions.md                               | OP     |

### Tests

| #    | Entrée                                                         | Sortie attendue                     |
| ---- | -------------------------------------------------------------- | ----------------------------------- |
| MA-1 | Moyenne 8 sem. 200 min, `runsPerWeek` 4                        | V 100 ; 3 courses ; 1 Q             |
| MA-2 | Moyenne 8 sem. 120 min                                         | V 90                                |
| MA-3 | `runsPerWeek` 3, semaines 1, 2, 3, 4                           | Q = T, I, FARTLEK, T                |
| MA-4 | V 100, L demandée                                              | L ≤ 40 min                          |
| MA-5 | `postRaceWeek(180)`                                            | 81 min en footings, aucune Q        |
| MA-6 | `exitMaintenance([100, 110, 95, 105], semi, lundi 2026-11-16)` | `v0` 102,5 ; `planStart` 2026-11-23 |

---

## 4. Données nécessaires et repli

### 4.1 Garmin (vivoactive 4)

| Donnée                                                                                                      | Disponible VA4                                                 | Utilisée par       | Repli si absente                                                                   |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| Activités course : début, durée, distance, FC moyenne et série, dénivelé, tours                             | oui                                                            | M1, M2, M6, M7, M8 | saisie manuelle durée + distance ; règles FC sautées                               |
| Course officielle / test                                                                                    | non (déduit : séance TEST planifiée, ou Anna coche « course ») | F9, RC1            | effort non éligible par défaut                                                     |
| Température de l'activité                                                                                   | capteur poignet, biaisé par la chaleur du corps                | F9, RC2, F16       | règles chaleur désactivées (Q9)                                                    |
| FC repos quotidienne                                                                                        | oui                                                            | SG1, F13           | SG1 ignoré ; Karvonen avec la dernière valeur connue                               |
| Sommeil : durée totale (jamais les phases)                                                                  | oui                                                            | SG2                | SG2 ignoré                                                                         |
| Body Battery au réveil                                                                                      | oui                                                            | SG3                | SG3 sur le stress seul, ou ignoré                                                  |
| Stress moyen de la veille                                                                                   | oui                                                            | SG3                | idem                                                                               |
| VO2max estimée                                                                                              | oui (après 15 min de course avec FC)                           | F10, RC7           | chrono déclaré, puis test                                                          |
| FC max observée                                                                                             | via activités                                                  | F12                | Tanaka avec l'âge du profil Garmin ; sans âge : pilotage RPE                       |
| Âge                                                                                                         | profil Garmin (non demandé à l'onboarding)                     | F12, P9            | cycle 3:1, FCmax observée seule                                                    |
| HRV status, Training Readiness, Training Load, temps de récupération, prédicteur de course, Training Effect | **non**                                                        | aucune règle       | sans objet : aucune règle ne les lit                                               |
| Ressenti, RPE                                                                                               | probablement non                                               | C3, SG4, RC3, RC5  | question Facile / Correct / Dur dans l'app ; absent = RPE cible, jamais restrictif |
| Panne de l'accès Garmin (plusieurs par an en 2026)                                                          |                                                                | toutes             | M5 en `keep` ; M7 en statut inconnu (EV17) ; aucune séance marquée ratée           |

### 4.2 Emploi du temps (ICS) et onboarding

| Donnée                                                                                                                   | Utilisée par             | Repli                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------- |
| Événements ICS (début, fin, titre) → `class`                                                                             | H1                       | dernier ICS valide gardé ; s'il a plus de 7 jours : avertir, continuer |
| Examens : titre contenant « examen », « partiel », « DS », « contrôle », « exam » (insensible à la casse et aux accents) | S5, S6, SG5              | aucun examen connu                                                     |
| Cours marqué « n'a pas lieu » par Anna                                                                                   | H1 (créneau libéré)      |                                                                        |
| Muscu (nom, `legs`, jour, heure, durée), révision, indispo : placés par Anna                                             | H1, H5, H6, S2 à S4, S11 | muscu sans `legs` explicite : `legs = true` (prudence)                 |
| Réglages : courses/sem, pas avant, pas après, jours sans course, coucher, trajet                                         | H2, H7, S1, P13          | défauts : 3 courses, 07:00, 21:30, aucun, 23:00, 0 min                 |
| Objectif : distance, date, chrono facultatif                                                                             | M2                       | M9                                                                     |
| Douleur ou blessure en cours (onboarding)                                                                                | P9, EV11 à EV12          | non                                                                    |
| Chrono déclaré (« autour de 1 h 50 »)                                                                                    | F10 (c)                  | test S2 à S4                                                           |

---

## 5. Conflits recherche / décisions (la décision s'applique)

| Recherche                                                                              | Décision appliquée                                                                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 01 R3 : test dans les 14 jours sans effort éligible                                    | historique Garmin d'abord, test en semaine 2 à 4 seulement en repli (F10)                                               |
| 01 R11, R12 et 03 étape 8 : allures modifiées automatiquement après les séances        | tout changement d'allure est proposé, accepté en un tap (M8)                                                            |
| 02 R23 : allures modifiées d'un point VDOT au plus par réévaluation                    | une course ou un test éligible propose le VDOT calculé entier (RC1) ; le point unique reste pour les séances (RC3)      |
| 03 étape 6 : N = 1 → décaler la séance à J+1                                           | un signal isolé ne fait rien ; la décision du matin ne déplace jamais, elle allège (D2, D9)                             |
| 03 §11.1 : seuils FC repos et sommeil en partie universels                             | seuils relatifs à sa norme (B1 à B4, SG1 à SG3) ; les valeurs de la recherche ne servent qu'avant 14 jours d'historique |
| 03 étape 3 : douleur 3 à 4 → footing -30 %, ≥ 5 → arrêt                                | 0 à 3 → footing très facile ou vélo ; ≥ 4 → pas de course, orientation au-delà de 3 jours (EV11, EV12)                  |
| 03 §9 : reprise après infection sous le cou ≥ 10 jours au total                        | pause jusqu'à « Ça va mieux », puis retour progressif sur une semaine (EV9)                                             |
| 03 §1.3 : sRPE inclut la muscu                                                         | muscu exclue de toute charge, la case jambes sert seulement au placement (G5)                                           |
| 03 étape 7 et 02 R15 : une séance clé ratée remplace une séance de priorité plus basse | une séance ratée n'est jamais rattrapée ni échangée (EV16)                                                              |
| 02 R21 : objectif irréaliste → proposer `P0 × (1 - g_max)` seulement dans ce cas       | ce chrono est aussi proposé sans cible, comme le plus ambitieux encore réaliste (P20)                                   |
| 04 §1.5 : classer la muscu par mots-clés du nom                                        | seule la case jambes compte (décision) ; sans case cochée ni décochée : jambes                                          |

---

## 6. Hors périmètre

- Diagnostic médical, nom de pathologie, traitement ou protocole de rééducation.
- Lever une restriction médicale sur un message ambigu, ou laisser Reggie baisser un niveau de restriction.
- Modifier le plan selon la phase du cycle menstruel ; seuls les symptômes qu'Anna signale passent par Pas dispo.
- Poids, calories, composition corporelle.
- Suivi ou charge de la musculation (nom et case jambes seulement) ; placer ou déplacer la muscu, les révisions, les cours.
- Utiliser Body Battery, stress ou VO2max Garmin comme critère unique d'une décision.
- Rattraper une séance ratée, alourdir une séance le jour même, modifier la séance du jour après la décision du matin sans action d'Anna.
- Doubles séances de course le même jour.
- Correction d'allure par la météo prévue (vent, chaleur) ; seul le mode de pilotage change.
- Toute E/S : lecture Garmin, ICS, base, horloge, envoi à la montre.

---

## 7. Questions ouvertes

| #   | Question                                                                                                            | Défaut du code en attendant                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Q1  | Table de détraining Daniels complète (lignes 6 j à 10 sem.)                                                         | interpolation sur 4 points (F11)                                                                             |
| Q2  | Allures T et I calculées (ancrages 60 et 11 min) contre la table officielle Daniels pour VDOT 30, 40, 50, 60, 70    | formules F7 ; tests F-6 à F-8 à corriger si la table diffère de plus de 3 s/km                               |
| Q3  | VO2max Garmin et chrono déclaré divergents pour Anna : lequel croire ?                                              | le plus bas des deux, statut provisoire, test S2 à S4 (F10)                                                  |
| Q4  | Seuils personnels (2σ, 28 j, 14 valeurs, planchers d'écart-type) jamais validés pour une coureuse loisir            | valeurs de B1 à B4 et SG1 à SG3, journalisées pour calibrage                                                 |
| Q5  | Body Battery et stress : aucune validation indépendante                                                             | un seul signal combiné SG3, jamais seul                                                                      |
| Q6  | Taux d'amélioration `r` par profil et coefficient du chrono proposé                                                 | P19, P20 (1,0 × `g_max`)                                                                                     |
| Q7  | Délai jambes → séance dure chez une femme pratiquant la muscu (données Doma surtout masculines, intensité inconnue) | 24 h dur (H5) + 24 à 48 h souple (S2)                                                                        |
| Q8  | Retour après maladie sous le cou : une semaine (décision) contre ≥ 10 jours au total (BJSM 2022)                    | EV9 ; G7 si la pause dépasse 14 j                                                                            |
| Q9  | Source de température fiable pour les règles chaleur (le capteur poignet surestime)                                 | règles chaleur désactivées sauf température saisie ; course > 15 °C non utilisable pour une baisse si connue |
| Q10 | Plafond de la sortie longue à 3 ou 4 courses par semaine (Daniels suppose 6 à 7)                                    | 40 % / 35 % du volume (P14)                                                                                  |
