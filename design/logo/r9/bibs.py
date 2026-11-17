"""Bib variants with a race number and small print: argv[1]=fonts dir, argv[2]=Allura A glyph svg, argv[3]=out html."""
import re, sys

fonts, glyph, out = sys.argv[1].replace("\\", "/"), sys.argv[2], sys.argv[3]
a = re.search(r'd="([^"]*)"', open(glyph, encoding="utf-8").read()).group(1)
CORAL, PIN = "#EE8A68", "#F5B3BE"
BIB = (f'<rect x="53" y="74" width="150" height="108" rx="18" fill="#fff"/><g fill="{PIN}"><circle cx="70" cy="91" r="5"/>'
       '<circle cx="186" cy="91" r="5"/><circle cx="70" cy="165" r="5"/><circle cx="186" cy="165" r="5"/></g>')

def small(text, spacing):
    return (f'<text x="128" y="99" text-anchor="middle" font-family="Barlow SemiBold" font-size="13" letter-spacing="{spacing}" '
            f'fill="{CORAL}">{text}</text>')

def number(text, family, size, y):
    return f'<text x="128" y="{y}" text-anchor="middle" font-family="{family}" font-size="{size}" fill="{CORAL}">{text}</text>'

A_SMALL = (f'<g transform="translate(128 140) scale(.36) translate(-128 -128)"><path d="{a}" fill="{CORAL}" stroke="{CORAL}" '
           'stroke-width="12" stroke-linejoin="round"/></g>')
VARIANTS = [
    ("14 + ANNARRIVÉ", small("ANNARRIVÉ", 2.2) + number("14", "Barlow Bold", 66, 166)),
    ("14 + ANNA", small("ANNA", 5) + number("14", "Barlow Bold", 66, 166)),
    ("14 calligraphié + ANNARRIVÉ", small("ANNARRIVÉ", 2.2) + number("14", "Allura", 74, 166)),
    ("A calligraphié + ANNARRIVÉ", small("ANNARRIVÉ", 2.2) + A_SMALL),
]

def svg(inner):
    return f'<svg viewBox="0 0 256 256">{BIB}{inner}</svg>'

cards = "".join(
    f'<div class="card"><div class="icon">{svg(v)}</div><div class="small"><div class="icon" style="width:60px;height:60px">{svg(v)}</div>'
    f'<div class="icon" style="width:40px;height:40px">{svg(v)}</div></div><h2>{i} · {label}</h2></div>'
    for i, (label, v) in enumerate(VARIANTS, 1))
css = f"""@font-face{{font-family:"Barlow Bold";src:url("file:///{fonts}/BarlowCondensed-Bold.ttf")}}
@font-face{{font-family:"Barlow SemiBold";src:url("file:///{fonts}/BarlowCondensed-SemiBold.ttf")}}
@font-face{{font-family:"Allura";src:url("file:///{fonts}/Allura-Regular.ttf")}}
*{{box-sizing:border-box;margin:0}}body{{font-family:-apple-system,"Segoe UI",sans-serif;color:#23303D;background:#FBF8F6;padding:40px;width:1600px}}
h1{{font-size:30px;font-weight:800}}.sub{{color:#5B6775;font-size:16px;margin:6px 0 24px}}
.grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}}.card{{background:#fff;border-radius:26px;padding:22px}}
.icon{{width:220px;height:220px;border-radius:22.4%;margin:0 auto;position:relative;overflow:hidden;box-shadow:0 6px 18px rgba(35,48,61,.10);background:linear-gradient(170deg,#FCD7C4 0%,#F8BFA9 55%,#F5B3BE 100%)}}
.icon::after{{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.9);background:radial-gradient(120% 60% at 30% 0%,rgba(255,255,255,.45),transparent 60%)}}
.icon svg{{position:absolute;inset:0;width:100%;height:100%}}.small{{display:flex;gap:14px;align-items:flex-end;justify-content:center;margin-top:16px}}
h2{{font-size:18px;font-weight:800;margin-top:16px;text-align:center}}"""
open(out, "w", encoding="utf-8").write(
    f'<!doctype html><html lang="fr"><meta charset="utf-8"><style>{css}</style><body><h1>Dossard Papier · un vrai dossard</h1>'
    f'<p class="sub">Numéro de course en grand, nom en petit en haut, comme sur un dossard de course. Dossard droit.</p><div class="grid">{cards}</div></body></html>')
