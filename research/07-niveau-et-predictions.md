# 07 : Ton niveau, VO2max, seuil et prédictions de course

Recherche du 21/11/2026, pour le bloc « Ton niveau » de Programme. Confiance : **É** = élevée (étude primaire, manuel officiel), **M** = moyenne (étude unique ou petite, résumé d'abstract, presse spécialisée), **F** = faible (blog, forum, calculateur commercial). Niveaux de preuve repris de `docs/specs/algo.md` (CONS, OBS, ECR, OP). Complète `01-forme-et-allures.md` (§1.1 VDOT, §1.2 Riegel, §3 LTHR) sans le répéter.

Profil de référence : Anna, semi en 1:51 (VDOT ≈ 40), VO2max Garmin 45, FCmax observée 192, FC repos ≈ 55, vivoactive 4 au poignet, sans ceinture.

---

## 1. Ce que la vivoactive 4 et le bridge donnent

| Donnée | vivoactive 4 | Bridge (`apps/garmin-bridge`) | Confiance |
| --- | --- | --- | --- |
| VO2max (course) | oui, après une course avec FC poignet | oui : `vo2_max` des signaux du jour (`maxmet`) | É ([manuel VA4, liste des sujets](https://www8.garmin.com/manuals/webhelp/vivoactive4_4S/EN-US/suitehelp_topic_list.html)) |
| Seuil lactique (allure, FC) | **non** : aucun sujet « Lactate Threshold » dans le manuel | non lu, et rien à lire | É (même source) |
| Prédicteur de course | **non** : aucun sujet « Race Predictor » ; absent des vivoactive, Venu et Lily | non lu | É (manuel) ; M ([forum Garmin VA4](https://forums.garmin.com/sports-fitness/healthandwellness/f/vivoactive-4-series/369186/can-t-get-race-predictor), [gadgetsandwearables](https://gadgetsandwearables.com/?p=13064649)) |
| Tours : durée, distance, vitesse, FC moyenne | oui | oui : `activity_laps` | É (code) |
| FC max et moyenne de la sortie | oui | oui | É (code) |
| FC repos du jour | oui | oui : `resting_hr` | É (code) |

Le seuil Garmin exige de toute façon une ceinture cardio : « Lactate threshold requires a chest heart rate monitor », guidé ou en détection automatique ([manuel Forerunner 265, É](https://www8.garmin.com/manuals-apac/webhelp/forerunner265series/EN-SG/GUID-59A0003C-5F3B-4769-A85A-DBB8C95D955C-4091.html) ; [test guidé, fēnix 6, É](https://www8.garmin.com/manuals/webhelp/fenix66s6xpro/EN-US/GUID-1B0C9B93-01CD-4A0C-A30F-B815C0347159.html)). Même avec une montre plus récente, Anna n'aurait donc pas de seuil Garmin sans ceinture.

**Conséquence** : la VO2max est le seul chiffre « Garmin » du bloc. Le seuil et les quatre chronos sont calculés par l'app, et le bloc doit le dire.

---

## 2. Prédire un chrono

### 2.1 Les méthodes

| Méthode | Entrées | Ce qu'on sait de l'erreur | Confiance |
| --- | --- | --- | --- |
| **Daniels VDOT** (F1 à F5, tables 5.1) | un chrono récent | Marathon prédit depuis le semi, 7 663 coureurs de Valence : erreur absolue moyenne 7,9 % au total, **3,9 % pour la catégorie sub-3:30, 6,0 % sub-4:00, 7,6 % sub-4:30**, qui croît avec la lenteur ([Oficial-Casado 2026, Front Physiol, M/É](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2025.1718298/full)). Aucune étude trouvée sur l'erreur du VDOT entre 5 km, 10 km et semi chez des coureuses loisir. | OBS |
| **Riegel** `T2 = T1·(D2/D1)^k`, k = 1,06 | un chrono | Bien calibré jusqu'au semi chez 2 303 coureurs loisir (39 % de femmes), p = 0,9 au 10 km, 0,3 au semi. Au marathon : résidu médian **−10:09** (trop rapide), un quart des coureurs à plus de 20 min ; k = 1,08 améliore « légèrement » ([Vickers & Vertosick 2016, BMC Sports Sci Med Rehabil, É](https://pmc.ncbi.nlm.nih.gov/articles/PMC5000509/)). | OBS |
| **Riegel, exposant des femmes et des lents** | | Le 1,08 « des femmes » attribué à Riegel n'a pas de source primaire ([blog G. Ron, F](https://www.georgeron.com/2017/09/the-fatigue-factor-for-running-womens.html)). Une analyse de 1 071 coureurs du Guardian trouve plus souvent 1,15 que 1,06 du semi au marathon ([inkl/Guardian, F](https://www.inkl.com/news/the-formula-for-marathon-success)). Chez Vickers, l'écart femmes-hommes passe de 24 % au 5 km à 14 % au marathon (ajusté IMC) : l'exposant d'une femme n'est pas plus grand que celui d'un homme. | F |
| **Vickers & Vertosick, modèles 1 et 2** | 1 ou 2 chronos + km par semaine | Marathon : erreur quadratique 228 (1 chrono) et 208 (2 chronos) contre 381 pour Riegel ; résidu médian −1:47 et +0:23. Le volume pèse plus chez les femmes : passer de 30 à 50 miles par semaine change le marathon de 31:41 (femmes) contre 25:32 (hommes). Coefficients dans le fichier additionnel 1, non ouvert ici. | OBS |
| **Cameron** | un chrono | Régression non linéaire sur les meilleurs temps mondiaux (fin des années 1990). Aucune publication primaire ni validation sur des coureurs loisir trouvée ([CalcPace, F](https://calcpace-ccab5cc04603.herokuapp.com/guides/cameron-predictor)). | non vérifié |
| **Garmin / Firstbeat** | VO2max de la montre + historique | « The watch uses the VO2 max. estimate and your training history », et il lui faut quelques sorties ([manuel FR265, É](https://www8.garmin.com/manuals-apac/webhelp/forerunner265series/EN-SG/GUID-59A0003C-5F3B-4769-A85A-DBB8C95D955C-4091.html)). Formule non publiée, aucune validation indépendante. Les utilisateurs le trouvent optimiste ([TechRadar, M](https://techradar.com/health-fitness/im-running-the-london-marathon-and-i-wanted-to-know-how-accurate-garmins-race-predictor-tool-really-is-so-i-grilled-garmin) ; [the5krunner, F](https://the5krunner.com/garmin-features/performance/race-predictor/)). Absent de la vivoactive 4. | F |

Une revue systématique conclut qu'aucune équation ne vaut pour tous les coureurs, et que l'erreur est plus grande chez les coureurs loisir ([revue des équations marathon, Insight Centre, M](https://www.insight-centre.org/wp-content/uploads/2020/05/Prediction-equations-for-marathon-performance-A-systematic-review-.pdf)).

### 2.2 Ce qu'il faut prendre, avec ce que l'app a

- **5 km, 10 km, semi : Daniels (F5) depuis le niveau courant (F10, F18).** C'est déjà le moteur des allures : les chronos affichés et les allures viennent du même chiffre, ce qui les rend cohérents entre eux. Riegel donnerait presque la même chose jusqu'au semi (Vickers) et n'apporte rien. **Ne jamais partir de la VO2max Garmin** : 5 à 10 % d'erreur sur la VO2max ([Molina-Garcia 2022, méta-analyse, É](https://pmc.ncbi.nlm.nih.gov/articles/PMC9213394/) ; [revue 2025, M](https://pmc.ncbi.nlm.nih.gov/articles/PMC12748164/)), et l'économie de course varie d'une coureuse à l'autre : à VO2max égale, deux coureuses n'ont pas le même chrono.
- **Marathon : le plus lent de Daniels et de Riegel k = 1,07 (F6), affiché comme un plancher.** Même ce plancher reste trop rapide de 10 min pour une coureuse sur deux (Vickers). Le modèle de Vickers serait meilleur, mais ses coefficients ne sont pas lus ; les intégrer est une étape à part (à vérifier dans le fichier additionnel).
- **La distance de l'objectif** reçoit le même calcul que les autres ; seule sa mise en avant change.

### 2.3 L'incertitude, dite honnêtement

| Situation | Ce que l'app montre | Pourquoi | Niveau |
| --- | --- | --- | --- |
| Niveau `measured` (F10) de moins de 6 semaines | 5 km, 10 km, semi : un chrono, sans fourchette sur la carte ; la feuille dit « à quelques minutes près » | une fourchette sur chaque ligne charge l'écran ; l'erreur au semi depuis un semi récent est faible | OP |
| Niveau `provisional` (chrono déclaré, VO2max seule) | chronos précédés de « ≈ », feuille : « en attendant une vraie course ou le test » | le niveau lui-même est incertain | OP |
| Marathon, volume moyen 8 sem. ≥ 240 min et une sortie ≥ 1 h 45 dans les 6 sem. | Daniels | volume suffisant (F6, Vickers) | OBS/OP |
| Marathon, volume 150 à 240 min ou pas de sortie ≥ 1 h 45 | plus lent de Daniels et Riegel 1,07, avec « au mieux » | Riegel reste optimiste de 10 min en médiane | OBS |
| Marathon, volume < 150 min ou aucune sortie ≥ 1 h 15 en 6 sem. | « Pas encore », avec la raison dans la feuille | un chiffre sans base rassure à tort | OP |
| Aucun niveau (`NO_FITNESS_DATA`) | pas de chronos ; « Après ta première course ou ton test » | | OP |

Les seuils 150 min, 1 h 15 et 1 h 45 sont des choix de conception, à calibrer ; 240 min vient de F6.

---

## 3. Le seuil lactique sans laboratoire

### 3.1 Allure au seuil

- **Daniels T = v(0,88·VDOT)** (F7), soit 5'06 /km à VDOT 40. C'est l'allure tenue environ une heure à fond `CONS`.
- Contre un seuil mesuré à 4 mmol/L chez 27 coureurs entraînés, le VDOT estime la vitesse au seuil avec une erreur-type de **0,41 m/s**, le test de 30 min de **0,21 m/s** ([McGehee, Tanner & Houmard 2005, J Strength Cond Res, M : abstract seul](https://pubmed.ncbi.nlm.nih.gov/16095403/)). À 3,3 m/s (5'05 /km), cela fait environ ±35 s/km pour le VDOT et ±18 s/km pour le test : l'allure T est une bonne cible d'entraînement, pas une mesure du seuil.
- Les montres font à peine mieux : Garmin fēnix 6, vitesse au seuil à 7,5 % d'erreur ; fēnix 7, allure sous-estimée de 12 % ([revue 2025, M](https://pmc.ncbi.nlm.nih.gov/articles/PMC12748164/)).
- **Choix** : afficher l'allure T de l'app, nommée « allure seuil ». Elle bouge avec le niveau (RC1 à RC3).

### 3.2 FC au seuil

| Méthode | Erreur connue | Données nécessaires | Confiance |
| --- | --- | --- | --- |
| Garmin (détection auto ou test guidé) | FC au seuil non valide sur fēnix 6 (CCC < 0,70) ; −1,7 % sur fēnix 7 | ceinture + montre compatible : **impossible sur VA4** | M ([revue 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12748164/)) |
| Test de 30 min à fond (Friel, F14) | erreur-type **8 bpm** contre le seuil mesuré | une séance TEST ; FC moyenne de 10 à 30 min | M ([McGehee 2005](https://pubmed.ncbi.nlm.nih.gov/16095403/)) |
| Course de 50 à 65 min à fond (F14) | proche du test 30 min (même logique) | une course | OP |
| Tours au seuil de ses séances T et CRUISE (F18, lecture `threshold`) | dérive cardiaque et retard du capteur optique : la FC des 5 premières minutes est trop basse | ≥ 15 min continus à ±3 % de l'allure T, FC moyenne des tours après la 5e minute, sur 2 séances en 8 semaines | OP |
| % FCmax ou % FCR (Karvonen 84 à 88 % FCR, F13) | à charge fixe au seuil, 15 coureurs entraînés vont de 88 à 95 % FCmax ([Fleckenstein 2023, Sports, M](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10611166/)) : ±7 points, soit ±13 bpm pour Anna | FCmax (F12), FC repos | M |

**Choix** : la FC au seuil vient, dans l'ordre, d'un test de 30 min ou d'une course de 50 à 65 min de moins de 8 semaines (F14), puis des tours au seuil de ses séances T (2 séances, 8 semaines). Le pourcentage de FCR ne s'affiche pas comme une mesure : il reste dans les zones (F13) et la feuille dit « pas encore mesurée ». Le poignet ajoute du bruit sur les efforts courts ; seuls les tours continus de 15 min ou plus comptent.

**Anna** : 4 × 1 km à 5'15 à FC 170 (F-23, 88,5 % de 192). À 5'05, la FC monte de quelques battements : 172 bpm est cohérent. Karvonen donne 172 à 178 (84 à 88 % FCR, repos 55) : même zone, sans être une mesure.

**Quand c'est inconnu** : la tuile garde sa place et dit « À mesurer », avec dans la feuille la séance qui la mesurera (sa prochaine séance au seuil, ou le test).

---

## 4. VO2max Garmin et niveau de l'app

- Garmin (Firstbeat) estime la VO2max depuis la relation FC-vitesse en sous-maximal et une FCmax souvent prédite par l'âge ; 15 bpm d'erreur sur la FCmax déplacent la VO2max de 7 à 9 % ([revue 2025, M](https://pmc.ncbi.nlm.nih.gov/articles/PMC12748164/)). Méta-analyse : biais quasi nul en moyenne (−0,09 ml/kg/min) pour les algorithmes à l'effort, mais limites d'accord de **±9,8** ([Molina-Garcia 2022, É](https://pmc.ncbi.nlm.nih.gov/articles/PMC9213394/)). Surestimée chez les peu entraînés, sous-estimée chez les très entraînés (Düking 2022, Engel 2025, via la revue 2025, M).
- Le VDOT n'est pas une VO2max : il mêle VO2max et économie de course, il sort d'un chrono. Un VDOT de 40 avec une VO2max de 45 est banal.
- **Présentation** : la VO2max porte son nom et sa source (« ta montre ») ; les chronos et allures portent « d'après ta course du 14 septembre ». On n'affiche pas le VDOT comme un second nombre de VO2 : deux chiffres en ml/kg/min qui diffèrent de 5 points feraient croire à une erreur. F19 donne la phrase d'accord (« en accord avec ta course », « au-dessus », « en dessous », seuil 5 points) dans la feuille de détail.
- À 45 contre 40, F19 dit « au-dessus ». La maquette du week-end écrivait « en accord » pour 45 face à un semi en 1:52 (VDOT ≈ 39,6) : écart de 5,4, donc à corriger en « au-dessus ».

---

## 5. Recommandations pour le bloc

1. **VO2max** : valeur Garmin la plus récente (30 jours), date, source « ta montre ». Absente : la tuile disparaît (la VA4 en donne une après 15 min de course avec FC).
2. **Allure seuil** : T de l'app (F7), source « calculée depuis ta course ».
3. **FC au seuil** : F14, puis tours T ; sinon « À mesurer ». Jamais un pourcentage présenté comme mesure.
4. **Prédictions** : Daniels F5 pour 5 km, 10 km, semi ; marathon selon le tableau 2.3. La distance de l'objectif est mise en avant ; Progression garde la trajectoire et le volume (voir la maquette `programme-v2`).
5. **Feuille de détail** : une ligne par chiffre, avec sa source (Garmin ou calculé) et sa date.
6. **À vérifier** : coefficients de Vickers (fichier additionnel 1) avant de remplacer Riegel 1,07 au marathon ; une étude de l'erreur du VDOT entre distances courtes chez les coureuses loisir (aucune trouvée).
