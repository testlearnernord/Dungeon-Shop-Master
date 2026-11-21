# V.004 LIVE Dungeon · Map Readability and Autonomy

## Current integration order

1. **PR #261**: Camera and LIVE floor map. Correct W/S, two-button drag
   orbit/tilt, focus zoom, a modern compact spectator HUD, Ghoul icon
   portraits, source-derived counts, hover tooltips and up to two preview
   route arrows. The same saved scene and the opt-in combat arena remain.
2. **PR #262**: One real spatial move every **200 world ticks
   (10 unpaused real seconds)**, down from 600 ticks (30 seconds).
   No simulation runs in the rendering frame loop. Bedtime processes all
   committed clock events; the page viewer remains read-only.
3. The saved AI can now select `loot-chest` or `hunt-ghouls`, preferring
   a personally visited or immediately adjacent unresolved site. Greedy
   adventurers prioritize a chest; equipped or brave heroes may pursue a
   known active Ghoul. Goals commit only on real world-clock steps and the
   existing spatial resolver still owns every connected tile, combat and
   reward. Path overlays are short, explicitly *forecast* intentions and
   never authorize a movement outcome.
4. **PR #264** (this branch): Real dungeon resources are rolled by the
   existing authoritative site resolution. Each concrete item is owned by
   exactly one surviving adventurer: equipment can be worn directly; spare
   materials, herbs and gear remain in an individual saved `inventory.finds`
   collection. No floor spectator, replay or UI performs an item roll.
5. The existing shop can buy **one specific owned item** from an eligible
   adventurer who has physically returned to Galvik's shop. The same atomic
   transaction deducts Galvik's money, credits the hero, transfers one unit
   into the capacity-limited shop bag, and emits a uniquely identified
   `hero-buyback` receipt with an **expense**, never sales revenue. The
   merchant ledger shows those purchases separately from customer sales.
   Equipment automatically retained in a hero's active weapon/armor slot
   is not an optional sellable item in this initial scope.

## Performance / world safeguards

- Maximum one genuine tile per ten seconds per active solo/party; no
  per-frame AI, fake animation checkpoints, resimulated combat or camera
  authority over gameplay.
- Keep the battle's original 60Hz fighter frames and 0.5s clock event
  cadence; the abstract map displays only markers.
- Existing campaigns with pending 600-tick events may need an explicit
  migration before this scheduling change is deployed; the strict save
  validator will not silently accept inconsistent timers.
- Verify deterministic watched vs unwatched expedition outcomes, 3D map
  performance, real hero knowledge, and shop/dungeon clock parity.

## Loot and buyback invariants

- Site loot uses the dungeon seed, floor, feature ID and resolved generation.
  Opening an already resolved chest or rewatching a recorded battle never
  grants another item or changes ownership.
- One physical item is assigned to one living adventurer. Temporary-party
  shares are deterministic; neither a replay nor the buyback dialog copies
  inventory.
- No passive transfer from `inventory.finds` into Galvik's bag occurs.
  A buyback requires an eligible shop visitor, enough available gold,
  remaining bag capacity, and an actual click. A failed purchase does not
  mutate the store.
- `hero-buyback.cost` represents merchant expenditure and must match
  the authoritative item price. The sales revenue and nightly checkout
  receipts remain separate. Exact quantities, hero balances, expenses,
  item IDs and receipt IDs survive strict save/reload validation.
- Unit coverage exercises full/empty inventory, gold constraints,
  deterministic loot assignment, no replay duplication, ledger visibility
  and serialization. Full browser UI regression remains available manually.

## Regression fixtures for the 200-tick cadence

- A running boss or Ghoul battle must be observed just after the **first**
  scheduled spatial event, with one further `LIVE_COMBAT_INTERVAL_TICKS`
  event when recorded frames are required. Advancing a fixed 600 ticks can
  legitimately finish an encounter before the browser attempts to watch it.
- The browser save/reload smoke checks that the next committed movement
  advances beyond the previously persisted `lastStepTick`. It must never
  assert an obsolete absolute 600-tick boundary.
- Keep unit tests for one-tile movement, saved hero knowledge, encounter
  reservation, combat continuity and single-owner rewards in the mandatory
  suite. Use optional full browser regression for the cinematic and
  multi-Ghoul presentation journeys.
