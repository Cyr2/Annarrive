# Logo Annarrivé

Un dossard de course : le 14 d'Anna en grand, ANNARRIVÉ en petit en bas, épinglé aux quatre coins, sur le ciel pêche de l'app.

## Fichiers

| Fichier | Usage |
|---|---|
| `annarrive-icone.svg` | Logo maître : tuile arrondie. Utilisé dans l'app (`public/logo.svg`, `LogoSlot`). |
| `annarrive-icone-carree.svg` | Même dessin sans arrondi : iOS et l'icône maskable (le système arrondit). |
| `annarrive-favicon.svg` | Version petite taille, sans épingles ni petit texte : favicon et `public/icon.svg`. |
| `annarrive-une-couleur.svg` / `annarrive-blanc.svg` | Une couleur (corail) et inversée (blanc), dossard en contour. |
| `annarrive-horizontal.svg` / `-blanc.svg` | Icône + nom, sur fond clair / sur fond foncé ou coloré. |
| `png/` | 1024 (App Store / maître), 180 (apple-touch-icon), 192 et 512 (PWA), maskable 512, favicon 16/32 et `.ico`. |
| `build.py` | Régénère tous les SVG depuis les polices (`python -I build.py <dossier polices> .`). |

## Couleurs

| Rôle | Hex |
|---|---|
| Ciel (dégradé haut → bas) | `#FCD7C4` → `#F8BFA9` → `#F5B3BE` |
| Numéro et texte | `#EE8A68` (corail) |
| Épingles | `#F5B3BE` (rose) |
| Dossard | `#FFFFFF` |
| Nom dans le lockup | `#23303D` (texte de l'app) |

## Typographie

Barlow Condensed Bold (numéro), Barlow Condensed SemiBold (ANNARRIVÉ), Barlow Bold (nom dans le lockup). Licence SIL OFL 1.1, usage en logo autorisé. Tous les textes sont convertis en formes : aucune police n'est nécessaire pour afficher le logo.

## Règles

- Zone de protection : la hauteur d'une épingle × 3 tout autour de la tuile.
- Taille minimale : 40 px pour l'icône complète ; en dessous, la version favicon.
- Toujours sur la tuile ou en version une couleur. Ne pas poser le dossard blanc seul sur un fond clair.
- Ne pas incliner, recolorer le numéro, ajouter d'ombre ou changer le 14.

## Tests faits

Audit SVG, rendus de 16 à 1024 px, une couleur, inversé, test de voisinage sur un écran d'accueil (applis génériques). Le petit texte ANNARRIVÉ n'est lisible qu'à partir d'environ 120 px : en dessous il fait texture, c'est voulu. Aucune recherche d'antériorité de marque n'a été faite.
