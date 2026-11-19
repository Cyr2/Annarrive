# Banc d'essai de l'algorithme d'entraînement

Rapport du 18/11/2026, sur `main` au commit `2ebdbfa`. Aucune règle du coach n'est modifiée ici : ce document mesure, il ne corrige pas.

## En bref

- **Note automatique : 8,5 / 10. Note du coach : 5,0 / 10.** La note automatique compte des vérifications réussies ; celle du coach juge les semaines qu'une coureuse recevrait vraiment. L'écart vient de quelques défauts graves dans des vérifications par ailleurs presque toutes vertes.
- **Le placement est du niveau d'une app premium, voire au-dessus.** Sur 52 semaines simulées, jamais deux jours durs de suite, jamais une séance dure moins de 24 h après la muscu jambes, jamais une séance rattrapée, au plus 3 changements automatiques par semaine, la course posée à sa date et à son heure. Garmin Run Coach ne sait pas déplacer une séance et Runna ne connaît pas l'emploi du temps : ici, les cours qui changent chaque semaine et les 3 séances de muscu passent sans casse.
- **La boucle fermée n'est pas encore au niveau de Runna.** Trois défauts critiques n'apparaissent qu'en simulant plusieurs semaines :
  1. **Recalibrage en cliquet.** Une fois qu'une hausse est acceptée, les mêmes séances la reproposent à chaque course : VDOT 36,6 → 92,1 en trois semaines pour la coureuse plus forte que prévu. Une fatigue fait l'inverse : 41 → 31.
  2. **La sortie longue sert de variable d'ajustement.** Quand la semaine dépasse le plafond, elle descend à 20 à 41 min en phase spécifique d'un semi, et les fractionnés restent intacts.
  3. **Le volume reste bloqué sous le plan.** Après une semaine de décharge, une maladie ou une séance sautée, le plafond se règle sur la seule semaine courue : 59 % du plan trois semaines après une grippe, alors que Runna et TrainAsONE ne pénalisent pas une séance manquée.

## 1. Le banc

### Ce qu'il fait

`packages/coach/eval/` rejoue, semaine après semaine, la boucle que l'app fait tourner pour de vrai. Tout passe par l'API publique de `@annarrive/coach`, câblée comme dans `apps/server/src/coach-adapter.ts` et `services/fitness.ts` :

1. **Dimanche 18:00** : `planWeek` construit la semaine à partir du réalisé (`history`), du VDOT courant et de l'agenda.
2. **Chaque matin** : signaux de la nuit (FC repos, sommeil, Body Battery, stress), puis `dailySignals` et `dailyDecision`, puis `changeOptions` (allègement) et `adaptForHealth` (maladie), et la séance est figée (D7).
3. **Événements** : `reportUnavailable` (fièvre), `feelBetter`, `skipSession`, `onTimetableChange` (un cours ajouté le jeudi, annoncé le mercredi).
4. **Séance** : un modèle de résultat scripté produit l'activité Garmin (un tour par étape, allure et FC selon le **vrai** niveau de la coureuse, ressenti). Puis `confirmDone`, `logFeel` et le recalibrage tel que le serveur l'appelle (`proposeMeasured` tant que le niveau est provisoire, sinon `evaluateRace` puis `evaluateKeySessions` sur les séances des 28 derniers jours, et `evaluateFeels`). La coureuse accepte chaque proposition d'un tap (`acceptProposal`).

Le banc est pur et déterministe : générateur pseudo-aléatoire à graine fixe, aucun réseau, aucune horloge. Il tourne en 4 s environ.

```sh
pnpm --filter @annarrive/coach eval            # notes, échecs, comparaison avec eval/baseline.json
pnpm --filter @annarrive/coach eval --weeks    # plus le détail de chaque semaine (matière de la revue du coach)
pnpm --filter @annarrive/coach eval --update   # réécrit la base de référence après une amélioration voulue
```

La CI lance `eval` après les tests : une note qui baisse sous `eval/baseline.json` fait échouer la CI. Une note qui monte passe ; il faut alors relancer `--update` pour la figer.

### Les personas

| Id | Qui | Semaines | Ce que le script lui fait vivre |
|---|---|---|---|
| `anna` | Anna, semi le 14/02/2027 en 1:50, VDOT réel 41 (mesuré par ses tours au seuil, F-23), 4 sorties, muscu lundi et vendredi soir (jambes) et mercredi midi, cours Unistra différents chaque semaine, vacances de Noël, partiels la première semaine de janvier, révisions le week-end en décembre | 13 (jusqu'à la course et la semaine d'après) | une nuit courte chaque mercredi (signal isolé), un cours ajouté le jeudi en semaines 2, 5 et 8 |
| `debutant-10k` | débutant, 10 km pour finir le 17/01/2027, 3 sorties, 70 min par semaine avant, VDOT réel 33, chrono déclaré 5 km en 32 min (provisoire) | 9 | aucun accident |
| `marathon` | marathonien, 3:15 visé le 18/04/2027, 5 sorties, 300 min par semaine avant, VDOT réel 48, semi déclaré en 1:33 | 6 | aucun accident |
| `malade` | Anna | 6 | fièvre le mardi de la semaine 2, « Ça va mieux » le samedi |
| `sauteuse` | Anna | 6 | saute une séance sur trois, une fois en le disant, une fois sans rien dire |
| `plus-forte` | Anna avec un vieux 10 km en 54 min (VDOT 36,6 provisoire), VDOT réel 41 | 6 | court ses tours au niveau réel, tout lui paraît « Facile » |
| `surmenage` | Anna | 6 | semaines 2 à 4 : nuits de 5 h 40, FC repos +6, tout lui paraît « Dur », 1,5 VDOT de moins |

### Ce que le banc ne prouve pas

- Le modèle de résultat est simple : la coureuse court la cible si elle le peut, sinon son allure réelle. FC par zone fixe (E 72 %, T 89 %, I 93,5 % de la FCmax). Une vraie FC dérive dans la séance ; les effets vus ici sur F18 (problème 5) y seraient plus forts, pas plus faibles.
- Un seul tirage par persona. Les défauts critiques sont structurels et ne dépendent pas du tirage.
- Le banc juge l'API du coach telle que le serveur l'appelle. Un écart avec le serveur est voulu et noté : il n'appelle pas `detectMissed` (le banc rattache la course du jour comme `services/garmin.ts`). Depuis les corrections du §6, le serveur et le banc passent tous deux `prev`, l'état de santé, les signaux du matin et les ressentis à `planWeek`.

## 2. Notes

### Note automatique (sur 10)

Chaque critère contrôle les semaines d'une règle publiée. Note = 10 × (1 − part pondérée des échecs), avec un poids de 3 pour un échec critique, 1 pour un majeur et 0,3 pour un mineur. Un seul échec critique plafonne le critère à 4 : un coach ne laisserait pas passer cette semaine, quel que soit le reste.

| Critère | Source des vérifications | anna | debutant-10k | marathon | malade | sauteuse | plus-forte | surmenage | Moyenne |
|---|---|---|---|---|---|---|---|---|---|
| Volume et progression | G1 Frandsen 2025 ; G2 Damsted 2019 ; P10 Pfitzinger | 9,7 | 10,0 | 9,8 | 9,1 | 9,7 | 9,7 | 9,7 | 9,7 |
| Intensité 80/20 | P16 Seiler 2010, Rosenblat 2025 ; P11 Daniels | 7,7 | 8,9 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 9,5 |
| Sortie longue | P14 Daniels, recherche 02 §4.3 ; Pfitzinger, Hansons ; S8 Runna | 4,0 | 9,3 | 9,8 | 4,0 | 4,0 | 9,4 | 9,9 | 7,2 |
| Dur / facile et muscu jambes | H4, S12 Seiler 2010 ; H5, H6 Doma 2013 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 |
| Allures et recalibrage | F7 Daniels ; RC3, RC4 Runna Pace Insights ; RC8 | 9,3 | 0,0 | 0,0 | 10,0 | 10,0 | 0,0 | 0,0 | 4,2 |
| Maladie et fatigue | D2 à D5 ; EV9 recherche 03 §9 ; Runna « Not Feeling 100% » | 9,4 | n/a | n/a | 3,3 | 10,0 | 10,0 | 4,0 | 7,3 |
| Séances sautées | EV7, EV16, EV21 ; Runna ; TrainAsONE | 10,0 | 10,0 | 10,0 | 8,8 | 6,9 | 10,0 | 10,0 | 9,4 |
| Affûtage et semaine de course | P18 Bosquet 2007 ; H12 ; P24 ; Pfitzinger | 5,0 | 7,5 | n/a | n/a | n/a | n/a | n/a | 6,3 |
| Stabilité | principe produit 3 ; S9 ; reproche Garmin Run Coach (recherche 05 §1.1) | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 9,7 | 10,0 |
| Structure de la semaine | P13, P15, catalogue M3 (Daniels) | 9,5 | 8,9 | 9,7 | 9,3 | 8,9 | 9,8 | 9,8 | 9,4 |
| **Note** | | **8,5** | **8,3** | **8,7** | **8,3** | **8,8** | **8,8** | **8,1** | **8,5** |

« n/a » : le critère ne s'applique pas (pas de course dans la fenêtre, pas d'événement de santé). La sortie de `eval` liste les 159 échecs un par un (68 critiques, 54 majeurs, 37 mineurs) ; ils sont regroupés en problèmes au §4.

### Note du coach (sur 10)

Lecture des semaines de chaque persona par un entraîneur, sur cinq axes : la **semaine type** (contenu et équilibre), la **charge** (progression et décharges), la **spécificité** (préparation de l'objectif), l'**adaptation** au réel et la **sécurité** (risque de blessure ou de surmenage).

| Persona | Semaine type | Charge | Spécificité | Adaptation | Sécurité | Note |
|---|---|---|---|---|---|---|
| anna | 7 | 4 | 3 | 6 | 6 | **5,2** |
| debutant-10k | 6 | 7 | 5 | 3 | 5 | **5,2** |
| marathon | 6 | 7 | 5 | 4 | 8 | **6,0** |
| malade | 6 | 3 | 3 | 5 | 5 | **4,4** |
| sauteuse | 6 | 3 | 3 | 5 | 7 | **4,8** |
| plus-forte | 7 | 6 | 6 | 1 | 2 | **4,4** |
| surmenage | 7 | 6 | 6 | 2 | 4 | **5,0** |
| **Moyenne** | **6,4** | **5,1** | **4,4** | **3,7** | **5,3** | **5,0** |

### Revue du coach, persona par persona

**Anna (semi en 1:50).** La base est propre : côtes courtes, footings, sortie longue qui monte de 63 à 69 min, fartlek pour finir la phase. Le développement alterne I et T, la phase spécifique ajoute l'allure semi. La muscu jambes est toujours respectée. Ce qui ne va pas :
- semaine 5, juste après la décharge, la semaine ne revient pas au plan (163 min pour 199) ;
- semaines 8 à 10, en pleine préparation spécifique, la sortie longue fait 26, 31 et 41 min, pendant que la séance à allure semi fait 70 à 76 min. Pour un semi en 1:50, on attend une sortie longue de 75 à 100 min à ce moment (Pfitzinger, Hansons) ;
- en semaine de partiels, chaque séance de qualité devient un footing le matin même, parce qu'un examen à J ou J+1 confirme le signal tout seul deux jours de suite ;
- la semaine de course garde un seuil le lundi et 2 × 4 km à allure semi le mercredi, soit 125 min hors course pour 100 visées.

*Un coach changerait* : la sortie longue protégée en priorité, le retour au plan après la décharge, une semaine de partiels allégée dès le dimanche plutôt que séance par séance, une seule séance courte à allure semi en semaine de course.

**Débutant 10 km.** Volume bas et prudent (78 à 99 min), ce qui convient. En revanche :
- aucune séance test n'est placée alors que son niveau est provisoire (F10 l'annonce en semaine 2 à 4) ;
- la première séance de fractionné, en semaine 5, est lue comme un effort maximal et fait baisser son VDOT de 28,5 à 26,6, alors que son vrai niveau est 33 ;
- RC3 remonte ensuite d'un point à chaque séance, six fois en deux semaines ;
- la semaine de course garde un fractionné I à J-6 et 66 min hors course pour 43 visées.

*Un coach changerait* : un test de 5 km en semaine 2 ou 3, aucune séance I la semaine de course pour un objectif « finir », une seule correction d'allure à la fois.

**Marathonien.** Cinq sorties bien réparties, une sortie longue de 108 min, cohérente pour la base. À revoir :
- la semaine 5 retombe à 297 min après la décharge (361 au plan) ;
- les footings dépassent le catalogue (E de 94 min, E avec côtes de 84 min) au lieu d'une sortie moyenne à la Pfitzinger ;
- sa première séance I est lue par F18 comme un effort au seuil (moyenne des répétitions et des récupérations) et propose 50,8 pour un niveau réel de 48 : ses allures deviennent trop rapides.

*Un coach changerait* : une sortie moyenne-longue en semaine plutôt qu'un footing de 94 min, une lecture du niveau sur un vrai effort continu.

**Malade.** La fièvre est bien gérée : rien n'est imposé, aucune séance de qualité pendant 10 jours. Mais :
- deux jours après « Ça va mieux », la sortie longue reste à 69 min, seulement passée en footing ;
- les semaines suivantes restent collées au réalisé de la semaine malade, et la remontée est lue comme « 3 semaines de hausse » (G4), qui coupe encore 25 % ;
- trois semaines après, elle a 117 min pour 199 au plan et une sortie longue de 20 min.

*Un coach changerait* : des footings courts sur 3 jours, puis le retour au plan en une à deux semaines (recherche 03 §9, Runna « Not Feeling 100% »).

**Sauteuse.** Aucune séance n'est jamais rattrapée (bien). Mais chaque séance sautée fait baisser la semaine suivante : de 199 min au plan on tombe à 105 à 120 min, avec une sortie longue de 20 min. Le principe « les séances manquées sont des données, pas des dettes » (TrainAsONE) vaut aussi dans l'autre sens : ce ne sont pas des punitions.

*Un coach changerait* : reprendre le plan tel quel la semaine suivante, en ne surveillant que la plus longue séance (G1).

**Plus forte que son estimation.** Trois semaines de base à des allures trop lentes de 4,5 VDOT, sans rien qui le détecte (pas de test, RC3 coupé tant que le niveau est provisoire, sorties faciles rapides ignorées). À la première séance au seuil, la correction est juste (40,8). Puis le cliquet de RC3 l'emporte à 92 en dix jours : des allures I autour de 2:50 /km, impossibles, et dangereuses si elle essaie de les tenir.

*Un coach changerait* : un test tôt, une correction quand elle est prouvée, puis plus rien pendant 3 à 4 semaines (Daniels).

**Surmenage.** Le matin réagit bien : la séance est raccourcie ou passe en footing quand deux signaux se confirment. Mais :
- la construction du dimanche ignore la fatigue : le volume suit le plan, et le cycle 2:1 prévu en cas de fatigue (P9) n'est jamais déclenché ;
- RC5 prend la fatigue pour une perte de forme et abaisse son VDOT d'un point à chaque footing « Dur » : 41 → 31 en trois semaines ;
- une fois reposée, le cliquet de RC3 la remonte d'un point par séance.

*Un coach changerait* : alléger la semaine suivante quand la fatigue est confirmée, et ne toucher aux allures qu'une fois la fatigue écartée.

## 3. Ce qui fonctionne

| Point | Preuve dans le banc | Référence |
|---|---|---|
| Jamais deux jours durs de suite, jamais une dure à moins de 24 h de la muscu jambes, course avant la muscu le même jour | 0 échec sur 52 semaines, avec des cours différents chaque semaine | H4, H5, H6 ; Seiler 2010 ; Doma 2013 |
| Une séance sautée ou manquée n'est jamais rattrapée, aucune séance ajoutée | 0 échec | EV16, EV21 ; Runna, TrainAsONE |
| Un signal isolé ne change rien (nuit courte du mercredi) | 0 échec | D2 ; décision produit |
| Stabilité : au plus 3 changements automatiques par semaine, sortie longue le même jour d'une semaine à l'autre | 1 seul échec mineur | principe produit 3 ; reproche Garmin Run Coach |
| Cours ajouté au dernier moment : la course concernée est déplacée le jour même, sans casser de règle | semaines 2, 5 et 8 d'Anna | EV15 |
| Course le bon jour à la bonne heure, rien de dur à J-3, semaine d'après en footings | 0 échec | P24, H12, P23 |

## 4. Problèmes, classés

Chaque problème donne la persona et la semaine où le banc le montre, la règle de `docs/specs/algo.md` en cause, le changement proposé avec sa source, et la gravité.

### Les 10 premiers

| # | Problème | Où (persona · semaine) | Règle en cause | Changement proposé | Source | Gravité |
|---|---|---|---|---|---|---|
| 1 | **Cliquet de RC3.** Les séances des 28 derniers jours sont relues après chaque acceptation, contre leurs anciennes cibles : le rapport > 1 reste, et `impliedVdot` le multiplie par le nouveau VDOT. Une proposition par séance, chacune plus haute | plus-forte S4 à S6 (36,6 → 92,1, 13 propositions) ; debutant-10k S6 et S7 (6 × +1) ; surmenage S6 (4 × +1) | RC3, RC8 ; `services/fitness.ts` (fenêtre de 28 j) | Ne compter que les séances courues **après** `vdotChangedOn` ; calculer le VDOT prouvé à partir de la cible de la séance, pas du VDOT courant ; au plus une proposition par sens tous les 14 j, acceptée ou refusée (RC8 étendu) | Runna Pace Insights (« un schéma constant », une proposition, recherche 05 §1.3) ; Daniels (garder un VDOT 3 à 4 semaines) | Critique |
| 2 | **Cliquet de RC5, la fatigue lue comme une perte de forme.** Dès 3 « Dur » de suite, chaque nouveau footing « Dur » repropose -1 | surmenage S2 à S4 (41 → 31, 10 propositions) | RC5 | Ne compter que les ressentis postérieurs au dernier changement ; quand SG1 ou SG2 sont confirmés les mêmes jours, proposer du repos ou une semaine allégée, pas -1 ; au plus -1 par 14 j | Foster 2001 ; recherche 03 §6 et §11 (le ressenti mêle fatigue et forme) ; Daniels (ne pas baisser le VDOT sur une fatigue passagère) | Critique |
| 3 | **La sortie longue est raccourcie avant les séances de qualité.** `trimTo` (G2, G3, G4) ne réduit que les courses continues : les E s'arrêtent à 20 min, puis la L paie tout | anna S8 à S10 (L de 26, 31, 41 min en phase spécifique, SPE de 70 à 76 min) ; malade S3, S6 (L 20) ; sauteuse S4 à S6 (L 20) ; anna S4 (L 39 < E 45) | G2, G3, G4 (`guards.ts trimTo`) ; P14 | Ordre de réduction : E et RECUP, puis fractions des Q (P17 à rebours), et la L en dernier, jamais sous 0,9 × la L de la semaine précédente ni sous sa valeur P14 | Recherche 02 §4.2 (la L est la séance à garder en premier pour semi et marathon) ; Daniels ; Pfitzinger, Hansons (sortie longue pilier de la préparation) | Critique |
| 4 | **Le plafond de la semaine se règle sur la seule semaine courue.** Une décharge prévue (P9), une maladie ou une séance sautée bloquent les semaines suivantes ; une remontée après une coupure est lue comme 3 semaines de hausse (G4, -25 %) | anna S5 (163 / 199), S9 (161 / 199) ; marathon S5 (297 / 361) ; plus-forte et surmenage S5 ; malade S4 à S6 (117 / 199) ; sauteuse S2 à S6 (105 à 120 / 199) | G2, G4 ; conflit avec P9 et P10 ; P22 jamais branché | G2 contre la charge chronique (la meilleure ou la moyenne des 3 à 4 dernières semaines courues), pas la dernière ; G4 seulement au-dessus du pic d'avant ; une décharge prévue ne compte pas comme référence | Frandsen 2025 (aucun lien entre rapport semaine/semaine et blessure ; seul le pic d'une séance compte, G1) ; Pfitzinger, Daniels (après une décharge on reprend la charge d'avant) ; TrainAsONE et Runna (une séance manquée ne change pas la suite) | Majeure |
| 5 | **F18 lit un fractionné comme un effort maximal ou au seuil.** Une répétition de 3 à 4 min à 92 % de la FCmax donne une lecture `race` (sous-estimée) ; une fenêtre répétitions + récupérations dont la FC moyenne tombe entre 88 et 92 % donne une lecture `threshold` (surestimée) | debutant-10k S5 (F10 propose 28,5 → 26,6, niveau réel 33) ; marathon S6 (49,1 → 50,8, niveau réel 48) | F18, F10 (`proposeMeasured`) | Ne lire F18 que sur les séances continues, les étapes T, TEST et RACE ; exiger une allure régulière (écart < 3 % entre tours) et aucun tour au-dessus de 92 % dans une lecture `threshold` | Daniels (T = effort continu de 20 à 60 min) ; recherche 01 §4.2 (un effort non maximal ne prouve qu'un plancher) | Critique |
| 6 | **Affûtage au-dessus de P18.** Les Q gardent leur taille (minimum 2 fractions), les E remplissent le reste | anna S11 (166 / 139 min), S12 (125 min hors course pour 100, seuil lundi et 2 × 4 km à allure semi mercredi) ; debutant-10k S8 (66 / 43 min, I à J-6) | P18, P11 | Semaine de course : une seule Q, courte (15 à 20 min à allure de course ou 3 à 4 × 1 km) ; les Q comptées dans la part P18 avant les E ; S-2 avec 2 Q raccourcies | Bosquet 2007 (volume -41 à -60 %, intensité gardée) ; Pfitzinger (semaine de course : une séance courte à allure) | Majeure |
| 7 | **80/20 non tenu en phase spécifique.** `enforceDistribution` n'enlève que des fractions : un T ou un SPE continu n'est jamais réduit, et les E raccourcis par G2 font chuter la part facile | anna S7 à S12 (part facile 53 à 68 %) ; debutant-10k S4, S7 | P16 (`guards.ts enforceDistribution`) | Appliquer P16 après G2 et réduire aussi les blocs continus (T, SPE) ; viser au moins 75 % de temps facile hors course | Seiler 2010 ; Rosenblat 2025 ; recherche 02 §2.2 | Majeure |
| 8 | **Retour de maladie trop brutal.** Après « Ça va mieux », EV9 garde la durée et ne fait que passer en E ; la construction du dimanche ignore l'état de santé | malade S2 (L de 69 min courue en E, 2 j après la fièvre), S3 (42 min le 3e jour) | EV9 ; `planWeek` sans `health` | Jours 1 à 3 : E à 50 % de la durée, puis 75 % ; la semaine construite pendant `recovering` suit G7 (85 %, pas de Q avant J+3) | Recherche 03 §9 (retour progressif) ; Runna « Not Feeling 100% » (allègement sur 3 à 14 j, recherche 05 §1.3) | Majeure |
| 9 | **RC3 propose +1 sur des séances simplement réussies.** Le seuil « ≥ 100 % de l'allure cible » est atteint par le bruit d'une coureuse qui court juste sa cible, et la hausse minimale est d'un point | anna S4 (41 → 42, tours à la cible à ±1 %) | RC3 | Exiger au moins 102 % en moyenne sur 2 séances et un appui (FC sous la prédiction ou ressenti « Facile ») ; hausse du VDOT prouvé, sans minimum d'un point | Runna Pace Insights (un écart constant) ; Daniels (monter quand les séances deviennent faciles à la même allure) | Majeure |
| 10 | **Niveau provisoire : ni test, ni correction avant le premier fractionné.** F10 annonce un test en semaine 2 à 4, mais aucun gabarit ne contient de TEST ; RC3 est coupé tant que le niveau est provisoire | plus-forte S1 à S3 (allures de 36,6 pour un niveau de 41) ; debutant-10k S1 à S4 (28,5 pour 33) ; marathon S1 à S5 | F10, P12, P13 | Placer un TEST (5 km ou 30 min) en semaine 2 ou 3 quand le niveau est provisoire, à la place de la séance de côtes ; il donne VDOT et LTHR | Garmin, plans experts (« benchmark runs », recherche 05 §1.1) ; Friel 2016 ; Daniels | Majeure |

### Les autres

| # | Problème | Où | Règle | Changement proposé | Source | Gravité |
|---|---|---|---|---|---|---|
| 11 | Un examen seul (SG5) se confirme lui-même deux jours de suite, et chaque Q de la semaine de partiels devient un footing le matin | anna S7 (T du lundi, SPE du jeudi) | D2, SG5 | SG5 compte seulement avec un autre signal ; une semaine d'examens connue dans l'ICS est construite allégée dès le dimanche | Recherche 03 §5.2 (stress académique) ; décision produit « une seule décision par jour, pas de suradaptation » | Mineure |
| 12 | Footings hors du catalogue : E de 94 min, E avec côtes de 84 min, E de 20 min | marathon S5, S6 ; anna S5, S8 à S10 ; débutant S1 à S7 | P15, catalogue E (30 à 75 min) | Plafonner E à 75 min et reporter le reste sur une sortie moyenne ; E sous 30 min seulement si la semaine est sous 100 min | Daniels ; Pfitzinger (sortie moyenne-longue en semaine) | Mineure |
| 13 | Part de la sortie longue au-dessus de P14 après réduction des E | anna S5, S6 (39 %) ; marathon S5, S6 ; sauteuse S2 | P14 | Conséquence du 3 et du 4 ; à revérifier après eux | Recherche 02 §4.3 | Mineure |
| 14 | Règles écrites mais jamais appelées par `planWeek` ni par le serveur : P22 (`replanFromActual`), P9 sur fatigue (`fatigueDaysLastWeek`), P2 (`sickWeeks`), RC6 et RC7 (`evaluateTrends`), RC10 (`evaluateGoal`), S9 (`prev` non passé), B1 (jours de maladie non exclus : `sick: []` dans l'adaptateur) | toutes | P2, P9, P22, RC6, RC7, RC10, S9, B1 | Les brancher, ou les retirer de la spec. P9 sur fatigue répondrait en partie au persona `surmenage` | algo.md lui-même | Majeure (P9, P22), mineure (les autres) |
| 15 | `detectMissed` (EV16) rattache une course à une séance de J-1 à J+1 : une course faite la veille du début du programme a « pris » la séance du lundi dans une première version du banc. Sans effet aujourd'hui (le serveur ne l'appelle pas) | première version du banc, toutes les personas | EV16 | Ne rattacher que des courses postérieures à la construction de la semaine (ou à `planStart`) | décision produit | Mineure |

## 5. Comparaison avec Runna et Garmin

| Sujet | Runna | Garmin Run Coach / plans experts | Annarrivé aujourd'hui |
|---|---|---|---|
| Placement autour d'un agenda qui change | jours choisis, pas d'agenda | Run Coach : impossible de déplacer une séance | **meilleur** : cours, muscu jambes, examens, coucher, tout est respecté sans casse |
| Stabilité de la séance du jour | stable | reproche principal : la séance change dans la journée | **meilleur** : une décision le matin, puis figée |
| Séance manquée | sautée, jamais rattrapée, la suite ne change pas | non documenté | jamais rattrapée, **mais la suite est réduite** (problème 4) |
| Recalibrage des allures | un schéma constant, une proposition acceptée ou refusée | « benchmark runs » périodiques | **moins bon** : cliquets (problèmes 1, 2, 9), lecture des fractionnés (5), pas de test (10) |
| Fatigue et maladie | « Not Feeling 100% » sur 3 à 14 j | readiness et sommeil | matin juste et prudent, **mais** la semaine suivante l'ignore (8, 14) |
| Structure de préparation | plans écrits par des coachs | plans d'auteurs (McMillan, Galloway) | bonne en base et en développement, **fragile** en spécifique et en affûtage (3, 6, 7) |

Avec les problèmes 1 à 5 corrigés, le banc donnerait une préparation comparable à celle d'une app premium, avec un placement qu'aucune des deux ne propose. C'est l'ordre de travail recommandé : 1 et 2 (allures), puis 3 et 4 (charge), puis 5.

## 6. Après les corrections de la boucle (18/11/2026)

Les problèmes 1 à 10, 12 et 14 sont corrigés à la racine (règles dans `docs/specs/algo.md`, avec leurs sources et leurs tests). **Note automatique : 8,5 → 9,7 / 10 ; échecs : 159 → 28 (critiques 68 → 2).**

| Critère | anna | debutant-10k | marathon | malade | sauteuse | plus-forte | surmenage | Moyenne |
|---|---|---|---|---|---|---|---|---|
| Volume et progression | 10,0 | 10,0 | 10,0 | 9,7 | 9,7 | 10,0 | 9,7 | 9,9 |
| Intensité 80/20 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 |
| Sortie longue | 9,8 | 10,0 | 9,6 | 10,0 | 9,5 | 10,0 | 10,0 | 9,8 |
| Dur / facile et muscu jambes | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 |
| Allures et recalibrage | 10,0 | 4,0 | 8,8 | 10,0 | 10,0 | 4,0 | 10,0 | 8,1 |
| Maladie et fatigue | 9,4 | n/a | n/a | 10,0 | 10,0 | 10,0 | 10,0 | 9,9 |
| Séances sautées | 10,0 | 10,0 | 10,0 | 8,8 | 8,8 | 10,0 | 10,0 | 9,7 |
| Affûtage et semaine de course | 10,0 | 7,5 | n/a | n/a | n/a | n/a | n/a | 8,8 |
| Stabilité | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 |
| Structure de la semaine | 9,7 | 9,2 | 10,0 | 10,0 | 10,0 | 10,0 | 10,0 | 9,8 |
| **Note** | **9,9** | **9,0** | **9,8** | **9,8** | **9,8** | **9,3** | **10,0** | **9,7** |

Ce qui reste :

- **Semaine 1 d'un niveau provisoire** (débutant, plus-forte : les 2 critiques). Le test arrive en semaine 2 (F10, recherche 02 §7.2) et règle le niveau dès qu'il est couru : 28,5 → 33,3 pour un niveau réel de 33, 36,6 → 41,0 pour 41. Le critère reste plafonné à 4 par la semaine 1.
- **Sortie longue du marathonien à 32 % du volume** (mineur) : les E sont plafonnés à 75 min (catalogue) et le catalogue n'a pas de sortie moyenne-longue ; les minutes au-delà ne sont pas courues. C'est le seul critère qui baisse (9,8 → 9,6), pendant que sa structure passe de 9,7 à 10.
- **Semaine de retour après la fièvre** (malade S3, 85 % du plan, G7) et **séances sautées une sur trois** (sauteuse) : la semaine reste sous 85 % du plan parce que la charge chronique réelle l'est. Ce sont les règles voulues (recherche 03 §8.3 et §9.1 ; G2).
- Le problème 11 (un examen seul confirmé par sa répétition) et le 15 (`detectMissed`) restent ouverts.

Deux changements du banc lui-même, notés ici : le contrôle G2 lit la charge chronique sur les 3 semaines courues avant, celles d'avant le programme comprises (il ne lisait que les semaines du banc) ; la coureuse court un `TEST` à fond (F2 à son niveau, FC 94 %) et chaque course porte le type de la séance prévue, comme le serveur les envoie.

## 7. Ce qu'elle court vraiment, et la trajectoire vers l'objectif (19/11/2026)

Deux questions d'Anna : « Si mon footing devient un tempo, l'app adapte la suite ? » et « Le programme mène-t-il vraiment à mon objectif ? ». Le banc ne savait répondre à aucune des deux : la coureuse suivait toujours le plan et ne progressait jamais.

### Ce que le banc ajoute

- **Elle progresse avec ce qu'elle court** (`sim.ts`, `progress`) : chaque semaine, son temps prédit sur l'objectif baisse de 0,4 % × la part du volume du plan courue (plafonnée à 1 : courir plus ne fait pas progresser plus), moitié moins en semaine de développement ou spécifique sans séance de qualité, rien en semaine de fièvre ou de surmenage, 7 % au plus (P19). Taux : recherche 02 §7.1 (Muñoz 2014, +3,6 à 5 % sur 10 km en 10 semaines chez le coureur loisir). C'est une hypothèse : aucune étude ne valide un taux par semaine et par niveau. Le critère « Allures » juge désormais l'app contre ce niveau de la semaine, pas celui du départ. La course se court à fond.
- **Quatre coureuses qui ne suivent pas le plan** (6 semaines chacune) : `trop-vite` (footings et sorties longues à l'allure marathon, l'erreur la plus courante), `en-plus` (une course de 40 min en plus chaque semaine), `tempo` (chaque semaine, le footing qui précède une séance dure de moins de 48 h devient 15 min E, 20 min au seuil, le reste E), `longue-coupee` (sorties longues arrêtées aux deux tiers).
- **Critère « Trajectoire vers l'objectif »** : le niveau est réévalué au moins toutes les 4 semaines (recherche 02 R23) ; une semaine de développement ou spécifique suivie porte une séance de qualité (P11, sans stimulus pas de progression : plan trop facile) ; une semaine de décharge n'est pas au-dessus de son volume (P9 : plan trop agressif) ; chaque allure de séance vient du niveau de la semaine (F7) et l'allure de course de la cible seulement si elle est au plus ambitieuse (P21).
- **Critère « Adaptation au réalisé »** : jamais une séance dure prévue courue le lendemain d'une course rapide non prévue (AD3) ; aucune séance ne s'allonge dans la semaine (AD5, EV16) ; une semaine avec une course en plus reste sous 1,10 × la charge chronique (AD4, G2, mineur).
- `--weeks` affiche le temps prédit par l'app et le vrai, chaque semaine, et ce qui a été adapté.

### Avant, après

Le même banc (11 personas, 12 critères) sur `main` puis sur cette branche :

| Critère | Avant | Après |
|---|---|---|
| Allures et recalibrage | 8,5 (anna 6,7) | 8,8 (anna 10,0) |
| Trajectoire vers l'objectif | 8,7 | 10,0 |
| Adaptation au réalisé | 9,9 (tempo 8,9) | 10,0 (en-plus 9,9) |
| Sortie longue | 9,9 (anna 9,8) | 9,9 (anna 10,0) |
| **Note** | **9,7** | **9,8** |

Aucun critère ne baisse ; `eval/baseline.json` est mis à jour.

### Ce que le banc a trouvé, et ce qui change

1. **Le niveau ne suivait pas la progression.** Sans course ni test, Anna restait à 41,0 de la semaine 1 à la course, alors que son niveau montait à 43,2 : des allures trop lentes pour la faire progresser. RC3 ne voit la hausse que si elle court ses fractions plus vite que la cible, et une coureuse sage court la cible. **P26** : un niveau qui a 4 semaines est mesuré par un test à la place de la première séance de qualité (recherche 02 R23). Anna est maintenant à moins d'un point de son niveau chaque semaine.
2. **Une semaine de décharge à 184 min pour 149 au plan** (Anna, semaine 8, problème déjà visible en §6 : la sortie longue plus courte que la séance spécifique). Le bloc à allure semi est dimensionné sur la distance, pas sur la semaine. **P9** : le volume d'une décharge est un plafond, Q comprises, comme celui de l'affûtage.
3. **Un tempo à la place d'un footing laissait la séance dure du lendemain en place** : deux jours durs de suite trois semaines sur trois. **AD3** : la séance dure qui suit dans les 48 h va au meilleur créneau à partir du surlendemain, sinon passe en footing.
4. **Une course en plus n'entrait dans la semaine qu'au dimanche suivant.** **AD4** : les footings à venir raccourcissent jusqu'à leur plancher. Il reste un échec mineur (`en-plus` S1, 214 min pour 183) : les deux footings restants ne suffisent pas et la sortie longue est gardée (recherche 02 §4.2).
5. **Un tempo choisi et noté « Dur » comptait comme une fatigue** (SG4 le lendemain, RC5). Le ressenti garde le RPE réellement couru (AD6).
6. **Trop facile, plusieurs fois** : trois footings notés « Facile » et courus 3 % plus vite que la cible proposent un test (**RC13**). `plus-forte` le reçoit dès la fin de la semaine 1.

Ce que le banc ne juge pas : le modèle de progression est le même pour toutes et ne pénalise ni les footings trop rapides (`trop-vite` progresse comme Anna), ni la fatigue d'un tempo de plus ; un modèle de charge et de fatigue (Banister) serait instable sur une seule coureuse (recherche 03 §2.1, Hellard 2006). Une sortie longue coupée n'est jamais rattrapée : la suivante reste sous 1,10 × la plus longue des 30 jours (G1), le contrôle de longueur minimale l'excuse dans ce cas.

## 8. Fichiers

- `packages/coach/eval/personas.ts` : personas, scripts, emplois du temps.
- `packages/coach/eval/sim.ts` : la boucle fermée et le modèle de résultat.
- `packages/coach/eval/checks.ts` : les dix critères, leurs sources, la note.
- `packages/coach/eval/run.ts` : sortie, comparaison avec la base et code de sortie.
- `packages/coach/eval/baseline.json` : les notes de référence, par persona et par critère.
