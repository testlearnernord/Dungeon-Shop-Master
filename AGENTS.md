# Dungeon Shop Master — Contributor Guide

> **Living instructions for human and AI contributors.** These rules describe how to work against the **current** project. Keep this file, `docs/GAME_BIBLE.md` and `docs/ARCHITECTURE.md` synchronized with each relevant change. Obsolete instructions must be replaced or deleted, not accumulated.

## Before editing

1. Check the latest `main`, **open pull requests and their CI** before touching code. A proposed PR number in a chat is not necessarily available, merged or current.
2. Read [Game Bible](docs/GAME_BIBLE.md) for implemented/LOCKED/OPEN/REJECTED distinctions and deliberately removed systems.
3. Read [Architecture](docs/ARCHITECTURE.md) for state ownership and preview/commit boundaries; read [UI Design System](docs/UI_DESIGN_SYSTEM.md) for any visual/interaction work.
4. Read [README](README.md) for current controls, environment and the [working roadmap](docs/ROADMAP.md) for proposed next work. For the approved **V.003 ALPHA — The Living Dungeon** redesign, also read [the complete design target](docs/THE_LIVING_DUNGEON.md) before touching expedition, combat, hero resources or the Adventurer Board. Roadmap targets do not authorize undisclosed feature rewrites or count as implemented.
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
- Replays visualize **committed** results. Do not re-resolve fights or leak unwatched outcomes through the day ledger. The Level 6 visual intro may hold the initial recorded frame and read the existing soundtrack's playhead, but must never change combat motor ticks, damage, RNG or saved replay frames; cinematics must be skippable and restartable. The current 17-part GLB anatomical sculpt is a genuine checked-in asset, generated reproducibly by `tools/asset_generation/build_cave_troll.mjs`; the existing Babylon transform rig still owns its animation. It is not a final skinned animation asset or automatically approved concept-art match. Do not add a second combat controller or alter saved replay data to accommodate art.
- All furniture shares `src/game/furnitureRegistry.ts` for geometry, mount surfaces, labels/focus data and service metadata, plus `src/game/furniturePlacement.ts` for one authoritative preview/commit. Do not add a second shelf editor, shop-floor geometry table, counter rendering facade or type-specific GameStore placement API. New games have zero shelves and zero stocked slots; N builds a compact shelf with four initially empty slots. Player inventory starts with modest merchandise, and building never generates free gold or stock. All new `shelf-N` instances get stable IDs and use the exact same meshes, slot geometry, shopper reachability, exclusive reservations, day simulation and strict save validator. `SIMULATION_VERSION` is 13; the persisted v13 room, bedroom, roster board and counter transform are required, and version-12/partial states are deliberately not migrated. Other fixture families keep mounting policy differences, not alternate transaction paths. Level 5 excavation must refuse removing stone supporting mounted furniture.
- Furniture previews are non-mutating; committed placement must preserve customer route/service access and movable interaction targets. The visible highlight must reflect the actual model, not the wider required pedestrian clearance. Temporary checkout, shelf, stockout/credit and idle destinations are exclusively reserved via `ShopServiceSpots`; candidate generators must not grow their own reservation APIs or fixed starter-cave waiting tables and invalidated on geometry updates; switching roles releases the former shelf claim. Reuse `createShopRoutePlanner` only within one immutable layout/room batch, never across edits or for moving NPC occupancy. The register is operated only from its staff docking side; customer queues use a separate facing socket. For U mining, retain original stonework until excavated, and validate P placement on a genuinely dug, sufficiently large floor in a real browser regression.
- Source currently uses TypeScript/Vite/Babylon.js and strict save/version validation. Do not introduce an engine rewrite or save migration without a reason and current owner decision.
- **Shop service is grounded in real transactions.** `shopServiceFocus.ts`, `shopHudLayout.ts` and crosshair hints are read-only presentations. F selects the most urgent *live* restock item in the existing hotbar; it never buys, reserves or stocks goods automatically. Cashier collection uses the real `payReservedCart` path after physical front-of-line/staff-side validation. The alternative quote-based `GameStore.checkout` API remains in the code; do not confuse it with the player's current register or delete it without investigating callers/tests.
- **V.003 planned shop transition is NOT a Floor-5 route.**
  The agreed design moves Galvik's sole persistent shop onto a cursed
  special floor outside dungeon numbering. Replace the current Floor 4
  and Floor 6 physical entrances with ONE portal for both directions.
  At any dungeon depth, a hero deciding to ascend can instead abort
  to that shop. After physically leaving the shop, mark **two full game
  days off duty** in neither shop nor dungeon; later reentry anchor is
  still a balance decision. Short-term stay/up/down and medium-term
  farming/progress/gear-test/caution intentions must remain distinguishable.
  Floor 10 is blocked until an individual hero receives Galvik's pass
  (a temporary new design gate, not today's `level6Permit`). Do not
  reinstate the rejected long backtrack, mandatory five-floor shops,
  two-door topology or an invented escape rope as accepted scope.
- **CURRENT shared melee attack contract (after this PR):**
  `combatMelee.ts` is the sole authority for hit arcs, reach,
  line-of-sight rejection, roll windows and facing-based parry,
  with ordinary/heavy/Troll smash/slam/grab/hero-strike ability profiles.
  Any ordinary/boss ability must call its pure contact resolver,
  not fork its own arc/dodge/parry decision table. Heavy monster
  attacks are real timed GroupCombat actions; optional recorded
  `meleeAbility` is strict-save validated. Troll grab/throw
  remains an animation-compatible boss-specific action after
  shared contact, and its original v1 recordings must never be
  regenerated. The boss **motion scheduler** is still separate.
- **CURRENT shared combat vitality (after this PR):**
  `src/game/combatVitality.ts` owns HP hit/mitigation/healing
  arithmetic and item heal constants for the ordinary and Troll
  motor. Preserve real owned Healing Herb use (+18 HP) across **all
  hero roles** in group combat; `level7Exploration.ts` must debit
  exactly the recorded charges and never invent free healer items.
  Healer magic is a distinct ability from purchased Herbs.
  The boss's complex grab/throw and animation-compatible 60 Hz
  phase system still needs to be integrated with the group-capable
  resolver: **shared HP math alone is NOT a merged combat motor**.
- **CURRENT spatial engine for Floors 1–4 and 7:** one
  `simulateSpatialDungeonDay` function in `level7Exploration.ts` owns
  path walking, real `groupCombat`, loot/traps, recorded footage and
  `dungeonRegeneration.ts` site refresh. `dungeonDecisions.ts`
  supplies autonomous medium-term goals and short-term floor choices.
  `gameState.earlyDungeonWorlds` is an optional v13-compatible set
  of shared floor worlds; `level7World` remains compatible. The old
  `dungeonSimulation.ts` has been deleted. New ordinary-floor combat
  MUST reuse this motor, not reintroduce dice/outcome islands.
  The Floor 6 boss and special-floor shop remain separate unfinished work.
- **V.003 recurring dungeon content:** floor geometry, unique
  discoveries, story locks, past replays and unique boss victories remain
  persistent. Ordinary monster groups, common treasure sites and
  resettable traps must renew via one deterministic saved **per-site
  regeneration cycle** on committed phase/day transitions. Never reroll
  by opening a viewer, respawn inside an occupied encounter, award a
  previously looted chest twice, override the Floor 10 pass or create
  a second farming/loot RNG authority. Cooldowns are tuning values,
  not approved constants.
- **V.003 is a target, not current gameplay.** The playable in-game label is still V.002 ALPHA; npm package version `0.1.0` is independent. The Living Dungeon is the approved direction (shared seeded expedition world, actual shop-item causality and a three-phase, HP/equipment-visible Adventurer Board). No new time engine, mandatory Floor 10 boss, shop portal, class/mana scheme or 100-floor system may be claimed implemented merely from the design document. Protect old Floor 6/7 recordings and existing version-13 saves during staged migrations.
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
