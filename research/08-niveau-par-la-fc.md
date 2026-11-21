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
