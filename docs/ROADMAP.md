# Dungeon Shop Master — active roadmap

> **Current planning baseline: 25 November 2026, after merged #363 (Alpha v40).** This is the living prioritization document, not a chronological list of PRs. Current runtime and tests win over earlier design notes. Git history preserves the old roadmap. The published HUD still says **V.002 ALPHA**; V.003 is an acceptance/release goal, not a claim that V.004 work is missing.


**Unified live hero combat contract:** Every monster and boss uses the same `heroCombatAttributes` projection, weapon preparation, hero poise, defense eligibility, collision and roll movement. Enemy abilities, telegraphs, geometry and environment may influence tactical choices, never silently replace a hero's stats or gear. Historical solo training remains isolated from live rules. The new checkpoint contract requires a fresh Alpha v40 campaign; v39 and older are incompatible. The 35/90-second encounter limits and signature-specific tactical movement remain separate follow-up work; no claim of final balance or visual acceptance.

## What already works — IMPLEMENTED

- One saved 50-ms world clock for physical shop traffic, connected dungeon movement every 200 ticks, and actual 60-Hz combat. Day closure is a deliberate bed interaction.
- Autonomously controlled heroes, Temporary Parties, class-specific capped power growth through **Level 20**, real equipment and consumable consequences. Purchase decisions account for role and injuries; nothing gets sold without a real checkout.
- Seeded, physically connected **ordinary Floors 1–9**, renewable common sites, independently persisted positions, resource goals, retreats and timed return to Galvik's **separate cursed shop realm**.
- **Floor 10** is the unique Cave Troll **2–3-person Temporary Party** boss gate, requiring valid saved pass flags. True party combat and its 60-Hz frames use the common motor; equipped and unarmed comparisons have regression coverage.
- A shared shop doorway for normal arrivals/departures, the player cellar, pond/fishing, independent furniture and shelf placement, staff-side checkout, credit, bought dungeon finds and a functional cellar forge consuming real materials for T2 gear.
- One World Feed, knowledge-safe Adventurer Board, explicit read-only floor viewer, worldwide Hero Cards, bounded Expedition Archive and opt-in recorded boss/ordinary fights. A real loss has an authentic footage link only if real footage exists.
- V Developer Combat Lab uses the same underlying group motor. Historical solo **Level-6** previews and their v1 recording formats remain **compatibility/training paths**, not a second new-world boss location or preferred simulation authority.
- The Great Cleanup's historical proof, asset provenance and CI policy are retained in the dated [audit](CLEANUP_AUDIT.md) and [closeout](GREAT_CLEANUP_CLOSEOUT.md).

## Priorities still open

**Current balance baseline:** #363 consolidated ordinary combat pacing, spear mechanics and visible solo-pack risk. Both candidates passed 28 scripted 100/200-day scenarios; the accepted risk policy improves ordinary survival while boss conversion remains a follow-up. See [measured evidence](GAMEPLAY_VETERAN_PARTY_BALANCE.md).

### P0 · correctness and current-save safety

1. **Current-save safety:** Alpha v40 is the only supported schema. Reject v39 and older without migrations. Preserve `shopRoom`, one `portal`, real hero locations, shared `dungeonWorlds`, the LIVE scheduler and canonical replay contracts. Regress current-format Save/Load, real transactions and encounters.
2. **Long-game acceptance:** the scripted audit now reaches Floor 10 in all six Forge scenarios and records wins. Actual boss conversion, party composition and real-player commerce/pacing remain open; no artificial progression or income.
3. **Browser route truth.** Test the one physical portal, permanently sealed old right route, paid carts, existing credit requests, arrival/departure congestion, reload and cellar ascent on representative actual scenes. Node's optimistic scripted cashier is not a Babylon NPC pathfinding test.

### P1 · gameplay and economic meaning

1. Improve conversion of legitimate Floor-10 attempts into victories without forcing recruitment, granting free power or weakening the boss blindly. The scripted campaign already proves reachability.
2. Make stocking, shortages, bread/herbs, armor and weapon buying produce measurable *causal* differences; investigate whether a shopless campaign sometimes outperforms a full shop. Do not inject free XP, items, healing or cash.
3. Expose why a hero bought, skipped, borrowed, stayed, retreated or returned. Investigate repetitive walkouts, mana potions without persistent mana demand, dead-hero gold sinks, repair/upgrade demand and merchant sustainability.
4. Extend the *quality* of deep floors 5–9 (meaningful layouts, enemies, traps, level signals, equipment incentives) beyond the generic seeded floor contract. **Generated map connectivity is not authored content or a playtest sign-off.**
5. Validate physical 3D combat visibility, boss telegraphs, party framing, replay seek/controls, Ghoul/Troll music and sample mix on real hardware.

### P2 · future design (NOT committed implementation)

- Additional equipment tiers, repairs/forge expansion, expanded cellar resource chains, deeper authored chapters and broader hero relations.
- Galvik's curse origin, Ghoul-after-death story, transfer-of-curse and ending choices stay **OPEN**, not canon.
- Full 100-floor content is a long-range ambition, not a release promise.

## Release/merge gates

- One authoritative motor, deterministic current-save/reload, physically valid movement, bounded genuine events and no phantom economic transactions.
- 20-/50-/100-day campaign progression with meaningful late outcomes, without immortal veterans or guaranteed campaign stalling.
- A real gameplay pass observing at least ten days of merchant choices and returns. Scripted test success is not proof of player enjoyment.
- Build, unit suite, curated browser smoke and Pages artifacts green; relevant full browser, visual, audio and FPS acceptance remain explicit manual checks.
- Keep V.002 label until the milestone is actually signed off; do not turn technical merges into a misleading release announcement.

## Evidence / navigation

- [Living Game Bible](GAME_BIBLE.md) · [Architecture](ARCHITECTURE.md) · [Living Dungeon design](THE_LIVING_DUNGEON.md)
- [Current v39 balance evidence](GAMEPLAY_VETERAN_PARTY_BALANCE.md) summarizes accepted campaign and controlled-combat measurements. The [v36 audit](GAMEPLAY_100DAY_V36.md) is historical. The [historical audit](GAMEPLAY_100DAY_AUDIT.md) and [Hero progression results](HERO_PROGRESSION.md) refer to earlier source revisions.
- [Legacy/obsolescence audit](LEGACY_OBSOLESCENCE_AUDIT.md) classifies what to keep for current gameplay, retire in the breaking cutover, or protect as source assets.
- GitHub issue **#294** tracks the unresolved economy/long-game acceptance; close it only with new evidence.


Completed historical cutovers are recorded in [Architecture](ARCHITECTURE.md), the cleanup ledger and Git history. They are not pending work.
