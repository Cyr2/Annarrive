# Annarrivé : ce que fait chaque bouton

Référence pour les maquettes et le code. Chaque action dit ce qu'elle ouvre, ce que l'app fait, ce qu'Anna voit, et comment revenir en arrière.

## Règles communes à toutes les actions

1. **Tout changement se défait.** Après chaque modification, un bandeau apparaît en bas pendant 6 s : « Séance déplacée à mercredi 18:00 · Annuler ». Annuler remet exactement l'état d'avant, montre comprise.
2. **La montre suit.** Toute séance modifiée est renvoyée sur la montre dans la minute. La carte affiche « Sur ta montre » une fois la synchro faite, « Envoi à ta montre… » pendant, « Pas envoyée, réessayer » en cas d'échec (tap = nouvel essai), y compris quand l'envoi échoue depuis plus de 10 min. Sans lien avec Garmin sur le serveur, elle affiche « Montre pas reliée ». Jamais « Envoi… » pour toujours.
3. **Reggie respecte les règles de l'algo.** Il ne propose jamais un créneau ou une séance qui casse une règle :
   - 24 h après une séance jambes avant une séance dure ou une sortie longue ;
   - jamais deux séances dures d'affilée ;
   - les limites horaires d'Anna ;
   - fin de course au moins 1 h avant son coucher.
   Si Anna force un choix qui casse une règle, l'app l'accepte, l'avertit en une ligne et adapte le contenu (par exemple, le fractionné devient un footing).
4. **Ce qu'Anna change à la main n'est jamais remis en cause** par une adaptation automatique.
5. **Une séance ratée n'est jamais rattrapée.** Le plan avance.
6. **Une seule question à la fois** quand Reggie a besoin d'une info, avec des réponses en boutons.
Chaque explication (pourquoi cette séance, séance allégée, verdict de la cible) se termine par le lien bleu « En parler avec Reggie › » : il ouvre Reggie sur ce sujet et envoie la question pour elle.
7. **Une allure s'écrit toujours avec son unité**, en notation de coureur, une seule valeur par étape : « 5'15 /km », « 6'25 /km » (algo.md C4). Les durées restent « 50 min », « 1 h 06 ». Chaque étape courue a son allure, comme sur la montre.
8. **Un cours s'affiche par son nom.** Le flux de l'université écrit « (M1M2E G3 NL) UE1 Français » : l'app montre « Français » en titre et « UE1 · M1M2E G3 NL » sur la ligne secondaire de la fiche du cours. Les codes UE passent d'abord, puis ce qui était entre parenthèses ; sans nom de cours, les codes font le titre. La fiche du cours garde le nom complet du flux. Dans les listes (Semaine, Ma journée), la première UE de UE1 à UE4 devient une pastille de sa couleur au bout de la ligne, et la ligne secondaire garde le reste (« M1M2E G3 NL ») ; un cours sans UE reconnue n'a pas de pastille, et la frise le marque d'un point gris.
9. **Les actions d'une feuille restent à portée.** Les boutons qui agissent (Déplacer, Changer, Pas dispo, « Ce cours n'a pas lieu », Reconnecter...) sont épinglés en bas de la feuille, jamais au bout du défilement.
10. **Mise à jour.** Une nouvelle version attend à un moment calme : bandeau « Nouvelle version prête · Recharger ». Si un écran ne se charge pas parce que sa version a été remplacée (en ligne, le fichier n'existe plus sur le serveur), l'app se répare seule, une fois par version : la nouvelle version prend la main, ou sinon l'app efface son cache et se recharge, sans l'animation de lancement. Hors ligne, ou si ce rechargement n'a pas suffi, l'écran dit « Écran indisponible » avec Réessayer, et rien n'est effacé.

## Aujourd'hui

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Jour de repos | Pas de carte : la lune à gauche, « Repos » et sa phrase à côté, sur une seule rangée ; la prochaine séance en dessous | Rien ne change. L'objectif et son compte à rebours vivent dans Programme, pas ici |
| Carte de la séance | Ouvre le détail de la séance (étapes, allures, pourquoi cette séance). Déplacer, Changer et Pas dispo restent épinglés en bas de la feuille, visibles quel que soit le défilement des étapes | Rien ne change |
| Voir les étapes | Déplie les étapes dans la carte, comme une séance Garmin : « Échauffement · 15 min », un groupe « Répéter 3 fois » autour des lignes qu'il répète (« 8 min », « Récupérer · 2 min »), « Retour au calme · 10 min », chaque ligne avec son allure. Absent quand la séance n'a qu'une étape | Rien ne change. Deuxième tap = replie |
| Carte « Tu l'as faite ? » | Apparaît quand une séance de la semaine est finie sans course reçue de la montre. « Oui, je l'ai faite » ou « Non, je l'ai sautée » | Oui : séance faite. Non : séance passée, jamais rattrapée. Bandeau Annuler dans les deux cas |
| Ligne « Tu es enrhumée » (ou fièvre, douleur) et « Ça va mieux » | Reste en haut tant qu'un état Malade ou Douleur dure | « Ça va mieux » lance le retour, comme dans Pas dispo. Bandeau Annuler |
| Ligne de Reggie « Ton footing de mardi ressemblait plutôt à un tempo : je décale ton seuil à jeudi. » | Apparaît en haut quand une course synchronisée a changé la semaine (algo.md M10 : une course rapide un jour facile écarte la séance dure suivante ; une course en plus raccourcit un footing). Reste jusqu'au jour de la séance changée. Au tap, ouvre Reggie | Rien ne change. Le changement est au journal et s'annule comme les autres ; annulé, la ligne disparaît |
| Mot de Reggie sous la séance (pourquoi cette séance) | Ouvre la conversation, avec le contexte « À propos de : Fractionné, ce soir 18:00 ». C'est le chemin vers Reggie depuis la séance, avec son onglet : pas de rond Reggie, pour que Déplacer, Changer et Pas dispo tiennent au-dessus de la barre d'onglets | Reggie sait de quelle séance on parle |
| **Déplacer** | Ouvre la feuille « Déplacer » | Voir plus bas |
| **Changer** | Ouvre la feuille « Changer » | Voir plus bas |
| **Pas dispo** | Ouvre la feuille « Pas dispo » | Voir plus bas |
| Un jour de « Cette semaine » | Ouvre l'onglet Semaine, positionné sur ce jour | Rien ne change |
| Tout voir | Ouvre l'onglet Semaine sur aujourd'hui | Rien ne change |
| Ligne de « Ma journée » | Course : détail de la séance. Muscu ou révision : feuille de modification. Cours : fiche du cours (lecture seule) avec « Ce cours n'a pas lieu » | Marquer un cours annulé libère le créneau et peut déclencher une adaptation, avec bandeau Annuler |

### Déplacer

Garde le **contenu** de la séance, change **le moment**.

1. La feuille montre 3 créneaux proposés par l'algo, triés du meilleur au moins bon, chacun avec une raison courte. Le meilleur créneau du lendemain en fait toujours partie s'il est permis :
   - « Ce soir 19:30 · même jour, une heure plus tard » ;
   - « Mercredi 18:00 · ta muscu jambes est jeudi soir » ;
   - « Jeudi 7:30 · avant tes cours ».
2. En dessous, « Choisir un autre moment » ouvre un choix de jour (7 puces) et d'heure (le champ d'heure de l'app, à la minute près). Les moments interdits sont grisés avec leur raison : « Moins de 24 h après ta séance jambes ».
3. Anna tape un créneau, puis « Déplacer ».
4. La carte glisse vers son nouveau jour. Si une autre séance de la semaine doit bouger pour respecter les règles, la feuille le dit avant validation : « Ton footing de jeudi passe à vendredi ».
5. Bandeau « Fractionné déplacé à mercredi 18:00 · Annuler ». La montre est mise à jour.

Sous le bouton, « Passer cette séance » la retire sans la rattraper (bandeau « Séance passée · Annuler »).

Si aucun créneau ne marche cette semaine, la feuille le dit et propose « Remplacer par un footing ce soir » ou « Passer cette séance ».

### Changer

Garde **le moment**, change **le contenu**. Ne propose jamais une séance plus dure que le plan.

1. La feuille montre 4 options en cartes, chacune avec un aperçu (durée, allure) :
   - **Plus court** : même séance, environ 25 % de moins (par exemple 4 × 800 m au lieu de 6) ;
   - **Plus facile** : même durée, allure facile ;
   - **Autre séance équivalente** : même objectif d'entraînement sous une autre forme (par exemple 3 × 1 600 m au seuil au lieu de 6 × 800 m) ;
   - **Footing tranquille** : 30 min en endurance.
2. Un champ « Dis-le à Reggie » permet d'expliquer autre chose. Reggie répond alors dans la conversation avec une proposition.
3. Anna choisit, l'aperçu s'affiche en grand, puis « Valider ».
4. La carte du jour se met à jour. Bandeau Annuler. Montre mise à jour.

### Pas dispo

1. La feuille demande « Qu'est-ce qui se passe ? » avec 5 boutons :

| Choix | Question suivante | Résultat |
|---|---|---|
| Pas le temps | Aucune | Reggie propose de déplacer (comme Déplacer). Si rien ne marche, séance passée |
| Fatiguée | Aucune | Séance du jour remplacée par du repos. La prochaine séance dure est vérifiée et allégée si elle tombe demain |
| Malade | « Tu as de la fièvre ou ça touche la poitrine ? » Oui / Non | **Oui** : Reggie conseille le repos tant qu'il y a de la fièvre, sans rien bloquer. Si elle veut courir, la séance devient un footing en endurance fondamentale, court et tranquille. **Non** (rhume) : séances gardées en endurance fondamentale, pas de fractionné ; toutes les séances à venir changent tout de suite, sur la Semaine et la montre (EV10). Quand elle dit « Ça va mieux », endurance fondamentale encore 3 jours, puis retour normal |
| Douleur | « Où ? » (boutons : mollet, genou, cheville, hanche, pied, autre), puis « Combien sur 10 en marchant ? » (curseur 0 à 10) | **0 à 3** : footing en endurance fondamentale ou vélo, pas de fractionné. **4 et plus** : Reggie conseille le repos ou le vélo, sans bloquer. Si elle veut courir : 20 min tranquille, arrêt si ça monte. Conseil de voir un kiné ou un médecin si ça dure plus de 3 jours |
| Autre | Champ texte | Reggie répond dans la conversation |

2. Durée (sauf Malade) : « Juste aujourd'hui » ou « Jusqu'à… » (choix d'une date).
3. Une carte résume ce qui change sur la semaine, puis « Valider ». Bandeau Annuler.

## Après la course

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Carte « Fractionné fait » | Détail de l'activité (tours, allure par fraction, FC) | Rien ne change. « Prévu 1 h 13, fait en 44 min » : une course de moins de 80 % du temps prévu porte une horloge grise, pas la coche verte d'une séance tenue |
| Facile / Correct / Dur | Sélectionne le ressenti. N'apparaît que si la montre n'a rien enregistré | Enregistré pour l'algo. Trois « Dur » d'affilée sur des séances faciles déclenchent une vérification des allures |
| Champ « Un mot pour Reggie » et flèche | Envoie la note dans la conversation | Reggie répond en une ou deux lignes. Si la note signale une douleur, il lance les questions de « Douleur » |

## Le bilan du dimanche

Une carte en haut d'Aujourd'hui, au-dessus du contenu habituel du jour (algo.md BR7). Elle apparaît le dimanche dès 18:00, ou à la fin de la dernière séance de la semaine si elle finit plus tard, reste tout le lundi et disparaît le mardi. Rien pour une semaine sans séance prévue ni pour une semaine finie avant le début du programme : le lundi de l'onboarding n'a pas de bilan. Le lundi, le bilan s'arrête à la phrase de Reggie : la semaine qui commence est déjà sous les yeux, la carte du jour reste juste en dessous. Si elle vient de courir, la carte de sa course (« Comment c'était ? ») passe avant le bilan : son ressenti est la seule chose attendue d'elle ce soir-là.

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Notification « Ta semaine est prête » (dimanche 18:00) | Ouvre Aujourd'hui, la carte du bilan en haut | « 4 courses sur 4 cette semaine. La suivante est prête. » |
| Carte « Ta semaine, 16 au 22 novembre » | Rien : elle informe. Courses faites sur prévues, temps couru, un fait marquant s'il y en a un, la phrase de Reggie | Rien ne change |
| « × » (Fermer le bilan) | La carte s'efface pendant que sa place se replie (400 ms, ressort sans rebond ; un simple fondu avec « Réduire les animations ») : la page raccourcit avec elle, sans saut. Pas de bandeau Annuler : le bilan ne change rien au plan | Retenu par le serveur pour cette semaine : elle ne revient ni à la réouverture ni sur un autre appareil |
| Ligne de « La semaine prochaine » (dimanche seulement) | Rien : les lignes de Semaine, une par course de la semaine suivante | « Demain » n'est pas répété sous la carte quand sa course y figure déjà |
| Voir la semaine | Ouvre Semaine sur la semaine suivante | Rien ne change |

## Après la course objectif

Quand Garmin envoie la course du jour J (algo.md RR1), son résultat remplace Aujourd'hui jusqu'à ce qu'Anna choisisse la suite.

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Carte du résultat | Rien : le temps, l'écart au chrono visé (« 28 s sous ton objectif » en vert, « 1 min 10 au-dessus de ton objectif » en neutre, « Course finie » sans chrono visé), l'allure moyenne et l'écart à sa dernière course à cette distance, l'allure par tranche en bleu, la phrase de Reggie, le dossard 14 | Rien ne change |
| Ligne sous « Et maintenant ? » | Rien : elle informe. « D'abord une semaine de footings faciles, quelle que soit la suite. » (5 et 10 km), deux semaines (semi), trois (marathon), selon algo.md MA6 | Rien ne change |
| Une nouvelle course | Ouvre la feuille « Ton objectif » vierge, même touchée avant que le programme soit lu : la même distance proposée, sans nom, sans date, sans chrono, donc sur « Juste finir » ; Valider attend une date après aujourd'hui (et, sur « Viser un chrono », un chrono : « Ce qui change » le dit). « Ce qui change » compte la nouvelle course depuis aujourd'hui (« Semi-marathon dans 20 semaines, objectif finir. »). Le bandeau qui suit garde une ligne : le changement, au plus un avertissement, puis « 2 autres points » ; la semaine de la course finie ne bouge pas | Valider le nouvel objectif rend Aujourd'hui ; le nouveau plan commence par les semaines de footings (ses premières semaines de base, algo.md MA6). Annuler la feuille garde le résultat |
| Garder la forme | Passe en mode entretien : les semaines de footings, puis le mode entretien sans objectif (algo.md MA6). La carte dit « Ensuite 2 à 3 courses par semaine, dont une un peu plus rythmée. » | Aujourd'hui revient. Bandeau « Mode entretien : footings faciles pour commencer » avec Annuler, qui ramène le résultat |

## Semaine

| Élément | Geste | Ce qui se passe |
|---|---|---|
| Flèches gauche et droite | Tap | Semaine précédente ou suivante. Les semaines passées sont en lecture seule |
| La page | Glisser à gauche ou à droite | La semaine suit le doigt, et la suivante (ou la précédente) est déjà dessinée à côté : elles glissent ensemble, jamais de vide (une semaine pas encore lue montre sa place). Lâchée au-delà d'un quart de la largeur (ou lancée), la voisine se pose avec un ressort et devient la semaine affichée ; sinon tout revient, rien n'est relu. Avec « Réduire les animations », la semaine change d'un coup. Un glissement vertical reste un défilement, un appui long reste le déplacement d'une séance. Sur Semaine, glisser ne change jamais d'onglet : un glissement depuis le bord serait pris par le geste retour d'Android, qui occupe les deux bords |
| Actualiser | Tap | Relit l'emploi du temps tout de suite. Si un cours change, une ligne courte dit ce que ça fait à ses courses : « Footing passé à vendredi 18:00 », « 2 courses déplacées : pris par un cours ou un créneau occupé », ou « Cours mis à jour, tes courses restent en place ». Le détail cours par cours reste dans Réglages. Aujourd'hui n'a pas cette ligne : l'emploi du temps s'y relit seul ou en tirant la page. Une relecture automatique qui change quelque chose laisse la même ligne jusqu'au soir |
| La page, tout en haut | Tirer vers le bas | Même lecture qu'Actualiser, aussi sur Aujourd'hui et Programme. Les flèches d'Actualiser descendent dans une pastille de verre en suivant la moitié du doigt et tournent avec lui ; au-delà de 64 px elles passent au bleu, et lâcher lance la lecture (les flèches tournent seules, la ligne dit « Lecture en cours… »), puis la pastille remonte. En deçà, elle remonte sans rien lire. Jamais sous une feuille ; un glissement de côté ou un appui long n'est pas un tirage. Une seule lecture à la fois |
| Course, muscu, révision | Appui long (0,3 s) puis glisser | La séance se soulève (petite vibration). Les créneaux possibles s'entourent en pointillés, les jours interdits s'atténuent avec leur raison. Lâcher = déplacement, bandeau Annuler |
| Course, muscu, révision | Tap | Course : détail. Muscu ou révision : feuille de modification |
| Cours (emploi du temps) | Tap | Fiche du cours, lecture seule, avec « Ce cours n'a pas lieu » épinglé en bas et le nom complet du flux. Les cours ne se glissent pas |
| Tout · Courses · Muscu · Cours · Révisions | Tap | La liste des jours et la frise ne montrent plus que ce type ; un jour sans rien de ce type le dit en une ligne calme (« Pas de cours »). Les indispos ne s'affichent que dans Tout. Le choix est gardé sur le téléphone et revient à la prochaine visite. Sur un écran étroit, la rangée défile de côté sans tourner la semaine |
| Plage de dates | Tap | La plage est toujours à l'encre, celle de la semaine en cours comme les autres, et ne fait rien sur la semaine en cours. Sur une autre semaine, elle est précédée d'une petite flèche de retour bleue : la toucher ramène à la semaine en cours. Rien n'apparaît sous l'en-tête et rien ne bouge, comme un titre iOS qui ramène en haut |
| Onglet Semaine, déjà ouvert | Tap | Ramène à la semaine en cours et en haut de la page, comme un onglet iOS touché à nouveau (voir « Onglet déjà ouvert ») |
| **+** | Tap | Feuille « Ajouter » |

### Feuille « Ajouter »

- **Muscu** : la liste de ses séances enregistrées.
  - **Placer** ouvre jour et heure (pré-remplis sur son habitude), puis « Ajouter ».
  - Tap sur la ligne : modifier la séance.
  - « Nouvelle séance de muscu » : nom, case jambes, jour, heure, durée, répétition.
- **Révision** : jour, heure, durée sur la roue native d'iOS, lue « 2 h » (2 h par défaut, jusqu'à 8 h), répétition. Ajouter reste grisé à 0 min ou si la révision passe minuit.
- **Occupée** : un titre facultatif (« Soirée chez Léa »), jour, heure de début et de fin. L'app ne place rien dessus.

Après ajout, si une course entre en conflit, Reggie la déplace, même si elle est ce soir, et le bandeau dit laquelle et pourquoi : « Muscu ajoutée · Sortie longue passée à dimanche 19:00 : moins de 24 h après ta séance jambes ». Une muscu n'est « jambes » que si l'interrupteur est activé.

### Feuille « Séance de muscu »

- Nom, « Travaille les jambes » (interrupteur), jour (7 puces), heure, répéter (jamais, chaque semaine, toutes les deux semaines), durée sur la roue native d'iOS, lue « 1 h 30 » (jusqu'à 4 h). OK reste grisé à 0 min.
- OK enregistre. Annuler ferme sans rien changer.
- Supprimer la séance ouvre une alerte de confirmation (`ConfirmDialog`) : « Supprimer Jambes ? », « Cette semaine et les suivantes », « Cette semaine seulement » et Annuler. Le bouton Supprimer ne change pas.

## Programme

Le programme seul, de haut en bas : la carte de l'objectif (date, « Modifier », course, « Semaine n sur N », chrono visé et sa pastille), tout en haut ; la frise des phases (la seule à nommer la phase) ; Progression ; « Ton niveau » ; la ligne « Ta dernière course › » ; enfin la ligne « Réglages › ». Aucun réglage sur cet écran.

La frise place chaque nom sous sa propre barre (maquette `programme-v2`, B) : le nom de la phase en cours, entier et en gras, part du début de sa barre et s'aligne sur la fin de la frise s'il la dépasserait ; chaque autre nom part du début de sa barre, au moins 8 px après le nom précédent, sans dépasser sa barre, le dernier aligné sur la fin ; un nom trop long prend sa forme courte (Dév., Spé., Affût.) ; s'il ne tient toujours pas, il s'efface à l'écran, et VoiceOver lit toujours les quatre noms entiers. Les positions se calculent avec la police réelle une fois la page posée, sans rien décaler.

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Réglages (dernière ligne, roue et chevron) | Pousse la page Réglages, comme une pile iOS : l'onglet Programme reste allumé | « ‹ Programme », le retour du système, un glissement vers la droite ou l'onglet Programme touché à nouveau ramènent à Programme. La ligne reste là quand le programme ne se charge pas |
| Pastille « Ambitieux » ou « Atteignable » (carte de l'objectif) | Une feuille « Pourquoi atteignable ? » (ou « ambitieux ») explique le verdict en mots simples : son niveau aujourd'hui (temps prédit sur la course), le gain que sa cible demande sur les semaines d'entraînement du plan, et le gain habituel sur cette durée. Jamais un chrono proposé (algo.md P20). « Fermer », un tap à côté ou un tirage vers le bas la ferme, comme toute feuille. Tant qu'elle est ouverte, la page derrière ne défile pas | « En parler avec Reggie » ouvre Reggie, à propos de l'objectif, et envoie « Pourquoi mon objectif est ambitieux ? Qu'est-ce que je peux faire ? » (ou « Mon objectif est atteignable : comment je m'y prends ? »). Pendant l'onboarding, la pastille informe seulement : elle n'a pas de chevron |
| Modifier l'objectif | Reprend les écrans de création du programme, pré-remplis, avec l'heure de départ de la course | Avant validation, un résumé montre ce qui change (« 2 semaines de plus, chrono visé atteignable »). Les semaines à venir sont recalculées, la semaine en cours garde ce qu'Anna a déjà déplacé. Une course dans les 7 jours, nouvelle ou retirée, refait aussi ce qui reste de la semaine en cours (algo.md EV20) ; le résumé le dit : « Ta semaine devient une semaine de course : rien de dur dans les 3 jours avant. » |
| Ta dernière course (ligne sous « Ton niveau », « Semi en 1:52, il y a 2 mois ») | Feuille « Ta dernière course » : « Quelle distance ? » (pastilles 5 km, 10 km, Semi, Marathon), « En combien de temps ? » (cases h, min), « Il y a combien de temps ? » (liste : moins d'un mois, 1 à 6 mois, plus de 6 mois), Enregistrer épinglé dans le pied. Un temps impossible pour la distance remplace la note, sans décaler la feuille | Son niveau est recalculé avec ce chrono (algo.md F10) et les séances à venir prennent les nouvelles allures : aucune séance n'est ajoutée, déplacée ni retirée, la séance du jour décidée ne change pas (EV14, P25). Bandeau « Allures recalculées avec ton chrono · Annuler » |
| Carte « Ton niveau » (sous Progression) | Toute la carte (chevron) ouvre la feuille « Niveau et chronos », en deux sections. « Ton niveau » : VO2max, allure seuil, FC seuil, chacune avec une seule ligne de source (« Garmin, au-dessus de ta course » selon F19, « Calculée le 12 novembre », « Tes 2 séances au seuil » ou « Ton test du 6 novembre »). « Tes chronos possibles » : 5 km, 10 km, Semi, Marathon, la distance de l'objectif marquée d'un petit drapeau, le marathon suivi de « au mieux » ou remplacé par « Pas encore » ; une note dit l'incertitude. « OK », un tap à côté ou un tirage vers le bas la ferme | Lecture seule (algo.md M13). La carte montre une ligne de trois chiffres : VO2max (sans VO2max de la montre, la colonne disparaît), allure seuil /km, FC seuil en bpm ou « À mesurer ». Pendant un niveau provisoire, chaque chrono porte « ≈ ». Aucun chrono sur la carte |
| Bloc Progression (sous la frise, absent en mode entretien) | Toute la carte ouvre la feuille « Progression » : son temps estimé semaine par semaine (la semaine en cours en gras), puis « Allures ajustées », chaque changement de niveau daté et expliqué en une ligne (« Départ » pour son niveau au début du programme). « OK », un tap à côté ou un tirage vers le bas la ferme | Lecture seule, rien ne change dans le plan (algo.md M12). La carte montre le temps estimé sur sa course et son chrono visé, la courbe des semaines passées jusqu'à aujourd'hui puis un pointillé vers le chrono visé le jour de la course (avant deux semaines : « Ta courbe se dessine après ta première semaine. »), le temps couru face au temps prévu de chaque semaine, et les séances tenues depuis le début |

## Réglages

Page poussée depuis la dernière ligne de Programme, en liste groupée iOS, dans cet ordre : Tes courses (courses par semaine, sortie longue, heure préférée), Tes horaires (pas avant, pas après, coucher, jours sans course, « Après une course, avant un cours »), Ta muscu habituelle, Emploi du temps, Montre, Santé (sommeil et fréquence cardiaque), Notifications, Compte, « Arrêter le programme », puis « Signaler un souci ». Heure préférée et « Après une course, avant un cours » portent « Nouveau » jusqu'au 6 décembre 2026. Tirer la page vers le bas relit l'emploi du temps.

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Courses par semaine, jours sans course, sortie longue, pas avant, pas après, heure de coucher | Chaque réglage ouvre la même feuille : le choix (boutons ou jours à cocher), puis Enregistrer. Rien ne change avant Enregistrer. Sortie longue : plusieurs jours possibles (samedi et dimanche par défaut à l'onboarding) | La semaine en cours et les suivantes sont réorganisées en un seul changement ; la sortie longue va sur le plus libre des jours cochés. Bandeau « Reggie a réorganisé ta semaine » avec Annuler, qui rend exactement la semaine d'avant. Le bandeau ne compte pas de courses déplacées : les durées et les types changent aussi |
| Heure préférée (« Automatique · vers 18:00 » tant qu'elle n'en choisit pas) | Feuille : le champ d'heure natif, ouvert sur son heure habituelle (lue sur ses courses Garmin, sinon 18:00) comme suggestion ; la ligne dit « Automatique · vers 18:00 » tant qu'elle ne l'a pas changée, jamais « 18:00 » seul comme une heure réglée : Enregistrer attend qu'elle la change, « Reggie place tes courses autour de cette heure quand c'est possible. », Enregistrer ; « Revenir à l'automatique » quand une heure est choisie | Même changement que les autres réglages, avec Annuler. Sans heure choisie, l'algo prend son heure habituelle (algo.md S7) |
| Après une course, avant un cours | Feuille : « Combien de temps te faut-il entre la fin d'une course et le début d'un cours ? », une durée (champ natif, 2 h au plus), « Pour te doucher, te changer et y aller. Tes courses finissent assez tôt pour ça. », Enregistrer | Ses courses finissent au moins ce temps avant un cours ou tout autre créneau de son agenda (algo.md H1). 30 min pour un nouveau profil. Même changement, avec Annuler |
| Séance de muscu | Feuille « Séance de muscu » | Comme plus haut |
| Emploi du temps, Actualiser | Relit l'emploi du temps | Comme dans Semaine |
| Montre Garmin | Fiche : modèle, dernière synchro, « Reconnecter » | Reconnecter relance la connexion Garmin |
| Sommeil et fréquence cardiaque | Interrupteur | Désactivé : l'algo n'utilise plus que le ressenti pour adapter les séances |
| Notifications | Réglages iOS de l'app | Rien ne change dans le plan |
| Face ID (Compte) | Ligne « Ajouter », seulement sur un appareil qui sait garder une clé d'accès | Ajoute la clé de ce téléphone : la prochaine connexion se fait d'un regard. Bandeau « Face ID est prêt : rien à taper la prochaine fois. » |
| Se déconnecter (Compte) | Alerte « Te déconnecter ? » avec « Se déconnecter » et Annuler | La session de ce téléphone se ferme sur le serveur ; l'écran de connexion revient. Les autres appareils restent connectés |
| Arrêter le programme (sous Compte, avec la note « Tu passes en mode entretien : 2 à 3 courses par semaine, dont une un peu plus rythmée. ») | Alerte de confirmation « Arrêter ton plan semi-marathon ? », avec « Arrêter le programme » et Annuler | Passe en mode entretien : 2 à 3 courses par semaine, dont une un peu plus rythmée (une séance de qualité) |
| Signaler un souci (tout en bas) | Champ facultatif, bouton d'envoi dedans à droite | Ses 50 derniers gestes (écrans, boutons touchés, appels au serveur) partent au journal des incidents avec sa phrase, même vide. Rien ne change dans le plan. Bandeau « Merci, c'est envoyé. » ; hors ligne, « Merci. Il partira dès que tu auras du réseau. » et l'envoi part au retour du réseau |

## Reggie (la conversation)

### Ce qu'il peut faire

Répondre à une question, expliquer une séance, et modifier le plan, mais seulement par les mêmes actions que les boutons : Déplacer, Changer, Pas dispo, réglages. Il ne crée jamais une séance hors des règles de l'algo.

### L'historique

L'écran montre la discussion du jour. Au-dessus, un lien discret « Voir la discussion d'hier » (puis « Voir la discussion du 13 novembre » pour un jour plus ancien) charge un seul jour à la fois, le plus récent d'abord, et le place au-dessus sans faire sauter la lecture. Dès qu'un jour plus ancien est affiché, chaque jour a son intertitre (« Vendredi 13 novembre », « Hier », « Aujourd'hui »). Le lien disparaît quand il n'y a plus rien avant. Reggie, lui, garde en mémoire les 20 derniers messages, quel que soit le jour.

### Le clavier

Pendant la saisie, la barre d'onglets s'efface et le champ se pose juste au-dessus du clavier dès qu'il s'ouvre, comme dans Messages ; les messages restent visibles au-dessus. Quand la conversation défile, le champ et les raccourcis ne bougent pas et ne passent jamais derrière le clavier. Toucher un raccourci ou « Envoyer » agit du premier coup et laisse le clavier ouvert. Le dernier message repose toujours au-dessus des raccourcis et du champ : la conversation le ramène en vue à chaque nouveau message, sauf quand Anna lit plus haut. Tout en bas, l'espace sous le dernier message est exactement celui du champ, des raccourcis et de la barre d'onglets (plus l'écart habituel entre deux messages) : jamais de vide en plus.

### Les widgets dans la conversation

Reggie répond avec du texte court et, quand il faut agir, avec des widgets tapables :

| Widget | Quand | Comportement |
|---|---|---|
| Boutons de réponse | Une question fermée (« Tu as de la fièvre ? ») | 2 à 5 boutons. Le tap envoie la réponse comme un message et désactive les autres boutons |
| Curseur 0 à 10 | Niveau de douleur ou de fatigue | Glisser puis « Envoyer » |
| Créneaux | Proposition de déplacement | 3 cartes de créneaux, tap = choix, puis la carte de changement apparaît |
| Aperçu de séance | Proposition de remplacement | Mini carte (nom, durée, allure) avec « Prendre celle-ci » |
| Carte de changement | Après toute modification | Liste avant et après par jour, « Montre mise à jour », bouton Annuler (actif jusqu'au changement suivant) |
| Raccourcis au-dessus du champ | Toujours | « Je suis malade », « Plus court », « Décaler à demain », « Pourquoi cette allure ? ». Ils lancent les mêmes parcours que les boutons de l'écran Aujourd'hui |

### Quand Reggie ne peut pas répondre

Tous ses comptes à leur limite, une erreur, ou rien reçu pendant 90 s : à la place des raccourcis, le champ affiche « Reggie ne peut pas répondre pour l'instant, réessaie dans un moment. » avec « Réessayer ». Son message reste dans la conversation, une seule fois : « Réessayer » le renvoie, et un nouveau message (le même ou « ? ») prend sa place au lieu de s'ajouter. Le serveur ne garde son message qu'avec la réponse de Reggie, sauf si Reggie avait déjà agi (une séance déplacée) : rien n'est enregistré en double. Chaque échec va au journal des incidents. Si Reggie est éteint sur le serveur, ou si le message est refusé, Reggie le dit dans une bulle, sans « Réessayer ».

### Questions de santé ou d'entraînement

Pour une question comme « j'ai mal au tibia, c'est grave ? » ou « je mange quoi avant un semi ? », Reggie répond d'abord avec ce qu'il sait. S'il lui faut une source, il fait au plus 2 recherches sur une liste fermée de sites médicaux et sportifs reconnus, affiche « Je vérifie » pendant ce temps, puis répond en 2 ou 3 phrases avec le lien de la source. Il ne pose jamais de diagnostic.

### Ton

Tutoiement, phrases courtes, pas de point d'exclamation en série, pas d'emoji. Il dit ce qu'il a fait et pourquoi en une phrase. Il oriente vers un professionnel dès qu'une douleur dure ou dépasse 4 sur 10.

## Connexion

Écran « Connecte-toi », affiché dès que le serveur répond sans session (le ciel, le logo, puis les actions). Le nom du déverrouillage suit l'appareil : Face ID sur iPhone, Touch ID sur Mac et iPad, « ton empreinte » ailleurs.

| Élément | Effet |
|---|---|
| « Se connecter avec Face ID » (bouton principal, absent si le navigateur n'a pas WebAuthn) | Ouvre Face ID sur les clés d'accès du site, sans rien taper. Réussi : l'app se recharge, connectée. Fenêtre fermée : rien ne s'affiche. Clé refusée ou inconnue : message en haut, le mot de passe reste possible |
| Champ Identifiant | Là où le navigateur le permet, propose aussi la clé d'accès dans ses suggestions ; la choisir connecte comme le bouton |
| « Se connecter » (identifiant et mot de passe, actif quand les deux sont remplis) | Réussi : écran « Tu es connectée » si l'appareil a Face ID, sinon l'app directement. Raté : « Identifiant ou mot de passe incorrect. » ; après 5 ratés depuis une même adresse, mots de passe bloqués 15 min pour cette adresse (Face ID et le lien restent possibles) |

Écran « Tu es connectée » (`/face-id`), après un mot de passe ou un lien de connexion fait pour un compte :

| Élément | Effet |
|---|---|
| « Utiliser Face ID » | Enregistre la clé d'accès de l'appareil, puis Aujourd'hui. Fenêtre fermée, ou clé déjà présente : Aujourd'hui sans message. Échec : message, les deux boutons restent |
| « Plus tard » | Aujourd'hui, sans clé. L'offre revient à la prochaine connexion par mot de passe |

## Animations

Toutes respectent « Réduire les animations » d'iOS : dans ce cas, simples fondus de 150 ms.

| Moment | Animation |
|---|---|
| Ouverture de l'app (lancement à froid) | Sur le ciel vide de l'aube (le même que l'écran de démarrage d'iOS, et que la couleur de fond d'Android), le dossard 14 arrive de la gauche en sprint, penché, s'écrase un peu en freinant ; le « 14 » surgit, un halo corail doux s'en échappe, les quatre épingles apparaissent une à une, « ANNARRIVÉ » monte en fondu, l'écran tremble à peine (environ 1,35 s). Puis le dossard rejoint le premier élément d'Aujourd'hui, mesuré à cet instant : un jour de course, il s'étire jusqu'à la carte de séance et s'efface pendant qu'elle apparaît ; un jour de repos, il s'arrondit et se pose exactement sur la lune ; sinon (chargement, erreur, autre écran), il se fond dans le ciel. Le tout dure 2 s au plus, pendant que l'app se dessine dessous. Un toucher ou une touche la coupe aussitôt, et ce toucher atteint ce qu'il y a dessous. Rien ne se joue au retour de l'arrière-plan, après « Recharger » d'une nouvelle version, ni pour une page ouverte en arrière-plan. Avec « Réduire les animations », aucune animation : l'app s'affiche directement |
| Appui sur un bouton | Réduction à 96 % pendant l'appui, retour en 120 ms |
| Ouverture d'une feuille | Monte du bas avec un ressort sans rebond (environ 350 ms). L'écran derrière ne bouge pas : il s'assombrit légèrement, en suivant la feuille image par image : à l'ouverture, pendant qu'on la tire, à la fermeture (bouton, glissement, tap à côté, retour Android), sans à-coup. La feuille se ferme en la tirant vers le bas, par sa poignée ou depuis n'importe où dans son contenu quand celui-ci est en haut (un contenu défilé remonte d'abord). Tant qu'elle bouge, elle ne floute pas (givre opaque) ; son verre revient en fondu (150 ms) une fois posée. La page derrière garde son verre tel quel : rien n'y clignote à l'ouverture ni à la fermeture. Sur écran tactile, la feuille est opaque et les cartes gardent leur teinte sans flou en direct |
| Feuille ouverte depuis une autre, ou étape suivante d'une feuille (Ajouter puis Placer, les questions de Pas dispo) | Elle prend la place de la première dans la même feuille, comme une pile de navigation iOS : le nouveau contenu entre par la droite en apparaissant pendant que l'ancien glisse d'un tiers vers la gauche en s'effaçant ; le titre se fond sur place et « Retour » apparaît en haut à gauche ; la hauteur de la feuille passe de l'une à l'autre (400 ms, ressort sans rebond), le pied de la feuille restant en bas. « Retour » joue le chemin inverse (l'ancien contenu revient de la gauche, l'autre part vers la droite) et ramène la première telle qu'on l'a laissée, défilement compris. Un Retour pendant le mouvement repart d'où tout se trouve, sans saut. Rien ne floute pendant le mouvement (givre), le verre revient une fois posé. Avec « Réduire les animations », simple fondu de 150 ms. Tirer vers le bas, toucher à côté ou Échap ferment tout. Le retour Android revient d'une feuille à la fois, avec la même animation |
| Changement d'onglet | Le nouvel écran s'ouvre en haut de page ; seul le retour du navigateur retrouve la position laissée |
| Onglet déjà ouvert | Le toucher ramène l'écran à son point de départ en défilant doucement (d'un coup avec « Réduire les animations »), comme sur iOS : Aujourd'hui et Programme en haut de la page, Semaine à la semaine en cours et en haut, Reggie à son dernier message (là où la conversation s'ouvre) |
| Déplier les étapes | La hauteur s'ouvre et les lignes apparaissent en fondu, 250 ms |
| Glisser une séance | Soulèvement (102 %, ombre plus forte) avec vibration légère. Au lâcher, ressort avec un petit rebond vers le nouveau créneau |
| Séance modifiée | La carte se retourne en fondu vers son nouveau contenu, les chiffres d'allure défilent vers leur nouvelle valeur |
| Une carte d'Aujourd'hui arrive ou part (« Tu l'as faite ? », ressenti, proposition, repos...) | Celle qui part s'efface en rétrécissant à 97 % (180 ms), celle qui arrive monte de 8 px en fondu (220 ms), les autres referment l'espace avec un ressort sans rebond. Rien au premier affichage |
| La semaine change (adaptation, cours annulé, déplacement, Annuler) | Les lignes glissent vers leur nouvelle place (ressort sans rebond, 450 ms) ; celles qui ont changé s'éclairent deux fois du bleu pâle des actions. Réduit : un seul éclairage de 300 ms, sans glissement |
| Frise de la semaine | Les barres passent de l'ancienne charge à la nouvelle (350 ms) ; le jour où une séance arrive fait un petit pouls (108 %, 300 ms). Rien au premier affichage |
| Bandeau Annuler | Monte de 12 px en fondu, repart seul après 6 s |
| Message de Reggie | Apparaît en fondu en montant de 8 px. Les widgets suivent 60 ms après le texte. Trois points animés pendant qu'il réfléchit, jusqu'à ses premiers mots ; sa réponse s'écrit ensuite au fur et à mesure. Une phrase écrite avant un outil n'est pas sa réponse : l'écran la garde pour lui, ou la retire si elle s'affichait déjà |
| Choix dans un widget | Le bouton choisi se remplit, les autres s'estompent |
| Choix dans une liste (carte de choix) | La carte cède légèrement sous le doigt et revient avec un ressort, la coche arrive avec un petit ressort |
| Changement d'onglet | Fondu croisé de 200 ms, la pastille de l'onglet actif glisse vers le nouvel onglet |
| Glisser vers un onglet voisin (Aujourd'hui, Programme, Reggie) | Ordre de la barre : Aujourd'hui, Semaine, Programme, Reggie. L'écran se penche vers le doigt (un quart de son déplacement) et pâlit un peu : il annonce le changement sans jamais laisser de vide à côté. Lâché au-delà d'un quart de la largeur (ou lancé), il glisse de son côté en s'effaçant (200 ms) et l'onglet voisin arrive de l'autre en fondu (260 ms) ; sinon il revient. L'écran voisin n'est pas dessiné pendant le geste : chaque onglet est une page entière avec ses lectures et ses éléments flottants (le champ de Reggie). Au bout de la barre (vers la droite sur Aujourd'hui, vers la gauche sur Reggie), l'écran cède à peine puis revient. Après un glissement, l'écran arrivé est exactement à sa place (rien ne défile de côté). Doigt seulement (pas la souris). Un défilement vertical, un appui long, une rangée qui défile de côté, un champ, un curseur, une feuille ouverte ou le tirage pour actualiser ne lancent jamais ce geste. Avec « Réduire les animations », l'onglet change d'un coup, rien ne glisse |
