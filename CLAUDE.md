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
- Direction « Ciel du matin » : un ciel d'aube doux derrière chaque écran, surfaces Apple iOS 26 Liquid Glass, police système (SF Pro), titres en gras. Clair, pastel, joyeux, jamais criard. Aucun noir.
- Palette de départ (tokens dans `apps/web/src/styles/tokens.css`) : ciel `#FDE7DA`, `#F3ECF6`, `#E6F1F8`, `#F7F9FB` ; texte `#23303D` ; actions `#3D6A9E` (bleu crépuscule) ; Reggie `#0B6B52` ; séances en pastel : intensité `#F29C7B`, facile `#7CC8A8`, sortie longue `#8DB3EA`, révision `#8FCFD6`. Une allure ne s'affiche jamais en rouge ou en orange.
- Un seul matériau : le verre dépoli pour les cartes, feuilles, widgets et listes (`Surface`), glisse pour les petits contrôles (boutons, pastilles, segmentés, onglets, champs, interrupteurs, curseurs), via `apps/web/src/ui/` uniquement.
- La couleur porte un sens (type de séance, aujourd'hui, action, Reggie, alerte) et fait ressortir ce qui compte. Pas de couleur décorative.
- Échelle de texte unique : titre de page 28, titre de section 20, texte 17, secondaire 15, légende 13, onglets 11. Une seule couleur de texte secondaire.
- Aucun tiret long ni demi-tiret dans les textes de l'interface : « 10:15 à 12:15 ».
- Les valeurs de couleur, d'espacement et de durée vivent dans des tokens, jamais en dur dans les composants.

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
