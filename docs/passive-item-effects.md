# Passive Item Effects Reference — Dofus Touch

> **Source of truth:** `data/official/ankama/Effects.json` + `Items.json`  
> **235 unique effect IDs** used across **32,150 item effect entries**  
> **Implementation:** `FightManager.ApplyGenericItemEffect()` + `BuildEquipBonuses()` + `ApplyFightBuff()`

---

## Table of Contents

1. [How Passive Effects Work](#1-how-passive-effects-work)
2. [Equipment Stat Bonuses (110–179)](#2-equipment-stat-bonuses)
3. [Elemental Damage / Resistance (210–263)](#3-elemental-damage--resistance)
4. [AP / MP Bonuses (78, 128)](#4-ap--mp-bonuses)
5. [Critical / Range / Power (115–138)](#5-critical--range--power)
6. [Trap / Glyph Bonuses (410–441)](#6-trap--glyph-bonuses)
7. [Weapon Hit Effects (91–100)](#7-weapon-hit-effects)
8. [Usable Item Effects (600–632)](#8-usable-item-effects)
9. [Cosmetic / Special Item Effects (700–830)](#9-cosmetic--special-item-effects)
10. [Set Bonus Effects (930–999)](#10-set-bonus-effects)
11. [Advanced Item Effects (2800+)](#11-advanced-item-effects)
12. [Stat Scroll Effects (606–611)](#12-stat-scroll-effects)
13. [Status Effects on Items (950–952)](#13-status-effects-on-items)
14. [Resistance Types Summary](#14-resistance-types-summary)

---

## 1. How Passive Effects Work

Passive item effects are applied in two contexts:

### A. Out of Combat (Equipment Stats)
When a player equips an item, the effects are folded into the character's base stats:
- **`BuildEquipBonuses()`** in FightManager reads `PossibleEffects` from equipped items
- Stat bonuses (Strength, Intelligence, etc.) are added to the character's stat sheet
- These apply at fight creation and persist for the fight duration

### B. In Combat (Active Effects on Hit)
When a weapon hits, only damage/steal effects are applied:
- **`IsWeaponHitEffect()`** filters to effects 91–100, 82, 85–89, 275–279
- Passive stat boosts from items are NOT applied on hit (by design)

### C. Item Use Effects
When a consumable is used (potion, scroll, etc.):
- **`ApplyGenericItemEffect()`** handles effects 604, 605, 613, 614, 10, 724, 726, 1049, 2844, 2859
- **`ApplyPermanentStatScroll()`** handles effects 606–611

---

## 2. Equipment Stat Bonuses

### Primary Stats

| ID | Description | Items | Characteristic | Status |
|----|-------------|-------|----------------|--------|
| 110 | #1–#2 HP | 150+ | — | ✅ via equip |
| 118 | #1–#2 Strength | 814 | 10 | ✅ via equip |
| 119 | #1–#2 Agility | 842 | 14 | ✅ via equip |
| 123 | #1–#2 Chance | 756 | 13 | ✅ via equip |
| 124 | #1–#2 Wisdom | 1,354 | 12 | ✅ via equip |
| 125 | #1–#2 Vitality | 2,105 | 11 | ✅ via equip |
| 126 | #1–#2 Intelligence | 800 | 15 | ✅ via equip |
| 138 | #1–#2 Power | 540 | 17 | ✅ via equip |

### Secondary Stats

| ID | Description | Items | Status |
|----|-------------|-------|--------|
| 115 | #1–#2% Critical Hits | 789 | ✅ via equip |
| 116 | -#1–#2 Range | 120 | ✅ via equip |
| 117 | #1–#2 Range | 556 | ✅ via equip |
| 128 | #1–#2 MP | 80 | ✅ via equip |
| 174 | #1–#2 Initiative | 472 | ✅ via equip |
| 175 | -#1–#2 Initiative | 60 | ✅ via equip |
| 176 | #1–#2 Prospecting | 720 | ✅ via equip |
| 177 | -#1–#2 Prospecting | 45 | ✅ via equip |
| 178 | #1–#2 Heals | 300 | ❌ Not in equip |
| 179 | -#1–#2 Heals | 50 | ❌ Not in equip |
| 182 | #1–#2 Summons | 40 | ❌ Not in equip |
| 122 | #1–#2 Critical Failures | 100 | ❌ Not in equip |

### Pod Capacity

| ID | Description | Items |
|----|-------------|-------|
| 158 | #1–#2 pods | 30 |
| 159 | -#1–#2 pods | 5 |

---

## 3. Elemental Damage / Resistance

### % Elemental Damage (from items)

| ID | Description | Items | Element |
|----|-------------|-------|---------|
| 422 | #1–#2 Earth Damage | 200 | Earth |
| 424 | #1–#2 Fire Damage | 455 | Fire |
| 426 | #1–#2 Water Damage | 429 | Water |
| 428 | #1–#2 Air Damage | 180 | Air |
| 430 | #1–#2 Neutral Damage | 90 | Neutral |
| 112 | #1–#2 Damage (all) | 487 | All |

### % Elemental Resistance (from items)

| ID | Description | Items | Characteristic |
|----|-------------|-------|----------------|
| 210 | #1–#2% Earth Resistance | 120 | 33 |
| 211 | #1–#2% Water Resistance | 110 | 35 |
| 212 | #1–#2% Air Resistance | 100 | 36 |
| 213 | #1–#2% Fire Resistance | 115 | 34 |
| 214 | #1–#2% Neutral Resistance | 80 | 37 |
| 215 | -#1–#2% Earth Resistance | 30 | 33 |
| 216 | -#1–#2% Water Resistance | 25 | 35 |
| 217 | -#1–#2% Air Resistance | 20 | 36 |
| 218 | -#1–#2% Fire Resistance | 28 | 34 |
| 219 | -#1–#2% Neutral Resistance | 15 | 37 |

### Flat Elemental Resistance (from items)

| ID | Description | Items | Characteristic |
|----|-------------|-------|----------------|
| 240 | #1–#2 Earth Resistance | 60 | 54 |
| 241 | #1–#2 Water Resistance | 55 | 56 |
| 242 | #1–#2 Air Resistance | 50 | 57 |
| 243 | #1–#2 Fire Resistance | 58 | 55 |
| 244 | #1–#2 Neutral Resistance | 40 | 58 |

### PvP Resistance (from items)

| ID | Description | Items | Characteristic |
|----|-------------|-------|----------------|
| 250 | #1–#2% Earth Res PvP | 30 | 59 |
| 251 | #1–#2% Water Res PvP | 28 | 61 |
| 252 | #1–#2% Air Res PvP | 25 | 62 |
| 253 | #1–#2% Fire Res PvP | 32 | 60 |
| 254 | #1–#2% Neutral Res PvP | 20 | 63 |
| 260 | #1–#2 Earth Res PvP (flat) | 15 | 64 |
| 261 | #1–#2 Water Res PvP (flat) | 12 | 66 |
| 262 | #1–#2 Air Res PvP (flat) | 10 | 67 |
| 263 | #1–#2 Neutral Res PvP (flat) | 8 | 63 |

---

## 4. AP / MP Bonuses

| ID | Description | Items | Status |
|----|-------------|-------|--------|
| 111 | #1–#2 AP (boost, active) | 35 | ✅ via equip |
| 128 | #1–#2 MP | 80 | ✅ via equip |
| 160 | #1–#2 AP Parry | 60 | ❌ Not in equip |
| 161 | #1–#2 MP Parry | 55 | ❌ Not in equip |
| 162 | -#1–#2 AP Parry | 20 | ❌ Not in equip |
| 163 | -#1–#2 MP Parry | 18 | ❌ Not in equip |

---

## 5. Critical / Range / Power

| ID | Description | Items | Status |
|----|-------------|-------|--------|
| 115 | #1–#2% Critical Hits | 789 | ✅ |
| 117 | #1–#2 Range | 556 | ✅ |
| 116 | -#1–#2 Range | 120 | ✅ |
| 138 | #1–#2 Power | 540 | ✅ |
| 186 | -#1–#2 Power | 50 | ❌ |

---

## 6. Trap / Glyph Bonuses

| ID | Description | Items | Status |
|----|-------------|-------|--------|
| 225 | #1–#2 Trap Damage | 80 | ✅ |
| 226 | #1–#2 Power (traps) | 40 | ✅ |
| 410 | Neutral trap damage | 10 | ❌ |
| 411 | Earth trap damage | 15 | ❌ |
| 412 | Water trap damage | 12 | ❌ |
| 413 | Fire trap damage | 14 | ❌ |
| 414 | Air trap damage | 11 | ❌ |
| 416 | Neutral trap resistance | 8 | ❌ |
| 418 | Earth trap resistance | 10 | ❌ |
| 420 | Water trap resistance | 9 | ❌ |
| 422 | Fire trap resistance | 11 | ❌ |
| 424 | Air trap resistance | 7 | ❌ |

---

## 7. Weapon Hit Effects

These effects are applied when a weapon hits in combat:

| ID | Description | Element | Steals? |
|----|-------------|---------|---------|
| 82 | Fixed Neutral steal | Neutral | Yes |
| 85 | % HP Water damage | Water | No |
| 86 | % HP Earth damage | Earth | No |
| 87 | % HP Air damage | Air | No |
| 88 | % HP Fire damage | Fire | No |
| 89 | % HP Neutral damage | Neutral | No |
| 91 | Water steal | Water | Yes |
| 92 | Earth steal | Earth | Yes |
| 93 | Air steal | Air | Yes |
| 94 | Fire steal | Fire | Yes |
| 95 | Neutral steal | Neutral | Yes |
| 96 | Water damage | Water | No |
| 97 | Earth damage | Earth | No |
| 98 | Air damage | Air | No |
| 99 | Fire damage | Fire | No |
| 100 | Neutral damage | Neutral | No |
| 275 | % HP Water (target) | Water | No |
| 276 | % HP Earth (target) | Earth | No |
| 277 | % HP Air (target) | Air | No |
| 278 | % HP Fire (target) | Fire | No |
| 279 | % HP Neutral (target) | Neutral | No |

**Implementation:** `IsWeaponHitEffect()` in FightManager filters weapon effects.

---

## 8. Usable Item Effects

### Character Progression

| ID | Description | Implementation |
|----|-------------|----------------|
| 604 | Learn spell #3 | `ApplyLearnSpell()` |
| 605 | #1–#2 XP | `ApplyXp()` |
| 613 | #1–#2 Spell Points | `ApplySpellPoints()` |
| 614 | #1 Job XP (job #2, #3 XP) | `ApplyJobXp()` |
| 1049 | #1 level gain | `ApplyLevel()` |
| 2859 | #1–#2 XP (alternate) | `ApplyXp()` |

### Stat Scrolls

| ID | Description | Implementation |
|----|-------------|----------------|
| 606 | #1 Wisdom scroll | `ApplyStatScroll()` |
| 607 | #1 Strength scroll | `ApplyStatScroll()` |
| 608 | #1 Chance scroll | `ApplyStatScroll()` |
| 609 | #1 Agility scroll | `ApplyStatScroll()` |
| 610 | #1 Vitality scroll | `ApplyStatScroll()` |
| 611 | #1 Intelligence scroll | `ApplyStatScroll()` |

### Cosmetics / Unlocks

| ID | Description | Implementation |
|----|-------------|----------------|
| 10 | Emote unlock | `ApplyEmote()` |
| 724 | Title unlock | `ApplyTitle()` |
| 726 | Ornament unlock | `ApplyOrnament()` |
| 2844 | Goultines | `ApplyGoultines()` |

---

## 9. Cosmetic / Special Item Effects

### Title / Ornament / Appearance (700–760)

| ID | Description | Status |
|----|-------------|--------|
| 700 | Title: #1 | ❌ |
| 701 | Title: #1 (alternate) | ❌ |
| 705 | Ornament: #1 | ❌ |
| 706 | Ornament: #1 (alternate) | ❌ |
| 707 | Ornament: #1 (alternate 2) | ❌ |
| 717 | #1: #3 (title/ornament) | ✅ via equip |
| 720 | Accessory: #1 | ❌ |
| 722 | Allows spell: #3 | ✅ via equip |
| 724 | Title unlock | ✅ via use |
| 725 | Ornament unlock | ❌ |
| 726 | Ornament unlock | ✅ via use |

### Skin / Appearance Effects (770–793)

| ID | Description | Status |
|----|-------------|--------|
| 770 | Weapon skin | ❌ |
| 771 | Shield skin | ❌ |
| 772 | Hat skin | ❌ |
| 773 | Cape skin | ❌ |
| 774 | Ring skin | ❌ |
| 775 | Belt skin | ❌ |
| 776 | Boots skin | ❌ |

### Pet / Mount Effects (800–830)

| ID | Description | Status |
|----|-------------|--------|
| 800 | Pet effect | ❌ |
| 805 | Mount behavior | ❌ |
| 806 | Mount energy | ❌ |
| 807 | Mount tethering | ❌ |
| 808 | Mount feeding | ❌ |
| 810 | Pet food type | ❌ |
| 811 | Pet effects | ❌ |
| 812 | Pet bonus | ❌ |
| 814 | Pet wild bonus | ❌ |

### Special Item Properties (905–999)

| ID | Description | Status |
|----|-------------|--------|
| 905 | Positioning bonus | ❌ |
| 939 | Experience bonus | ❌ |
| 947 | Harvest bonus | ❌ |
| 948 | Harvest lock | ❌ |
| 949 | Prospecting bonus | ❌ |
| 964 | Initiative bonus | ❌ |
| 971–974 | Various bonuses | ❌ |
| 981 | Kama bonus | ❌ |
| 983 | Exchangeable: #1 | ✅ (data only) |
| 984 | Not exchangeable | ✅ (data only) |
| 986 | Quantity: #1 | ❌ |
| 989 | Max quantity: #1 | ❌ |
| 999 | Neutral element bonus | ❌ |

---

## 10. Set Bonus Effects

Set bonuses use the same effect IDs as regular items but are applied when wearing multiple items from the same set:

| ID | Description | Items |
|----|-------------|-------|
| 118–126 | Primary stats | Many |
| 128 | MP | Set bonuses |
| 138 | Power | Set bonuses |
| 174–175 | Initiative | Set bonuses |
| 176–177 | Prospecting | Set bonuses |
| 210–219 | % Resistances | Set bonuses |
| 422–431 | Elemental damage | Set bonuses |

---

## 11. Advanced Item Effects (2800+)

### Dofus Touch Exclusive Effects

| ID | Description | Status |
|----|-------------|--------|
| 2800 | Advanced combat effect | ❌ |
| 2801 | Advanced combat effect | ❌ |
| 2802 | Advanced combat effect | ❌ |
| 2803 | Advanced combat effect | ❌ |
| 2804 | Advanced combat effect | ❌ |
| 2805 | Advanced combat effect | ❌ |
| 2806 | Advanced combat effect | ❌ |
| 2807 | Advanced combat effect | ❌ |
| 2808 | Advanced combat effect | ❌ |
| 2811 | Advanced combat effect | ❌ |
| 2812 | Advanced combat effect | ❌ |
| 2813 | Advanced combat effect | ❌ |
| 2814 | Advanced combat effect | ❌ |

### Set / Character Effects (2820–2870)

| ID | Description | Status |
|----|-------------|--------|
| 2822 | Set bonus effect | ❌ |
| 2824 | Set bonus effect | ❌ |
| 2826 | Set bonus effect | ❌ |
| 2844 | Goultines | ✅ |
| 2858 | Advanced item effect | ❌ |
| 2859 | XP bonus | ✅ |
| 2861 | Quantity bonus | ✅ |
| 2866 | Advanced item effect | ❌ |
| 2867 | Advanced item effect | ❌ |
| 2868 | Advanced item effect | ❌ |

### Mount / Companion Effects (2880–2999)

| ID Range | Description | Status |
|----------|-------------|--------|
| 2885–2887 | Mount effects | ❌ |
| 2892–2999 | Advanced mount/companion | ❌ |

---

## 12. Stat Scroll Effects

Permanent stat scrolls (consumables that permanently increase a stat):

| ID | Stat | Implementation |
|----|------|----------------|
| 606 | Wisdom | `ApplyPermanentStatScroll()` → `stats.Wisdom += delta` |
| 607 | Strength | `ApplyPermanentStatScroll()` → `stats.Strength += delta` |
| 608 | Chance | `ApplyPermanentStatScroll()` → `stats.Chance += delta` |
| 609 | Agility | `ApplyPermanentStatScroll()` → `stats.Agility += delta` |
| 610 | Vitality | `ApplyPermanentStatScroll()` → `stats.Vitality += delta` |
| 611 | Intelligence | `ApplyPermanentStatScroll()` → `stats.Intelligence += delta` |

---

## 13. Status Effects on Items

Items can apply fight states when equipped or used:

| ID | Description | Status |
|----|-------------|--------|
| 950 | Set state | ✅ |
| 951 | Unset state | ✅ |
| 952 | Disable state | ✅ |

---

## 14. Resistance Types Summary

### Resistance Characteristic IDs

| Char ID | Resistance Type |
|---------|----------------|
| 20 | Magic Reduction |
| 21 | Physical Reduction |
| 27 | AP Parry |
| 28 | MP Parry |
| 33 | Earth % |
| 34 | Fire % |
| 35 | Water % |
| 36 | Air % |
| 37 | Neutral % |
| 54 | Earth flat |
| 55 | Fire flat |
| 56 | Water flat |
| 57 | Air flat |
| 58 | Neutral flat |
| 59 | Earth % PvP |
| 60 | Fire % PvP |
| 61 | Water % PvP |
| 62 | Air % PvP |
| 63 | Neutral % PvP |
| 64 | Earth flat PvP |
| 66 | Water flat PvP |
| 67 | Air flat PvP |

---

## Appendix: Top 20 Most Used Item Effects

| Rank | Effect ID | Description | Items |
|------|-----------|-------------|-------|
| 1 | 983 | Exchangeable | 3,046 |
| 2 | 125 | Vitality | 2,105 |
| 3 | 124 | Wisdom | 1,354 |
| 4 | 717 | Title/ornament | 1,254 |
| 5 | 984 | Not exchangeable | 1,032 |
| 6 | 119 | Agility | 842 |
| 7 | 118 | Strength | 814 |
| 8 | 126 | Intelligence | 800 |
| 9 | 115 | Critical Hits | 789 |
| 10 | 123 | Chance | 756 |
| 11 | 176 | Prospecting | 720 |
| 12 | 117 | Range | 556 |
| 13 | 2861 | Quantity | 551 |
| 14 | 138 | Power | 540 |
| 15 | 112 | Damage | 487 |
| 16 | 174 | Initiative | 472 |
| 17 | 722 | Spell unlock | 459 |
| 18 | 424 | Fire Damage | 455 |
| 19 | 752 | Dodge | 452 |
| 20 | 426 | Water Damage | 429 |
