import json, glob, os

mapsdir = r"C:\Users\Jhoan\Downloads\Dof test\DofusTouch\TouchEmu-Cuervok\data\maps"
files = sorted(glob.glob(os.path.join(mapsdir, "*.json")))
print("files:", len(files))
m = json.load(open(files[0], encoding="utf-8"))
print("top-level keys:", sorted(m.keys()))
# look for any house-ish keys in several maps
import collections
keycount = collections.Counter()
for fn in files[:500]:
    try:
        mm = json.load(open(fn, encoding="utf-8"))
    except Exception:
        continue
    keycount.update(mm.keys())
print("keys across 500 maps:", dict(keycount))
# check interactive elements on one map
for fn in files[:50]:
    mm = json.load(open(fn, encoding="utf-8"))
    if "interactiveElements" in mm and mm["interactiveElements"]:
        print(fn, "interactives:", json.dumps(mm["interactiveElements"][0], ensure_ascii=False)[:300])
        break
