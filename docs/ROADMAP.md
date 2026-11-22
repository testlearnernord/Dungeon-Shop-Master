# Dungeon Shop Master — active roadmap

> **Current planning baseline: 22 November 2026, after merged #320 (current v35).** This is the living prioritization document, not a chronological list of PRs. Current runtime and tests win over earlier design notes. Git history preserves the old roadmap. The published HUD still says **V.002 ALPHA**; V.003 is an acceptance/release goal, not a claim that V.004 work is missing.

## What already works — IMPLEMENTED

- One saved 50-ms world clock for physical shop traffic, connected dungeon movement every 200 ticks, and actual 60-Hz combat. Day closure is a deliberate bed interaction.
- Autonomously controlled heroes, Temporary Parties, class-specific capped power growth through **Level 20**, real equipment and consumable consequences. Purchase decisions account for role and injuries; nothing gets sold without a real checkout.
- Seeded, physically connected **ordinary Floors 1–9**, renewable common sites, independently persisted positions, resource goals, retreats and timed return to Galvik's **separate cursed shop realm**.
- **Floor 10** is the unique Cave Troll **2–3-person Temporary Party** boss gate, requiring valid saved pass flags. True party combat and its 60-Hz frames use the common motor; equipped and unarmed comparisons have regression coverage.
- A shared shop doorway for normal arrivals/departures, the player cellar, pond/fishing, independent furniture and shelf placement, staff-side checkout, credit, bought dungeon finds and dedicated Ore/Coal workshop reserve.
- One World Feed, knowledge-safe Adventurer Board, explicit read-only floor viewer, worldwide Hero Cards, bounded Expedition Archive and opt-in recorded boss/ordinary fights. A real loss has an authentic footage link only if real footage exists.
- V Developer Combat Lab uses the same underlying group motor. Historical solo **Level-6** previews and their v1 recording formats remain **compatibility/training paths**, not a second new-world boss location or preferred simulation authority.
- The Great Cleanup's historical proof, asset provenance and CI policy are retained in the dated [audit](CLEANUP_AUDIT.md) and [closeout](GREAT_CLEANUP_CLOSEOUT.md).

## Priorities still open

### P0 · correctness and current-save safety

1. **Breaking Alpha schema cleanup, NO MIGRATION (#300).** The *design* shop is unnumbered, but current v35 already uses persisted `shopRoom`, ordinary `dungeonWorlds` and explicit hero `floor="shop"`/`floor="away"`/`floor="transit"` for the unnumbered realm/off-duty interval, and historic non-LIVE event/source readers remain (both LIVE and non-LIVE Floor-6 solo boss dispatchers were deleted), while `bossPass` and the **single physical portal + one `doorY.portal` checkpoint are already canonical**. The parallel non-LIVE day solver is retired in #319 and the dedicated Floor-7 replay/event and Solo-F6 event reader are removed in #320. PR #321 removes the remaining Floor-7-only solo-status allowance and its test-only adapter. Remaining cleanup concerns abstract loot counters, historical source naming and evidence-based dead-code audits. The two physical gates and numeric shop-floor save fields were **already** replaced; do not reimplement them. **Do not** write conversion code for old Alpha saves. Reject incompatible previous versions clearly, including v29 after the new required cellar table in v30; test new-game inventory, arrivals/departures, credit/debts, replays, real Floor-10 party combat and current-format Save/Load.
2. **Long-game audit after #298.** Rerun the real 20-/50-/100-day seeded policy matrix on the **current** code. Report XP on days 20/50/80, deaths, treasure use, gear sales and survival, gold held by living/dead heroes, repeat visits and class-dependent demand. Earlier runs are historical, not results for current balance.
3. **Browser route truth.** Test the one physical portal, permanently sealed old right route, paid carts, existing credit requests, arrival/departure congestion, reload and cellar ascent on representative actual scenes. Node's optimistic scripted cashier is not a Babylon NPC pathfinding test.

### P1 · gameplay and economic meaning

1. Validate a healthy, geared Temporary Party can reach and attempt Floor 10 **through real progress** over many days. Seeded direct-entry unit tests prove only the fight boundary, not an entire playable campaign.
2. Make stocking, shortages, bread/herbs, armor and weapon buying produce measurable *causal* differences; investigate whether a shopless campaign sometimes outperforms a full shop. Do not inject free XP, items, healing or cash.
3. Expose why a hero bought, skipped, borrowed, stayed, retreated or returned. Investigate repetitive walkouts, mana potions without persistent mana demand, dead-hero gold sinks, repair/upgrade demand and merchant sustainability.
4. Extend the *quality* of deep floors 5–9 (meaningful layouts, enemies, traps, level signals, equipment incentives) beyond the generic seeded floor contract. **Generated map connectivity is not authored content or a playtest sign-off.**
5. Validate physical 3D combat visibility, boss telegraphs, party framing, replay seek/controls, Ghoul/Troll music and sample mix on real hardware.

### P2 · future design (NOT committed implementation)

- Additional equipment tiers, repairs/forge, expanded cellar resource chains, deeper authored chapters and broader hero relations.
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
- [100-day audit](GAMEPLAY_100DAY_AUDIT.md) and [Hero progression results](HERO_PROGRESSION.md) are **dated measurements**, not current-run proof.
- [Legacy/obsolescence audit](LEGACY_OBSOLESCENCE_AUDIT.md) classifies what to keep for current gameplay, retire in the breaking cutover, or protect as source assets.
- GitHub issue **#294** tracks the unresolved economy/long-game acceptance; close it only with new evidence.

- **Floor-6 recording route cleanup:** A floor number alone no longer selects a boss viewer. Current ordinary Floor-6 tapes use the shared dungeon route, while true Floor-10 group tapes use a distinct party-boss marker. The retired `level6-*` events and their save aliases were removed in #320. Keep the authored Combat Lab and genuine Floor-10 party boss.

- **Strict event cut:** Retired Solo-F6 event names and solitary boss replay fields are invalid at the current save boundary and absent from reporting. A future scoped refactor may remove the remaining internal legacy-facing `WorldEvent` and isolated arena preview types; preserve legitimate old training art and actual GroupCombat. Do not accidentally reintroduce an Alpha migration adapter.

- **Single-sale authority (#310–#311):** Delete forecast-to-sale `customerCheckout` and its public GameStore methods. Only physically held shelf carts can close at the staffed register; read-only `forecastShoppingIntents` does not grant stock or money. Separate credit and buyback preserve their real accounting. Current-format cash/gear/sale regression coverage uses actual reserved carts.

- **Completed in #312 (v31):** Persisted `level5Room` removed and replaced with canonical `shopRoom`, preserving shop mining, editor, collision, traffic and cellar distinction without a migration. **Completed in #313 (v32):** explicit shop and away hero locations; **completed in #314 (v33):** retire numeric Floor-4 portal-transit sentinel; **#315 (v34):** one ordinary-floor saved world collection; **#319:** one LIVE day motor; **#320 (v35):** canonical events and replay contracts; **#321:** Floor-7 solo-status and test-wrapper cleanup. **Still open (#300):** abstract loot counter, old internal naming and verified dead-code candidates.
