# 08 : Monter le niveau par la fréquence cardiaque (RC14)

Recherche du 21/11/2026, après la PR #112 (un test toutes les 6 semaines, P26). Confiance : **É** élevée, **M** moyenne, **F** faible. Niveaux de preuve de `docs/specs/algo.md` (MA, ECR, OBS, CONS, OP). Complète `01-forme-et-allures.md` §3 (FC et zones) et `07-niveau-et-predictions.md` §3 (seuil sans laboratoire).

## 1. Le problème

Avec un test toutes les 6 semaines, le niveau ne monte entre deux tests que par RC3, qui demande des séances 2 % plus vites que la cible. Anna suit ses cibles : quand elle progresse, ses allures restent les mêmes, et c'est son cœur qui baisse. Sans lire la FC, l'app ne voit rien jusqu'au test suivant.

## 2. Ce que dit la littérature

| Fait | Source | Niveau | Confiance |
| --- | --- | --- | --- |
| La FC à une charge sous-maximale fixe (FC d'exercice) baisse quand la forme aérobie monte ; c'est un des marqueurs de suivi les plus utiles, avec la FC de repos et la récupération de FC | Buchheit M. « Monitoring training status with HR measures: do all roads lead to Rome? ». *Front Physiol* 2014;5:73 ([PMC3936188](https://pmc.ncbi.nlm.nih.gov/articles/PMC3936188/)) | OBS (revue) | M |
| Erreur type de la FC d'exercice ≈ 3 % (CV), plus petit changement utile ≈ 1 % (tableau 1) : un seul écart de 1 à 2 % reste dans le bruit, deux écarts dans le même sens le dépassent | Buchheit 2014, tableau 1 ([PMC3936188/table/T1](https://pmc.ncbi.nlm.nih.gov/articles/PMC3936188/table/T1)) | OBS | M (valeurs pour des paliers courts de 30 à 60 s ; la moyenne d'un tour de 8 min et plus est sans doute plus stable, non vérifié) |
| Le LSCT (test sous-maximal de Lamberts) suit la forme par la FC à des paliers fixes : une FC plus basse au même palier accompagne une meilleure performance en contre-la-montre | Lamberts RP, Swart J, Noakes TD, Lambert MI. *Br J Sports Med* 2011;45:797-804 | OBS | M (cyclistes ; non vérifié en texte intégral) |
| %FCmax = 0,6463 × %VO2max + 37,182 : relation linéaire de population | Swain DP, Abernathy KS, Smith CS, Lee SJ, Bunn SA. *Med Sci Sports Exerc* 1994;26:112-116 | OBS | M (pente de population ; non vérifié en texte intégral) |
| Daniels : monter le VDOT quand les séances deviennent faciles à la même allure ; garder un niveau 3 à 4 semaines | Daniels 2014 | CONS | É (déjà cité en RC3) |
| La FC dérive vers le haut à allure constante, d'autant plus avec la chaleur et la durée | Coyle et González-Alonso 2001 (déjà cité en F18) | OBS | É |
| La FC n'atteint son régime qu'après 1 à 3 min d'effort (retard cardiaque) : un tour court lit une FC trop basse | Buchheit 2014 ; physiologie classique | CONS | M |
| Plews et coll. suivent la VFC, pas la FC d'exercice ; la VFC ne sort pas de la vivoactive 4 par le bridge | Plews DJ et coll. *Sports Med* 2013;43:773-781 | OBS | M (hors sujet ici) |

## 3. Combien vaut un battement

Swain donne la pente entre la FC et la part de VO2max. À une vitesse donnée, une FC plus basse de `ΔFC` veut dire que cette vitesse coûte une part plus petite de son VO2max :

`niveau-FC = VO2(v) × 0,6463 / (FC/FCmax − 0,37182)`

Pour Anna (FCmax 190, VDOT 40, allure T), 1 bpm ≈ 0,4 point de VDOT, 3 bpm ≈ 1,2 point. C'est l'ordre de grandeur annoncé : 3 à 5 bpm de moins au même effort accompagnent un gain de forme d'environ un point.

La pente de Swain est celle d'une population : le niveau absolu qu'elle donne est faux d'une personne à l'autre. RC14 ne s'en sert donc qu'en **rapport** : `niveau-FC / niveau de la séance`, comparé à sa propre moyenne des semaines d'avant. L'erreur d'ordonnée à l'origine s'annule ; seule la pente compte, et elle sert à comparer des allures un peu différentes.

## 4. Ce que l'app en tire (RC14)

- **Quelles séances** : T et CRUISE seulement. Les fractions I n'atteignent pas un régime stable (retard cardiaque) ; les footings E restent trop bruités sans le modèle F15, que le serveur ne construit pas (RC6 retirée pour cette raison).
- **Quels tours** : les tours de travail (± 10 % de la cible), d'au moins 8 min (le retard pèse peu), commencés dans les 20 premières minutes de travail (la dérive reste faible) ; pas de lecture à plus de 20 °C, avec 1 % de dénivelé ou plus, un facteur externe ou un ressenti `hard`.
- **Sa ligne de base** : la moyenne des séances lues dans les 6 semaines (l'intervalle entre deux tests, P26) avant la paire comparée.
- **Contre le bruit** : deux séances, à 21 j au plus l'une de l'autre, courues après le dernier changement, chacune 3 bpm sous ce que sa ligne de base prédit à sa vitesse (au-delà de l'erreur type d'environ 3 % pour l'une, et dans le même sens pour les deux) ; on retient la plus petite des deux.
- **Taille** : `courant × (rapport le plus bas / rapport habituel)`, un point au plus (recherche 02 R23), 0,5 au moins pour proposer (comme RC1 et RC3).
- **Jamais de baisse par la FC** : une FC plus haute dit autant la fatigue, la chaleur ou une nuit courte que la forme (RC5) ; une baisse demande une performance (RC2, RC4).
- **Stabilité** : attente de RC3 (28 j après le dernier changement, 14 j pour un point), une proposition RC14 tous les 14 j (RC8), aucune hausse si une hausse a été refusée il y a moins de 14 j. La proposition passe par la carte habituelle, acceptée ou refusée en un tap, et Annuler fonctionne (RC9, RC11).

## 5. Limites

- La pente de Swain est une moyenne : pour une coureuse dont la FC monte moins vite avec l'effort, 3 bpm valent plus d'un point, et l'inverse. Le plafond d'un point et le test des 6 semaines (RC1, RC2) bornent l'erreur.
- La FC au poignet (vivoactive 4) est moins fiable qu'une ceinture, surtout au début des tours ; la règle des tours de 8 min l'atténue.
- Garmin ne synchronise pas la température : des séances de base courues au chaud (FC gonflée) feraient paraître plus basses les séances suivantes. La moyenne de plusieurs séances de base et l'exigence de deux séances dans le même sens l'atténuent sans l'exclure ; le refus en un tap et le test suivant (RC2) corrigent.
- Le banc d'essai simule la FC avec la même pente de Swain : il vérifie la logique de RC14, pas la pente elle-même.

## 6. Une ancre absolue : la FC seuil (RC15)

Ajout du 21/11/2026, après la PR #113. RC14 ne s'est jamais déclenché sur le banc : il compare ses séances entre elles, et un gain d'environ 0,2 VDOT par semaine ne fait baisser la FC que d'environ 0,6 bpm par semaine, sous le bruit. Une erreur de départ (un niveau trop bas dès le début) lui reste invisible : toutes ses séances sont fausses de la même façon.

La FC seuil (LTHR) donne une ancre qui ne dépend pas des séances : mesurée par le test de l'app (95 % de la FC moyenne de 20 min à fond, F14) ou une course de 50 à 65 min, sinon par ses tours au seuil (NV3). En battements, elle bouge peu avec l'entraînement ; c'est l'allure qui s'y court qui monte (Friel 2016 ; recherche 07 §3).

| Fait | Source | Niveau | Confiance |
| --- | --- | --- | --- |
| L'allure T de Daniels se court à 88 à 92 % de la FCmax, soit à peu près à la FC seuil | Daniels 2014 | CONS | M |
| 95 % de la FC d'un contre-la-montre de 20 min estime la FC à l'état stable de lactate : biais -1,4 %, limites ± 8,2 % | Borszcz et coll. 2019, *IJSPP* (PubMed 30676826) | OBS | M (cyclistes) |
| Erreur type de la FC d'exercice ≈ 3 % (≈ 5 bpm à 170) | Buchheit 2014, tableau 1 | OBS | M |
| Une FC plus basse à charge fixe accompagne une meilleure performance | Lamberts 2011 | OBS | M |

**La règle.** Les deux dernières séances T ou CRUISE lues comme RC14, courues après le dernier changement et à son allure T du moment ou plus vite : chacune 5 bpm ou plus sous sa FC seuil, c'est que l'allure T est trop lente. De chaque séance, la pente de Swain donne la VO2 qu'elle tiendrait à sa FC seuil : `VO2(v) + (FC seuil - FC) / FCmax / 0,6463 × niveau courant`. Seule la pente sert, pas l'ordonnée à l'origine de population ; le niveau courant tient lieu de VO2max, ce qui sous-estime le gain si elle est plus forte (sens prudent). Le VDOT proposé est celui dont l'allure T vaut cette VO2 (÷ 0,88), le plus bas des deux, un point au plus, mêmes attentes que RC3 et RC14.

**Pas de régression personnelle.** La demande prévoyait sa propre droite FC-allure dès 3 séances. Ses séances T se courent toutes à ± 2 % de la même allure : sur une plage de vitesse aussi courte, la pente d'une régression se perd dans les ± 2 à 3 bpm du jour. La pente de Swain, fixe, reste plus sûre ; le plafond d'un point et le test suivant bornent son erreur.

**Au-dessus de la FC seuil.** Chacune 5 bpm ou plus au-dessus à allure T : à revoir, jamais une baisse (une FC haute dit autant la fatigue, la chaleur ou une nuit courte, RC5). Aucune hausse par la FC dans ce cas, même si RC14 voit une baisse relative : son cœur reste au-dessus du seuil. Le test suivant (P26) tranche.

**Tours au seuil.** Une FC seuil lue sur ses tours (NV3) est la FC qu'elle a à l'allure que l'app lui donne : comparée à ces mêmes séances, l'écart est nul par construction, la règle se tait. Elle n'invente donc pas de hausse ; seule une FC de test ou de course la fait parler.

## 7. Le seuil de 5 bpm, et RC14 à 4, choisis sur le bruit

Le banc simule désormais une FC du jour bruitée de ± 2,5 bpm (tirage à part, pour ne pas changer les autres tirages), tests compris : la FC seuil lue sur un test porte donc aussi son erreur. Un contrôle « aucune fausse hausse » s'ajoute aux allures : une hausse ne doit pas dépasser le niveau réel de plus de 0,5 (le bruit d'un test, RC1).

Sur 15 tirages de bruit × 3 personas (Anna, les deux retours de marathon), 795 semaines :

| Seuil RC15 (RC14 à 3 bpm) | Hausses RC15 | Fausses | Semaines à plus d'un point |
| --- | --- | --- | --- |
| aucun RC15 | 0 | 0 | 211 |
| 2 bpm | 15 | 4 | 201 |
| 3 bpm | 8 | 2 | 203 |
| 4 bpm | 4 | 1 | 206 |
| 5 bpm | 2 | 0 | 208 |

À 3 bpm, RC14 faisait 6 hausses dont 3 fausses. À 4 bpm et plus (avec RC15 à 5), aucune hausse RC14 sur les 795 semaines, aucune fausse hausse au total, 212 semaines à plus d'un point. Choix : RC15 à 5 bpm (une erreur type, Buchheit 2014), RC14 à 4 bpm. Le gain est petit (2 hausses justes sur 795 semaines) : avec un test toutes les 6 semaines et un gain d'environ 1 point entre deux tests, l'écart de FC reste à environ 3 bpm, sous le bruit. RC15 rattrape surtout les gros écarts, ceux qu'une FC seuil connue rend visibles avant le test.

## 8. Un retest à 5 semaines ? Non

Essayé sur le banc le 21/11/2026 :

- 5 semaines pour toutes : Anna recule (allures 8,8 → 8,4), une autre persona perd du contenu (10 → 8,3), et une fausse hausse RC1 apparaît (retour de marathon, test lu haut). Rejeté.
- 5 semaines seulement sans FC seuil connue : +0,3 pour un retour de marathon, -0,2 pour l'autre (son test, une semaine plus tôt, lu plus bas), pour un test dur de plus et un couplage de la construction de la semaine à la FC seuil. Pas assez : P26 reste à 6 semaines.

## 9. Limites (RC15)

- La FC seuil d'un test de 20 min a des limites d'accord de ± 8 % (Borszcz 2019). Si elle est surestimée, RC15 propose des hausses à tort. Bornes : un point par proposition, 14 j au moins après le dernier changement (un point de plus demande 14 j de plus), refus en un tap, séances notées `hard` ignorées, RC4 si elle ne tient plus l'allure, et le test suivant qui relit le niveau (RC1, RC2).
- Le banc simule la FC avec la pente de Swain et une FC seuil juste en moyenne : il vérifie la logique et la tenue au bruit, pas la pente ni le biais d'un test réel.
