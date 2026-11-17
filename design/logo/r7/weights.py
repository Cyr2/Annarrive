"""Allura A on the Papier bib at several weights: argv[1]=Allura glyph svg, argv[2]=out html."""
import re, sys

d = re.search(r'd="([^"]*)"', open(sys.argv[1], encoding="utf-8").read()).group(1)
BIB = ('<g transform="rotate(-6 128 128)"><rect x="53" y="74" width="150" height="108" rx="18" fill="#fff"/>'
       '<g fill="#F5B3BE"><circle cx="70" cy="91" r="5"/><circle cx="186" cy="91" r="5"/>'
       '<circle cx="70" cy="165" r="5"/><circle cx="186" cy="165" r="5"/></g></g>')
# Thickening = an outline stroke of the same colour around the glyph, in glyph units (x0.48 on the icon).
WEIGHTS = [(0, "Allura d'origine"), (6, "Un peu plus épais"), (10, "Plus épais"), (14, "Nettement plus épais")]

def mark(w):
    stroke = f' stroke="#EE8A68" stroke-width="{w}" stroke-linejoin="round"' if w else ""
    return (f'<svg viewBox="0 0 256 256">{BIB}<g transform="rotate(-6 128 128) translate(128 129) scale(.48) translate(-128 -128)">'
            f'<path d="{d}" fill="#EE8A68"{stroke}/></g></svg>')

cards = "".join(
    f'<div class="card"><div class="icon">{mark(w)}</div><div class="small"><div class="icon" style="width:60px;height:60px">{mark(w)}</div>'
    f'<div class="icon" style="width:40px;height:40px">{mark(w)}</div><div class="icon" style="width:29px;height:29px">{mark(w)}</div></div>'
    f'<h2>{i} · {label}</h2></div>' for i, (w, label) in enumerate(WEIGHTS, 1))
css = """*{box-sizing:border-box;margin:0}body{font-family:-apple-system,"Segoe UI",sans-serif;color:#23303D;background:#FBF8F6;padding:40px;width:1600px}
h1{font-size:30px;font-weight:800}.sub{color:#5B6775;font-size:16px;margin:6px 0 24px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}.card{background:#fff;border-radius:26px;padding:22px}
.icon{width:220px;height:220px;border-radius:22.4%;margin:0 auto;position:relative;overflow:hidden;box-shadow:0 6px 18px rgba(35,48,61,.10);background:linear-gradient(170deg,#FCD7C4 0%,#F8BFA9 55%,#F5B3BE 100%)}
.icon::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.9);background:radial-gradient(120% 60% at 30% 0%,rgba(255,255,255,.45),transparent 60%)}
.icon svg{position:absolute;inset:0;width:100%;height:100%}.small{display:flex;gap:14px;align-items:flex-end;justify-content:center;margin-top:16px}
h2{font-size:18px;font-weight:800;margin-top:16px;text-align:center}"""
open(sys.argv[2], "w", encoding="utf-8").write(
    f'<!doctype html><html lang="fr"><meta charset="utf-8"><style>{css}</style><body><h1>Dossard Papier · Allura, quatre épaisseurs</h1>'
    f'<p class="sub">En grand, puis à 60 px (écran d\'accueil), 40 px (Spotlight) et 29 px (Réglages).</p><div class="grid">{cards}</div></body></html>')
