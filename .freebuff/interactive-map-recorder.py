#!/usr/bin/env python3
"""
Interactive Map Recorder
========================
Records the correct interactive elements per map from manual exploration
of the official Dofus Touch game, then generates server-side overrides.

Usage:
  python interactive-map-recorder.py add <mapId> <cellId> <type> <description> [targetMapId]
  python interactive-map-recorder.py remove <mapId> <cellId>
  python interactive-map-recorder.py list [mapId]
  python interactive-map-recorder.py apply
  python interactive-map-recorder.py generate-server-code

Types:
  house_door       - Puerta de casa (needs houseId)
  temple_door      - Puerta de templo / cambio de zona
  zaap             - Zaap (teletransportador)
  resource         - Recurso recolectable
  craft_station    - Estación de trabajo
  door             - Puerta genérica / cambio de zona
  other            - Otro interactivo

Examples:
  python interactive-map-recorder.py add 88081686 384 temple_door "Entrada templo Xelor" 70631183
  python interactive-map-recorder.py add 88081686 392 house_door "Casa 1" --house-id=12495
  python interactive-map-recorder.py add 88081686 394 house_door "Casa 2" --house-id=12496
  python interactive-map-recorder.py apply
"""

import json
import os
import sys
import hashlib
from pathlib import Path

DATA_FILE = Path(__file__).parent / "interactive-overrides.json"

# The data directory of the TouchEmu server
SERVER_DATA = Path(r"C:\Users\Jhoan\Downloads\Dof test\DofusTouch\TouchEmu-Cuervok\data")


def load_overrides():
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"maps": {}}


def save_overrides(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Saved to {DATA_FILE}")


def generate_element_id(map_id, cell_id, type_name):
    """Generate a stable element ID from map+cell+type using a deterministic hash."""
    raw = f"{map_id}:{cell_id}:{type_name}"
    h = hashlib.md5(raw.encode()).hexdigest()
    # Use a range that doesn't collide with CDN element IDs (400000-600000 range)
    return 900_000_000 + (int(h[:8], 16) % 10_000_000)


def cmd_add(args):
    if len(args) < 4:
        print("Usage: add <mapId> <cellId> <type> <description> [targetMapId]")
        print("Types: house_door, temple_door, zaap, resource, craft_station, door, other")
        return

    map_id = int(args[0])
    cell_id = int(args[1])
    type_name = args[2]
    description = args[3]
    target_map_id = int(args[4]) if len(args) > 4 else None

    # Parse optional --house-id=N
    house_id = None
    for arg in args[5:]:
        if arg.startswith("--house-id="):
            house_id = int(arg.split("=")[1])

    data = load_overrides()
    if str(map_id) not in data["maps"]:
        data["maps"][str(map_id)] = {"elements": []}

    # Check for duplicate cell
    elements = data["maps"][str(map_id)]["elements"]
    for e in elements:
        if e["cellId"] == cell_id:
            print(f"WARNING: Cell {cell_id} already has an entry: {e['description']}")
            print(f"  Updating it...")
            elements.remove(e)
            break

    element_id = generate_element_id(map_id, cell_id, type_name)

    entry = {
        "elementId": element_id,
        "cellId": cell_id,
        "type": type_name,
        "description": description,
    }
    if target_map_id:
        entry["targetMapId"] = target_map_id
    if house_id:
        entry["houseId"] = house_id

    elements.append(entry)
    save_overrides(data)

    print(f"Added: map {map_id} cell {cell_id} -> {type_name} ({description})")
    print(f"  Element ID: {element_id}")
    if target_map_id:
        print(f"  Target map: {target_map_id}")


def cmd_remove(args):
    if len(args) < 2:
        print("Usage: remove <mapId> <cellId>")
        return

    map_id = args[0]
    cell_id = int(args[1])

    data = load_overrides()
    if map_id not in data["maps"]:
        print(f"No overrides for map {map_id}")
        return

    elements = data["maps"][map_id]["elements"]
    before = len(elements)
    data["maps"][map_id]["elements"] = [e for e in elements if e["cellId"] != cell_id]
    after = len(data["maps"][map_id]["elements"])

    if before == after:
        print(f"No entry found for cell {cell_id} on map {map_id}")
    else:
        save_overrides(data)
        print(f"Removed cell {cell_id} from map {map_id}")


def cmd_list(args):
    data = load_overrides()
    if not data["maps"]:
        print("No overrides recorded yet.")
        return

    target_map = args[0] if args else None
    for map_id, map_data in sorted(data["maps"].items(), key=lambda x: int(x[0])):
        if target_map and map_id != target_map:
            continue
        elements = map_data["elements"]
        print(f"\nMap {map_id}: {len(elements)} overrides")
        for e in elements:
            target = f" -> map {e['targetMapId']}" if "targetMapId" in e else ""
            house = f" (house {e['houseId']})" if "houseId" in e else ""
            print(f"  cell {e['cellId']}: {e['type']} - {e['description']}{target}{house}")


def cmd_apply(args):
    """Apply overrides to HouseWorld.json and generate a pending interactive overrides file."""
    data = load_overrides()
    if not data["maps"]:
        print("No overrides to apply.")
        return

    # 1. Update HouseWorld.json with house door entries
    hw_path = SERVER_DATA / "HouseWorld.json"
    if hw_path.exists():
        with open(hw_path, "r", encoding="utf-8") as f:
            hw = json.load(f)
    else:
        hw = {}

    house_added = 0
    for map_id, map_data in data["maps"].items():
        for e in map_data["elements"]:
            if e["type"] == "house_door" and "houseId" in e:
                if map_id not in hw:
                    hw[map_id] = []
                # Check if already exists
                existing = [x for x in hw[map_id] if x.get("houseId") == e["houseId"]]
                if not existing:
                    hw[map_id].append({
                        "houseId": e["houseId"],
                        "modelId": 0,
                        "doorElementId": e["elementId"]
                    })
                    house_added += 1

    if house_added > 0:
        with open(hw_path, "w", encoding="utf-8") as f:
            json.dump(hw, f, indent=2, ensure_ascii=False)
        print(f"Added {house_added} house entries to HouseWorld.json")

    # 2. Write the interactive overrides file for the server
    overrides_path = SERVER_DATA / "interactive-overrides.json"
    server_overrides = {}
    for map_id, map_data in data["maps"].items():
        server_overrides[map_id] = []
        for e in map_data["elements"]:
            entry = {
                "elementId": e["elementId"],
                "cellId": e["cellId"],
                "type": e["type"],
                "description": e["description"],
            }
            if "targetMapId" in e:
                entry["targetMapId"] = e["targetMapId"]
            if "houseId" in e:
                entry["houseId"] = e["houseId"]
            server_overrides[map_id].append(entry)

    with open(overrides_path, "w", encoding="utf-8") as f:
        json.dump(server_overrides, f, indent=2, ensure_ascii=False)
    print(f"Wrote server overrides to {overrides_path}")
    print(f"Total maps with overrides: {len(server_overrides)}")


def cmd_generate_server_code(args):
    """Generate C# code snippet for the server to load interactive overrides."""
    data = load_overrides()
    if not data["maps"]:
        print("No overrides to generate code for.")
        return

    print("// ─── Auto-generated interactive overrides ───")
    print("// Paste this into MapManager.cs constructor, after loading InteractiveGfxData")
    print()
    print("this._interactiveOverrides = new Dictionary<long, List<InteractiveOverride>>();")
    
    for map_id, map_data in sorted(data["maps"].items(), key=lambda x: int(x[0])):
        print()
        print($"// Map {map_id}")
        for e in map_data["elements"]:
            target = e.get("targetMapId", 0)
            house = e.get("houseId", 0)
            print($"this._interactiveOverrides.GetOrAdd({map_id}, _ => new List<InteractiveOverride>()).Add(")
            print($"    new InteractiveOverride({e['elementId']}, {e['cellId']}, \"{e['type']}\", {target}, {house}));")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    cmd = sys.argv[1]
    rest = sys.argv[2:]

    commands = {
        "add": cmd_add,
        "remove": cmd_remove,
        "list": cmd_list,
        "apply": cmd_apply,
        "generate-server-code": cmd_generate_server_code,
    }

    if cmd in commands:
        commands[cmd](rest)
    else:
        print(f"Unknown command: {cmd}")
        print(f"Available: {', '.join(commands.keys())}")


if __name__ == "__main__":
    main()
