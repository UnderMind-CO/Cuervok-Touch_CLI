# Spell Effects Reference — Dofus Touch

> **Source of truth:** `data/official/ankama/Effects.json` (678 effect definitions)  
> **Implementation:** `TouchEmu.Server.Game/Managers/FightManager.cs` → `ApplyEffect()`

---

## Table of Contents

1. [Implementation Status](#1-implementation-status)
2. [Damage Effects (96–100 / 82 / 85–89 / 275–279)](#2-damage-effects)
3. [Steal Effects (91–95)](#3-steal-effects)
4. [Fixed Damage / Neutral Steal (82)](#4-fixed-damage--neutral-steal)
5. [Percent Damage (85–89 / 275–279)](#5-percent-damage)
6. [Heal Effects (81 / 108 / 110 / 143)](#6-heal-effects)
7. [AP / MP Effects (77 / 78 / 84 / 101 / 127 / 128 / 168 / 169 / 1080)](#7-ap--mp-effects)
8. [Movement Effects (4 / 5 / 6 / 8 / 50 / 51)](#8-movement-effects)
9. [State Effects (950 / 951 / 952)](#9-state-effects)
10. [Stat Boost / Debuff Effects (118–126 / 138 / 152–157)](#10-stat-boost--debuff-effects)
11. [Combat Buff Effects (111–112 / 115–117 / 137 / 165 / 174–179 / 182 / 225–226)](#11-combat-buff-effects)
12. [Trap / Glyph / Mark Effects (400–402 / 410–431 / 1091)](#12-trap--glyph--mark-effects)
13. [Summon Effects (180 / 181 / 185)](#13-summon-effects)
14. [Resistance Effects (183–184 / 210–219 / 240–263)](#14-resistance-effects)
15. [Advanced Spell Effects (666–793 / 1000+)](#15-advanced-spell-effects)
16. [Unimplemented Effects (Priority)](#16-unimplemented-effects-priority)

---

## 1. Implementation Status

| Category | Effect IDs | Status in FightManager |
|----------|-----------|----------------------|
| Elemental damage | 96–100 | ✅ Implemented |
| Steal (HP) | 91–95 | ✅ Implemented |
| Fixed neutral damage/steal | 82 | ✅ Implemented |
| Percent damage | 85–89, 275–279 | ✅ Implemented |
| Heal | 81, 108, 110, 143 | ✅ Implemented |
| AP steal/lose/gain | 77, 84, 101, 166, 168 | ✅ Implemented |
| MP steal/lose/gain | 78, 127, 128, 169, 1080 | ✅ Implemented |
| Push / Pull | 5, 4 | ✅ Implemented |
| Switch positions | 8 | ❌ Missing |
| Carry / Throw | 50, 51 | ❌ Missing |
| State set/unset/disable | 950, 951, 952 | ✅ Implemented |
| Stat boosts (all 6 + power) | 118–126, 138 | ✅ Implemented |
| Stat debuffs | 152–157 | ✅ Implemented |
| Trap/Glyph/Mark placement | 400–402, 1091 | ✅ Implemented |
| Trap/Glyph trigger | 306, 307 | ✅ Implemented |
| Summon creature | 181, 185 | ✅ Implemented |
| Duplicate (clone) | 180 | ❌ Missing |
| Resistance % buffs | 210–219, 240–249 | ❌ Missing |
| Resistance flat buffs | 240–249, 250–263 | ❌ Missing |
| AP/MP parry | 160–163 | ❌ Missing |
| Initiative (buff/debuff) | 174, 175 | ❌ Missing |
| Prospecting | 176, 177 | ❌ Missing |
| Heals (passive) | 178, 179 | ❌ Missing |
| Summon count | 182 | ❌ Missing |
| Physical/Magic reduction | 172, 173, 183, 184 | ❌ Missing |
| Teleport to cell | 4 | ❌ Missing |
| Teleport to map | 2 | ❌ Missing |
| Turn cancel | 140 | ❌ Missing |
| Kill | 141 | ❌ Missing |
| Revive | 147, 206 | ❌ Missing |
| Invisibility | 150 | ❌ Missing |
| Appearance change | 149 | ❌ Missing |
| Advanced combat (666+) | Various | ❌ Mostly missing |

---

## 2. Damage Effects

### Elemental Damage (96–100)

| ID | Description | Element | Icon |
|----|-------------|---------|------|
| 96 | `#1–#2 (Water damage)` | Water | 4 |
| 97 | `#1–#2 (Earth damage)` | Earth | 2 |
| 98 | `#1–#2 (Air damage)` | Air | 6 |
| 99 | `#1–#2 (Fire damage)` | Fire | 3 |
| 100 | `#1–#2 (Neutral damage)` | Neutral | 1 |

**Protocol:** `GameActionFightLifePointsVariationMessage` with the raw damage.  
**FightManager:** `DealDamage()` applies the raw value, `ElementOf()` maps id → element.

### Physical Damage (142)

| ID | Description |
|----|-------------|
| 142 | `#1–#2 Physical Damage` |

Uses characteristic 16 (neutral element). Treated same as 100 in `ElementOf()`.

### Damage Reduction (105)

| ID | Description | Status |
|----|-------------|--------|
| 105 | `Reduces damage by #1–#2` | ❌ Not implemented |

### Damage Reflection (107, 220)

| ID | Description | Status |
|----|-------------|--------|
| 107 | `Reflects #1–#2 damage` | ❌ Not implemented |
| 220 | `Reflects #1–#2 damage` (passive) | ❌ Not implemented |

---

## 3. Steal Effects

### HP Steals (91–95)

| ID | Description | Element |
|----|-------------|---------|
| 91 | `#1–#2 (Water steal)` | Water |
| 92 | `#1–#2 (Earth steal)` | Earth |
| 93 | `#1–#2 (Air steal)` | Air |
| 94 | `#1–#2 (Fire steal)` | Fire |
| 95 | `#1–#2 (Neutral steal)` | Neutral |

**Behavior:** Deal damage → heal caster by the same amount.  
**FightManager:** After `DealDamage()`, calls `HealFighter(client, attacker, dealt, attacker)`.

### AP Steal (84)

| ID | Description |
|----|-------------|
| 84 | `Steals #1–#2 AP` |

**FightManager:** `ApplyPointsEffect()` with `EFFECT_STEAL_AP`.

### MP Steal (77)

| ID | Description |
|----|-------------|
| 77 | `Steals #1–#2 MP` |

**FightManager:** `ApplyPointsEffect()` with `EFFECT_STEAL_MP`.

---

## 4. Fixed Damage / Neutral Steal

| ID | Description |
|----|-------------|
| 82 | `#1–#2 HP (fixed Neutral steal)` |

Deals neutral damage regardless of stat, heals caster by dealt amount.

---

## 5. Percent Damage

| ID | Description | Element |
|----|-------------|---------|
| 85 | `#1–#2% of attacker's HP (Water)` | Water |
| 86 | `#1–#2% of attacker's HP (Earth)` | Earth |
| 87 | `#1–#2% of attacker's HP (Air)` | Air |
| 88 | `#1–#2% of attacker's HP (Fire)` | Fire |
| 89 | `#1–#2% of attacker's HP (Neutral)` | Neutral |
| 275 | `#1–#2% of target's HP (Water)` | Water |
| 276 | `#1–#2% of target's HP (Earth)` | Earth |
| 277 | `#1–#2% of target's HP (Air)` | Air |
| 278 | `#1–#2% of target's HP (Fire)` | Fire |
| 279 | `#1–#2% of target's HP (Neutral)` | Neutral |

**FightManager:** `ComputeEffectDamage()` handles `isPercentDamage` branch. Uses `CasterMaxLifePoints` for 85–89 and `TargetMaxLifePoints` for 275–279.

---

## 6. Heal Effects

| ID | Description | Notes |
|----|-------------|-------|
| 81 | `#1–#2 (HP restored)` | Standard heal (in tooltip, in fight) |
| 108 | `#1–#2 (HP restored)` | Alternate heal (no tooltip) |
| 110 | `#1–#2 HP` | Passive/regen heal (boost) |
| 143 | `#1–#2 (HP restored)` | General heal |

**FightManager:** `ApplyEffect()` → `HealFighter()` with `RollEffect()`.

---

## 7. AP / MP Effects

### AP Effects

| ID | Description | Type |
|----|-------------|------|
| 77 | Steals MP (for MP version) | Steal |
| 84 | Steals #1–#2 AP | Steal |
| 101 | -#1–#2 AP (enemy) | Debuff |
| 120 | +#1–#2 AP (no fight) | Out-of-combat |
| 133 | Caster loses #1–#2 AP | Self-debuff |
| 166 | Returns #1–#2 AP | Refund |
| 168 | -#1–#2 AP (debuff) | Debuff |
| 78 | +#1–#2 MP | Buff |

### MP Effects

| ID | Description | Type |
|----|-------------|------|
| 77 | Steals #1–#2 MP | Steal |
| 78 | +#1–#2 MP | Buff |
| 127 | -#1–#2 MP | Debuff |
| 128 | #1–#2 MP (boost) | Buff |
| 134 | Caster loses #1–#2 MP | Self-debuff |
| 169 | -#1–#2 MP (debuff) | Debuff |
| 1080 | -MP (Touch-specific, e.g. Terraplenado) | Debuff |

**FightManager:** `ApplyPointsEffect()` handles permanent +/- AP/MP. `ApplyPointsBuff()` handles duration-based gains (e.g. "1 MP for 3 turns").

---

## 8. Movement Effects

| ID | Description | Status |
|----|-------------|--------|
| 2 | Teleports to the targeted map | ❌ Not implemented |
| 4 | Teleports to the targeted cell | ❌ Not implemented |
| 5 | Pushes back #1 cell(s) | ✅ Implemented |
| 6 | Attracts #1 cell(s) | ❌ Not implemented (pull via ID 4) |
| 8 | Switches positions | ❌ Not implemented |
| 50 | Carries the target | ❌ Not implemented |
| 51 | Throws the target | ❌ Not implemented |

---

## 9. State Effects

| ID | Description |
|----|-------------|
| 950 | Set state (state id in effect value) |
| 951 | Unset state |
| 952 | Disable state |

**Known States (from SpellStates.json):**

| State ID | Name | Effect |
|----------|------|--------|
| 6 | Rooted | Cannot move (Mp = 0) |
| 7 | Gravity | Cannot move, cannot be pushed |
| 95 | Cannot Tackle | Prevents tackling |
| 96 | Cannot Be Tackled | Immune to tackle |
| 97 | Cannot Be Moved | Immune to displacement |
| 103 | Fortified | Special state |
| 150 | Entangled | -2 MP per turn |
| 157 | Cannot Be Pushed | Immune to push |

---

## 10. Stat Boost / Debuff Effects

### Stat Boosts (118–126 + 138)

| ID | Description | Characteristic |
|----|-------------|----------------|
| 118 | #1–#2 Strength | 10 |
| 119 | #1–#2 Agility | 14 |
| 123 | #1–#2 Chance | 13 |
| 124 | #1–#2 Wisdom | 12 |
| 125 | #1–#2 Vitality | 11 |
| 126 | #1–#2 Intelligence | 15 |
| 138 | #1–#2 Power | 17 |

### Stat Debuffs (152–157)

| ID | Description | Characteristic |
|----|-------------|----------------|
| 152 | -#1–#2 Chance | 13 |
| 153 | -#1–#2 Vitality | 11 |
| 154 | -#1–#2 Agility | 14 |
| 155 | -#1–#2 Intelligence | 15 |
| 156 | -#1–#2 Wisdom | 12 |
| 157 | -#1–#2 Strength | 10 |

**FightManager:** `ApplyStatBuff()` creates `FightTemporaryBoostEffect` with `StatActionId()` / `StatId()`.

---

## 11. Combat Buff Effects

| ID | Description | Status |
|----|-------------|--------|
| 111 | #1–#2 AP (boost, active) | ✅ Via ApplyPointsBuff |
| 112 | #1–#2 Damage | ✅ Via ApplyFightBuff |
| 115 | #1–#2% Critical Hits | ✅ Via ApplyFightBuff |
| 116 | -#1–#2 Range | ✅ Via ApplyFightBuff |
| 117 | #1–#2 Range | ✅ Via ApplyFightBuff |
| 121 | #1–#2 Damage (no tooltip) | ❌ Missing |
| 122 | #1–#2 Critical Failures | ❌ Missing |
| 137 | Increases caster's physical damage by #1–#2 | ❌ Missing |
| 165 | #2% #1 Damage | ❌ Missing |
| 174 | #1–#2 Initiative | ❌ Missing |
| 175 | -#1–#2 Initiative | ❌ Missing |
| 176 | #1–#2 Prospecting | ❌ Missing |
| 177 | -#1–#2 Prospecting | ❌ Missing |
| 178 | #1–#2 Heals | ❌ Missing |
| 179 | -#1–#2 Heals | ❌ Missing |
| 182 | #1–#2 Summons | ❌ Missing |
| 186 | -#1–#2 Power | ❌ Missing |
| 225 | #1–#2 Trap Damage | ✅ Via ApplyFightBuff |
| 226 | #1–#2 Power (traps) | ✅ Via ApplyFightBuff |

---

## 12. Trap / Glyph / Mark Effects

### Placement Effects

| ID | Description | Constant |
|----|-------------|----------|
| 400 | Place trap mark | ACTION_FIGHT_ADD_TRAP |
| 401 | Place glyph mark | ACTION_FIGHT_ADD_GLYPH |
| 402 | Place glyph (end of turn) | ACTION_FIGHT_ADD_GLYPH_ENDTURN |
| 1091 | Modern trap placement (Sram) | ACTION_FIGHT_ADD_MARK |

### Trigger Effects

| ID | Description | Constant |
|----|-------------|----------|
| 306 | Trap triggered | ACTION_FIGHT_TRIGGER_TRAP |
| 307 | Glyph triggered | ACTION_FIGHT_TRIGGER_GLYPH |

### Mark Types

| Type | Value |
|------|-------|
| Glyph | 1 |
| Trap | 2 |

### Trap/Glyph Damage Buffs (410–431)

| ID | Element |
|----|---------|
| 410 | Neutral trap damage |
| 411 | Earth trap damage |
| 412 | Water trap damage |
| 413 | Fire trap damage |
| 414 | Air trap damage |
| 416 | Neutral trap resistance |
| 418 | Earth trap resistance |
| 420 | Water trap resistance |
| 422 | Fire trap resistance |
| 424 | Air trap resistance |
| 426 | Neutral glyph damage |
| 428 | Earth glyph damage |
| 430 | Water glyph damage |
| 431 | Fire glyph damage |
| 440 | Air glyph damage |
| 441 | Neutral glyph resistance |

---

## 13. Summon Effects

| ID | Description | Status |
|----|-------------|--------|
| 180 | Creates a double of the caster | ❌ Not implemented |
| 181 | Summons #1 (creature) | ✅ Implemented |
| 185 | Summons #1 (static) | ✅ Implemented (treated same as 181) |

**FightManager:** `SummonCreature()` creates a `FighterState` with monster data, broadcasts `GameActionFightSummonMessage`.

---

## 14. Resistance Effects

### % Resistance Buffs (210–219)

| ID | Description | Characteristic |
|----|-------------|----------------|
| 210 | #1–#2% Earth Resistance | 33 |
| 211 | #1–#2% Water Resistance | 35 |
| 212 | #1–#2% Air Resistance | 36 |
| 213 | #1–#2% Fire Resistance | 34 |
| 214 | #1–#2% Neutral Resistance | 37 |
| 215 | -#1–#2% Earth Resistance | 33 |
| 216 | -#1–#2% Water Resistance | 35 |
| 217 | -#1–#2% Air Resistance | 36 |
| 218 | -#1–#2% Fire Resistance | 34 |
| 219 | -#1–#2% Neutral Resistance | 37 |

### Flat Resistance Buffs (240–249)

| ID | Description | Characteristic |
|----|-------------|----------------|
| 240 | #1–#2 Earth Resistance | 54 |
| 241 | #1–#2 Water Resistance | 56 |
| 242 | #1–#2 Air Resistance | 57 |
| 243 | #1–#2 Fire Resistance | 55 |
| 244 | #1–#2 Neutral Resistance | 58 |
| 245 | -#1–#2 Earth Resistance | 54 |
| 246 | -#1–#2 Water Resistance | 56 |
| 247 | -#1–#2 Air Resistance | 57 |
| 248 | -#1–#2 Fire Resistance | 55 |
| 249 | -#1–#2 Neutral Resistance | 58 |

### PvP Resistance Buffs (250–263)

| ID | Description | Characteristic |
|----|-------------|----------------|
| 250 | #1–#2% Earth Res PvP | 59 |
| 251 | #1–#2% Water Res PvP | 61 |
| 252 | #1–#2% Air Res PvP | 62 |
| 253 | #1–#2% Fire Res PvP | 60 |
| 254 | #1–#2% Neutral Res PvP | 63 |
| 255 | -#1–#2% Earth Res PvP | 59 |
| 256 | -#1–#2% Water Res PvP | 61 |
| 257 | -#1–#2% Air Res PvP | 62 |
| 258 | -#1–#2% Fire Res PvP | 60 |
| 259 | -#1–#2% Neutral Res PvP | 63 |
| 260 | #1–#2 Earth Res PvP (flat) | 64 |
| 261 | #1–#2 Water Res PvP (flat) | 66 |
| 262 | #1–#2 Air Res PvP (flat) | 67 |
| 263 | #1–#2 Neutral Res PvP (flat) | 63 |

### Magic / Physical Reduction (172, 173, 183, 184)

| ID | Description | Characteristic |
|----|-------------|----------------|
| 172 | -#1–#2 Magic Reduction | 20 |
| 173 | -#1–#2 Physical Reduction | 21 |
| 183 | #1–#2 Magic Reduction | 20 |
| 184 | #1–#2 Physical Reduction | 21 |

---

## 15. Advanced Spell Effects (666–793 / 1000+)

These are Dofus Touch-specific effects for advanced mechanics:

### Zone/Position Effects (666–672)

| ID | Description | Status |
|----|-------------|--------|
| 666 | Push back (advanced) | ❌ |
| 669 | Pull (advanced) | ❌ |
| 670 | Push cell | ❌ |
| 671 | Push (alternate) | ❌ |
| 672 | Push (alternate 2) | ❌ |

### Multi-target / Chain Effects (751–793)

| ID Range | Description | Status |
|----------|-------------|--------|
| 751–755 | Chain lightning / multi-target | ❌ |
| 765 | Advanced area effect | ❌ |
| 770–776 | Various advanced effects | ❌ |
| 780–793 | Touch-specific combat effects | ❌ |

### 1000+ Range (Dofus Touch Exclusive)

| ID Range | Description | Status |
|----------|-------------|--------|
| 1005–1016 | Touch-specific element damage variants | ❌ |
| 1017–1049 | Touch-specific spells (Necromancy, etc.) | ❌ |
| 1050–1087 | Advanced Touch effects | ❌ |
| 1091–1109 | Mark/trap variants | Partially |
| 1118–1140 | Element-specific advanced effects | ❌ |
| 1145–1172 | Touch-specific mechanics | ❌ |
| 1182–1228 | Touch-specific combat | ❌ |

---

## 16. Unimplemented Effects (Priority)

### HIGH PRIORITY (used by many spells, affects core gameplay)

| ID | Description | Used By |
|----|-------------|---------|
| 180 | Clone / Double | Cra, Zobal |
| 4 | Teleport to cell | Pandawa, Rogues |
| 6 | Attract (pull) | Various |
| 8 | Switch positions | Sram |
| 50/51 | Carry / Throw | Pandawa |
| 210–219 | % Resistance buffs | All classes |
| 240–249 | Flat resistance buffs | Items, spells |
| 160–163 | AP/MP Parry | Gear, spells |
| 140 | Cancel turn | Special spells |
| 141 | Kill (instant) | Special spells |
| 147/206 | Revive | Eniripsa |

### MEDIUM PRIORITY (used by specific classes)

| ID | Description | Used By |
|----|-------------|---------|
| 172–173 | Magic/Physical reduction | Various |
| 183–184 | Magic/Physical reduction (buff) | Various |
| 150 | Invisibility | Sram, Sadi |
| 149 | Appearance change | Foggernaut |
| 220 | Damage reflection | Eniripsa |
| 132 | Dispel magic | Various |
| 146 | Change speech | Masqueraider |

### LOW PRIORITY (rarely used or cosmetic)

| ID Range | Description |
|----------|-------------|
| 666–672 | Advanced push variants |
| 751–793 | Touch-specific advanced |
| 1000+ | Touch-exclusive variants |

---

## Appendix: Effect ID → FightManager Method Mapping

| Effect Category | FightManager Method |
|----------------|-------------------|
| Damage 96–100 | `ComputeEffectDamage()` → `DealDamage()` |
| Steal 91–95 | `ComputeEffectDamage()` → `DealDamage()` + `HealFighter()` |
| Heal 81/108/110/143 | `RollEffect()` → `HealFighter()` |
| AP/MP steal/lose | `ApplyPointsEffect()` |
| AP/MP gain (buff) | `ApplyPointsBuff()` |
| Stat boost 118–126 | `ApplyStatBuff()` |
| Stat debuff 152–157 | `ApplyStatBuff()` (negated) |
| Power 138 | `ApplyStatBuff()` |
| Push 5 | `PushFighter()` |
| Pull 4 | `PullFighter()` |
| State 950/951/952 | `ApplyStateEffect()` |
| Trap/Glyph 400–402/1091 | `PlaceMark()` |
| Summon 181/185 | `SummonCreature()` |
| Buff (damage/init/etc) | `ApplyFightBuff()` |
