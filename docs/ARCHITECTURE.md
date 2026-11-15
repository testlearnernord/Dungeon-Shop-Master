# Dungeon Shop Master — Current Architecture

> **Living technical map · reviewed 2026-11-15.** Navigational guidance, not a frozen API or history of refactors. If modules move, interfaces change or mechanics are removed, replace obsolete entries in the same PR. Source and tests remain the authority for implemented behavior.

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
| Registered public-shop furniture geometry, cashier docking and service routes | `src/game/shopFloorFurniture.ts` (canonical footprint, solid collision, visible preview/focus, service sockets), `src/game/shopLayout.ts` (persisted transforms and cached geometry), `src/game/level5Walkability.ts`, `src/game/shopServiceReachability.ts`, `src/game/checkoutQueue.ts` |
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
4. **Furniture preview versus commit.** Cursor previews do not write saved state. Both furniture editors call the same `GameStore.previewShopPlacement` check as the authoritative click/commit, including the excavated `level5Room`, board clearance and reachable service routes. Shelf access, checkout queues and doors stay reachable. Focus outlines trace visible furniture, not the larger clearances reserved for NPC service.
5. **One shop-floor furniture definition.** `shopFloorFurniture.ts` registers separate placement footprint, physical collision hull, visible preview/focus bounds and service sockets for shelves and counter. `shopLayout.ts` materializes per-layout collision boxes once and uses registered service sockets; both original and excavated-room walkers, rendered blueprints, checkout queue, shelf access and furniture selection consume the same definitions. Keep registered dimensions in metres; do not retype them into a second nav or UI module. The old two-shelf/counter persisted layout and shop economy IDs remain unchanged. Future shop-floor furniture still needs a real persisted identity, mesh, fixture enumeration and service behavior before it can be bought/placed.
6. **All dependent transforms move together.** Bedroom object groups include their interaction targets, collision hulls and lights when applicable. Sleep range follows the moved bed; roster interaction follows the moved board. Register geometry, staff docking, queue and blueprint use the same counter placement and orientation.
6. **No hunger implementation.** Waybread/Herbs heal HP. No starvation timers, hunger events or residual hunger logic.
7. **Persistence discipline.** `SIMULATION_VERSION` is presently **12**. Different simulation versions are not automatically migrated. Optional fields can still preserve compatibility within version 12; do not conflate that with introducing a save migration. Invalid saves must not be silently overwritten.

## 4. Performance and runtime watchpoints

- **Blueprint hover:** snapped candidate position and rotation may update every frame. Avoid full customer-path BFS per mouse movement or per ghost mesh. Cache settled geometry checks and invalidate against layout/room/furniture changes; keep moving NPC/player occupancy live.
- **NPC visit lifecycle:** `shopArrivals.scheduleShopVisit` takes the day settlement's paid IDs so a completed purchase cannot reroll into a `shop-stay`. `NpcVisualSystem` tracks same-day manual receipts separately from persistent `at-shop` simulation status; ordinary roster updates must not revive a shopper already exiting or respawn one who left the scene. Once an actor is in a gate corridor, a renewed departure must continue outward on that physical side instead of routing backward through the shop.
- **Navigation grid:** `pathToShopGoal` caches static blocked/free cells within each individual route search. This avoids repeating furniture and excavated-room collision queries during endpoint snapping and breadth-first traversal without caching moving NPC occupancy or persisting stale results across layout changes.
- **NPC traffic:** A maximum of five buyers form one physical checkout line; each station is 1.3m apart, exceeding the shared `NPC_STATION_CLEARANCE` of 1.18m for exclusive service claims. Additional buyers use existing overflow stations instead of circling the register. Dedicated incoming and outgoing corridor lanes permit simultaneous opposite-direction traffic while physically separated; otherwise retain right-of-way arbitration. Requesting customers initially visit a petition spot, then reserve successive quiet `roam` locations away from checkout, service faces, doors and other claims. Their 60-second request expires even in transit; a begging conversation pauses only that visitor's timer/movement. `ShopServiceSpots` derives checkout, shelf-browse, shelf-wait, restock, credit and idle/overflow points from the current layout/room and reserves exclusive physical destinations (including real shelf-browsing endpoints) and shelf service ownership. Unclaimed candidate queue/restock spots are not permanently blocked from shelf browsing; only currently claimed destinations and occupied routes prevent an approach. Invalidate only on topology changes, release on reassignment/departure, and refuse placement when no reachable free spot exists. Movement still has separate gate crowd arbitration. After a pedestrian stall, travelling shoppers may softly pass other moving NPCs but must not overlap settled service visitors or cross the final 1.27m approach to their own reserved station; this prevents aisle gridlock without making checkout/restock customers intangible. Do not mistake service reservation for a complete multi-agent path planner. Track real progress toward a waypoint across multiple frames, not just each small sidestep. After six seconds without 35cm of net advance, a restock/credit visitor releases its old reservation and retries an alternate reachable service pocket, without resetting the 60-second wait once at the station. Measure actual congestion before changing collider sizes, collision semantics or path grid resolution.
- **Replays and reports:** preserve snapshot/event identity across sleep, observation and reload. Never call day advancement twice through UI lifecycle.
- **Excavation geometry:** `level5RoomVisuals` retains unaffected mined floor/ceiling/rock meshes by stable topology keys. A pickaxe strike creates/disposes only changed boundaries; never recreate every previously dug mesh after removing one cell. Customer idle navigation pools are expanded lazily after room edits rather than always calculating 100 destinations.
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
- A furniture placement is only valid if both entrance routes reach checkout, all shelf service points, and at least two independent reachable restock/credit petition spots. Older fixed rear-wall pockets have a walkable fallback that adapts to the current excavated floor if rearranged furniture consumes them. The mixed-shop integration test covers a real mined wing, relocated shelves/cashier, requests, roaming, saving and unchanged day simulation. Bedroom furniture and wall board are separately placed, not counted as customer-navigation floor obstacles. Any new shop-floor furniture must explicitly implement persisted placement + visible collision, matching `level5FloorWalkable`/pathfinding, service endpoints and preview/commit checks; integration tests must accompany it.
- Newly dug floor meshes must be pickable as blueprint floor surfaces, including when targeted from the original showroom across a mined opening. Do not cap the editor ray to the old 16m reach, and explicitly exclude disabled original side-wall meshes from Babylon picks (disabled geometry can still reach the ray predicate). Both preview and commit validate the **same** authoritative room and board, plus service routes. Support must cover the **full furniture footprint**, not just the cell under the crosshair. Incomplete excavations receive a precise status; contiguous excavations must pass the real P placement and save flow. Hard-coded side-aisle exclusion strips must not arbitrarily forbid geometry that passes real path validation.
- Floors 1–4 have offscreen combat simulation without player-watched recordings. Their victims must not automatically be shown as replay-verified memorial deaths. The background simulation may kill only through exhausted HP.
