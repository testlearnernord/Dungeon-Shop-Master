# Dungeon Shop Master — Current Architecture

> **Living technical map · reviewed 2026-11-14.** Navigational guidance, not a frozen API or history of refactors. If modules move, interfaces change or mechanics are removed, replace obsolete entries in the same PR. Source and tests remain the authority for implemented behavior.

## 1. Runtime and ownership

The current game is a **TypeScript/Vite** browser application rendered with **Babylon.js**.

- `src/main.ts` wires the startup, shop scene, controllers, day closure, UI, and active arena/dungeon viewers.
- `src/game/gameState.ts` defines persisted `GameState` and deterministic day progression. `src/game/gameStore.ts` owns validated player actions and subscriber notifications.
- Pure simulation functions must remain independent of Babylon meshes and the DOM. Scene objects and HUD projections are representations of authoritative game state, not additional sources of truth.
- Scene transitions among the Level 5 shop, boss arena and dungeon viewer must not silently mutate the stored combat result.

## 2. Current module map

| Responsibility | Source of truth / key modules |
| --- | --- |
| Bootstrapping and scene wiring | `src/main.ts`, `src/game/world.ts` |
| State, day advancement and player mutations | `src/game/gameState.ts`, `src/game/gameStore.ts`, `src/bedtime.ts` |
| Economy, item rules, credit, payment | `src/game/economy.ts`, `src/game/shopCredit.ts`, `src/game/customerCheckout.ts`, `src/game/shopCarts.ts` |
| Adventurers and autonomous customer intentions | `src/game/adventurers.ts`, `src/game/shopperIntents.ts`, `src/game/shopArrivals.ts` |
| Customer visuals, movement, waiting and checkout | `src/game/npcVisualSystem.ts`, `src/game/shopServiceSpots.ts`, `src/game/shopperNavigation.ts`, `src/game/checkoutQueue.ts`, `src/game/restockWaitingPlaces.ts`, `src/game/shelfWaitingPlaces.ts` |
| Shop geometry, cashier docking and service-path validation | `src/game/shopLayout.ts`, `src/game/level5Room.ts`, `src/game/shopServiceReachability.ts`, `src/game/checkoutQueue.ts` |
| Contextual furniture editor and preview performance | `src/blueprintHud.ts`, `src/game/furnitureBlueprint.ts`, `src/game/furnitureSelection.ts`, `src/game/blueprintPreviewValidator.ts` |
| Bedroom props and wall-mounted board | `src/game/bedroomFurniture.ts`, `src/game/bedroomFurnitureVisuals.ts`, `src/game/rosterBoardPlacement.ts`, `src/game/rosterBoard.ts` |
| Levels 1–4, Floor 6 boss and Floor 7 exploration | `src/game/dungeonSimulation.ts`, `src/game/level6Combat.ts`, `src/game/level7Exploration.ts` |
| Boss/dungeon replay and observation | `src/game/bossCombatReplay.ts`, `src/game/level6Arena.ts`, `src/game/dungeonViewer.ts`, `src/game/dungeonReplayPlayback.ts` |
| Hero identity/appearance and portraits | `src/game/heroIdentity.ts`, `src/game/heroVisual.ts`, `src/game/portraitAtlas.ts` |
| End-of-day book and spoiler-safe projections | `src/merchantLedger.ts`, `src/ledgerHeroChronicle.ts`, `src/ledgerSealedExpeditions.ts`, `src/ledgerViewState.ts` |
| Campaign save validation | `src/game/campaignSave.ts` |
| Shared interface and sound | `src/uiIcons.ts`, `src/immersiveUi.css`, `src/soundtrack.ts` |

This is a **route map**. Before editing, inspect the named module, its imports, callers and relevant tests; do not assume the table guarantees an isolated interface.

## 3. Invariants to preserve

1. **One authoritative game state.** Changes run through validated simulation/store operations. HUDs and meshes follow; they do not independently resolve purchases, damage or progression.
2. **Replay fidelity.** Level 6/7 outcomes are committed before watching. Reopening a recording never rerolls combat, survival, loot, XP or merchant gold.
3. **Spoiler-safe projection.** The ledger separates known business activity from sealed outcomes. Never derive pre-replay hero status from the after-day state. Pending-ledger restore must not temporarily render unsafe information.
4. **Furniture preview versus commit.** Cursor previews do not write saved state. Click/commit rechecks collision and geometry using authoritative rules. Shelf access, checkout queues and the door stay reachable. Focus outlines trace visible furniture, not the larger clearances reserved for NPC service.
5. **All dependent transforms move together.** Bedroom object groups include their interaction targets, collision hulls and lights when applicable. Sleep range follows the moved bed; roster interaction follows the moved board. Register geometry, staff docking, queue and blueprint use the same counter placement and orientation.
6. **No hunger implementation.** Waybread/Herbs heal HP. No starvation timers, hunger events or residual hunger logic.
7. **Persistence discipline.** `SIMULATION_VERSION` is presently **12**. Different simulation versions are not automatically migrated. Optional fields can still preserve compatibility within version 12; do not conflate that with introducing a save migration. Invalid saves must not be silently overwritten.

## 4. Performance and runtime watchpoints

- **Blueprint hover:** snapped candidate position and rotation may update every frame. Avoid full customer-path BFS per mouse movement or per ghost mesh. Cache settled geometry checks and invalidate against layout/room/furniture changes; keep moving NPC/player occupancy live.
- **NPC traffic:** `ShopServiceSpots` derives checkout, shelf-browse, shelf-wait, restock, credit and idle/overflow points from the current layout/room and reserves exclusive physical destinations (including real shelf-browsing endpoints) and shelf service ownership. Unclaimed candidate queue/restock spots are not permanently blocked from shelf browsing; only currently claimed destinations and occupied routes prevent an approach. Invalidate only on topology changes, release on reassignment/departure, and refuse placement when no reachable free spot exists. Movement still has separate gate crowd arbitration. After a pedestrian stall, travelling shoppers may softly pass other moving NPCs but must not overlap settled service visitors or cross the final 1.27m approach to their own reserved station; this prevents aisle gridlock without making checkout/restock customers intangible. Do not mistake service reservation for a complete multi-agent path planner. Track real progress toward a waypoint across multiple frames, not just each small sidestep. After six seconds without 35cm of net advance, a restock/credit visitor releases its old reservation and retries an alternate reachable service pocket, without resetting the 60-second wait once at the station. Measure actual congestion before changing collider sizes, collision semantics or path grid resolution.
- **Replays and reports:** preserve snapshot/event identity across sleep, observation and reload. Never call day advancement twice through UI lifecycle.
- **Meshes and listeners:** reuse materials/geometry where sensible; avoid accumulating per-frame allocations, subscriptions or event listeners after scene/view transitions.
- **Audio/visual assets:** keep asset work separate from simulation semantics. A nicer model should not redefine its gameplay footprint accidentally.

## 5. Verification and delivery

- Local setup: `npm ci`, `npm run build`, `npm run test:unit`; browser tests use `npm test`. Node requirements and active scripts are described in [README](../README.md).
- Pull-request CI builds the project, runs the unit suite and the existing small set of **four essential Playwright smoke specs**: day clock, cashier receipt, Level 5 excavation and shopper flow. The full Playwright regression is manually runnable via the separate GitHub Actions workflow.
- Add **focused tests** for affected invariants. Do not expand default CI just to increase the test count; keep browser checks targeted.
- Build/test pass is necessary for code changes; documentation-only edits still receive the repository's configured PR checks. Never claim a check was run if it was not.
- GitHub Pages deploys merged `main`. Verify deployment separately from the PR CI run.

## 6. Documentation sync, not document archaeology

- **Every code PR:** compare changed modules and user-visible behavior against this map, [GAME_BIBLE.md](GAME_BIBLE.md) and [AGENTS.md](../AGENTS.md).
- Update affected entries **in that PR**. Delete renamed, removed or obsolete references instead of leaving historical modules as if they still existed.
- Keep architecture facts in this file, design approvals and unresolved questions in the Game Bible, and contributor workflow rules in AGENTS. Do not duplicate long policy paragraphs across all three.
- Do not record a new “latest architecture” subsection each week; edit the existing overview. History belongs in Git commits and PR discussions.

### Current excavation and casualty-display rules

- Unlocking mining (U) **must not change visible wall art**. Until a side is actually excavated, retain its original 14m masonry mesh and use transparent pick-only targets in front of it. Once dug, only that side is segmented, and all remaining wall slices inherit the corresponding full-wall UV coordinates rather than rescaling the entire stone texture into every 1m segment.
- Newly dug floor meshes must be pickable as blueprint floor surfaces. Final counter/shelf validation receives the authoritative excavated room. Support must cover the **full furniture footprint**, not just the cell under the crosshair. Incomplete excavations receive a precise status; contiguous excavations must pass the real P placement and save flow.
- Floors 1–4 have offscreen combat simulation without player-watched recordings. Their victims must not automatically be shown as replay-verified memorial deaths. The background simulation may kill only through exhausted HP.
