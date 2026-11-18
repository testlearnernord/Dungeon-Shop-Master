# Dungeon Shop Master — Development Roadmap

> **Reviewed 2026-11-18 · next release target: V.0003 ALPHA —
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
- Persistent hero identities/HP/equipment, but **three separate dungeon
  paths**: a simple day-resolution of Floors 1–4; individually authorized
  Floor 6 Cave Troll combat; and shared seeded Floor 7 exploration with
  spatial group encounters and saved replays.
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
  seeded rooms/feature resolution, per-hero locations and group membership,
  stable intents, real gear/supplies and event IDs.
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

- Replace Floors 1–4's damage/progress coin-flip with actual reachable
  travel and persistent shared features. Reuse current Floor 7 map,
  level/room routing, encounters and group combat without parallel engines.
- Distinguish character **level/XP** from actual current **dungeon floor**.
  Heroes may progress, farm renewable opportunities, discover, fight,
  flee, recover, group and shop based on real state and temperament.
- Keep rooms/unique encounters persistent; avoid duplicated treasure,
  infinitely safe farming, softlocked progression and arbitrary HP deaths.
- Validate seeded multi-hero shared-world behavior across several days;
  a deep hero does not teleport to Floor 4 just because evening arrived.

### P2 — Meaningful real merchandise and combat

- The first six stock items are the starting scope. Healing Herb (+18 HP)
  and Waybread (+8 HP) remain HP consumables, never hunger.
- A sword affects recorded attacks; a vest affects damage/traps; a healing
  use consumes an actual unit. Mana Potion gets a specified resource/ability
  loop before being treated as valuable; iron ore gets a defined downstream
  demand/use later rather than fake utility.
- Shared group combat becomes the common authority for regular encounters.
  Boss-specific mechanics (Cave Troll), graphics and SFX plug into it without
  second sources of truth or replay replacement.
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
- Investigate limited deeper shop access points to the *same physical shop*;
  exact layout, transport cost and lore remain open. Avoid instant free
  healing after every room.
- Make the player notice genuinely changing dungeon routes, customer
  behavior, supplies and commerce; prioritize legibility over more HUD.
- Perform seeded economy/fight tests and genuine shop-to-dungeon browser
  playthroughs. Measure ten days for dead periods, exploit farming,
  unfinished sales, hopeless early parties and save/replay discrepancies.

## V.0003 ALPHA release gates

1. **Real visible causality:** at least one real bought item measurably
   changes recorded HP/damage/ability, without fabricated post-hoc bonuses.
2. **Readable status at the physical board:** exact/known HP and equipment
   (including missing gear), actual item icons/counts, floor and intent;
   recorded three daily phases; expanded depth/hero view.
3. **One authoritative expedition world:** heroes share persistent seeded
   floors and unique resolved events; character levels progress separately;
   groups/retreats and travel have deterministic outcomes.
4. **No replay or economic lies:** before/after save and ledger produce
   identical committed events; missing heroes do not reveal a secret death,
   and old Floor 6/7 recordings are preserved.
5. **Player-facing pacing:** ten shop days are not merely bookkeeping.
   Visible world, hero and merchant progression creates future goals.
6. **Regression and performance:** shop stocking, navigation, checkout,
   credit, mining/blueprints, day closure, browser viewers, saved data and
   the existing Troll presentation still function. Lean CI remains lean;
   use focused tests plus human visual review.

## Deferred / explicitly undecided

- Full always-running 24-hour concurrent simulation; exact phase triggers.
- Full 100-floor content, many more items/classes/abilities, new economy
  systems or automatic party commands.
- Guaranteed Floor 10 boss placement and magical shop access details.
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
