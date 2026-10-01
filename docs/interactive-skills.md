# Interactive Skills & Types Reference — Dofus Touch

> **Source of truth:** `data/official/ankama/Interactives.json` (201 types) + `TypeActions.json` (100+ action IDs)  
> **Implementation:** `MapManager.UseInteractiveCore()` → `BuildInteractiveElement()`  
> **Runtime data:** `Skills.json`, `InteractiveGfx.json` (loaded from game data, not in repo)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Interactive Action IDs (Type Actions)](#2-interactive-action-ids)
3. [Interactive Type Catalog](#3-interactive-type-catalog)
4. [Element IDs (Combat/Spell Types)](#4-element-ids)
5. [Skill IDs (Common)](#5-skill-ids-common)
6. [InteractiveGfx Mapping](#6-interactivegfx-mapping)
7. [Implementation Details](#7-implementation-details)

---

## 1. Architecture Overview

Interactive elements in Dofus Touch follow this data flow:

```
Map Cell → GfxId → InteractiveGfx → TypeId + SkillId
                                         ↓
                                    Interactives.json → Type Name
                                         ↓
                                    Skills.json → Skill Details (job, level, animation)
```

### Key Data Structures

| Data Source | Key | Value | Purpose |
|-------------|-----|-------|---------|
| `Interactives.json` | TypeId (int) | `{id, nameId, actionId, displayTooltip}` | Type catalog |
| `TypeActions.json` | EffectId (int) | `{id, elementName, elementId}` | Element mapping |
| `InteractiveGfx.json` | GfxId (int) | `{TypeId, SkillId, ResourceItem}` | Gfx → type mapping |
| `Skills.json` | SkillId (int) | `{ParentJobId, LevelMin, UseAnimation, ...}` | Skill details |

### InteractiveUseRequestMessage Fields

| Field | Type | Description |
|-------|------|-------------|
| `elemId` | long | Element ID on the map (unique per map) |
| `skillInstanceUid` | int | Composite: `53000000 + skillId * 100 + (elementId % 100)` |

---

## 2. Interactive Action IDs

The `actionId` in `Interactives.json` defines the behavior type:

| ActionId | Name | Description | Count |
|----------|------|-------------|-------|
| **0** | Inactive/Decoration | No interactive behavior (workshops, NPCs, buildings) | 89 |
| **1** | Resource Harvest | Collect resource (wood, ore, crop, fish, etc.) | 68 |
| **2** | Craft Station | Opens craft exchange UI | 31 |
| **3** | Zaap | Teleport network | 1 |
| **4** | Fountain of Youth | Revive/statue | 1 |
| **5** | Door | Zone transition | 1 |
| **6** | Safe/Trash | Bank or disposal | 2 |
| **7** | Pot (Crafting) | Cooking station | 1 |
| **10** | Zaapi | City teleport network | 1 |
| **11** | Restless (Special) | Special interaction | 1 |
| **12** | List of Craftsmen | Shows available crafters | 1 |
| **13** | Paddock | Mount management | 1 |
| **14** | Switch | Toggle mechanism | 1 |
| **15** | Class Statue | Class-specific interaction | 1 |
| **16** | Generic Interactive | Any interactive element (debug) | 1 |

---

## 3. Interactive Type Catalog

### ActionId 1 — Resource Harvest (68 types)

#### Wood (Lumberjacking)

| TypeId | Name | Region |
|--------|------|--------|
| 1 | Ash | Amakna |
| 8 | Oak | Amakna |
| 28 | Yew | Bonta/Brakmar |
| 29 | Ebony | Bonta |
| 30 | Elm | Bonta |
| 31 | Maple | Brakmar |
| 32 | Hornbeam | Brakmar |
| 33 | Chestnut | Amakna |
| 34 | Walnut | Amakna |
| 35 | Cherry | Amakna |
| 98 | Bombu | Kwismas |
| 101 | Oliviolet | Otomai |
| 108 | Bamboo | Pandala |
| 109 | Dark Bamboo | Pandala |
| 110 | Holy Bamboo | Pandala |
| 121 | Kaliptus | Kozlov |
| 133 | Aspen | Frigost |
| 134 | Frosteez | Frigost |
| 135 | Obsidian | Frigost |

#### Ore (Mining)

| TypeId | Name | Region |
|--------|------|--------|
| 17 | Iron | Amakna |
| 24 | Silver | Amakna |
| 25 | Gold | Bonta |
| 26 | Bauxite | Brakmar |
| 37 | Cobalt | Amakna |
| 52 | Tin | Amakna |
| 53 | Copper | Amakna |
| 54 | Manganese | Amakna |
| 55 | Bronze | Amakna |
| 113 | Dolomite | Pandala |
| 114 | Silicate | Pandala |

#### Crops (Farming)

| TypeId | Name | Region |
|--------|------|--------|
| 38 | Wheat | Amakna |
| 39 | Hop | Amakna |
| 42 | Flax | Amakna |
| 43 | Barley | Amakna |
| 44 | Rye | Amakna |
| 45 | Oats | Amakna |
| 46 | Hemp | Amakna |
| 47 | Malt | Amakna |
| 48 | Potato heap | Amakna |
| 63 | Wheat (alt) | Amakna |
| 64 | Spelt | Amakna |
| 65 | Sorghum | Amakna |
| 66 | Wild Mint | Amakna |
| 67 | 5-Leaf Clover | Amakna |
| 68 | Freyesque Orchid | Amakna |
| 61 | Edelweiss | Amakna |
| 111 | Rice | Pandala |
| 112 | Pandkin | Pandala |
| 131 | Snowdrop | Frigost |

#### Fishing

| TypeId | Name | Region |
|--------|------|--------|
| 71 | Small sea fish | Ocean |
| 72 | Aggressive Salmoon | Ocean |
| 73 | Octopwus | Ocean |
| 74 | River fish | River |
| 75 | Small river fish | River |
| 76 | Large river fish | River |
| 77 | Sea fish | Ocean |
| 78 | Large sea fish | Ocean |
| 79 | Giant river fish | River |
| 80 | Sludgy Trout | River |
| 81 | Giant sea fish | Ocean |
| 132 | Frigost fish | Frigost |

#### Other Resources

| TypeId | Name | Type |
|--------|------|------|
| 82 | Cotton | Fiber |
| 84 | Well | Water |
| 99 | Strange shadow | Special |
| 100 | Snapper | Special |
| 102 | Strength machine | Machine |
| 104 | Quaquack | Special |
| 225 | Piraniak | Special |

### ActionId 2 — Craft Stations (31 types)

| TypeId | Name | Job |
|--------|------|-----|
| 2 | Saw | Lumberjack |
| 11 | Crafting table | General |
| 12 | Workshop | General |
| 13 | Bench | General |
| 15 | Cauldron | Alchemist |
| 22 | Oven | Baker |
| 27 | Mould | Smith |
| 40 | Mill | Miller |
| 41 | Grind | Miller |
| 49 | Potato table | Farmer |
| 50 | Crusher | Farmer |
| 57 | Anvil | Smith |
| 58 | Sewing machine | Tailor |
| 62 | Alembic | Alchemist |
| 69 | Mortar and pestle | Alchemist |
| 83 | Spinner | Tailor |
| 86 | Sewing machine | Tailor |
| 88 | Wooden bench | Lumberjack |
| 90 | Alembic | Alchemist |
| 92 | Magic anvil | Smithmagus |
| 93 | Munster Crusher | Farmer |
| 94–97 | Workbench (4 variants) | Various |
| 103 | Pyrotechnic workbench | Crafter |
| 107 | Shield anvil | Smith |
| 116 | Magic sewing machine | Smithmagus |
| 117 | Magic workshop | Smithmagus |
| 118 | Magic table | Smithmagus |
| 122 | Workbench | General |

### Special Types (ActionId 3–16)

| TypeId | Name | ActionId | Behavior |
|--------|------|----------|----------|
| 16 | Zaap | 3 | Teleport network (bind/teleport) |
| 56 | Fountain of Youth | 4 | Revive ghost players |
| 70 | Door | 5 | Zone transition |
| 85 | Safe | 6 | Bank access |
| 60 | Pot | 7 | Cooking station |
| 105 | Trash | 6 | Item disposal |
| 106 | Zaapi | 10 | City teleport |
| 115 | Restless | 11 | Special interaction |
| 119 | List of Craftsmen | 12 | Craft list UI |
| 120 | Paddock | 13 | Mount management |
| 127 | Switch | 14 | Toggle mechanism |
| 128 | Class statue | 15 | Class-specific |

### Inactive/Decoration Types (ActionId 0, 89 types)

These are interactive elements that exist in the data but have no active behavior in the emulator:

| Category | Examples |
|----------|----------|
| Workshops | Alchemists', Jewellers', Butchers', Smiths', etc. |
| Buildings | Arena, Bank, Church, Town Hall, Library |
| Inns | 20+ named inns (Bwork, Drunken Pandawa, etc.) |
| Special | Krosmaster, Altar, Barrel of explosives |
| Decorative | Shell, Gift Package, Fresh Cawwot |

---

## 4. Element IDs

The `TypeActions.json` maps effect IDs to combat elements. These are the same element IDs used in the combat system:

| ElementId | Element Name | Color |
|-----------|-------------|-------|
| 0 | Neutral | White/Gray |
| 1 | Earth | Brown |
| 2 | Fire | Red |
| 3 | Water | Blue |
| 4 | Air | Green |
| 5 | None | — |

### Element ID Mapping by Effect Type

| Effect ID Range | Type | Elements |
|----------------|------|----------|
| 82–89 | Percent damage | Neutral(0), Earth(1), Fire(2), Water(3), Air(4) |
| 91–100 | Steals/Damage | Neutral(0), Earth(1), Fire(2), Water(3), Air(4) |
| 108 | Heal | Fire(2) |
| 112 | Damage | None(5) |
| 118, 157 | Strength | Earth(1) |
| 119, 154 | Agility | Air(4) |
| 123, 152 | Chance | Water(3) |
| 126, 155 | Intelligence | Fire(2) |
| 138 | Power | None(5) |
| 144 | Fixed neutral | Neutral(0) |
| 186 | Power debuff | None(5) |
| 225 | Trap damage | None(5) |
| 245 | Earth resistance | Earth(1) |
| 275–279 | % HP damage | All elements |

---

## 5. Skill IDs (Common)

These are the official skill IDs used in Dofus Touch. The emulator currently handles a subset:

### Zaap Skills

| SkillId | Name | Description | Status |
|---------|------|-------------|--------|
| 44 | Sauvegarder | Save respawn point | ✅ |
| 114 | Utiliser | Use zaap (teleport) | ✅ |

### Harvest Skills (from Skills.json at runtime)

| SkillId Range | Job | Description |
|---------------|-----|-------------|
| 1–50 | Lumberjack | Cut tree |
| 51–100 | Miner | Mine ore |
| 101–150 | Farmer | Harvest crop |
| 151–200 | Fisher | Fish |
| 201–250 | Alchemist | Gather plant |
| 251–300 | Hunter | Hunt monster |

### Craft Skills (from Skills.json at runtime)

| SkillId Range | Job | Description |
|---------------|-----|-------------|
| 301–350 | Smith | Forge weapons |
| 351–400 | Tailor | Sew equipment |
| 401–450 | Jeweler | Craft jewelry |
| 451–500 | Shoemaker | Craft shoes |
| 501–550 | Carver | Carve items |
| 551–600 | Handyman | Craft shields |
| 601–650 | Smithmagus | Craft magi items |

---

## 6. InteractiveGfx Mapping

The `InteractiveGfx.json` maps gfx IDs (from map data) to interactive types:

```json
{
  "gfxId": {
    "TypeId": int,       // Links to Interactives.json
    "SkillId": int,      // Links to Skills.json
    "ResourceItem": int  // > 0 = harvestable (item GID), 0 = craft station
  }
}
```

### Decision Flow in MapManager

```
Midground Cell → GfxId → InteractiveGfx Lookup
  ├── Found?
  │   ├── ResourceItem > 0 → Harvest (grant item, animate, respawn)
  │   └── ResourceItem == 0 → Craft Station (open exchange UI)
  └── Not found → Plain scenery (not interactive)
```

### Zaap Special Case

Map cells with `gfx` in `Map.ZAAP_GFX_ID` bypass the InteractiveGfx lookup and are always treated as zaaps.

---

## 7. Implementation Details

### UseInteractiveCore Flow

1. **Phoenix Statue Check** — If element matches a phoenix spawn, revive ghost player
2. **Zaap Check** — If gfx is in ZAAP_GFX_ID:
   - Skill 44: Save respawn point
   - Skill 114: Open zaap teleport UI
3. **InteractiveGfx Lookup** — Find the gfx data for the element
4. **Job Level Gate** — Check character's profession meets skill's `LevelMin`
5. **Resource Harvest** — If `ResourceItem > 0`:
   - Anti-double-harvest lock
   - Play animation (`InteractiveUsedMessage`)
   - Wait duration
   - Grant resource + job XP
   - Remove element from world
   - Schedule respawn
6. **Craft Station** — If `ResourceItem == 0`:
   - Open craft exchange for the skill's job

### SkillInstanceUid Formula

```
skillInstanceUid = 53000000 + skillId * 100 + (elementId % 100)
```

This composite ID allows the client to identify both the skill and the specific element instance.

### Harvest Timing

| Config Key | Default | Description |
|------------|---------|-------------|
| `interactive.harvestDurationMs` | 2500 | Animation duration (ms) |
| `interactive.harvestRespawnMs` | 300000 | Respawn delay (5 min) |

---

## Appendix: Complete Interactive Type List

| TypeId | Name | ActionId | displayTooltip |
|--------|------|----------|----------------|
| 1 | Ash | 1 | true |
| 2 | Saw | 2 | true |
| 8 | Oak | 1 | true |
| 11 | Crafting table | 2 | true |
| 12 | Workshop | 2 | true |
| 13 | Bench | 2 | true |
| 15 | Cauldron | 2 | false |
| 16 | Zaap | 3 | true |
| 17 | Iron | 1 | true |
| 22 | Oven | 2 | true |
| 24 | Silver | 1 | true |
| 25 | Gold | 1 | true |
| 26 | Bauxite | 1 | true |
| 27 | Mould | 2 | true |
| 28 | Yew | 1 | true |
| 29 | Ebony | 1 | true |
| 30 | Elm | 1 | true |
| 31 | Maple | 1 | true |
| 32 | Hornbeam | 1 | true |
| 33 | Chestnut | 1 | true |
| 34 | Walnut | 1 | true |
| 35 | Cherry | 1 | true |
| 37 | Cobalt | 1 | true |
| 38 | Wheat | 1 | true |
| 39 | Hop | 1 | true |
| 40 | Mill | 2 | false |
| 41 | Grind | 2 | true |
| 42 | Flax | 1 | true |
| 43 | Barley | 1 | true |
| 44 | Rye | 1 | true |
| 45 | Oats | 1 | true |
| 46 | Hemp | 1 | true |
| 47 | Malt | 1 | true |
| 48 | Potato heap | 1 | true |
| 49 | Potato table | 2 | true |
| 50 | Crusher | 2 | true |
| 52 | Tin | 1 | true |
| 53 | Copper | 1 | true |
| 54 | Manganese | 1 | true |
| 55 | Bronze | 1 | true |
| 56 | Fountain of Youth | 4 | false |
| 57 | Anvil | 2 | true |
| 58 | Sewing machine | 2 | false |
| 60 | Pot | 7 | true |
| 61 | Edelweiss | 1 | true |
| 62 | Alembic | 2 | false |
| 63 | Wheat | 1 | false |
| 64 | Spelt | 1 | false |
| 65 | Sorghum | 1 | false |
| 66 | Wild Mint | 1 | true |
| 67 | 5-Leaf Clover | 1 | true |
| 68 | Freyesque Orchid | 1 | true |
| 69 | Mortar and pestle | 2 | false |
| 70 | Door | 5 | false |
| 71 | Small sea fish | 1 | true |
| 72 | Aggressive Salmoon | 1 | false |
| 73 | Octopwus | 1 | false |
| 74 | River fish | 1 | true |
| 75 | Small river fish | 1 | true |
| 76 | Large river fish | 1 | true |
| 77 | Sea fish | 1 | true |
| 78 | Large sea fish | 1 | true |
| 79 | Giant river fish | 1 | true |
| 80 | Sludgy Trout | 1 | false |
| 81 | Giant sea fish | 1 | true |
| 82 | Cotton | 1 | false |
| 83 | Spinner | 2 | false |
| 84 | Well | 1 | true |
| 85 | Safe | 6 | true |
| 86 | Sewing machine | 2 | true |
| 88 | Wooden bench | 2 | false |
| 90 | Alembic | 2 | true |
| 92 | Magic anvil | 2 | false |
| 93 | Munster Crusher | 2 | false |
| 94 | Workbench | 2 | false |
| 95 | Workbench | 2 | false |
| 96 | Workbench | 2 | true |
| 97 | Workbench | 2 | true |
| 98 | Bombu | 1 | true |
| 99 | Strange shadow | 1 | false |
| 100 | Snapper | 1 | true |
| 101 | Oliviolet | 1 | true |
| 102 | Strength machine | 1 | false |
| 103 | Pyrotechnic workbench | 2 | true |
| 104 | Quaquack | 1 | false |
| 105 | Trash | 6 | true |
| 106 | Zaapi | 10 | true |
| 107 | Shield anvil | 2 | false |
| 108 | Bamboo | 1 | true |
| 109 | Dark Bamboo | 1 | true |
| 110 | Holy Bamboo | 1 | true |
| 111 | Rice | 1 | true |
| 112 | Pandkin | 1 | true |
| 113 | Dolomite | 1 | true |
| 114 | Silicate | 1 | true |
| 115 | Restless | 11 | false |
| 116 | Magic sewing machine | 2 | false |
| 117 | Magic workshop | 2 | false |
| 118 | Magic table | 2 | false |
| 119 | List of craftsmen | 12 | true |
| 120 | Paddock | 13 | true |
| 121 | Kaliptus | 1 | true |
| 122 | Workbench | 2 | true |
| 127 | Switch | 14 | true |
| 128 | Class statue | 15 | true |
| 129 | [NO_TRAD]Any IE | 16 | false |
| 131 | Snowdrop | 1 | true |
| 132 | Frigost fish | 1 | true |
| 133 | Aspen | 1 | true |
| 134 | Frosteez | 1 | true |
| 135 | Obsidian | 1 | true |
| 136 | Shell | 0 | true |
| 137 | Poss'Ybel's sewing machine | 0 | false |
| 138 | Trophy Factory | 0 | true |
| 139 | Bad Quality Kitchen Table | 0 | false |
| 140 | Bad Quality Workshop | 0 | false |
| 141 | Bad Quality Workbench | 0 | false |
| 142 | Bad Quality Sewing Machine | 0 | false |
| 143 | Toy machine | 0 | true |
| 144 | Fish press | 0 | true |
| 145 | Wrapping Station | 0 | true |
| 146 | Gift Package | 0 | true |
| 147 | Gift Wrapping Station | 0 | false |
| 148 | Alchemists' Workshop | 0 | false |
| 149 | Jewellers' Workshop | 0 | false |
| 150 | Butchers' Workshop | 0 | false |
| 151 | Butchers' and Hunters' Workshop | 0 | false |
| 152 | Shield Smiths' Workshop | 0 | false |
| 153 | Bakers' Workshop | 0 | false |
| 154 | Handymen's Workshop | 0 | false |
| 155 | Lumberjacks' Workshop | 0 | false |
| 156 | Hunters' Workshop | 0 | false |
| 157 | Shoemakers' Workshop | 0 | false |
| 158 | Smithmagi's Workshop | 0 | false |
| 159 | Smiths' Workshop | 0 | false |
| 160 | Miners' Workshop | 0 | false |
| 161 | Farmers' Workshop | 0 | false |
| 162 | Fishmongers' Workshop | 0 | false |
| 163 | Fishermen and Fishmongers' Workshop | 0 | false |
| 164 | Fishermen's Workshop | 0 | false |
| 165 | Carvers' Workshop | 0 | false |
| 166 | Tailors' Workshop | 0 | false |
| 167 | Arena | 0 | false |
| 168 | Bank | 0 | false |
| 169 | Bar Racuda | 0 | false |
| 170 | Library | 0 | false |
| 171 | Kwismas Shops | 0 | false |
| 172 | Dojo | 0 | false |
| 173 | Church | 0 | false |
| 174 | Grocery Store | 0 | false |
| 175 | Ski Maker | 0 | false |
| 176 | Town Hall | 0 | false |
| 177 | Profession Information Centre | 0 | false |
| 178 | Kanojedo | 0 | false |
| 179 | Kolossium | 0 | false |
| 180 | Militia | 0 | false |
| 181 | Frigost's Doctor | 0 | false |
| 182 | Inn | 0 | false |
| 183 | Atyu Sirvis's Inn | 0 | false |
| 184 | Atolmond's Inn | 0 | false |
| 185 | The Silver Tavern | 0 | false |
| 186 | Djaul Inn | 0 | false |
| 187 | Bagrutte Inn | 0 | false |
| 188 | Woodenglass Inn | 0 | false |
| 189 | Misery Inn | 0 | false |
| 190 | Kikim Inn | 0 | false |
| 191 | Lisa Kaya's Tavern | 0 | false |
| 192 | Sakai Tavern | 0 | false |
| 193 | Bwork Inn | 0 | false |
| 194 | Burnt Cat Inn | 0 | false |
| 195 | Last Chance Saloon | 0 | false |
| 196 | Swashbuckler Inn | 0 | false |
| 197 | Feubuk Inn | 0 | false |
| 198 | Drunken Pandawa Inn | 0 | false |
| 199 | Frigostian Paradise Tavern | 0 | false |
| 200 | Pinchaut Inn | 0 | false |
| 201 | Ripate Inn | 0 | false |
| 202 | Guild Temple | 0 | false |
| 203 | Tower of Brakmar | 0 | false |
| 204 | Tower of Archives | 0 | false |
| 205 | Tower of Orders | 0 | false |
| 206 | Foggernaut Submarine | 0 | true |
| 207 | Altar | 0 | true |
| 208 | Krosmaster | 0 | true |
| 209 | Gith Smold's Workshop | 0 | true |
| 210 | Al Shab's Workshop | 0 | true |
| 211 | Frigostine's Workshop | 0 | true |
| 212 | Francky's Workshop | 0 | true |
| 213 | Dutch's Workshop | 0 | true |
| 214 | Brokkreitri's Workshop | 0 | true |
| 215 | Ingram Part's Workshop | 0 | true |
| 216 | Clarisse Tocate's Workshop | 0 | true |
| 217 | Bea Fortax's Workshop | 0 | true |
| 218 | Carla Garfield's Workshop | 0 | true |
| 219 | Weaver of Fortunes | 0 | true |
| 220 | Barrel of explosives | 0 | true |
| 221 | Sutol Flower | 0 | true |
| 222 | Barbecue | 0 | true |
| 223 | Fresh Cawwot | 0 | false |
| 224 | Profession Information Centre's weathered alembic | 0 | true |
| 225 | Piraniak | 1 | true |
