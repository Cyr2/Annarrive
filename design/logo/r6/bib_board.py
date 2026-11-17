"""Board of calligraphic A's on the 'Papier' bib: argv[1]=glyph dir, argv[2]=out html, argv[3:]=font stems."""
import re, sys, os

src, out, stems = sys.argv[1], sys.argv[2], sys.argv[3:]
BIB = ('<g transform="rotate(-6 128 128)"><rect x="53" y="74" width="150" height="108" rx="18" fill="#fff"/>'
       '<g fill="#F5B3BE"><circle cx="70" cy="91" r="5"/><circle cx="186" cy="91" r="5"/>'
       '<circle cx="70" cy="165" r="5"/><circle cx="186" cy="165" r="5"/></g></g>')

def mark(d):
    # Glyph is normalised to a 200 box centred on 128; shrink it into the bib and tilt it with the bib.
    return (f'<svg viewBox="0 0 256 256">{BIB}<g transform="rotate(-6 128 128) translate(128 129) scale(.46) translate(-128 -128)">'
            f'<path d="{d}" fill="#EE8A68"/></g></svg>')

cards = []
for i, s in enumerate(stems, 1):
    d = re.search(r'd="([^"]*)"', open(os.path.join(src, s + ".svg"), encoding="utf-8").read()).group(1)
    m = mark(d)
    cards.append(f'<div class="card"><div class="icon">{m}</div><div class="small"><div class="icon" style="width:60px;height:60px">{m}</div>'
                 f'<div class="icon" style="width:40px;height:40px">{m}</div></div><h2>{i} · {s}</h2></div>')
css = """*{box-sizing:border-box;margin:0}body{font-family:-apple-system,"Segoe UI",sans-serif;color:#23303D;background:#FBF8F6;padding:40px;width:1600px}
h1{font-size:30px;font-weight:800}.sub{color:#5B6775;font-size:16px;margin:6px 0 24px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}.card{background:#fff;border-radius:26px;padding:22px}
.icon{width:190px;height:190px;border-radius:22.4%;margin:0 auto;position:relative;overflow:hidden;box-shadow:0 6px 18px rgba(35,48,61,.10);background:linear-gradient(170deg,#FCD7C4 0%,#F8BFA9 55%,#F5B3BE 100%)}
.icon::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.9);background:radial-gradient(120% 60% at 30% 0%,rgba(255,255,255,.45),transparent 60%)}
.icon svg{position:absolute;inset:0;width:100%;height:100%}.small{display:flex;gap:14px;align-items:flex-end;justify-content:center;margin-top:16px}
h2{font-size:18px;font-weight:800;margin-top:16px;text-align:center}"""
html = (f'<!doctype html><html lang="fr"><meta charset="utf-8"><style>{css}</style><body><h1>Dossard Papier · A calligraphiés</h1>'
        f'<p class="sub">Huit A tirés de polices calligraphiques libres (OFL), posés sur le dossard.</p><div class="grid">{"".join(cards)}</div></body></html>')
open(out, "w", encoding="utf-8").write(html)
