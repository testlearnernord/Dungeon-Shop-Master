# Real Hero Progression (first balancing pass)

Gameplay goal: XP creates a **real, observable difference** in one shared fight
motor, but does not turn veterans into immortal dungeon sweepers. The same
derived actor statistics drive ordinary fights, the genuine Floor-10
Temporary Party Cave Troll, and the development Combat Lab. The older
Level-6 solo presentation/recording contract remains for compatibility.

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
  Armor from Leather Vest and +5 Iron Sword damage remain distinct purchases.

| Class | HP per growth step | Primary attribute | Other progression |
| --- | ---: | --- | --- |
| Tank | +4 max HP | +1 STR each 3 steps | +1 armor per 4 steps, +1 raw damage each 5 |
| DPS | +2 max HP | +1 AGI each 3 steps | +1 raw damage per 3 steps |
| Healer | +2 max HP | +1 INT each 3 steps | +1 dungeon spell initially, then +1 per 6 steps; boss begins with 2 spell charges, then +1 per 6 |

Healer combat magic is **bounded by actual encounter charges** and uses the
existing 25-HP spell effect. The hero does not receive free inventory Herbs.
This first slice has **no persistent mana pool**; eventually a proper resource
economy may replace encounter-limited spells. Non-healer healing still needs
owned consumables. Healers can also purchase and consume real supplies.

## Implementation contracts

- `heroProgression(hero)` is the sole pure source of effective maxima, class
  attributes and bonuses. It doesn't roll RNG or write a save.
- `settleHeroExperience(hero,xp,hp)` is the XP/level/health settlement
  routine shared by ordinary LIVE, non-LIVE legacy spatial and Troll battles.
- Saved `stats` retain historical values. Old campaigns, including pre-feature
  high-level heroes, load unchanged and receive their derived power on the
  next battle. Save validation now accepts real earned effective HP but rejects
  HP above its cap.
- Existing in-flight Troll battles, whose saved `options` predate progression
  and have no bonus fields, retain their original fixed values for the
  remainder of that specific fight. New fights save explicit derived bonuses.
  Recorded fight snapshots are never recalculated after a later level-up.
- The hero UI and party injury decisions use effective max HP, not seeded base
  HP. Developer `From Roster` fighters use the same ordinary fight attributes
  and spell charges.

## Limits and next tests

The prior 100-day audit showed late-game XP stagnation before the return-route
and shop-haul fixes. This progression pass should be checked against the same
four 100-day seeds for XP, mortality, survivor stock, and gold flow. It does
**not** solve scarcity, dead-hero hoarding, retail pricing or merchant agency.
Test both stocked and unstocked campaigns; paid supplies must still matter.

Do not balance by artificially awarding XP, healing dead heroes, mutating
historical replay frames or raising monster HP solely to compensate for the
level number.

## Historical first 100-day post-progression measurement (four-seed regression)

> This table measures the specific pre-#297/#298 code used in the linked run.
> It is **not** evidence for the current Floor-10 party boss or the latest
> role-aware shopping/merchant balance. Issue #294 remains open.

The deterministic world-clock audit [run 45013948343](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45013948343)
completed all four seeds successfully, including the previously broken late-night
combat case. These outcomes use *optimistic scripted shelf/cashier service*;
they do **not** measure player skill or physical NPC walking.

| Seed | Merchant policy | Maximum level | Last XP gain | Dead through Day 100 |
| --- | --- | ---: | ---: | ---: |
| 7351 | Absent | 9 | Day 98 | 21 |
| 7351 | Consumables | 9 | Day 100 | 45 |
| 7351 | Equipment | 9 | Day 100 | 18 |
| 7351 | Full | 8 | Day 100 | 20 |
| 42 | Absent | 13 | Day 98 | 16 |
| 42 | Full | 8 | Day 99 | 20 |
| 2026 | Absent | 5 | Day 59 | 29 |
| 2026 | Full | 6 | Day 99 | 54 |
| 9321 | Absent | 17 | Day 98 | 9 |
| 9321 | Full | 11 | Day 100 | 17 |

**Important balance finding:** no-merchant worlds can now produce veteran
heroes, in several seeds higher level with fewer deaths than full-stock shops.
This does not prove equipment hurts, because merchant visits change expedition
time, group formation and encounter counts. It does prove that *stocked retail
is not yet a consistently positive strategic choice*. Healer per-encounter
magical charges, recoveries, shop downtime, gear priorities and supply prices
must be jointly tested in the **next merchant-influence/economy pass**, rather
than counteracting the result by gifting gold or inflating monster HP.

The initial class-cap power growth is functional and testable, not necessarily
balanced. The dungeon and shop still need meaningful, competing resource costs.
