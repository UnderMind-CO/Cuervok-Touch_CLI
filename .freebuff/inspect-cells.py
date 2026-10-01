import json, glob, os

base = r"C:\Users\Jhoan\Downloads\Dof test\DofusTouch\TouchEmu-Cuervok\data\maps"
# Astrub area maps (typical ids ~ 6829xxxx)
files = glob.glob(os.path.join(base, "6829*.json")) + glob.glob(os.path.join(base, "6828*.json"))
print("astrub maps:", len(files))
m = json.load(open(files[0], encoding="utf-8"))
cell = m["cells"][0]
print("cell keys:", sorted(cell.keys()))
print("cell sample:", json.dumps(cell, ensure_ascii=False)[:400])
# midground sample
ml = m.get("midgroundLayer") or {}
for layer, cells in list(ml.items())[:2]:
    print("layer", layer, "cells:", len(cells))
    if cells:
        print("  cell0:", json.dumps(cells[0], ensure_ascii=False)[:300])
        break
