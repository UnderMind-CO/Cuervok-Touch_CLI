import json, os, glob

mapsdir = r"C:\Users\Jhoan\Downloads\Dof test\DofusTouch\TouchEmu-Cuervok\data\maps"
files = glob.glob(os.path.join(mapsdir, "*.json"))
print("map files:", len(files))
count = 0
for fn in files[:20000]:
    try:
        m = json.load(open(fn, encoding="utf-8"))
    except Exception:
        continue
    if "houses" in m and m["houses"]:
        print(os.path.basename(fn), "=>", json.dumps(m["houses"], ensure_ascii=False)[:300])
        count += 1
        if count >= 4:
            break
print("found", count)
