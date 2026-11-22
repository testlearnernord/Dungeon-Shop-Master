# The Living Dungeon — design contract

> **Reconciled 22 November 2026 after merged #295–#298.** This is the *current design and acceptance contract*. The previous 671-line combination of branch notes, proposed PR numbers and outdated release states is preserved in Git history, not treated as runtime authority. Read [Game Bible](GAME_BIBLE.md), [Architecture](ARCHITECTURE.md) and [Roadmap](ROADMAP.md) for current scope.

## The experience

The player is **Galvik, the cursed merchant**, not the commander of the adventurers. He arranges physical goods, chooses whom to serve, negotiates buyback and loans, and witnesses consequences. Different named heroes have independent lives, goals, inventory, health, class traits, paths and relationships. The dungeon moves while the shop is open; nobody waits for Galvik to hit “next day.”

A strong playable day offers competing stock/service decisions and a few *recognizable* developments in customers' expeditions. Time advancing alone is not gameplay.

## The one world contract

- `GameStore` and the saved `worldClock` own time and mutations, never the renderer. One world tick equals 50 ms; movement advances at 200-tick checkpoints; combats settle real 60-Hz actor steps. Pausing a viewer or watching a recording is read-only.
- Each hero may **stay, descend, ascend or return to the cursed shop** according to personal needs, discovered paths, surviving resources and any real Temporary Party. No direct player-issued party, attack or waypoint commands.
- A shop return uses legitimate visited path/backtracking and a saved timed portal step; a hero cannot conjure a shortcut or full map knowledge. A physical shop departure begins **two full off-duty days** before reentry.
- Treasure, monster sites, traps, site generations, one-time boss victories, equipment and gold must remain actual saved consequences. Renewable common sites are not infinite per-person loot duplicators.
- The compact Event Feed/Archive shows genuine outcomes. Live Board knowledge is bounded by what Galvik could know; intentionally opening the spectator may reveal committed world facts. Recordings never re-simulate, reroll, invent a win or play hit sounds again on seek.

## Implemented dungeon shape

| Place | Current design and implementation |
| --- | --- |
| Ordinary **Floors 1–9** | Physical, seeded, connected maps with the existing dungeon layout, heroes, resources and LIVE floor travel. Shared map support **does not** establish unique fully authored art/gameplay for each deeper floor |
| **Floor 10** | One Cave Troll encounter entered only by an actual saved, authorized 2–3-hero Temporary Party at the lower stair of Floor 9. Shared group combat at 60 Hz, bounded recordings, boss event and actual outcome |
| **Galvik's cursed shop** | A separate *unnumbered* realm accessible by the return option. One normal physical portal/threshold for shop traffic; do not label it Dungeon Floor 5 |
| **Old Level-6 solo Troll** | Historical non-LIVE fixture, training/visual quality reference and compatible recorded data. Not the world dungeon's new boss floor |

**Technical debt, not lore:** the current save still contains `floor: 5` for at-shop occupancy, `level5Room`, a `level6Permit` authorization key, `level6-*` historical events, and `level4/level6` door/gate identifiers. These are legacy v26 fields, **not game lore or long-term compatibility requirements**. During the next breaking Alpha schema cleanup, replace them with the intended single cursed-shop state and Boss Pass. **No migration** of old campaigns: reject incompatible files explicitly and test only current-format saves.

## Encounter and party expectations

- Temporary Parties are **situational and voluntary**. A co-located group must not collect one treasure, reward or enemy kill separately for each member.
- A Tank can absorb/parry, a DPS can hurt monsters, and a Healer can expend bounded *real* ability charges. Actual injuries, bought supplies, permanently equipped sword/armor and class-capped growth change battle behavior.
- **Cave Troll** is a dangerous group gate, not a farmable solo loot piñata. It has telegraphs, signature grab/lift/throw, lava, hit contact and cinematic flair. Preserve the high-quality existing look and audio even as the active boss moves to Floor 10.
- The motor is `groupCombat.ts` / `combatEncounter.ts`; V Combat Lab and LIVE party fights share it. Historical BossReplay-v1 adaptations are *projections* and old saved footage, not permission to create a second authoritative damage resolver.
- A real fight replay records participants, coherent HP/timing, cues, the immutable final result and genuine casualty signals. It is available from the correct committed World Feed event; no footage is manufactured for a marker without video.

## Shop and long-game decisions

- A physical picked item is an **unpaid cart** until the staffed register settles. Credit produces debt, not revenue. Buyback moves genuine found items and pays gold from Galvik's wallet. Stock never silently appears on a shelf.
- A well-equipped healthy DPS should value a sword, a Tank protection; a badly injured customer should value survival. A penniless customer can still petition for food before expensive equipment. These are implemented *initial* preferences, **not yet proven balanced**.
- Shop stock choices must affect the real expedition and combat chain. “You saved them” is only credible when a recording or controlled counterfactual supports the effect.
- Two days outside shop/dungeon prevent immediate repeat shopping after departure. They are not magic full-heal days; owned supplies may be consumed for genuine recovery.
- Long-run games must avoid hundreds of meaningless return/walkout cycles and progression plateaus. Measure live survivors, debt, gold with dead heroes, hero stock, time away and equipment effects across multiple seeded campaigns.

## Controls, viewer and mood

- The player can inspect the shop Board, a global Hero Card, a floor-wide read-only LIVE Dungeon map, and a deliberately opened 3D battle. Camera movement is observation, not hero control.
- Present the observable **party roster at the edge of the fight**, not an enormous duplicate HUD. Use readable class/equipment/HP icons, actual attack/heal/defense cues and one consistent worldwide character identity.
- Normal fights and the Troll should have distinct but high-quality camera intros. Combat Lab can toggle cinematics locally. Timing must not make the authoritative motor run faster or slower.
- Music, SFX, scene interpolation, character rigs and UI must survive save/reopen/seek. A renderer's appearance cannot determine a hit, level, loot or customer transaction.

## Retention and narrative boundaries

- The event timeline keeps **today plus the two previous completed days**. The player may permanently pin **up to 12** real recordings; otherwise large footage expires according to the saved policy. Never create unlimited archives.
- Galvik's fiancée portrait and real cellar/pond exist; forge, extended material economy and additional world lore are not automatically part of V.003 acceptance.
- The source of Galvik's curse, whether dead heroes become Ghouls, a 400-year contract and an eventual curse transfer remain **OPEN story exploration**, not canonical boss triggers.
- Hunger, mandatory morning/midday/evening engine stages and several unrelated shops are **rejected**.

## Acceptance before calling V.003 done

1. 10-day hands-on campaign: shops, customers, hero identities, combat and return cycles remain intelligible and fun.
2. 20-/50-/100-day multi-seed tests of actual XP growth, purchases, casualties and economy. Include no-store, only-consumable, only-equipment and full-store policies.
3. Legitimate *in-world* Floor-9-to-10 party attempt, recovered/replayed after strict Save/Load, with no second combat simulation.
4. Actual browser NPC walking, one-portal access, cashier traffic, credit/request deadlines and cellar traversal through real obstacles.
5. Real-device combat animation, sounds, camera/focus, HUD and frame pacing evaluated independently from green CI.

The historical PR chronology belongs in Git commits, not in this living design document.
