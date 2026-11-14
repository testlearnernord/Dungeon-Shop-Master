# Dungeon Shop Master — Architecture Guide

> **Status: initial map · 2026-11-14.** Grounded in the current source and README; verify exact call paths before changing them. This is architecture guidance, not a frozen API specification.

## Separation of responsibilities

The game runs as a TypeScript/Vite web application using Babylon.js for 3D rendering. Keep **game rules and persisted data** separate from **scenes, visuals and DOM/HUD**. A future desktop shell should ideally reuse the simulation, not demand a game rewrite.

### Important modules

| Responsibility | Primary entry points |
| --- | --- |
| Startup / subsystem orchestration | `src/main.ts` |
| Authoritative campaign state, day progression | `src/game/gameState.ts` |
| State mutation entry point / subscriptions | `src/game/gameStore.ts` |
| Inventory, pricing and commercial rules | `src/game/economy.ts`, `src/game/customerCheckout.ts`, `src/game/shopCarts.ts` |
| Adventurers and shopping intentions | `src/game/adventurers.ts`, `src/game/shopperIntents.ts` |
| Furniture geometry and rules | `src/game/shopLayout.ts`, `src/game/bedroomFurniture.ts` |
| Shop physical visuals and placement | `src/game/shop.ts`, `src/shopPlacementHud.ts`, `src/blueprintHud.ts` |
| Pathfinding and shop reachability | `src/game/shopperNavigation.ts`, `src/game/shopServiceReachability.ts`, `src/game/blueprintPreviewValidator.ts` |
| Dungeon simulation and replay | `src/game/dungeonSimulation.ts`, `src/game/level6Combat.ts`, `src/game/level7Exploration.ts`, `src/game/dungeonViewer.ts` |
| Character visuals | `src/game/heroVisual.ts`, `src/game/npcVisualSystem.ts` |
| Game world / shop environment | `src/game/world.ts` |
| Persistence validation | `src/game/campaignSave.ts` |
| End-of-day reporting | `src/merchantLedger.ts` |

Read affected modules and their imports before a refactor: this table is navigation, not permission to assume isolated behavior.

## Architectural invariants

1. **Single authoritative simulation:** A rendered actor or furniture ghost is not a second source of gameplay truth.
2. **Committed replay:** Dungeon outcomes, seeds, and combat effects must be deterministic. Reopening a replay cannot re-resolve the fight.
3. **Preview / commit separation:** Hovering or dragging furniture must not mutate the saved shop layout. Commit through validated state transitions, with a final check for occupancy and navigability.
4. **Customer reachability:** Entrances, checkout/queue and shelf service positions must remain traversable after furniture moves.
5. **Simulation before visuals:** Use identifiers and value objects in core rules where possible; avoid requiring Babylon Scene, Mesh or DOM objects in pure simulation modules.
6. **Persistence discipline:** Existing saves must never be silently overwritten when invalid. The alpha currently uses strict simulation-version validation and intentionally does not promise old-save migrations.
7. **No hunger system:** HP healing supplies and dungeon injuries only. No shadow hunger fields, timers, starvation events or duplicated survival logic.
8. **UI reveals actual state:** End-day results and hero reports should derive from committed state/events, not fabricated visual events.

## Performance watchpoints

- Furniture hover and mouse movement can produce high event frequency. First validate cheap geometry/occupancy and **only** run expensive route checks for changed, settled candidate positions; cancel stale work and cache by relevant geometry revision/footprint when justified.
- Never call full NPC pathfinding on every render frame without profiling and an explicit reason.
- Avoid building redundant materials or per-object geometry when sharing/instancing works. Distinguish performance hypotheses from measured hot paths.
- Keep shop, dungeon, arena and HUD lifecycle ownership clear to prevent accumulating listeners, detached meshes or unnecessary scene work.

## Refactoring priorities

- `src/main.ts` currently orchestrates many subsystems. Extract **cohesive initializers**, not a monolithic rewrite.
- Keep domain rules in `src/game/` modules distinct from scene rendering and DOM controllers.
- Treat placement/route validation as a stable interface that can be reused across editors without duplication.
- Introduce external GLB/glTF assets incrementally, preserving actor identity, equipment semantics and appropriate collision/navigation proxies.
- Do not migrate to Unity/Unreal merely to improve model quality; Babylon can load significantly richer assets.

## Quality and release workflow

- Primary commands: `npm ci`, `npm run build`, `npm run test:unit`; browser checks via `npm test`.
- Keep PR CI focused on the small, critical smoke set described in README; heavier Playwright regression runs can be opt-in.
- For gameplay changes, test the **specific invariant or regression** at risk; avoid bloating the default pipeline.
- Code/tests are the authority for what exists **today**. [GAME_BIBLE.md](GAME_BIBLE.md) is authority for **approved direction**. If they disagree, document the gap rather than pretending it is implemented.
- Update architecture and Game Bible in the same PR when behavior, invariants, or accepted direction changes.
