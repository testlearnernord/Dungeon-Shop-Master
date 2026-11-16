# Dungeon Shop Master — Contributor Guide

> **Living instructions for human and AI contributors.** These rules describe how to work against the **current** project. Keep this file, `docs/GAME_BIBLE.md` and `docs/ARCHITECTURE.md` synchronized with each relevant change. Obsolete instructions must be replaced or deleted, not accumulated.

## Before editing

1. Check the latest `main`, **open pull requests and their CI** before touching code. A proposed PR number in a chat is not necessarily available, merged or current.
2. Read [Game Bible](docs/GAME_BIBLE.md) for implemented/LOCKED/OPEN/REJECTED distinctions and deliberately removed systems.
3. Read [Architecture](docs/ARCHITECTURE.md) for state ownership and preview/commit boundaries; read [UI Design System](docs/UI_DESIGN_SYSTEM.md) for any visual/interaction work.
4. Read [README](README.md) for current controls, environment and the [working roadmap](docs/ROADMAP.md) for proposed next work. Roadmap targets do not authorize undisclosed feature rewrites or count as implemented.
5. Inspect actual affected modules, callers and tests on the **current base branch**. Do not implement from remembered code or an old chat summary.
6. Distinguish explicit owner decisions from mockups, brainstorming, previous assistant plans and unfinished experiments.

## Sources of truth

- **Implemented behavior:** current source, assets, tests and verified runtime.
- **Approved direction:** current owner-approved decisions marked **LOCKED** in the Game Bible.
- **Unresolved direction:** **OPEN** means not decided. Do not silently introduce canon or a speculative mechanic.
- **Newest explicit owner instruction wins** if it conflicts with an older document. Update the affected documentation **in the same PR** rather than following stale guidance.
- Documentation never proves a feature is implemented. A screenshot, concept mockup or AI proposal is not approval on its own.

## Current hard boundaries

- Shopkeepers influence autonomous hero purchasing through shop operations; do not convert their choices into direct orders.
- **No hunger/starvation system.** Waybread and Healing Herbs heal HP. Dungeon casualties require actual damage through zero HP, never a separate arbitrary instant-kill roll. Offscreen deaths are not automatically replay-verified memorials.
- Replays visualize **committed** results. Do not re-resolve fights or leak unwatched outcomes through the day ledger. The Level 6 visual intro may hold the initial recorded frame and read the existing soundtrack's playhead, but must never change combat motor ticks, damage, RNG or saved replay frames; cinematics must be skippable and restartable. Art proposals are not approved final GLB meshes.
- All furniture shares `src/game/furnitureRegistry.ts` for geometry, mount surfaces, labels/focus data and service metadata, plus `src/game/furniturePlacement.ts` for one authoritative preview/commit. Do not add a second shelf editor, shop-floor geometry table, counter rendering facade or type-specific GameStore placement API. New games have zero shelves and zero stocked slots; N builds a compact shelf with four initially empty slots. Player inventory starts with modest merchandise, and building never generates free gold or stock. All new `shelf-N` instances get stable IDs and use the exact same meshes, slot geometry, shopper reachability, exclusive reservations, day simulation and strict save validator. `SIMULATION_VERSION` is 13; the persisted v13 room, bedroom, roster board and counter transform are required, and version-12/partial states are deliberately not migrated. Other fixture families keep mounting policy differences, not alternate transaction paths. Level 5 excavation must refuse removing stone supporting mounted furniture.
- Furniture previews are non-mutating; committed placement must preserve customer route/service access and movable interaction targets. The visible highlight must reflect the actual model, not the wider required pedestrian clearance. Temporary checkout, shelf, stockout/credit and idle destinations are exclusively reserved via `ShopServiceSpots`; candidate generators must not grow their own reservation APIs or fixed starter-cave waiting tables and invalidated on geometry updates; switching roles releases the former shelf claim. Reuse `createShopRoutePlanner` only within one immutable layout/room batch, never across edits or for moving NPC occupancy. The register is operated only from its staff docking side; customer queues use a separate facing socket. For U mining, retain original stonework until excavated, and validate P placement on a genuinely dug, sufficiently large floor in a real browser regression.
- Source currently uses TypeScript/Vite/Babylon.js and strict save/version validation. Do not introduce an engine rewrite or save migration without a reason and current owner decision.
- **Shop service is grounded in real transactions.** `shopServiceFocus.ts`, `shopHudLayout.ts` and crosshair hints are read-only presentations. F selects the most urgent *live* restock item in the existing hotbar; it never buys, reserves or stocks goods automatically. Cashier collection uses the real `payReservedCart` path after physical front-of-line/staff-side validation. The alternative quote-based `GameStore.checkout` API remains in the code; do not confuse it with the player's current register or delete it without investigating callers/tests.
- **Story causality remains OPEN.** The young hero, mercenary leader, transfer of the curse, Floor 100 and Galvik's eventual role are not final canon. The earlier **amulet mechanic is removed from the current design direction**, not an OPEN prerequisite; do not reintroduce it by accident. Short cynical Galvik-as-commentator sketches are likewise not a locked protagonist transition.

## How to implement changes

1. Inspect existing rules and reuse systems instead of creating parallel state, UI or furniture editors.
2. Work in a cohesive PR; do not produce a string of tiny PRs for one unfinished feature. If scope is clear, implement and validate without repeated approval pauses.
3. Preserve deterministic simulation, economy invariants, replay correctness, save safety and NPC navigation.
4. Profile high-frequency work before optimization, particularly blueprint/pathfinding loops. Do not put expensive validation in render-frame hover paths.
5. Test the actual risk with small unit coverage and targeted browser regression; respect the repo's deliberately lean CI.
6. Inspect CI and review feedback, fix concrete failures and merge only after the required checks pass when merging is requested/authorized.
7. State exactly what was inspected, changed, tested, merged and deployed; do not report an intended action as completed.

## Mandatory core-document review for every PR

Before marking a PR ready, **review the three core documents** against its changes, plus the UI contract and roadmap when the change affects them:

| File | Update when… |
| --- | --- |
| [Game Bible](docs/GAME_BIBLE.md) | The game gains/loses functionality, accepted design changes, a hypothesis is approved/rejected, or a story decision genuinely becomes canon |
| [Architecture](docs/ARCHITECTURE.md) | Modules, state ownership, saving, data flow, replay semantics, interfaces, technical constraints or CI workflow change |
| [AGENTS](AGENTS.md) | Contributor procedure, coding/testing expectations, source-of-truth rules or project invariants change |
| [UI Design System](docs/UI_DESIGN_SYSTEM.md) | HUD, dialogs, world hints, interaction patterns, accessible inputs, colors, layout or shared icons change |
| [Roadmap](docs/ROADMAP.md) | Milestones are delivered, reprioritized, canceled or gain approved scope |

- Update impacted sections **with the feature PR**, not in an indefinite later cleanup.
- **Replace/remove old descriptions** immediately when no longer true. Never keep competing “old/new” active instructions or append dated versions of the same section.
- Do **not** mechanically edit unrelated files to manufacture a documentation diff. If a document genuinely needs no change, leave it intact.
- In the PR description, include a short **Docs review** note stating which relevant files were updated and which were reviewed without change. The reviewer can then see that nothing was overlooked.
- Do not turn the Game Bible into a changelog: Git history is the archive; the docs are the current working reference.

## Communication and story decisions

Call a change **CURRENT/implemented** only after verification on the relevant branch; call an idea **OPEN/proposed** until the owner approves it. If a fundamental story choice remains undecided, keep implementation independent of that choice and document the uncertainty. Do not invent final lore simply to make a coding task easier.
