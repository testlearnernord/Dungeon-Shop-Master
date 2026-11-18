# Dungeon Shop Master — Current Architecture

> **Living technical map · reviewed 2026-11-18.** Navigational guidance, not a frozen API or history of refactors. If modules move, interfaces change or mechanics are removed, replace obsolete entries in the same PR. Source and tests remain the authority for implemented behavior.

## 1. Runtime and ownership

The current game is a **TypeScript/Vite** browser application rendered with **Babylon.js**.

- `src/main.ts` wires the startup, shop scene, controllers, day closure, UI, and active arena/dungeon viewers.
- `src/game/gameState.ts` defines persisted version-13 `GameState` and deterministic day progression. `src/game/gameStore.ts` owns validated player actions and subscriber notifications.
- Pure simulation functions must remain independent of Babylon meshes and the DOM. Scene objects and HUD projections are representations of authoritative game state, not additional sources of truth.
- Scene transitions among the Level 5 shop, boss arena and dungeon viewer must not silently mutate the stored combat result.

## Implemented common combat core (after this PR merges)

`src/game/combatVitality.ts` now centralizes effective HP damage,
armor mitigation, overkill clipping, restoration, the 18-HP purchased
Healing Herb and 8-HP Waybread catalog constants. The physically
recorded `groupCombat.ts` ordinary encounter and the boss's
`arenaCombatMotion.ts` use **the same HP arithmetic**. The same
existing `combatGeometry.ts` supplies arc, dodge and parry rules.

Ordinary fights now accept real Healing Herb charges **for every role**,
not only the healer; each completed heal restores at most 18 HP and
spends one actor-owned supply, and `level7Exploration.ts` commits the
supply decrement in the hero inventory. A healer no longer starts a
group encounter with two imaginary potion charges. Boss healing
spends actual Herbs at 18 HP; its separate role-healer magic action
retains 25 HP where that resource exists. Non-item heal effects should
be modeled as distinct class abilities rather than free item stock.

**Shared encounter pipeline:** `groupCombat.ts` and
`arenaCombatMotion.ts` retain different **actor-specific phase
representations** and immutable v1 replay *schemas*, but both now
register their actor updates, projectiles and outcome mapping
with `combatEncounter.ts`. Their frame capture loops are also
centralized. Troll grab/throw remains an encounter-specific ability
callback; the remaining migration is a universal actor/ability
state model, not another top-level fight clock.

## Implemented shared melee ability authority (after this PR merges)

`src/game/combatMelee.ts` is now the sole pure **melee contact
arbitrator** for both the ordinary multi-actor motor and the Cave Troll:
locked physical strike arc, weapon reach, obstruction, timed dodge and
directional parry are resolved in that exact order, with one result
(`miss`, `dodge`, `parry`, `hit`). The existing shared
`combatVitality.ts` then applies actual HP changes and armor mitigation.

Each attacker has an explicit **ability profile** with hit arc/reach,
parry requirements and (for ordinary/Heavy attacks) telegraph and
strike timings. `groupCombat.ts` now supports an optional, genuinely
slower and harder **heavy** melee skill, while the Cave Troll's
smash/slam/grab and the hero's sword/punch use the same contact resolver.
Regenerated skeletons on the next saved world generation can use the
heavy profile. The new optional `meleeAbility: "heavy"` is validated
on saved `GroupCombatReplay` actors; old actor/replay records remain valid.

The boss's **signature grab lift/throw, knockback, lava edge,
presentation timing and historical replay shape remain preserved**.
Its signature ability behavior is registered within the **shared
encounter stepper**, while individual boss/grapple states remain
distinct from generic `GroupActor` states. The remaining
migration must retain settled Tripo visuals and old recordings.

## Shared actor locomotion and timed-action scheduler (CURRENT after this PR)

The ordinary multi-actor motor and the Troll duel now **both use**
`combatMovement.ts` to integrate real position changes. It owns the
same X/Z world-space movement calculation, actual moved distance and
collision policy for every actor: ordinary dungeon groups supply
bounds/obstacle/other-actor occupancy and wall sliding; the Troll
arena supplies a circular cavern boundary, with its existing lava
hazard and safe radius still enforced as encounter-specific effects.
Boss chase and hero strafe/roll no longer integrate positions through
a separate code path.

`combatActionClock.ts` is the common deterministic tick scheduler
for phase age, once-only contact windows, completion windows,
cooldown and stamina regeneration. It is called by **both** combat
engines at actual simulation ticks. Ordinary windup/strike/cast/heal
and Boss attack/cast/heal/grab/throw/recover action phases use its
result; animations only sample committed frame phases. An action
cannot trigger multiple strikes from repeated frame updates.
Existing numerical contact times, GRAPPLE_TIMING and replay formats
remain untouched.

**Still distinct:** the Troll has its own grip/flight/throw
ability states; ordinary parties use group-specific actor states,
obstacles and team targeting. They now feed the **same encounter
pipeline** but have not yet become a fully universal group-capable
actor state/ability model. Preserve the working grapple and
presentation timings when consolidating their state schemas.

## Shared combat AI and projectile resolution (CURRENT after this PR)

`src/game/combatTactics.ts` is now the **single render-independent
decision layer** for choosing a living opponent, preferring nearby
tanks for monsters, considering reach/line of sight/cooldown before
attacking or approaching, defensive roll/parry stamina requirements,
and selecting permitted melee abilities. The multi-actor engine
and the Cave Troll's existing combat motor both call this policy.
The Troll still has genuine authored **grab/smash/slam eligibility**
(its conditional grab requires proximity, never as the opening
attack; every fourth eligible attack is a grab attempt). Ordinary
enemies choose only their configured ordinary/heavy ability.
All actor/ability choices remain deterministic, not rerolled
when a player opens a viewer.

`src/game/combatProjectile.ts` owns **swept projectile collisions**
for ordinary enemies and Troll encounters: physical segment
intersection against living hostile hitboxes, optional dungeon
walls, deterministic target tie-breaking and wall priority.
The shared group motor still prevents friendly fire by passing
only opposing team members. The Boss no longer tests only
a projectile's final 60 Hz point, so fast projectiles cannot
miss a physically crossed hitbox.

**Encounter motor status:** common tactics, movement, melee,
projectiles and HP are already implemented. Both live actor streams now
register with the **same top-level encounter step and frame recorder**.
Boss-specific caught/thrown state and differing actor state shapes remain
explicit extension work; saved historical recordings never reroll.

## Unified encounter step and recording authority (CURRENT after this PR)

**`src/game/combatEncounter.ts` now owns the top-level 60-Hz fight
pipeline** for *both* ordinary multi-actor dungeon encounters and the
Cave Troll: advance the world clock once, prepare tactical environment,
iterate real actors, commit projectiles, resolve HP/team outcome, then
append recorded cues. The same bounded `recordCombatEncounter` loop
captures both existing immutable **v1 group frames** (every six ticks)
and **v1 boss frames** (every eight ticks with pending cinematic cues).

`groupCombat.ts` registers its canonical actor array and encounter
obstruction/AI functions. `arenaCombatMotion.ts` registers the same
hero-then-boss actor sequence, arena hazards and authentic boss signature
effects (grip, throw, flight, impact) as callbacks to this driver.
The **shared team-liveness outcome** applies to arbitrary parties and
to the single-hero boss, with the boss-specific victory/defeat labels
mapped for its existing replay contract. The boss effect code **does not
get replaced with a generic two-actor group duel**.

The old independent top-level loops, winner checks and duplicated
recording loops have been removed. Source/CI must verify that the exact
troll contact timing, Tripo visual phase names, saved v1 recordings,
legacy v13 save formats, and 60Hz determinism remain compatible.

**What remains:** the group and boss now share one **live actor
interface**, but the boss still stores its fields in the older flat
state and retains authored grip/throw phases. A truly generic
multi-hero/boss actor registry with reusable status effects is
still an OPEN implementation step. Do not claim the entire V.003
dungeon/shop/release scope is complete.

## One live combat actor contract (CURRENT after this PR)

`src/game/combatActor.ts` defines **CombatActorRuntime**, one
mutable actor contract for HP, maximum HP, physical position,
stamina, heading, phase, phase age, cooldown and once-only
contact status. `GroupActor` implements it directly. The
Cave Troll and the boss-arena hero expose **live adapters**
(`bossEncounterActors`) over their authoritative existing
`CombatPreviewState` fields: writing an actor's HP,
position, phase or resources changes the *original state*,
not a copied second registry. The encounter driver
iterates those real actor handles, and its winner check
uses their actual HP.

`enterCombatActorPhase`, `advanceCombatActorPhase`
and `refreshCombatActorResources` own the lifecycle
operations for **both** ordinary actors and boss actors.
`combatActorActivity` groups the existing phases into
semantic combat activities without renaming the original
phase strings used by animations and v1 replay frames.

**Still specialized:** a boss has authored `grabbed`,
`thrown`, `grabMiss` and `throw` actions. It keeps
its legacy flat field layout as the *one source of truth*
until a deliberate save-format migration. Adding generic
multi-hero participation in this boss fight and turning
its unique grapple phases into reusable ability plugins
remain later work. The game continues to label itself
V.002; this is only the next V.003 foundation slice.

## Group-capable boss special actions (CURRENT after this PR merges)

The ordinary **`groupCombat.ts` engine** now accepts an optional
`specialAbility: "grapple-throw"` on a configured melee monster.
In an actual group encounter, the ability follows the same 60-Hz
`combatEncounter.ts` pipeline as normal swings and heavy attacks:
a telegraphed windup; real `combatMelee.ts` contact/dodge/parry;
actor-stat and per-contact deterministic escape; physical hold
synchronized to the attacker's locked orientation; real release,
airborne travel with walls and other actors as obstacles; and a
**single, armor-mitigated landing hit**. Configurable
`staggerThreshold` prevents weak hits from interrupting every frame
of a long boss windup, while strong hits and well-timed parries
retain real counterplay. Dead grapplers release
held victims without fake damage. Airborne victims must land
before a concluded party victory is committed.

**`combatGrapple.ts`** now owns the common grab escape, hand
socket, launch velocity and **original authored Troll timing**,
which the legacy cinematic duel directly imports. This is
not a new simulator or an alternate special-boss damage table.
`GroupCombatReplay` v1 records the actual `grab`, `throw`,
`landing` and `escape` cues and actor phases; the strict
v13 validation allows only these explicitly documented optional
fields. Older recordings remain unchanged.

**Boundary:** multi-hero-vs-boss combat is now genuinely
supported by the existing *group* motor, including real
grapple/throw effects, and is exercised in deterministic
tests. The existing **Level 6 Cave Troll campaign path still
uses its original one-hero cinematic replay and renderer**.
The dungeon viewer renders the full recorded group cast. Real 1–3 hero parties already fight renewable elites on their campaign expeditions. Only the unique Cave Troll retains grapple/throw in newly simulated encounters; the separate Level 6 cinematic and Floor 10 gate are still incomplete.
There is no implied V.003 release from this engine milestone.

## Recorded dungeon cast projection and regenerated elites (CURRENT after this PR)

`dungeonReplayCast.ts` reads combat actor identities, teams, phases,
radii and live-frame locations **only from the persisted replay**.
`dungeonReplayScene.ts` draws every member of that cast and every
recorded projectile, not the previous hard-coded one-hero/one-monster
pair. The lead hero keeps historically recorded equipment. New `GroupCombatReplay` actors optionally snapshot their own
purchased gear at encounter commitment, and the renderer uses that
immutable field for each companion. Older v1 records without gear
remain visually neutral. The spectator must never use current mutable
hero inventory to dress historic footage. TAB camera focus only exposes IDs
from the currently visible frame; it must not disclose future combat
actors while browsing previous footage. The spectator never owns
HP, RNG, movement integration, contact or rewards.

`level7Exploration.ts` chooses a deterministic, renewable elite
**only** for a later generation of a Floor 7 sentry standing in a
room (current tuning: cycle > 0, cycle modulo 4 = 1). This increases the creature's HP, armor/body radius and supplies a normal telegraphed `heavy` attack, without the Troll's signature throw. Actual victory still awards finite bonus XP/gold. Old v1 recordings with legacy grapple metadata are kept unchanged under the strict v13 validator. Cycle zero and Floors 1–4
retain their prior enemy behavior. This is not a unique defeated
boss, the established Tripo Cave Troll, or a multi-hero campaign
party system. No save migration and no second encounter simulator.

At the end of a committed day, `gameState.ts` prunes navigation
progress for dead heroes from early-floor and Floor 7 worlds. The
dead hero's existing historical events and immutable recordings
remain saved; living heroes keep their personally visited routes even
when temporarily on another dungeon floor. This prevents expired
navigation/occupancy records from accumulating past the strict v13
world capacity during long-running campaigns.

## Longer recorded expeditions and Board sockets (CURRENT after this PR)

The SAME `simulateSpatialDungeonPartyDay` motor now permits a bounded
36 real tile steps and up to two distinct actually-reached encounters.
After a victory, heroes can continue walking and find another fight;
casualty, an undersupplied dangerously injured companion, defeat,
route exhaustion and fixed caps remain real stopping conditions.
`campaignSave.ts` accepts two strictly validated v1 encounters in a
v13 envelope while preserving old one-encounter tapes. The viewer
reads the committed route and combat frames with no fake idle segments.
`rosterBoard.ts` uses the pure `rosterBoardEquipment` projection to
show empty/owned W/A slots and exact numeric HP on the physical board.
These are presentation changes, not a live world clock. The agreed
V.003 target replaces mandatory three-phase snapshots with a single
paced world-time/event ledger and a chronological known-state Board 2.0
(see `docs/LIVING_WORLD_CLOCK.md`), neither of which is shipped.
No ordinary monster visual is complete: current subtype
encounters still render sphere placeholders until the separately
reviewed concept/GLB/rig/animation/SFX pipeline in
`docs/MONSTER_ASSET_PIPELINE.md` is delivered. Ghoul is not yet a spawn.

## Co-located autonomous parties and single day settlement (CURRENT after this PR)

`dungeonParties.ts` selects at most three willing living heroes who
already occupy the same tile on the same spatial floor; the consent
check is derived from real role, traits and injury, not merchant
instructions. Formation is opportunistic; an established voluntary group is
  persisted in the optional v13 `GameState.dungeonParties` relationship
  table. This is NOT a merchant-controlled squad or a second world.

Within the SAME spatial motor, `choosePartyDungeonStep` obtains each member's legal known-next-edge proposal before selecting a shared route through majority, unfamiliar-tile and stable grid tie-breaks. No player/viewer input or omniscient features choose paths. After the committed encounter, `gameState.ts` calculates all individual floor proposals from their own HP, gear, visited state and replay, then calls pure `negotiatePartyFloorDecisions`. It may change a voluntary next `floorAction` but never a hero's original `dungeonGoal`, site ownership, XP, fight result, or healing. A hard shop decision and unsafe descent are non-negotiable. Group decisions are cached BEFORE applying the first character's floor change to avoid roster-order bias.

`level7Exploration.ts` exports `simulateSpatialDungeonPartyDay`:
the existing `simulateSpatialDungeonDay` single-hero API delegates to
it with one participant. Shared grid navigation, known-site resolution,
per-site regeneration and `resolveGroupCombat` are executed only once
for a group. Distinct verified map cells seed the separate fighter
spawn locations. Each participant uses their own physical stats,
purchased gear/Healing Herbs, HP, XP and independently recorded
replay POV. The finite chest/monster gold is split once, one chest
loot unit has one claimant, and traps strike each physically
present traveler with personal armor mitigation. Every member's
real combat HP and consumed Herb charges are settled from the
ONE recorded group fight. The original 25-second/60Hz engine
still owns outcomes and captured frames.

`gameState.ts` computes ready-to-expedition healing, caches each
party member's committed tick and reuses it when that member is
later visited in the same roster/day. Individual intentions and
shop transitions still resolve per hero, with no duplicate world
ticks, extra combat rolls, XP from thin air or extra site claims.
`campaignSave.ts` accepts v1 recordings of 1–3 real adventurer
actors vs exactly one real site monster; every historical frame
must contain the complete unique actor cast. Solo v1 replays
and the v13 save structure are kept intact.

`dungeonParties.ts` protects a verified saved group's members
  from being claimed by an earlier unrelated explorer on the same tile.
  The next committed day retains consenting survivors only when they
  have a common real position, matching living status and unanimous
  stay/ascend/descend choice; moving to another floor does not overwrite
  any earlier personal route. `gameState.ts` stores the resulting party
  with its original founding day. The strict `campaignSave.ts` validator
  permits the optional v13 field, bounds its cardinality and confirms
  unique members, actual active floor and saved co-location. Older
  v13 saves without `dungeonParties` still load and form groups
  naturally. The current Adventurer Board shows only stored group size,
  not an inferred promise based on proximity.
  Current groups are explicitly labelled **Temporary Party**.
  `temporaryPartyChanges` is a pure projection over previous saved
  groups, actual same-day shared encounters and post-day persistent
  groups. It emits no events while observing or reloading and
  differentiates new joiners, unchanged companions, partner swaps
  and departures (including same-day splits). `advanceDay` commits
  canonical actor-scoped join/leave `WorldEvent`s only once, as
  category `dungeon` in the day feed. Each group-replay v1 optionally
  snapshots `partyMemberIds`; the strict v13 validator checks
  cardinality, uniqueness, campaign identity and lead membership.
  The Babylon spectator reads the immutable historical party roster,
  not the current party table, and marks TAB camera focus. Every new
  shared expedition optionally saves `partyAppearances` aligned with
  `partyMemberIds`: verified historical role/gear for the entire
  group regardless of combat. The ONE playback timeline projects the
  actual committed group route; `dungeonPartyFormation.ts` applies
  small cosmetic offsets in the current tile, avoiding overlapping
  meshes without inventing new paths or actor AI. All co-travelers
  walk and turn together and carry matching TP rings. At fight time,
  recorded `GroupCombatReplay` actor coordinates/poses replace the
  cosmetic formation. TAB can follow genuine walking companions.
  Dead actors do not resume traveling after committed combat.
  The v13 validator checks appearance order, owned gear, actual
  campaign member IDs and lead appearance; old v1 recordings lacking
  these optional fields remain playable with neutral or absent
  unknown-identity companions. The physical
  board uses numbered TP markers with a legend; the R roster uses
  complete `Temporary Party #N` text and member names.
  `rosterView.rosterPartyDetails` is the shared read-only
  relationship projection used by the R roster; it returns only
  verified saved companion identities, role/HP and formation day.
  `rosterBoardHud.ts` renders these from GameState without new
  simulation ownership, inventing party commands or leaking
  unrevealed battle outcomes into the sealed merchant ledger.

**Not done:** social leadership and negotiated long-term group goals,
cross-floor unity when members choose different directions, actual
group encounters with the unique cinematic Level 6 Cave Troll and
the full Floor 10 boss/pass progression.

## V.003 target architecture (PLANNED, NOT CURRENT)

The next approved milestone is **V.003 ALPHA — The Living Dungeon**.
See [the unified design contract](THE_LIVING_DUNGEON.md) and
[the prioritized roadmap](ROADMAP.md). The first four floors and Floor 7 now share one spatial explorer;
the specialized Level 6 arena remains a **separate combat implementation**.
Do not claim the planned shared explorer or three daily phases exists yet.

The redesign must preserve one deterministic GameState authority and introduce:
- A shared seeded world with **permanent floor/route structure**,
  persistent story milestones and unique boss resolution, plus separate
  **regenerating regular encounter/chest/trap site state**. Each site
  records stable site ID, next eligible day/phase, regeneration cycle,
  currently active instance/loot IDs, occupancy constraints and
  generation source, so several heroes see the **same** current spawn
  rather than rerolling it. Hero floor/position/intent, separate XP/level,
  groups, real supplies and recorded encounter IDs all persist.
- **Regeneration is an authoritative committed phase operation**, not a
  viewer trigger, a full-map reconstruction or re-run of old encounters.
  Seed from campaign, floor, site ID and cycle; defer spawns in occupied
  rooms/active fights. Prevent duplicate loot claims, automatic
  resurrection of unique bosses and retroactive changes to recorded
  fights, reward events or maps. Keep farming rewards bounded and
  distinguish true spawn state from Galvik's known/last-seen reports.
- **Single paced world clock (V.003 TARGET, not yet implemented):**
  unify active shop/customer timers, dungeon/party events and site cooldowns
  on one deterministic saved in-game timeline. Use bounded event advances,
  clear same-timestamp ordering, safe pauses on planning/reviews/background,
  deliberate bed settlement/overnight fast-forward, and no offline world
  progress. Do not resolve every offscreen combat at 60 Hz per render frame.
  See [LIVING_WORLD_CLOCK.md](LIVING_WORLD_CLOCK.md).
- Separate *world truth* from *merchant knowledge*: only genuine
  chronologically committed reports with source/time/recency reach Galvik.
  They cannot reveal sealed outcomes, secret deaths or future replay footage.
  The new Board uses a read-only known-state timeline, not three phase grids.
- A **single deterministic combat authority**, for groups **and** bosses:
  consolidate multi-actor/projectiles from `groupCombat.ts` and proven
  telegraph/parry/dodge/hit and boss-ability mechanics from
  `arenaCombatMotion.ts`. Remove separate authoritative fight paths
  and the special Level 6 progression path from **new runs**, preserving
  immutable historical replay playback via explicit read-only adapters.
  Babylon scenes never resolve outcomes.
- **Floors 1–4 are now routed to the existing Level 7 spatial core**.
  `simulateSpatialDungeonDay` is the actual shared path: walkable seeded
  geometry, real monster/trap/chest resolution, saved regen, groupCombat
  frames and immutable replays. `dungeonSimulation.ts` has been **deleted**,
  not hidden behind new UI. Per-floor worlds `earlyDungeonWorlds` are a
  strict optional v13 save extension; `level7World` remains intact.
  The next step must unify the Floor 6 boss fight without parallel live
  hit/HP authorities.
- **Shop is a cursed special floor, not dungeon Floor 5 (V.003
  TARGET ONLY).** Replace both old Floor 4/Floor 6 shop entrances and their
  pathing, NPC spawning and furniture-reachability assumptions with **one
  physically shared portal**. Keep the existing single shop scene,
  furniture, sales and ledger; do not create duplicate shops per dungeon
  level. The current Level-5 shop remains in shipped V.002.
- **Shop visits are explicit expedition transitions**: short-term floor
  intent is stay/up/down; an *upward* choice can end an expedition from
  **any floor** and move the hero into the cursed shop instead of walking
  every floor backward. A completed shop departure begins two **full**
  off-duty game days outside the dungeon and shop. Store this status
  independently of physical at-shop and expedition states; reentry
  after standby is a new expedition with a safe anchor TBD.
- **Medium-term hero goals** (safe farming, testing new gear, reckless
  progression, regroup/recover) bias navigation and shopping needs;
  these are distinct from short-term floor direction and time-ordered,
  genuinely reported observed actions in the shared event ledger.
- **Floor 10 is gated per hero** by Galvik's granted pass until later
  redesign. Current `level6Permit` is V.002-only behavior and must be
  explicitly refactored/migrated; neither XP alone nor an ordinary floor
  transition bypasses the gate. Future emergency-escape items are deferred,
  not needed for standard shop access.
- One read-only Board projection shared by `rosterBoard.ts`,
  `rosterBoardHud.ts` and `rosterView.ts`, preserving current mounted
  furniture transforms, E/R interactions, HP and item icons; adding phase
  history, accurate empty gear slots and a dungeon-depth map.
- Explicit `SIMULATION_VERSION = 13` migration/compatibility and old
  replay retention strategy **before** altering persistent schemas.
  A content-release label **V.003** does not mean save format version 3.
  Likewise the separate npm package version `0.1.0` is not the UI label.

The core technical acceptance test must carry one legitimate shop sale/credit
through hero inventory, a deterministic combat item use, a known board status
and an immutable saved/reloaded replay, preserving money/stock/HP. Exact
phase timing, floor geometry, safe post-standby reentry anchor, HP recovery
outside the dungeon, eventual pass redesign and Floor 10 Troll placement
remain design questions, not APIs in production.

## 2. Current module map

| Responsibility | Source of truth / key modules |
| --- | --- |
| Bootstrapping and scene wiring | `src/main.ts`, `src/game/world.ts` |
| State, day advancement and player mutations | `src/game/gameState.ts`, `src/game/gameStore.ts`, `src/bedtime.ts` |
| Economy, physical picked carts, credit and payment | `src/game/economy.ts`, `src/game/shopCarts.ts` (live `payReservedShopCart` transaction), `src/game/shopCredit.ts`, `src/game/customerCheckout.ts` (retained separate quote-based checkout API) |
| Adventurers and autonomous customer intentions | `src/game/adventurers.ts`, `src/game/shopperIntents.ts`, `src/game/shopArrivals.ts` |
| Customer visuals, motion, requests and navigation | `src/game/npcVisualSystem.ts`, `src/game/npcLocomotion.ts`, `src/game/npcShopGestures.ts`, `src/game/npcCustomerBarks.ts`, `src/game/shopServiceSpots.ts`, `src/game/shopperNavigation.ts`, `src/game/npcTraffic.ts`, `src/game/checkoutQueue.ts`, `src/game/restockWaitingPlaces.ts`, `src/game/shelfWaitingPlaces.ts` |
| In-world stock appearance | `src/game/shop.ts` owns shelf slot meshes and follows stock changes; `src/game/shopStockAssets.ts` imports the six original `public/assets/models/*.glb` files through Babylon's glTF loader once per scene, merges their painted parts into shared stock templates and clones lightweight display meshes for each stocked unit. The originals are reproducible from `tools/asset_generation/build_models.py`. There is no parallel procedural merchandise generator. Stock visuals cannot be targeted or collide with NPCs; the wooden slot remains the interaction/collision target. The 2D item-icon atlas continues to serve the HUD. |
| Registered furniture geometry, mounting, UI metadata, cashier docking and service routes | `src/game/furnitureRegistry.ts` (single canonical registry, including shelf template/counter service metadata), `src/game/shopLayout.ts` (built shelf instances and cached collision), `src/game/economy.ts` (empty starting stock, four slots per built shelf), `src/game/level5Walkability.ts`, `src/game/shopServiceReachability.ts`, `src/game/checkoutQueue.ts` |
| Contextual furniture editor and preview performance | `src/blueprintHud.ts`, `src/game/furnitureBlueprint.ts`, `src/game/furnitureSelection.ts`, `src/game/blueprintPreviewValidator.ts` |
| Bedroom props and wall-mounted furniture | `src/game/bedroomFurniture.ts`, `src/game/bedroomFurnitureVisuals.ts`, `src/game/wallFurniturePlacement.ts`, `src/game/rosterBoardPlacement.ts`, `src/game/wallPortraitPlacement.ts`, `src/game/rosterBoard.ts` |
| CURRENT Floors 1–4 and Floor 7 shared spatial exploration | `src/game/level7Exploration.ts` (one `simulateSpatialDungeonDay` motor with Level 7 wrapper), `src/game/dungeonDecisions.ts` (hero strategic stay/up/down/shop decisions), `src/game/dungeonLayout.ts` (per-floor seeded geometry), `src/game/dungeonRegeneration.ts` (site cycles), `src/game/gameState.ts` (one day authority); old `dungeonSimulation.ts` is removed. |
| CURRENT separate Level 6 boss fight (not unified yet) | `src/game/level6Combat.ts`, `src/game/arenaCombatMotion.ts`, `src/game/bossCombatReplay.ts` |
| CURRENT ordinary-site regeneration for Floor 7 | `src/game/dungeonRegeneration.ts` owns pure seeded site cooldowns, generation seeds, once-only resolution and occupancy-safe refresh; `level7Exploration.ts` uses it on committed day ticks, persists optional `level7World.siteCycles`, permits real route backtracking toward renewed sites, and preserves old replays. `campaignSave.ts` strictly validates site identity, cycle, resolved day and new replay cycle metadata. This logic is reusable by the future unified explorer but **is now shared by Floors 1–4 and 7, but is not yet wired into boss battles**. |
| Level 6 deterministic combat and edge risk | `src/game/arenaCombatMotion.ts` is the single 60 Hz authority for preview and newly committed Floor 6 fights. Each windup reads one deterministic tactics-seeded reaction (proper dodge, sword parry, premature defense or missed reaction). Eligible close-range swings can become a seeded grab (around 59% selection, with every fourth attack an attempt); the same motor owns their 1.20s warning (first 0.65s turn-tracking, then a locked telegraph), 0.30s grab contact, 1.25s hold phase, 0.58s throw release, 0.90s flight and physical landing. Missing, dodging or breaking a grab changes the authoritative phase to `grabMiss` (0.62s retraction), explicitly never `throw`; the normal attack path and parry/stagger remain unchanged. A real capture causes 42 raw landing damage (mitigated by armor/tank) and at most one 12-HP boundary lava tick; near-edge panic rolls occasionally take the outward lane, trigger one bounded lava hit, then redirect inward. Ordinary navigation remains clamped safely. `bossCombatReplay.ts` records all real cues; new frames permit an optional strictly validated `attack: grab` property while historical v1 frames remain valid, untouched and never re-simulated. |\n| Boss/dungeon replay and observation | `src/game/bossCombatReplay.ts`, `src/game/level6Arena.ts`, `src/game/bossCombatHud.ts` (world-projected health and cue-only numbers), `src/game/bossHudPresentation.ts` (pure cue classification), `src/game/dungeonViewer.ts`, `src/game/dungeonReplayPlayback.ts` | 
| Cave Troll rig, cinematic and arena dressing | `src/game/caveTrollVisual.ts` owns the original animated Ashen Tunnel Mauler rig (distance-driven legs, IK grips and overhead hammer); `src/game/caveTrollSculpt.ts` asynchronously imports the original 17-part `public/assets/models/ashen-mauler-sculpt.glb` and copies its anatomical UV/normal/vertex-color buffers onto the existing scene meshes. The model is regenerated with the dependency-free `tools/asset_generation/build_cave_troll.mjs`. The revised generator Catmull-Rom interpolates organic contours at dense radial/axial resolution with normals/UVs/vertex color; additional scalp/jowl hair tubes, cloth-strip surfaces and rounded armor remain scene-authored, non-colliding Babylon geometry. Ash/cool face-fill and warmer lava/rim lights are presentation only. This is NOT a skinned or independently animated GLB; `src/game/caveTrollArenaArt.ts` creates the mine backdrop. `bossCinematic.ts` owns a pure 13.5-second camera timeline; `level6Arena.ts` holds the fixed-tick preview or recorded replay at its unmodified initial frame until the intro ends. The existing `src/soundtrack.ts` scene player supplies the optional music playhead, restarts on replay and seeks to the impact on skip. `src/game/maulerImpactPresentation.ts` is a pure sampler of existing boss phase/age/slam, with 0.14-second strike contact and continuous recover effects; `level6Arena.ts` owns one reusable impact ring, 16 non-colliding rock meshes and a light, synchronized to both preview and saved frames. The existing troll rig samples the same curve for a short shoulder compression while its feet remain planted. No visual module writes simulation state, hit geometry, RNG or replay outcomes. Browser checks include scene-camera intro, visual gait/slam/death, restart, audio sync and non-mutating close. |
| Grab/Throw GLB preparation | `tools/asset_generation/merge_tripo_grab_throw.mjs` matches 65 bone names and appends only two animation tracks (buffer views/accessors) from the owner's root-level two-clip GLB to the original curated model. npm `predev`/`prebuild` produces ignored `public/assets/models/ashen-tunnel-mauler-tripo-combat.glb` with 14 clips and unchanged mesh/materials; the original 12-clip GLB and Model Lab remain. Mismatched source rigs fail the build. |\n| Level 6 experimental skinned GLB rendering | `src/game/tripoCaveTrollVisual.ts` imports the generated 14-clip, 65-bone Tripo combat candidate on demand in the **existing Level 6 arena**. `tripoBossMotion.ts` translates saved/live boss phases and phase ages into sampled GLB frames; chase retains gait across no-tick render frames and advances foot motion by traveled meters, while normal/slam punches still use the real 1.9–2.1 s overhead contact. `grab_hero` and `throw_hero` sample the motor's shared `GRAPPLE_TIMING` at the actual extended-hand contact and overhead release frames. The Tripo renderer exposes a world-space grip socket built from animated LeftHand, LeftHandIndex1, LeftHandMiddle1 and LeftHandThumb2 joints. The spectator attaches the hero torso and wrist-relative orientation until release; `tripoGripPresentation.ts` then blends visual flight from the hand to the deterministic simulation landing. No changes to saved frame shape or physics ownership. The failed-catch `grabMiss` phase scrubs the hand backwards and restores idle instead of selecting the `throw_hero` clip; animations never own physics. The skinned character needs no additional 180° yaw correction; its rejected wrist-tracked maul was removed in favor of unarmed two-fist attacks. The renderer blends up to two paused Babylon AnimationGroups over 0.19 seconds and advances a footstep cycle for heading-only turns, while the authoritative root still controls position, facing and collisions; Babylon animation time never controls hits, AI, position or replay outcomes. A user-facing switch restarts only the spectator presentation, preserving the current training fighter and the legacy model as loading/error fallback. The original 17-piece legacy boss remains default with a simplified grip pose; newly simulated attacks can affect outcomes, while saved recordings are never re-resolved. Model Lab remains separate and unchanged. |
| Level 6 SFX isolation/debug (unsaved V training ONLY) | `src/sfxCatalog.ts` lists the 19 cues and source/type filter metadata. `src/gameSfxSamples.ts` maps eleven approved MP3s in `public/audio/sfx/cave-troll/` onto six Troll cues, rotating grunts/hurt takes and selecting longer swing/impact recordings only for recorded motor slams. `src/gameSfx.ts` preloads/decodes these on user audio gestures, plays via the existing Web Audio master/limiter/distance mixer, enforces short per-cue playback windows, and stops sampled audio on arena exit. The six old synth cue branches are removed; missing breath, stagger, death, Hero and World sounds remain explicit placeholders. `src/gameSfxDebug.ts` labels MP3 versus synth and logs audio availability, firing and filtering; debug solo/mute remain restricted to unsaved training. Neither cues nor music, combat simulation, saved replays or game RNG change. |
| Level 6 training variants and local GLB inspection | `src/game/bossTrainingScenario.ts` creates presentation-only random sparring options (never called by confirmed day simulation); `src/game/bossModelLab.ts` loads either local user-selected `.glb` files or the repository-curated twelve-clip Tripo model (`modelLabCatalog.ts`) into the same disposable Babylon scene with an animation selector; the full 55-clip source is archived under `assets/tripo/source/` and is not shipped to Pages. `Level6Arena` switches scenes without changing recorded footage or GameStore. |
| Hero identity/appearance and portraits | `src/game/heroIdentity.ts`, `src/game/heroVisual.ts`, `src/game/portraitAtlas.ts` |
| End-of-day book and spoiler-safe projections | `src/merchantLedger.ts`, `src/ledgerHeroChronicle.ts`, `src/ledgerSealedExpeditions.ts`, `src/ledgerViewState.ts` |
| Campaign save validation | `src/game/campaignSave.ts` |
| Player shop service and crosshair | `src/game/shopServiceFocus.ts` (pure shelf hints and urgent request ranking), `src/game/interactionSystem.ts` (throttled real shelf-ray hint), `src/shopHudLayout.ts` (compact status and F shortcut), `src/game/npcVisualSystem.ts` (read-only active requests and physical checkout readiness), `src/cashierHud.ts` (current two-stage staffed register) |
| Shared interface and sound | `src/uiIcons.ts`, `src/immersiveUi.css`, `src/soundtrack.ts` (scene music, fades, separate music preferences), `src/gameSfxSamples.ts` (approved MP3 manifest, volume and duration), `src/gameSfx.ts` (recorded Web Audio sample cache plus temporary synthesis for outstanding effects, 19 catalog cues, quiet lava ambience, simple distance/stereo sound and separate persisted SFX preferences). `main.ts` enables temporary Level 6 arena mix defaults (Music 16%, SFX 40%) through existing soundtrack and SFX controllers, without persisting arena slider edits or changing mute flags; leaving V restores each normal independently persisted level. `main.ts` still routes checkout/merchant sounds through the SFX preference; `level6Arena.ts` maps the score-led cinematic, authoritative motor events and visible distance to their sound cues without writing to combat, replays or saves. |

This is a **route map**. Before editing, inspect the named module, its imports, callers and relevant tests; do not assume the table guarantees an isolated interface.

## 3. Invariants to preserve

1. **One authoritative game state.** Changes run through validated simulation/store operations. HUDs and meshes follow; they do not independently resolve purchases, damage or progression.
2. **Boss visual and music-led introduction contract.** The approved Ashen Tunnel Mauler uses a checked-in, authored 17-piece GLB as anatomical surface geometry plus the original Babylon elbow/leg/head/hammer transform rig; it is **not** an independent skinned/animated GLB. The asynchronous import only changes vertex buffers on already animated, non-colliding meshes, refreshes their bounds, forces opaque depth-writing (no vertex alpha blending) and retains a visible fallback on load failure with status in boss metadata. The spawned root must adopt the pre-existing `motion.bossHeading` before the first cinematic frame, including saved replay starts; never rely on the first `paintCombat()` to turn the initially backwards +Z-facing mesh. The 13.5-second intro only animates visual poses and samples read-only camera/audio time; it **must not step `stepCombatPreview`, advance `replayTime` or inspect future replay frames**. During playback the real MP3 playhead controls the drop; muted/blocked playback uses bounded wall-time fallback. Space/Enter skips to combat, seeking the existing boss audio player to the downbeat. The 60 Hz combat motor remains the single authoritative resolver. New combat balance (safe navigation, limited lava contact, boss HP and recovery cadence) applies only to newly committed encounters; existing saved replay frames, their original boss max HP, damage, outcomes and rewards are displayed unchanged. Never call the source-code mesh photorealistic concept-art quality.
3. **Replay fidelity.** Level 6/7 outcomes are committed before watching. Reopening a recording never rerolls combat, survival, loot, XP or merchant gold.
4. **Spoiler-safe projection.** The ledger separates known business activity from sealed outcomes. Never derive pre-replay hero status from the after-day state. Pending-ledger restore must not temporarily render unsafe information.
5. **Furniture preview versus commit.** Cursor previews do not write saved state. The contextual blueprint editor calls the same `GameStore.previewFurniturePlacement` check as the authoritative click/commit, including the excavated `level5Room`, board clearance and reachable service routes. Shelf access, checkout queues and doors stay reachable. Focus outlines trace visible furniture, not the larger clearances reserved for NPC service.
6. **Universal furniture registry and transaction.** `furnitureRegistry.ts` owns canonical labels, mount surfaces, sizes, focus data, rotated bounds, collision and shelf/counter service semantics; there is no parallel shop-floor geometry table or counter rendering facade. `furniturePlacement.ts` is the ONE pure preview/commit validator, exposed through `GameStore.previewFurniturePlacement` / `placeFurniture`, contextual P and new-shelf N. Shop shelves have monotonically assigned `shelf-N` instance IDs and four stock slots per built instance; new placement appends the empty stock records atomically. New campaigns start with no shelves or stocked slots. Strict `campaignSave.ts` requires a complete version-13 room, bedroom, roster-board and counter transform and checks shelf-to-slot correspondence; older partial/five-slot states are incompatible and deliberately not migrated. The alpha bounds live shelving at 12 instances. `Shop` creates corresponding meshes and inventory slots on state changes, while navigation/queues use their registered collision hulls and service sockets. Wall-mounted fixtures share `wallFurniturePlacement.ts` for structural wall anchors and excavated-rock support; mining supporting rock is rejected until the mounted object is moved. Private bedroom fixtures share the registry/transaction but retain sleep/door access rules. Other furniture currently remains a single instance per type: new reusable types still need their own mesh, persistence and interactions.
7. **All dependent transforms move together.** Bedroom object groups include their interaction targets, collision hulls and lights when applicable. Sleep range follows the moved bed; roster interaction follows the moved board. Register geometry, staff docking, queue and blueprint use the same counter placement and orientation.
8. **No hunger implementation.** Waybread/Herbs heal HP. No starvation timers, hunger events or residual hunger logic.
9. **Persistence discipline.** `SIMULATION_VERSION` is presently **13**. Version-12 campaigns with baked-in five-slot giant shelving are not migrated or silently loaded; version-13 saves validate zero-to-twelve compact four-slot instances. Invalid saves must not be silently overwritten.

## 4. Performance and runtime watchpoints

- **Blueprint hover:** snapped candidate position and rotation may update every frame. Avoid full customer-path BFS per mouse movement or per ghost mesh. Cache settled geometry checks and invalidate against layout/room/furniture changes; keep moving NPC/player occupancy live.
- **Physical shelf stocking:** `GameStore.transfer` calls the single pure `transferShelf` for one-unit clicks and Shift+click fill/clear; both use the same item, bag, slot and cart guards and commit once. Held clicks repeat only on the original aimed slot. Successful transfers reuse the existing first-person hands and stock/destock SFX rather than adding a second stock-action system.
- **Shop service HUD and shelf hover:** `InteractionSystem.updateShelfFocus` uses the actual picked Babylon shelf-slot mesh and `describeShelfFocus` to show real slot/bag/held-cart constraints at a throttled ~140 ms cadence. `setupShopServiceBrief` reads `NpcVisualSystem.activeServiceRequests()` and `readyCheckoutHeroId()` about every 250 ms, displaying only live petitions and the *actual* physically-ready register head. `prioritizeShopService` sorts expiring stock requests without changing the NPC clock. F/click only selects an item through existing `interactions.selectItem`. Never add buying, transfer, sale or new shopper decisions to these read-only UI projections.
- **Navigation grid:** One-shot `pathToShopGoal` caches static blocked/free grid cells within a single route. `createShopRoutePlanner` shares this grid among paths in one immutable furniture-draft or service-point batch. BFS remains authoritative for connectivity; line-of-sight smoothing only removes redundant 90-degree turns after verifying every real rock/furniture segment. New layouts/room edits create fresh planners. An optional short-lived set of occupied cashier stations makes each entering customer's route avoid other queue members; these dynamic blockers are never cached across shoppers or layout changes. Snap, BFS, segment and actual service endpoints remain authoritative.
- **NPC visit lifecycle:** `shopArrivals.scheduleShopVisit` takes the day settlement's paid IDs so a completed purchase cannot reroll into a `shop-stay`. `NpcVisualSystem` tracks same-day manual receipts separately from persistent `at-shop` simulation status; ordinary roster updates must not revive a shopper already exiting or respawn one who left the scene. Once an actor is in a gate corridor, a renewed departure must continue outward on that physical side instead of routing backward through the shop.
- **NPC dialogue presentation:** `npcCustomerBarks.ts` deterministically chooses short, role/item-aware lines from events already observed in the Level 5 shop; `NpcVisualSystem` maintains a tiny, expiring, per-visit visual queue and a single shared DOM bubble using the same Babylon world projection as item wishes (`npcWishBubble.ts`). Restock/credit remarks are distinct from the persistent clickable-free request icon and its actual 60-second timer. Pickup and manually paid responses require confirmed transactions; granted credit follows the actual ledger commit. No saved barks, gameplay RNG, new shopper decisions, popup modals, replay spoilers or moving NPC blockers.
- **NPC performance:** `npcShopGestures.ts` computes pure, bounded shop poses from the existing visitor phase and confirmed visual event cues; `NpcVisualSystem` applies them to the arms, torso and the shared `heroVisual.ts` head pivot. Customers look at real shelf slot meshes while inspecting, hold their carried goods while queuing, use distinct calm credit/restock gestures and turn toward the player during a held E-dialog. A short reaching pose is triggered only by successful `onPickUp`; the payment nod requires a committed receipt. No extra shop intent state machine, save field, inventory mutation or RNG consumption is permitted. The visual cadence and confirmed-action counters are runtime diagnostics only.
- **Shop-day visual acceptance:** `tests/shopperFlowReliability.spec.ts` follows the same eight-customer live Babylon scene from stocking and independent requests through five spaced crowd samples, real hold-E day-close, sale settlement, ledger and save/reload. Test actual reserved-customer separation, one-way receipt persistence and cash/stock conservation, not just state names. `npcShopGestures.ts` uses staggered held glances and brief intermittent request signals rather than robotic continuous arm waving; all gesture timing is transient and separate from the original 60-second request countdown.
- **NPC locomotion:** `npcLocomotion.ts` owns pure acceleration/braking and shortest-arc heading helpers. `npcVisualSystem.ts` keeps each visitor's temporary walking speed and applies it to real collision-validated movement, braking only at the last waypoint rather than every grid corner. Stationary cashier customers turn toward the actual relocated till; idle torso sway is cosmetic. Never persist motion state or couple it to `GameStore` purchases, queue ownership, or deterministic dungeon simulation. Keep real progress and stuck recovery working at low start speed.
- **NPC traffic:** A maximum of five buyers form one physical checkout line; each station is 1.3m apart, exceeding the shared `NPC_STATION_CLEARANCE` of 1.18m for exclusive service claims. Additional buyers use existing overflow stations instead of circling the register. Dedicated incoming and outgoing corridor lanes permit simultaneous opposite-direction traffic while physically separated; otherwise retain right-of-way arbitration. Requesting customers initially visit the nearest reachable petition pocket, then occasionally choose short local `roam` legs away from checkout, service faces, doors and other claims; they may move aside for an active route without losing their request or timer. When no nearby safe spot exists they keep their prior claim rather than walking across the whole cave. Their 60-second request expires even in transit; a begging conversation pauses only that visitor's timer/movement. `ShopServiceSpots` derives checkout, shelf-browse, shelf-wait, restock, credit and idle/overflow points from the current layout/room and reserves exclusive physical destinations (including real shelf-browsing endpoints) and shelf service ownership. Unclaimed candidate queue/restock spots are not permanently blocked from shelf browsing; only currently claimed destinations and occupied routes prevent an approach. Invalidate only on topology changes, release on reassignment/departure (including prior shelf ownership when a browser switches to another service role), and refuse placement when no reachable free spot exists. Movement still has separate gate crowd arbitration. After a pedestrian stall, travelling shoppers may softly pass other moving NPCs but must not overlap settled service visitors or cross the final 1.27m approach to their own reserved station; this prevents aisle gridlock without making checkout/restock customers intangible. Do not mistake service reservation for a complete multi-agent path planner. Temporary checkout route obstacles prevent late arrivals from cutting through claimed cashier stations; the visible line still has at most five physical positions and overflow stays outside it. Track real progress toward a waypoint across multiple frames, not just each small sidestep. After six seconds without 35cm of net advance, a restock/credit visitor releases its old reservation and retries an alternate reachable service pocket, without resetting the 60-second wait once at the station. Measure actual congestion before changing collider sizes, collision semantics or path grid resolution.
- **Register transaction ownership:** the current `src/cashierHud.ts` operates from the counter's **staff socket**, validates `NpcVisualSystem.readyCheckoutHeroId()`, displays the real saved `shopCarts` contents and, after two timing stages, calls `GameStore.payReservedCart` → `payReservedShopCart`. This commits booked sales and removes the paid cart; `settleHeldShopCarts` handles outstanding unpaid carts at bed-close. The **distinct** `GameStore.quoteCheckout/checkout` → `customerCheckout.ts` API still exists but is not the player's live register flow. Investigate usages/tests before refactoring or deleting either path; do not conflate the two. After a successful payment, `cashierHud.ts` stays in a **settled, read-only receipt view**; it clears the in-progress `heroId` before paying so the store's cart-removal subscription cannot close the whole register. `E`/Next begins another two-stage challenge only for a new physically admitted unpaid cart. This never changes the GameStore transaction boundary or bypasses staff-side docking. The final receipt amount and possible tip are taken from the actual committed state change rather than guessed before payment.
- **Replays and reports:** preserve snapshot/event identity across sleep, observation and reload. Never call day advancement twice through UI lifecycle.
- **Excavation geometry:** `level5RoomVisuals` retains unaffected mined floor/ceiling/rock meshes by stable topology keys. A pickaxe strike creates/disposes only changed boundaries; never recreate every previously dug mesh after removing one cell. Customer idle navigation pools are expanded lazily after room edits rather than always calculating 100 destinations.
- **Meshes and listeners:** reuse materials/geometry where sensible; avoid accumulating per-frame allocations, subscriptions or event listeners after scene/view transitions.
- **Audio/visual assets:** keep asset work separate from simulation semantics. A nicer model should not redefine its gameplay footprint accidentally.

## 5. Verification and delivery

- Local setup: `npm ci`, `npm run build`, `npm run test:unit`; browser tests use `npm test`. Node requirements and active scripts are described in [README](../README.md).
- Pull-request CI builds the project, runs the entire quick Node unit suite and **six explicit `@ci-smoke` browser scenarios**, not entire Playwright spec files: day/ledger, cashier settlement, shelf build/placement on mined floor, persisted GLB stock, one relocated-register shopper route, and the Level 6 music-led intro. This keeps the blocking browser gate short; the high-cost crowd simulations and full boss/art checks remain available through the manually dispatched full-browser workflow. Successful boss preview screenshots are uploaded by that manual workflow, not each PR.
- Add **focused tests** for affected invariants. Do not expand default CI just to increase the test count; keep browser checks targeted.
- Build/test pass is necessary for code changes; documentation-only edits still receive the repository's configured PR checks. Never claim a check was run if it was not.
- GitHub Pages deploys merged `main`. Verify deployment separately from the PR CI run.

## 6. Documentation sync, not document archaeology

- **Every code PR:** compare changed modules and user-visible behavior against this map, [GAME_BIBLE.md](GAME_BIBLE.md) and [AGENTS.md](../AGENTS.md). Consult [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md) for visual/input changes and [ROADMAP.md](ROADMAP.md) for approved next-pass priorities.
- Update affected entries **in that PR**. Delete renamed, removed or obsolete references instead of leaving historical modules as if they still existed.
- Keep architecture facts in this file, design approvals and unresolved questions in the Game Bible, UI implementation contracts in UI Design System, the proposed sequence in Roadmap, and contributor workflow rules in AGENTS. Do not duplicate long policy paragraphs across all three.
- Do not record a new “latest architecture” subsection each week; edit the existing overview. History belongs in Git commits and PR discussions.

### Current excavation and casualty-display rules

- Unlocking mining (U) **must not change visible wall art**. Until a side is actually excavated, retain its original 14m masonry mesh and use transparent pick-only targets in front of it. Once dug, only that side is segmented, and all remaining wall slices inherit the corresponding full-wall UV coordinates rather than rescaling the entire stone texture into every 1m segment.
- A furniture placement is only valid if both entrance routes reach checkout, all shelf service points, and at least two independent reachable restock/credit petition spots. Petition candidates are generated from the current room topology and moved furniture; there is no fixed original-cave pocket table or second reservation API. The mixed-shop integration test covers a real mined wing, relocated shelves/cashier, requests, roaming, saving and unchanged day simulation. Bedroom furniture and wall board are separately placed, not counted as customer-navigation floor obstacles. Any new shop-floor furniture must explicitly implement persisted placement + visible collision, matching `level5FloorWalkable`/pathfinding, service endpoints and preview/commit checks; integration tests must accompany it.
- Newly dug floor meshes must be pickable as blueprint floor surfaces, including when targeted from the original showroom across a mined opening. Do not cap the editor ray to the old 16m reach, and explicitly exclude disabled original side-wall meshes from Babylon picks (disabled geometry can still reach the ray predicate). Both preview and commit validate the **same** authoritative room and board, plus service routes. Support must cover the **full furniture footprint**, not just the cell under the crosshair. Incomplete excavations receive a precise status; contiguous excavations must pass the real P placement and save flow. Hard-coded side-aisle exclusion strips must not arbitrarily forbid geometry that passes real path validation.
- Floors 1–4 now use actual recorded group fights/traps with immutable early-floor 3D replays, not a random instant-death table. The ledger **seals** outcomes until a saved recording is watched; historical outcomes remain immutable. All deaths require actual HP reaching zero.
