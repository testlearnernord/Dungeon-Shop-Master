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

**Current Alpha v35 reality:** the cursed shop is persisted once as `shopRoom`, and a hero's shop, outside-world or portal-transit location uses `"shop"`, `"away"` or `"transit"`, never a fake numbered floor. One real `portal` doorway replaces both historic `level4/level6` gates; regular Floors 1–9 share a saved `dungeonWorlds` collection. `bossPass` is the **current**, intentional Floor-10 party credential. The standalone non-LIVE day motor and old numbered-floor event/recording contracts were retired in #319–#320. **Remaining technical debt:** Floor-7 status-only exceptions, abstract loot tokens and misleading source naming, not a second shop or physical gate. No old Alpha saves are migrated. Refer to issue #300 before touching the live combat, mining or furniture systems.

## V0.004 A monster-world implementation status (PARTIAL)

The first implementation slice stores one real Ghoul-Pack entity per active ordinary monster site generation, with a saved x/z location, movement state, decision timing and 400-world-tick per-cell speed. `dungeonMonsterWorld.ts` is called only by the existing LIVE world event. It reconciles regenerated sites and pursues rare, deterministic connected-path roaming, without consuming the campaign RNG stream or adding another clock. Resolved packs disappear from the persisted world and a renewed generation starts at its own site.

The current LIVE floor projection, Tripo Ghoul map instance and Galvik's Table consume saved coordinates; each actively moving pack may show at most one red next-tile preview. These visuals cannot create a creature or a reward. Site-specific combat keeps `groupCombat.ts` and can begin when a hero enters an occupied monster tile.

**Second staged branch (V0.004 B):** `dungeonMonsterWorld.ts` now uses the existing `hasDungeonLineOfSight` geometry to discover only genuinely visible heroes within five tiles. A pack persists its observed target ID and last-known position, chases at its original 400-tick speed, searches after losing sight and returns to its home after three blind checkpoints. Re-sighting can restart pursuit. The targeting logic never reads hidden camera or spectator selections.

**Third staged branch (V0.004 C):** A chasing Ghoul can now step onto a genuinely occupied hero tile at its lawful speed. The one existing LIVE world-event owner arbitrates unreserved physical co-location, reserves exactly one original pack site and launches the existing 60-Hz `GroupCombat`, with authentic participants, canonical pack seed, actual contact coordinates and persisted arrivals. An already reserved or fighting hero cannot start a second contact encounter. A late-night contact defers a new fight until the existing scheduler has enough time. Existing hero-entering-monster behavior remains authoritative.

**Fourth staged branch (V0.004 D):** `dungeonThreatDecisions.ts` derives visible pursuit threats from the same world entity and line-of-sight algorithm. Injured or cautious groups flee along truly adjacent walkable tiles; other characters may physically bend around walls to break LOS, confront a visible pursuer when armed and healthy, or move toward a genuinely visible nearby helper. A saved Temporary Party makes one group step. The existing spatial walker performs the actual move; no separate navigation motor, teleport or secret map route is created. The LIVE hero status and one-step tactical route are read-only forecasts of this same decision function, not decorative fake orders.

**Still open for full V0.004 A:** explicit simultaneous edge-swap stress coverage, real browser visual/contact approval and a long multi-floor stability soak. All stacked PRs remain Draft with no merge without explicit approval.

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
