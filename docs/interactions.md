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

## Aujourd'hui

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Puce « Semi · J-62 » | Ouvre l'onglet Programme | Rien ne change |
| Carte de la séance | Ouvre le détail de la séance (étapes, allures, pourquoi cette séance) | Rien ne change |
| Voir les étapes | Déplie les étapes dans la carte. Absent quand la séance n'a qu'une étape | Rien ne change. Deuxième tap = replie |
| Carte « Tu l'as faite ? » | Apparaît quand une séance de la semaine est finie sans course reçue de la montre. « Oui, je l'ai faite » ou « Non, je l'ai sautée » | Oui : séance faite. Non : séance passée, jamais rattrapée. Bandeau Annuler dans les deux cas |
| Ligne « Tu es enrhumée » (ou fièvre, douleur) et « Ça va mieux » | Reste en haut tant qu'un état Malade ou Douleur dure | « Ça va mieux » lance le retour, comme dans Pas dispo. Bandeau Annuler |
| **Reggie** | Ouvre la conversation, avec le contexte « À propos de : Fractionné, ce soir 18:00 » | Reggie sait de quelle séance on parle |
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
2. En dessous, « Choisir un autre moment » ouvre un choix de jour (7 puces) et d'heure. Les moments interdits sont grisés avec leur raison : « Moins de 24 h après ta séance jambes ».
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
| Malade | « Tu as de la fièvre ou ça touche la poitrine ? » Oui / Non | **Oui** : Reggie conseille le repos tant qu'il y a de la fièvre, sans rien bloquer. Si elle veut courir, la séance devient un footing en endurance fondamentale, court et tranquille. **Non** (rhume) : séances gardées en endurance fondamentale, pas de fractionné. Quand elle dit « Ça va mieux », endurance fondamentale encore 3 jours, puis retour normal |
| Douleur | « Où ? » (boutons : mollet, genou, cheville, hanche, pied, autre), puis « Combien sur 10 en marchant ? » (curseur 0 à 10) | **0 à 3** : footing en endurance fondamentale ou vélo, pas de fractionné. **4 et plus** : Reggie conseille le repos ou le vélo, sans bloquer. Si elle veut courir : 20 min tranquille, arrêt si ça monte. Conseil de voir un kiné ou un médecin si ça dure plus de 3 jours |
| Autre | Champ texte | Reggie répond dans la conversation |

2. Durée (sauf Malade) : « Juste aujourd'hui » ou « Jusqu'à… » (choix d'une date).
3. Une carte résume ce qui change sur la semaine, puis « Valider ». Bandeau Annuler.

## Après la course

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Carte « Fractionné fait » | Détail de l'activité (tours, allure par fraction, FC) | Rien ne change |
| Facile / Correct / Dur | Sélectionne le ressenti. N'apparaît que si la montre n'a rien enregistré | Enregistré pour l'algo. Trois « Dur » d'affilée sur des séances faciles déclenchent une vérification des allures |
| Champ « Un mot pour Reggie » et flèche | Envoie la note dans la conversation | Reggie répond en une ou deux lignes. Si la note signale une douleur, il lance les questions de « Douleur » |

## Semaine

| Élément | Geste | Ce qui se passe |
|---|---|---|
| Flèches gauche et droite | Tap | Semaine précédente ou suivante. Les semaines passées sont en lecture seule |
| La page | Glisser à gauche ou à droite | La semaine suit le doigt, et la suivante (ou la précédente) est déjà dessinée à côté : elles glissent ensemble, jamais de vide (une semaine pas encore lue montre sa place). Lâchée au-delà d'un quart de la largeur (ou lancée), la voisine se pose avec un ressort et devient la semaine affichée ; sinon tout revient, rien n'est relu. Avec « Réduire les animations », la semaine change d'un coup. Un glissement vertical reste un défilement, un appui long reste le déplacement d'une séance |
| Actualiser | Tap | Relit l'emploi du temps tout de suite. Si un cours change, une ligne apparaît : « 1 cours annulé jeudi · Footing passé à vendredi 18:00 ». Une relecture automatique qui change quelque chose laisse la même ligne jusqu'au soir |
| La page, tout en haut | Tirer vers le bas | Même lecture qu'Actualiser, aussi sur Aujourd'hui et Programme. Les flèches d'Actualiser descendent dans une pastille de verre en suivant la moitié du doigt et tournent avec lui ; au-delà de 64 px elles passent au bleu, et lâcher lance la lecture (les flèches tournent seules, la ligne dit « Lecture en cours… »), puis la pastille remonte. En deçà, elle remonte sans rien lire. Jamais sous une feuille ; un glissement de côté ou un appui long n'est pas un tirage. Une seule lecture à la fois |
| Course, muscu, révision | Appui long (0,3 s) puis glisser | La séance se soulève (petite vibration). Les créneaux possibles s'entourent en pointillés, les jours interdits s'atténuent avec leur raison. Lâcher = déplacement, bandeau Annuler |
| Course, muscu, révision | Tap | Course : détail. Muscu ou révision : feuille de modification |
| Cours (emploi du temps) | Tap | Fiche du cours, lecture seule, avec « Ce cours n'a pas lieu ». Les cours ne se glissent pas (cadenas) |
| **+** | Tap | Feuille « Ajouter » |

### Feuille « Ajouter »

- **Muscu** : la liste de ses séances enregistrées.
  - **Placer** ouvre jour et heure (pré-remplis sur son habitude), puis « Ajouter ».
  - Tap sur la ligne : modifier la séance.
  - « Nouvelle séance de muscu » : nom, case jambes, jour, heure, durée, répétition.
- **Révision** : durée en boutons (1 h, 1 h 30, 2 h), jour, heure, répétition.
- **Indispo** : un titre facultatif (« Soirée chez Léa »), jour, heure de début et de fin. L'app ne place rien dessus.

Après ajout, si une course entre en conflit, Reggie la déplace, même si elle est ce soir, et le bandeau dit laquelle et pourquoi : « Muscu ajoutée · Sortie longue passée à dimanche 19:00 : moins de 24 h après ta séance jambes ». Une muscu n'est « jambes » que si l'interrupteur est activé.

### Feuille « Séance de muscu »

- Nom, « Travaille les jambes » (interrupteur), jour, heure, durée, répéter (jamais, chaque semaine, toutes les deux semaines).
- OK enregistre. Annuler ferme sans rien changer.
- Supprimer la séance demande une confirmation : « Supprimer Jambes ? Cette semaine et les suivantes » ou « Cette semaine seulement ».

## Programme

| Élément | Au tap | Ce qui se passe |
|---|---|---|
| Pastille « Ambitieux » ou « Atteignable » (carte de l'objectif) | Une petite bulle explique le verdict en mots simples : son niveau aujourd'hui (temps prédit sur la course), le gain que sa cible demande sur les semaines d'entraînement du plan, et le gain habituel sur cette durée. Jamais un chrono proposé (algo.md P20). « OK » ou un tap à côté la ferme | « En parler avec Reggie » ouvre Reggie, à propos de l'objectif, et envoie « Pourquoi mon objectif est ambitieux ? Qu'est-ce que je peux faire ? » (ou « Mon objectif est atteignable : comment je m'y prends ? »). Pendant l'onboarding, la pastille informe seulement : elle n'a pas de chevron |
| Modifier l'objectif | Reprend les écrans de création du programme, pré-remplis, avec l'heure de départ de la course | Avant validation, un résumé montre ce qui change (« 2 semaines de plus, chrono visé atteignable »). Les semaines à venir sont recalculées, la semaine en cours garde ce qu'Anna a déjà déplacé. Une course dans les 7 jours, nouvelle ou retirée, refait aussi ce qui reste de la semaine en cours (algo.md EV20) ; le résumé le dit : « Ta semaine devient une semaine de course : rien de dur dans les 3 jours avant. » |
| Courses par semaine, jours sans course, pas avant, pas après, heure de coucher | Choix en feuille (roue ou boutons) | La semaine en cours et les suivantes sont réorganisées. Bandeau « Reggie a réorganisé ta semaine · Voir » |
| Sortie longue le | Liste des jours (dimanche par défaut) | Les séances automatiques à venir sont refaites, la sortie longue passe à ce jour quand il est libre. Bandeau Annuler |
| Séance de muscu | Feuille « Séance de muscu » | Comme plus haut |
| Emploi du temps, Actualiser | Relit l'emploi du temps | Comme dans Semaine |
| Montre Garmin | Fiche : modèle, dernière synchro, « Reconnecter » | Reconnecter relance la connexion Garmin |
| Sommeil et fréquence cardiaque | Interrupteur | Désactivé : l'algo n'utilise plus que le ressenti pour adapter les séances |
| Cycle menstruel | Interrupteur | Activé : explication et accord demandés d'abord. L'app ne change jamais les séances selon la phase du cycle. Seuls les symptômes qu'Anna signale comptent |
| Notifications | Réglages iOS de l'app | Rien ne change dans le plan |
| Arrêter ce programme | Confirmation « Arrêter le programme Semi-marathon ? » | Passe en mode entretien : 2 à 3 courses faciles par semaine, une séance de qualité |
| Signaler un souci (tout en bas) | Champ facultatif, bouton d'envoi dedans à droite | Ses 50 derniers gestes (écrans, boutons touchés, appels au serveur) partent au journal des incidents avec sa phrase, même vide. Rien ne change dans le plan. Bandeau « Merci, c'est envoyé. » ; hors ligne, « Merci. Il partira dès que tu auras du réseau. » et l'envoi part au retour du réseau |

## Reggie (la conversation)

### Ce qu'il peut faire

Répondre à une question, expliquer une séance, et modifier le plan, mais seulement par les mêmes actions que les boutons : Déplacer, Changer, Pas dispo, réglages. Il ne crée jamais une séance hors des règles de l'algo.

### L'historique

L'écran montre la discussion du jour. Au-dessus, un lien discret « Voir la discussion d'hier » (puis « Voir la discussion du 13 novembre » pour un jour plus ancien) charge un seul jour à la fois, le plus récent d'abord, et le place au-dessus sans faire sauter la lecture. Dès qu'un jour plus ancien est affiché, chaque jour a son intertitre (« Vendredi 13 novembre », « Hier », « Aujourd'hui »). Le lien disparaît quand il n'y a plus rien avant. Reggie, lui, garde en mémoire les 20 derniers messages, quel que soit le jour.

### Le clavier

Pendant la saisie, la barre d'onglets s'efface et le champ se pose juste au-dessus du clavier, comme dans Messages ; les messages restent visibles au-dessus. Le dernier message repose toujours au-dessus des raccourcis et du champ : la conversation le ramène en vue à chaque nouveau message, sauf quand Anna lit plus haut.

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
| Appui sur un bouton | Réduction à 96 % pendant l'appui, retour en 120 ms |
| Ouverture d'une feuille | Monte du bas avec un ressort sans rebond (environ 350 ms). L'écran derrière recule légèrement et s'assombrit, en suivant la feuille image par image : à l'ouverture, pendant qu'on la tire, à la fermeture (bouton, glissement, tap à côté, retour Android), sans à-coup. La feuille se ferme en la tirant vers le bas, par sa poignée ou depuis n'importe où dans son contenu quand celui-ci est en haut (un contenu défilé remonte d'abord) |
| Feuille ouverte depuis une autre | Elle prend la place de la première. En haut à gauche, « Retour » ramène la première telle qu'on l'a laissée ; tirer vers le bas, toucher à côté ou Échap ferment tout. Le retour Android revient d'une feuille à la fois |
| Changement d'onglet | Le nouvel écran s'ouvre en haut de page ; seul le retour du navigateur retrouve la position laissée |
| Déplier les étapes | La hauteur s'ouvre et les lignes apparaissent en fondu, 250 ms |
| Glisser une séance | Soulèvement (102 %, ombre plus forte) avec vibration légère. Au lâcher, ressort avec un petit rebond vers le nouveau créneau |
| Séance modifiée | La carte se retourne en fondu vers son nouveau contenu, les chiffres d'allure défilent vers leur nouvelle valeur |
| Une carte d'Aujourd'hui arrive ou part (« Tu l'as faite ? », ressenti, proposition, repos...) | Celle qui part s'efface en rétrécissant à 97 % (180 ms), celle qui arrive monte de 8 px en fondu (220 ms), les autres referment l'espace avec un ressort sans rebond. Rien au premier affichage |
| La semaine change (adaptation, cours annulé, déplacement, Annuler) | Les lignes glissent vers leur nouvelle place (ressort sans rebond, 450 ms) ; celles qui ont changé s'éclairent deux fois du bleu pâle des actions. Réduit : un seul éclairage de 300 ms, sans glissement |
| Frise de la semaine | Les barres passent de l'ancienne charge à la nouvelle (350 ms) ; le jour où une séance arrive fait un petit pouls (108 %, 300 ms). Rien au premier affichage |
| Bandeau Annuler | Monte de 12 px en fondu, repart seul après 6 s |
| Message de Reggie | Apparaît en fondu en montant de 8 px. Les widgets suivent 60 ms après le texte. Trois points animés pendant qu'il réfléchit |
| Choix dans un widget | Le bouton choisi se remplit, les autres s'estompent |
| Choix dans une liste (carte de choix) | La carte cède légèrement sous le doigt et revient avec un ressort, la coche arrive avec un petit ressort |
| Changement d'onglet | Fondu croisé de 200 ms, la pastille de l'onglet actif glisse vers le nouvel onglet |
