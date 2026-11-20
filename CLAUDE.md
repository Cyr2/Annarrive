# Annarrivé : instructions du projet

Coach de course à pied en PWA pour Anna (iPhone, Garmin vivoactive 4). L'app place ses séances autour de ses cours, les envoie sur sa montre et s'adapte à elle. Interface en français.

## À lire avant de coder

- `docs/specs/produit.md` : ce que fait l'app et pourquoi.
- `docs/specs/algo.md` : les règles de l'algo, avec leurs cas de test.
- `docs/specs/architecture.md` : stack, composants, tâches planifiées, plan de construction par étapes.
- `docs/interactions.md` : le comportement exact de chaque bouton, de Reggie et des animations. Aucun comportement n'est laissé au hasard : si un cas manque, le demander.
- `design/*.dc.html` : maquettes (canevas : https://claude.ai/artifact/EExsbz7FntTfBqaZFvjtA3). Elles fixent l'intention (contenu, hiérarchie, comportement), pas les pixels : le rendu vient du système de design de `apps/web/src/ui/`, et doit faire mieux que la maquette.
- `docs/audit/` : l'audit UI et ses captures.
- `research/` : la recherche sourcée derrière l'algo.

## Marque et style

- Nom : **Annarrivé**. Assistant : **Reggie** (nom fixe, aucune option pour le changer). Logo : le dossard 14 (sources et règles dans `design/logo/final/`), affiché par `LogoSlot`. Ne jamais le modifier sans Darius.
- Direction « Ciel du matin » : un ciel d'aube chaud et calme derrière chaque écran, surfaces Apple iOS 26 Liquid Glass, police Outfit (auto-hébergée, latin seul, un seul fichier variable), titres en gras, chiffres tabulaires pour les allures, durées et heures. Clair, vif, joyeux, jamais criard. Aucun noir.
- Palette (tokens dans `apps/web/src/styles/tokens.css`) : ciel `#FDEDE3`, `#FDF1EA`, `#FBF6F2`, `#F9F6F3` (abricot doux en haut, presque blanc chaud dessous) ; texte `#23303D` ; actions `#0967D6` (bleu vif, à la iOS) ; Reggie `#0B6B52` ; séances : intensité `#EE8A63`, facile `#5DBB92`, sortie longue `#6F9EE6`, révision `#5FBEC9`, muscu mauve `#8C7BB0` (texte `#4F4378`) ; unités d'enseignement des cours (pastille : fond, texte) : UE1 rose `#FBE9EE`, `#9A4458` ; UE2 olive `#EEF1DD`, `#55652A` ; UE3 bleu brume `#E4EFF3`, `#3B6476` ; UE4 ocre `#F8EEDB`, `#80601F`. Une allure ne s'affiche jamais en rouge ou en orange.
- La couleur porte un sens (type de séance, aujourd'hui, action, Reggie, alerte) et fait ressortir ce qui compte. Pas de couleur décorative.
- Échelle de texte unique : titre de page 28, titre de section 20, texte 17, secondaire 15, légende 13, onglets 11. Une seule couleur de texte secondaire.
- Aucun tiret long ni demi-tiret dans les textes de l'interface : « 10:15 à 12:15 ».
- Les valeurs de couleur, d'espacement et de durée vivent dans des tokens, jamais en dur dans les composants.

## Principes de design

Chaque règle vaut pour toute l'app : écrans, feuilles, widgets, onboarding, pages de connexion du serveur, toasts, états vides.

- **Matière, en deux couches (guide Apple)** : la couche fonctionnelle est en Liquid Glass complet (glisse, réfraction, liseré lumineux) : boutons, actions rondes, barre d'onglets, segmentés, pastilles, champs et composeur, poignée et en-tête des feuilles, éléments flottants, toasts. Ce verre est clair, à la iOS 26 : un remplissage blanc léger (40 à 50 %), le flou fait le reste ; jamais un fond blanc presque opaque, sur téléphone non plus (seul un navigateur sans flou a droit au givre dense). La réfraction reste là où elle ne coûte rien (ordinateur) ; sur téléphone, le liseré lumineux et l'ombre la remplacent. Le contenu (carte de séance, mot de Reggie, blocs de la semaine, cartes du Programme, widgets, bulles) est un verre `Surface` : 32 % de blanc, flou fort et saturé pour que les couleurs du ciel le teintent, liseré lumineux de 1 px en dégradé, reflet de lumière en haut à gauche et ombre douce. Une feuille est à 84 % avec ses groupes à 50 % et le même liseré ; le voile derrière est léger (13 %) et la page derrière ne bouge pas (la faire reculer coûtait des images sur téléphone) : seule la feuille monte, à 60 images par seconde. Tant qu'elle bouge (montée, tirage, fermeture), plus rien ne floute : la feuille est un givre opaque de la teinte de son verre au repos, ses contrôles et la page derrière perdent aussi leur flou (sous la feuille et le voile qui changent à chaque image, chaque verre était recalculé à chaque image, ce que le processeur graphique d'un téléphone ne tient pas) ; le verre revient une fois la feuille posée, en fondu de 150 ms pour elle. Une carte doit se lire comme du verre, pas comme une carte blanche ; ses textes restent à 4,5:1 mesurés sur les pixels rendus. Pas de réfraction sur le contenu. Le tout via `ui/` uniquement. Si le verre coûte en performance au premier écran, le givre moins cher l'emporte sur les cartes.
- **Écran tactile** : le verre de contenu garde sa teinte, son liseré et son reflet mais pas de flou en direct, et une feuille y est opaque ; seul le verre flottant (barre d'onglets, toasts, champ de Reggie) garde son flou. Une feuille qui monte ou descend ne change jamais le verre de la page derrière (le basculer faisait clignoter cartes et barre d'onglets sur Android), et la feuille comme son voile restent sur leur propre couche (`will-change`) tant qu'ils sont là.
- **Actions des feuilles** : les boutons qui agissent sont épinglés dans le pied de la feuille (`footer` de `Sheet`), jamais au bout du défilement.
- **Glisser entre onglets** : sur Aujourd'hui, Programme et Reggie, un glissement de côté mène à l'onglet voisin et l'écran suit le doigt. Semaine garde son glissement pour changer de semaine, sans geste de bord (le retour d'Android occupe les deux bords).
- **Onglet touché à nouveau** : comme sur iOS, toucher l'onglet déjà ouvert ramène son écran à son point de départ, en défilant doucement : en haut de la page, et sur Semaine à la semaine en cours ; Reggie revient à son dernier message, là où la conversation s'ouvre. Tout nouvel écran à sous-état (semaine, page, vue) suit la même règle (`useTabRoot`).
- **Navigation dans une feuille** : une seule feuille à l'écran (guide Apple). Ce qui s'ouvre depuis une feuille (Déplacer depuis le détail, Muscu depuis Ajouter) ou l'étape suivante d'un parcours se pousse dans la même feuille, comme une pile de navigation iOS : le nouveau contenu entre par la droite pendant que l'ancien glisse d'un tiers vers la gauche en s'effaçant, « Retour » joue le chemin inverse, le titre se fond sur place et la hauteur suit au même rythme que la montée de la feuille (400 ms, ressort sans rebond), sans à-coup. Interruptible (un Retour en route repart d'où tout se trouve), givre pendant le mouvement, simple fondu avec « Réduire les animations ». Une étape d'une feuille donne son `step` à `Sheet`.
- **Toast** : une pastille de verre centrée au-dessus de la barre d'onglets, à portée du pouce pour « Annuler », plus dense que le reste du verre (le texte se lit sur n'importe quoi), avec un filet et une ombre profonde qui la détachent des cartes blanches.
- **Fond** : un ciel chaud mais calme (`Sky`) derrière tout, y compris les feuilles, l'onboarding et les pages de connexion : un voile abricot doux en haut qui passe vite à un blanc chaud, et deux champs froids très pâles sous le contenu (pervenche à droite, menthe en bas à gauche) pour que le verre ait quelque chose à montrer. Saturation et contraste bas, aucun soleil orange ni point chaud, rien derrière un texte ne lui fait concurrence ; le bleu d'action y reste à 4,5:1 partout. Il ne bouge pas, pour que le flou reste léger.
- **Vérifier le verre** : WebKit sous Windows et le Chromium « headless shell » de Playwright n'affichent pas le flou. Les captures se font dans Chromium complet (`channel: "chromium"`), émulation Pixel 7 et 320 px.
- **Carte de séance** : un halo d'angle, pas un dégradé de haut en bas. La couleur du type de séance (intensité corail, facile vert, sortie longue bleu...) rayonne du coin haut droit et s'éteint vers 60 % de la carte ; le reste est la surface de contenu normale, pour que les grands chiffres restent au calme. Même règle pour toute carte de la même famille (détail de séance, après la course).
- **Lumière** : une lueur douce sous ce qui compte (action principale, Reggie, aujourd'hui), jamais pour décorer. Reggie est vert et lumineux partout où il apparaît.
- **Couleur** : des couleurs nettes, jamais délavées, pour chaque pastille, état et graphique. Les éléments d'une journée (Semaine, Ma journée, frise) ont des couleurs douces et harmonieuses, et chaque sorte se reconnaît d'abord à son style, ensuite à sa couleur : une course est du verre avec la couleur de son type en halo d'angle et une pastille ronde pleine avec le coureur, à côté de l'allure ; la muscu un filet mauve fin et son haltère ; la révision son livre turquoise ; un cours une pastille de son UE (rien sans UE). Dans la frise : une barre par course, un anneau mauve pour la muscu, un point de la couleur de l'UE pour les cours. Jamais d'aplat vif dans une liste. Tout texte à 4,5:1 au moins, jours passés compris. Aucun noir. Le bleu d'action sert à toutes les actions, liens et sélections.
- **Sélection** : légère, à la Apple : teinte claire, contour fin et coche. Jamais un remplissage sombre. Un seul traitement, `ChoiceCard` (et `Chip` pour les pastilles), dans toute liste de choix.
- **Statut** : « Connectée », « À jour », « Atteignable » prennent le vert `--color-ok`, jamais le vert d'une séance facile.
- **Titres** : deux rôles seulement, `SectionTitle` (20, gras) pour une section d'écran et `GroupLabel` (légende) au-dessus d'un groupe. La frise de la semaine est un seul composant, `WeekStrip`, sans légende.
- **Champs** : un champ qui s'envoie porte son bouton d'envoi à l'intérieur, à droite.
- **Pas de répétition** : une information n'est dite qu'une fois par écran. Pas de titre de page qui répète l'onglet actif (l'onglet dit déjà où l'on est : la page commence par son premier contenu utile, comme la plage de la semaine ; le titre reste pour VoiceOver seulement). Pas de titre repris en sous-titre, pas de pastille qui répète un mot du titre (« Footing facile » n'a pas de pastille « Facile »), pas de récapitulatif qui redit la carte choisie. Au Programme, la carte de l'objectif donne la semaine (« Semaine 4 sur 12 ») et la frise seule nomme la phase.
- **Affordance** : ce qui se touche en a l'air (chevron, bouton) ; ce qui informe n'a pas l'air d'un bouton.
- **Visuels** : profil de séance, barres de phase, blocs de la semaine et progressions sont soignés (dégradés, bouts arrondis), jamais de simples rectangles.
- **Pas de rail** : aucune barre d'accent sur le côté d'une carte ou d'une ligne. Les composants Apple natifs à la place : listes groupées, carte en verre avec icône, pastille de couleur.
- **Saisie de nombres** : de simples cases avec le pavé numérique (h, min), jamais de roues maison. Pas de fausse séance d'exemple à l'accueil.
- **Un composant par sorte de valeur**, partout (tableau dans `apps/web/src/ui/README.md`) : une durée (séance, révision, chrono) en cases « h » et « min » (`TimeBoxes`), valeur libre ; une heure du jour avec le champ d'heure (`RowInput type="time"`) ; une date avec `RowInput type="date"` ; un ou plusieurs jours de la semaine en puces (`DayChips`) ; un choix parmi quelques valeurs nommées en puces dans une feuille et en `ChoiceCard` quand le choix est la question d'un écran (onboarding) ; 2 à 4 modes ou nombres courts en `SegmentedControl` ; une liste longue (répétition, « Quand ») en `RowSelect` ; un niveau sur 10 en `Slider`. Jamais une liste à pas fixes pour une durée ou une heure.
- **Rien ne décale la page** : un état (autre semaine, sélection, chargement) change ce qui est déjà là au lieu d'ajouter un élément qui pousse le reste. Retour à la semaine en cours : la plage de dates elle-même, pas une pastille de plus.
- **Étapes d'une séance** : un seul composant, `StepList`, avec les mêmes marges partout ; ses lignes s'alignent sur le texte du bloc qui la contient et « Répéter n fois » est un groupe teinté dont le retrait intérieur décale les lignes répétées.

## Skills à utiliser

- `ponytail` (actif) : la plus petite modification qui résout tout le problème.
- `frontend-design` (dans `.agents/skills/`) : avant tout nouvel écran ou changement visuel.
- `composition-patterns`, `react-best-practices` : architecture et performance des composants React.
- `web-design-guidelines` : audit avant chaque livraison d'écran, avec des captures à 390 et 320 px regardées une à une.
- `mobile-native` : tout ce qui touche à l'iPhone (zones sûres, 100vh, zoom des champs, état de survol).
- `apple-design`, `animate`, `gestures`, `emil-design-eng` : animations, feuilles, glisser-déposer, finition.
- `review-animations`, `animation-performance`, `break-ui` : avant de livrer un écran.
- `ui-ux-pro-max` : règles d'accessibilité et checklist avant livraison.
- `stop-slop` : tout texte de l'interface et tout message de Reggie.
- `security-review` : avant la mise en ligne.
- Ne pas utiliser `unslop` (son style a été rejeté), ni les skills natifs (`animate-expo`, `write-swift`, `liquid-glass`).

## Règles de développement

### Principes

- Logique pure d'abord : toute règle d'entraînement vit dans `packages/coach`, sans E/S, testée à fond. Le serveur et l'écran ne font qu'appliquer.
- Reggie n'invente jamais une séance : il appelle les mêmes actions que les boutons, et `packages/coach` refuse ce qui casse une règle.
- Couches du serveur : routes (validation zod) → services → stockage. Une route ne touche jamais la base.
- Couches de l'écran : `ui/` (présentation pure) → `features/<écran>/` → `api/`. L'app n'importe jamais `glisse` directement, seulement via `ui/`.
- Toute modification de plan passe par le journal des changements, pour que Annuler fonctionne toujours.
- Fonctions courtes, une responsabilité. Pas de code « au cas où ». Commenter le pourquoi, jamais le quoi.
- Nommage en anglais dans le code, textes de l'interface en français.

### TypeScript et Python

- TypeScript `strict` et `noUncheckedIndexedAccess`. Pas de `any`, pas de `!`, pas de `as` sauf juste après une validation zod ou dans un test.
- Toute donnée extérieure (réseau, ICS, Garmin, localStorage, base) est validée par zod avant usage.
- Le bridge Python reste minuscule : typé, testé, aucune logique d'entraînement dedans.

### Tests

- Toute règle de l'algo a ses tests, repris des tableaux de `docs/specs/algo.md`.
- Un bug corrigé commence par un test qui le reproduit.
- Couverture minimale : `packages/coach` 90 % des lignes et 85 % des branches, `apps/server` 80 % et 75 %. On ne baisse jamais un seuil.

### Interface

- Cibles d'au moins 44 px, contraste 4,5:1, focus visible, `prefers-reduced-motion` et `prefers-reduced-transparency` respectés, libellés sur les boutons-icônes.
- Lighthouse mobile d'au moins 95 dans chaque catégorie, vérifié en CI.
- Un seul fichier JS pour le premier écran, le reste chargé à la demande.

### Secrets

- Jamais de secret dans le code, les commits, les logs ou la conversation. Ils vivent dans `.env` (jamais commité) et dans les variables Coolify. `.env.example` liste les noms, sans valeurs.

### Git et PR

- Jamais de commit direct sur `main`. Une branche et une PR par sujet, petite et cohérente.
- Messages de commit et titres de PR en français, au présent, qui disent ce que ça change.
- **Aucune mention de Claude** dans les commits, les PR ou leurs descriptions : pas de ligne `Co-Authored-By`, pas de « Generated with ».
- La CI doit être verte avant fusion.
