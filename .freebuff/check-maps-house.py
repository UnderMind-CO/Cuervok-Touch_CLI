import json, glob, os, re

mapsdir = r"C:\Users\Jhoan\Downloads\Dof test\DofusTouch\TouchEmu-Cuervok\data\maps"
files = sorted(glob.glob(os.path.join(mapsdir, "*.json")))
found = []
for fn in files:
    try:
        raw = open(fn, encoding="utf-8").read()
    except Exception:
        continue
    if re.search(r'"house[s]?"\s*:', raw, re.I):
        found.append(fn)
        if len(found) >= 5:
            break
print("maps with house key:", found)
# check the official CDN map for one map (e.g. a big city) for house data
import urllib.request
for mid in [68295683, 153443586, 187904944, 163317248]:
    try:
        raw = urllib.request.urlopen(f"https://dofustouch.cdn.ankama.com/world/v2_29/maps/{mid}.json", timeout=15).read().decode()
        has_house = re.search(r'"houses?"\s*:', raw)
        print(mid, "cdn has house key:", bool(has_house), "len:", len(raw))
        if has_house:
            i = raw.find('"houses"')
            print("   ", raw[i:i+300])
    except Exception as e:
        print(mid, "ERR", e)
