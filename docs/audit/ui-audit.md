# Audit UI et UX d'Annarrivé (PWA iPhone)

Branche `audit/ui`, depuis `origin/main` du 17 novembre 2026. Captures à 390 × 844 (profil iPhone 15, WebKit Playwright, échelle 2), app construite (`pnpm build`) servie par `vite preview` avec le mock (`?mock`, `?mock=rest`, `?mock=done`, `?mock=light`, `?mock=worst`, `?mock&onboarding`). La page serveur de connexion est rendue à partir du HTML exact de `apps/server/src/app.ts` (`loginPage`). L'écran « déconnecté » est obtenu en répondant 401 à `/api/*`.

Référentiel : priorités de `ui-ux-pro-max` (accessibilité, toucher, mise en page, typo et couleur, animation, formulaires, navigation) et sa checklist `pro-rules.md`, Apple HIG et iOS 26 Liquid Glass (`apple-design`), `mobile-native`, `emil-design-eng`, `docs/interactions.md`, et la nouvelle direction « Ciel du matin » choisie par le product owner.

Toutes les captures sont dans `docs/audit/screens/`. Les fichiers `*-full.png` sont des captures pleine page : la barre d'onglets fixe y apparaît au milieu, c'est un artefact de capture, pas un bug.

Limites : la police rendue par WebKit sous Windows n'est pas SF Pro, donc l'interlettrage et les graisses sont à revérifier sur iPhone. Les champs `date` et `time` natifs s'affichent en ISO dans ce WebKit ; sur iOS Safari ils s'affichent localisés, mais le problème de design reste (voir F-03).

## Sévérités et décompte

- **critique** : casse une règle du produit ou du nouveau style, cache une information ou une action, ou rend un écran inutilisable.
- **important** : incohérence visible, hiérarchie fausse, état manquant, accessibilité dégradée.
- **mineur** : finition, texte, alignement.

Décompte : **13 critiques, 37 importants, 32 mineurs** (82 constats).

## La direction cible, en une table

Ce que chaque correctif ci-dessous vise. Les noms de tokens sont ceux à créer dans `apps/web/src/styles/tokens.css` (ils remplacent les tokens actuels, voir « Système »).

| Rôle | Token proposé | Valeur | Contrôle |
|---|---|---|---|
| Fond unique de l'app | `--sky` | `linear-gradient(180deg, #FDE7DA 0%, #F3ECF6 38%, #E6F1F8 72%, #F7F9FB 100%)` | fixe, derrière tout, sur toute la hauteur |
| Texte principal | `--color-ink` | `#23303D` | 12,7:1 sur `#F7F9FB` |
| Texte secondaire | `--color-ink-2` | `rgb(35 48 61 / 0.72)` | env. 5:1 sur verre clair |
| Texte désactivé, filets | `--color-ink-3`, `--color-hairline` | `rgb(35 48 61 / 0.42)`, `rgb(35 48 61 / 0.10)` | jamais pour un texte lisible |
| Action principale | `--color-action` | `#3D6A9E` (bleu crépuscule) | blanc dessus : 5,6:1 |
| Reggie | `--color-reggie` | `#0B6B52` | blanc dessus : 6,5:1 |
| Séance intense | `--color-intense` | `#F29C7B` | pastille, filet, fond teinté ; texte toujours en encre (6,3:1) |
| Séance facile | `--color-easy` | `#7CC8A8` | idem |
| Sortie longue | `--color-long` | `#8DB3EA` | idem |
| Révision | `--color-revision` | `#8FCFD6` | idem |
| Alerte (règle forcée, montre non synchronisée) | `--color-warn` | pastille `#F2C46B` + texte encre + icône | jamais une couleur seule |
| Destructif | `--color-danger` | `#B4232A` | texte uniquement, sur surface |
| Voile des feuilles | `--color-scrim` | `rgb(35 48 61 / 0.28)` | jamais du noir |

---

## Système

Le constat de fond : l'app a deux langages. Le haut des écrans parle « verre sur dégradé » (carte du jour, puce objectif, barre d'onglets, bulles de Reggie), tout le reste parle « Réglages iOS 2019 » (feuilles `bg-bg` opaques, groupes `.group` en `--color-surface: #ffffff`, segmentés gris plats, champs blancs). C'est la cause principale de l'impression « généré par IA » : des composants génériques posés côte à côte, sans matière commune.

### SYS-01 · critique · Le fond coloré s'arrête à 40 % de l'écran
Captures : `today-run-full.png`, `week-full.png`, `program-full.png`, `reggie-empty.png`.
Chaque écran pose un `--backdrop-*` radial en haut (`Screen.tsx`, `tokens.css`) puis tombe sur `#F2F2F7` gris. Les listes du bas sont donc du blanc sur du gris : aucun verre possible, rien ne se détache. Les fonds changent aussi d'humeur selon l'écran (orange, vert, bleu), ce qui fait varier l'identité d'un onglet à l'autre.
Correctif : un seul fond `--sky` posé une fois sur un calque fixe (`position: fixed; inset: 0; z-index: -1` dans `App.tsx`, pas `background-attachment: fixed` qu'iOS ignore), identique sur tous les écrans, feuilles, onboarding et pages serveur. Supprimer les sept `--backdrop-*` et la prop `mood` de `Screen`. Le type de séance se dit par un marqueur sur la carte (voir « Couleur et emphase »), pas par le ciel. `theme-color` et `background_color` du manifeste passent à `#FDE7DA`.

### SYS-02 · critique · Feuilles, listes, widgets et champs opaques alors que le reste est en verre
Captures : `sheet-move.png`, `sheet-change.png`, `sheet-unavailable.png`, `sheet-strength-full.png`, `program-bottom.png`, `reggie-change-card.png`, `today-done-full.png`.
`Sheet.tsx` utilise `bg-bg` (gris plein), `.group` utilise `--color-surface: #ffffff`, 19 fichiers posent `bg-surface` à la main. Le widget « J'ai modifié ta semaine » est blanc plein alors que la bulle juste au-dessus est en verre.
Correctif : un composant unique `Surface` dans `ui/` (remplace `Glass.tsx` et la classe `.group`) avec trois épaisseurs, toutes sur le même ciel :
- `Surface level="card"` : `rgb(255 255 255 / 0.58)`, `backdrop-filter: blur(24px) saturate(160%)`, liseré `inset 0 0 0 0.5px rgb(255 255 255 / 0.7)`, reflet haut `inset 0 1px 0 rgb(255 255 255 / 0.9)`, ombre `0 8px 24px rgb(35 48 61 / 0.08)`, rayon 24.
- `Surface level="sheet"` : `rgb(247 249 251 / 0.78)`, `blur(40px) saturate(170%)`, rayon 32 en haut, ombre `0 -10px 40px rgb(35 48 61 / 0.12)`. Le contenu de la feuille utilise des `Surface level="inset"` (`rgb(255 255 255 / 0.55)`, sans flou propre pour ne jamais empiler deux flous, règle Apple « pas de verre clair sur verre clair »).
- `Surface level="bar"` : barre d'onglets, champ de Reggie, bandeau Annuler.
- Repli `prefers-reduced-transparency: reduce` : `#F7F9FB` plein + filet `--color-hairline`. Repli `prefers-contrast: more` : surface pleine + filet `rgb(35 48 61 / 0.35)`.
Toutes les listes (`List.tsx`), widgets (`widgets.tsx`), champs (`AskReggie`, `Composer`, `EventForm`) et récapitulatifs passent par `Surface`. Plus aucun `bg-surface` dans `features/`.

### SYS-03 · critique · Du noir partout alors que la direction l'interdit
Captures : `reggie-sick.png` (bulle d'Anna `#0A0A0C`), `week.png` (bouton + noir), `today-run.png` (pastille du jour noire), `sheet-move.png` (bande noire derrière la page reculée), tout le texte (`--color-text: #0a0a0c`, 56 usages de `text-text`).
Le noir derrière la feuille vient de `shouldScaleBackground` de vaul qui laisse voir le `body` sans fond.
Correctif : `--color-ink` pour tout le texte ; bulle d'Anna en `--color-action` (texte blanc) ou en `Surface inset` teintée `rgb(61 106 158 / 0.14)` avec texte encre ; bouton + en `RoundAction` verre avec icône encre ; pastille du jour en `--color-action` ; fond du `body` = `--sky` pour que la page reculée laisse voir du ciel, pas du noir ; voile `--color-scrim` en encre à 28 %.

### SYS-04 · critique · Les allures sont en orange ou rouge
Captures : `today-run.png` (4:55 en `--color-intense-ink #B93A0A`), `today-run-steps.png`, `sheet-session-detail.png`, `today-done.png` (4:52), `program.png` (chrono 1:48:00), `today-worst.png` (4:35 à 4:50), `today-rest.png` (6:15 à 6:45 en sarcelle), `toast-undo.png` (vert).
La règle du product owner : les chiffres d'allure en encre, jamais rouge ni orange. Aujourd'hui la couleur d'allure dépend du type et lit comme une alerte.
Correctif : `PaceValue` (nouveau, dans `ui/`) toujours en `--color-ink`, gras, chiffres tabulaires, `/km` en `--color-ink-2`. Le type de séance est porté par un filet ou une pastille pastel à côté (voir « Couleur et emphase »). Idem pour le chrono visé du Programme.

### SYS-05 · critique · Reggie et l'action principale partagent le même bleu
Captures : `today-run.png` (bouton Reggie `#0A7CFF`), `reggie-empty.png` (avatar, bouton d'envoi), `sheet-move.png` (CTA « Déplacer à » `#0A6CE0`), `sheet-unavailable-pain-where-sel.png` (puce sélectionnée bleue).
Le bleu signifie à la fois « Reggie », « valider », « sélectionné », « lien » et « curseur ». Rien ne ressort parce que tout ressort pareil.
Correctif : `--color-reggie` réservé à tout ce qui est Reggie (avatar, bouton Reggie d'Aujourd'hui, bulle et liseré de ses widgets, champ « Dis-le à Reggie », raccourcis). `--color-action` pour le bouton principal unique de chaque écran ou feuille. Sélection d'une option : liseré 2 px `--color-action` + coche, fond `rgb(61 106 158 / 0.10)`, pas un aplat plein. Liens texte (« Tout voir », « Annuler » des feuilles) en `--color-action`.

### SYS-06 · important · Bouton principal désactivé illisible
Captures : `sheet-unavailable.png`, `sheet-unavailable-sick-q.png`, `onboarding-02-race-empty.png`, `reggie-empty.png` (envoi), `program-bottom.png` (« Enregistrer »).
Blanc sur bleu pâle `#93BBEE` : environ 1,9:1. On ne sait pas si c'est un bouton cassé ou en attente.
Correctif : désactivé = `Surface inset` avec texte `--color-ink-3` et la raison au-dessus en légende (le pattern existe déjà en onboarding, à généraliser). Jamais une couleur d'action délavée.

### SYS-07 · important · Trois familles de « choix » qui se ressemblent sans être pareilles
Captures : `sheet-unavailable-pain.png` (segmenté gris plat), `sheet-unavailable-pain-where-sel.png` (puces blanches avec bord), `onboarding-06.png` (puces jours en verre « L M M »), `sheet-setting-norun.png` (puces jours blanches « Lun Mar »), `sheet-move-picker.png` (puces jours sans écart), `onboarding-04.png` (tuiles verre), `sheet-change.png` (cartes blanches).
Correctif : trois composants seulement, tous dans `ui/`.
- `Segmented` (glisse, déjà là) pour 2 à 3 valeurs exclusives courtes : piste `Surface inset`, pouce verre clair, texte encre. Réservé aux réglages (durée, 3/4/5).
- `ChoiceChips` pour les puces (jours, zones de douleur, réponses de Reggie) : hauteur 44, écart 8 minimum, `Surface inset`, sélection = liseré action + coche. Un seul format de jour partout : « Lun Mar Mer Jeu Ven Sam Dim ».
- `ChoiceCard` pour les options riches (créneaux, Changer, raisons de Pas dispo, distances d'onboarding) : `Surface card`, titre encre, détail encre-2, marqueur pastel du type à gauche quand il y a une séance, sélection = liseré action 2 px + coche.

### SYS-08 · important · Barre d'onglets : l'onglet actif n'a pas de couleur
Captures : `today-run.png`, `week.png`, `reggie-empty.png`.
Pastille grise et libellé gris 600 : l'actif se distingue à peine des autres. Sur `today-run.png` la barre recouvre la bande de la semaine sans marge de défilement visible.
Correctif : `TabBar` en `Surface level="bar"`, actif = icône et libellé `--color-action` avec pastille `rgb(61 106 158 / 0.12)` ; l'onglet Reggie actif en `--color-reggie`. Conserver `--space-under-tabbar` et ajouter un fondu de bord de défilement (masque 24 px) au lieu de laisser le contenu passer net sous la barre.

### SYS-09 · important · Pied de feuille non fixé : l'action principale sort de l'écran
Captures : `sheet-change.png` (« Valider » invisible), `sheet-move-picker.png` (CTA coupé), `sheet-strength-full.png`.
Correctif : `Sheet` gagne un emplacement `footer` collant (`position: sticky; bottom: 0`) en `Surface level="bar"`, avec `padding-bottom: max(16px, env(safe-area-inset-bottom))`. Le corps défile au-dessus avec un masque de fondu.

### SYS-10 · important · Double validation dans les feuilles de réglage
Captures : `sheet-setting-runs.png`, `sheet-setting-time.png`, `sheet-setting-norun.png`, `sheet-strength.png`, `sheet-revision.png`.
« OK » en haut à droite et « Enregistrer » en bas font la même chose.
Correctif : une seule action. Convention : feuilles courtes de réglage = bouton bas `--color-action` seul, « Annuler » à gauche ; formulaires longs (muscu, révision) = « OK » en haut, sans bouton bas. Documenter la convention dans `Sheet.tsx`.

### SYS-11 · important · Champs date et heure natifs bruts
Captures : `sheet-revision.png`, `sheet-add-indispo.png`, `sheet-add-place.png`, `sheet-goal.png`, `onboarding-02-race-filled.png`.
Le champ affiche la valeur du contrôle natif (ISO ici, « 16 nov. 2026 » sur iPhone), alors que tout le reste de l'app dit « Lundi 16 » et « Ce soir 18:00 ». L'anneau de focus est rectangulaire sur une ligne arrondie (`onboarding-02-race-filled.png`).
Correctif : `List.Field` affiche une valeur formatée par `lib/date.ts` (« Lundi 16 novembre », « 18:00 ») et garde l'`input` natif transparent par-dessus pour ouvrir la roue iOS. Focus : `outline` arrondi sur la ligne entière (`:focus-within`), 2 px `--color-action`.

### SYS-12 · important · Formats d'heure incohérents
Captures : `sheet-setting-time.png` (« 07:00 »), `program.png` (« 7:00 »), `onboarding-06.png`.
Correctif : une fonction de format unique (`H:MM`, sans zéro initial), utilisée pour l'affichage des champs aussi.

### SYS-13 · important · Légende de la semaine portée par la couleur seule, muscu en noir
Captures : `today-run-full.png` (points orange, sarcelle, noir, gris + légende).
Correctif : points en pastels du système (muscu en `--color-ink-2`, cours en `--color-ink-3`), et pour chaque jour le nombre d'éléments lu par VoiceOver (`aria-label="Mercredi 18 : 1 course, 1 révision"`). Pour la course du jour, remplacer le point par une petite icône coureur teintée.

### SYS-14 · mineur · Insécables manquantes
Captures : `sheet-change.png` (« 6 × 800 » / « m », « 40 » / « min »), `today-worst.png` (« 200 » / « m », « /km » seul sur sa ligne), `onboarding-08.png` (« moment » / « ? »).
Correctif : helper `nbsp()` dans `lib/` qui place une espace fine insécable avant `?`, `:`, `!` et une insécable entre nombre et unité ; l'appliquer dans les libellés générés (`today.ts`, `rules.ts`, `chat.ts`, copies d'onboarding).

### SYS-15 · mineur · Libellés de valeur en gris clair qui ressemblent à des espaces réservés
Captures : `sheet-strength-new.png` (« Jambes » espace réservé, même gris qu'une valeur), `sheet-add-indispo.png` (« Soirée chez Léa » `#BBB`, environ 2:1).
Correctif : valeurs saisies en `--color-ink`, espaces réservés en `--color-ink-3`, préfixés « Ex. : » pour ne jamais passer pour une valeur. Contraste espace réservé visé 3:1 minimum.

### SYS-16 · mineur · Icônes au sens flou
Captures : `sheet-unavailable.png` (Douleur = cœur, Malade = flacon), `sheet-change.png` (Footing tranquille = arc).
Correctif : Douleur `bandage` ou `activity`, Malade `thermometer`, Footing tranquille `footprints` (Lucide, trait 2 identique au reste).

---

## Aujourd'hui

### A-01 · important · Rien ne dit le type de séance hors du ciel orange
Captures : `today-run.png`, `today-rest.png`, `toast-undo.png`.
Le type n'est signalé que par la teinte du fond de page ; sur le nouveau ciel unique il disparaîtrait. La carte n'a ni icône ni étiquette « Intense ».
Correctif : `RunCard` en `Surface card` avec, en tête, une étiquette « Fractionné · intense » : pastille 8 px `--color-intense` + texte encre 13 gras, et un filet vertical de 4 px `--color-intense` sur le bord gauche de la carte (ou un dégradé interne très léger `--color-intense` à 12 % en haut à gauche). Facile, longue : même gabarit, autre pastel.

### A-02 · important · La rangée d'actions donne le même poids à tout sauf à Reggie
Capture : `today-run.png`.
Quatre ronds identiques, Reggie seul en bleu saturé avec halo. L'action la plus fréquente après « voir » est souvent Déplacer, et le halo bleu est le seul accent de l'écran.
Correctif : `RoundAction` en `Surface card` 60 px, icônes encre ; Reggie avec l'icône sur fond `--color-reggie` (le seul plein), sans halo coloré (ombre neutre). Libellés en 13 gras encre-2, pas 15 gras noir.

### A-03 · mineur · « Voir les étapes » répète le bloc principal
Capture : `today-run-steps.png`.
« 6 × 800 m 4:55 » apparaît deux fois l'une sous l'autre.
Correctif : à l'ouverture, remplacer la zone « Bloc principal » par la liste des étapes (fondu croisé 250 ms), la ligne du bloc principal y étant mise en gras.

### A-04 · mineur · Footing facile : « 45 min » deux fois
Capture : `toast-undo.png`.
Sous-titre « 45 min » puis colonne « Durée 45 min ».
Correctif : pour une séance sans bloc, la colonne gauche montre la distance estimée ou disparaît.

### A-05 · important · Cas long : la carte casse
Capture : `today-worst-full.png`.
« 10 × 400 m + 5 × 200 » puis « m » seul ; « 4:35 à 4:50 » puis « /km » seul ; lignes de « Ma journée » sur deux lignes sans respiration (texte collé aux filets).
Correctif : la grille Bloc/Allure passe en pile verticale sous 360 px de contenu ; `nbsp()` (SYS-14) ; `.row` à `padding-block: 12px` au lieu d'une hauteur minimale seule.

### A-06 · important · Après la course : ressenti et note en composants plats
Capture : `today-done-full.png`.
« Facile / Correct / Dur » en segmenté gris opaque, note dans un bloc blanc, envoi en bleu Reggie saturé, carte verdict en blanc qui finit en gris.
Correctif : ressenti en `ChoiceChips` (trois puces 44 px, icône + mot) ; note dans un `Surface inset` avec bouton d'envoi `--color-reggie` ; le titre « Un mot pour Reggie » prend la petite pastille verte de Reggie pour dire à qui on parle. Chiffres 8,3 / 51:12 / 4:52 en encre (SYS-04), coche de réussite en `--color-easy` + texte.

### A-07 · mineur · Jour de repos : l'allure de demain en sarcelle
Capture : `today-rest.png`.
Correctif : encre (SYS-04), pastille `--color-easy` devant « Footing facile ».

### A-08 · important · Échec d'envoi à la montre en rouge vif sur fond orange
Capture : `today-light.png`.
« Pas envoyée, réessayer » rouge gras : lisible mais agressif, et c'est la seule ligne qui ne ressemble pas à un bouton alors qu'elle en est un.
Correctif : puce `Surface inset` avec icône montre barrée, texte encre, pastille `--color-warn`, libellé « Pas envoyée · Réessayer » avec « Réessayer » en `--color-action`, cible 44 px.

### A-09 · mineur · Bandeau Annuler sans matière
Capture : `toast-undo.png`.
Bandeau blanc posé sur le titre « Cette semaine », sans icône.
Correctif : `Surface level="bar"`, icône de l'action à gauche (flèches pour Déplacer), « Annuler » en `--color-action` gras. À vérifier aussi côté mock : après « Déplacer à mercredi », la carte du jour affiche « Aujourd'hui · 7:30 Footing facile » à une heure déjà passée.

---

## Feuille « Déplacer »

### M-01 · important · Les jours interdits sont grisés sans leur raison
Capture : `sheet-move-picker.png`.
`docs/interactions.md` exige « Moins de 24 h après ta séance jambes » visible ; la raison n'existe que dans l'`aria-label`.
Correctif : sous la rangée de jours, la raison du jour touché (ou du premier jour interdit) en légende encre-2 avec icône cadenas. Jours interdits : `Surface inset` à 50 % + barré fin, jamais seulement plus clairs.

### M-02 · important · Sélection ambiguë entre créneau proposé et jour choisi
Capture : `sheet-move-picker.png`.
« Lun » est surligné pendant qu'aucun créneau n'est coché et que le bouton dit encore « ce soir 19:30 ».
Correctif : un seul choix actif à la fois ; ouvrir « Choisir un autre moment » décoche les créneaux et le CTA reflète le jour et l'heure choisis.

### M-03 · mineur · Rangée de jours trop serrée
Capture : `sheet-move-picker.png`.
Sept puces de 48 px avec 4 px d'écart, sous le minimum de 8 px.
Correctif : `ChoiceChips` en défilement horizontal avec accroche, ou deux lignes ; écart 8.

### M-04 · mineur · En-tête de séance en aplat pêche avec texte orange foncé
Capture : `sheet-move.png`.
Correctif : `Surface inset` + pastille `--color-intense` + texte encre.

---

## Feuille « Changer »

### C-01 · important · « Valider » hors écran
Capture : `sheet-change.png`. Voir SYS-09.

### C-02 · mineur · L'aperçu en grand répète la carte choisie
Capture : `sheet-change-selected.png`.
Correctif : la carte choisie s'agrandit sur place (layout animation 250 ms) ou l'aperçu montre ce qui change par rapport au plan (« 2 fractions de moins, 10 min de moins »), pas la même ligne.

### C-03 · important · « Dis-le à Reggie » en bleu générique
Capture : `sheet-change.png`.
Correctif : champ `Surface inset` avec pastille Reggie verte à gauche et envoi `--color-reggie`.

### C-04 · mineur · Icônes des options en aplats saturés orange et vert
Capture : `sheet-change.png`.
Correctif : tuile d'icône en pastel du résultat (Plus court et Équivalente gardent `--color-intense` à 35 %, Plus facile et Footing `--color-easy` à 35 %), icône encre.

---

## Feuille « Pas dispo »

### U-01 · important · La question est en légende grise, les réponses en segmenté, puis un Continuer
Captures : `sheet-unavailable-sick-q.png`, `sheet-unavailable-pain-where.png`.
« Tu as de la fièvre ou ça touche la poitrine ? » est en 15 gris : la question principale de l'écran est l'élément le plus faible.
Correctif : la question devient le titre de l'étape (20 gras encre). Oui / Non en deux `ChoiceCard` qui avancent au tap (pas de Continuer pour une question fermée, conforme à « Une seule question à la fois »).

### U-02 · important · Pas de retour ni de repère dans le parcours à étapes
Captures : `sheet-unavailable-pain-where.png`, `sheet-unavailable-pain-level.png`, `sheet-unavailable-summary.png`.
Le titre reste « Pas dispo », seul « Annuler » existe, la hauteur de feuille saute à chaque étape.
Correctif : bouton retour (chevron) à gauche à partir de l'étape 2, sous-titre « Douleur · 2 sur 3 », hauteur animée (ressort sans rebond).

### U-03 · mineur · « Ça va mieux » toujours visible au même niveau que Continuer
Captures : `sheet-unavailable.png`, `sheet-unavailable-other.png`.
Correctif : ne l'afficher que si une indisponibilité est en cours ; sinon le retirer. Quand il est là, lien texte `--color-action` sous le CTA.

### U-04 · mineur · Récapitulatif tassé
Capture : `sheet-unavailable-summary.png`.
« Aujourd'hui » et « Endurance fondamentale · 30 min » collés dans une puce verte, pas d'avant et après.
Correctif : `ChangeRows` partagé avec Reggie (voir R-05) : par jour, avant barré encre-3, après en encre avec pastille de type.

### U-05 · mineur · Curseur de douleur en bleu
Capture : `sheet-unavailable-pain-level.png`.
Correctif : remplissage du curseur en encre-2, le chiffre « 2 / 10 » en encre ; à partir de 4, pastille `--color-warn` + le conseil en une ligne. La couleur ne doit pas dramatiser.

---

## Détail de séance, cours, muscu, révision

### D-01 · mineur · Détail de séance : en-tête pêche et texte orange
Capture : `sheet-session-detail.png`.
Correctif : même gabarit que A-01 ; « Sur ta montre » en encre-2 avec icône ; allures en encre (SYS-04).

### D-02 · important · « Ce cours n'a pas lieu » en bouton principal plein
Capture : `sheet-event-class.png`.
Une action qui modifie le plan sur une fiche en lecture seule ne doit pas être l'élément dominant.
Correctif : bouton `Surface inset` texte `--color-action` ; confirmation dans le bandeau Annuler.

### D-03 · important · Révision : la date en ISO et pas de répétition
Capture : `sheet-revision.png`.
« Jour 2026-11-16 » ; la feuille de modification d'une révision n'a pas « Répéter » alors que l'ajout l'a.
Correctif : SYS-11 ; mêmes champs à l'ajout et à la modification.

### D-04 · mineur · Muscu : « Heure » sans chevron, les autres lignes avec
Captures : `sheet-strength-full.png`, `sheet-strength-new.png`.
Correctif : chevron ou rien sur toutes les lignes ouvrant un choix (iOS : valeur à droite + chevron pour une sous-liste, valeur seule pour une roue en ligne). Choisir et appliquer partout.

### D-05 · mineur · Nouvelle séance : aucun bouton visible pour créer
Capture : `sheet-strength-new.png`.
Seul « OK » pâle en haut. Correctif : SYS-06 et SYS-10, OK actif dès qu'un nom est saisi, raison affichée sinon.

---

## Semaine

### W-01 · critique · Bouton + noir
Capture : `week.png`. Voir SYS-03. Correctif : `RoundAction` 44 px en `Surface card`, icône `--color-action`, `aria-label="Ajouter"` conservé.

### W-02 · important · Le jour courant ne ressort pas
Capture : `week.png`.
« Aujourd'hui » en petit gris à côté de « Lundi 16 ».
Correctif : en-tête du jour courant avec pastille « Aujourd'hui » `--color-action` à 12 % et texte action ; défilement initial sur ce jour.

### W-03 · important · Le résultat d'« Actualiser » ne se voit pas
Capture : `week-refreshed.png`.
« 1 cours annulé jeudi » s'écrit à côté du même point vert, le jeudi n'est pas marqué.
Correctif : la ligne de résultat devient une `Surface inset` avec icône, et la ligne concernée dans jeudi est barrée « Annulé » 3 s puis disparaît (fondu).

### W-04 · mineur · Étiquette « Jambes » redondante
Captures : `week-full.png`, `sheet-add.png`.
Une séance nommée « Jambes » porte une étiquette « Jambes ».
Correctif : remplacer l'étiquette par une petite icône jambe avec `aria-label`, masquée si le nom contient déjà « jambes ».

### W-05 · mineur · « Repos » sur des jours chargés de cours
Capture : `week-full.png`.
« Mardi 17 Repos » avec deux cours : ambigu.
Correctif : « Pas de course ».

### W-06 · mineur · Lignes de course teintées qui débordent la marge du groupe
Capture : `week-full.png`.
Le fond pêche de « Fractionné » va presque au bord du groupe, les autres lignes ont la marge iOS.
Correctif : lignes de course avec filet pastel de 4 px à gauche et fond pastel à 14 % dans la même marge que les autres.

### W-07 · important · Liste de semaine en blanc opaque
Capture : `week.png`. Voir SYS-02. Chaque jour devient une `Surface card`.

---

## Feuille « Ajouter »

### W-08 · mineur · « Placer » ambigu sur des séances déjà placées, formulaire déplié dans la liste
Captures : `sheet-add.png`, `sheet-add-place.png`.
Correctif : « Placer » seulement pour « Pas placée cette semaine », sinon « Placée lundi 20:00 » en encre-2 ; le choix jour et heure s'ouvre en sous-étape de feuille (navigation poussée), pas en ligne dans la liste.

### W-09 · important · Révision et Indispo : dates ISO, espace réservé illisible
Captures : `sheet-add-revision.png`, `sheet-add-indispo.png`. Voir SYS-11 et SYS-15.

---

## Programme

### P-01 · critique · Chrono visé en orange
Capture : `program.png`. Voir SYS-04.

### P-02 · important · « Ambitieux » en vert
Capture : `program-worst-full.png`.
Même pastille verte qu'« Atteignable ».
Correctif : Atteignable = pastille `--color-easy` + coche ; Ambitieux = pastille `--color-warn` + icône info + une ligne d'explication sous le chrono.

### P-03 · mineur · Phase tronquée
Capture : `program.png` (« Développe… »).
Correctif : libellés courts (« Base, Dév., Spéc., Affûtage ») ou seulement la phase en cours nommée sous la barre ; barre active en `--color-action`, pas en orange.

### P-04 · important · Lien ICS saisi dans une ligne de liste
Captures : `program-bottom.png`, `program-worst-full.png`.
Champ étroit « https:// » et « Enregistrer » pâle collés.
Correctif : ligne « Lien ICS » qui ouvre une feuille avec un champ pleine largeur, `inputmode="url"`, collage proposé, validation en ligne et message d'erreur sous le champ.

### P-05 · important · Libellés longs qui cassent
Capture : `program-worst-full.png`.
« Jours sans / cou / rse » et « Lundi / 20:00 » sur deux lignes, valeur qui chevauche le libellé.
Correctif : ligne en pile (libellé puis valeur dessous) quand la valeur dépasse 40 % de la largeur ; `min-width: 0` et `overflow-wrap: anywhere` interdits sur les libellés.

### P-06 · mineur · Groupes avec et sans filets
Captures : `program.png` (Entraînement sans filets), `program-bottom.png` (Connexions avec).
Correctif : filets partout dans une `Surface` de liste (règle `.row + .row` à appliquer à toutes les lignes).

### P-07 · mineur · Ligne Notifications collée
Capture : `program-bottom.png`.
Texte d'aide sur deux lignes collé au bas de la carte.
Correctif : `padding-block: 12px` sur les lignes à deux niveaux (A-05).

### P-08 · mineur · « Arrêter le programme » : confirmation dans une carte blanche
Capture : `sheet-stop.png`.
Correctif : texte de confirmation sans carte, bouton destructif `Surface inset` texte `--color-danger`, séparé de 24 px de tout autre bouton.

### P-09 · mineur · Fiche montre : « Reconnecter » en gris plein
Capture : `sheet-watch.png`.
Correctif : `Surface inset` texte `--color-action` ; « État : Connectée » avec pastille `--color-easy`.

---

## Reggie

### R-01 · critique · Le dernier widget est caché sous les raccourcis
Captures : `reggie-change-card.png`, `reggie-shorter.png`, `reggie-sick-answer.png`.
La carte « J'ai modifié ta semaine » et son « Annuler », ou « Prendre celle-ci » et « Garder la séance prévue », passent sous la rangée de raccourcis et le champ. L'action la plus importante de la conversation est inatteignable sans défiler, et parfois pas du tout.
Correctif : la zone de saisie (raccourcis + champ) est une seule `Surface level="bar"` mesurée (`ResizeObserver`) dont la hauteur alimente le `padding-bottom` de la liste ; défilement automatique jusqu'au bas du dernier widget, pas du dernier texte. Masquer les raccourcis dès qu'un widget attend une réponse.

### R-02 · critique · Reggie en bleu, Anna en noir
Captures : `reggie-empty.png`, `reggie-sick.png`.
Correctif : avatar et en-tête en `--color-reggie` (avatar rond vert, icône blanche), bulles de Reggie en `Surface card` avec un liseré gauche vert 2 px sur la première bulle d'un tour ; bulles d'Anna en `--color-action` texte blanc (SYS-03, SYS-05).

### R-03 · important · Trois couches flottantes empilées
Captures : `reggie-empty.png`.
Raccourcis, champ et barre d'onglets prennent environ 190 px sur 844.
Correctif : raccourcis visibles seulement quand le champ est vide et la conversation au repos ; ils défilent dans la même `Surface` que le champ. Champ et onglets alignés sur la même marge de 16 px.

### R-04 · important · Raccourcis et réponses ont le même style
Captures : `reggie-answer.png` (Mollet, Genou… juste au-dessus de « Je suis malade », « Plus court »).
On ne sait plus ce qui répond à la question et ce qui lance un autre parcours.
Correctif : réponses = `ChoiceChips` dans le fil, alignées sur la bulle de Reggie, avec liseré vert ; raccourcis = puces plus petites (36 px visuels, cible 44) en encre-2 dans la barre de saisie.

### R-05 · important · La carte de changement ne montre que l'après
Captures : `reggie-change-card.png`, `reggie-sick-answer.png`.
`docs/interactions.md` : « Liste avant et après par jour ». Le libellé et la valeur se tassent sur trois lignes.
Correctif : `ChangeRows` en pile : jour en légende, avant barré encre-3, après en encre avec pastille de type ; « Montre mise à jour » avec icône ; « Annuler » en `--color-action`.

### R-06 · important · Boutons de proposition sur trois lignes
Capture : `reggie-shorter.png`.
« Garder la séance prévue » et « Prendre celle-ci » côte à côte cassent.
Correctif : boutons empilés pleine largeur dans le widget, « Prendre celle-ci » en `--color-reggie` plein, « Garder » en lien.

### R-07 · mineur · Créneaux non choisis à peine lisibles
Capture : `reggie-change-card.png`.
Correctif : opacité 0,55 minimum (règle `opacity-threshold`), coche sur le choisi.

### R-08 · mineur · Le message d'accueil ignore le contexte
Capture : `reggie-context.png`.
Puce « À propos de : Fractionné, ce soir 18:00 » puis « Salut. Pose-moi une question sur ton plan ».
Correctif : accueil contextuel « Ton fractionné de ce soir : tu veux le déplacer, l'alléger, ou une question sur l'allure ? » avec trois réponses.

### R-09 · mineur · « Je vérifie » et les trois points
Capture : `reggie-thinking.png`.
Les points sont gris sur blanc et sans texte.
Correctif : bulle verre avec trois points `--color-reggie` et, pendant une recherche, le texte « Je vérifie » (spécifié dans `interactions.md`).

---

## Onboarding

Constat d'ensemble : chaque étape est un écran de réglages vide à 60 %, avec le même dégradé bleu orangé (qui n'est ni le ciel du reste de l'app ni le dégradé d'aucun écran), un titre 28, une ligne grise et un bouton bleu en bas. C'est fonctionnel, mais rien n'est dessiné : c'est la page la plus « générique » de l'app et c'est la première vue.

### O-01 · critique · Accueil sans identité
Capture : `onboarding-01-welcome.png`.
« Annarrivé » en titre de page standard, deux paragraphes, bouton. Pas de marque, pas d'image, pas de promesse visible.
Correctif : sur le ciel `--sky`, au tiers haut, le symbole Annarrivé (l'icône de l'app, 88 px, en verre) puis le nom en 34 gras encre, une promesse en une ligne (« Ton plan de course, rangé autour de tes cours »), et une `Surface card` qui montre en miniature la carte du jour (Fractionné, ce soir 18:00, 4:55) pour dire ce qu'on va obtenir. CTA `--color-action` « Commencer ». Pas de points de progression sur l'accueil.

### O-02 · critique · Étapes à un seul champ, écran vide
Captures : `onboarding-05.png` (une seule ligne « Coucher 23:00 »), `onboarding-03.png`, `onboarding-07.png`, `onboarding-10.png`.
Correctif : regrouper en 6 étapes au lieu de 12 (course + date + chrono ; courses par semaine ; limites + coucher + jours sans course ; muscu ; santé + douleur ; emploi du temps + notifications), chacune avec un visuel utile en haut (ex. pour les limites, une frise de la journée 6:00 à 24:00 où la plage autorisée se colore en temps réel et le coucher pose une borne). Les réglages restent des lignes `Surface`.

### O-03 · important · Douze points de progression
Captures : `onboarding-02-race-empty.png` et suivantes.
Correctif : barre de progression fine en `--color-action` (ou 6 segments après O-02) ; libellé VoiceOver « Étape 2 sur 6 ».

### O-04 · important · Sélection en aplat bleu saturé
Captures : `onboarding-02-race-filled.png`, `onboarding-04.png`, `onboarding-08.png`.
Correctif : `ChoiceCard` (SYS-07) : liseré action + coche, fond teinté léger, texte encre.

### O-05 · important · Chrono à « 0 h 0 min » en gris
Capture : `onboarding-03.png`.
Ressemble à une valeur saisie ; pour un 5 km, les heures n'ont pas de sens.
Correctif : champ vide avec espace réservé « Ex. : 25:00 » adapté à la distance (min:s sous le semi, h:min au-delà), et une ligne « Atteignable / Ambitieux » sous le champ (P-02).

### O-06 · important · Copie qui expose un nom
Capture : `onboarding-10.png`.
« Darius l'a peut-être déjà mis. » : nom d'une personne dans l'interface d'Anna, et phrase incertaine.
Correctif : « Ton emploi du temps est déjà relié. » quand c'est le cas, sinon le champ ICS. Pas de nom propre dans les textes.

### O-07 · mineur · « Plus tard » et « Continuer » ont le même effet
Capture : `onboarding-07.png`.
Correctif : sans séance ajoutée, un seul bouton « Passer cette étape » ; avec une séance, « Continuer ».

### O-08 · mineur · Récapitulatif coupé net et non modifiable
Capture : `onboarding-12.png`.
Correctif : masque de fondu au-dessus du pied ; chaque ligne touchable ramène à son étape (chevron).

### O-09 · mineur · Jours « L M M J V S D »
Capture : `onboarding-06.png`. Deux « M » identiques. Correctif : SYS-07, « Lun Mar Mer… ».

### O-10 · important · Visite guidée sans mise en lumière
Captures : `onboarding-tour-1.png` à `onboarding-tour-4.png`.
L'étape 1 recouvre la rangée d'actions qu'elle présente presque ; l'étape 4 ne met rien en lumière ; la bulle est blanche opaque.
Correctif : découpe (spotlight) sur l'élément expliqué avec voile `--color-scrim`, bulle `Surface card` ancrée par une flèche à l'élément, placée au-dessus ou au-dessous selon la place. Étape 4 : montrer l'onglet Semaine en lumière.

---

## Connexion

### L-01 · critique · Page serveur de connexion non dessinée
Captures : `login-server.png`, `login-server-error.png`.
Fond blanc, « Annarrivé » en Arial gras centré, bouton `#0A7CFF` à 12 px de rayon (le seul de l'app), aucun texte qui dit ce qui va se passer. L'erreur n'est qu'un paragraphe sans action.
Correctif (dans `loginPage` d'`apps/server/src/app.ts`, CSS en ligne autorisée par la CSP) : fond `--sky` en dégradé CSS, carte verre centrée (rgba blanc 0,6 + `backdrop-filter`, repli plein), icône de l'app 72 px, titre « Bienvenue, Anna » ou « Connexion à Annarrivé », une phrase « Ce lien ouvre Annarrivé sur ce téléphone. », bouton pleine largeur 50 px rayon 25 `#3D6A9E`, police `-apple-system`. Erreur : même carte, icône d'alerte, le message du serveur, puis une issue en une phrase (« Ce lien a déjà servi ou a expiré. Demande un nouveau lien. »). `meta theme-color` assorti.

### L-02 · critique · Écran déconnecté sans issue
Capture : `signed-out.png`.
« Ouvre le lien de connexion que tu as reçu. » et rien d'autre : pas d'explication (session expirée ?), pas d'action, écran à 80 % vide.
Correctif : même gabarit que L-01 dans l'app (`SignedOut.tsx`) : icône, « Tu es déconnectée », une phrase « Ouvre le dernier lien de connexion reçu par message. », bouton secondaire « Réessayer » (relance le chargement) pour le cas d'une coupure réseau prise pour un 401.

---

## Couleur et emphase

Principe : le ciel est pâle et le verre est clair, donc la couleur doit être rare et toujours signifier quelque chose. Cinq rôles, pas plus, et jamais en grande surface.

1. **Type de séance** (intense, facile, longue, révision, muscu, cours). Porté par un marqueur, pas par le fond : pastille 8 px devant le nom, filet de 4 px sur le bord gauche de la carte ou de la ligne, tuile d'icône à 35 % d'opacité du pastel avec icône encre, et pour la carte du jour un voile interne du pastel à 12 % dans le coin haut gauche. Texte toujours en encre. Muscu en encre-2, cours en encre-3 avec cadenas. Partout le même marqueur : carte du jour, bande de semaine, Ma journée, Semaine, Déplacer, Changer, widgets de Reggie, récapitulatifs.
2. **Aujourd'hui**. `--color-action` : pastille du jour dans la bande de semaine, étiquette « Aujourd'hui » dans Semaine, et la carte du jour seule en `Surface card` d'épaisseur supérieure (ombre plus marquée). Aucun autre élément de l'écran n'utilise l'ombre forte.
3. **Action**. `--color-action` plein pour un seul bouton par écran ou feuille (CTA de feuille, « Commencer », « C'est parti », « Se connecter »). Les autres actions : texte action sur `Surface inset`, ou icône encre sur verre. Sélection : liseré action + coche.
4. **Reggie**. `--color-reggie` pour tout ce qui vient de lui ou lui parle : avatar, bouton Reggie d'Aujourd'hui (le seul rond plein de la rangée), liseré de ses bulles et widgets, envoi du champ, pastille devant « Un mot pour Reggie » et « Dis-le à Reggie ». Jamais pour une validation ordinaire, pour que « vert foncé » se lise « Reggie » d'un coup d'œil.
5. **Avertissements**. Règle forcée (« Moins de 24 h après ta séance jambes »), séance allégée, montre non synchronisée, objectif ambitieux, douleur de 4 et plus : pastille `#F2C46B` + icône + texte encre. Erreur bloquante ou destructif : `--color-danger` en texte seulement. Le vert `--color-easy` + coche pour « fait », « atteignable », « connectée ».

Ce qui ne porte jamais de couleur : les allures, chronos et durées (encre), les titres (encre), les fonds de page (ciel unique), les surfaces (verre neutre), les ombres (encre à faible opacité, jamais orange comme `--shadow-glass` actuel `rgb(90 40 10 / 0.14)`).

Vérification à garder en CI (test de tokens) : chaque paire texte et fond de cette table passe 4,5:1 ; aucune valeur `#000`, `#0a0a0c` ou `black` dans `styles/` et `features/`.

---

## Composants à reconstruire (liste de travail)

Dans `apps/web/src/ui/`, dans cet ordre, chacun remplaçant les usages ad hoc dans `features/` :

| Ordre | Composant | Remplace | Constats couverts |
|---|---|---|---|
| 1 | Tokens « Ciel du matin » dans `tokens.css` (`--sky`, encre, action, reggie, pastels, warn, danger, scrim, ombres encre) | `--color-text`, `--color-assistant`, `--color-intense*`, `--backdrop-*`, `--shadow-glass` orangé | SYS-01, 03, 04, 05 |
| 2 | Calque de ciel fixe dans `App.tsx`, fond du `body`, `theme-color` | `Screen mood`, fonds par écran | SYS-01, SYS-03 |
| 3 | `Surface` (card, sheet, inset, bar) avec replis transparence et contraste | `Glass.tsx`, `.group`, `bg-surface` (19 fichiers), `bg-bg` de `Sheet` | SYS-02 |
| 4 | `Sheet` avec en-tête (retour, titre, sous-titre d'étape), corps défilant masqué, pied collant | `Sheet.tsx` actuel | SYS-09, SYS-10, U-02 |
| 5 | `List` / `List.Row` / `List.Field` (valeur formatée sur contrôle natif, `padding-block`, filets partout, pile auto) | `List.tsx`, `.row` | SYS-11, SYS-12, A-05, P-05, P-06 |
| 6 | `ChoiceChips`, `ChoiceCard`, `Segmented` (glisse) | `ChoiceGroup`, puces de `SlotPicker`, tuiles d'onboarding | SYS-07, O-04, M-03 |
| 7 | `Button` (primary action, secondary inset, link, destructive) avec état désactivé lisible | variantes actuelles | SYS-06, D-02, P-08 |
| 8 | `SessionMark` (pastille, filet, tuile d'icône) et `PaceValue` | couleurs par type dans `tones.ts` | SYS-04, A-01, SYS-13 |
| 9 | `TabBar` et `RoundAction` en `Surface bar` / `card` | versions actuelles | SYS-08, A-02, W-01 |
| 10 | `ChangeRows` partagé (Pas dispo, Objectif, Reggie) | `Summary.tsx`, `ChangeRows.tsx` | U-04, R-05 |
| 11 | Barre de saisie Reggie mesurée (raccourcis + champ) | `Composer`, `AskReggie` | R-01, R-03, R-04, C-03 |
| 12 | `glisse` reste pour les petits contrôles seulement (interrupteur, curseur, segmenté), recolorés : `--lg-on: var(--color-easy)`, `--lg-fill: var(--color-ink-2)` | `.ui-switch`, `.ui-slider` | U-05 |

Une fois ces composants en place, chaque écran se reprend sans nouveau style local : Aujourd'hui, Semaine, Programme, Reggie, puis les feuilles, puis l'onboarding (O-01, O-02) et les deux pages de connexion (L-01, L-02).
