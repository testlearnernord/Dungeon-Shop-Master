# The Living Dungeon — design contract

> **Reconciled 22 November 2026 after merged #295–#298.** This is the *current design and acceptance contract*. The previous 671-line combination of branch notes, proposed PR numbers and outdated release states is preserved in Git history, not treated as runtime authority. Read [Game Bible](GAME_BIBLE.md), [Architecture](ARCHITECTURE.md) and [Roadmap](ROADMAP.md) for current scope.

## The experience

The player is **Galvik, the cursed merchant**, not the commander of the adventurers. He arranges physical goods, chooses whom to serve, negotiates buyback and loans, and witnesses consequences. Different named heroes have independent lives, goals, inventory, health, class traits, paths and relationships. The dungeon moves while the shop is open; nobody waits for Galvik to hit “next day.”

A strong playable day offers competing stock/service decisions and a few *recognizable* developments in customers' expeditions. Time advancing alone is not gameplay.

## The one world contract

- `GameStore` and the saved `worldClock` own time and mutations, never the renderer. One world tick equals 50 ms; movement advances at 200-tick checkpoints; combats settle real 60-Hz actor steps. Pausing a viewer or watching a recording is read-only.
- Each hero may **stay, descend, ascend or return to the cursed shop** according to personal needs, discovered paths, surviving resources and any real Temporary Party. No direct player-issued party, attack or waypoint commands.
- A shop return uses legitimate visited path/backtracking and a saved timed portal step; a hero cannot conjure a shortcut or full map knowledge. A physical shop departure begins **health-dependent world-tick recovery** before reentry on the existing dungeon movement clock.
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

## V0.004 A–D monster-world (merged in #336–339)

One persistent Ghoul-Pack world actor exists per active ordinary dungeon monster site generation on Floors 1–9. Each actor saves its true tile, origin, decision timer, mode and site cycle. Rare deterministic roaming uses real connected dungeon paths and **400 world ticks per monster tile** compared with 200 per hero tile. All movement runs in the existing LIVE world event, never the spectator or a second AI scheduler.

Ghoul sight uses the canonical geometric line-of-sight test (five-tile range). A visible hero or Temporary Party interrupts roaming and starts CHASING. When the target disappears behind walls or leaves vision, only the last truly observed location remains available; SEARCHING ends after three blind checks and a pack returns to its original home. Real collisions reserve one site and enter the existing 60-Hz GroupCombat. Site death, renewal, loot and replay are settled through the same authoritative dungeon world.

Autonomous heroes and co-located Temporary Parties may flee on actual adjacent tiles, seek to break sight, move toward a genuinely visible helper or approach the threat based on health, equipment and traits. No instant rescue, secret route or spectator-issued navigation orders are allowed. Hero route hints and a monster's **single red next-tile arrow** are observer-only previews; fights never exist merely because a visual marker was drawn.

**V0.004 E observation hardening (#340):** Galvik's Table rebuilds Ghoul mesh identities when pack generations spawn or disappear, even without a resolved-site change. Regular movement only interpolates existing instances. A missed interval or day skip does not fabricate a travel animation. The full LIVE Viewer and Table continue reading the same saved world facts.

**V0.004 F step presentation (#341):** A monster's **400-world-tick movement interval** is a gameplay rule, **not** a mesh interpolation duration. The Ghoul visually traverses its one committed tile in a short **1.2-second walk burst** (heroes: **0.85 seconds**) and then idles until its next actually committed move. Both Galvik's Table and full LIVE Viewer use the same clamped visual phase. No continuous 20-second crawl, additional AI clock, or cosmetic prediction of future movement.

**V0.004 G authored observation animation (#342):** Ordinary LIVE Ghoul markers reuse a per-scene two-pose skinned GLB representation: actual `idle_combat` when standing and `walk_feral` only during the same saved 1.2-second single-cell movement. The shared skeletal rigs serve the full LIVE Viewer and Galvik's Table; each pack keeps only two lightweight mesh instances, and no additional movement authority, spawn or combat simulation is permitted. Rig animation is deliberately distinct from the dedicated full combat actor. Galvik's Table and LIVE Viewer both advance cosmetic one-tile walks via bounded render-frame deltas, not elapsed wall time, so a slow frame cannot swallow an entire 1.2-second walk before it is rendered. Browser smoke checks an actual 400-tick move in each observer and a rendered walk-to-idle transition.

**V0.004 H threat/contact acceptance (#343):** A hero's real saved return-to-shop backtrack is no longer immune to visible pursuit. A valid one-tile tactical escape temporarily takes priority over the already committed homeward route; the persistent return journey remains intact and the next normal step resumes real connected backtracking. Focused regression coverage exercises LOS blocked by genuine wall corners, three blind checks and reacquisition without hidden-location leakage, strict Save/Load during pursuit, co-located 2-hero Temporary Party monster contact reserving **one** GroupCombat, and exact resume without duplicate fights. The existing nine-floor offscreen roaming/identity tests remain intact.

**Still requiring human acceptance:** visually inspect actual moving models and red arrow readability in both viewer modes, longer multi-floor balance/performance runs, and focused exploration of uncommon contact/visibility edge cases. Automated acceptance does not replace real gameplay observation.

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
- Recovery lasts 400/1200/2400/4800 world ticks according to health and supplies. The next existing movement tick consumes an owned dose if needed, extends treatment if another dose is needed and available, or commits reentry at the remembered entrance. Untreated heroes keep a cautious plan instead of returning for unchanged injuries. Real same-day returns permit another checkout, never another payment for the same visit.
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
