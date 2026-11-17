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

- Nom : **Annarrivé**. Assistant : **Reggie** (nom fixe, aucune option pour le changer). Le logo se choisit avec Darius : ne jamais en inventer un, garder un emplacement prévu.
- Direction « Ciel du matin » : un ciel d'aube chaud derrière chaque écran, surfaces Apple iOS 26 Liquid Glass, police système (SF Pro), titres en gras. Clair, vif, joyeux, jamais criard. Aucun noir.
- Palette (tokens dans `apps/web/src/styles/tokens.css`) : ciel chaud `#FDE7DA`, `#F8ECE8`, `#F3EFF3`, `#F5F3F6` avec un soleil orangé en haut ; texte `#23303D` ; actions `#0967D6` (bleu vif, à la iOS) ; Reggie `#0B6B52` ; séances : intensité `#EE8A63`, facile `#5DBB92`, sortie longue `#6F9EE6`, révision `#5FBEC9`. Une allure ne s'affiche jamais en rouge ou en orange.
- La couleur porte un sens (type de séance, aujourd'hui, action, Reggie, alerte) et fait ressortir ce qui compte. Pas de couleur décorative.
- Échelle de texte unique : titre de page 28, titre de section 20, texte 17, secondaire 15, légende 13, onglets 11. Une seule couleur de texte secondaire.
- Aucun tiret long ni demi-tiret dans les textes de l'interface : « 10:15 à 12:15 ».
- Les valeurs de couleur, d'espacement et de durée vivent dans des tokens, jamais en dur dans les composants.

## Principes de design

Chaque règle vaut pour toute l'app : écrans, feuilles, widgets, onboarding, pages de connexion du serveur, toasts, états vides.

- **Matière, en deux couches (guide Apple)** : la couche fonctionnelle est en Liquid Glass complet (glisse, réfraction, liseré lumineux) : boutons, actions rondes, barre d'onglets, segmentés, pastilles, champs et composeur, poignée et en-tête des feuilles, éléments flottants, toasts. Le contenu (carte de séance, mot de Reggie, blocs de la semaine, cartes du Programme, widgets, bulles) est un verre givré `Surface` : translucide, le ciel chaud le teinte, liseré clair et ombre douce, avec assez de blanc pour que chiffres et textes restent à 4,5:1 mesurés sur le vrai dégradé. Ni carte blanche opaque, ni réfraction sur le contenu. Le tout via `ui/` uniquement. Si le verre coûte en performance au premier écran, le givre moins cher l'emporte sur les cartes.
- **Fond** : le ciel d'aube chaud (`Sky`) derrière tout, y compris l'onboarding et les pages de connexion. Il ne bouge pas, pour que le flou reste léger.
- **Lumière** : une lueur douce sous ce qui compte (action principale, Reggie, aujourd'hui), jamais pour décorer. Reggie est vert et lumineux partout où il apparaît.
- **Couleur** : des couleurs nettes et vives, jamais délavées, pour chaque séance, pastille, état, graphique et bloc du calendrier. Tout texte à 4,5:1 au moins, jours passés compris. Aucun noir. Le bleu d'action sert à toutes les actions, liens et sélections.
- **Sélection** : légère, à la Apple : teinte claire, contour fin et coche. Jamais un remplissage sombre.
- **Champs** : un champ qui s'envoie porte son bouton d'envoi à l'intérieur, à droite.
- **Affordance** : ce qui se touche en a l'air (chevron, bouton) ; ce qui informe n'a pas l'air d'un bouton.
- **Visuels** : profil de séance, barres de phase, blocs de la semaine et progressions sont soignés (dégradés, bouts arrondis), jamais de simples rectangles.
- **Pas de rail** : aucune barre d'accent sur le côté d'une carte ou d'une ligne. Les composants Apple natifs à la place : listes groupées, carte en verre avec icône, pastille de couleur.
- **Saisie de nombres** : de simples cases avec le pavé numérique (h, min), jamais de roues maison. Pas de fausse séance d'exemple à l'accueil.

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
