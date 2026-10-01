import json, glob, os
from collections import Counter

base = r"C:\Users\Jhoan\Downloads\Dof test\DofusTouch\TouchEmu-Cuervok\data"
igfx = json.load(open(base + r"\InteractiveGfx.json", encoding="utf-8"))
# gfx -> (typeId, skillId)
gfx_info = {int(k): v for k, v in igfx.items()}

mapsdir = base + r"\maps"
files = glob.glob(os.path.join(mapsdir, "*.json"))
print("maps:", len(files))

# collect all midground gfx ids present on maps, grouped by InteractiveGfx typeId
type_gfx = {}
cell_gfx = Counter()
n = 0
for fn in files:
    try:
        m = json.load(open(fn, encoding="utf-8"))
    except Exception:
        continue
    ml = m.get("midgroundLayer") or {}
    for layer, cells in ml.items():
        for c in cells:
            g = c.get("g")
            if g is None:
                continue
            gi = int(g)
            cell_gfx[gi] += 1
            info = gfx_info.get(gi)
            t = info["typeId"] if info else -1
            type_gfx.setdefault(t, set()).add(gi)
    n += 1
    if n >= 3000:
        break

print("gfx seen on maps:", len(cell_gfx))
# typeId distribution of gfx seen on maps
type_counts = Counter()
for t, gset in type_gfx.items():
    cnt = sum(cell_gfx[g] for g in gset)
    type_counts[t] = (len(gset), cnt)
for t, (ngfx, ncells) in sorted(type_counts.items()):
    print("typeId", t, "-> gfx:", ngfx, "cells:", ncells)
