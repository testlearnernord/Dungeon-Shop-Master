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

## PR #265 · LIVE hero locator and concrete loot inspection

- The LIVE floor toolbar lists **only the actual committed heroes on that floor**,
  ordered by name and stable ID, with level, role and the genuine in-combat flag.
  Selecting a hero focuses their committed tile and opens the existing personal
  fog-of-war / inspector state. The empty choice returns to the whole-floor view.
- A focus change now preserves the player's current Babylon map yaw, pitch
  and zoom, instead of forcing a new overhead camera preset. This also works
  when the hero's animated model is hidden during an abstract live fight.
- The hero details now display the actual saved `inventory.finds` item names
  and quantities. Abstract `inventory.loot` tokens are deliberately shown
  separately; no speculative inventory or shop-owned merchandise is implied.
- The locator is absent during archived recordings, standalone Board hero
  modes and arena playback. Opening it never commits a world event, rolls loot,
  orders heroes or alters the active battle.
- Browser regression locates a real saved hero, verifies the Babylon camera
  target/orbit and known physical finds, then proves the campaign snapshot is
  unchanged. Separate fast unit tests cover stable options and item labels.

## PR #266 · LIVE encounter locator

- The LIVE floor toolbar offers an active-encounter selector only when that
  floor actually has saved ongoing fights. Labels include real hero counts,
  real Ghoul counts and authoritative tile coordinates from the one shared
  combat state. No speculative encounter is listed.
- Selecting a fight clears hero-specific fog, focuses the exact fight site
  without discarding the existing camera orbit/zoom and marks that fight as
  the next target for the existing **Watch LIVE fight** arena button.
- Once a fight finishes or the user changes to archived footage, the option
  disappears. Selection never advances the world clock, rolls AI, changes HP,
  creates rewards or launches the 3D stage on its own.
- Unit and genuine browser coverage assert real rosters, focused Babylon
  camera coordinates and an unchanged persisted 60Hz battle before arena opt-in.

## PR #268 · Combat-only LIVE map redraw elimination

- The full-floor observer now distinguishes **actual floor-scene changes**
  (hero coordinates, equipment, party, intent, explored cells, site
  resolutions, active-fight beacons) from **combat-only checkpoints**
  (HP, 60-Hz actor frames, gold and monotonically advancing clock time).
- On combat-only updates the current saved floor frame and hero HP metadata
  are refreshed, but static Babylon tiles, props/lights, route arrows, fog
  and the 2D minimap are left untouched. The opt-in arena and its current
  combat frame remain live and authoritative.
- Hero selection changes and real movement still perform the complete
  personal visibility and preview redraw. Repeated identical selection
  no longer paints the same minimap twice.
- Pure tests prove all invalidating spatial changes are recognized;
  the existing curated LIVE arena browser smoke instruments the actual
  2D minimap and asserts that advancing a genuine combat world-clock event
  produces no redundant floor-map draw calls.
- This is a **CPU-side render-work reduction**, not a measured end-user
  FPS claim; runtime benchmarks and the manual full browser pass remain
  available for acceptance.

## PR #269 · Interactive LIVE minimap and knowledge-safe camera navigation

- The existing actual dungeon minimap is now a camera navigation surface:
  **click a drawn tile** or focus the minimap and use the **arrow keys**.
  CSS scaling and canvas backing resolution are handled separately; clicks
  outside the painted map are rejected.
- Camera navigation changes only the Babylon target x/z, preserving current
  orbit yaw, pitch and zoom. It clears auto-follow so the user can inspect
  the target instead of being snapped back to a tracked hero.
- With a specific hero selected, the map respects **only that hero's
  personally explored/currently visible cells**. An attempted jump into
  black/unexplored fog is ignored; no world knowledge is gained, and no
  movement or AI command is issued. The unselected floor overview retains
  the deliberately omniscient observer map.
- The minimap is keyboard-focusable only in the actual LIVE floor observer,
  not in replay/preview or an opted-in 3D fight.
- Pure unit tests cover scaled hit-testing, bounds and personal knowledge.
  Existing mandatory browser smoke verifies real saved explored/unexplored
  targets, preserved Babylon camera offset and unchanged saved GameState.

## PR #271 · Purchased dungeon minerals into future-forge reserve

- **Coal and Iron Ore are not merchandise.** Only real returning
  adventurers may offer these recovered minerals for money; they are excluded
  from wholesale, shelf restocking, merchant bag consumption/discarding and
  all five stocking hotbar positions.
- A paid `hero-buyback` now moves one owned ore/coal unit directly into
  `shopEconomy.materialStorage`. It still transfers the exact amount of gold,
  decrements the adventurer's individual saved find and records an expense.
  Bag fullness cannot block material purchases, but lack of gold still can.
- The workshop reserve is persisted and visible in the buyback panel and
  management information. **No working forge/crafting gameplay is implied.**
- Campaign format **v26** strictly validates mineral storage. Existing valid
  **v25** campaigns automatically move exact ore/coal quantities from both
  the bag and previously stocked shelf slots into the saved reserve without
  minting or destroying goods. Current purchase events and all other
  world/hero fields remain intact. Versions earlier than v25 are not migrated.
- Unit tests cover conservation, full-bag raw purchases, storage limits,
  corrupt-save rejection and deterministic v25->v26 migration; the mandatory
  buyback browser smoke checks actual saved reserve accounting and the
  five-good hotbar.

## PR #272 · HUD layout and explicit Adventurer Board visibility

- The LIVE floor overview and Temporary Parties panel use a **single
  vertical left information rail**. Their cards cannot use competing
  fixed top-left offsets, and their parent is scroll-bounded on small screens.
  Archive party cards remain independently visible when floor overview
  is hidden.
- The deliberately opened Adventurer Board (R or the physical wall board)
  now displays actual saved hero names, level, floor, status, current HP,
  gold, equipment, traits and recovered goods, including remote explorers.
  These are explicitly labeled LIVE data and trigger no world actions.
- The passive shop HUD's last-confirmed reports and magical death signals
  still use the separate knowledge-limited selector. No sealed combat
  replay details are invented.
- Required floor browser smoke checks DOM bounding boxes for overview and
  genuine saved Temporary Party, and verifies unmasked remote hero data.

## PR #273 · One global world-event feed (no duplicate death alarm)

- The old persistent top-right death alert is retired. The new singleton
  World Echoes layer lives outside the shop, dungeon and combat HUD trees
  and is visible across all three contexts.
- Projections read only **committed WorldEvent records** and the existing
  authoritative active 60-Hz combat registry. Prior/current fight IDs,
  rather than per-frame HP differences, generate one combat-start notice.
  The source of a magical death notice is the same committed
  hero-death-signal as before; causes and coordinates remain undisclosed
  by the warning. No second dungeon, AI or combat motor is created.
- Important events include committed deaths, first boss engagement,
  ordinary combat start, distinct Temporary Party formation and optional
  treasure/visitor arrivals. Multiple join records for the same party
  coalesce to one notification.
- A small toast occupies the bottom-left notification lane, never the
  right minimap/hero panel or left party/status rail. At most **two**
  toasts are visible; they expire after **5, 7 or 10 seconds**, are
  dismissible, and pause while hovered or keyboard-focused.
- A small **World Echoes · Settings** control selects critical-only,
  important (default) or detailed notifications, plus duration.
  These are local UI settings, not GameState events or hidden simulation.
- Clicking a live fight opens **that exact fight's** existing opt-in
  arena. Hero/party notices focus the saved live hero; boss notices
  observe the running Cave Troll. A death opens the fallen hero on the
  explicit Adventurer Board, not a made-up view of the cause of death.
  An expired fight is shown as unavailable, never replayed as live.
- A legitimate death signal on loading the current day can still issue
  one critical notice, preserving the old UI's recovery semantics without
  resurrecting its separate alarm component.
- Unit and real Chromium smoke tests verify suppression of historical
  events and repeated combat frames, party de-duplication, magical death
  privacy, exact navigation and only a single death popup.

## PR #274 · Cardinal north-up dungeon camera

- The ordinary LIVE/recorded dungeon **map** has a permanent north-up
  heading (world +Z is north). W always pans to +Z, S to -Z, A to -X
  and D to +X, irrespective of old camera poses, focus, minimap jumps
  or player mouse movement. This does NOT constrain the opt-in cinematic
  fight camera or the independent Developer Combat Lab.
- Horizontal left/right drag now **slides** the map; vertical drag still
  **tilts** with the existing pitch limits. Mouse wheel zoom, Q/E and
  Tab focus continue working. Map yaw is always normalized to north.
- A small **N ↑ NORTH-UP** marker lives alongside the minimap, and both
  toolbar and help copy reflect the actual cardinal controls.
- Pure tests cover imported old yaw, direction clamps and drag lock;
  mandatory real Babylon browser smoke verifies W moves north after
  mouse-dragging and that the N marker is visible.

## PR #276 · Real overview props and shared static Ghoul presentation

- Every seeded treasure site now has a visibly wooden **3D chest** with
  raised lid, brass bands and lock plate. Trap sites show an actual metal
  pressure plate with **five visible spikes**, not a red square/diamond.
  These are Babylon presentation children of the **same existing feature
  roots**: existing saved resolved feature IDs, hero fog and tooltip
  pick identity are not duplicated or overridden.
- Ordinary Ghoul spawn sites initially retain their illustrated fallback
  while the build-generated **authored Tripo Ghoul GLB** is loaded exactly
  once per Babylon floor. The same real render geometry is then shared
  through static scene instances at each seeded spawn tile. No Ghoul
  combat AI, animation groups, 60-Hz fighter stepping or second model load
  per spawn is initiated in the overview.
- A load failure leaves the illustrated fallback visible and records
  the actual error on the marker. The required LIVE floor browser test
  insists on a successful authored 3D model load, all chest lids/bands,
  five spikes per trap, and zero leftover icon fallbacks.
- The optional 3D fight arena remains the only home of the full
  **animated** skinned monster performances; floor models are static
  read-only landmarks tied to true saved dungeon sites.

## PR #277 · Restore player free-orbit and true-north compass

- LIVE dungeon maps support complete 360° mouse orbit (both mouse buttons)
  and pitch/zoom again. North is the fixed WORLD +Z direction, not a locked
  camera heading. The compass needle rotates correctly as the camera orbits.
- Clicking the compass faces the camera north without losing zoom or
  location; R / Reset view restores north, comfortable pitch and zoom.
- WASD is camera-relative (W toward the top of the current view); the
  underlying world remains fixed while the camera rotates.
- No change to world clock, monster AI, combat camera or archived events.

## PR #278 · Actual dungeon entrance and staircase landmarks

- Floor navigation markers use the **same seeded source tiles** as the
  authoritative expedition motor: layout.entrance for return/ascend, and
  dungeonDownStair(layout) for the far connected descent landing.
- Each supported floor 1–4 and 7 displays a 3D stone stair with a lit
  arch, consistent world/map location, minimap color, read-only hover
  target and a camera landmark.
- Only floors 1, 2 and 3 claim a real lower transition. Floors 4 and 7
  explicitly show the further stone passage as **SEALED** because there
  is not yet an active climb-down implementation for that link.
- All stair geometry reuses the existing marker visibility/fog pipeline,
  so personal fog cannot expose unseen stairs and archive replays do
  not materialize new visits. Pure unit and real Babylon smoke assert
  deterministic coordinates and real rendered 3D steps.

## PR #279 · Exact party loot, trap injuries, stair travel in global Echoes

- The existing World Echoes renderer remains the ONLY notification system.
  New categories are **Chest loot**, **Traps**, and **Ascend / descend**.
  The category controls are independent checkboxes plus existing importance
  presets (Minimal / Standard / Detailed), persisted as local UI preferences.
- One newly committed chest/trap per co-located saved party and world tick
  creates **one** message, listing member names. Chest contents are derived
  from each recipient's actual saved inventory.finds, newly equipped gear
  and gained gold; trap damage is derived from each member's actual saved
  health change. No second loot roll, magic remote survey or fake party HP.
- A hero/party route intention **does not** notify a stair crossing.
  Only a changed, committed saved floor number plus the recorded directional
  floor action does.
- Echoes for these events keep the exact, committed dungeon site **x/z/floor**
  camera target. One click opens the existing LIVE map on that precise tile,
  rather than following a hero who has already continued moving.
- Source data remains the same save-valid strict WorldEvent structure and
  true per-hero world snapshots. No save schema upgrade and no duplicated
  event authority.
