# Annarrivé UI system: « Ciel du matin »

Everything a screen draws comes from this folder and from `src/styles/`. A screen (`features/<écran>/`) composes these pieces and never adds its own colors, shadows, radii or blur. If something is missing, add it here, document it below, then use it.

## Three layers

| Layer | What | Component | Material |
|---|---|---|---|
| Backdrop | the dawn sky, fixed behind the whole app | `Sky` | calm, still gradient: a soft apricot wash at the top fading to warm near-white, two pale cool fields (periwinkle, mint) for the glass to show |
| Content | cards, grouped lists, widgets, sheet bodies | `Surface` | glass: 32 % white over the sky, strongly blurred and saturated, a 1 px gradient light rim, top-left sheen, soft warm shadow |
| Controls | tab bar, buttons, chips, segmented controls, fields, switches, sliders, toasts | `controls.tsx` | Liquid Glass (glisse) |

Rules that follow from it:

- Never put glass in the content layer and never put a card on glass. Text always sits on `Surface` or on the sky, never on a colored fill (except white on a filled button).
- `glisse` is imported in `controls.tsx` only. Its styles are tuned in `styles/controls.css` (unlayered, so they beat glisse's own sheet).
- No black anywhere: text is `ink`, shadows and scrims are ink at low opacity.

## Tokens (`styles/tokens.css`)

All values live there and become Tailwind classes (`text-ink`, `bg-intense-wash`, `rounded-card`, `shadow-card`, `px-gutter`). The default Tailwind palette is switched off, so a raw color cannot sneak in.

### Color carries meaning

| Token | Class examples | Means | Use for |
|---|---|---|---|
| `ink` | `text-ink` | text | all text, paces, times, titles |
| `ink-2` | `text-ink-2`, `.t-sub`, `.t-cap` | secondary text | captions, values in rows, units |
| `ink-3` | `text-ink-3` | faint, 3:1 | placeholders, chevrons, disabled labels. Never text that must be read |
| `hairline`, `hairline-strong`, `fill` | `border-hairline`, `bg-fill` | structure | separators, empty tracks, pressed rows |
| `action` (#0967D6) | `bg-action`, `text-action`, `bg-action-wash`, `shadow-ring` | do something, selected, today | the one filled button of a view, links, selected choices (wash + ring + check), today's date |
| `reggie` (#0B6B52) | `bg-reggie`, `text-reggie`, `bg-reggie-wash` | Reggie speaks or acts | his avatar, his name on his notes, the send button to him, his replies. Nothing else is this green |
| `warn` (`-wash`, mid, `-deep`) | `bg-warn-wash text-warn-deep` | look at this, calmly | forced rules, lightened session, watch not synced, ambitious goal, pain from 4, field errors |
| `danger` | `text-danger` | destroys | the label of a destructive action only (never a fill, never an alert) |
| `on-color` | `text-on-color` | white | text on a filled action or Reggie button |
| `ok` (`-wash`, `-deep`) | `bg-ok`, `bg-ok-wash text-ok-deep` | a status is fine (connected, up to date, reachable) | status dots and tags. Never the easy-run green |
| `scrim` | `bg-scrim` | behind a sheet | ink at 13 %; the page behind steps back to 0.94 with the sheet (`RECEDE`, ui/Sheet.tsx) |

### Session tones: wash, mid, deep

Each session type has three tones, read through `ui/tones.ts` (`TONES[tone].wash | mid | deep | label | icon`). Never write the class by hand in a screen.

| Type (`Tone`) | wash (backgrounds) | mid (bars, dots) | deep (text, icons, 4.5:1 on white and on wash) |
|---|---|---|---|
| `hard` intense | `#FBD3C1` | `#EE8A63` | `#9C3814` (5.1:1 on wash) |
| `easy` | `#CDEBDC` | `#5DBB92` | `#2C6337` (5.6:1 on wash), yellower than Reggie's green on purpose |
| `long` | `#D3E2FA` | `#6F9EE6` | `#2F449A` (6.6:1 on wash), more indigo than the action blue on purpose |
| `revision` | `#C9EAEE` | `#5FBEC9` | `#155A63` (6.2:1 on wash) |
| `strength` | `#E8EDF5` | `#8496B3` | `#3B4D6B` (6.5:1 on wash), a slate blue apart from the class grey |
| `class`, `busy`, `rest`, `other` | `#F1F2F4` | `#C4CAD1` | `#434E5A` (the secondary ink) |

Paces, times and distances are never colored: the type is said by a `SessionChip`, a `SessionShape` or an `IconTile` next to them.

### Surfaces, shadows, radii, spacing, motion

- Surfaces: content is frost, controls are glass (glisse). `--surface-card` (32 % white), `--surface-inset` (34 %), `--surface-edge` (the 1 px light rim of every surface), both under `--surface-sheen` and blurred with `--surface-blur` on every device (the sky never moves, so it is blurred once), no refraction; `--surface-sheet` (84 %, blurred), `--surface-on-sheet` (a group on a sheet, 50 %, no blur of its own, same rim), `--surface-solid` (reduced transparency). Glass floating over scrolling content (tab bar, toasts, `.ui-glass`, Reggie's composer with `.ui-float`) takes `--glass-float` (50 % white, 96 % without backdrop blur); a toast `--glass-toast` (68 %) with `--shadow-toast`. A filled button glows in its color (`--shadow-glow-action`, `--shadow-glow-reggie`).
- Shadows: `shadow-card`, `shadow-inset`, `shadow-sheet`, `shadow-float` (floating controls, toasts), `shadow-lift` (dragged item), `shadow-ring` (selection), `shadow-ring-quiet` (empty radio).
- Radii by hierarchy: `tile` 10, `row` 16, `inset` 20, `card` 24, `bubble` 22, `sheet` 32, `pill`.
- Sizes: `--size-target` 44 (every touch target), `--size-control` 50 (main buttons, fields), `--size-action` 60 (round actions), `px-gutter` 16. `--space-under-tabbar` and `--space-above-tabbar` keep content and floating things clear of the tab bar.
- Durations: `press` 120, `select` 180, `tab` 200, `expand` 250, `message` 220, `sheet` 350, `toast` 400, `fade` 150 (reduced motion). Eases: `ease-out`, `ease-in-out`, `ease-drawer` (iOS sheet).
- JS springs: `lib/motion.ts` (`SPRING_SHEET`, `EXIT_SHEET`, `SPRING_STEP`, `SPRING_BUBBLE`, `FADE`). Every Motion tree sits in `<MotionConfig reducedMotion="user">`. iOS Safari has no haptics: feedback is visual (press scale 0.96, selection ring).

### Type (`styles/app.css`)

One scale: `.t-large` 28 (page title, tight tracking), `.t-title` 20 (section), `.t-body` / `.t-strong` 17, `.t-sub` / `.t-label` 15, `.t-cap` 13, `.t-tab` 11. Big numbers: `.t-figure` 40 and `.t-num` 28, tabular, through `PaceValue`. Outfit, self-hosted (latin, one variable file, preloaded by `index.html`), through `--font-sans`.

Other utilities: `.row` (grouped list row with hairlines between rows), `.hairline-top`, `.bubble-reggie` / `.bubble-user`, `.sr-only-label`, `.fade-x` (fading edges of a horizontal scroller), `.press`, `.select-anim`, `.expand`, `.flip-in`, `.roll`, `.msg`, `.lifted`, `.screen-in` (`styles/motion.css`).

## Components

### Backdrop and layout

- **`Sky`** `phase?: "base" | "build" | "peak" | "race"`. Mounted once in `App.tsx` (and inside the onboarding overlay). The phase warms the top glow a touch toward race week, never brighter. Never add a background to a screen.
- **`Screen`** a tab's page: safe-area top, room for the tab bar at the bottom, 16 px gutters, 24 px between blocks. No props for color.
- **`LogoSlot`** `size?`. The logo (bib on the peach sky, `public/logo.svg`), rounded like the app icon. Sources live in `design/logo/`.
- **`EmptyState`** `icon, title, children?, action?`. Nothing to show or a failed load: icon, one sentence, always a way forward (a button). **`LoadFailed`** `title, what, onRetry` is its failed-read form, with Réessayer.
- **`Skeleton`** `label?, className?`. The place of content on its way, at its final height (a screen, three slot cards), breathing slowly. Only the first of a list has a `label`.
- **`ChunkBoundary`** `fallback(retry), onError?` and **`lazyChunk(load)`**: around every `Suspense`. A file that did not load breaks its own block, never the app; Réessayer asks the network again. `Chunk.preload()` fetches it at idle, after which it renders at once.

### Content

- **`Surface`** `variant?: "card" | "inset" | "sheet" | "widget"`, `as?`. `card`: a main block (the day's session, the goal). `inset`: grouped lists and small blocks (a sheet's groups turn plain white). `widget`: Reggie's cards and bubbles, the same glass as `inset`. `sheet`: used by `Sheet` only. Selectable cards are `ChoiceCard`.
- **`ChoiceCard`** `on, tone?: "action" | "reggie", layout?: "row" | "tile", flat?`. The one selection treatment (light tint, 2 px outline, check in a circle) for every list of choices in sheets and in the onboarding; put in a `ChoiceGroup`. Chips use the same three signs.
- **`WeekStrip`** `days, label, onSelect?, footer?`. The week's seven days on Aujourd'hui and on Semaine, built by `stripOf` (features/week/week.ts): a bar per run, one mark per other kind, no legend.
- **`List`**: `SectionTitle` (role 1, 20 px: a section of a screen) and `GroupLabel` (role 2, caption: over a group); `Section` (a `GroupLabel`, content and footnote), `Group` (an inset surface), `RowButton` (label, value, chevron), `RowSelect` (native iOS wheel), `RowInput` (text, date, time). Dates and times show the app's own wording ("lundi 16 novembre", "7:30") over the native field, which still opens the iOS wheel. Placeholders start with "Ex. :".
- **`PaceValue`** `value, unit?, size?: "figure" | "num" | "title" | "strong", rolling?`. Every pace, time, duration or distance. Always ink and tabular; the unit is smaller in `ink-2`; `rolling` makes digits roll when the value changes.
- **`SessionShape`** `steps, tone`. The session drawn as rounded bars: warm-up, one bar per repeat (with its recovery low between), cool-down; height is effort, color is the type. Use it wherever a session is shown in some size: day card, detail, and next on Semaine rows, Reggie's widgets, the move and change sheets. Logic in `session-shape.ts` (tested).
- **`TimeBoxes`** `seconds, onChange, maxHours?`. A target time in two glass boxes, « h » and « min », typed on the number pad (`inputMode="numeric"`). Her target time, never a proposed one. No custom wheels.
- **`SessionChip`** `tone, children?`. The type as a pill (wash, dot, deep label). Defaults to the type's name ("Intense"); pass the session's title to name it.
- **`IconTile`**, **`Dot`**, **`Typing`** (`text?` for "Je vérifie"), **`RollingText`** in `bits.tsx`. A `Dot` always goes with a word.
- **`tones.ts`**: `Tone` and `TONES`.

### Controls (`controls.tsx`, glisse)

- **`Button`** `variant?: "filled" | "tinted" | "glass"`, `size?: "regular" | "large" | "round"`, `tone?: "action" | "reggie" | "danger"`, `icon?`. One `filled` per view (a sheet's footer, a screen's main action); `tinted` for a secondary action that belongs to the moment (Reggie's "Accepter", "Ce cours n'a pas lieu"); `glass` for everything else. `large` 50 px for a sheet's main button. Disabled never fades the color: a quiet track and an `ink-3` label, with the reason said above it.
- **`IconButton`** `icon, label` (required, VoiceOver reads it) plus the `Button` props.
- **`Chip`** `selected?, tone?: "action" | "reggie", icon?`. A choice among a few (days "Lun Mar", pain zones, ressenti, Reggie's replies in his green) or a shortcut (no `selected`). Wrap choices in `ChoiceGroup`.
- **`SegmentedControl`** `items, value, onChange, label`. 2 to 4 short exclusive values (settings, durations). It fills its container.
- **`Switch`** `checked, onChange, labelledBy`. On is the action blue.
- **`Slider`** `id, value, onChange, min, max, valueText`. Ink fill: a level, not an action.
- **`Input`** `id, value, onChange, placeholder, action?`. A free text field in glass, `action` (the send button) drawn inside it at the trailing end (Reggie's composer, "Dis-le à Reggie"). Form rows use `RowInput`.
- **`TabBar`** `tabs, active, onNavigate`. iOS 26 floating bar; the current tab in the action blue, Reggie's in his green. Real links.
- **`TextButton`** `tone?: "action" | "danger" | "ink"`, `icon?`. Text only, no glass: sheet header actions, "Actualiser", "Placer", destructive rows inside a `Group` (`className="min-h-13 w-full"`).
- **`RoundAction`** `label, icon, reggie?, onPrepare?`. The 60 px actions under the day's session; only Reggie's is filled. `onPrepare` runs as the finger lands (the sheet's slots start loading).
- **`ChoiceGroup`** a fieldset with a hidden legend, so VoiceOver reads the question before the choices.

### Overlays

- **`Sheet`** `open, onOpenChange, title, subtitle?, onBack?, action?, cancelLabel?, footer?`. Rises on a spring over an ink scrim; pulled down by its top (120 px or a flick) it closes; Escape and a tap outside close it; focus moves in, the app behind is `inert`, focus returns on close; it sits above the keyboard. **One main action per sheet**: in `footer` (pinned, always visible, `Button variant="filled" size="large"`), or `action` ("OK" in the header) for a long form, never both. `onBack` replaces Annuler by a chevron for multi-step sheets. `busy` holds the footer (a disabled fieldset whose buttons breathe) and the header action while a change is on its way; `appear={false}` for a sheet that takes another's place without rising again. Under reduced motion it fades in 150 ms. Sheets open through `features/sheets` (`useSheet().show(...)`, `replace(...)` for the next step of a flow); Back (Android, browser) closes them.
- **Toast**: call `notify(message, action?, duration?)` from `toast.ts`. Sonner loads at idle or with the first one; `Toast.tsx` styles it as a centered glass pill above the tab bar (`.ui-toast`), its action in the action blue. 6 s. If Sonner cannot load (offline before it was cached), `ToastHost` draws the same pill itself.

## Accessibility and performance contract

- Targets 44 px, contrast 4.5:1 (ratios noted in `tokens.css`), visible focus (2 px action outline), `prefers-reduced-motion` (fades only, still sky), `prefers-reduced-transparency` (solid surfaces, no blur), `prefers-contrast: more` (outlined surfaces).
- glisse is patched (`patches/glisse@0.6.0.patch`): no backdrop bending on phones and touch screens (Chromium draws it on the CPU), rim PNGs encoded in a worker (CSP `worker-src blob:`), the tab bar's held lens computed on the first touch. Without these the first screen spent 400 ms of main thread on Lighthouse's phone.
- glisse's script is not in the first file: buttons, chips and the tab bar render glisse's own markup (its stylesheet is in `app.css`) and become glisse once the first gesture ends; fields, switches, sliders and segmented controls load with it (`lazy`). The first file stays near 117 KB gzip.
- No document view transition between tabs: it crashed WebKit when the new screen was taller. The new screen fades in (`.screen-in`).
