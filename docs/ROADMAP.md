# Dungeon Shop Master — Development Roadmap

> **Reviewed 2026-11-18 · next release target: V.003 ALPHA —
> The Living Dungeon (DESIGN APPROVED, NOT YET SHIPPED).**
> Source, tests and merged PRs define what is actually playable. Do not
> promote this target to the in-game version label before acceptance.
> The working design specification is
> [THE_LIVING_DUNGEON.md](THE_LIVING_DUNGEON.md).
> Future PR numbers are **not reserved**.

## Current foundation (playable V.002 ALPHA)

- A physical, movable-fixture Floor 5 shop: compact four-slot shelves,
  real stock and carts, staffed register, credit/debt, customer paths,
  special requests, excavation, furniture and persistently saved days.
- Persistent hero identities/HP/equipment. **Floors 1–4 and 7 now
  share** one seeded map-exploration, regeneration, group-combat and replay
  implementation; the old 1–4 damage/progress day-roll module is deleted.
  The individually authorized Floor 6 Cave Troll remains a separate
  combat/progression authority pending consolidation.
- A physical placeable Adventurer Board and expanded E/R roster with HP,
  item icons, hero identity and known status, **without** a saved three-phase
  daily itinerary, unified floor/intent projection or depth visualization.
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

### P0 — Contracts, migration plan and first end-to-end example

- Define one authoritative dungeon-world/hero-expedition schema with shared
  seeded rooms/feature resolution, per-hero locations, group membership,
  **short-term direction (stay/up/down)**, **medium-term goal** (farm,
  gear test, explore, progress, cautious retreat), personal depth and
  remembered encounters, **cursed special-floor shop instance**, one portal,
  **two-day off-duty status after shop exit**, real gear/supplies and event IDs.
  Level 10 requires **individual Galvik-granted access**, separate from
  character XP and the existing live Floor 6 permit.
- Define a **Morning / Midday / Evening** phase ledger and a distinction
  between *world truth* and *Galvik's observed knowledge*. Determine actual
  day-clock commit points without retroactive leaks, frame dependence or
  phantom simulated activity when the viewer opens.
- Define compatibility/migration for existing `SIMULATION_VERSION = 13` and
  recorded Floor 6/7 fights **before** changing save fields. Neither
  historical replays nor old outcomes can be silently recalculated.
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

**Still next:** consolidate the distinct movement, skill/ability
and target-selection step loops into a **single group-capable
encounter authority** with configurable boss abilities, preserving
existing old v1 boss footage and exact presentational timings.
Do not mistake a shared damage library for completed combat
engine unification.



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

### P3 — Adventurer Board 2.0

- Preserve the **physical wall board**, movement/placement, and **E/R**
  access. Upgrade it to a readable three-phase visual timeline showing each
  hero's Morning / Midday / Evening floor and actual or intended activity
  (farming, progressing, discovering, fighting, fleeing, recovering,
  grouping, shopping or last known/unknown).
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
   recorded three daily phases; expanded depth/hero view.
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
