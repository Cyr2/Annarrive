"""Extract the capital A of each font as an SVG path normalised to a 256 box: argv[1]=fonts dir, argv[2]=out dir."""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for name in sorted(os.listdir(src)):
    font = TTFont(os.path.join(src, name))
    gs = font.getGlyphSet()
    glyph = font.getBestCmap().get(ord("A"))
    if glyph is None:
        continue
    bp = BoundsPen(gs)
    gs[glyph].draw(bp)
    x0, y0, x1, y1 = bp.bounds
    s = 200 / max(x1 - x0, y1 - y0)
    # Flip y (font units go up) and centre in a 256 box.
    tx = 128 - (x0 + x1) / 2 * s
    ty = 128 + (y0 + y1) / 2 * s
    pen = SVGPathPen(gs)
    gs[glyph].draw(TransformPen(pen, (s, 0, 0, -s, tx, ty)))
    stem = name.rsplit("-", 1)[0]
    with open(os.path.join(out, stem + ".svg"), "w", encoding="utf-8") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="{pen.getCommands()}"/></svg>\n')
    print(stem)
