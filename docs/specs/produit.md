# Annarrivé : spec produit

## En une phrase

Un coach de course à pied qui organise la semaine d'Anna autour de ses cours, place ses séances, les envoie sur sa montre et s'adapte à elle, sans lui demander de tout renseigner.

## Pour qui

- **Anna**, seule utilisatrice au départ. Coureuse loisir (semi autour de 1 h 50), Garmin vivoactive 4, iPhone sous iOS 26.6, étudiante dont l'emploi du temps change chaque semaine, 3 à 4 séances de muscu qu'elle gère elle-même, des révisions qu'elle place elle-même.
- L'app reste générique (aucune valeur d'Anna codée en dur) pour s'ouvrir à d'autres plus tard. Pas de multi-utilisateur pour l'instant.

## Principes

1. **Zéro charge mentale.** Anna ne saisit que ce que l'app ne peut pas deviner. Tout le reste vient de Garmin et de son emploi du temps.
2. **Un algo invisible et sourcé décide.** Règles déterministes issues de la recherche (`research/`, détail dans `docs/specs/algo.md`). L'IA ne fait qu'expliquer et déclencher les mêmes actions que les boutons.
3. **Stable.** Une seule décision automatique par jour, le matin. La séance du jour ne change plus ensuite, sauf si Anna agit. Pas de suradaptation.
4. **Anna garde la main.** Tout se déplace en un geste, tout se défait, et ce qu'elle change n'est jamais remis en cause.
5. **Simple et beau.** Style Apple iOS 26 Liquid Glass, clair, avec des animations douces.

## Ce que l'app fait

| Fonction | Détail |
|---|---|
| Programme | Une course, une date, un chrono visé (facultatif). Plan en phases (base, développement, spécifique, affûtage). Sans objectif : mode entretien |
| Séance du jour | Type, heure, durée, allure cible façon Garmin, étapes au tap, statut d'envoi sur la montre |
| Semaine | Course, muscu, révisions, cours et indispos. Glisser-déposer, ajout par le bouton + |
| Adaptation | Le matin selon sommeil, FC de repos, Body Battery, stress, ressenti (comparés à sa propre normale). Toujours dans le sens de l'allègement |
| Emploi du temps | Lien ICS de l'université relu régulièrement et comparé. Bouton Actualiser. Un cours peut être marqué « n'a pas lieu » |
| Montre | Chaque séance est envoyée dans le calendrier Garmin, donc sur la montre |
| Après la course | Résumé prévu contre réalisé. Ressenti demandé seulement si la montre ne l'a pas eu. Note libre pour Reggie |
| Reggie | Assistant IA (nom fixe). Conversation unique, ouverte avec le contexte de l'écran. Widgets tapables. Agit uniquement par les actions de l'app |
| Notifications | Seulement sur un événement : semaine prête, séance déplacée par l'app, invitation à commenter une course synchronisée |

Le comportement de chaque bouton est défini dans `docs/interactions.md`. Les maquettes validées sont dans `design/` (canevas en ligne : https://claude.ai/artifact/EExsbz7FntTfBqaZFvjtA3).

## Écrans

Barre d'onglets flottante : **Aujourd'hui**, **Semaine**, **Programme**, **Reggie**.

| Écran | Maquette |
|---|---|
| Aujourd'hui, jour de course | `design/Main.dc.html` |
| Aujourd'hui, repos | `design/Repos.dc.html` |
| Aujourd'hui, après la course | `design/Apres.dc.html` |
| Déplacer, Changer, Pas dispo (feuilles) | `design/Deplacer.dc.html`, `design/Changer.dc.html`, `design/PasDispo.dc.html` |
| Semaine, glisser une séance | `design/Semaine.dc.html` |
| Ajouter (bouton +), séance de muscu | `design/Ajouter.dc.html`, `design/Muscu.dc.html` |
| Programme : objectif, frise des phases, Ton niveau (dernière course, ce que dit la montre), progression | `design/Programme.dc.html`, puis la maquette validée le 21/11/2026 (section 1) |
| Réglages, page poussée depuis la roue de Programme ; feuille « Ta dernière course » | Maquette validée le 21/11/2026 (sections 2 et 3) |
| Reggie, conversation et widgets | `design/Assistant.dc.html`, `design/ReggieWidgets.dc.html` |
| Onboarding | Maquette validée (cinq questions) |

## Onboarding

Fait par Anna, une seule fois : un écran de bienvenue où Reggie se présente, cinq questions (une par écran, Continuer épinglé en bas), puis « Ta semaine est prête » qui montre ses courses des sept jours suivants et mène à Aujourd'hui. La partie technique (connexion Garmin, lien de l'emploi du temps, installation sur l'écran d'accueil) est préparée par Darius avant.

Ce qu'elle renseigne :

1. Ta course : distance, date, et son chrono visé, facultatif. C'est elle qui le choisit : l'app ne propose pas de chrono, elle indique seulement s'il est atteignable ou ambitieux, sans jamais décourager. Sans chrono, l'objectif est de finir. L'heure de départ prend 9:00.
2. Ta dernière course, facultative (« Je n'en ai pas ») : distance, temps et il y a combien de temps. Une seule course, la plus récente. Elle règle ses allures dès la première semaine, mieux que la VO2max de la montre.
3. Ta semaine : combien de courses par semaine, les jours possibles pour sa sortie longue (samedi et dimanche proposés), son heure préférée (automatique par défaut).
4. Tes journées : le lien de son emploi du temps s'il n'est pas déjà relié, son heure de coucher, et le temps qu'il lui faut entre la fin d'une course et un cours (30 min proposées).
5. Ta montre et tes accords : l'état de sa Garmin, sommeil et fréquence cardiaque, les notifications.

Le reste prend sa valeur par défaut et se règle dans Réglages : pas avant 7:00, pas après 21:30, aucun jour sans course, pas de muscu, aucune douleur signalée.

Le programme commence le lendemain : rien n'est placé le jour de l'onboarding.

Sa forme de départ est déduite de l'historique Garmin, tours compris (ses passages rapides comptent, pas seulement la VO2max de la montre), et de son dernier chrono. Une séance test entre la semaine 2 et la semaine 4 sert seulement si l'historique ne suffit pas.

## Hors périmètre

- Enregistrer les courses (la montre et Garmin le font).
- Détailler ou suivre la muscu (seulement un nom et la case jambes).
- Diagnostic médical. L'app oriente vers un professionnel.
- Adaptation automatique selon la phase du cycle.
- App native, App Store, Android.

## Questions encore ouvertes

Aucune pour l'instant.
