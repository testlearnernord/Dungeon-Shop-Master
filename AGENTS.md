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
- **CURRENT group-capable boss special ability (after this PR):**
  `groupCombat.ts` supports a configured `grapple-throw`
  monster against actual multi-hero parties. Contact, dodge
  and parry MUST use `combatMelee.ts`; physical hold,
  resistance and launch MUST use `combatGrapple.ts`.
  The old Troll duel imports the very same authored
  `GRAPPLE_TIMING`, but its existing cinematic and v1
  replay layout remain intact. Never create a second
  multi-hero fight resolver, apply throw damage before
  landing, teleport through walls, remove real stagger
  resistance or mark this as
  multi-hero campaign content before party progression
  and save ownership are integrated. Optional group boss
  v1 replay fields are strict-save-validated.
- **CURRENT recorded dungeon presentation (after this PR):**
  `dungeonReplayCast.ts` projects only actually saved combat actors.
  `dungeonReplayScene.ts` renders all recorded heroes/monsters/projectiles
  without recomputing fights. TAB focus reveals only actors in the currently
  visible combat frame, never enemies from a later scene. New hero
  equipment is preserved in committed encounter records; older footage
  without this optional snapshot remains visually neutral. Level 7 regenerated room sentries at eligible site cycles
  use a bounded heavy melee strike instead of the Troll's unique
  `grapple-throw`. The ability is available within the common engine
  for boss encounters, not automatically granted to ordinary elites.
  Older v1 recordings with grapple-equipped sentries remain immutable. Real co-located multi-hero party
  expeditions already work on Floors 1–4/7; do not mistake those
  for the still-unfinished unique Boss party or full V.003 progression.
- **CURRENT longer authentic shop-day expeditions (after this PR):**
  `LEVEL7_STEP_BUDGET` now allows 36 true grid walks and
  `LEVEL7_MAX_ENCOUNTERS` permits two actually reached monsters per day.
  Victory does not force an early end; casualties, low unsupplied HP,
  defeat and unavailable routes still end shorter days legitimately.
  `campaignSave.ts` bounds both encounters without changing v13, and
  `dungeonReplayPlayback.ts` replays the stored routes and encounter
  frames unchanged, not artificial filler or time dilation. The
  physical Board gains empty/filled weapon and armor sockets and numeric
  HP alongside existing group labels. The old fixed three-phase world
  snapshot requirement is superseded by the chronological shared-clock
  design in `docs/LIVING_WORLD_CLOCK.md` (not implemented). New ordinary monsters
  require full concept, approved GLB, animation, SFX and visual tests
  per `docs/MONSTER_ASSET_PIPELINE.md`. The first real Ghoul vertical
  slice now replaces generated ordinary enemy placeholder subtypes:
  `dungeonLayout.ts` places `ghoul`, and `dungeonGhoulVisual.ts`
  loads the owner's authored 14+1 Tripo clips from the deterministic
  `prebuild/predev` GLB assembly (original sources unchanged).
  `ghoulCryptArt.ts` decorates the existing actual world rooms:
  no extra arena, collision authority or combat. Render poses consume
  actual recorded GroupCombat frames and their phase changes, not new
  damage/HP. This is a FIRST VISUAL PASS pending artist-reviewed
  facing, foot contact, contact timing, size and original Ghoul SFX.
  Do not describe it as a fully approved polished monster.
- **CURRENT opportunistic party expedition (after this PR):**
  `dungeonParties.ts` joins only willing, living, not-yet-processed heroes
  standing on the *same physical tile and floor* at day start, max three.
  `simulateSpatialDungeonPartyDay` is also the SOLO motor, never a
  parallel expedition resolver. All party members traverse identical legal
  edges and resolve ONE world site and ONE real group encounter; HP,
  equipment, Herbs, XP, personal intentions and replay POVs stay per hero.
  Split a chest's finite gold between living allies and award its one loot
  unit to one actual claimant; never pay monster gold or advance regeneration
  once per hero. Traps damage all who walk on the tile using their own gear.
  Shared route voting uses each companion's actual explored neighbour proposals, majority, unknown-cell and stable grid tie-breaks, never a hidden map or the first array member's authority. After a committed group encounter, independent medium-term goals are preserved while `negotiatePartyFloorDecisions` may consensually stay, descend, or escort an ascent. Resupply is a hard veto, unprepared heroes cannot be forced deeper, and dissent still dissolves a party. The entire group's proposals are resolved before any member changes floors; no loot, HP, RNG, or existing replay is re-evaluated.
  `gameState.ts` caches each hero's outcome within that committed day and
  prevents a companion running a second encounter. Strict v13 replay
  validation accepts 1–3 hero actors with exactly one real site monster.
  New `GroupCombatReplay` actors may contain optional, strictly validated
  hero `equipment` snapshots taken at fight commitment. Viewers must
  show recorded weapons/armor and NEVER fetch today's mutable roster
  to dress a historical companion. Old v1 records lacking the field
  show neutral equipment. No save version bump.
  CURRENT: `GameState.dungeonParties` optionally persists established
  willing groups across confirmed days and consensual floor transitions.
  `choosePersistentDungeonParty` reserves living, co-located saved
  companions ahead of transient outsiders. `settlePersistentDungeonParties`
  retains membership only if living survivors still occupy one real tile
  and autonomously agree on the same floor action; otherwise it disbands.
  Never teleport party members to repair a split or override a dissenting
  hero's choice. The strict v13 validator rejects duplicate party members,
  inactive characters and mismatched saved locations; older saves omit
  the optional field. **Temporary Party** is the canonical player-facing
  name. Current groups use one numbered TP marker on the physical board
  (legend identifies it) and full member names in the R roster.
  New group footage saves immutable `partyMemberIds` plus optional
  `partyAppearances` with the actual role and equipped goods for EVERY
  traveler, including a monster-free walk. In the dungeon spectator
  `dungeonPartyFormation.ts` arranges these real historical co-travelers
  within the same recorded tile with small stable cosmetic offsets,
  animated shared walking and matching gold TP ground rings. During
  combat the TRUE captured fighter positions and phases take priority;
  after a recorded casualty the dead character must not resume walking.
  Both the 3D scene and TAB follow work during ordinary travel, not only
  during fights. No second path, encounter, RNG, collision or save-version
  migration. Earlier recordings lacking these optional appearance
  snapshots may show companions only when historically recorded combat
  metadata exists, never from today's changed roster.
  `temporaryPartyChanges` detects actual joins/leaves from previous
  relationships, shared committed expeditions and settled groups,
  once per member/action on a confirmed day; steady groups add no
  daily feed noise. The dungeon feed hides sealed battle results.
  Old replay tapes without `partyMemberIds` still load and show
  no invented companions. Party size is displayed on the existing physical
  Adventurer Board. `rosterPartyDetails` is the single read-only source
  for the R roster's real companion names, roles, current HP and
  formation day; no inferred friendships, duplicate party state,
  hidden ledger spoilers or Galvik controls. This is NOT permanent
  squad command, social diplomacy,
  a new Floor 6 boss party, or the fully redesigned V.003 world.
- **CURRENT live actor model (after this PR):**
  `combatActor.ts` owns the shared mutable `CombatActorRuntime`
  contract, phase transitions, action time and resource refresh.
  `GroupActor` implements it. `bossEncounterActors` returns
  live adapters for the hero and Cave Troll over the original
  `CombatPreviewState` fields. Never copy boss HP/phase/
  position into an independently mutated actor object.
  Boss special grab/throw states are legitimate ability
  variants in this contract and their v1 replay phase strings
  must remain unchanged. A fully universal multi-hero boss
  party/ability registry is NOT yet implemented.
- **CURRENT unified encounter driver (after this PR):**
  `combatEncounter.ts` is the **sole top-level 60-Hz
  combat tick owner and immutable frame capture scheduler**
  for `groupCombat.ts` and `arenaCombatMotion.ts`.
  Encounter plugins supply canonical actors, environment,
  projectiles, terminal outcome and saved cues; signature
  Troll grip/lift/throw/flight remain actor-specific
  effects, not separate fight loops. Never reintroduce
  an independent boss clock, standalone outcome resolver,
  replay capture loop or view-triggered RNG. Group and
  boss-specific actor state representations are still
  distinct; further changes must consolidate them
  without corrupting v1 replays.
- **CURRENT combat tactics/projectile authority (after this PR):**
  `combatTactics.ts` is the only decision layer for
  living enemy target selection, reach/line-of-sight attack
  opportunity, approach/withdrawal and stamina-aware defense,
  plus regular/heavy/Troll grab-slam-smash selection.
  `combatProjectile.ts` owns swept segment hitbox and
  optional wall collision for both bosses and groups.
  Keep opponent-only projectile targets and deterministic
  ties. Don't reintroduce per-viewer target RNG, point-only
  projectile collision, or a separate attack-selection
  table. The Boss's special grab/throw effects remain
  actor-specific callbacks within the shared encounter
  pipeline, pending unified actor state modeling.
- **CURRENT actor runtime shared across group and Troll combat (after
  this PR):** `combatMovement.ts` is the only combat position
  integrator and `combatActionClock.ts` is the only once-per-tick
  action timing/contact/cooldown/stamina helper. Dungeon fights pass
  wall/actor collision; boss fights pass circle bounds and apply
  their own genuine lava effect. Do not duplicate movement or
  contact-window timers in a third boss/monster renderer; preserve
  the Troll's fixed-tick grab/throw and existing replay frames.
  Individual target-AI and special-boss effect policies are still
  registered with the shared encounter driver; only their
  actor-specific state/ability policies await final unification.
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
  regenerated. The top-level scheduler is now unified,
  but the Boss grip/flight actor phases remain specialized.
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
  `simulateSpatialDungeonPartyDay` function in `level7Exploration.ts` owns
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
- **V.003 is a target, not current gameplay.** The playable in-game label is still V.002 ALPHA; npm package version `0.1.0` is independent. The approved shared-clock direction is defined in `docs/LIVING_WORLD_CLOCK.md`: one paced, deterministic, pausable world clock for both shop and dungeon while the shop is active; intentional bed-based overnight completion; ordered true vs last-known reports and replay event bookmarks. **Morning/Midday/Evening is NOT an authoritative three-phase engine/Board requirement.** PR #201 adds the saved world scheduler; merged PR #202 migrates
  customer request deadlines, exactly-once walkouts, and removes bedtime
  phantom sales. PR #203 switches physical customer movement, wait checks,
  collision claims and pickups to **committed 50ms world ticks** (20 ticks
  per game minute). Babylon `scene.render()` does not run the shop AI.
  PR #204 checkpoints exactly those physical actors, routes, local waits,
  exclusive shop service claims, shelf access ownership and gate positions
  at the shared tick. Strict version-17 saves restore the SAME existing NPC
  motor after room, roster and shopping intents are rebuilt; the old
  50ms tick/commerce authority remains unchanged. Save only the finished
  step, not a partial position before the tick's actual movement.
  PR #205 makes the existing Floors 1–4 and 7 party/exploration
  resolver resumable in real adjacent one-tile steps via
  `advanceSpatialDungeonPartyStep`, sharing the existing monster/chest/
  trap and group-combat ownership. DO NOT invoke this alongside bedtime
  dungeon rolls in production: the scheduler cutover must exclusively
  own live expedition events and retire/guard the old day batch.
  This extraction alone is NOT live dungeon behavior.
  The live dungeon cutover and integrated ten-day validation remain pending.
  An unpaid cart returns to its shelf at bed closure, never settling
  as imaginary cash. Version-17 saves intentionally reject v16 and
  earlier campaigns because the physical actor checkpoint is newly required. `gameState.advanceDay`
  remains bed-batched for dungeon outcomes until its later migration. Never claim the V.003 parallel simulation has shipped. No additional time engine, mandatory Floor 10 boss, shop portal, class/mana scheme or 100-floor system may be claimed implemented merely from design documents. **Newest owner decision: backward compatibility with old alpha/v13
  campaign saves is NOT required for the V.003 world-clock cutover.**
  A clean new save schema and fresh campaign may replace old data.
  New-version deterministic saves, no duplicated purchases/HP/loot,
  and clear incompatible-save reporting remain mandatory. The physical
  Board is to be genuinely LIVE and knowledge-safe during shop play.
  Simplify the redundant `The Living` and mandatory `Sealed Expeditions`
  nighttime pages only after the new Board/Archive replaces them.
  See `docs/LIVE_BOARD_LEDGER_AUDIT.md`.
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
| [Living World Clock](docs/LIVING_WORLD_CLOCK.md) | The agreed world-time, pause, sleep, event order and knowledge contract changes |
| [Live Board and Ledger Audit](docs/LIVE_BOARD_LEDGER_AUDIT.md) | Live Board observations, nighttime accounts, replay archive and approved old-save break change |

- Update impacted sections **with the feature PR**, not in an indefinite later cleanup.
- **Replace/remove old descriptions** immediately when no longer true. Never keep competing “old/new” active instructions or append dated versions of the same section.
- Do **not** mechanically edit unrelated files to manufacture a documentation diff. If a document genuinely needs no change, leave it intact.
- In the PR description, include a short **Docs review** note stating which relevant files were updated and which were reviewed without change. The reviewer can then see that nothing was overlooked.
- Do not turn the Game Bible into a changelog: Git history is the archive; the docs are the current working reference.

## Communication and story decisions

Call a change **CURRENT/implemented** only after verification on the relevant branch; call an idea **OPEN/proposed** until the owner approves it. If a fundamental story choice remains undecided, keep implementation independent of that choice and document the uncertainty. Do not invent final lore simply to make a coding task easier.
