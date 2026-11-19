# Dungeon Shop Master — Development Roadmap

> **Reviewed 2026-11-18 · next release target: V.003 ALPHA —
> The Living Dungeon (DESIGN APPROVED, NOT YET SHIPPED).**
> Source, tests and merged PRs define what is actually playable. Do not
> promote this target to the in-game version label before acceptance.
> The working design specification is
> [THE_LIVING_DUNGEON.md](THE_LIVING_DUNGEON.md).
> Future PR numbers are **not reserved**.

## Incremental V.003 migration

- **PR #211 merged:** explicit LIVE spectator of real current spatial
  checkpoints and 60 Hz combat frames; the physical shop clock continues.
- **PR #212 current:** a SMALL, two-completed-days-plus-today
  event/highlight timeline, not a massive permanent replay archive.
  Deliberate Save protects at most 12 full recordings past the rolling
  frame expiry; combat/loot/party/death/return highlights come only from
  committed world events. Strict v23 validation protects saved record
  references. Lazy playback jump positions use the existing replay engine.
  Cashier no longer renders an expensive Babylon scene while its modal is
  open and grades the last visibly painted needle position. LIVE spectator
  skips re-projection at 60Hz when nothing in the dungeon changed.
- **Remaining:** two-day off-duty shop rotation and integrated multi-day
  campaign/financial/performance acceptance. Never label V.003 as shipped
  until its release gates pass.

## Current foundation (playable V.002 ALPHA)

- **PR #201 world-clock foundation:** version-14 campaigns save an integer
  world minute and future-event queue. Foreground unblocked shop play advances
  that clock; sleep alone moves to the following day. Physical customer
  timers and expedition commits require the #202/#203 migration.

- **PR #202 merged (partial shop cutover):** saved restock/credit petitions,
  real no-sale walkouts and strict v15 saves, without overnight phantom
  revenue. Unpaid goods return to shelves; only real checkout/approved credit
  transfers merchandise.
- **PR #203 merged (fixed-step shop):** 50ms committed simulation ticks,
  20 per game minute, real 60-second petition deadlines, FPS-independent
  shopper movement/queue/wait decisions and pickup checks; bounded autosaves.
- **PR #204 merged (physical checkpoint):** strict v17 saved NPC
  positions/heading, active routes, local waits and congestion state,
  exclusive service and shelf reservations, gate heights and original
  iteration order. Real shop rehydration runs after layout/roster/plans;
  checkpoint capture is coalesced with each completed world tick to avoid
  intermediate half-steps in IndexedDB. Build, 534 unit and 12 browser
  checks passed, including an actual mid-visit resume.
- **PR #205 merged (resumable dungeon motor):** the SAME seeded
  Floors 1–4 and 7 spatial-party/loot/combat engine now exposes a bounded
  single connected step with immutable world-state result, rather than
  requiring every caller to roll 36 steps at once. The shared spatial
  motor is deterministic and preserves legacy tests.
- **PR #206 merged (actual in-day expeditions):** real browser play
  opts into saved exclusive `expedition` world events every 600 ticks,
  moving each active party by at most one connected tile per event and
  committing reached chests and traps exactly once. At this PR's baseline
  ordinary fights were still atomic. Level 6 uses the existing unique boss combat resolver
  at a scheduled event. Bedtime processes only the remaining events,
  never the legacy dungeon day batch. V18 saves strictly validate the
  one active dungeon event and each hero's checkpoint; fixtures not opted
  into live time retain the old path solely for legacy regression tests.
  Remaining **before V.003:** gradual 60Hz combat event progression,
  actual same-day physical return journeys, lasting hero decisions,
  live spectator/recordings, obvious death alerts and integrated
  ten-day gameplay verification. PR #207 replaces the atomic ordinary
  fight path described here with genuine persisted group-combat ticks.

- **PR #207 merged (real-time shared group combat):** Floors 1–4/7
  now reserve actual monster sites on a real one-tile approach, then
  schedule 30 authoritative 60-Hz group-combat ticks every 10 saved
  world ticks (0.5 game seconds), storing live fighter/projectile state,
  accumulated frame captures and participant snapshots in strict v19 saves.
  No viewer, reload or bedtime rerolls a combat. Actual fight completion
  settles healing charges, XP, finite gold and one site generation once;
  completed immutable footage is attached to knowledge-safe live events.
  The 600-tick expedition movement cadence and fixed-step shop continue
  on the SAME clock. **Unique Level-6 cinematic Troll fights still use
  their previous resolver**. Full temporary-party AI, LIVE Board,
  spectator and archive remain future milestones.

- **PR #208 merged (physical shop returns):** The SAME seeded
  spatial motor backtracks over the hero's previously visited connected tiles,
  one true tile each 600 world ticks. Resupply/retreat decisions never teleport
  a hero to the shop. Real traps and monsters remain consequential en route.
  Only reaching the floor's entrance can schedule Galvik's cursed portal
  transit (20 world ticks). Its uniquely owned event commits the actual
  mid-day shop arrival, after which the existing saved NPC shop traffic
  owns physical entering, queues and service. Strict v20 saves persist
  the current route intent, floor, portal owner and exact due tick;
  sleeping cannot conjure missing arrivals or sales. Surviving Floor-6
  Troll challengers use the same timed portal although their cinematic
  battle is still atomically resolved. Two-day post-shop standby,
  longer-term hero AI and unified portal dressing follow in later work.

- **PR #209 merged (LIVE autonomous decisions and Temporary Parties):**
  `liveDungeon.plans` records each individual's actual medium-term
  goal and short-term stay/up/down/shop intention at its committed world
  tick. The ORIGINAL `chooseHeroDungeonDecision` and the existing
  voluntary party negotiation run after real, completed movement and
  combat, never on a view or idle animation. Floors 1–4 gain physical
  seeded down stairs in real connected rooms and up stairs at their
  entrances; transitioning requires the hero to reach a discovered
  stair tile using the SAME spatial walker, with one world movement
  event spent on the crossing and no mandatory Floor 5 route. At a
  shared destination, companions keep their existing TP only when
  alive, willing, co-located and voluntarily aligned; real join,
  dissent/split, casualty and shop departures produce unique ticked
  TP events. v21 validates live goals and time-stamped TP identities.
  The unique Floor-6 cinematic fight and Floor-7 special progression
  retain their existing gated boundaries. Future work must still
  deliver fully connected deeper authored floors, meaningful two-day
  off-duty rotation, LIVE Board/death notices, spectator and archive.

- **PR #210 in progress (knowledge-safe LIVE Board and death signals):**
  A single event-derived `liveBoardProjection.ts` replaces raw remote
  hero HP/equipment/death inspection on both the 3D wall board, expanded
  R roster and compact day feed. Only physically present shop customers
  expose live HP, goods and gold. Real deterministic, clock-ticked
  magical life signatures reveal a coarse upper/deep dungeon activity
  region; an actual zero-HP hero transition emits exactly one
  conspicuous, dismissible `hero-death-signal` warning, never cause,
  enemy, location, unseen loot or full fight. Untold deaths remain
  unknown rather than leaking through mutable game state.
  v22 saves strictly validate signals, event identity and source.
  This is the FIRST genuinely LIVE known-state board slice; the
  full chronological archive, historical observed HP snapshots,
  spectator and night-book redesign follow later PRs.

- A physical, movable-fixture Floor 5 shop: compact four-slot shelves,
  real stock and carts, staffed register, credit/debt, customer paths,
  special requests, excavation, furniture and persistently saved days.
- Persistent hero identities/HP/equipment. **Floors 1–4 and 7 now
  share** one seeded map-exploration, regeneration, group-combat and replay
  implementation; the old 1–4 damage/progress day-roll module is deleted.
  The individually authorized Floor 6 Cave Troll remains a separate
  combat/progression authority pending consolidation.
- A physical placeable Adventurer Board and expanded E/R roster with HP,
  item icons, hero identity and known status, **without** the planned
  unified event/last-known timeline or dungeon depth visualization.
  Mandatory three-phase columns were superseded by the shared-clock design.
- The Level 6 experimental Tripo Troll now has 14 animation clips including
  a real grapple/finger-following release and stronger throws (merged through
  PR #177). The legacy segmented renderer remains as fallback. Automatic
  tests passing is **not** the owner's final visual acceptance.
- Existing `groupCombat.ts`, `level7Exploration.ts`, `dungeonLayout.ts`,
  `gameState.ts`, `rosterView.ts`, `rosterBoard.ts` and `rosterBoardHud.ts`
  provide foundations, **not** a complete Living Dungeon implementation.
  The npm metadata version `0.1.0` is separate from the in-game V.002 label.

## The new design objective

**Core loop:** stock and sell real merchandise → autonomous heroes prepare and
depart → one persistent dungeon/party engine resolves actual exploration,
combat and decisions → returning heroes, honest board reports and preserved
replays reveal consequences → the world, heroes and shop visibly progress →
the player makes a new merchandising or credit decision.

**Release quality bar:** over a ten-day sample the player can explain why an
item mattered, see a low-HP unarmed hero heading into danger, observe legitimate
success/failure and perceive a changed dungeon and customer base.

Do not overbuild extra content before this loop is both real and fun.

## Prioritized implementation packages (cohesive, not micro-PR mandates)

### P0 — Contracts, clean world-clock cutover and first end-to-end example

- Define one authoritative dungeon-world/hero-expedition schema with shared
  seeded rooms/feature resolution, per-hero locations, group membership,
  **short-term direction (stay/up/down)**, **medium-term goal** (farm,
  gear test, explore, progress, cautious retreat), personal depth and
  remembered encounters, **cursed special-floor shop instance**, one portal,
  **two-day off-duty status after shop exit**, real gear/supplies and event IDs.
  Level 10 requires **individual Galvik-granted access**, separate from
  character XP and the existing live Floor 6 permit.
- **Approved shared-time direction:** migrate shop, customer deadlines
  and dungeon movement onto one paced deterministic event clock that
  advances alongside actual shop activity. Pause during planning,
  reviews and background tabs; deliberate bedtime closes the day
  and advances unsupervised overnight events without automatic sales.
  Separate world truth from Galvik's observed/last-known reports.
  No forced Morning/Midday/Evening phases. See
  [LIVING_WORLD_CLOCK.md](LIVING_WORLD_CLOCK.md) for acceptance gates.
- **No old alpha campaign compatibility requirement** for the V.003
  world-clock cutover. Replace the v13 day-batched model with one clean
  versioned new-campaign state, reject incompatible old saves clearly,
  and test new-version deterministic save/resume and exact-once
  inventory/HP/loot. No dual day motors or conversion shims.
- Make the existing physical Board and E/R roster truly **LIVE** from
  permitted observed reports while Galvik operates the shop, including
  report origin and freshness. Refactor night-only `The Living` and
  mandatory `Sealed Expeditions` into the continuously available Board
  and Archive, without deleting functions before replacements ship.
  See [LIVE_BOARD_LEDGER_AUDIT.md](LIVE_BOARD_LEDGER_AUDIT.md).
- Build one reproducible example: paid or credited herb → hero inventory →
  authoritative consumption in an encounter → preserved recording and
  board-readable effect. Validate cash, stock, debt, item and HP accounting.

### P1 — One shared explorer for the first ten floors

**First implementation slice (code in this feature PR; CURRENT only after
merge):** deterministic per-site monster/chest/trap regeneration integrated
with the real Floor 7 explorer, strict v13 save validation, legacy-save
compatibility, visited-floor farming route fallback, and unit tests.
**Second implementation slice:** remove the old Floor 1–4 roll
simulator entirely and route every early floor through the existing
Floor 7 map/regen/`groupCombat` code. Add shared persisted early worlds,
actual hero strategic decisions, sealed saved encounter footage, dynamic
multi-floor viewer and v13-compatible validation. That slice now replaces
the 1–4 placeholder; **Floor 6 remains distinct**.

- **DONE in this slice:** removed the Floor 1–4
  `dungeonSimulation.ts` damage/progress coin flip entirely and reused
  the actual Level 7 spatial engine with floor-specific maps, saved
  shared locations, combat, regeneration and replay. Keep the remaining
  Floor 6 boss migration and Floors 8–10 as separate unfinished tasks.
- Distinguish character **level/XP** from current **dungeon floor**.
  At decision points choose stay, descend or ascend; when choosing to
  ascend, heroes can **abort from any depth and enter the cursed shop**
  rather than retrace all dungeon levels. Medium-term goals (farm money,
  test equipment, cautious play, progress) inform real intentions.
  Do not let the dungeon advance a hero into Floor 10 without Galvik's
  **hero-specific pass**.
- **Dungeon Regeneration:** keep floor geometry, explored routes,
  story gates and unique boss defeats persistent, while ordinary monster
  sites, eligible common chests and resettable traps repopulate at
  **staggered site-specific day/phase intervals**. Persist generation
  cycle, cooldown, spawned instance IDs and occupancy safeguards; refresh
  only safely unoccupied sites. Use saved deterministic seed/phase logic,
  never a new roll on opening the map or Board.
- Ensure safe early-floor farming remains possible but balanced against
  danger, consumable costs and the real shop economy; no duplicated
  treasure, endlessly free income, softlocked progress, retroactive
  drops, unique boss respawns or arbitrary HP deaths.
- Validate seeded multi-hero shared-world behavior across several days;
  a deep hero does not teleport to Floor 4 just because evening arrived.

**Group-capable special-boss ability (after this PR merges):**
the existing ordinary `groupCombat` motor supports a real
`grapple-throw` skill for a configured melee boss against
multiple independently acting heroes. It uses the common
contact/defense, actor state, timing, positioning, hit and
recording authorities. Resistance depends on actor agility,
grips can be dodged/parried/escaped, throw flight collides
with walls and real HP damage occurs at landing only.
The authored Troll timings are shared with the original
single-hero cinematic, which remains replay-compatible.
Tests include party combat, actual grabs and throw damage,
early termination, configurable boss poise against weak-hit
stunlock and immutable v1 recordings.

**Delivered after this PR merges:** the existing Floor 1–4/7
dungeon spectator projects every recorded group fighter, projectile
and combat phase without rerolling anything; TAB can focus only visible
participants. Regenerated Floor 7 room sentries can become stronger heavy-strike
elites, awarding real extra XP/gold without inheriting the Cave Troll's
unique grab/throw. Real campaign parties of up to three heroes can
encounter these sites. The engine still supports grappling for authored
unique bosses; previous saved grapple footage remains compatible.

**Co-located party settlement (CURRENT after this PR merges):**
up to three willing heroes who begin a day on the same tile can
move and fight together using the single spatial-day/encounter
motor. Each receives their own HP, Herb use, XP, gear effects,
recorded viewpoint and later floor intention. New recordings also
preserve the participants' historic purchased gear for 3D playback;
old v1 fights without snapshots remain visually neutral. Site regeneration,
loot and finite gold apply once; strict v13 save validation
accepts the real saved group cast.

**Visible Temporary Party formation during travel (after this PR):**
New saved group expeditions preserve each companion's actual
historical role and gear, including monster-free journeys.
Their 3D models now visibly walk and turn together along the
ONE recorded physical route, wearing matching Temporary Party
ground rings. Purely cosmetic offsets stay inside the shared tile;
actual battle frames always take control in fights and recorded
dead characters never reappear walking. TAB can follow a companion
outside combat. Old v1 records without visual snapshots remain
readable without fabricating gear or monsters.

**Temporary Party presentation and feed (after this PR):**
Real saved relationships are clearly named **Temporary Party**
throughout the physical Adventurer Board (one matching numbered
TP marker per group), expanded roster (full companions, HP,
role and formation day), and saved dungeon footage (the actual
historical members for that recorded day, with focused hero
highlighted). Canonical join/leave events are committed once per
real change and appear in the existing Dungeon feed. A stable
party cannot re-join every morning; old replays without saved
party metadata remain compatible. No temporary alliance grants
player-issued orders or reveals unseen battle outcomes.

**Persistent party step (CURRENT after this PR):** voluntary,
co-located groups of 2–3 are saved in an optional v13 relationship
table and take precedence over transient outsiders. A unanimously
chosen existing floor transition keeps the group together when
the members' real destination positions agree; each hero's own
goal, inventory, combat, injuries and replay remain independent.
A casualty can leave a surviving pair, while dissent, shop return
or divergent saved positions dissolve companionship. The existing
Adventurer Board identifies actual parties; the expanded R roster
now also identifies every saved companion with real HP, role and
founding day, all via one read-only relationship projection. No duplicate claims
or fabricated teleports; old saves without the field remain valid.

**Delivered after this PR:** shared travel uses each member's local mapped route proposals, with deterministic majority/ties; bounded post-encounter consent allows healthy companions to follow descent, patients to wait one real expedition day, and supportive climbers to escort a cautious ascent. No forced descents, vetoed resupply, leader orders or duplicated encounters.

**Still open:** deeper long-horizon party goals/leader AI and longer social
behaviour, the unique Cave Troll as an actual group campaign battle,
Floors 8–10 and the individually gated Floor 10 pass. Full V.003
milestone and cursed special-floor shop remain unfinished.

### P2 — Meaningful real merchandise and combat

**Integration delivered in the next PR (CURRENT only after merge):**
`combatVitality.ts` supplies one pure HP damage/mitigation/heal rule
to both recorded ordinary combat and the Cave Troll. Real purchased
Healing Herbs now heal **18 HP for tank/DPS/healer alike** in group
encounters, spend an actually carried unit and appear as committed
`heal` cues in replay. The catalog's Herb/Waybread HP values are
shared with combat; boss Herb healing is also 18 HP, separate from
innate healer magic. Tests cover the cross-engine HP contract and
inventory causality.

**Next integration slice delivered after this PR merges:** common
`combatMelee.ts` contracts now handle strike arc, reach, obstruction,
roll invulnerability and parry for both generic enemies and the Cave
Troll. A single profile list also defines ordinary, heavy, Troll smash,
slam and grab attacks. Group combat now supports actual timed/damaging
heavy attacks; regenerated skeletons may acquire them, and their
optional profile survives recording and strict save validation.
The old Troll grapple/replay clips retain their present physical
effect and timings.

**Shared actor/runtime integration (after this PR merges):**
`combatMovement.ts` moves heroes and monsters using real world
positions and one integration function, with per-arena collision
policies (walls and actor separation vs circular Troll boundaries).
`combatActionClock.ts` drives the deterministic one-time action
contacts, completion, cooldown and stamina steps for group and Boss
combat. The Troll's exact grab/throw animation timing is retained
while the same scheduler controls the combat contact moments.
Tests lock deterministic boss and multi-actor motion/replay, collision
and no duplicate hits.

**Shared combat decisions + projectile integration (after this PR merges):**
One `combatTactics.ts` owns deterministic enemy target preference,
engagement, defensive choices and legal melee skill selection for
ordinary encounters and the Cave Troll. One `combatProjectile.ts`
resolves swept physical projectile contact (including dungeon walls,
enemy-only damage and tie-breaking) on both paths. Special grab
selection retains its existing distance, attack-index and tactic
requirements; no free damage or rerolled encounter replay.
Tests cover actual group aggro, boss attack rotation, tank reactions,
fast projectile hits, wall obstruction, no friendly fire and
deterministic full boss fight.

**Shared encounter stepper delivered (after this PR merges):**
`combatEncounter.ts` is the one 60-Hz tick and recording driver
for normal groups and the Cave Troll. Both register actor updates,
projectile resolution, world effects and outcome mapping in a
deterministic pipeline. Replay snapshots use the same capture
scheduler but retain their old group-v1 and boss-v1 frame layouts.
No two independent top-level combat loops remain.

**Common live actor runtime delivered (CURRENT after this PR):**
`combatActor.ts` now defines the single mutable combat-actor
contract, the same phase transition and action clock helpers,
and the same stamina/cooldown refresh used by GroupActor
and the boss/hero's live adapters. Actor state writes reach
authoritative HP and position rather than a second copy.
The Troll keeps its historical flat save state and v1 replay
animation phase names.

**Still next:** implement a general, saved group-capable actor
registry for multi-hero boss encounters and reusable status/
grapple/throw ability effects. The Troll's specific grab,
release and flight code is still specialized, even though it
uses the same encounter pipeline and actor lifecycle. Do not
rewrite existing historical recordings or claim V.003 released.



- The first six stock items are the starting scope. Healing Herb (+18 HP)
  and Waybread (+8 HP) remain HP consumables, never hunger.
- A sword affects recorded attacks; a vest affects damage/traps; a healing
  use consumes an actual unit. Mana Potion gets a specified resource/ability
  loop before being treated as valuable; iron ore gets a defined downstream
  demand/use later rather than fake utility.
- **One combat motor for both regular enemies and bosses**: fold
  reusable telegraph, dodge/parry, hit, movement, resources and boss skills
  from `arenaCombatMotion.ts` together with multi-actor/projectile support
  from `groupCombat.ts`. Eliminate redundant authoritative combat islands
  and the special Floor 6-only progression path after new fights and historical
  replay adapters pass regression. Do **not** turn every party encounter into
  a one-on-one Troll fight or remove valid saved boss footage.
- No direct Galvik party control and no guarantee that equipping a hero
  makes them survive.

**Current pacing and art gate (after this PR):** authentic spatial days
have up to 36 connected steps and two actually reached fights; a winning
party can continue instead of the first fight ending the day. Past replays
remain unchanged. **Ghoul first playable integration:** new seeded
ordinary monster sites use the owner's actual skinned Ghoul model
(14 combat clips + separately exported Idle combined during build).
Dungeon recordings display authored attacks, reactions, walking
and deaths using the saved fight phase times. Existing physical
rooms receive a separate crypt/tomb/pillar/fog aesthetic instead
of the prototype bare stone. Remaining work before FINAL visual
acceptance: explicit player screenshot approval of scale, orientation,
foot planting, animation contact/transition, original Ghoul SFX,
and GLB texture/performance optimization. The Cave Troll's unique
grapple remains unrelated. See MONSTER_ASSET_PIPELINE.md.

### P3 — Adventurer Board 2.0

- Preserve the **physical wall board**, movement/placement, and **E/R**
  access. Upgrade it to an ordered, knowledge-safe **event timeline**:
  the hero's last confirmed location, source/time/recency of reports,
  actual or intended activity (farming, progressing, discovering,
  fighting, fleeing, recovering, Temporary Party, shopping or unknown).
  Do not require fabricated morning/noon/evening entries.
- Keep **HP bar + exact HP, character level, dungeon floor and equipment
  icons visible without opening a card**. Show **empty sword/armor sockets**,
  plus carried Healing Herb, Waybread, Mana Potion and other meaningful
  inventory icons with real counts. A visibly unarmed hero heading for a
  dangerous floor must be obvious at a glance.
- Expanded board adds filter/sort, per-hero/party detail, a compact vertical
  depth map, history of confirmed real purchases/consumption/encounters and
  links to available, **already committed and revealable** replays.
- Activity icons should share the existing semantic sprite atlas; goods
  reuse the current item atlas. Read-only projection, accessible labels,
  responsive physical texture and compact management UI. No spoiler leak.

### P4 — First chapter gameplay and observer polish

- A deliberately small **Floor 1–10** chapter slice rather than
  automatically generating 100 contentless floors. Room density and exact
  encounter distribution remain adjustable.
- Candidate: move the Cave Troll to a more dramatic chapter boss region
  around Floor 10 after the unified progression is built. Keep original
  Floor 6 fight/replay assets and verify old records remain valid.
- **Replace the legacy Floor 4/Floor 6 entrances** and their
  service/traffic/navigation assumptions with a **single large swirling
  cursed portal** for entrance and exit. The existing cave shop becomes
  a **special floor outside dungeon numbering**, not Floor 5.
- **Expedition rotation:** an upward-direction decision at **any**
  dungeon depth may become an **expedition abort + shop visit**; when
  the hero **leaves the shop**, keep them outside both dungeon and shop
  for **two full subsequent game days**. Only after that may they
  start a new expedition. Never count off-duty heroes as present
  customers or combatants; do not auto-heal/replenish them for free.
  Exact safe reentry anchor and downtime healing remain open for balance.
- **Floor 10 remains blocked** per hero until the player grants a pass;
  reuse/rework the current Floor-6 permit concept deliberately instead
  of treating high XP or finishing Floor 9 as automatic authorization.
  This pass design is temporary and may be revisited later.
- **Do not add an escape-rope item yet.** The upward-transition shop
  option already solves return travel. Revisit special extraction only
  if it proves to have a distinct balanced purpose.
- Make the player notice genuinely changing dungeon routes, customer
  behavior, supplies and commerce; prioritize legibility over more HUD.
- Perform seeded economy/fight tests and genuine shop-to-dungeon browser
  playthroughs. Measure ten days for dead periods, exploit farming,
  unfinished sales, hopeless early parties and save/replay discrepancies.

## V.003 ALPHA release gates

1. **Real visible causality:** at least one real bought item measurably
   changes recorded HP/damage/ability, without fabricated post-hoc bonuses.
2. **Readable status at the physical board:** exact/known HP and equipment
   (including missing gear), actual item icons/counts, floor and intent;
   ordered real/last-known reports with recency and a useful expanded
   depth/hero view, not three artificial phase snapshots.
3. **One authoritative renewable expedition world:** heroes share
   seeded persistent floors and distinct generations of ordinary
   enemies/chests/traps; map/story milestones and unique boss deaths never
   reset. Character levels progress separately; groups/retreats, travel
   and time-based refresh are deterministic and saved/reloaded identically.
4. **Special-floor/shop lifecycle:** one portal instead of the old
   Floor-4/Floor-6 entrances, abort-to-shop from any floor at the upward
   choice, two **complete** post-shop off-duty days, safe new-expedition
   reentry, and per-hero Floor 10 pass gate are reproducible with
   no duplicated characters, carts or phantom cash.
5. **No replay or economic lies:** before/after save and ledger produce
   identical committed events; missing heroes do not reveal a secret death,
   and old Floor 6/7 recordings are preserved.
6. **Player-facing pacing:** ten shop days are not merely bookkeeping.
   Visible world, hero and merchant progression creates future goals.
7. **Regression and performance:** shop stocking, navigation, checkout,
   credit, mining/blueprints, day closure, browser viewers, saved data and
   the existing Troll presentation still function. Lean CI remains lean;
   use focused tests plus human visual review.

## Deferred / explicitly undecided

- Full always-running 24-hour concurrent simulation; exact phase triggers.
- Full 100-floor content, many more items/classes/abilities, new economy
  systems or automatic party commands.
- Final Floor 10 Cave Troll placement, exact portal magic/art, standby reentry
  checkpoint/HP recovery and future redesign of the *temporary* Floor 10 pass.
- Galvik curse transfer, new protagonist, basement forge/pond and wider lore.
- Full reuse of Tripo for every monster/hero; visual trial still needs review.

## Development discipline

Use current GitHub `main` as truth: inspect open PRs, [Game Bible](GAME_BIBLE.md),
[Architecture](ARCHITECTURE.md), [UI contract](UI_DESIGN_SYSTEM.md),
[The Living Dungeon spec](THE_LIVING_DUNGEON.md), [AGENTS](../AGENTS.md),
then actual modules/tests. Develop complete vertical behavior, not a pile of
unconnected framework PRs. Update living docs *with* shipped features, mark
only verified work CURRENT, and keep plans separate from release claims.
**Leave feature PRs unmerged unless the owner authorizes merging.**
