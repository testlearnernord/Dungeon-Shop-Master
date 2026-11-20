# Dungeon Shop Master — Contributor Guide


### PR #226 · Read-only subjective sight and individual memory

The neutral LIVE floor overview is intentionally omniscient **for Galvik only**.
On selecting a hero, `heroPerception.ts` derives current 5-tile
wall-blocked line of sight from that hero's own saved position, and historical
visible/explored geometry solely from that hero's immutable visited path.
Unseen tiles are hidden; old discovered areas are dim; only currently
visible other heroes/monsters/fight beacons are presented. Deselecting
restores the neutral full-floor map with zero gameplay writes.
The UI lists true currently observed contacts and party-shared current
contacts. **This is an opt-in visual perception query, not a new saved
AI memory subsystem or a promise that other hero planners react yet.**
Never inject the all-floor observer view into hero decisions or the ordinary
Board. Raycasts are pure deterministic static-grid operations; no combat,
shop, world clock, RNG or save state changes. #227 begins cinematic combat
presentation unification and should not reimplement fog/LOS.


### PR #225 · Pure opt-in hero selection

Only floor-visible, saved actor models have `floorHeroId` pick markers.
Combat beacons always take precedence, then heroes, then empty-map
deselection. Detail fields are persisted `AdventurerState` and optional
`LiveDungeonPlan` projections plus committed fighting/return state.
Missing plans must remain explicitly UNKNOWN; do not invoke
`chooseHeroDungeonDecision` on the spectator side. Selection is strictly
visual and must not alter WorldClock, RNG, HP, loot, shop traffic, Board
disclosure or events. Selecting a hero does not yet grant hero-sight fog
until #226 implements that independently.


### PR #224 · Whole-floor LIVE view

The LIVE dungeon launches as a floor overview (supported spatial floors
1, 2, 3, 4, 7 only), not an archived hero tape. `liveFloorSpectator.ts`
uses each hero's own committed floor/world checkpoint, saved party membership,
and genuine live battle frames. Do not give all heroes one focus hero's x/z
or `visited` map. Do not expose the full player-visible floor to hero AI
or the passive shop Board. The 3D map shows abstract active fight beacons;
only an explicit click/Watch enters the existing `LiveGroupCombatArena`.
Historical expeditions are accessed in the separate Replay Archive and
retain their own saved-local-clock scrubbing.

Click-to-inspect and hero-specific fog are still OPEN (#225–226).
No monster rendering or full battle animations inside the normal floor view.


### PR #223 · Read-only LIVE party animation and floor-view boundary

The LIVE map does not simulate movement or combat. `livePartyPresentation.ts`
may interpolate the mesh gait for **one real adjacent saved tile step** only.
`DungeonReplayScene.advanceLivePresentation` is called every render frame
while that existing transition is visible, with the same walk pose for
leader and companions. This is not a new world timer, route, fight motor,
save format or hero knowledge source. Changes in floor, party membership,
combat or a skipped/missing step snap to the true checkpoint. Keep the
neutral map abstract during fights.

#224–226 must introduce a saved-world per-floor read-only projection for
all live actors, clickable hero details and per-hero fog without passing
spectator omniscience to actor AI or the passive Board. Replay archive
must become separate from the LIVE floor selector. Follow
[docs/FLOOR_SPECTATOR_CONTRACT.md](docs/FLOOR_SPECTATOR_CONTRACT.md).
Do not remove the old single-hero selector or a combat engine until
the replacement ships with tests.

### LOCKED owner rule: LEVEL 6 Cave Troll sets the combat standard (20 Nov 2026)

- The original Level-6 Cave Troll's authored combat, animation, camera, lighting, SFX, environment and HP/damage presentation are the **reference for every encounter**. The stripped-down Ghoul/Group prototype is NOT the basis for the universal engine. Monsters, arena art and unique abilities vary; group combat is an **additional capacity**, not a replacement.
- PR #220 extracts `combatSpectatorStage.ts` and `combatHudProjection.ts` directly from Level-6, and extends those controls and world-HUD components to an opt-in crypt scene and multiple saved actors. The original Level-6 scene continues to use the same implementation. No combat authority or replay schema changes in this PR.
- **Two authoritative motor paths still exist:** `arenaCombatMotion.ts` / `resolveSpatialBoss` / `simulateLevel6Combat` for the atomic Level-6 solo campaign; `groupCombat.ts` / `commitLiveCombatTick` for scheduled real-world ordinary encounters. Both use common primitives and `combatEncounter.ts`, but actor actions, time ownership, and recordings differ. Never falsely claim unified combat from shared visualization alone.
- Subsequent motor migration must preserve the exact Troll grapple/throw, dodges/parries, attack windows, lava, combat timing, original SFX and visuals while making groups optional, running on ONE shared clock. Must pass solo/party parity, deterministic saves and spectator invariants BEFORE removing obsolete code.


### Owner correction after PR #218 · Abstract fights in all maps / native first

- The most recent owner decision supersedes #218's distinction between LIVE map and archive map: **both are abstract**. Neither `DungeonReplayScene.showLive` nor `setReplay`/`show` may create enemy/hero battle models, Ghoul GLBs or projectile meshes on an ordinary dungeon map. Render a clickable encounter beacon, HP/status and genuine traversals.
- `LiveGroupCombatArena` is the ONE read-only battle scene for both genuinely running and archived 60Hz recorded fights, constructed only by clicking the marker or accessible Watch button. It never simulates combat again. LIVE world time continues; recorded playback uses only local replay time.
- Roster `Watch LIVE` must only close the dialog after opening a real saved hero observation; if the selected non-shop signature lacks a committed dungeon checkpoint, re-open the Board and display an accessible inline explanation. Do not reveal remote availability or coordinates **before** the opt-in. The top-right launcher is called **Dungeon (G)**, not Level 7, because both time modes use the same `DungeonViewer`.
- Native 100% Babylon resolution is the **initial/default** mode. Auto quality is still available by explicit F4 selection, never as implicit degradation. Order: Native → Balanced → Performance → Auto.


### PR #218 · Strict separation between simulation, abstract LIVE dungeon map and opt-in arena

- The saved **single** `GroupCombatState` / `commitLiveCombatTick`
  continues at genuine 60Hz in world-time 0.5-second batches. No new
  combat simulation, local arena AI, opponent damage rolls, time controller,
  RNG draws, alternate combat outcomes or replay synthesis are permitted.
- `DungeonReplayScene.showLive` now draws a **single abstract marker** at
  the committed combat site during an encounter and keeps existing fog/
  map/hero knowledge. Never load `createDungeonGhoulVisual`, allocate
  per-combat fighter/projectile meshes or animate combat phases from this
  LIVE map code. **Historical recordings now follow the same abstract-map rule.**
- `LiveGroupCombatArena` is a distinct, opt-in Babylon scene instantiated
  only via `DungeonViewer.watchLiveCombat()`. Its input is
  `selectLiveSpectatorFrame` from committed `GameStore` snapshots.
  Render exact saved actor HP/positions/phases. When closed or the fight
  ends, dispose scene/models/materials. No changes to player agency,
  seed, shop state, death events or replay records.
- `DungeonViewer.currentScene` yields **one** active render scene,
  either dungeon map or explicit fight arena; never draw both concurrently.
  `DungeonViewer.isWatchingLive` stays true in both presentations so
  the shop, dungeon, fighters and world clock continue.
- Strict browser Save/Reload comparisons use the **E2E-only**
  `?e2e-pause-world=1` boot switch. It calls the existing one
  WorldClockPacer.setPaused("e2e",true) BEFORE Babylon frames start;
  tests still use the authentic GameStore.endDay() and authoritative
  scheduled event executor. This avoids false failed assertions when
  SwiftShader renders several frames after reload but before Playwright
  can issue a pause. Normal production ignores the URL switch.
- Real browser smoke `tests/liveCombatArena.spec.ts` constructs a
  genuine saved live dungeon fight from the already-tested seeded
  neighboring-monster fixture. It checks map has no LIVE monster actors/
  projectiles/ghouls, the opt-in arena creates a separate scene,
  spectator actions don't mutate saved combat, the actual world time
  progresses, and returning to map works. Existing recorded footage
  semantics must remain unchanged.
- This removes **viewer GPU/animation cost**, not the CPU cost of
  simultaneous background combat. Never claim a general shop FPS gain
  without hardware-side measured evidence.


### PR #217 · Live-world CPU spikes are a distinct performance risk

- The reported user hardware slowdown began with #200; our CI-only SwiftShader resolution ablation **cannot** rule out concurrent simulation CPU stutters on a hardware-accelerated Chrome PC. Do not conflagrate slow virtual-rasterizer FPS with actual owner hardware.
- `tests/liveWorldSpikeProfile.spec.ts` measures real day-one and seeded day-eleven campaign 600-tick (30 seconds of world time) dungeon event bursts, plus same-scene paused/live FPS. Baseline #44744094263: 7.5–15.8ms per day-one burst, 7.7–11.2ms day eleven, with 10 alive heroes and **no active group fights**. Ordinary world tick under 0.1ms in this CI window. These bursts are atomic test fast-forwards and **do not** include physical NPC movement interleaving during each tick; do not misreport them as normal in-frame shop CPU.
- F3 tracks p95/max world work in rolling 120 render frames, plus peak world CPU/autosave and over-16ms world frames **for the entire current F3 session**. The isolated `__shopTestTimedWorldAdvance` hook is only under `VITE_E2E=1`, invokes existing `GameStore.advanceWorldTime` and never changes production gameplay.
- Next priority when user hardware shows spikes: measure simultaneous **multiple live combats**, real loaded inventory and persistent day20+, profile `commitDungeonTick` and `commitLiveCombatTick`, then slice large deterministic work at saved event boundaries or reduce allocations **without** fabricating a new clock, losing replay fidelity or weakening Save/Reload.


### PR #216 · Render performance facts and invariants

- **Real ablation** in `tests/renderAblation.spec.ts`: CI Chromium's GL renderer is ANGLE SwiftShader, baseline native 800×600 20 FPS, skip Babylon 60, halve render width/height 60, disable five point lights 30, hide partial furniture still 20, hide almost all world meshes 60. Six total lights, 301 total scene meshes/50 active in this view, ~4,464 active triangles. The bottleneck **in CI** is GPU-like WebGL pixel/shader/lighting cost under software rendering; do NOT confuse with actual owner's GPU or host performance.
- **DO NOT** remove the physically saved 20Hz shop motor or down-sample the deterministic 60Hz combat. Only Babylon render buffer density is adaptive. Never change CSS canvas display size/HUD clarity, simulation authority, exact Save/Reload coordinates or rerender history to optimize FPS.
- `AdaptiveResolutionPolicy` is pure and independently unit-tested. Default Native fixes scale 1; opt-in Auto starts at native scale 1 and requires two sustained slow ~1.8s windows after initial warmup and low synchronous JS CPU cost before stepping 1 → 1.25 → 1.5 → 1.75 → 2. CPU-heavy frames are intentionally not treated as a resolution problem. Recovery is conservative. F4 Native/Balanced/Performance modes override opt-in Auto; F3 shows actual buffer and ANGLE renderer. In VITE_E2E benchmark the controller does not self-scale, to keep A/B scene comparisons meaningful; the explicit F4 test validates actual buffer resizing.
- For future optimized assets use profiler first: preserve light mood, physics/picking, merchant station names and rendering fidelity. Measured CI 20→60 FPS at 400×300 is **not** proof of 60 FPS on a player's 1080p/4K browser. Do not report it as hardware acceptance.
- See `docs/PERFORMANCE_INVESTIGATION.md` for reproducible test methods and next priorities.

### PR #215 performance diagnosis contract

- The 2026-11-20 virtual-browser attribution shows 50ms median frame gaps BOTH with the 50ms world clock paused and active. CPU measurement for 63 active ticks: scheduler ~0.5ms total, NPC motion ~7.1ms, snapshot ~0.6ms, equality JSON ~1.1ms, strict traffic validation + notifications ~1.2ms. Do NOT claim that CI's 20 FPS is caused by the clock, or that removing equality alone fixes physical-user FPS.
- Source root of unnecessary work after PRs #203/#204: two full serialized traffic comparisons per committed 50ms tick, now removed ONLY from the known-tick authority. Cold material commits retain equality guard; strict traffic/save and frame-by-frame movement remain intact.
- #203 visibly quantized NPC mesh motion at 20Hz. `NpcVisualSystem.rememberCommittedMotion` now keeps only the last already-committed 50ms poses and `renderInterpolated` temporarily displays fractional pose/shortest-angle facing, then restores physical roots in `finally`. NEVER write the interpolated position into saved traffic, pathfinding, raycasts, the world clock or player actions. Paused worlds render the exact final pose; reload clears visual trails. Test both pure math and real browser snapshot restoration.
- Autosave remains event-immediate + 1 real second for ordinary motion, but repeated validation of **the same already-confirmed latest snapshot** is cached by adapter; foreign, corrupt, rejected or externally modified data are never blindly treated as valid.
- A hidden F3 panel shows real device FPS, frame gaps, JS world/render duration and synchronous autosave cost; it is a diagnostic, NOT a second clock or GPU timer. See `docs/PERFORMANCE_INVESTIGATION.md`.

### PR #213 physical shop rotation (merged)

- Physical shopper crossing is authoritative: `NpcVisualSystem` removes the outer-gate actor, `shopTraffic` persists its cleared checkpoint, and only then `GameStore.completePhysicalShopExit` books one ticked `shop-departure` event.
- `at-shop` -> `departing` starts an actual pedestrian walk; manual checkout, unsatisfied walkout and sleeping alone **do not** start cooldown. After observed exit on day D, the hero is absent from both shop and dungeon for complete days D+1 and D+2; earliest reentry is D+3.
- Reentry uses the seeded safe known entrance, retains discovered routes, HP, equipment, supplies and true committed site generations; no free healing, RNG or second simulation. The old individually granted Level-6/7 boss permit is temporarily honored **only after** the required off-duty days.
- The night book now has only **The Reckoning** and **Goods & Receipts**; LIVE Board and the bounded Expedition Timeline replace duplicate nightly hero/replay pages. Old four-page session indices are safely reset.
- Strict `SIMULATION_VERSION = 24` snapshots validate new statuses, `offDutyUntilDay` and real clock-stamped departures. Earlier Alpha snapshots do not migrate.
- **NOT SHIPPED V.003:** cursed special-floor single physical portal, Floor-10 permit, deeper progression, unified boss fight architecture and integrated performance acceptance are still open.

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
  `dungeonReplayScene.ts` renders only walking heroes and one battle beacon; the
  optional 3D arena renders recorded combatants/projectiles without recomputing
  fights. TAB focus never discloses a later encounter. New hero
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
  PR #206 makes the actual browser campaign opt into EXCLUSIVE live
  expedition scheduling: one persisted `dungeon-world` event every
  600 world ticks, using exactly one connected spatial step per actual
  party on Floors 1–4/7 and reusing the original Level 6 boss resolver.
  `advanceDay` takes a separate shop-only closing branch for live campaigns
  and MUST NOT reroll any already resolved dungeon event at bed. Pure old
  unit fixtures that never opt in retain the historical day batch for
  compatibility tests; never run both modes in one campaign.
  Version-18 saves validate the unique pending movement event, owner,
  due tick and committed heroes. PR #207 adds strict version-19 combat
  checkpoints. An ordinary Floors 1–4/7 monster arrival reserves
  the real site but NEVER settles it at the movement tick. The one
  `dungeon-combat` event advances all real existing `GroupCombatState`
  actors by 30 authentic 60Hz steps every 10 saved world ticks.
  Persist fighter HP/phase/projectiles, the original gear/approach
  and frame captures. Only terminal combat settles Herbs, hero XP,
  finite gold and a site generation once. Do NOT resimulate battle
  on replay, reopen, sleep or reload; nor create another combat motor.
  The special Level-6 Troll remains atomic until a separate explicit
  integration. PR #208 adds strict version-20 saved return journeys:
  `liveDungeon.returns` tracks genuine hero intent and portal crossing.
  Use the original spatial motor's `chooseKnownReturnStep` to traverse
  one actually visited connected tile per 600-world-tick movement event,
  including its original trap/monster effects. NEVER move someone to the
  shop at their decision or simply when the bed is used. Only a saved
  real visit to the seeded floor entrance schedules the unique
  `report`-lane `shop-return:<heroId>` portal event exactly 20 ticks
  later; ONLY that event changes the hero to `at-shop` and spawns
  the real existing saved physical NPC entrance path. Strictly reject
  repeated portal event identities, invented returners and unmatched
  report timers. Distinct real same-day reentries have distinct tick IDs
  and NEVER generate a sale without real checkout. The unique Floor-6 Troll survivor uses the same portal, but
  its fight remains atomic until explicitly integrated. PR #209
  introduces strict v21 `liveDungeon.plans` with individual
  per-floor goals, actions and their actual decision ticks. Reuse
  `chooseLiveHeroDungeonDecision` (the existing early-floor policy)
  and `negotiatePartyFloorDecisions`, never a second hero/party AI.
  Physical early-floor ascents occur at each floor's seeded entrance;
  descents require the discovered `dungeonDownStair` reachable room
  and `chooseKnownRouteStep` via ACTUAL walked/known grid edges.
  Commit a depth change only from the correct saved stair position
  during a real movement event. The special Floor-5 shop is NEVER
  a compulsory dungeon level. After each live move/combat/bed boundary
  use the original voluntary `settlePersistentDungeonParties` and
  `temporaryPartyChanges` to keep consenting co-located groups,
  dissolve dissent and casualties, and emit unique world-tick TP
  join/leave events. Preserve each character's independent HP,
  gear, consumables, gold, visited locations and intention.
  Full lower-floor progression, two-day off-duty rotation,
  unique deeper progression remains pending. PR #211 adds the opt-in LIVE spectator: use
  `liveSpectator.ts` to inspect only saved current dungeon progress and
  committed group fight frames. `dungeonReplayScene.ts` renders these
  using the SAME renderer and fog as old footage, with no battle tick,
  RNG, future monster reveal or replay outcome. The ordinary Board must
  not consume this projection: watching is an explicit per-hero action.
  The shared clock AND shop traffic continue while watching LIVE, but
  historical replay and dialogs still pause it. PR #210 introduced strict
  v22 magical observation events and one `liveBoardProjection.ts`
  knowledge source. The actual spatial/trap, unique boss and 60Hz
  group motors emit `hero-death-signal` ONLY on a real first
  zero-HP crossing. That signal identifies the dead hero and precise
  committed tick, NOT the killer, exact tile, loot or battle outcome.
  `dungeon-live.reportedZone` offers coarse upper/deep life
  signatures ONLY, with no remote HP/gear/gold. The wall board,
  R roster and mini feed must ALL consume the SAME observed projection,
  never raw `GameState.adventurers` for hidden remote stats/death,
  nor raw `dungeonParties` for unreported companions.
  Physically visible shop visitors may show current actual health,
  gear, gold and permits; sealed replays do not retroactively reveal
  information. The skull warning is an accessible UI projection,
  not another combat clock, and dismissing it cannot alter truth.
  Do not promote V.003 to playable/released on this partial cutover.
  Full V.003 release acceptance remains pending. PR #214 adds the seeded
  ten-day live-world and browser campaign continuity tests, but neither
  CI virtualization nor deterministic assertions replace owner FPS,
  playability and actual hardware visual checks.
  An unpaid cart returns to its shelf at bed closure, never settling
  as imaginary cash. Real browser campaigns exclusively run the saved
  live expedition/combat and shop motors, never the older bedtime
  dungeon batch (retained only for isolated pure legacy regression
  fixtures). The current v24 format intentionally rejects older
  alpha snapshots. Do not claim V.003 as a released milestone or
  invent an additional time engine, mandatory Floor-10 boss, class/mana
  scheme or 100-floor simulation from design-only documents. **Newest owner decision: backward compatibility with old alpha/v13
  campaign saves is NOT required for the V.003 world-clock cutover.**
  A clean new save schema and fresh campaign may replace old data.
  New-version deterministic saves, no duplicated purchases/HP/loot,
  and clear incompatible-save reporting remain mandatory. The physical
  Board is to be genuinely LIVE and knowledge-safe during shop play.
  Simplify the redundant `The Living` and mandatory `Sealed Expeditions`
  nighttime pages only after the new Board/Archive replaces them.
  **PR #212 bounded footage (current branch):** Expedition Timeline lists
  only committed highlights from today and the preceding TWO complete
  in-game days. Only explicit saves in `GameState.savedReplayIds`
  preserve up to 12 selected recordings beyond the window. The one
  `compactReplayFootage` path strips expired large frame arrays
  during both day-close implementations without touching event IDs,
  deaths, economy, hero progress or world time. No mass replay library,
  fabricated party/treasure video or simulated archive outcomes.
  `dungeonHighlight` is derived from real committed treasure/trap steps
  and shown only in the deliberately opened timeline, never on the
  knowledge-limited passive Board. Exact timestamps and local playback
  seconds must never be conflated; recording bookmarks are lazy.
  VERSION 24 saves validate all saved recording references.
  **PR #214 regression:** Credit goes through the live `departing`
  physical shop exit; `returning` on loan approval is legacy-fixture only.
  Never reverse a `departing` shop visitor into entering during a roster
  refresh. The Level-6 HUD redraws only on actual event/floor history
  changes or explicit replay disclosure, not every 50ms GameStore tick.
  A fixed-seed ten-day state/replay/economy/TP test and a ten-day browser
  IndexedDB/Board/Archive smoke must pass. RAF intervals recorded on CI
  software GL are diagnostics, not measured hardware acceptance.
  **Performance boundary:** Cashier input is graded against the last
  actually painted needle position, with Babylon scene rendering stopped
  during its modal; world timing remains paused. LIVE spectator projection
  must not regenerate layouts/meshes or a party DOM on every render frame.
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
