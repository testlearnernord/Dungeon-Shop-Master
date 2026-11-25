# Real Hero Progression — current contract

Gameplay goal: XP creates a **real, observable difference** in one shared fight
motor, but does not turn veterans into immortal dungeon sweepers. The same
derived actor statistics drive ordinary fights, the genuine Floor-10
Temporary Party Cave Troll, and the development Combat Lab. There is no solo legacy combat path.

## Authoritative calculation

- Stored hero `stats` remain the **immutable, rolled starting values**. They
  are never overwritten by a level-up.
- `level = 1 + floor(xp / 100)`; players may continue earning XP and levels.
- Effective bonuses use `min(level - 1, 19)` growth steps. **Bonuses cap at
  Level 20**. This prevents unbounded HP/damage from making all PvE trivial.
- On earned XP at settlement, gaining HP capacity adds precisely that capacity
  to *current* living HP. Existing wounds persist as the same absolute missing
  HP. A dead hero remains dead; leveling never invents a resurrection.
- All damage and healing still go through the existing `GroupCombat` motor.
  Equipment effects come from the shared class/tier gear catalog.

| Class | HP per growth step | Primary attribute | Other progression |
| --- | ---: | --- | --- |
| Tank | +4 max HP | +1 STR each 3 steps | +1 armor per 4 steps, +1 raw damage each 5 |
| DPS | +2 max HP | +1 AGI each 3 steps | +1 raw damage per 3 steps |
| Healer | +2 max HP | +1 INT each 3 steps | 1 base magic charge plus 1 per 6 steps; gear adds charges in the same projection |

Healer combat magic is **bounded by actual encounter charges** and uses the
shared spell resolution. The hero does not receive free inventory Herbs.
This first slice has **no persistent mana pool**; eventually a proper resource
economy may replace encounter-limited spells. Non-healer healing still needs
owned consumables. Healers can also purchase and consume real supplies.

## Implementation contracts

- `heroProgression(hero)` is the sole pure source of effective maxima, class
  attributes and bonuses. It doesn't roll RNG or write a save.
- `settleHeroExperience(hero,xp,hp)` is the XP/level/health settlement
  routine shared by real ordinary and Troll encounters.
- Saved base stats remain immutable. Alpha v40 is the only supported campaign schema. Reject v39 and earlier explicitly; no migration or legacy adapter. Current-format Save/Load must be deterministic.
- `heroCombatAttributes` supplies the same attributes, gear, healing charges and reach for every enemy. Recorded combat snapshots are never recalculated after a later level-up.
- The hero UI and party injury decisions use effective max HP, not seeded base
  HP. Developer `From Roster` fighters use the same ordinary fight attributes
  and spell charges.

## Limits and evidence

[Current Alpha evidence](ALPHA_V40_ACCEPTANCE.md) and [issue #294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294) demonstrates capped class growth and equipment leverage, not final economic or class balance. No fake XP, resurrection, free healing or retroactive replay recalculation. A persistent mana economy remains an open design topic.
