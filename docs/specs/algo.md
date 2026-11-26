# Annarrivé : spécification de l'algorithme (`packages/coach`)

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
| Dur                                  | séance `Q` (qualité : T, CRUISE, I, R ≥ 3 km, SPE, TEST) ou `L` (sortie longue, toujours dure pour le placement)                            |
| `manual`                             | drapeau posé sur tout ce qu'Anna a créé, déplacé ou changé à la main. Aucune règle automatique ne le modifie ensuite                                 |

### 0.1 Cycle de décision (décisions produit)

| Moment                                                                                                            | Fonction          | Peut faire                                                                      | Ne peut pas faire                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Dimanche 18:00 (`H_BUILD`, défaut à calibrer)                                                                     | `buildWeek`       | construire le squelette lundi à dimanche suivant à partir du plan et du réalisé | modifier la semaine en cours                                                                                          |
| Chaque matin, après la synchro sommeil                                                                            | `dailyDecision`   | **alléger** la séance du jour, une seule fois, puis la figer                    | alourdir, déplacer, toucher une séance `manual`                                                                       |
| Événement réel : changement d'emploi du temps, séance ratée, maladie, déplacement par Anna, changement de réglage | `replan`          | replanification minimale de la semaine en cours et de la suivante               | bouger une séance qui commence dans moins de 12 h sans accord, bouger une séance `manual`, rattraper une séance ratée |
| Action d'Anna ou de Reggie                                                                                        | `events.*`        | ce que fait le bouton correspondant                                             | dépasser la charge prévue (Changer), sortir des règles sans avertissement                                             |
| Course synchronisée                                                                                               | `adaptToRun`      | écarter ou alléger la séance dure qui suit un jour dur non prévu, raccourcir les footings à venir après du volume en plus (M10) | rattraper, alourdir, toucher une séance `manual`, gelée ou de moins de 12 h (sauf l'alléger) |
| Course, test, séance clé nettement meilleure ou pire                                                              | `recalibration.*` | **proposer** un nouveau niveau, accepté en un tap                               | appliquer seul un changement d'allure                                                                                 |

Une déviation ne déclenche rien tant qu'elle n'est pas **claire et confirmée** : deux signaux distincts le même jour, ou le même signal deux jours de suite.

### 0.2 Reggie

Reggie n'appelle que les fonctions de `events`, `requestSession` (M14) et `readOnly` (lecture du plan, de la semaine, des signaux, `explain(ruleId)`). Tout résultat passe par `guards.validateWeek` avant d'être enregistré. Reggie ne reçoit jamais une fonction qui écrit une séance libre.

---

## 1. Carte des modules

| #   | Module                                          | Entrées                                       | Sorties                                             | Fonctions publiques                                                                                                                                |
| --- | ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `fitness` (VDOT, allures, zones FC)             | efforts, historique, FC, âge                  | VDOT, temps prédits, allures, zones                 | `vdot`, `predictTime`, `paces`, `isEligibleEffort`, `initialFitness`, `detrainingFactor`, `hrMax`, `hrZones`, `hrPaceModel`                        |
| M2  | `plan` (génération, périodisation, faisabilité) | objectif, profil, historique volume, VDOT     | `Plan` (phases, volumes hebdo, gabarits de séances) | `feasibility`, `phaseSplit`, `peakVolume`, `volumeCurve`, `generatePlan`, `weekTemplate`, `planWeek`                                               |
| M3  | `catalog` (séances)                             | type, volume hebdo, allures                   | `Session` dimensionnée, options équivalentes        | `buildSession`, `sessionLoad`, `isHard`, `equivalents`, `feelToRpe`                                                                                |
| M4  | `placement` (solveur de contraintes)            | séances de la semaine, agenda, réglages       | créneaux, pénalités, raisons                        | `freeSlots`, `checkHard`, `softPenalty`, `placeWeek`, `replan`, `proposeMoveSlots`                                                                 |
| M5  | `readiness` (lignes de base, décision du matin) | signaux quotidiens, ressenti, agenda          | décision du jour, signaux                           | `baseline`, `dailySignals`, `isConfirmed`, `dailyDecision`                                                                                         |
| M6  | `guards` (charge et progression)                | séances prévues et réalisées                  | séances plafonnées, validation                      | `spikeCap`, `weeklyCaps`, `distributionCheck`, `validateWeek`                                                                                      |
| M7  | `events` (actions des boutons)                  | état, action, `now`                           | nouvel état, changements, avertissements            | `moveSession`, `changeOptions`, `applyChange`, `reportUnavailable`, `feelBetter`, `updateSettings`, `onTimetableChange`, `detectMissed`, `confirmDone`, `skipSession`, `logFeel` |
| M8  | `recalibration`                                 | activités, séances clés, propositions passées | `Proposal` ou rien                                  | `evaluateRace`, `evaluateKeySessions`, `evaluateFeels`, `evaluateTrends`, `acceptProposal`                                                         |
| M9  | `maintenance` (mode entretien)                  | historique 8 sem., réglages                   | gabarit de semaine                                  | `maintenanceWeek`, `postRaceWeek`, `lastRaceDay`, `postRaceIndex`, `exitMaintenance`                                                               |
| M10 | `adaptation` (le réalisé)                       | course synchronisée, séance rattachée, état   | lecture de la course, écart au plan, nouvel état    | `readRun`, `compareRun`, `paceRatio`, `feelLog`, `adaptToRun`                                                                                      |
| M11 | `review` (bilan, course objectif)            | séances et courses de la semaine, objectif     | bilan, résultat de course                           | `weekReview`, `isGoalRace`, `previousRace`, `raceSplits`, `raceReport`                                                                             |
| M12 | `progression` (lecture seule)                   | niveaux enregistrés, séances, courses, plan   | temps estimés, volumes, séances tenues, changements | `levelOn`, `weeklyEstimates`, `weekVolume`, `keptRuns`, `levelChanges`                                                                             |
| M13 | `level` (lecture seule)                        | niveau en service, courses, VO2max Garmin     | chronos possibles, FC seuil                         | `racePredictions`, `thresholdLapsHr`, `thresholdHr`                                                                                                |
| M14 | `request` (séance demandée)                    | demande, semaines, agenda, santé, historique  | séance placée et changements, ou refus et alternative | `requestSession`, `weekFrame`                                                                                                                     |

### 1.1 Types communs (abrégés)

```ts
type RunType = "E" | "RECUP" | "L" | "T" | "CRUISE" | "I" | "R" | "SPE" | "FARTLEK" | "TEST" | "RACE";
type Step = {
  kind: "warmup" | "work" | "recover" | "cooldown" | "strides"; // strides : lignes droites, ou sprints de 10 s sur le plat
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
  kind: "class" | "exam" | "strength" | "revision" | "unavailable" | "work";
  start: string;
  end: string;
  legs?: boolean;                 // muscu : séance jambes (H5, H6) ; travail : travail physique, debout (H6)
  light?: boolean;
  manual: boolean;
};
type Settings = {
  runsPerWeek: 3 | 4 | 5;
  earliest: string;
  latestEnd: string;
  noRunDays: number[];
  bedtime: string;
  preferredLongDays?: number[];   // jours acceptés pour la sortie longue (S8), 0 = lundi
  preferredHour?: string;
  useSleepHr: boolean;
  travelMin: number;
};
type Goal = { distanceM: 5000 | 10000 | 21097.5 | 42195; date: string; targetMin?: number; startTime?: string } | null;
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
  laps?: { durMin: number; distM: number; avgHr?: number }[];   // tours Garmin (F18)
  plannedType?: RunType;   // type de la séance prévue à laquelle la course est rattachée (F18)
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
effortReadings(h: FitnessHistory, now: string): { activityId; start; distM; durMin; vdot; kind: 'race'|'threshold'|'training' }[]
initialFitness(h: { activities: Activity[]; vo2maxGarmin?: number; declared?: { distM: number; tMin: number; date?: string }; hr?: { hrMax: number } },
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
| F7  | Allures, une cible par zone (C4) : E = v(0,74·VDOT), le haut de la plage facile de Daniels (59 à 74 % du VO2max) : un plan engagé, toujours facile (décision du 26/11/2026 ; jusque-là v(0,6965·VDOT), la valeur unique de la table 5.2, 17 s/km plus lente à VDOT 40). Le cœur garde la limite : RC18 propose de ralentir dès que ses footings à l'allure E dépassent 79 % FCmax ; récupération (RECUP) = E + 30 s/km (≈ la valeur de la table + 15) ; M = vitesse prédite F5 pour 42 195 m ; T = v(0,88·VDOT) ; I = v(0,975·VDOT) ; R = allure I - 15 s/km (6 s/400 m)                                                                                                                                                                                                           | 0,88 et 0,975, table 5.2 à ±3 s/km ; 0,74 ; 30 s/km | Daniels 2014 (table 5.2 ; plage E 59 à 74 % du VO2max, 65 à 79 % FCmax ; récupération au bas de la plage E) ; recherche 09 §2                                 | CONS   |
| F8  | Si vitesse critique CS connue (≥ 2 efforts max de 3 à 15 min en 6 sem.) et T > CS : T = CS                                                                                                                                                                                                                                                                                                    |                                   | Jones & Vanhatalo 2017                                   | ECR    |
| F9  | Effort éligible si : 3 ≤ t ≤ 230 min (course marquée jusqu'au marathon, distance GPS à 2 % près : 290 min, le marathon le plus lent de la table 5.1 de Daniels, VDOT 30 en 4:49:17 ; la limite de 230 min est le domaine de Riegel, pas celui du VDOT) ET pente moyenne < 1 % (ou corrigée Minetti si ≤ 15 %) ET (course officielle OU test planifié OU FC moyenne 2e moitié ≥ 0,90·FCmax OU ≥ 0,97·LTHR) ET pas de conditions défavorables (temp. > 20 °C, vent > 25 km/h, hors route)                                                                                                                         |                                   | Daniels 2014 (table 5.1 : VDOT 30 à 85, du 1 500 m au marathon) ; recherche 01 §1.2 (Riegel : 3,5 à 230 min) ; règle de conception                       | OP     |
| F10 | État initial, le plus crédible et non le plus lent (décision du 18/11/2026) : (a) meilleure lecture `race` ou `threshold` (F18) des 6 dernières semaines ; (b) meilleure lecture de 6 à 12 sem. × `detrainingFactor(plus longue interruption depuis)` ; (c) chrono déclaré de 6 mois ou moins (ou estimé, sans date), tant qu'aucun test ni course lu `race` n'a été couru depuis (sa date, ou n'importe quand pour un chrono estimé) : ce que la montre a mesuré l'emporte sur sa parole. Retenir le **plus haut** de (a), (b) et (c) (audit du 21/11/2026 : (a) seul retenait un marathon lu 34,2 contre des seuils à 39,0 de 7 semaines). Un programme qui commence (fin de l'onboarding, nouvel objectif) relit F10 sur tout l'historique et remplace un niveau que F10 avait posé seul, jamais un niveau qu'elle a accepté (`proposal:…`) : un niveau lu avant la fin de la synchronisation ne survit pas au début du programme (34,2 du 17/11 contre 38,1 lus le 21/11). Sans eux : le plus bas de la VO2max Garmin et d'un chrono déclaré plus ancien. Puis jamais sous le plancher F18 des 6 dernières semaines (le plancher seul ne fait pas un niveau : sans rien d'autre, `NO_FITNESS_DATA`). Statut `measured` si (a ou b) l'emporte, sinon `provisional` : tant qu'il l'est, `planWeek` place un `TEST` dans les semaines 2 à 4 du programme, à la place de la première séance de qualité (E + sprints ou fartlek en base, Q1 ensuite) ; le test mesuré propose le niveau (F10 puis RC11), et les hausses par les séances (RC3) reprennent une fois le niveau mesuré. Le premier niveau se lit une fois **toute** la synchronisation enregistrée : lu course par course, les courses pas encore enregistrées passaient pour une interruption (F11). Un niveau que F10 a posé seul reste relu après chaque course (RC12) | 6 et 12 sem. ; 6 mois ; semaines 2 à 4 | Daniels 2014 (la meilleure course récente fait foi) ; Engel 2025 (VO2max Garmin sous-estimée de 4 à 5 ml/kg/min en moyenne, LoA jusqu'à -12,8) ; recherche 01 §4.2 et §4.3 | OP |
| F11 | Détraining : interpolation linéaire entre (5 j ; 1,00), (14 j ; 0,973), (21 j ; 0,95), (70 j ; 0,80) ; constant au-delà. Si cross-training ≥ 3×/sem : point 14 j = 0,986                                                                                                                                                                                                                      | table à vérifier                  | Daniels 2014 (via vdoto2) ; Mujika & Padilla 2000        | CONS   |
| F12 | FCmax = max observé sur 12 mois (artefact exclu : pic < 10 s ou saut > 20 bpm en 2 s). Garmin ne donne qu'un maximum par sortie, sans série seconde par seconde : le plus haut maximum compte s'il est confirmé à 3 bpm près par une autre sortie, ou atteint dans une sortie tenue à 85 % de lui au moins (la fin d'un effort dur, pas un pic du capteur dans un footing) ; sinon le suivant. L'app et le CLI (`cli/level.ts`) lisent la même année. Si aucune FC ≥ 0,95·(208 - 0,7·âge) : FCmax = max(observé, 208 - 0,7·âge), drapeau `estimated`. Sans âge ni FC : pas de zones FC, pilotage RPE                                                                                                                                                         |                                   | Tanaka 2001                                              | MA     |
| F13 | Zones : LTHR mesuré ≤ 8 sem. → Friel course (% LTHR : < 85, 85 à 89, 90 à 94, 95 à 99, 100 à 102, 103 à 106, > 106) ; sinon Karvonen avec FC repos moyenne 7 j : E = 59 à 74 % FCR, T = 84 à 88 % FCR                                                                                                                                                                                         | bornes Karvonen défaut à calibrer | Friel 2016 ; Karvonen 1957 ; Mann 2013                   | CONS   |
| F14 | LTHR : `TEST` de l'app (20 min à fond, un tour) → 95 % de la FC moyenne de ce tour ; test 30 min → FC moyenne de 10 à 30 min ; course éligible de 50 à 65 min → FC moyenne de 10 min à la fin                                                                                                                                                                                                                                                                               | 0,95 ; 20 min                                  | Friel 2016 (test de 30 min ; 20 min : FC moyenne moins 5 %) ; Borszcz FK et al., *Int J Sports Physiol Perform* 2019, PubMed 30676826 (95 % de la FC d'un contre-la-montre de 20 min face à l'état stable de lactate : biais −1,4 %, limites ±8,2 %, cyclistes)                                               | CONS   |
| F15 | Relation FC-allure : régression robuste `FC = a + b·v` sur segments stables (≥ 5 min, pente < 2 %, après 10 min, temp. < 20 °C) des 28 derniers jours ; exige ≥ 6 segments, sinon garder la précédente                                                                                                                                                                                        |                                   | règle de conception                                      | OP     |
| F16 | Pilotage : E, RECUP, L → plafond FC (haut de E) ; M, T → allure avec garde FC ; I → allure ; R, strides et sprints → RPE ; chaleur > 20 °C, vent, trail, retour de douleur → FC ou RPE. Reggie peut seulement passer vers plus conservateur                                                                                                                                                       |                                   | Mann 2013 ; Gillinov 2017                                | CONS   |
| F17 | VO2max Garmin : jamais modifiée en VDOT directement, sauf F10 (repli sans effort ni chrono récent) ; sert de déclencheur en M8                                                                                                                                                                                                                                                                                                 |                                   | Engel 2025                                               | ECR    |
| F18 | Meilleurs efforts de l'entraînement, sur 12 semaines, sorties plates (dénivelé < 1 %) : la sortie entière (F9) et chaque suite de tours Garmin consécutifs **réguliers** (vitesses à 3 % les unes des autres : un effort continu, jamais des répétitions avec leurs récupérations) jusqu'à 60 min, FC moyenne pondérée par le temps. Un tour hors bornes (allure hors de 2:30 à 12:00 /km) coupe la suite. Aucune suite de tours n'est lue sur une séance prévue en fractionné (I, R, CRUISE, FARTLEK : `plannedType`). Lecture : FC ≥ 92 % FCmax, course ou test → `race`, `VDOT = F3(D, t)`, sur 10 min au moins quand elle vient des tours (une répétition de 3 min n'est pas 3 min à fond) ; FC de 88 % FCmax ou plus sur plus de 60 min → `race`, `VDOT = F3(D, t)` (au-delà d'une heure, l'allure tenue à la FC du seuil est une allure de course : un semi) ; FC de 88 à 92 % FCmax sur 15 à 60 min → `threshold`, l'allure tenue est l'allure T : `VDOT = max(F3, VO2(v) / 0,88)` ; autre segment ≥ 10 min → `training`, `VDOT = F3(D, t)`, un plancher (tout effort couru prouve au moins ce niveau). Une suite de tours qui commence après 60 min de course n'a pas de lecture par la FC (`training` seulement) : la FC y dérive à allure constante. Garder la meilleure lecture par sortie (`race`/`threshold` avant `training` entre suites de tours), jamais une lecture de tours sous celle de la sortie entière ; dans une sortie lue `race`, seules les suites de tours lues `race` comptent (un tronçon de course à la FC du seuil est une allure de course, pas l'allure T). VDOT hors de 20 à 85 écarté | 88 et 92 % FCmax ; 15 à 60 min ; 10 min ; 3 % ; 60 min | Daniels 2014 (T = 88 % du VDOT, 88 à 92 % FCmax ; T = effort continu de 20 à 60 min, l'allure qu'on tient environ une heure en course) ; recherche 01 §4.2 (un effort non maximal sous-estime toujours la forme) ; Coyle EF, González-Alonso J, *Exerc Sport Sci Rev* 2001;29(2):88-92 (dérive cardiovasculaire : la FC monte à effort constant après 10 à 20 min) ; audit du 21/11/2026 (marathon lu au seuil à 34,2 sur ses 17 derniers km) ; banc d'essai (fractionné lu comme effort maximal ou au seuil, `docs/eval/rapport-algo.md` problème 5) | OP |
| F19 | VO2max de la montre (Programme, détail de « Ton niveau », M13) : la VO2max Garmin la plus récente (30 jours) comparée au VDOT de sa dernière course déclarée. Écart de moins de 5 points → « en accord avec ton semi » ; sinon « au-dessus » ou « en dessous ». La course est nommée par sa distance (« ton marathon ») : son niveau peut venir d'une sortie, pas de cette course (audit parcours réel 2 N-F1). Information seulement : le niveau reste celui de F10 (F17) | 5 points | Engel 2025 (écart moyen de 4 à 5 ml/kg/min) | OP |

### Tests

Valeurs de référence Daniels : vérifiées le 17/11/2026 contre les tables 5.1 et 5.2 de _Daniels' Running Formula_ (3e éd.), via deux transcriptions concordantes (voir `research/01-forme-et-allures.md` §2.1 ; test `daniels-table.test.ts`). Les valeurs « formule » sont calculées avec F1 à F7 ; tolérance de test ±0,05 VDOT, ±3 s sur les temps, ±3 s/km sur les allures. Deux écarts propres à la table, pas au code : la table 5.1 s'écarte des équations de Daniels de 0,053 VDOT au plus de VDOT 32 à 44 (3 s sur 10 km, 6 s sur le semi : d'où les 4 s de F-6 au semi), testée à ±0,06 VDOT, et jusqu'à 0,07 VDOT aux bords (VDOT 30, 85) ; R est imprimée au 400 m à la seconde près, testée à ±3 s/km plus le demi-pas d'arrondi (1,25 s/km).

| #    | Entrée                                                                                              | Sortie attendue                                                                  |
| ---- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| F-1  | `vdot(5000, 24+8/60)` (table VDOT 40 : 24:08)                                                       | 39,94                                                                            |
| F-2  | `vdot(21097.5, 110)` (1 h 50 au semi)                                                               | 40,38 (`F(110)` = 0,8465 ; `VO2` = 34,18)                                        |
| F-3  | `vdot(42195, 229.75)` (table VDOT 40 : 3:49:45)                                                     | 39,97                                                                            |
| F-4  | `vdot(10000, 41.35)` (table VDOT 50 : 41:21)                                                        | 49,97                                                                            |
| F-5  | `vdot(5000, 30+40/60)` (table VDOT 30) ; `vdot(21097.5, 78.15)` (table VDOT 60)                     | 30,02 ; 59,99                                                                    |
| F-6  | `predictTime(40, 5000)` ; `predictTime(50, 21097.5)` ; `predictTime(60, 42195)`                     | 24:06 ; 1:31:31 ; 2:43:22 (table : 24:08 ; 1:31:35 ; 2:43:25)                    |
| F-7  | `paces(40)`                                                                                         | E 5:51 /km (haut de la plage, plus vif que la valeur de la table) ; M 5:27 ; T 5:06 ; I 4:41 ; R 4:26 (table : E 6:08 ; M 5:27 ; T 5:06 ; I 4:42 ; R 1:46/400 m) |
| F-8  | `paces(50)`                                                                                         | E 4:54 ; M 4:31 ; T 4:15 ; I 3:55 ; R 3:40 (table : E 5:08 ; M 4:31 ; T 4:15 ; I 3:55 ; R 87 s/400 m) |
| F-9  | `fractionF(11)` ; `fractionF(60)`                                                                   | 1,0003 ; 0,888                                                                   |
| F-10 | `isEligibleEffort` : 2,5 min à fond                                                                 | `ok: false`, `reason: 'duration'`                                                |
| F-11 | `isEligibleEffort` : marathon marqué de 42,4 km en 246 min ; puis 300 min ; 50 km en 246 min ; sortie non marquée de 246 min | `ok: true` ; puis `ok: false`, `reason: 'duration'` les trois fois |
| F-12 | `isEligibleEffort` : sortie 40 min, FC 2e moitié 0,82·FCmax, non course                             | `ok: false`, `reason: 'not_max'`                                                 |
| F-13 | `isEligibleEffort` : course 10 km, 24 °C                                                            | `ok: false`, `reason: 'conditions'`                                              |
| F-14 | `detrainingFactor(3)` ; `(10)` ; `(14)` ; `(21)` ; `(45)` ; `(100)`                                 | 1,00 ; 0,985 ; 0,973 ; 0,95 ; 0,8765 ; 0,80                                      |
| F-15 | `initialFitness` : effort éligible il y a 3 sem. VDOT 41,2 et un autre il y a 5 sem. VDOT 40,1      | 41,2, `measured`                                                                 |
| F-16 | `initialFitness` : seul effort éligible il y a 8 sem. VDOT 42, plus longue interruption depuis 14 j | 40,87, `measured`                                                                |
| F-17 | `initialFitness` : aucun effort, VO2max Garmin 44, déclaré semi 110 min (sans date) | 40,38, `provisional`, `testWeek: [2, 4]`, source `declared` |
| F-18 | `initialFitness` : aucun effort, aucune VO2max, rien déclaré                                        | erreur `NO_FITNESS_DATA` (l'app demande un chrono ou lance le test en semaine 1) |
| F-19 | `hrMax(192, 21)`                                                                                    | 192, `estimated: false` (seuil 0,95·193,3 = 183,6)                               |
| F-20 | `hrMax(175, 21)`                                                                                    | 193,3, `estimated: true`                                                         |
| F-21 | `hrZones(195, 55)` sans LTHR                                                                        | E = 138 à 159 bpm ; T = 173 à 178 bpm                                            |
| F-22 | `hrPaceModel` avec 5 segments                                                                       | `null` (garder le modèle précédent)                                              |
| F-23 | Profil d'Anna : 18 footings de 50 min à 6:45 /km (FC 150), VO2max Garmin 34, FCmax observée 192 ; deux sorties avec 2 km à 6:40, 4 tours de 1 km à 5:15 (FC 170, 88,5 %), 1 km à 6:48 | `measured`, VDOT ≈ 38,5, T entre 5:10 et 5:20 /km (VO2max seule : T > 5:40) |
| F-24 | VO2max 34 ; semi déclaré en 1:50, il y a 2 mois | 40,38, source `declared` (le plus haut des deux, plus le plus bas) |
| F-25 | VO2max 34 ; semi déclaré en 1:50, il y a 10 mois | 34, source `garmin_vo2max` |
| F-26 | VO2max 34 ; sortie de 10 km en 50 min, FC 150 / 195, il y a 6 j ; puis la même sortie sans VO2max | ≈ 40, source `floor:…`, `provisional` ; puis `NO_FITNESS_DATA` (un plancher seul ne fait pas un niveau) |
| F-27 | 4 km en 20 min à FC 180 / 192 puis un tour GPS de 1 km en 30 s | lecture `race` = `vdot(4000, 20)` : le tour aberrant n'est jamais lu |
| F-28 | 15 min E, 5 × (3 min à I, FC 176 / 188 ; 3 min de trot), 10 min E | lectures `training` seulement : ni répétition lue comme 3 min à fond, ni fenêtre répétitions + récupérations |
| F-29 | Un tour de 20 min à FC 170 / 188, prévu en CRUISE ; puis prévu en T | `training` (fractionné prévu) ; `threshold` |
| F-30 | Profil réel d'Anna (CLI du 19/11/2026) : semi du 27/09, 21,27 km en 1:52:06, FC 166 / 187, sans tours | `race`, `vdot(21270, 112.1)` ≈ 39,9 (et non une allure T) |
| F-31 | Son profil complet le 19/11 : 16 footings tous les 5 j, le semi, un 5 km plancher le 04/10, un 11 km le 11/11 dont 9 tours à 5'18 (FC 168) ; puis sans le semi | le semi × `detrainingFactor(6)` (≈ 39,8, sa vraie plus longue interruption), plus haut que le 11 km (38,1), `measured` ; sans le semi : le 11 km, T 5'18 |
| F-32 | Les mêmes courses le 17/11, mais seules celles d'avant le semi et le semi enregistrées (synchronisation lue course par course) | 34,2, source `…:detrained` : 51 j « sans course » qui n'étaient que des courses pas encore lues |
| F-33 | `vo2maxVersusRace` : VO2max 44, 46 puis 34 ; semi déclaré en 1:50 (VDOT 40,38) | `agrees` ; `above` ; `below` |
| F-34 | Audit du 21/11/2026 (`test/marathon-return.ts`) : 12 mois, bloc marathon de 16 semaines, seuil à 5:12 (FC 88,5 %) le 14/10, marathon marqué le 25/10 en 4:06 (42,4 km, FC de 158 à 175 sur 192), puis 2 à 3 footings par semaine | marathon lu `race`, `vdot(42,4 km, 4:06)` ≈ 36,9 (jamais `threshold` sur ses tours dérivés) ; niveau 38,97 `measured` |
| F-35 | Le même profil sans le seuil du 14/10 (dernier seuil à 7 semaines) | `measured`, source `…:detrained`, > 38,5 (et non le marathon) |
| F-36 | Production du 21/11 (arrondi) : FCmax 188, semi du 27/09 avec ses tours (12 km à 5:04 FC 167, puis 5:31 FC 170), marathon marqué du 25/10 en 4:12:46, le 11 km du 11/11, footings tous les 3 j | semi lu `race` (et non `threshold` 40,4 sur sa première heure) ; marathon `race` ; niveau = le semi détrainé, `measured` |
| F-37 | `observedHrMax` : footings (FC moy. 145) à 150, 214, 190, 192 ; 189, 192, 175 ; footing à 170 et semi à 187 (FC moy. 166) ; une seule sortie à 188 | 192 ; 192 ; 187 ; 188 |
| F-38 | `lthrFromEffort` : `TEST` de l'app, tours 10 min (140), 20 min (180), 5 min (150) ; les mêmes tours sans `isTest` | 171 ; aucune |
| F-39 | Semi estimé en 93 min (sans date), un `TEST` couru le 10/11 lu à 48,4 ; puis le même chrono daté du 12/11 | 48,4, `measured` ; puis source `declared` |

---

## M2. `plan` : génération, périodisation, faisabilité

### Signatures

```ts
feasibility(p0Min: number, targetMin: number|undefined, weeksToRace: number, profile: Profile):
  { gain: number; gainMax: number; class: 'conservateur'|'réaliste'|'ambitieux'|'irréaliste'|'sans-cible'; uncertain: boolean }
phaseSplit(goal: Goal, weeksTotal: number, lowBase: boolean): { base: number; dev: number; spe: number; taper: number; short: boolean }
peakVolume(distM: number, v0: number, loadWeeks: number, max12m: number): { vPeak: number; warning?: 'peak_below_min' }
volumeCurve(split: Split, v0: number, vPeak: number, cycle: '3:1'|'2:1', distM: number): number[]   // min/sem
weekTemplate(phase: Phase, runsPerWeek: 3|4|5, distM: number, weekIdx: number): RunType[]
generatePlan(goal: Goal, profile: Profile, history: Activity[], fitness: Fitness, now: string): Plan
planWeek(r: { monday; now; goal; planStart?; settings; history; fitness; cal; kept; prev?; health?; signals?; feels? }): { sessions: Session[]; warnings: Warning[] }
```

### Règles

| Id  | Règle                                                                                                                                                                                                                                                                                                                                                     | Paramètres                              | Source                                     | Niveau |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------ | ------ |
| P1  | Objectif absent → M9. Sinon mode plan                                                                                                                                                                                                                                                                                                                     |                                         |                                            |        |
| P2  | `V0` = moyenne des 4 dernières semaines complètes avant le début du programme, sans les courses marquées (`isRace` : une course mesure son niveau, ce n'est pas du volume d'entraînement ; de même pour P8, P14, G1 et NV2). < 2 sem. de données : `V0 = min(déclaré, 150)`, drapeau provisoire. Arrêt ≥ 28 j : `V0 = 0,5 × moyenne avant l'arrêt`. Course marquée dans les 8 semaines avant le début (hors arrêt) : ses semaines de récupération (MA6) font baisser la moyenne, donc `V0 = max(moyenne, min(part de la dernière semaine facile MA6 × volume habituel, meilleure des 4 semaines))`, volume habituel = moyenne des 8 semaines qui finissent le jour de la course (MA6, course exclue) : le plan reprend où elle en est, sans dépasser ce qu'elle court (G2 règle la montée) ; et la fréquence de P7 est la plus haute des 4 semaines avant le programme et des 4 semaines qui finissent le jour de la course. (Retiré le 18/11/2026 : « hors semaines de maladie ». L'app ne connaît aucune maladie d'avant le programme et ne recalcule jamais `V0` pendant ; une maladie pendant le programme passe par EV9 et G2.)                                                                                                                                                       | 150 min, 0,5 : défaut à calibrer ; 8 sem.        | Coyle 1984 ; recherche 06 §4.2 (le programme reprend où il en est, sa base absorbe la récupération ; Daniels) ; Pfitzinger et Douglas (seuil en semaine 4 après un marathon) ; Hickson 1985 (l'intensité maintient la forme) ; audit du 21/11/2026 (2,75 sorties en récupération → base faible, aucun développement)                                 | OP     |
| P3  | `S_tot` = nombre de semaines complètes du lundi suivant au dimanche de la course inclus                                                                                                                                                                                                                                                                   |                                         |                                            |        |
| P4  | `S_aff` : 5 km 1 ; 10 km 1 ; semi 2 ; marathon 3 (2 si `S_tot` < 16)                                                                                                                                                                                                                                                                                      |                                         | Bosquet 2007 ; Wang 2023                   | MA     |
| P5  | Minimum : 5 km 6, 10 km 8, semi 10, marathon 12 sem. En dessous : avertir « plan court » et générer quand même                                                                                                                                                                                                                                            |                                         | plans Daniels, Pfitzinger                  | CONS   |
| P6  | Répartition : `R = S_tot - S_aff` ; `base = max(2, round(0,30·R))`, ramenée à 2 semaines (sans dépasser cette valeur) pour une coureuse **régulière** : au moins 3 sorties par semaine en moyenne sur les 8 semaines avant le programme, ou sur les 8 semaines avant une course des 8 dernières semaines (son bloc de course), base non faible (P7), sans arrêt de 28 j ; le fartlek tombe alors en semaine 2, I et T dès la semaine 3 ; `spe = max(3, round(0,35·R))` (4 au marathon) ; `dev = R - base - spe`. Si `dev < 0` : `dev = 0` puis réduire `base` jusqu'à 1, puis `spe = R - base`. `round` = arrondi au plus proche, 0,5 vers le haut | 30/35/35 % défaut à calibrer ; 3 sorties/sem sur 8 sem. ; base 2 sem. | Daniels, Pfitzinger ; Daniels (la phase I se raccourcit pour qui a déjà sa base) ; Runna (qualité dès la semaine 1 ou 2 des plans intermédiaires) ; Campus Coach (VMA et seuil court en début de plan) ; retour après marathon : RunnersConnect, Polar, Wilpers (allures reprises après 3 à 4 semaines faciles) ; Mujika et Padilla 2000 (désentraînement) ; audit de pertinence du 21/11/2026 (`research-concurrents.md`) | CONS   |
| P7  | Base faible (`V0 < 0,5 × pic mini` ou < 3 courses/sem dans l'historique, lues comme en P2 après une course ; une course marquée compte comme une sortie pour cette fréquence et pour la régularité de P6, pas pour le volume de P2) : `ajout = min(8, dev)` ; `base += ajout` ; `dev -= ajout`                                                                                                                                                                                                                       |                                         | règle de conception ; audit du 26/11/2026 (`semaine-anna-taille.md` : son semi du 27/09 retiré, 2,75 sorties/sem., base 10 et aucun développement, l'écueil B2 de `algo-retour-marathon.md`)                        | OP     |
| P8  | Pic : `V_pic = min(pic cible haut, V0 × 1,10^(semaines de charge en Base + Dév), 1,20 × max hebdo 12 mois)`, courses marquées exclues (P2). Pic mini / cible haut (min/sem) : 5 km 120/240 ; 10 km 150/280 ; semi 180/330 ; marathon 240/450. `V_pic < pic mini` → avertissement                                                                                                         | défaut à calibrer                       | Vickers 2016 ; règle de conception         | OP     |
| P9  | Cycle : 2:1 si âge ≥ 40 ou blessure < 6 mois (onboarding) ; sinon 3:1. Décharge : `V = 0,75 × V(semaine précédente)`, fractions des Q × 2/3, L × 0,75 (la L suit sa part P14 du volume déjà réduit : elle n'est pas réduite deux fois). Ce volume est un plafond, Q comprises : une semaine qui le dépasse (un bloc à allure de course dimensionné sur la distance) est réduite comme en G2b (banc, Anna semaine 8 : 184 min pour 149 au plan) ; une Q y garde ses fractions entières, son échauffement descend jusqu'à 10 min et son retour au calme jusqu'à 5 (comme autour d'un test), puis un bloc continu d'un tiers au plus. La L d'une décharge n'a pas de bloc à allure de course (P12). Fatigue : quand les signaux du corps (SG1 à SG3) sont confirmés (D2) au moins 3 jours de la semaine précédente, jours de fièvre exclus, `planWeek` construit la semaine comme une décharge, même hors cycle | 3 jours ; 0,75 | pratique universelle des plans ; recherche 02 §5.3 (2:1 sur signaux de fatigue) ; recherche 03 §6 | CONS   |
| P10 | Semaine de charge : `V(s+1) = min(V_pic, 1,10 × V(dernière semaine de charge))`. Spécifique : plateau `V_pic` ±10 %                                                                                                                                                                                                                                       | 1,10                                    | Damsted 2019                               | OBS    |
| P11 | Nombre de Q : Base 0 (+ strides, sprints sur le plat) ; Dév 1 (3 courses) ou 2 (4 à 5) ; Spé 1 Q + L spécifique (3 courses) ou 2 Q (4 à 5) ; Affûtage comme Spé. Plafond absolu : 2 Q + L. Au plus 2 séances dures par semaine, la L comptée dure quand elle porte un bloc à l'allure de course (P12 ; une fin à l'allure M ne compte pas, Runna) : la semaine où la L porte ce bloc, la SPE devient un E + strides (la L est la séance d'allure de la semaine, le seuil reste) ; un test (F10, P26) prend la place d'une Q, jamais en plus de deux autres |                                         | Seiler 2010 ; Daniels ; Runna (2 séances dures sur 4 à 5 sorties ; allure marathon pas forcément dure) ; Campus Coach ; McMillan ; audit de la comparaison à l'aveugle du 21/11/2026 (`comparaison-aveugle/comparaison.md`) | CONS   |
| P12 | Contenu : Base = E, L, strides 1 à 2×/sem, E + sprints sur le plat 1×/sem, fartlek la dernière semaine. Dév = I et seuil en alternance, le seuil continu (T) une semaine, en fractions (CRUISE) la suivante ; une L sur deux (semaines de charge impaires de la phase) finit par 10 min à l'allure M (15 min si la L dure 75 min ou plus) ; strides en fin d'un E chaque semaine, de la Dév à l'affûtage. Aucune séance en côte (décision du 19/11/2026 : Anna n'a pas forcément de côte) : les sprints en côte (Hudson) deviennent des sprints de 10 s sur le plat, récupération complète, même stimulus neuromusculaire (Paavolainen 1999 : sprints et pliométrie, économie de course et 5 km améliorés) ; les côtes longues deviennent des I (même zone, Daniels). Séances comme Garmin Coach : footing, sortie longue, récupération, seuil continu et en fractions, I, allure objectif, strides en fin de footing, test. Spé = Q1 spécifique (5 km : I ; 10 km : I ou seuil ; semi : allure semi ; marathon : M dans la L), Q2 = le seuil (T et CRUISE en alternance) ; au semi, Q2 de la semaine de décharge = un I court (fractions de 3 min) et Q1 un rappel de 2 × 1 km à l'allure de course (comme la semaine de course, P18) : une décharge baisse d'abord le dur ; L avec bloc spécifique 1 sem. sur 2 (semi, marathon), jamais en décharge. Doses : seuil 20 min au moins, puis ≤ 10 % de la distance de la semaine, en continu comme en fractions (CRUISE) ; I 12 min au moins (2 × 3 min ne sont pas une séance de VO2) ; allure semi en blocs de 3 à 4 km, jamais un bloc de 12 km d'un tenant | 10 et 15 min à M ; I de 3 min en Spé ; seuil 20 min, 10 % ; I 12 min | Daniels ; Pfitzinger ; Canova (secondaire) ; Hudson 2008 ; Paavolainen L et al., J Appl Physiol 1999;86:1527-1533 ; Daniels (strides toute l'année ; phase IV : T et I) ; Pfitzinger (strides chaque semaine ; VO2 plus courts en fin de plan) ; McMillan (sorties longues « fast finish » une semaine sur deux, 8 à 10 semaines avant la course ; tempo continu, tempo et cruise intervals) ; Runna (4 variantes de sortie longue, strides 1 à 2×/sem ; décharge : les séances dures baissent plus que les footings) ; Daniels ch. 4 (T ≤ 10 % du volume par séance, I ≤ 8 %) ; allure semi en blocs : 2 à 3 × 3 miles, récup 2 à 3 min (Running Magazine, Active.com) ; audit de pertinence du 21/11/2026 (`research-concurrents.md`) ; audit de la comparaison à l'aveugle du 21/11/2026 (`comparaison-aveugle/comparaison.md`) | CONS   |
| P13 | Gabarits : 3 courses : Q1 · E+strides · L ; 4 : Q1 · E+strides · Q2 · L ; 5 : Q1 · E+strides · Q2 · RECUP · L. En Base, Q remplacées par E+strides et E+sprints (sprints sur le plat). Les strides (6 × 20 s, 2 min) tiennent dans la part de l'E, pas en plus | | Daniels ; Pfitzinger ; Runna (strides en fin de footing) | CONS   |
| P14 | Sortie longue : `L = min(Lpct × V, Lmax, 1,10 × L la plus longue sur 30 j)` ; `Lpct` = 40/38/35 % pour 3/4/5 courses, le haut des plans de référence (35/30 % à 4/5 courses jusqu'au 26/11/2026, recherche 09 §3) ; `Lmax` = 90 (5 km), 105 (10 km), 120 (semi), 150 (marathon ; 180 si V ≥ 300). En semaine de charge (ni décharge ni affûtage), jamais plus courte que sa plus longue sortie des 30 j (course marquée exclue), dans la limite de `Lmax` : le plan ne lui retire pas la sortie longue qu'elle court déjà. Après une course marquée des 12 dernières semaines (84 j), « la plus longue » de G1 vaut au moins 60 % de sa plus longue sortie d'entraînement de ces 12 semaines : ses footings de récupération ne brident pas la L, que tiennent encore sa part `Lpct × V` et la hausse de 10 % de P10 (banc, retour de marathon : L de 45 à 66 min pendant 8 semaines après des sorties de 32 km) | Lpct défaut à calibrer ; 84 j, 60 % : défauts à calibrer | Daniels ; Frandsen 2025 ; audit du parcours du 21/11/2026 (L de 42 min pour 60 à 65 min courues) ; Mujika et Padilla 2000 (un entraînement réduit garde l'endurance des semaines) ; Pfitzinger et Douglas (les sorties longues reviennent dans les semaines qui suivent un marathon) ; audit de la comparaison à l'aveugle du 21/11/2026 (`comparaison-aveugle/comparaison.md`) | OP     |
| P15 | Reste du volume en E (30 à 75 min, et ≤ 0,75 × la L de la semaine, sauf pour garder son footing habituel, le premier quartile de ses sorties des 30 j, jamais au-delà de la L ; au-delà, les minutes ne sont pas courues : le catalogue n'a pas de sortie moyenne) et RECUP (20 à 40 min) | 0,75 : défaut à calibrer | Daniels ; Runna (footing de 30 à 60 min, la L reste la longue) ; Pfitzinger ; audit de la comparaison à l'aveugle du 21/11/2026 (`comparaison-aveugle/comparaison.md`) (footing de 77 min pour une L de 72) | CONS   |
| P16 | Distribution hebdo (temps planifié d'entraînement, test et course exclus comme en G1 et P11) : Z1 ≥ 75 % (≥ 90 % en Base), Z3 ≤ 10 %. Sinon réduire une Q : une fraction de moins tant qu'elle en a plus de 2, puis son bloc continu de 10 % jusqu'à 10 min. Ordre : si Z3 dépasse, la plus intense d'abord ; sinon l'allure de course d'abord (le bloc de la L, dont les minutes restent courues en E dans la même L, puis la séance SPE), puis les autres par intensité ; le seuil (T, CRUISE) ne descend sous 20 min de travail que si plus rien d'autre ne peut céder. Les minutes retirées vont au footing le plus court (jusqu'à 75 min et 0,75 × la L, P15) : la semaine garde son volume quand ce footing a la place. Appliquée à la construction (`buildWeek`) puis après les plafonds G1 à G4 (`planWeek`) | 10 min ; plancher du seuil 20 min | Rosenblat 2025 ; Festa 2020 ; Seiler 2010 ; recherche 02 §2.2 ; Fitzgerald 80/20 (allure semi et seuil dans les mêmes 20 %) ; Pfitzinger (le seuil, séance clé du semi) ; audit de pertinence du 21/11/2026 (`research-concurrents.md`) | MA     |
| P17 | Progression des Q par semaine de charge : +1 fraction ou +1 à 2 min par fraction, allure inchangée                                                                                                                                                                                                                                                        |                                         | Daniels                                    | CONS   |
| P18 | Affûtage (en % de `V_pic`) : 5 et 10 km : semaine de course 50 % (10 km avec `S_tot` ≥ 14 : S-2 70 %) ; semi : S-2 70 %, S-1 50 % ; marathon : S-3 80 %, S-2 62 %, S-1 45 %. Fréquence ≥ 80 % des courses habituelles ; Q gardées, fractions × 0,55, même allure (deux fractions ne peuvent pas en perdre une : elles gardent leur nombre et chacune raccourcit de × 0,55, 2 × 3 km → 2 × 1,7 km ; jusqu'au 21/11/2026 elles restaient entières, 2 × 3 km à allure semi à J-7) ; dernière Q à J-4 ; dernière L à J-14 (semi), J-21 (marathon) : la L des semaines entre elle et la semaine de la course devient un footing E. La part de `V_pic` est un plafond, Q comprises : la semaine est réduite comme en G2 (footings, puis Q, puis L), jamais complétée par des footings au-dessus. Semaine de la course : une seule Q, un rappel de 2 × 1 km à l'allure de course (2 min de trot entre), avant J-3 (H12) | 2 × 1 km | Bosquet 2007 ; Wang 2023 ; Pfitzinger (semaine de course : une séance courte à allure) ; recherche 02 §6 ; comparaison à l'aveugle n° 2 du 21/11/2026 (`comparaison-aveugle-2/rescore.md`, critère 5) | MA     |
| P19 | Faisabilité : `P0 = predictTime(VDOT, D)` (F5, F6) ; `g = (P0 - T_cible)/P0` ; `g_max = min(r × (S_tot - S_aff), plafond)` avec r/plafond : reprise 0,6 %/12 % ; régulier 0,35 %/7 % ; avancé 0,15 %/3 %. Classe : `g ≤ 0,5·g_max` conservateur ; `≤ g_max` réaliste ; `≤ 1,5·g_max` ambitieux ; au-delà irréaliste                                       | r et plafonds défaut à calibrer         | Muñoz 2014 (≈ 0,4 %/sem)                   | OP     |
| P20 | Aucun chrono proposé (décision du 16/11/2026) : Anna choisit sa cible à l'onboarding ou dans Programme. L'app ne propose jamais de chrono cible. Elle affiche la classe de P19, sans jugement négatif (« ambitieux » plutôt que « irréaliste » dans l'interface) ; l'explication du verdict peut montrer son temps prédit aujourd'hui (`P0`), le gain que sa cible demande (`g`) et le gain habituel (`g_max`). Sans cible : objectif « finir », classe `sans-cible`, aucun calcul de g | | décision produit | DEC |
| P21 | Les allures d'entraînement viennent du VDOT actuel, jamais de la cible. Les blocs à allure de course utilisent l'allure cible seulement si la cible est au plus ambitieuse ; au semi et au marathon, jamais plus vite que l'allure T du VDOT de la semaine, revue à chaque semaine construite (12 km à 5:07 avec un T à 5:12 seraient une course, pas une séance)                                                                                                                                                                                |                                         | Daniels (T est l'allure tenue environ une heure ; les allures suivent le VDOT du moment)                                    | CONS   |
| P22 | Retirée le 18/11/2026, jamais appelée : la semaine suit le **réalisé** par G2, désormais lu sur la charge chronique (une semaine courte ne fait pas baisser la suivante, une charge durablement plus basse la plafonne). Bloquer la hausse après deux semaines incomplètes punissait les séances sautées, contre EV21 (TrainAsONE : « des données, pas des dettes » ; Runna : la suite ne change pas) | | banc d'essai, problème 4 | OP |
| P23 | Après la course : repos complet les premiers jours, puis des semaines de footings seuls (20 min au moins), ni séance de qualité ni sortie longue, avec des lignes droites une fois la dernière semaine ; leur nombre et leur volume suivent la distance de la course (MA6) | MA6 | recherche 06 §4 | CONS |
| P25 | Aucune séance nouvelle aujourd'hui sans son geste : quand une semaine en cours est construite ou reconstruite (début du programme, réglages, objectif, premier niveau, course proche), rien de nouveau n'est placé aujourd'hui et la séance du jour, si elle existe, reste telle quelle ; une réparation (M4) n'amène jamais sur aujourd'hui une course d'un autre jour. Le jour où le programme commence, la première séance vient au plus tôt le lendemain. Une semaine commencée avec au moins un jour libre après ce jour compte comme la semaine 1 affichée (« Semaine 2 sur N » la suivante) | | audit besoin réel du 17/11/2026 (séance 30 min après l'onboarding) ; test d'Anna du 19/11/2026 (un chrono saisi ajoutait une séance le jour même) | OP |
| P26 | Réévaluation : un niveau qui a 6 semaines au plus tard le dimanche de la semaine construite (dernier changement de niveau, par une course, un test ou ses séances (RC3), ou dernier test ou course couru) est mesuré de nouveau : la première séance de qualité de la semaine devient un `TEST` (comme F10), hors affûtage, et jamais avant qu'elle ait couru une séance dure du programme (T, CRUISE, I, R, SPE) : le test n'est jamais son premier effort dur. Dans une semaine de décharge, l'autre Q devient un E : le test y est la seule séance dure. Le test lu propose le niveau (RC1, RC2). (Avant le 21/11/2026 : toutes les 4 semaines, 4 tests sur le plan d'Anna dont le premier comme premier effort dur après son marathon, et 3 séances dures dans la décharge de la semaine 12.) Ses séances ne remplacent pas le test : suivies à l'allure cible, elles ne montrent pas qu'elle progresse par l'allure (RC3 demande 2 % plus vite que la cible), seulement par un cœur plus bas à la même allure (RC14) ou sous sa FC seuil (RC15). Un retest à 5 semaines quand aucune FC seuil n'est connue a été essayé le 21/11/2026 et écarté : sur le banc, +0,3 pour un retour de marathon, -0,2 pour l'autre, un test dur de plus ; à 5 semaines pour toutes, recul d'Anna (allures 8,8 → 8,4, contenu d'une autre persona 10 → 8,3) et une fausse hausse RC1 (recherche 08 §8) | 42 j | Daniels 2014 (le VDOT se recale toutes les 4 à 6 semaines, sur une course ou des séances ; les allures suivent le VDOT du moment) ; recherche 02 R23 ; Runna (aucun test imposé, allures recalées sur les séances) ; audit de pertinence du 21/11/2026 (`research-concurrents.md`) | OP |
| P24 | Semaine de la course (celle qui contient la date de l'objectif) : la course est une séance `RACE` le jour de la course (distance de l'objectif, allure cible sinon prédite F5), à son heure de départ (`startTime`, 09:00 sans réponse : la plupart des courses sur route partent le matin), quels que soient l'agenda et les jours sans course ; elle est gelée et remplace la sortie longue de la semaine. Course à moins d'une semaine complète (aucune semaine de plan pour elle) : gabarit d'affûtage (P13) au volume de la semaine de course de P18 (50 %, marathon 45 % de `V_pic`). Les Q qui n'ont plus de place sous H12 (une Q au plus un jour libre sur deux) deviennent des E de même durée. La course ne compte ni dans G1 ni dans P11. Une course `RACE` encore prévue à une autre date que l'objectif est supprimée | | Bosquet 2007 ; recherche 02 §6 | MA |

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
| P-10 | `feasibility(110, 105, 15, régulier)` | g 0,0455 ; g_max 0,0525 ; réaliste |
| P-11 | `feasibility(110, 100, 15, régulier)` | g 0,0909 > 0,0788 → irréaliste (affiché « très ambitieux ») ; aucun chrono proposé |
| P-12 | `feasibility(110, 108, 15, régulier)`                                                     | g 0,0182 ≤ 0,0263 → conservateur                                   |
| P-13 | `feasibility(110, undefined, 30, régulier)` | classe `sans-cible`, objectif finir |
| P-14 | Semaine Base, 4 courses                                                                   | `['E+strides', 'E', 'E+sprints', 'L']`, 0 Q                        |
| P-15 | Distribution prévue Z3 = 12 %                                                             | la Q de type I perd des fractions jusqu'à Z3 ≤ 10 %                |
| P-16 | (retiré avec P22)                                                                         |                                                                    |
| P-17 | Semaine du lundi 2026-11-23, `now` mardi 12:00, 10 km le dimanche 29, 4 courses | `RACE` dimanche 09:00 (heure par défaut), aucune L, 4 séances après `now`, aucune séance dure (hors course) après le mercredi 25 (J-4) |
| P-18 | Même semaine, `now` lundi 06:00, 10 km le mercredi 25 | `RACE` mercredi ; les autres séances sont des E, aucune le mercredi (Q sans place → E) |
| P-19 | `now` dimanche 22 18:00, 10 km le mardi 1er décembre | semaine du 23 : pas de `RACE`, aucune séance dure samedi 28 ni dimanche 29 ; semaine du 30 : `RACE` mardi, aucune autre séance dure |
| P-20 | Plan semi commencé le 2026-11-22, semaine d'affûtage finale du lundi 2027-03-15 | `RACE` dimanche 21, aucune L, séances dures au plus tard le mercredi 17 |
| P-21 | 10 km dimanche 29 à 10:30, cours de 07:00 à 12:00 ce jour-là, dimanche en `noRunDays` | `RACE` dimanche 10:30 |
| P-22 | Programme commencé mardi 08:00 (`planStart` = aujourd'hui), cours en semaine jusqu'à 16:30, courses dès 17:00, 4 courses | aucune séance mardi ; 4 séances du mercredi au dimanche ; L dimanche |
| P-23 | Semaine de décharge du semi, 4 courses | L = 0,35 × volume de la semaine (pas × 0,75 en plus) |
| P-24 | Avant-dernière semaine du semi (affûtage) | total des séances ≤ sa part de `V_pic` |
| P-25 | T continu de 50 min, L 80 min, E 40 min (71 % facile) | T raccourci par paliers de 10 % ; Z1 ≥ 75 % ; volume de la semaine inchangé, l'E plus long |
| P-26 | `TEST` de 20 min, L 60 min, E 40 min, en base | distribution tenue (le test n'est pas de l'entraînement) |
| P-27 | Semaine reconstruite un mercredi à 07:00, programme commencé 3 semaines plus tôt | aucune séance le mercredi |
| P-28 | Chaque semaine de décharge d'un semi à 4 courses, allure de course 5'13 | total ≤ volume de la semaine (P9) |
| P-29 | Profil de F-34 au 21/11 (4 sorties par semaine avant le marathon, 2 à 3 après) | fréquence ≥ 3 ; `V0` = sa meilleure semaine depuis la course (≈ 130 min), la course hors volume |
| P-30 | Même profil, semi le 04/04/2027, 4 courses | répartition base 2 (P6 : régulière), dév 9, spé 6, affûtage 2 ; fartlek en semaine 2 ; semaine 1 ≤ 1,10 × sa dernière semaine ; des séances I |
| P-31 | Plan semi (17 sem.) ; plan marathon de 21 semaines | L dans S-3, aucune en S-2 ; marathon : L en S-4, aucune en S-3 ni S-2 (la course remplace celle de S-1) |
| P-32 | Semaine spécifique d'un semi visé en 1:48 (5:07 /km) ; VDOT 39 (T 5:12) puis 42 | blocs à 5:12 ; puis à 5:07 |
| P-33 | `longRunMin(4, 130, semi, 62)` en semaine de charge ; hors charge ; plus longue de 150 min ; historique inconnu | 62 ; 49,4 ; 120 ; 49,4 |
| P-34 | `weekTemplate` dév. semi 4 courses, semaine 0 ; 5 courses, semaine 1 | `['I', 'E+strides', 'T', 'L']` ; `['CRUISE', 'E+strides', 'I', 'RECUP', 'L']` |
| P-35 | `weekTemplate` spé. semi 4 courses, semaines 0 et 1 ; semaine de décharge ; marathon en décharge ; 5 km | `SPE`, `E+strides`, `T` puis `CRUISE`, `L` ; `SPE`, `E+strides`, `I`, `L` ; `CRUISE` (pas d'I) ; `['I', 'E+strides', 'T', 'L']` |
| P-36 | `phaseSplit` semi, `S_tot` 19, régulière ; 5 km `S_tot` 4, régulière ; semi 17 base faible et régulière | base 2, dév 9, spé 6, affûtage 2 ; base 1 (P6 inchangé) ; base 10 (P7 l'emporte) |
| P-37 | `startingVolume` : 4 sorties/sem sur 8 sem. ; 2 par semaine ; arrêt de 28 j ; profil de P-29 (2 à 3 sorties depuis le marathon, 4 avant) | régulière ; non ; non ; régulière (son bloc de course) |
| P-38 | Semaine spé : T 25 min, SPE 2 × 20 min, L 95 min dont 25 à l'allure de course, E 40 min (64 % facile) ; puis T 22 min et E 40 min seuls | bloc de la L à 10 min (L toujours 95 min), SPE raccourcie, T intact à 25 min, Z1 ≥ 75 % ; puis T sous 20 min (rien d'autre ne cède) |
| P-39 | `longRunMin(4, 190, semi, 50, charge)` ; même chose après une course (référence G1 123) ; V 400 | 55 ; 72,2 (sa part) ; 120 (`Lmax`) |
| P-40 | Plan semi 4 courses, semaines Spé de charge ; semaines où la L porte le bloc ; plan à 3 courses | SPE puis seuil, L facile ; `E+strides`, `E+strides`, seuil, L avec bloc ; jamais 3 séances dures (L avec bloc comptée) ; 3 courses : SPE gardée (2 séances dures) |
| P-41 | Semaine de Dév à 300 min, L à sa part ; semaine de base à 190 min, L tenue par G1 à 49 min, footing habituel 45 min ; sans footing habituel | chaque E ≤ 0,75 × L ; E 45, 45, 45 ; E 37 |
| P-42 | Semaine S-2 du semi (affûtage), SPE de 2 × 3 km à 313 s/km ; 6 × 800 m × 0,55 | 2 × 1,7 km à 313 s/km ; 3 × 800 m |
| P-43 | 3 sorties/sem. avant un marathon le 25/10, dont un semi marqué course le 04/10 ; 2 sorties/sem. depuis, `V0` 90 | fréquence 3, régulière, base 2 (P7 : le semi compte comme une sortie) |
| W-6 | Niveau posé 36 j avant le lundi, un I couru depuis le début du programme ; 35 j ; 36 j sans aucune séance dure courue ; sans date ; posé il y a 60 j mais un test couru il y a 10 j ; 4e semaine (décharge), niveau de 40 j ; semaine d'affûtage | `TEST` ; aucun ; aucun ; aucun ; aucun ; `TEST` et aucune autre séance dure ; aucun (P26) |
| W-7 | Sorties longues de 120 min de S-12 à S-7, course à S-6, puis 4 footings de 40 min par semaine ; la même sans course marquée | L > 50 min (sa part) ; L ≤ 44 (1,10 × 40) |
| W-1 | Programme commencé 5 sem. avant ; 7 semaines à 180 min puis une à 60 ; puis 4 semaines à 90 (sorties de 45 min) | même semaine qu'avec 8 semaines à 180 ; ≤ 1,10 × 90 + 1 + (45 - 20), la L à 45 (G2b) |
| W-2 | VDOT provisoire, semaines 1, 2 et 5 du programme ; puis niveau mesuré en semaine 2 | `TEST` en semaine 2 seulement ; aucun test une fois le niveau mesuré |
| W-3 | FC repos +8 et nuits de 5 h 30 du lundi au vendredi de la semaine d'avant ; puis signaux normaux | semaine < 85 % de la semaine normale ; semaine normale |
| W-4 | Semaine construite en `recovering`, lumière jusqu'à lundi ; puis retour fini depuis une semaine | ≤ 85 % de la semaine normale (G7) ; semaine normale |
| W-5 | 10 km le dimanche, construit le dimanche d'avant | une seule Q hors course : 2 × 1 km à l'allure de course |
| W-8 | `V0` 90 (ses 4 semaines d'avant), 3 sorties, 50 min sa plus longue des 30 j, semi le 04/04/2027 | E 29,5, E 29,9, L 50 (pas 39,6) |

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

Q = échauffement 15 min E + corps + retour au calme 10 min E (défaut à calibrer). `V_km = V_min / allure E`.

| Type    | Corps de séance                                    | RPE cible | Dure                   | Plafond par séance                                             | Progression                                | Source           | Niveau |
| ------- | -------------------------------------------------- | --------- | ---------------------- | -------------------------------------------------------------- | ------------------------------------------ | ---------------- | ------ |
| E       | continu, plafond FC haut de E                      | 3         | non                    | 30 à 75 min                                                    | durée                                      | Daniels          | CONS   |
| RECUP   | très lent                                          | 2         | non                    | 20 à 40 min, ≤ 0,6 × un E                                      | aucune                                     | Daniels          | CONS   |
| L       | continu E ; en Dév, 1 sem. sur 2, les 10 dernières min (15 si L ≥ 75 min) à M ; bloc spécifique possible en Spé, jamais en décharge | 4 | oui | P14 | +5 à 10 min/sem, ≤ 1,10 × plus longue 30 j | Frandsen 2025 ; McMillan (fast finish) | OBS    |
| T       | continu au seuil                                   | 7         | oui                    | 20 min au moins ; au-delà ≤ 0,10 × `V_km` en distance, 40 min au plus | 20 + 5 min par semaine de charge de la phase | Daniels ; McMillan (15 à 40 min) ; Pfitzinger (20 à 40 min) | CONS   |
| CRUISE  | fractions T, récup 1 min par 5 min                 | 7         | oui                    | comme T : 20 min au moins, au-delà ≤ 0,10 × `V_km`, 40 min au plus ; 2 fractions au moins dans ce temps | 20 + 5 min par semaine de charge ; fraction 5, 8, 10, 6 puis 12 min selon la semaine (4×5, 3×8, 2×10…) | Daniels (10 % du volume) ; Pfitzinger (22 + 18 min quand la semaine le permet) | CONS   |
| I       | fractions 3 à 5 min à I, récup = durée de l'effort | 8         | oui                    | ≤ min(0,08 × `V_km`, 10 km), 12 min au moins, fraction ≤ 5 min | fractions de 3, 4, 5 min puis de nouveau 3, 4, 5 selon la semaine de charge ; 3 min en Spé | Bacon 2013 ; Pfitzinger (VO2 plus courts en fin de plan) ; Runna (le format change chaque semaine) | MA     |
| R       | 200 à 400 m à R, récup 2 à 3 × l'effort            | 8         | oui si ≥ 3 km          | ≤ min(0,05 × `V_km`, 8 km)                                     | +1 répétition                              | Daniels          | CONS   |
| SPE     | blocs à l'allure de course (M ou semi)             | 6         | oui                    | M ≤ min(0,20 × `V_km`, 29 km) ; semi 2×3 → 3×4 km, récup 3 min ; en décharge 2 × 1 km | % de la distance à l'allure                | Daniels ; Canova ; 2 à 3 × 3 miles (Running Magazine, Active.com) | CONS   |
| E + sprints | un E (type `E`) : échauffement E, 6 à 10 × 10 s (`strides`) à l'allure R, récup 1 min 30 au trot à l'allure E, retour au calme 10 min E ; à la place des côtes courtes | 3         | non                    | ≤ 2 min d'effort                                               | +2 répétitions                             | Hudson 2008 (sprints courts, récup complète) ; Paavolainen 1999 | CONS   |
| FARTLEK | variations libres dans un E                        | 5         | oui si > 6 min rapides | 6 à 20 min rapides cumulées                                    | +2 min                                     | Lydiard          | CONS   |
| strides | 6 × 20 s en fin de E (2 min, compris dans l'E)     | n/a       | non                    | ≤ 3 min d'effort                                               | aucune                                     | Daniels ; Runna | CONS   |
| TEST    | 10 min E, 20 min à fond (cible : l'allure de 20 min du VDOT courant, F2), 5 min E. Lu sur son tour (F18, RC1) | 9         | oui                    | taille fixe, jamais réduite (décharge, G2, P16)                 |                                            | recherche 02 §7.2 (20 à 30 min à fond) ; Friel 2016 | CONS   |

### Règles

| Id  | Règle                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Paramètres                                         | Source              | Niveau |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------- | ------ |
| C1  | Dimensionnement : nombre de fractions = `floor(plafond / durée de fraction)`, minimum 2 ; durée continue arrondie à la minute inférieure                                                                                                                                                                                                                                                                                                                     |                                                    |                     | OP     |
| C2  | Équivalent (Changer) : même famille d'abord. I : fractions de 3 min si la fraction prévue > 3 min, sinon 4 min ; nombre = `floor(temps à I prévu / nouvelle durée)`. T ↔ CRUISE, temps au seuil réduit jusqu'à ce que durée totale et charge soient ≤ prévues (récupérations comprises). SPE : blocs plus courts à temps égal ou inférieur. L : aucun équivalent (option absente). Si aucune forme de même famille : un cran en dessous (I → T, T → FARTLEK) | contrôle `sessionLoad(équiv) ≤ sessionLoad(prévu)` | règle de conception | OP     |
| C3  | Ressenti (vivoactive 4 sans auto-évaluation) : `easy` = cible - 2, `ok` = cible, `hard` = cible + 2 (borné 1 à 10). Ressenti absent : RPE = cible, charge marquée `estimated`, jamais utilisée pour une règle restrictive                                                                                                                                                                                                                                    |                                                    | Foster 2001         | ECR    |
| C4  | Une seule allure cible par étape, affichée « 6'08 /km » (décision du 19/11/2026 : une plage de plus d'une minute ne guide pas). La montre reçoit une zone étroite autour de la cible, comme Garmin Coach : ±10 s/km sur les étapes E (footing, sortie longue, récupération, échauffements), ±5 s/km sur M, T, I, R et l'allure de course. Seules les zones de FC (F13) restent des plages | ±10 et ±5 s/km | Daniels 2014 (table 5.2, une valeur E) ; décision produit du 19/11/2026 (comme Garmin Coach : une cible, une zone étroite) | DEC |
| C5  | Toute étape courue porte une cible d'allure, comme une séance Garmin : la montre la reçoit en zone d'allure, l'app l'affiche (« 5'15 /km », une seule valeur, C4). Sprints : 10 s à l'allure R (ce qu'atteint un sprint de 10 s), récupération au trot à l'allure E ; récupérations à l'allure E. Une séance sans étape E (jour de course allégé) prend l'allure E du VDOT que donne son étape de course (F3, F7). Plus aucun « Ressenti n/10 » affiché : le RPE reste la mesure de charge (C3) | | décision produit (18/11/2026) ; Daniels 2014 | DEC |

### Tests

| #   | Entrée                                                                                          | Sortie attendue                                     |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| C-1 | `buildSession('T', { weeklyMin: 200, paces: VDOT 40 })` (E 6:08 → `V_km` 32,6 ; T 5:06) | corps 20 min continus : le plancher l'emporte sur les 10 % (3,26 km = 16,6 min) ; 45 min en tout |
| C-2 | `buildSession('I', idem)`                                                                       | plafond 2,61 km = 12,2 min → 4 × 3 min, récup 3 min |
| C-3 | `isHard` : L de 75 min ; E+strides ; FARTLEK 5 min rapides ; R 2,4 km                           | true ; false ; false ; false                        |
| C-4 | `equivalents` de 6 × 800 m à I (VDOT 40, 3,75 min par fraction, 22,5 min à I)                   | 7 × 3 min, récup 3 min ; `sessionLoad` ≤ prévue     |
| C-5 | `equivalents` d'une L                                                                           | `[]`                                                |
| C-6 | `equivalents` d'un T continu 20 min (140 UA)                                                    | CRUISE 2 × 9 min, récup 2 min (20 min, 130 UA)      |
| C-7 | `feelToRpe('hard', 3)` ; `('easy', 2)` ; `('hard', 9)`                                          | 5 ; 1 (borné) ; 10 (borné)                          |
| C-8 | `sessionLoad` : 15 min E (3) + 4 × 5 min T (7) + 3 × 1 min récup (2) + 10 min E (3)             | 45 + 140 + 6 + 30 = 221 UA                          |
| C-9 | `buildSession('E', { durMin: 48, sprints: true }, base, progression 0)`                                   | type `E` ; étapes `warmup`, 6 × 10 s `strides` à l'allure R, 5 × 1 min 30 `recover`, `cooldown` 10 min ; ≤ 48 min ; non dure |
| C-10 | `buildSession` de chaque type (strides compris) ; `toEasy` d'un jour de course | chaque étape a `paceSKm` ; la plage E vient du VDOT de l'étape de course |
| C-11 | `repaceRanges` au démarrage du serveur : séances enregistrées avant C4 avec une plage (« 6'05 à 7'16 /km »), une passée, une à moins de 12 h, une gelée, une sortie longue samedi | seule la sortie longue prend une allure unique (E) ; un second passage ne change rien |
| C-11b | `repaceRanges` : un footing automatique construit avec l'ancien E (6'08 à VDOT 40), le même posé par Anna (`manual`) | le premier prend l'E du jour (5'51), le sien reste ; journalisé (« Allures précisées »), Annuler |
| C-12 | `T` et `CRUISE` à 400 min/sem (10 % = 34 min au seuil), étapes 0, 1, 2, 4, 6 ; `CRUISE` à 200 min, étapes 4 et 7 | T 30 (étape 2), 34 (étape 6) ; CRUISE 4 × 5 (récup 1), 3 × 8, 2 × 12 ; 2 × 10 et 2 × 10 (20 min, le plancher : 10 % = 16,6 min) |
| C-15 | `I` à 150 min/sem, étapes 0, 1, 2 | 4 × 3, 3 × 4, 3 × 5 min (12 min au moins) |
| C-16 | `SPE` semi, Spé, étapes 2 et 5 ; étape 2 en décharge | 3 × 4 km ; 3 × 4 km ; 2 × 1 km |
| C-13 | `I` étapes 0 à 3 ; en Spé | fractions 3, 4, 5, 3 min ; 3 min |
| C-14 | `L` de 80 min en Dév, étapes 1 et 2 ; étape 1 en décharge ; Spé étape 0 ; Spé étape 0 en décharge | 65 E + 15 M ; tout en E ; tout en E ; E + allure de course ; tout en E |

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
| H1  | Aucun chevauchement avec cours, examen, muscu, révision, indispo, travail, tampons compris. `travelMin` est le temps qu'il lui faut entre la fin d'une course et le début d'un cours (douche, trajet), réglé dans Réglages (« Après une course, avant un cours ») ; 30 min pour un nouveau profil, un profil existant garde le sien. Le travail se traite comme un cours, avec le trajet des deux côtés : elle en revient aussi | avant = `travelMin` (30 min par défaut) ; après = 30 min, `max(30 min, travelMin)` après un travail | Réglages ; décision du 26/11/2026 | OP     |
| H2  | Début ≥ `earliest`, fin ≤ `latestEnd`, jamais un jour de `noRunDays`. `latestEnd` 00:00 est minuit, la fin du jour. Des horaires qui laissent moins de 30 min (un E à son plancher) entre `earliest` et `latestEnd` ou 1 h avant `bedtime` (H7) sont refusés à l'enregistrement | réglages                             | choix d'Anna              | OP     |
| H3  | Au plus 1 course par jour                                                                                               |                                      | Runna                     | CONS   |
| H4  | Jamais deux séances dures des jours calendaires consécutifs                                                             | relâchable (R-a)                     | Seiler 2010               | CONS   |
| H5  | Muscu jambes → séance dure (Q ou L) : `début(dure) - fin(jambes) ≥ 24 h` (12 h si bloc marqué léger)                    | 24 h                                 | Doma 2013 ; Robineau 2016 | ECR    |
| H6  | Dure et jambes le même jour : la course avant, écart ≥ 1 h. Un travail marqué physique (`work` avec `legs`, « Travail physique ») compte comme une séance jambes ici et pour S4, pas pour H5, S2 ni S3 | 1 h                                  | Doma 2013 ; décision du 26/11/2026 | ECR    |
| H7  | Toute course finit ≥ 1 h avant `bedtime`                                                                                | 1 h                                  | Stutz 2019                | MA     |
| H8  | L en un seul bloc                                                                                                       |                                      |                           | OP     |
| H9  | Gel : une séance qui commence dans moins de 12 h n'est jamais déplacée automatiquement ; l'algo renvoie une proposition | 12 h                                 | décision produit          | OP     |
| H10 | Séance `manual` ou faite : fixe. Si elle viole une règle, avertir sans bloquer                                          |                                      | Runna                     | CONS   |
| H11 | Muscu, révision, cours, examen : jamais déplacés ni supprimés par l'algo                                                |                                      | décision produit          | OP     |
| H12 | Aucune séance dure de J-3 avant une course `RACE` à J+6 après elle (dernière Q à J-4, P18 ; footings seuls ensuite, P23), y compris la fin de la semaine qui précède une course en début de semaine. Anna peut forcer : la séance devient un E de même durée (EV1) | 3 j | Bosquet 2007 ; recherche 02 §6 | MA |
| H13 | Jours de fête : aucune séance de qualité ni test de réévaluation (P26) les 24 et 25 décembre, 31 décembre et 1er janvier ; ils passent à un jour voisin. Un footing ou la sortie longue peuvent y rester | 24/12, 25/12, 31/12, 1/1 | décision produit ; audit parcours réel F7 | OP |

### Contraintes souples (points)

| Id  | Règle                                                                    | Pénalité             | Source                           | Niveau |
| --- | ------------------------------------------------------------------------ | -------------------- | -------------------------------- | ------ |
| S1  | Dure finie < 4 h avant `bedtime`                                         | 30                   | Leota 2025                       | OBS    |
| S2  | Jambes → dure avec un écart de 24 à 48 h                                 | 40 × (48 - écart)/24 | Doma 2017                        | ECR    |
| S3  | Jambes → E avec un écart < 6 h                                           | 15                   | Doma 2013                        | ECR    |
| S4  | Dure suivie de jambes le même jour avec un écart < 6 h                   | 10                   | Robineau 2016                    | ECR    |
| S5  | Dure la veille d'un examen et finie < 4 h avant `bedtime`                | 50                   | analogie Leota 2025, Craven 2022 | OP     |
| S6  | Course dans les 3 h avant un examen                                      | 40                   |                                  | OP     |
| S7  | Écart à `preferredHour`, pour toutes ses courses. Sans heure donnée, ses heures habituelles (`usualHours`), chacune la médiane des heures de départ de 10 courses Garmin (heure de Paris), à la demi-heure (`usualHour`) : en semaine, ses 10 dernières courses du lundi au vendredi ; le week-end, ses 10 dernières du samedi et du dimanche ; pour la sortie longue, la plus longue course de chacune de ses 10 dernières semaines courues. Un jour sans heure à lui prend celle de l'autre sorte de jour. Sans heure ni course : aucune pénalité, le créneau le plus tôt l'emporte (A2) | 5 par heure, max 20 ; 10 courses | préférence ; audit du parcours (toutes ses courses à 7:00 alors qu'elle court le soir) ; audit parcours réel G1 (sorties longues du dimanche matin placées à 18:30) | OP     |
| S8  | L hors des jours qu'elle accepte (`preferredLongDays`, plusieurs possibles) ; parmi eux, le plus libre l'emporte par les autres règles, dimanche départage (1 point ailleurs). Sans choix : dimanche, samedi à 10 | 20 ; 1 ; 10 sans choix | Runna ; plans experts Garmin (recherche 05) | CONS   |
| S9  | Jour ou heure (> 2 h) différents de la même séance la semaine précédente | 5                    | Bruggisser 2023                  | MA     |
| S10 | > 2 jours consécutifs sans course (si ≥ 3 courses), bords de semaine compris : le dimanche d'avant et le lundi d'après comptent comme des jours de course | 10                   |                                  | OP     |
| S11 | Muscu non jambes < 3 h avant une dure                                    | 5                    |                                  | OP     |
| S12 | Deux dures à moins de 48 h (H4 respectée)                                | 10                   |                                  | CONS   |
| S13 | Course la veille ou le lendemain d'une autre course (des jours de repos entre les courses quand la semaine le permet) | 5 par course voisine | dur/facile, recherche 02 §4.1 ; Runna répartit les séances | OP     |

Toutes les pénalités : défaut à calibrer.

### Algorithme

| Étape | Règle                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | Placer dans l'ordre de priorité : L, Q1, Q2, E, RECUP (pour 5 et 10 km : Q1 avant L). Recherche avec retour arrière sur les créneaux de `freeSlots` filtrés par `checkHard`, triés par pénalité croissante                                                                                                                                                                                      |
| A1b   | Étalement : jamais trois jours de course d'affilée (séances déjà fixées de la semaine comprises) tant qu'une semaine sans ce cas tient sous les contraintes dures ; sinon la recherche reprend sans cette limite. S13 seul (5 points par voisine) perdait contre S7 et S9 : lundi, mardi, mercredi puis rien avant samedi, jeudi et vendredi soir libres (audit parcours réel 2, N-G3, 21/11/2026) |
| A2    | Objectif lexicographique : (1) contraintes dures ; (2) en replanification, coût de perturbation : nb de séances déplacées, puis nb de changements de jour, puis somme des décalages en heures ; (3) somme des pénalités souples ; (4) départage : créneau le plus tôt, puis `id` le plus petit. Exception à (2) : une solution qui bouge une séance de plus l'emporte si elle gagne ≥ 50 points |
| A3    | Ordre d'essai en replanification : autre créneau le même jour, puis échange avec une autre course de la semaine, puis autre jour                                                                                                                                                                                                                                                                |
| A4    | Infaisable : relâcher dans l'ordre (a) H4 devient souple à 100 points ; (b) raccourcir un E jusqu'à -30 % ; (c) supprimer un E ; (d) dégrader une Q en E. Jamais supprimer la L ni la dernière Q sans `warning` explicite. En replanification (`replan`), une séance qui ne trouve aucune place reste prévue à son créneau avec le `warning` A4 : seule Anna saute une séance (EV7, EV8, EV21), et le réglage suivant qui lui rend une place la déplace                                                                                                                                                                       |
| A5    | Périmètre : semaine en cours et suivante. Séances faites, `manual`, gelées (H9) : fixes                                                                                                                                                                                                                                                                                                         |
| A6    | `proposeMoveSlots` : 3 meilleurs créneaux valides de la semaine en cours ; le meilleur créneau du lendemain de la séance en fait toujours partie s'il est permis (il remplace le 3e) ; un matin (départ avant 12:00) aussi, le meilleur de la semaine, quand aucun des trois n'en est un et qu'un matin est permis (il remplace le 3e, ou le 2e si le 3e est le lendemain). Chaque créneau a une raison courte, jamais vide : même jour (« même jour, 1 h 30 plus tard ») ; sinon ce que le créneau coûte de plus qu'à sa place actuelle (pénalité dominante, « tard avant ton coucher ») ; sinon, pour une séance dure, la muscu jambes à moins de 3 jours (« ta muscu jambes est jeudi soir, l'écart est bon »), dite une seule fois parmi les créneaux proposés, car sur un second créneau elle ne le distingue plus ; sinon les cours du jour (« avant tes cours », « après tes cours ») ; sinon « journée sans cours ». Liste des créneaux interdits avec la raison de la première violation ; effets de bord annoncés avant validation |

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
| PL-13 | `placeWeek` L 66 min + 2 E, cours en semaine jusqu'à 16:30, courses dès 17:00, week-end libre | L dimanche ; aucun jour de course consécutif ; jamais plus de 2 jours sans course, bords de semaine compris |
| PL-14 | Même semaine, `preferredLongDays` [samedi] ; puis sans préférence, dimanche pris toute la journée | L samedi ; L samedi |
| PL-15 | Même semaine avec une Q en plus, 4 courses | 4 séances placées, aucun jour consécutif |
| PL-18 | Même semaine, `preferredLongDays` [samedi, dimanche] ; dimanche pris toute la journée ; samedi pris toute la journée | L samedi ou dimanche ; L samedi ; L dimanche |
| PL-19 | 4 courses (L, 3 E), muscu lundi, jambes mercredi et gainage vendredi à 18:00, cours mardi 10:15 et jeudi 13:30, `earliest` 07:00, `preferredLongDays` [samedi, dimanche], semaine d'avant mer, jeu, ven, sam | au plus deux jours de course d'affilée, une seule fois ; jamais plus de 2 jours sans course |
| PL-16 | `proposeMoveSlots` d'une Q mardi 08:00, jambes mardi 18:00 | le mercredi est proposé (19:00 au plus tôt) avec « près de ta muscu jambes » ; aucune raison vide |
| PL-17 | Raison d'un créneau sans coût : Q jeudi 19:00, jambes mardi 18:00 ; E jeudi 17:00 après un cours de 14:00 à 16:00 ; E à 07:00 ; E un jour sans cours | « ta muscu jambes est mardi soir, l'écart est bon » ; « après tes cours » ; « avant tes cours » ; « journée sans cours » ; la Q jeudi 19:00 quand la raison jambes est déjà donnée à un autre créneau, après un cours : « après tes cours » ; jamais deux créneaux proposés avec la raison jambes |
| PL-12 | `RACE` dimanche 29 ; `checkHard` Q vendredi 27 18:00, puis E au même créneau, puis Q mercredi 25 ; Anna déplace la Q de mercredi à vendredi | violation H12 ; `[]` ; `[]` ; déplacement accepté en E de même durée, `manual`, avertissement H12 |
| PL-20 | Aucune `preferredHour` ; ses 10 dernières courses partent entre 07:00 et 18:30 (médiane 18:30) ; puis 17:00 et 18:30 ; puis 18:10 ; puis aucune course. `placeWeek` L 90 min + 2 E avec l'heure habituelle | `usualHour` 18:30 ; 18:00 ; 18:00 ; aucune. Les E à 18:30, la L à 17:30 (finie avant le soir, S1) ; sans heure ni course, E à 07:00 |
| PL-22 | Aucune `preferredHour` ; 4 semaines de footings lundi et jeudi à 18:30, samedi 50 min et dimanche 95 min à 9:30 ; puis une seule course mardi 18:00 ; puis aucune. `placeWeek` L 90 min + 2 E avec ces heures, puis avec `preferredHour` 17:00 | `usualHours` semaine 18:30, week-end 9:30, sortie longue 9:30 ; semaine et sortie longue 18:00 ; aucune. La L le week-end à 9:30, les E de semaine à 18:30 ; avec l'heure donnée, la L à 17:00 |
| PL-23 | `preferredHour` 18:30, E jeudi 18:30, `proposeMoveSlots` lundi 08:00 ; puis tous les matins pris | un des 3 créneaux est un matin, vendredi en fait partie ; aucun matin |
| PL-24 | Semaine du 21 décembre : `checkHard` Q le 24 à 18:00, TEST le 31, Q le 1er janvier, E le 25, L le 25, Q le 23 ; `placeWeek` Q + E, lundi à mercredi pris | H13 ; H13 ; H13 ; `[]` ; `[]` ; `[]` ; la Q ni le 24 ni le 25 |
| PL-21 | `travelMin` 30, cours mercredi 10:15 à 12:15 : `checkHard` E 45 min mercredi 09:00, puis 09:15 ; puis 09:15 avec `travelMin` 0 | `[]` (fin 09:45) ; violation H1 (fin 10:00, 15 min avant le cours) ; `[]` |
| PL-26 | `latestEnd` 00:00, `earliest` 10:00, `bedtime` 01:00 : `checkHard` E 45 min lundi 23:00, puis 09:30 | `[]` ; violation H2 ; fenêtre de 14 h |
| PL-27 | `replan` d'un E jeudi 18:00, toute la semaine prise | E inchangé, toujours prévu ; aucun changement ; `warning` A4 |
| PL-28 | `travelMin` 45, travail jeudi 14:00 à 17:00 : `checkHard` E 45 min jeudi 12:30, 12:45, 17:30, 17:45 ; puis `travelMin` 0 et travail physique : Q 60 min jeudi 12:30, E 12:30, Q 08:00 (et son `softPenalty`), Q vendredi 08:00 | `[]` ; H1 ; H1 (15 min après le travail) ; `[]` ; violation H6 « Moins d'1 h entre ta course et ton travail physique » ; `[]` ; `[]` avec S4 ; `[]` |
| PL-25 | Semaine du 30 novembre de l'audit : 4 courses (L, 3 E), cours de la semaine A (jeudi jusqu'à 18:00, vendredi matin), `travelMin` 30, heures habituelles 18:30 et 9:30, sortie longue samedi ou dimanche, semaine d'avant mar, mer, ven, sam ; puis 4 courses, semaine d'avant lun, mar, mer, sam ; puis 3 E, jeudi à dimanche pris | jamais trois jours de course d'affilée ; idem ; lundi, mardi, mercredi (A1b relâché faute de place) |

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
| B1  | Fenêtre glissante 28 j se terminant la veille, jours de maladie exclus (`sickDays` : du premier jour de fièvre à « Ça va mieux », gardé par le statut `recovering`). Moyenne et écart-type (échantillon) ; médiane pour le sommeil                                                                                                                | 28 j              | Plews 2013 (méthode) ; Walsh 2021 | CONS   |
| B2  | Ligne de base valide si n ≥ 14 valeurs. Sinon : défauts de la recherche (B3)                                                                                                                                                                         | 14                |                                   | OP     |
| B3  | Défauts sans historique suffisant : FC repos : si n ≥ 7, seuil = moyenne disponible + 5 bpm ; si n < 7, signal ignoré. Sommeil : seuil = min(6 h, 8 h - 1,5 h) avec 8 h ou la valeur déclarée. Body Battery et stress : ignorés (aucun seuil validé) | 5 bpm ; 6 h       | Buchheit 2014 ; Craven 2022       | OBS    |
| B4  | Écart-type plancher pour éviter les seuils trop serrés : FC repos 1,5 bpm ; sommeil 30 min ; Body Battery 5 ; stress 3                                                                                                                               | défaut à calibrer |                                   | OP     |

### Signaux du matin

| Id  | Signal (vrai = négatif)                                                                                             | Seuil personnel                                                                 | Source                         | Niveau |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ | ------ |
| SG1 | FC repos                                                                                                            | `rhr_J ≥ μ + max(2σ, 3 bpm)`                                                    | Buchheit 2014                  | OBS    |
| SG2 | Sommeil                                                                                                             | `sommeil_J-1 ≤ médiane - max(2σ, 60 min)` OU moyenne 3 nuits ≤ médiane - 60 min | Craven 2022 ; Walsh 2021       | MA     |
| SG3 | Garmin (Body Battery et stress comptent pour **un seul** signal, car tous deux dérivés de la même mesure Firstbeat) | `BB_réveil ≤ μ - 2σ` OU `stress_J-1 ≥ μ + 2σ`                                   | aucune validation indépendante | OP     |
| SG4 | Ressenti                                                                                                            | dernière course des 48 h notée `hard` alors que RPE cible ≤ 4 et courue facile (RPE réalisé ≤ 4, AD1) : un tempo couru à la place d'un footing n'est pas un footing qui a paru dur | Foster 2001                    | ECR    |
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
| G1  | Pic de séance : durée ≤ 1,10 × plus longue course des 30 j ; distance prévue (durée × allure) ≤ 1,10 × plus longue distance des 30 j. Après une course marquée des 84 derniers jours, la plus longue vaut au moins 60 % de sa plus longue sortie d'entraînement de ces 84 j (P14). Le surplus va sur un E de la semaine si cet E reste sous G1 et sous 75 min (P15), sinon il est perdu | 1,10 ; 84 j, 60 % | Frandsen 2025 ; Mujika et Padilla 2000 ; Pfitzinger et Douglas (P14) | OBS    |
| G2  | Semaine : volume course 7 j ≤ 1,10 × la charge chronique, la meilleure des 4 semaines courues avant (souple). Une décharge, une maladie ou des séances sautées baissent une semaine, pas la charge chronique : la semaine d'après revient au plan | 1,10 ; 4 sem. | Damsted 2019 ; Frandsen 2025 (aucun lien entre rapport semaine/semaine et blessure, recherche 03 §3.3) ; Pfitzinger, Daniels (après une décharge, on reprend la charge d'avant) | OBS    |
| G2b | Ordre de réduction (G2 à G4, et P18) : footings E et RECUP jusqu'à leur plancher du catalogue (30 et 20 min), puis chaque Q d'un tiers au plus (fractions d'abord, P9 ; un bloc de seuil ne descend pas sous ses 20 min, la Q suivante cède à sa place, P16), puis la L jusqu'à sa part P14 de la semaine plafonnée ; pour une coureuse régulière (P6 : au moins 3 sorties par semaine sur les 8 semaines avant le programme), en semaine de charge, jamais sous `min(sa plus longue des 30 j, Lmax)` (P14) : G2, souple, est alors dépassé des minutes de la L au-dessus de ce que G2b lui aurait laissé, de 10 % du plafond (+ 1 min) au plus, les footings gardent leur plancher. Une débutante n'a pas ce plancher : sa charge chronique monterait trop vite (banc, débutante : semaines à 116 à 127 min pour 85 au plan). Le banc vérifie « semaine construite ≤ 1,1 × plafond G2 » Seul un plafond dur encore dépassé descend ensuite footings et L à 20 min | 30, 20 min ; 1/3 | recherche 02 §4.2 et 03 §8.1 (la L et la séance spécifique se gardent en premier) ; Daniels ; Pfitzinger, Hansons ; Pfitzinger et Douglas, Frandsen 2025 (la L qu'elle court déjà ne se raccourcit pas : aucun lien entre hausse d'une semaine et blessure) ; audit du 26/11/2026 (L de 39,6 min après une sortie de 50 min) | CONS |
| G3  | 14 j ≤ 1,30 × la meilleure quinzaine des 8 semaines courues avant (dur)                                                                                                                                                                                                                                   | 1,30              | Damsted 2019 ; Nielsen 2014 | OBS    |
| G4  | 3 semaines de hausse, au-dessus du pic des 4 semaines d'avant, sans semaine allégée → semaine suivante -25 %. Une hausse qui part d'une semaine sous 80 % de ce pic (décharge, maladie, coupure) est un retour, pas trois semaines de charge | 0,8 | pratique des plans (cycle 3:1) | CONS   |
| G5  | Muscu exclue de tous les compteurs (décision)                                                                                                                                                                                                                         |                   | décision produit            | OP     |
| G6  | Charge interne sRPE (course seulement) = RPE × durée ; affichage CTL/ATL (τ 42/7 j) sans décision                                                                                                                                                                     |                   | Foster 2001 ; Banister 1991 | ECR    |
| G7  | Reprise après arrêt sans maladie ni douleur (jours sans course n) : 3 à 6 j → S1 85 %, première séance facile ; 7 à 13 j → S1 70 %, pas de Q, allures -2 % en S2 ; 14 à 27 j → S1 55 %, Q en S2, allures -4 % ; ≥ 28 j → S1 45 %, footings seuls 2 sem., test proposé. Après une fièvre (EV9), la semaine construite pendant `sick` ou les 5 premiers jours de `recovering` suit ce tableau selon les jours sans course, au moins la ligne 3 à 6 j | défaut à calibrer | Mujika & Padilla 2000 ; recherche 03 §9.1 (« puis tableau §8.3 selon la durée ») | OP     |
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
| G-9 | Semaine L 70, T 60, E 35, E 35 ; semaines d'avant 200, 190, 200 puis 100 ; puis 4 × 100 | aucun changement ; 110 min |
| G-10 | Même semaine ; avant : 4 × 180, puis 60 (maladie), 120, 160, 190 | aucun changement (ni G3 ni G4 : c'est un retour) |
| G-11 | Même semaine, semaine d'avant 150 ; puis plafond dur à 120 | E 30, T 40, L 65 ; E 20, T 40, L 40 |
| G-12 | L 70, T continu 24 min (priorité 3), 6 × 800 m, E 30 ; plafond 175 | T à 20 min (son plancher), le 6 × 800 m perd 2 fractions |
| G-13 | L 50, E 30, E 30, semaine d'avant 90, L gardée à 50 ; sans L gardée ; plafond dur (G3) | L 50, total 109,4 ; L 39,6 ; L sous 50 |

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
onTimetableChange(st: State, newEvents: CalEvent[], now: string, own?: boolean): Result   // own : EV22
confirmDone(st: State, id: string, now: string): Result                                    // EV21
skipSession(st: State, id: string): Result                                                 // EV21
detectMissed(st: State, activities: Activity[], lastSync: string, now: string): Result
logFeel(st: State, sessionId: string, feel: 'easy'|'ok'|'hard'): Result
```

Tout `Result` porte `manual: true` sur ce qu'Anna a choisi, passe par `validateWeek`, et contient l'état antérieur nécessaire à Annuler.

### Règles

| Id   | Règle                                                                                                                                                                                                                                                                                                                                                                                          | Paramètres | Source                                    | Niveau |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------- | ------ |
| EV1  | Déplacer : garde le contenu. Créneau valide → appliqué, `manual`. Si une autre course doit bouger, l'annoncer avant validation. Créneau forcé qui viole H4, H5 ou H7 : accepté, avertissement d'une ligne, contenu adapté (Q → E de même durée)                                                                                                                                                |            | interactions.md ; Runna                   | CONS   |
| EV2  | Changer, plus court : fractions × 0,75 arrondi à l'inférieur (min 2), ou durée continue × 0,75 arrondie aux 5 min. Un footing avec sprints n'a que de l'endurance : son échauffement perd le quart de la séance entière (arrondi aux 5 min), les sprints restent | -25 %      | Mujika & Padilla 2000 (alléger)           | CONS   |
| EV3  | Changer, plus facile : même durée totale, tout en E, RPE ≤ 3                                                                                                                                                                                                                                                                                                                                   |            |                                           | CONS   |
| EV4  | Changer, équivalente : C2 ; absente si C2 ne renvoie rien                                                                                                                                                                                                                                                                                                                                      |            |                                           | OP     |
| EV5  | Changer, footing tranquille : `min(30, durée prévue)` min en E                                                                                                                                                                                                                                                                                                                                 |            |                                           | OP     |
| EV6  | Aucune option Changer ne dépasse `sessionLoad` prévue ni la durée prévue                                                                                                                                                                                                                                                                                                                       |            | décision produit                          | OP     |
| EV7  | Pas le temps : `proposeMoveSlots` dans la semaine en cours ; si vide → statut `skipped`, jamais rattrapée                                                                                                                                                                                                                                                                                      |            | Runna                                     | CONS   |
| EV8  | Fatiguée : séance du jour → repos. Si la prochaine séance dure tombe demain → `shorter` (-25 %). Avec `until` : repos chaque jour jusqu'à la date, puis G7 selon la durée                                                                                                                                                                                                                      |            | interactions.md                           | CONS   |
| EV9 | Malade, fièvre ou poitrine = oui : statut `malade` jusqu'à `feelBetter`. L'app conseille de ne pas courir tant qu'il y a de la fièvre et propose repos, mais ne bloque rien : si Anna veut courir, la séance devient un footing en endurance fondamentale (E) de `min(0,5 × durée prévue, 30)` min, RPE ≤ 3. Aucune Q. Après `feelBetter`, retour par paliers de 48 h au moins : 3 jours légers (E de `min(0,5 × durée prévue, 30)` min), 2 jours modérés (E de 0,75 × la durée prévue), puis retour normal, Q dégradée d'un cran jusqu'au 10e jour ; la semaine construite pendant la fièvre ou le retour suit G7. Les jours de fièvre restent hors des lignes de base du matin (B1) | 3 j ; 2 j ; 10 j | Schwellnus 2022 ; Elliott 2020 (reprise par stades, retour au stade précédent si un symptôme revient) ; recherche 03 §9.1 et §11.2 ; Runna « Not Feeling 100% » (allègement sur 3 à 14 j) ; décision produit (ne pas forcer) | CONS |
| EV10 | Malade, non (au-dessus du cou) : statut `rhume` jusqu'à `feelBetter`. Les séances restent proposées en E de la moitié de la durée prévue, arrondie aux 5 min inférieures, 15 min au moins, RPE ≤ 3. Aucune Q. Dès qu'elle le dit, toutes les séances automatiques encore prévues (pas celles qu'elle a placées, `manual`) passent à ce footing, en un seul changement annulable envoyé à la montre ; une semaine construite pendant le rhume l'est déjà. La décision du matin ne les réduit pas une seconde fois, et le redire ne change rien | 50 % ; 15 min | Weidner 1998 ; recherche 03 §9 (« neck check » : footing RPE ≤ 3, durée ≤ 50 %) | ECR |
| EV11 | Douleur 0 à 3 en marchant : séance → footing E (`min(durée prévue, 40)` min, pilotage RPE) ou vélo facile, au choix. Aucune Q tant que le statut dure | 0 à 3 | Silbernagel 2007 | ECR |
| EV12 | Douleur ≥ 4 : l'app conseille de ne pas courir (repos ou vélo) mais ne bloque rien. Si Anna veut courir : footing E de 20 min max, RPE ≤ 3, avec « arrête-toi si la douleur monte ». Si une douleur ≥ 4 dure plus de 3 jours : message « voir un kiné ou un médecin » (une fois par épisode). Retour : G7 selon la durée | 4 ; 3 j | Silbernagel 2007 ; consensus orientation | CONS |
| EV13 | `feelBetter` ne lève qu'un statut `pause`, `rhume` ou `douleur`, et lance le retour (EV9 ou G7). Après un rhume : statut `easy` pendant 3 jours (le jour même compris), où aucune Q n'est proposée (une Q devient un E de même durée ; la L et la course restent) ; les semaines sont reconstruites pour rendre leur durée aux séances raccourcies, puis retour normal (interactions.md, Pas dispo, Malade, Non). Il n'est jamais déduit d'un message ambigu par Reggie : il faut le bouton ou une réponse oui explicite | 3 j | recherche 03 §10.3                        | CONS   |
| EV14 | Réglages : semaine en cours et suivantes replacées (M4), séances `manual` gardées ; un nombre de courses ou un jour de sortie longue reconstruit les semaines, sans rien de nouveau aujourd'hui (P25). Changement d'objectif : semaines futures régénérées (M2), semaine en cours inchangée sauf conflit dur (EV20). Nouveau chrono (« Ton dernier chrono ») avec un niveau déjà connu : F10 recalcule le niveau, les séances à venir non gelées et non `manual` prennent les nouvelles allures (RC9), aucune n'est ajoutée, déplacée ni retirée ; les semaines suivantes sont construites avec ce niveau. Un seul changement, annulable, envoyé à la montre                                                                                                                                                                                                       |            | interactions.md                           | OP     |
| EV15 | Emploi du temps : diff ICS (ajouts, suppressions, changements d'heure) ; seules les séances en conflit ou dont une règle dépend (H1, H5 via muscu, S5, S6) sont replanifiées (M4). Séances < 12 h : proposition seulement                                                                                                                                                                      |            | décision produit                          | OP     |
| EV16 | Séance ratée : prévue, jour terminé, synchro postérieure à la fin du jour, aucune course ≥ 50 % de la durée prévue ce jour-là → `missed`. Jamais rattrapée, jamais échangée. La semaine est revérifiée (G1 à G3, H4) sans ajout. Si une course a eu lieu un autre jour sans séance prévue : rattachée à la séance la plus proche de J-1 à J+1 non faite, traitée comme un déplacement par Anna | 50 %       | Runna ; décision produit                  | CONS   |
| EV17 | Synchro absente ou plus ancienne que la fin du jour : pas de `missed`, statut inconnu ; l'app demande « Tu as couru ? »                                                                                                                                                                                                                                                                        |            |                                           | OP     |
| EV18 | Message de Reggie signalant douleur thoracique, palpitations ou malaise : branche EV9 + drapeau `orientation: 'urgente'` (message consulter rapidement)                                                                                                                                                                                                                                        |            | Elliott 2020                              | CONS   |
| EV19 | Semaine reconstruite autour de séances gardées (faites, gelées, `manual`) : chaque séance gardée remplace une séance construite, d'abord sa jumelle du même type et des mêmes étapes (un footing avec sprints gardé remplace le footing avec sprints, pas celui avec accélérations : P12), puis une du même type, sinon une séance aussi dure (`isHard`), sinon une autre, jamais la sortie longue (L). Si Anna a déplacé plus de séances que la semaine n'en compte, elle garde les siennes plus la L. Changer seulement le chrono visé garde le début du plan et ses phases ; une nouvelle distance ou une nouvelle date redémarre le plan | | décision produit | OP |
| EV21 | Séance finie sans course reçue (EV17) : l'app demande « Tu l'as faite ? ». `confirmDone` : « Oui » → `done` (seulement une séance commencée). `skipSession` : « Non, je l'ai sautée » ou « Passer cette séance » → `skipped`, jamais rattrapée, aucune autre séance ne bouge (EV16) | | Runna (sauter ≠ déplacer, recherche 05 §1.3) ; TrainAsONE (« les séances manquées sont des données, pas des dettes ») | CONS |
| EV22 | Événement qu'Anna place elle-même (muscu, révision, indispo, cours remis) : la course en conflit est déplacée comme en EV15, même si elle commence dans moins de 12 h (c'est son action, H9 ne s'applique pas). Le bandeau dit laquelle, où et pourquoi (règle cassée à l'ancienne place) | | interactions.md, feuille Ajouter | OP |
| EV20 | Conflit dur de EV14 : la date de la nouvelle course, ou celle de l'ancienne, tombe d'aujourd'hui à J+7. La semaine en cours est alors reconstruite (P24, H12) : seules ses séances automatiques encore à venir changent ; les séances faites, passées, gelées et celles qu'Anna a déplacées restent (EV19). Un seul changement, annulable, envoyé à la montre | 7 j | décision produit | OP |

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
| EV-9 | Malade oui ; Anna veut courir à J2 ; E prévu 45 min | footing E 22 min RPE ≤ 3, conseil de repos affiché ; aucune Q |
| EV-10 | Malade non ; Q 50 min prévue ; puis L de 66 min ; puis E de 25 min | footing E 25 min RPE ≤ 3, Q non proposée ; E 30 min ; E 15 min |
| EV-11 | Douleur genou 2 ; E 45 min prévu | footing E 40 min ou vélo 45 min |
| EV-12 | Douleur cheville 5, `until` dans 5 jours ; nouveau signalement ≥ 4 au jour 4 | repos conseillé, footing E 20 min possible ; message kiné ou médecin envoyé une fois |
| EV-13 | Douleur 4 un seul jour | repos conseillé, footing E 20 min possible ; pas de message d'orientation |
| EV-14 | ICS : cours ajouté vendredi 17:00 à 19:00 sur un E vendredi 18:00, `now` mercredi | E déplacé (M4), bannière « 1 cours ajouté vendredi · 1 course déplacée »           |
| EV-15 | Q mardi non faite, synchro mercredi 07:00                                         | `missed` ; semaine sans ajout                                                      |
| EV-16 | Q mardi non faite, dernière synchro mardi 16:00                                   | statut inconnu, question posée                                                     |
| EV-17 | `bedtime` passe de 23:00 à 22:00 ; E `manual` jeudi finissant à 21:30             | E gardé avec `warning` H7 ; autres séances replacées                               |
| EV-18 | Course faite mercredi alors que l'E était prévu jeudi                             | E rattaché, marqué fait, traité comme déplacé par Anna                             |
| EV-19 | TEST `manual` gardé ; la semaine prévoit L, SPE, T, E (aucun TEST) | TEST à la place de la SPE : L, T, E, TEST |
| EV-20 | Même TEST, semaine de base L, E, E, E + sprints (aucune Q hors L) | TEST à la place d'un E : L, E, E + sprints, TEST |
| EV-21 | 4 séances T `manual` dans une semaine de 4 courses | les 4 T plus la L |
| EV-22 | Seul le chrono visé change (même distance, même date) | `startedOn` et phases inchangés ; nouvelle date ou distance : `startedOn` = aujourd'hui |
| EV-23 | Objectif 10 km dimanche 29 fixé mardi ; T `manual` vendredi ; `RACE` encore prévue samedi (ancienne date) | T gardé tel quel ; `RACE` de samedi supprimée ; `RACE` dimanche |
| EV-25 | Q lundi 18:00 ; `confirmDone` à 20:00 ; puis `confirmDone` à 08:00 | `done`, change EV21 ; refus (pas encore eu lieu) |
| EV-26 | `skipSession` d'une Q, un E prévu mercredi | Q `skipped`, E inchangé, aucune séance ajoutée ; un second `skipSession` est refusé |
| EV-27 | L ce soir 17:00 à 18:30, `now` 08:00 ; Anna ajoute une muscu jambes à 19:00 | sans EV22 : proposition seulement ; avec : L déplacée, change EV22 avec « Moins d'1 h entre ta course et ta séance jambes » |
| EV-28 | Fièvre du lundi 23 au vendredi 27, « Ça va mieux » le 27 ; L de 69 min le 28, E de 40 min le 29, L de 60 min le 1er et le 2 décembre | E 30 min ; E 20 min ; E 45 min ; L 60 min. Jours de fièvre (B1) : du 23 au 27 |
| EV-29 | Jeudi 19 à 08:00, programme commencé la veille, aucune séance ce jeudi ; Anna saisit un semi en 1:50 | « Allures recalculées avec ton chrono » ; mêmes séances aux mêmes heures, rien le jeudi, allures plus vives ; Annuler rend tout |
| EV-23 | Mardi 08:00 : la course de mercredi 20:30 casse un coucher avancé à 22:00, mercredi et jeudi pleins de cours | la course bouge, mais jamais sur mardi (P25) |
| EV-24 | Mercredi 18 : objectif en mars, L déplacée par Anna au samedi 21 ; nouvel objectif 10 km dimanche 22 ; puis Annuler ; puis retour à l'objectif de mars | `RACE` dimanche, L de samedi gardée, aucune séance dure automatique du jeudi 19 au samedi 21, montre à jour, un seul changement ; Annuler rend tout ; retour en mars : plus de `RACE`, L gardée |
| EV-30 | Rhume dit lundi 08:00 ; E 45 min ce soir, Q 50 min mercredi, E `manual` 40 min jeudi, L 70 min dimanche ; puis le redire | E 20 min ; E 25 min ; E `manual` inchangé ; E 35 min ; un changement EV10 par séance. Redit : aucun changement |
| EV-31 | Rhume ; « Ça va mieux » mercredi 25 à 08:00 ; Q 50 min jeudi 26, Q 50 min samedi 28 ; L 70 min et E 40 min le jeudi | statut `easy` jusqu'au 28 ; Q de jeudi → E 50 min ; Q de samedi inchangée ; L et E inchangés. Semaine construite en `easy` : aucune Q avant la date, les Q reviennent après |
| EV-32 | Plus court d'un footing de 50 min avec 8 sprints (échauffement 28 min) | échauffement 15 min, sprints et retour au calme inchangés : 36,8 min (-26 %) |
| EV-34 | Soir du 23/11 : `earliest` 10:00, `bedtime` 23:30, « Pas après » 0:00 puis 23:45 ; E jeudi 18:00, L dimanche 16:00 | les deux séances restent prévues à leur créneau |
| EV-33 | Footing avec sprints couru lundi, semaine de base reconstruite mardi (P-14) | un seul footing avec sprints dans la semaine, le footing avec accélérations reste |

---

## M8. `recalibration` : propositions de niveau

Modèle Runna Pace Insights : preuve forte uniquement, proposition acceptée ou refusée en un tap, seules les allures changent, jamais la structure.

### Signatures

```ts
evaluateRace(a: Activity, current: Fitness, ctx: Ctx): Proposal | null
evaluateKeySessions(done: KeySession[], current: number, lastChange: string | undefined, history: PastProposal[], now: string, hrMax?: number, lthr?: number): Proposal | null   // RC3, RC15, RC14, RC16, RC17, RC20, RC4, RC19, RC18
evaluateFeels(feels: FeelLog[], current: number, now: string, ctx?: { lastChange?; history?; fatigueDays? }): Proposal | null
evaluateTrends(signals: DailySignal[], now: string, history?: PastProposal[]): Proposal | null
acceptProposal(st: State, p: Proposal, now: string): Result     // allures futures, hors séances gelées et manual ; un test prend la place de la prochaine Q
repaceRanges(st: State, now: string): Result   // C4 : une allure unique aux séances à venir encore enregistrées avec une plage, et l'E du jour aux séances automatiques construites avant F7 du 26/11/2026, hors séances gelées (12 h)
setAsideRefusal(runStart: string, setAside: string[], now: string): 'too_old' | 'too_many' | null   // RC21
```

### Règles

| Id   | Règle                                                                                                                                                                                                                                   | Paramètres   | Source                        | Niveau |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------- | ------ |
| RC1  | Course ou test éligible (F9) : VDOT calculé > courant + 0,5 → proposer le VDOT calculé (pas de plafond d'un point). Un test se lit sur son effort (son tour, F18), pas avec son échauffement                                                                                                                      | 0,5          | Daniels 2014                  | CONS   |
| RC2  | Course ou test éligible plus lent : écart ≥ 1,5 sans explication (chaleur > 15 °C, dénivelé, maladie dans les 14 j, ressenti `easy`) → proposer le VDOT calculé ; sinon ignorer                                                         | 1,5          | Daniels 2014 ; Ely 2007       | OBS    |
| RC3  | Hausse sans course : seules comptent les séances T, CRUISE ou I courues **après** le dernier changement de niveau (celles d'avant l'ont déjà prouvé). ≥ 2 séances (tours aberrants exclus : < 90 % ou > 110 % de la cible) à ≥ 102 % de l'allure cible en moyenne, FC ≤ prédiction F15 + 3 bpm, ressenti ≠ `hard`, et un appui : ressenti `easy` ou FC à la prédiction F15 ou dessous → proposer le VDOT prouvé, un point au plus au-dessus du courant, s'il dépasse le courant de 0,5. VDOT prouvé = le plus bas des `VO2(r · v_cible) / f`, `v_cible` étant l'allure que visait la séance (f = 0,88 en T, 0,975 en I). Attendre 28 j depuis le dernier changement, 14 j quand le VDOT prouvé vaut un point de plus | 102 % ; 28 et 14 j ; 3 bpm ; +1 | Daniels 2014 (garder un VDOT 3 à 4 semaines ; monter quand les séances deviennent faciles à la même allure) ; recherche 02 R23 (un point VDOT au plus par réévaluation) ; Runna Pace Insights (un écart constant, recherche 05 §1.3) ; banc d'essai, problèmes 1 et 9 | CONS   |
| RC14 | Hausse par la FC (après RC3, si FCmax connue, F12) : même allure, cœur plus bas. Séances T ou CRUISE des 6 dernières semaines (P26), lues sur leurs tours de travail (± 10 % de la cible) d'au moins 8 min (retard cardiaque) commencés dans les 20 premières minutes de travail (dérive), hors chaleur (> 20 °C), dénivelé (≥ 1 %), facteur externe ou ressenti `hard`. Chaque séance donne `FC-niveau / niveau de la séance`, FC-niveau étant le VDOT qui met sa FC à cette vitesse selon Swain (`%FCmax = 0,6463 · %VO2max + 37,182`), pour comparer des allures différentes. Les deux dernières séances lues, à 21 j au plus l'une de l'autre et courues après le dernier changement, comparées à la moyenne des séances lues avant elles (au moins une) : chacune ≥ 4 bpm sous la FC que sa ligne de base prédit à sa vitesse (3 bpm jusqu'au 21/11/2026 : sous un bruit de ± 2,5 bpm, la moitié de ses hausses dépassaient son niveau réel sur le banc) → proposer courant × (plus petit rapport / rapport habituel), un point au plus (4 bpm valent déjà plus d'un point au-dessus de VDOT 25), s'il dépasse le courant de 0,5. Jamais de baisse par la FC (RC2, RC4). Attente comme RC3 (28 j, 14 j pour un point), RC8 pour RC14 ; une FC au-dessus de sa FC seuil à allure T l'arrête (RC15). Pas de lecture sur les footings : sans modèle F15 construit, la FC à allure E reste trop bruitée (RC6) | 6 sem. ; 8 et 20 min ; 4 bpm ; 21 j ; 0,5 ; +1 | Swain 1994 (relation %FCmax-%VO2max) ; Buchheit 2014 (FC d'exercice sous-maximale : marqueur de la forme, erreur type de la FC d'exercice ≈ 3 %, plus petit changement utile ≈ 1 %) ; Lamberts 2011 (LSCT : FC à charge fixe qui baisse quand la performance monte) ; Daniels 2014 (monter quand la même allure devient facile) ; recherche 08 | OP |
| RC15 | Hausse par la FC seuil (après RC3, avant RC14, si FCmax (F12) et FC seuil (NV3 : test ou course F14, sinon ses tours au seuil) connues) : son cœur sous sa FC seuil à son allure T. Les deux dernières séances T ou CRUISE lues comme RC14 (tours de travail d'au moins 8 min commencés dans les 20 premières minutes de travail, hors chaleur, dénivelé, facteur externe ou ressenti `hard`), courues après le dernier changement, à 21 j au plus l'une de l'autre, à son allure T du moment ou plus vite (98 % au moins). Chacune ≥ 5 bpm sous sa FC seuil → proposer le VDOT dont l'allure T se court à sa FC seuil, tiré de chaque séance par la pente de Swain (`VO2 à la FC seuil = VO2(v) + (FC seuil - FC) / FCmax / 0,6463 × niveau courant`, divisé par 0,88), le plus bas des deux, un point au plus, s'il dépasse le courant de 0,5. Sans ligne de base : la FC seuil en tient lieu. Chacune ≥ 5 bpm au-dessus de sa FC seuil : à revoir, jamais une baisse (RC2, RC4) ; aucune hausse par la FC (ni RC15 ni RC14), le test suivant (P26) tranche. Attente comme RC3 (28 j, 14 j pour un point), RC8 pour RC15 | 5 bpm ; 98 % ; 21 j ; 0,5 ; +1 | Swain 1994 (pente %FCmax-%VO2max) ; Buchheit 2014 (erreur type de la FC d'exercice ≈ 3 %, soit 5 bpm à 170) ; Daniels 2014 (allure T à 88 à 92 % de la FCmax) ; Friel 2016 et Borszcz 2019 (FC seuil d'un test de 20 min, F14) ; Lamberts 2011 ; recherche 08 §6 et §7 ; banc d'essai (FC bruitée de ± 2,5 bpm : à 4 bpm, une fausse hausse sur quatre ; à 5, aucune) | OP |
| RC16 | Hausse par les footings (après RC15 et RC14, si FCmax connue) : ses 3 derniers footings (E, RECUP, L) courus après le dernier changement, à 21 j au plus l'un de l'autre, d'au moins 20 min, plats et frais, lus sur leurs tours de 5 min et plus (les lignes droites et leurs trots ne comptent pas), chacun 2 % plus vif que son allure E et sous 79 % FCmax → proposer le niveau dont E est l'allure du plus lent des trois (`VO2(v) / 0,74`), un point au plus, s'il dépasse le courant de 0,5. Attendre comme RC3. La carte dit « tes footings peuvent passer à 5'48 /km » | 3 ; 2 % ; 79 % ; 21 j | Daniels 2014 (E : 59 à 74 % du VO2max, 65 à 79 % FCmax, deux plages qui vont ensemble) ; recherche 09 §4 | OP |
| RC17 | Séances rapides faciles : ses 3 dernières séances T, CRUISE ou I depuis le dernier changement ressenties `easy`, à l'allure prévue à 2 % près, FC pas au-dessus de la prédiction F15 quand elle est connue → proposer un test (RC9), jamais un VDOT. 14 j après le dernier changement (RC20). Un point donné sur ce ressenti a été essayé le 26/11/2026 : sur le banc, il retardait de 5 semaines le test de P26 qui mesurait 2,7 points (retour de marathon) | 3 ; 98 % | Daniels 2014 (monter quand les séances deviennent faciles à la même allure) ; Foster 2001, RC13 (un ressenti ne mesure pas, un test le fait) ; recherche 09 §4 | OP |
| RC18 | Baisse par les footings (si FCmax connue) : ses 2 derniers footings lus comme RC16, à 10 j au plus l'un de l'autre, à son allure E ou plus lents (2 % près), chacun 3 bpm au-dessus de 79 % FCmax, ni chaleur (> 20 °C), ni dénivelé, ni course mise de côté → proposer le niveau dont E se court au plafond, tiré de chaque footing par la pente de Swain (`(VO2(v) − (FC − plafond) / FCmax / 0,6463 × courant) / 0,74`), le plus haut des deux, un point au plus, s'il est sous le courant de 0,5. Plus vite que E, un cœur haut est son choix d'allure, pas son niveau. La carte dit l'allure E proposée et offre « C'était une exception » (RC21) | 2 ; 10 j ; 3 bpm ; 79 % | Daniels 2014 ; Swain 1994 ; Buchheit 2014 (erreur type de la FC d'exercice ≈ 3 %) ; recherche 09 §4 | OP |
| RC19 | Baisse par les séances rapides : ses 3 dernières séances T, CRUISE ou I depuis le dernier changement ressenties `hard` à l'allure prévue (97 % au moins : plus lentes, c'est RC4), ou ses 2 dernières séances au seuil 5 bpm au-dessus de sa FC seuil (RC15) → proposer un point de moins. La carte offre « C'était une exception » (RC21). (Avant le 26/11/2026, un cœur au-dessus de la FC seuil était « à revoir », sans proposition) | 3 ; 97 % ; 5 bpm | décision de Darius du 26/11/2026 ; recherche 09 §4 | OP |
| RC20 | Pas de yo-yo : aucune baisse (RC4, RC18, RC19) dans les 14 j d'un changement de niveau, ni test RC17. Les hausses attendent déjà RC3 (14 ou 28 j). Le banc vérifie qu'aucun changement n'en suit un de l'autre sens à moins de 14 j, sur des données stables avec un bruit de FC de ± 2,5 bpm | 14 j | Buchheit 2014 ; banc d'essai (`checks.ts`, « yo-yo ») | OP |
| RC21 | Course mise de côté : une course qu'Anna explique par une cause ponctuelle (Reggie en juge, `explain_session`, ou « C'était une exception » sur une proposition de baisse) ne compte dans aucune lecture de M8 (RC1 à RC19, ressentis compris). Limites tenues par le serveur, pas par Reggie : une course des 7 derniers jours, deux mises de côté en 14 j au plus (la troisième est refusée avec sa raison : la cause est un signal). Une proposition en attente qui la lisait est retirée. Journalisé (« Course mise de côté : <résumé> »), Annuler. Seul le résumé de Reggie est gardé, jamais ses mots, montré à elle seule, jamais envoyé à Garmin | 7 j ; 2 en 14 j | décision de Darius du 26/11/2026 ; recherche 09 §4 | OP |
| RC4  | Baisse : ≥ 2 séances T ou I consécutives, courues après le dernier changement et 14 j au moins après lui (RC20), < 97 % de l'allure cible sans facteur externe (chaleur, vent, dénivelé, maladie, nuit courte SG2) → proposer -1                                                                                | 97 %         | règle de conception           | OP     |
| RC5  | Trois `hard` de suite sur des séances faciles **courues facilement** (RPE réalisé ≤ 4, AD1 : un tempo choisi n'est pas une fatigue) depuis le dernier changement → proposer un test, jamais une baisse : un ressenti mêle fatigue et forme, seule une performance prouve une perte (RC2, RC4). Si les signaux du corps confirment une fatigue (P9) un de ces jours-là, aucune proposition : la semaine suivante est allégée (P9) | 3 | Foster 2001 ; recherche 03 §6 (≥ 3 séances : proposer un test) ; Daniels (ne pas baisser le VDOT sur une fatigue passagère) ; banc d'essai, problème 2 | OP     |
| RC13 | Trop facile : trois séances faciles de suite (RPE cible ≤ 4) depuis le dernier changement de niveau, notées `easy` et courues au moins 3 % plus vite que leur allure cible (`paceRatio`, M10) → proposer un test, jamais un VDOT : une allure E ne mesure pas la forme, le test le fait (RC1). Une proposition RC13 tous les 14 j (RC8) | 3 ; 3 % ; 14 j | recherche 03 §6 (≥ 3 séances : proposer un test) ; Daniels 2014 (monter quand les séances deviennent faciles à la même allure) ; Runna Pace Insights (un écart constant, recherche 05 §1.3) | OP |
| RC6  | Retirée le 18/11/2026, jamais appelée : la FC à allure E de référence demande le modèle F15 que le serveur ne construit pas, et une FC qui monte dit autant la fatigue que la forme (RC5). La fatigue passe par P9, la forme par un test (RC5, RC7) | | | |
| RC7  | VO2max Garmin : variation ≥ 2 maintenue 14 j → proposer un test, jamais un VDOT. Vérifiée après chaque course                                                                                                                                                         | 2 ; 14 j     | Engel 2025                    | ECR    |
| RC8  | Une proposition par règle tous les 14 j, acceptée ou refusée (pas de cliquet sur les mêmes preuves) ; une proposition refusée : même sens non reproposé avant 14 j. Sauf course ou test (RC1, RC2) | 14 j | Runna Pace Insights (une proposition, acceptée ou refusée) | OP     |
| RC9  | Proposition acceptée : allures des séances futures non gelées et non `manual` recalculées (F7). Zones FC inchangées sauf nouveau LTHR. Test accepté : il prend la place de la prochaine Q automatique (ou d'un E avec sprints ou lignes droites, d'un fartlek) où il ne casse aucune contrainte dure ; aucune allure ne change | | Runna ; recherche 02 §7.2 (test en remplacement de Q1) | CONS   |
| RC10 | Retirée le 18/11/2026, jamais appelée : l'écran Programme reclasse la cible d'Anna (P19, P20) à chaque changement de niveau ; un second signal de Reggie redirait la même chose | | | |
| RC11 | Un changement automatique d'allure après une séance n'existe pas (tout passe par une proposition, RC12 compris)                                                                                                                                       |              | décision produit              | OP     |
| RC12 | Niveau en service posé par F10 seul (source `effort:…`, jamais accepté par Anna) : F10 le relit après chaque course synchronisée ; lecture `measured` > courant + 0,5 → proposer la lecture (hausse seulement : une baisse demande une performance, RC2, RC4). La carte nomme la course qui le prouve (« Ton 11 km du mercredi 11 novembre ») et l'allure T. RC8 : une proposition F10 tous les 14 j. Un niveau accepté (source `proposal:…`) n'est plus relu par F10 : RC1 à RC4 le font évoluer | 0,5 ; 14 j | test d'Anna du 19/11/2026 (niveau 34,2 en service, 38,1 mesuré) ; Daniels 2014 | OP |

### Tests

| #     | Entrée                                                                                  | Sortie attendue                                                                              |
| ----- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RC-1  | VDOT 40,38 ; semi officiel en 105:00, 12 °C, plat                                       | `Proposal` vdot 40,38 → 42,64                                                                |
| RC-2  | VDOT 40,38 ; 10 km officiel en 52:00 (VDOT 38,21), 12 °C                                | écart 2,17 sans explication → proposer 38,21                                                 |
| RC-3  | Même 10 km à 22 °C                                                                      | `null`                                                                                       |
| RC-4  | Écart -1,0 sans explication                                                             | `null`                                                                                       |
| RC-5  | VDOT 40 ; 2 séances T à 103 % ressenties `easy`, 30 j depuis le dernier changement ; puis à 102 % | 41 (prouvé 41,5, plafonné à +1) ; 41,0 (ce que 2 % prouvent, pas un +1 arrondi) |
| RC-6  | 1 seule séance à 103 %                                                                  | `null`                                                                                       |
| RC-7  | 2 séances à 102 % ressenties `easy`, 20 j depuis le dernier changement                  | `null` (moins d'un point prouvé : attendre 28 j)                                             |
| RC-8  | 2 séances I consécutives à 95 % sans facteur externe                                    | -1                                                                                           |
| RC-9  | 2 séances à 95 %, la 2e après une nuit SG2                                              | `null`                                                                                       |
| RC-10 | +1 refusé il y a 10 j ; nouvelles preuves de hausse                                     | `null`                                                                                       |
| RC-11 | VO2max Garmin 42 → 44,5 pendant 14 j                                                    | proposition `test`                                                                           |
| RC-12 | `acceptProposal` +1, séance du jour gelée, Q `manual` jeudi                             | ni la séance du jour ni la Q jeudi ne changent ; les autres prennent les allures de VDOT + 1 |
| RC-13 | VDOT 34 ; 2 séances T à 106 % et 108 % ressenties `easy` ; changé il y a 10 j ; puis il y a 15 j | `null` ; RC3 vers 35 (un point au plus) |
| RC-14 | VDOT 40, 30 j ; 2 séances T à 101 % ; à 103 % sans appui (`ok`, FC + 2) ; à 103 % avec FC sous la prédiction | `null` ; `null` ; 41 |
| RC-15 | VDOT 41 accepté le 20 ; séances des 17 et 20 à 106 % | `null` (elles ont déjà prouvé ce niveau) |
| RC-16 | RC3 accepté il y a 10 j ; nouvelles séances à 106 % | `null` |
| RC-17 | Test accepté ; semaine avec un E samedi ; puis avec 6 × 800 m jeudi et un E samedi | rien ne change ; `TEST` jeudi à la place du 6 × 800 m, VDOT inchangé |
| RC-18 | Test : 10 min E, 20 min à la vitesse de VDOT 44 (FC 182 / 195), 5 min E | RC1 vers `vdot(4400, 20)`, pas le VDOT de toute la sortie |
| RC-19 | Trois `hard` de suite sur des E ; puis `hard`, `ok`, `hard` | proposition `test` 40 → 40 ; `null` |
| RC-20 | Les mêmes : un jour de fatigue confirmée ; changement de niveau entre elles ; RC5 il y a 10 j ; il y a 15 j | `null` ; `null` ; `null` ; `test` |
| RC-21 | Niveau en service 34,24 (`effort:…:detrained`) ; F10 lit 38,06 sur le 11 km du 11/11 ; puis niveau en service 40 | proposition F10 34,24 → 38,06, preuve : 11 km du 11/11, T 5'18 ; `null` (jamais une baisse) |
| RC-22 | La même proposition refusée il y a 13 j ; puis il y a 15 j | `null` ; proposée |
| RC-23 | Trois E notés `easy` à 104 % de leur allure ; à 101 % ; notés `ok` ; RC13 refusé le jour même ; trois tempos notés `hard` (RPE réalisé 5) | `test` RC13 ; `null` ; `null` ; `null` ; `null` (ni RC13 ni RC5) |
| RC-24 | VDOT 40, FCmax 190, changé il y a 30 j ; T de 20 min à l'allure cible les 1er et 8 à FC 170, puis les 17 et 20 à FC 165 ; les mêmes pour un niveau 30 | RC14 40 → 41 (5 bpm valent 2 points, plafonné) ; 30 → 31 |
| RC-25 | Les mêmes : FC 165 puis 167 ; 167 et 167 ; sans séance avant la paire ; paire à 22 j d'écart | `null` ; `null` ; `null` ; `null` |
| RC-26 | FC 176 à la même allure ; FCmax inconnue ; une séance à 25 °C ; avec 150 m de D+ ; en 4 × 5 min ; avec un facteur externe | `null` (jamais de baisse par la FC) ; `null` ; `null` ; `null` ; `null` ; `null` |
| RC-27 | Niveau 40, changé il y a 10 j ; puis 15 j ; RC14 accepté il y a 10 j ; hausse refusée il y a 10 j ; changé le 18 (paire des 17 et 20) | `null` ; 41 ; `null` ; `null` ; `null` |
| RC-28 | VDOT 40, FCmax 190, FC seuil 170, changé il y a 30 j ; T de 20 min à l'allure cible les 17 et 20 à FC 165 et 164, sans séance avant ; changé il y a 10 j ; 15 j ; RC15 accepté il y a 10 j | RC15 40 → 41 (5 bpm valent 1,9 point, plafonné) ; `null` ; 41 ; `null` |
| RC-29 | Les mêmes : FC 166 et 165 ; paire à 23 j d'écart ; FC seuil inconnue ; changé le 18 (paire des 17 et 20) ; une séance 3 % plus lente que l'allure T | `null` ; `null` ; `null` ; `null` ; `null` |
| RC-30 | FC 176 et 176 (au-dessus de la FC seuil) ; séances à FC 180 et 180, puis 175 et 175 : sans FC seuil, puis avec FC seuil 170 ; le même 11 j après un changement | RC19 40 → 39 ; RC14 ; RC19 (jamais une hausse) ; `null` (RC20) |
| RC-31 | VDOT 40, FCmax 190 : footings des 10, 14, 18 à 5'40 (2 % plus vite que E 5'51), FC 145 ; l'un à 152 ; l'un mis de côté ; à 5'48 ; changé il y a 10 j | RC16 40 → 41 (E de 41,6, plafonné) ; `null` ; `null` ; `null` ; `null` |
| RC-32 | Sa semaine réelle : VDOT 39,42, FCmax 195, 50 min à 6'27 (142), 33 min à 6'25 (131), 31 min à 6'04 (150) | `null` : E est déjà 5'55, aucun footing plus vif |
| RC-33 | FCmax 190 : footings des 17 et 20 à 5'51 (E), FC 156 ; FC 152 ; à 13 j d'écart ; à 5'30 ; l'un mis de côté ; changé il y a 10 j | RC18 40 → 39 (37,4 au plafond, plafonné à un point) ; `null` ; `null` ; `null` ; `null` ; `null` (RC20) |
| RC-34 | 3 séances T ressenties `easy` à 100 % de la cible ; changé il y a 10 j ; l'une `ok` ; l'une avec FC + 3 ; l'une à 96 % | proposition `test` RC17 ; `null` ; `null` ; `null` ; `null` |
| RC-35 | Trois E notés `easy` à 104 %, le dernier mis de côté (RC21) | `null` |
| RC-36 | 3 séances T ressenties `hard` à 100 % ; changé il y a 10 j ; l'une `ok` ; l'une mise de côté | RC19 40 → 39 ; `null` ; `null` ; `null` |
| RC-37 | `setAsideRefusal` le 23/11 : course du 20 ; du 15 ; du 20 avec une autre le 12 ; avec deux (12 et 18) ; avec deux (05 et 18) | `null` ; `too_old` ; `null` ; `too_many` ; `null` |

---

## M9. `maintenance` : mode entretien

### Signatures

```ts
maintenanceWeek(history8w: number[], settings: Settings, weekIdx: number, fitness: Fitness): Session[]
postRaceWeek(usualMin: number, paces: Paces, distM: number, week?: number): Session[]
lastRace(goal: Goal, history: Activity[], monday: string): { day: string; distM: number } | undefined
postRaceIndex(race: { day: string; distM: number }, monday: string): number | null
recoveryWeeks(distM: number): number ; recoveryRestDays(distM: number): number ; recoveryText(distM: number): string
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
| MA6 | Après la course (objectif passé, ou dernière course marquée course objectif, RR1, quand « Garder la forme » ou un nouvel objectif a remplacé l'objectif) : repos complet de J+1 à J+`r` (jours indisponibles pour le placement) ; puis, à partir du lundi qui suit la course, `k` semaines faciles (semaine `i` = jours `7(i-1)+1` à `7i` entre la course et le lundi) : `n` footings par semaine pour une part du volume habituel (moyenne des 8 semaines qui finissent le jour de la course), lignes droites sur un footing de la dernière. Moins de 15 km : `r` 1, `k` 1, 75 % ; 15 à 30 km : `r` 2, `k` 2, 50 % puis 75 % ; 30 km et plus : `r` 3, `k` 3, 35 % (2 footings), 60 %, 80 %. Ensuite MA1 (« Garder la forme ») ou le plan (« Une nouvelle course ») : les semaines faciles remplacent les premières semaines du nouveau plan, qui reprend ensuite où il en est (sa phase Base absorbe la récupération). La durée ne dépend pas de l'effort : l'app ne le mesure pas de façon fiable et trop récupérer ne coûte pas de forme (recherche 06 §3). (Remplace le 21/11/2026 les deux semaines à 45 et 65 % posées sans source.) | 1, 2, 3 j ; 75 % ; 50, 75 % ; 35, 60, 80 % ; 15 et 30 km | recherche 06 : Sherman 1984 ; Wiewelhove 2018 ; Gómez 2002 ; Bernat-Adell 2021 ; Takayama 2017 ; Daniels 2021 ; Pfitzinger et Latter 2015 | CONS |
| MA7 | Objectif saisi : `V0` = moyenne des 4 semaines d'entretien, plan au lundi suivant (M2)          |              |                                               | OP     |
| MA8 | Arrêter le programme (bouton) : MA1 à partir de la semaine suivante, semaine en cours inchangée |              | interactions.md                               | OP     |

### Tests

| #    | Entrée                                                         | Sortie attendue                     |
| ---- | -------------------------------------------------------------- | ----------------------------------- |
| MA-1 | Moyenne 8 sem. 200 min, `runsPerWeek` 4                        | V 100 ; 3 courses ; 1 Q             |
| MA-2 | Moyenne 8 sem. 120 min                                         | V 90                                |
| MA-3 | `runsPerWeek` 3, semaines 1, 2, 3, 4                           | Q = T, I, FARTLEK, T                |
| MA-4 | V 100, L demandée                                              | L ≤ 40 min                          |
| MA-6 | `exitMaintenance([100, 110, 95, 105], semi, lundi 2026-11-16)` | `v0` 102,5 ; `planStart` 2026-11-23 |
| MA-5 | `postRaceWeek(180, P, 10 km)` | 3 footings de 45 min (75 %), lignes droites sur le premier (+2 min), aucune Q |
| MA-7 | `postRaceWeek(0, P, semi)` (aucune course connue) | 3 footings de 20 min |
| MA-8 | `postRaceWeek(180, P, semi, 1)` puis `2` | 3 × 30 min sans lignes droites ; 3 × 45 min (+2 min de lignes droites sur le premier) |
| MA-11 | `postRaceWeek(240, P, marathon, 1, 2, 3)` | 2 × 42 min ; 3 × 48 min ; 3 × 64 min (+2), lignes droites en semaine 3 seulement |
| MA-9 | Semi couru 1, 7, 8, 14, 15, 0 jours avant le lundi ; 10 km 1, 7, 8 ; marathon 14, 15, 21, 22 | semaine 1, 1, 2, 2, entretien, entretien ; 1, 1, entretien ; 2, 3, 3, entretien |
| MA-10 | Sans objectif, un semi marqué course 8 jours avant le lundi ; un 10 km | 3 footings, aucune Q ; entretien, avec sa Q |
| MA-12 | Semi couru la veille du lundi ; marathon | aucune séance lundi ni mardi ; 2 séances, aucune du lundi au mercredi |
| MA-13 | Nouvel objectif 10 km dans 10 semaines, programme commencé la veille, semi couru la veille | semaines 1 et 2 : 3 footings, ni Q ni L ; semaine 3 : le plan (4 courses) |

---

## M11. `review` : le bilan du dimanche et la course objectif

### Signatures

```ts
weekReview(input: { sessions; runs; before; exams; next }): { done; planned; minutes; highlight?; reggie }
isGoalRace(goal: Goal, run: Activity): boolean
previousRace(goal: Goal, history: Activity[], declared?: DeclaredTime): { timeMin; date? } | undefined
raceSplits(run: Activity, distanceM: number): { toKm; paceSKm }[]
raceReport(goal: Goal, run: Activity, previous?): { timeMin; gapMin?; previous?; splits; reggie }
```

### Règles

| Id  | Règle | Paramètres | Niveau |
| --- | ----- | ---------- | ------ |
| BR1 | Courses prévues : les séances de la semaine sauf celles annulées par le coach ; faites : celles au statut `done` (rattachées à une course Garmin ou « Oui, je l'ai faite ») | | DEC |
| BR2 | Temps couru : la somme des courses Garmin de la semaine, rattachées ou non | | DEC |
| BR3 | Fait marquant 1 : une séance de qualité (seuil, fractionné, vitesse, allure objectif, fartlek) dont les tours de travail (à 10 % de la cible au plus) vont 3 % plus vite que la cible (comme RC13). Jamais un footing plus rapide que prévu. La dernière de la semaine | 10 % ; 3 % | OP |
| BR4 | Fait marquant 2, à défaut : la plus longue course de la semaine, si elle dépasse toutes celles des 8 semaines d'avant et qu'il y en a au moins 8 pour comparer. Sinon pas de fait marquant : on n'invente rien | 8 sem. ; 8 courses | OP |
| BR5 | Phrase de Reggie, partie 1 : tout fait (« malgré tes examens » s'il y en a eu) ; une course manquée ; plusieurs (« sans rattraper ce qui manque », EV21) ; aucune. Rien sans séance prévue : « toutes tes courses » sur 0 n'a pas de sens | | DEC |
| BR6 | Partie 2 : la semaine suivante contre celle-ci, en minutes (≥ 5 % « monte un peu », ≤ -15 % « plus légère », sinon « même volume ») et en nombre de courses ; « c'est ta course » si elle contient la course | 5 % ; 15 % | DEC |
| BR7 | Affichage : le dimanche dès 18:00 (la tâche qui bâtit la semaine suivante et envoie « Ta semaine est prête ») et pas avant la fin de la dernière séance de la semaine, puis tout le lundi. « × » le ferme pour cette semaine, retenu par le serveur. Rien pour une semaine sans séance prévue (jamais « 0 sur 0 », même si elle a couru), ni pour une semaine finie avant le début du programme (`startedOn`) : un lundi d'onboarding n'a pas de bilan. Le lundi, le bilan ne redonne pas « La semaine prochaine » : c'est la semaine qui commence, déjà sous les yeux (audit parcours réel B1, G4). Lu le lundi, il parle comme un lundi : « Ton seuil de jeudi dernier », « Cette semaine garde le même volume » (audit parcours réel 2 N-F2, N2) | 18:00 | DEC |
| RR1 | La course objectif : une course du jour de l'objectif entre 90 et 120 % de sa distance (GPS, détours). Marquée `isRace` à la synchro. Son résultat reste sur Aujourd'hui tant que l'objectif ne change pas (nouvelle course, ou « Garder la forme » qui le retire) | 90 % ; 120 % | DEC |
| RR2 | Écart au chrono visé, à la seconde, dans les deux sens ; aucun sans chrono visé | | DEC |
| RR3 | Comparaison : sa dernière course marquée à cette distance, sinon son chrono déclaré à cette distance | | DEC |
| RR4 | Allure par tranche, d'après les tours : 1 km sur un 5 km, 2 km sur un 10 km, 5 km sur un semi, 10 km sur un marathon ; un bout de moins de 300 m (montre arrêtée après la ligne) rejoint la tranche d'avant ; rien si les tours couvrent moins de 90 % de la course | 300 m ; 90 % | DEC |
| RR5 | Phrase de Reggie : deuxième moitié plus rapide (de plus de 1 %), ou allure régulière (à 1 % près) ; fin la plus rapide ; puis « Bravo Anna. Repose-toi bien cette semaine. » | 1 % | DEC |

### Tests

`packages/coach/test/review.test.ts` : comptes et minutes (BR1, BR2), séance de qualité plus rapide et footing rapide ignoré (BR3), plus longue course et ses deux garde-fous (BR4), phrases (BR5, BR6), reconnaissance de la course (RR1), écarts (RR2), comparaison (RR3), tranches d'un semi et d'un 5 km (RR4), phrases de course (RR5), semaines faciles selon la distance (MA-5, MA-8 à MA-13).

---

## M10. `adaptation` : la semaine suit ce qu'elle a couru

Après chaque course synchronisée et rattachée à sa séance (EV16), l'app lit ce qu'Anna a vraiment couru et adapte la suite. Elle ne rattrape jamais rien : une séance plus facile, plus courte ou sautée ne change rien d'autre (EV16, EV21). Tout changement passe par le journal (Annuler) et se dit en une ligne sur Aujourd'hui, jusqu'au jour de la séance changée.

### Signatures

```ts
readRun(a: Activity, p: Paces, hrMax?: number): { minutes; load; rpe; fastMin; intervalMin; hard: boolean }
compareRun(s: Session | null, r: RunReading, p: Paces): 'as_planned'|'easier'|'harder'|'longer'|'shorter'|'other_type'|'extra'
paceRatio(s: Session, a: Activity): number | undefined
feelLog(s: Session, a: Activity, feel: Feel, p: Paces, hrMax?: number): FeelLog   // + rpeDone, paceRatio
adaptToRun(st: State, run: Activity, now: string, ctx: { sessionId?; history: Activity[]; hrMax? }): Result & { reading; deviation }
```

### Règles

| Id  | Règle | Paramètres | Source | Niveau |
| --- | ----- | ---------- | ------ | ------ |
| AD1 | Lecture de la course, tour par tour (la course entière sans tours utilisables : tours hors de 2:30 à 12:00 /km écartés, moins de 90 % de la durée couverte) : zone de Daniels par l'allure, frontières à mi-chemin entre E, M, T et I du VDOT courant ; RPE du catalogue (E 3, M 6, T 7, I 8) ; un tour à 88 % de la FCmax ou plus compte en T quelle que soit l'allure (chaleur, côte). Charge réelle = Σ minutes × RPE du tour (sRPE). Jour dur (H4) : plus de 6 min à T ou plus vite (la ligne du fartlek, M3), ou plus de 75 min (plus longue qu'un E, comme une L) | 6 min ; 88 % ; 75 min | Daniels 2014 (zones, 88 à 92 % FCmax au seuil) ; Foster 2001 (charge = RPE × durée) ; recherche 03 §1 | CONS |
| AD2 | Écart au plan, dans l'ordre : autre type (une Q prévue sans 6 min rapides, ou une course facile prévue qui en a plus de 6) ; plus dur ou plus facile (RPE moyen réalisé à 1 point ou plus de celui de la séance lue avec la même échelle) ; plus long (≥ 120 %) ou plus court (≤ 80 %) ; sinon comme prévu. Sans séance rattachée : `extra` | 1 ; 120 % ; 80 % | recherche 03 §6 (écart RPE réalisé et cible) | OP |
| AD3 | Jour dur non prévu (séance facile ou aucune) : la prochaine séance dure qui commence dans les 48 h de la course (ni `manual`, ni gelée, ni la course `RACE`) va au meilleur créneau valide de sa semaine à partir du surlendemain (la course compte comme un jour dur pour H4) ; sans créneau, ou à moins de 12 h (H9), elle devient un E de même durée (D3). La L est déplacée, jamais allégée | 48 h | recherche 03 §8.2 (« jamais deux séances dures consécutives ») ; Seiler 2010 ; S12 | CONS |
| AD4 | Course plus longue que prévu, ou en plus : si la semaine (couru + prévu) dépasse 1,10 × la charge chronique (G2), les footings E et RECUP à venir raccourcissent, priorité la plus basse d'abord, jusqu'à leur plancher (30 et 20 min, G2b). Ni les Q ni la L | 1,10 | Damsted 2019 ; G2, G2b | OBS |
| AD5 | Plus facile, plus court, comme prévu ou sauté : rien ne change, rien n'est rattrapé | | EV16, EV21 ; TrainAsONE (« des données, pas des dettes ») | CONS |
| AD6 | Le ressenti garde ce qu'elle a couru (`rpeDone`, `paceRatio`) : SG4 et RC5 ne lisent que les séances faciles courues facilement ; RC13 lit les séances faciles courues vite | | Foster 2001 | ECR |

### Tests

| #    | Entrée | Sortie attendue |
| ---- | ------ | --------------- |
| AD-1 | 45 min à l'allure E (VDOT 40) | RPE 3, 0 min rapide, 135 UA, pas un jour dur |
| AD-2 | 15 min E, 20 min T, 10 min E ; puis 20 min à l'allure E mais FC 90 % FCmax ; la même sans FCmax | 20 min rapides, 215 UA, jour dur ; jour dur ; pas un jour dur |
| AD-3 | E prévu 45 min couru en tempo ; à l'allure M ; 30 min ; 60 min ; 47 min ; sans séance ; 6 × 800 m couru en E ; L de 90 min en E ; T de 60 min dont 15 min courues au seuil | autre type ; plus dur ; plus court ; plus long ; comme prévu ; `extra` ; autre type ; comme prévu ; plus facile |
| AD-4 | Footing de mardi 18:00 couru en tempo, T mercredi 18:00, `now` mardi 19:00 | T déplacé au jeudi ou après, change AD3 |
| AD-5 | Même tempo, T mercredi 07:00, `now` mardi 20:00 (11 h) | T en E de 50 min au même moment |
| AD-6 | Même tempo, jeudi à dimanche pris ; puis une L à la place du T | T en E mercredi ; L inchangée |
| AD-7 | Footing couru comme prévu, en 25 min, ou plus lentement, T mercredi | rien ne change |
| AD-8 | 4 semaines à 160 min ; lundi 45 min courus, 40 min en plus mercredi, E de 45 min vendredi, L de 60 min dimanche ; puis sans historique | E de vendredi à 31 min, L inchangée, change AD4 ; rien |
| AD-9 | Footing noté `hard` couru en tempo ; couru à l'allure E | pas de SG4 ; SG4 |

---

## M12. `progression` : ce que Programme montre de sa progression

Lecture seule : rien ne change dans le plan. Programme montre son temps estimé sur la distance de l'objectif, la courbe de ce temps semaine après semaine, le temps couru face au temps prévu, et les séances tenues ; le détail explique chaque changement de niveau en une ligne. Rien n'est inventé : la courbe ne montre que des niveaux enregistrés (`fitness_estimate`, un par jour de changement, gardé et annulable comme tout changement), le pointillé ne va que vers le chrono visé, et le mode entretien (sans objectif) n'a pas de bloc. Le temps de course est en minutes : prévu et couru se mesurent pareil (durées des séances, durées Garmin), alors qu'une distance prévue serait une estimation.

### Signatures

```ts
levelOn(levels: LevelEntry[], day: string): LevelEntry | undefined
weeklyEstimates(levels: LevelEntry[], mondays: string[], distM: number, today: string): (number | undefined)[]   // min
weekVolume(sessions: Session[], runs: Activity[], monday: string, planMin?: number): { plannedMin; doneMin }
keptRuns(sessions: Session[], runs: Activity[], from: string): { kept; total }
levelChanges(levels: LevelEntry[], from: string, distM: number): (LevelEntry & { predictedMin; easyFrom?; easyTo })[]
```

### Règles

| Id  | Règle | Paramètres | Source | Niveau |
| --- | ----- | ---------- | ------ | ------ |
| PR1 | Temps estimé d'une semaine : `predictTime` (F5) du niveau en service à la fin de la semaine (le dernier posé ce dimanche-là ou avant ; aujourd'hui pour la semaine en cours). Aucun pour une semaine à venir ni avant le premier niveau. La courbe se dessine à partir de deux semaines | | F5 ; décision produit (aucune donnée inventée) | OP |
| PR2 | Temps de course de la semaine : prévu = somme des séances enregistrées sauf `cancelled` (sautées et ratées comprises : elles étaient prévues), ou le volume du plan (P9, P10) pour une semaine pas encore construite ; couru = somme des courses Garmin de la semaine, prévues ou non | | P9, P10 | OP |
| PR3 | Séances tenues depuis le début du programme : parmi les séances au sort connu (`done`, `missed`, `skipped` ; une séance passée en attente de « Tu l'as faite ? » ne compte pas encore), une séance `done` est tenue quand ses courses rattachées font au moins 80 % de sa durée prévue (la même limite que la course « bien plus courte » d'Aujourd'hui, PR #84), ou quand Anna l'a confirmée sans course de la montre (EV21 : sa parole) | 80 % | AD2 (plus court ≤ 80 %) ; décision produit | OP |
| PR4 | Allures ajustées : le niveau en service au début du programme (« Départ »), puis chaque changement après, chacun avec son temps prédit et l'allure E d'avant et d'après, expliqué en une ligne selon sa source (chrono déclaré, efforts de la montre, VO2max, RC1 à RC4, F10 relu par RC12) | | F7 ; M8 | OP |

### Tests

| #    | Entrée | Sortie attendue |
| ---- | ------ | --------------- |
| PR-1 | Niveaux 38 le 20/10, 40 le 01/11, 41 le 12/11 ; semi ; semaines des 02, 09, 16 et 23/11, aujourd'hui le 18/11 ; puis aucun niveau | 1:50:54 ; 1:48:35 ; 1:48:35 ; aucun. Aucun partout |
| PR-2 | Semaine du 16/11 : E 45 min faite (47 min courues), Q 50 min ratée, L 80 min prévue, E 40 min `cancelled` ; 30 min courues en plus jeudi ; puis une semaine sans séance, plan à 200 min | prévu 175, couru 77 ; prévu 200, couru 0 |
| PR-3 | Depuis le 02/11 : faites à 40/50 min, à 39/50 min, confirmée sans montre ; une ratée, une sautée, une prévue ; une faite le 30/10 | 2 tenues sur 5 |
| PR-4 | Mêmes niveaux, programme commencé le 02/11 | Départ 40 (1:50:54, E 5'51) ; 41 le 12/11 (1:48:35, E 5'44 au lieu de 5'51) |

---

## M13. `level` : « Ton niveau » et ses chronos possibles

Lecture seule : rien ne change dans le plan. Programme montre trois chiffres (VO2max de la montre, allure seuil, FC seuil) et, dans le détail, les chronos possibles sur 5 km, 10 km, semi et marathon. La VO2max est le seul chiffre Garmin : la vivoactive 4 n'a ni seuil lactique ni prédicteur de course, et le seuil Garmin exige une ceinture (recherche 07 §1). Les chronos et l'allure viennent du niveau en service (F10, RC1 à RC12), jamais de la VO2max Garmin (recherche 07 §2.2 ; F17).

### Signatures

```ts
racePredictions(vdot: number, volume: { avgWeeklyMin; longestRunMin }): { distM; min?; bestCase? }[]   // min
thresholdLapsHr(a: Activity, tPace: number): number | undefined                                        // bpm
thresholdHr(activities: Activity[], tPace: number, now: string): { bpm; from: "test" | "race" | "laps"; date } | undefined
```

### Règles

| Id  | Règle | Paramètres | Source | Niveau |
| --- | ----- | ---------- | ------ | ------ |
| NV1 | Chronos du 5 km, 10 km et semi : `predictTime` (F5) du niveau en service, la distance de l'objectif comprise (seule sa mise en avant change). Niveau `provisional` : chaque chrono précédé de « ≈ ». Sans niveau : pas de bloc | | Daniels 2014 ; recherche 07 §2.2, §2.3 | OBS |
| NV2 | Marathon, selon le volume moyen des 8 dernières semaines (minutes courues / 8) et la plus longue sortie des 6 dernières, courses marquées exclues (le marathon couru n'est pas l'entraînement qui en prédit un autre) : volume ≥ 240 min et sortie ≥ 1 h 45 → F5 ; volume < 150 min ou aucune sortie ≥ 1 h 15 → aucun chrono (« Pas encore ») ; sinon le plus lent de F5 et de Riegel 1,07 depuis le semi prédit (F6), affiché « au mieux » | 240 min (F6) ; 150 min, 1 h 15, 1 h 45 à calibrer | Vickers & Vertosick 2016 (Riegel trop rapide de 10 min en médiane au marathon) ; recherche 07 §2.3 | OBS/OP |
| NV3 | Allure seuil = allure T de l'app (F7). FC seuil, dans l'ordre : le test (celui de l'app ou de 30 min) ou la course de 50 à 65 min la plus récente des 8 dernières semaines (F14) ; sinon la moyenne des 2 sorties les plus récentes de 8 semaines dont les tours consécutifs tiennent l'allure T à ±3 % pendant 15 min au moins, FC moyenne des tours qui commencent après la 5e minute (dérive et retard du capteur au poignet) ; sinon inconnue (« À mesurer »). Jamais un pourcentage de FCmax ou de FCR présenté comme une mesure : il reste dans les zones (F13) | 8 sem. ; ±3 % ; 15 min ; 5 min ; 2 sorties | Friel 2016 ; McGehee 2005 (test de 30 min, erreur-type 8 bpm) ; Fleckenstein 2023 (88 à 95 % FCmax au seuil) ; recherche 07 §3 | CONS/OP |
| NV4 | VO2max : la plus récente des 30 derniers jours, avec sa lecture F19 face à sa course déclarée (« au-dessus » dès 5 points d'écart : 45 contre une course à VDOT 40 n'est jamais « en accord ») ; sans VO2max, la colonne disparaît | 30 j | F19 ; recherche 07 §4 | OP |

### Tests

| #    | Entrée | Sortie attendue |
| ---- | ------ | --------------- |
| NV-1 | VDOT 40, 260 min/sem., sortie la plus longue 2 h | 24:06 ; 50:01 ; 1:50:54 ; 3:49:37 |
| NV-2 | VDOT 40, 260 min/sem. et sortie de 1 h 30 ; puis 180 min/sem. et sortie de 2 h | marathon 3:52:49 au mieux, les deux fois |
| NV-3 | VDOT 40, 140 min/sem. et sortie de 2 h ; puis 200 min/sem. et sortie de 1 h 10 | marathon : aucun, les deux fois |
| NV-4 | Tours de 1 km à l'allure T (VDOT 40) : 4 tours à FC 162, 172, 172, 172 ; 2 tours ; 4 tours 5 % plus lents ; un tour sans FC au milieu | 172 ; aucun ; aucun ; aucun |
| NV-5 | Test de 30 min (FC 175) le 10/11, course de 60 min (FC 178) le 14/11, tempo le 18/11 ; aujourd'hui le 21/11 | 178, course, le 14/11 |
| NV-6 | Deux tempos à FC 170 et 174 les 06 et 13/11 ; un seul tempo ; des efforts de plus de 8 semaines ; seulement des footings | 172, tours, le 13/11 ; inconnue ; inconnue ; inconnue |
| NV-7 | VO2max 45, semi déclaré en 1:51 (VDOT 40,0) | « au-dessus », pas « en accord » |
| NV-8 | 180 min par semaine en footings d'1 h, plus un marathon marqué de 4:06 il y a 4 semaines | marathon : aucun (« Pas encore ») |


---

## M14. `request` : une séance demandée par Anna

Anna peut demander une séance à Reggie (« un fractionné jeudi », « une sortie longue d'1 h 30 ce week-end », « une séance de plus cette semaine », « remplace mon footing de demain par du seuil »). L'algorithme seul décide : il construit la séance depuis le catalogue (M3) à son niveau, la place avec les contraintes dures (M4) et vérifie la semaine (P11, G1, G2) ; sinon il refuse avec la règle et sa raison, et propose la demande la plus proche qu'il accepte. Reggie n'écrit jamais la séance lui-même (§0.2). Recherche : `research/09-seance-a-la-demande.md`.

### Signatures

```ts
type SessionAsk = {
  type: 'E' | 'RECUP' | 'SPRINTS' | 'L' | 'T' | 'CRUISE' | 'I' | 'R' | 'SPE' | 'FARTLEK';   // SPRINTS : footing avec sprints (P12)
  days?: string[];          // jours acceptés ; absent : de demain à dimanche
  durMin?: number;
  reps?: number;            // I, R, CRUISE
  replace?: string;         // id de la séance remplacée ; 'add' : une course de plus ; absent : la course automatique du jour, sinon une de plus
};
requestSession(input: WeekRequest sans monday ni kept & { sessions: Session[]; ask: SessionAsk }):
  | { ok: true; session: Session; sessions: Session[]; changes: Change[]; notes: Warning[] }
  | { ok: false; refusal: Warning; alternative?: { ok: true; ask; session; sessions; changes; notes } }
weekFrame(r: WeekRequest, paces): WeekFrame   // semaine d'après course, semaine du plan (phase, volume, décharge) ou entretien
```

### Règles

| Id   | Règle | Paramètres | Source | Niveau |
| ---- | ----- | ---------- | ------ | ------ |
| RQ1  | Moment : un jour de cette semaine ou de la suivante, jamais passé. Sans jour donné : le jour de la séance qu'elle remplace, sinon de demain à dimanche (depuis un dimanche, la semaine suivante). Aujourd'hui seulement si Anna le nomme et qu'un créneau reste avant `latestEnd` et son coucher (P25 : rien de nouveau aujourd'hui sans elle). Plusieurs jours acceptés : celui dont le créneau coûte le moins (contraintes souples, M4) | 14 j | P25 ; décision produit | OP |
| RQ2  | Ce qu'elle remplace : une séance nommée encore à venir, ni faite, ni gelée, ni le jour J. Sans précision, la course automatique du jour (pas une L, un TEST ou le jour J, ni une course `manual`, gelée ou faite) ; une telle course ce jour-là refuse le jour (H3). `add` garde toutes les courses | | H9, H10 ; EV21 | OP |
| RQ3  | Santé : fièvre (statut `malade`) → rien n'est ajouté. Rhume, douleur en cours, reprise après fièvre (jusqu'à `qEasierUntil`) ou après rhume (`easy`) → aucune séance dure ; un footing prend la taille de EV9 à EV13 | | EV9 à EV13 ; Schwellnus 2022 ; Silbernagel 2007 | CONS |
| RQ4  | Phase : semaines d'après course (MA6, P23) et affûtage (P18) → aucune séance dure de plus (les rappels du plan restent) ; base → ni I, ni R, ni SPE (seuil, seuil en fractions et fartlek oui) ; sans objectif → pas d'allure objectif (SPE) | base : 1 Q | recherche 02 §1.2, §2.2 (base : 0 à 1 qualité, Z3 0 à 3 %, 0 % d'allure spécifique), §6 ; Bosquet 2007 ; recherche 06 §4 | CONS |
| RQ5  | Taille : la dose du catalogue pour la semaine du plan (volume, phase, étape, décharge × 2/3, C1). Moins de fractions ou une séance plus courte (× 0,5 au moins) si elle le demande, jamais plus que la dose. Footing 20 à 75 min, récupération 20 à 40 min, footing avec sprints 30 à 75 min. Sortie longue ≤ min(Lmax de la distance (P14), 1,10 × sa plus longue course de 30 j (G1)) ; sans objectif ≤ 75 min (MA4). Sans durée donnée : celle de la séance remplacée ; une course de plus : 30 min (plancher E, P15) ; une sortie longue : celle de P14. Chaque borne appliquée est dite | voir texte | Daniels ; P14 ; P15 ; G1 (Frandsen 2025, recherche 03 §3.3) | CONS |
| RQ6  | Placement : H1 à H7, H12, H13 (`checkHard`) ; la séance remplacée garde son heure si ces règles y tiennent, sinon le meilleur créneau du jour (A6). Muscu jambes (H5, H6), cours, travail, trajet (H1), horaires et coucher (H2, H7) s'appliquent comme pour toute séance | | M4 | OP |
| RQ7  | Deux séances dures par semaine au plus (P11, une L avec bloc d'allure de course comptée ; une seule en base) : au-delà, la séance dure automatique de plus faible priorité encore à venir devient un footing de même durée ; sans séance à changer → refus. Une seule L par semaine : une L demandée un autre jour déplace celle de la semaine (refus si elle est fixée) | 2 ; base 1 | P11 ; recherche 02 R13 | CONS |
| RQ8  | Courses : au plus `runsPerWeek` + 1 dans la semaine. La course en plus est ponctuelle, les réglages ne changent pas | +1 | décision produit | OP |
| RQ9  | Volume de la semaine ≤ max(semaine prévue, 1,10 × la meilleure des 4 semaines courues avant, G2) ; aucune hausse en affûtage, en décharge ou après une course (P18, P9, MA6). Au-delà, les footings automatiques à venir raccourcissent d'abord jusqu'à leur plancher (ordre de G2b) ; sinon refus | 1,10 | G2 ; recherche 03 §3.2 ; Bosquet 2007 | CONS |
| RQ10 | Refus : la règle et sa phrase. Alternative, la première acceptée parmi : les autres jours de la même semaine (si la règle tient au jour), plus court de l'excès (G2), un fartlek à la place d'une I ou d'une R en base, un seuil à la place de l'allure objectif sans objectif, puis un footing aux mêmes jours. Aucune alternative pendant une fièvre ni pour une séance qui ne change plus | | décision produit | OP |
| RQ11 | Acceptée : la séance porte `manual: true` (une reconstruction la garde, EV19) ; elle et tout ce qu'elle change (séance remplacée, L déplacée, Q devenue footing, footings raccourcis) forment un seul changement du journal, annulable, envoyé à la montre. Reggie montre la proposition et n'applique qu'après son accord, sauf demande précise acceptée telle quelle | | §0.2 ; interactions.md | OP |

### Tests

Semaine de développement du semi (début du programme le 5 octobre), lundi 23 novembre 08:00, 4 courses de 60 min par semaine depuis 20 semaines : seuil mardi 18:00 (50 min), footings mercredi et vendredi 18:00 (45 min), L dimanche 10:00 (90 min).

| #     | Entrée | Sortie attendue |
| ----- | ------ | --------------- |
| RQ-1  | Remplace le footing de vendredi par du seuil ; footing de 30 min à la place de celui de mercredi, sans jour dit | seuil vendredi 18:00, même id, `manual` ; aucune autre séance ne change. Footing mercredi 18:00, 30 min |
| RQ-2  | Fractionné jeudi | ajouté jeudi, une course en plus (RQ8), footings à venir raccourcis (RQ9), semaine ≤ 1,10 × 240 min |
| RQ-3  | Fractionné mercredi (lendemain du seuil) | refus H4 ; alternative : fractionné un autre jour de la semaine |
| RQ-4  | Seuil lundi, fractionné mercredi (priorité 3), footing jeudi, L dimanche ; fractionné vendredi | accepté ; le fractionné de mercredi devient un footing (RQ7) ; deux Q dans la semaine |
| RQ-5  | 10 km le 1er décembre ; fractionné jeudi | refus P18 ; alternative : footing |
| RQ-6  | Fièvre ; footing. Rhume ; seuil à la place du footing de vendredi | refus EV9 sans alternative. Refus RQ3 ; alternative : footing de 20 min vendredi |
| RQ-7  | Sortie longue de 2 h 30 samedi (plus longue course de 30 j : 60 min) | L de dimanche déplacée à samedi, 66 min ; notes « 1 h 06 au plus… » et « Ta sortie longue passe de dimanche à samedi » |
| RQ-8  | 4 × 40 min courues, footings à 30 min ; footing jeudi. Puis 5 courses déjà prévues ; footing jeudi | refus G2. Refus RQ8 |
| RQ-9  | Footing aujourd'hui à 22:15 | refus RQ1 « Plus de créneau ce jour-là » ; alternative un jour suivant |
| RQ-10 | Cours jeudi 07:00 à 21:30 ; footing jeudi. Muscu jambes mercredi 17:00 à 18:30 ; seuil jeudi | refus H1 avec alternative. Seuil jeudi à 18:30 ou plus tard (H5) |
| RQ-11 | Remplacer un footing gelé | refus RQ2, sans alternative |
| RQ-12 | Programme commencé le 16 novembre (base) ; fractionné jeudi | refus RQ4 ; alternative : fartlek |
| RQ-13 | Sans objectif ; allure objectif jeudi | refus « Sans objectif, il n'y a pas d'allure de course à travailler » ; alternative : seuil |
| RQ-14 | Semi couru samedi 21, sans objectif ; seuil jeudi | refus MA6 ; alternative : footing |
| RQ-15 | Footing d'1 h mercredi ; footing dans 15 jours | le footing de mercredi passe à 60 min (même id). Refus RQ1 |

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
| Muscu (nom, `legs`, jour, heure, durée), révision, indispo : placés par Anna                                             | H1, H5, H6, S2 à S4, S11 |
| Travail (titre, jours, début, fin, répétition, `legs` pour « Travail physique ») : placé par Anna                        | H1, H6, S4               | travail sans `legs` : pas physique                                     | muscu sans `legs` explicite : pas jambes (décision du 17/11/2026 : seul l'interrupteur fait une séance jambes, un oubli du client ne doit pas bloquer ses séances dures) |
| Réglages : courses/sem, pas avant, pas après, jours sans course, coucher, trajet                                         | H2, H7, S1, P13          | défauts : 3 courses, 07:00, 21:30, aucun, 23:00, 0 min                 |
| Objectif : distance, date, chrono facultatif                                                                             | M2                       | M9                                                                     |
| Douleur ou blessure en cours (onboarding)                                                                                | P9, EV11 à EV12          | non                                                                    |
| « Ton dernier chrono » (distance, temps, il y a moins de 3 mois, 3 à 6 mois, plus, ou estimation), à l'onboarding et dans Programme                                                                                    | F10 (c)                  | test S2 à S4                                                           |

---

## 5. Conflits recherche / décisions (la décision s'applique)

| Recherche                                                                              | Décision appliquée                                                                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 01 R3 : test dans les 14 jours sans effort éligible                                    | historique Garmin d'abord (tours compris, F18), test en semaine 2 à 4 seulement en repli (F10)                                               |
| 01 R11, R12 et 03 étape 8 : allures modifiées automatiquement après les séances        | tout changement d'allure est proposé, accepté en un tap (M8)                                                            |
| 02 R23 : allures modifiées d'un point VDOT au plus par réévaluation                    | une course ou un test éligible propose le VDOT calculé entier (RC1) ; le point unique reste pour les séances (RC3)      |
| 03 étape 6 : N = 1 → décaler la séance à J+1                                           | un signal isolé ne fait rien ; la décision du matin ne déplace jamais, elle allège (D2, D9)                             |
| 03 §11.1 : seuils FC repos et sommeil en partie universels                             | seuils relatifs à sa norme (B1 à B4, SG1 à SG3) ; les valeurs de la recherche ne servent qu'avant 14 jours d'historique |
| 03 étape 3 : douleur 3 à 4 → footing -30 %, ≥ 5 → arrêt                                | 0 à 3 → footing très facile ou vélo ; ≥ 4 → pas de course, orientation au-delà de 3 jours (EV11, EV12)                  |
| 03 §9 : reprise après infection sous le cou ≥ 10 jours au total                        | pause jusqu'à « Ça va mieux », puis retour progressif sur une semaine (EV9)                                             |
| 03 §1.3 : sRPE inclut la muscu                                                         | muscu exclue de toute charge, la case jambes sert seulement au placement (G5)                                           |
| 03 étape 7 et 02 R15 : une séance clé ratée remplace une séance de priorité plus basse | une séance ratée n'est jamais rattrapée ni échangée (EV16)                                                              |
| 02 R21 : objectif irréaliste → proposer `P0 × (1 - g_max)` seulement dans ce cas       | décision : aucun chrono proposé, la cible vient d'Anna (P20)                                   |
| 04 §1.5 : classer la muscu par mots-clés du nom                                        | seule la case jambes compte (décision) ; sans case cochée ni décochée : pas jambes                                      |

---
- Seuil en fractions au-delà des 10 % du kilométrage hebdo (Daniels) : les `CRUISE` montent jusqu'à 40 min de travail (Pfitzinger : 22 + 18 min ; McMillan : 15 à 40 min), le `T` continu reste sous les 10 % de Daniels au-dessus de son plancher de 20 min (audit de pertinence du 21/11/2026).

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
| Q2  | Résolue le 17/11/2026 (#17) : les ancrages 60 et 11 min donnaient T trop rapide de 1 à 3 s/km et I, donc R, de 3 à 8 s/km (6 s/km à VDOT 40) ; remplacés par 0,88 et 0,975·VDOT, à ±3 s/km de la table 5.2 de VDOT 30 à 85. Le 19/11/2026, E devient la valeur unique de la 3e éd. (0,6965·VDOT, à 1 s/km de la table) ; la plage chiffrée de la 4e éd. n'a pas été vérifiée | F7 |
| Q3  | VO2max Garmin et chrono déclaré divergents pour Anna : lequel croire ?                                              | tranché le 18/11/2026 : le chrono récent (la VO2max d'une montre sous-estime une coureuse qui court surtout facile, Engel 2025), statut provisoire, test S2 à S4 (F10)                                                  |
| Q4  | Seuils personnels (2σ, 28 j, 14 valeurs, planchers d'écart-type) jamais validés pour une coureuse loisir            | valeurs de B1 à B4 et SG1 à SG3, journalisées pour calibrage                                                 |
| Q5  | Body Battery et stress : aucune validation indépendante                                                             | un seul signal combiné SG3, jamais seul                                                                      |
| Q6 | Taux d'amélioration `r` par profil (sert seulement à classer la cible) | P19 |
| Q7  | Délai jambes → séance dure chez une femme pratiquant la muscu (données Doma surtout masculines, intensité inconnue) | 24 h dur (H5) + 24 à 48 h souple (S2)                                                                        |
| Q8 | Maladie : décision du 16/11/2026, l'app conseille sans bloquer, E seulement | EV9 |
| Q9  | Source de température fiable pour les règles chaleur (le capteur poignet surestime)                                 | règles chaleur désactivées sauf température saisie ; course > 15 °C non utilisable pour une baisse si connue |
| Q10 | Plafond de la sortie longue à 3 ou 4 courses par semaine (Daniels suppose 6 à 7)                                    | 40 % / 38 % du volume (P14)                                                                                  |
