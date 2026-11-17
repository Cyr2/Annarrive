"""Build the Annarrivé logo masters (text converted to outlines) from OFL fonts.

Usage: python -I build.py <fonts dir> <out dir>
Fonts: BarlowCondensed-Bold.ttf, BarlowCondensed-SemiBold.ttf, Barlow-Bold.ttf (SIL OFL 1.1).
"""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONTS, OUT = sys.argv[1], sys.argv[2]
SKY = ("#FCD7C4", "#F8BFA9", "#F5B3BE")
CORAL, PIN, PAPER, INK = "#EE8A68", "#F5B3BE", "#FFFFFF", "#23303D"
NUMBER, PRINT, NAME = "14", "ANNARRIVÉ", "Annarrivé"


def text_path(font_file, text, size, cx, baseline, spacing=0.0):
    """Outline `text` centred on cx, sitting on `baseline`, as one SVG path (no font needed to display it)."""
    font = TTFont(os.path.join(FONTS, font_file))
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    s = size / font["head"].unitsPerEm
    names = [cmap[ord(c)] for c in text]
    width = sum(hmtx[n][0] * s for n in names) + spacing * (len(names) - 1)
    x, pen = cx - width / 2, SVGPathPen(gs)
    for n in names:
        gs[n].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        x += hmtx[n][0] * s + spacing
    return pen.getCommands()


def bbox_of(font_file, text, size):
    font = TTFont(os.path.join(FONTS, font_file))
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    bp = BoundsPen(gs)
    gs[cmap[ord(text[0])]].draw(bp)
    return bp.bounds[3] * size / font["head"].unitsPerEm  # cap height of the first glyph


def gradient(gid):
    stops = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in zip(("0", ".55", "1"), SKY))
    return f'<linearGradient id="{gid}" x1=".45" y1="0" x2=".55" y2="1">{stops}</linearGradient>'


PINS = [(70, 91), (186, 91), (70, 165), (186, 165)]


def bib(paper, ink, pin, small_print=True, outline=False):
    """The bib in the 256 box: 150x108 card, four pins, race number, small print at the bottom."""
    if outline:  # one-colour versions: the card becomes a ring so the number keeps reading as a bib
        card = (f'<path fill="{paper}" fill-rule="evenodd" d="M71 74h114a18 18 0 0 1 18 18v72a18 18 0 0 1-18 18H71a18 18 0 0 1-18-18V92'
                'a18 18 0 0 1 18-18zm0 8a10 10 0 0 0-10 10v72a10 10 0 0 0 10 10h114a10 10 0 0 0 10-10V92a10 10 0 0 0-10-10z"/>')
    else:
        card = f'<rect x="53" y="74" width="150" height="108" rx="18" fill="{paper}"/>'
    pins = "".join(f'<circle cx="{x}" cy="{y}" r="5"/>' for x, y in PINS)
    num_base = 150 if small_print else 155
    out = card + f'<g fill="{pin}">{pins}</g>'
    out += f'<path fill="{ink}" d="{text_path("BarlowCondensed-Bold.ttf", NUMBER, 74 if small_print else 84, 128, num_base)}"/>'
    if small_print:
        out += f'<path fill="{ink}" d="{text_path("BarlowCondensed-SemiBold.ttf", PRINT, 13, 128, 171, 2.2)}"/>'
    return out


def svg(body, w=256, h=256, title="Annarrivé"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><title>{title}</title>{body}</svg>\n'


def write(name, content):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)


def small_cut():
    """Favicon cut: no small print, no pins, bigger bib and number so it holds at 16 px."""
    card = '<rect x="24" y="56" width="208" height="144" rx="26" fill="#fff"/>'
    num = text_path("BarlowCondensed-Bold.ttf", NUMBER, 138, 128, 176)
    return card + f'<path fill="{CORAL}" d="{num}"/>'


os.makedirs(OUT, exist_ok=True)
defs = f"<defs>{gradient('sky')}</defs>"
square = f'{defs}<rect width="256" height="256" fill="url(#sky)"/>'
tile = f'{defs}<rect width="256" height="256" rx="57" fill="url(#sky)"/>'

write("annarrive-icone-carree.svg", svg(square + bib(PAPER, CORAL, PIN)))  # iOS and maskable: full bleed, the OS rounds it
write("annarrive-icone.svg", svg(tile + bib(PAPER, CORAL, PIN)))  # rounded tile, transparent corners
write("annarrive-favicon.svg", svg(tile + small_cut()))
write("annarrive-une-couleur.svg", svg(bib(CORAL, CORAL, CORAL, outline=True)))
write("annarrive-blanc.svg", svg(bib(PAPER, PAPER, PAPER, outline=True)))

# Lockup: icon tile + name, height 256, name in Barlow Bold set in the text colour.
name = text_path("Barlow-Bold.ttf", NAME, 120, 0, 0)
font = TTFont(os.path.join(FONTS, "Barlow-Bold.ttf"))
adv = sum(font["hmtx"][font.getBestCmap()[ord(c)]][0] for c in NAME) * 120 / font["head"].unitsPerEm
cap = bbox_of("Barlow-Bold.ttf", "A", 120)
lock_w = round(256 + 40 + adv + 8)
name_g = f'<g transform="translate({296 + adv / 2} {128 + cap / 2})"><path fill="{INK}" d="{name}"/></g>'
write("annarrive-horizontal.svg", svg(tile + bib(PAPER, CORAL, PIN) + name_g, lock_w, 256))
write("annarrive-horizontal-blanc.svg", svg(tile + bib(PAPER, CORAL, PIN) + name_g.replace(INK, PAPER), lock_w, 256))
print("ok", lock_w)
