# Dungeon Shop Master · One Living World Clock

> **Current implementation summary (21 November 2026, through PR #266):** the shared 50-ms world clock, **200-tick (10-second) connected dungeon moves**, 60-Hz real combat, physical returns/off-duty days, concrete dungeon loot/buyback and opt-in LIVE hero/fight spectator already exist. Older “design only / future PR” notes below are historical. Use [Architecture](ARCHITECTURE.md) and [Roadmap](ROADMAP.md) for current status; retain this document as the detailed time/ordering contract.


### PR #213 physical shop rotation (merged)

- Physical shopper crossing is authoritative: `NpcVisualSystem` removes the outer-gate actor, `shopTraffic` persists its cleared checkpoint, and only then `GameStore.completePhysicalShopExit` books one ticked `shop-departure` event.
- `at-shop` -> `departing` starts an actual pedestrian walk; manual checkout, unsatisfied walkout and sleeping alone **do not** start cooldown. After observed exit on day D, the hero is absent from both shop and dungeon for complete days D+1 and D+2; earliest reentry is D+3.
- Reentry uses the seeded safe known entrance, retains discovered routes, HP, equipment, supplies and true committed site generations; no free healing, RNG or second simulation. The old individually granted Level-6/7 boss permit is temporarily honored **only after** the required off-duty days.
- The night book now has only **The Reckoning** and **Goods & Receipts**; LIVE Board and the bounded Expedition Timeline replace duplicate nightly hero/replay pages. Old four-page session indices are safely reset.
- Current `SIMULATION_VERSION = 25` snapshots validate actual statuses, `offDutyUntilDay`, scheduled movement and real clock-stamped departures. Older Alpha saves are not automatically migrated.
- **NOT SHIPPED V.003:** cursed special-floor single physical portal, Floor-10 permit, deeper progression, unified boss fight architecture and integrated performance acceptance are still open.

> **Approved design; PR #201–211 merged, #212 bounded highlight timeline in progress · 2026-11-19.**
> Supersedes the former fixed **Morning / Midday / Evening simulation phase**
> requirement in `THE_LIVING_DUNGEON.md`, `ROADMAP.md` and Board 2.0 designs.
> This document defines the intended **hybrid world clock** and its acceptance
> criteria; it does **not** claim the currently shipped V.002 build runs a live
> dungeon. Current source and tests determine what is implemented.

## Locked decision

**The dungeon progresses alongside actual shop operation using one deterministic
in-game clock, while the player retains control over pacing.** Bedtime remains
a meaningful, intentional day boundary and read-only expedition review, NOT
the only moment the dungeon is simulated.

This is neither a second-by-second always-online MMO nor the old entire-day
`advanceDay()` batch disguised as a live clock. The underlying world
progresses by ordered, saved events on a shared simulated timeline. There are
**no mandatory Morning/Midday/Evening engine phases or three required snapshots**.
The world clock may still present dawn/afternoon/night as atmosphere, but
those words confer no special simulation authority.

### Why this wins over the alternatives

| Design | Core problem |
| --- | --- |
| Dungeon advances only when Galvik sleeps | Shop stock and service cannot react to an expedition returning the same playable day; passive second game |
| Unpaused, unbounded realtime dungeon | AFK/menu/poor FPS punish the player; shop service and exploration compete for attention; background tab and browser closure change outcomes |
| Three arbitrary day phases | More save states, spoilers and UI structure with little additional agency; encourages fake activity per phase |
| **One paced shared event clock (chosen)** | Same-day causal feedback and meaningful merchant responses, without forcing Galvik to supervise remote fights |

## Time contract: a single source of truth

- Persist a monotonically increasing **world time** (integer game ticks / game
  minute index, plus day index), a deterministic ordered event queue or
  next-due-event representation, source seeds/counters and explicitly
  committed actions. PR #203's current implementation uses 20 world ticks
  per game minute (50 real ms/tick), or 28,800 ticks/day, retaining the
  prior 24-minute foreground day. These are tuning values, not story canon.
- Shop customer activity, patience/request countdowns, queue, arrivals,
  hero travel, dungeon movement, site regeneration and temporary group
  decisions all consume that **same simulated clock**. Do not mix
  `Date.now()`/`performance.now()` with game-critical shop deadlines while
  the dungeon uses saved game minutes. Animation tweening may be visual-only.
- Gameplay progresses in bounded deterministic **event/time slices** while
  the player actively runs the physical shop. Use the existing shared
  expedition and encounter authority; offscreen 60 Hz combats can resolve
  in deterministic bursts when their scheduled contact becomes due and save
  real combat frames. **Do not run every enemy at 60 Hz every rendered frame**,
  add a second combat engine or derive world events from camera FPS.
- Events at the same game timestamp have a stable, explicit ordering:
  player-owned shop transactions and supply updates, accepted physical
  arrivals/departures, expedition movement/encounters, site availability,
  and world/observer reports according to a defined priority contract.
  Choosing this ordering in implementation requires tests. In particular,
  an item cannot appear in a hero's inventory before a real paid or
  credited handover and a single monster site cannot reward two parties.
- Every committed world mutation has a unique saved identity and timestamp.
  It must not be re-applied on UI open, replay playback, pause, sleeping,
  save/reload or restoring a tab. Same seed + same timed player actions
  + same prior save => same committed world state, events and recordings.
- Render stalls may slow presentation and game-time advancement, but must
  not **drop** scheduled world events, jump due to system clock changes or
  create unbounded catch-up processing that freezes the shop. No offline
  simulation: closing the app does not kill heroes or generate sales.

## Player pacing and safety

- While actively moving/serving/restocking, the in-game clock advances at
  one **playtested, gently paced** rate. Do not yet promise specific real
  minutes per day or an accelerated simulation speed.
- **Pause world time** during expanded roster/board, ledger/replay inspection,
  settings, long building/design interfaces and when the tab is hidden.
  Offer an explicit pause for interruptions. During pause no shop timers
  expire, no NPC traffic progresses, no dungeon encounter resolves and
  no hidden world events fire. Pure read-only observation stays possible.
  Any pause-time edits need normal valid commit semantics; transactions
  cannot be freely executed at frozen time as an exploit.
- AFK handling must be deliberate: automatic pause after inactivity is an
  acceptable protective mechanism, but it must not fire during normal
  keyboard/mouse interaction or intentionally passive customer watching.
  The threshold and controls are subject to playtesting.
- There is a finite **shop service window**, without an oppressive forced
  real-time closing deadline. After service hours, stop spawning buyers,
  permit legitimate current customer completion and let Galvik prepare.
  The world must not advance indefinitely because the player spends an
  hour adjusting furniture. Closing the day is always an intentional bed
  interaction. The physical cursed clock should read this saved world time.
- **Early bedtime:** skip the remaining unsupervised time deterministically
  until the next legitimate morning, including finite autonomous dungeon
  consequences, but **never auto-sell** stock, invent checkout, restock,
  replenish HP/gold or let customers buy from a closed shop. Customers who
  miss the service window must follow a physically meaningful departure,
  wait or new-day arrival rule. Skipping the shop must have a natural
  opportunity cost, not a contrived stamina or hunger tax.
- **Late bedtime:** the post-service shop remains safe for closing tasks,
  and time cannot be farmed indefinitely by standing idle. No automatic
  rollover/repeated settlement. Any night skip uses the same simulation
  events as normal advancement; it does not re-run already resolved hours.
- Shop actions affect a remote hero **only via actual causal channels**:
  they can buy a newly stocked sword/Herb on a subsequent physical visit,
  receive approved credit, or miss the offer. Galvik cannot remotely heal,
  teleport or command the hero, and the simulation cannot retroactively
  apply today's purchases to yesterday's fight.

## What the player actually learns

- Maintain an authoritative **world truth** and a separate **Galvik-known /
  last-reported** timeline. A live update can announce a verified
  Temporary Party formation, an approaching shop visitor or another
  permissible report, but must not disclose unseen map secrets, remote
  deaths or a sealed fight's ending.
- The physical Adventurer Board and extended R roster read the **same
  known-state projection**. Each character may have their last confirmed
  position, goal, gear and timestamp/recency; stale or missing contact is
  visibly labelled rather than inferred. No obligatory three columns.
- A wall-mounted magical clock displays this one world time and optional
  atmospheric dawn/dusk cues. It is **feedback**, not a separate phase
  machine, hard failure timer or extra shop-time authority.
- A dungeon replay has two distinct coordinates:
  **(1) the saved world-time position of its events** and
  **(2) its local compact viewing timeline and actual combat frames**.
  One adventure can span hours and multiple shop days while its actual
  viewable movement and fights take only seconds/minutes. Label them
  correctly; do not pad footage, rerun fights or equate replay seconds
  with the merchant's physical wall clock.
- Replays should support event bookmarks and jump-to-fight/loot/departure/
  Temporary Party changes and remain fully watchable. Sleep/day report is
  the natural review moment; optional earlier viewing of **already
  committed, legally observable** recordings may exist, with the shared
  clock paused. No UI opening advances world time.
- The bed closes one service day, finalizes exactly-once unsettled
  physical transactions, completes/saves the legitimate overnight
  advance and opens a read-only report. Starting the following shop day
  occurs once through a deliberate confirmation. No extra settlement or
  world random roll from watching video.

## PR #211 live spectator boundary

The LIVE viewer is an opt-in presentation of the selected hero's actual
spatial checkpoint, visited tiles, and precommitted 60Hz encounter frames.
It reads the SAME world clock and dungeon engine. It never creates a second
combat result, advances RNG, or writes to the save. Galvik's passive Board
continues to show only verified signals, not the watched hero's hidden stats.
While LIVE, shop traffic and all real world events continue normally; historical
replay/development inspection pauses the clock. The day still closes only at bed.

## PR #212 owner-revised rolling replay contract

The default timeline displays TODAY and only TWO earlier completed game
days. A player can explicitly save an individual committed replay, up to
12 per campaign, and later remove the pin. The larger combat/movement frame
arrays expire at the next overnight window boundary unless saved; small
authentic history events remain so death/party/shop knowledge stays intact.
No thousands-of-replays library, no video footage invented for a party
join, loot discovery or an unrecorded fight. On-demand bookmarks seek the
existing immutable local replay timeline, **not** world time. The listener
cannot reveal hidden combat detail through the passive Adventurer Board.

FPS is a separate quality gate: pause expensive Babylon rendering during
the register dialog; grade against the last visible needle to avoid skipped
success zones on low-FPS systems. LIVE observer projections are refreshed
on committed state changes rather than every rendered frame.

## PR #214 deterministic acceptance and rendering boundaries

The live loop now has a seeded ten-day regression covering actual legal
purchase and credit transfers, their physical exit contract, two full
absent days, independent hero/death/party outcomes and one pinned original
60Hz fight recording. Each morning reloads through the strict v24 save
parser and must match uninterrupted progression byte-for-byte in gameplay
state. The browser also advances ten real live store days and checks
persistent IndexedDB state and a three-day bounded timeline.

The old Level-6 progress HUD previously rescanned the **entire** immutable
`events` array and rebuilt all its DOM entries on EVERY 50ms world/traffic
checkpoint, even when no combat report changed. Its subscriber now compares
saved `events` and `dungeonFloors` references, while an explicit historical
replay-disclosure event can still redraw it. Credit customers must
physically walk through the saved outer gate before becoming off-duty,
not teleport out of the store on loan approval.

The Browser RAF sample prints median/p95/worst animation-frame intervals in
CI and verifies Babylon's render frame is static during the DOM cashier.
These measurements use a virtualized test runner, NOT the player's PC,
and impose no deceptive GPU-independent FPS guarantees. A real player
benchmark and the full V.003 visual quality gate remain open.

## PR #215: measured overhead versus browser frame pacing

The original PR #203 introduced a 50ms authoritative shared simulation
step; #204 added persisted full NPC traffic for exact reloads. A 50ms
authoritative motor must NOT force 20-FPS pedestrian movement on a faster
display: each draw may temporarily blend between the previous and last
saved NPC transforms using the carry fraction from the existing
`WorldClockPacer`. `NpcVisualSystem.renderInterpolated` restores the
physical roots synchronously; snapshots, collision/pathfinding and saves
continue seeing only tick-committed positions. The motor
still runs each 50ms tick in strict order and persists a matching traffic
checkpoint. The new optimization removes **only** an unnecessary whole-JSON
comparison when the physical shop step is already known to have committed.
Unrelated store changes keep the no-op comparison and all strict validators.

The same latest snapshot that was successfully saved and strictly checked
is now trusted by identity for backup rotation; changed/unrecognized bytes
are still fully validated. No delayed/sampled shop simulation, separate
clock, changed autosave interval or skipped game event is introduced.

The virtual CI sample ran 60 requestAnimationFrames with the SAME scene
first world-clock paused and then active. Median frame gap was 50ms in
both modes; in the active sample 63 scheduled ticks used about 11ms
combined main-thread work. This distinguishes avoidable CPU work from
unexplained virtual-browser frame pacing. Real device F3 diagnostics are
required before making player-FPS claims.

## Migration constraints from current source

**CURRENT at decision time:** `src/game/gameState.ts::advanceDay`
advances all ordinary dungeon expeditions in one day transition;
`src/game/gameStore.ts::endDay` invokes that transition;
`src/dayHud.ts` invokes it via the bed controller and then opens the
day report. The actual shop has live physical customers and service
interactions, and replay viewing already reads immutable committed
recordings. PR #201 introduces the persisted tick, deterministic future event
scheduler, foreground pacing and strict version-14 save break. The existing
`advanceDay()` still computes dungeon expeditions at bedtime; physical
restock/credit request deadlines and expiry walkouts are migrated in
PR #202 to saved future `visitor` events with strict version-15
schema validation. The old automatic bedtime sale and unpaid-cart
settlement paths have been removed; bed now returns unpaid physical
reservations to their shelves and never mints merchant gold. PR #203 moves Babylon-driven physical customer locomotion, shopping,
queue waiting and pickup checks onto fixed committed 50ms world ticks.
`scene.render()` now observes rather than advancing customer decisions.
PR #204 introduces a validated saved checkpoint for actual NPC positions,
routes, waits, service claims, shelf ownership, gate heights and stable
iteration order, written alongside the same tick and hydrated into the
single existing actor motor on reload. It neither replays physical pickups
nor introduces a second authoritative customer AI. PR #205 extracts bounded `advanceSpatialDungeonPartyStep` from the
  shared dungeon resolver. PR #206 enables one future dungeon event on
  the SAME saved timeline in real browser gameplay, every 600 ticks.
  Each due event advances real shared party positions and applies
  actual site outcomes to the campaign. The day-end path processes all
  remaining real events and cannot rerun a separate day dungeon batch.
  Version-18 saves validate the next due movement and per-hero step.
  PR #207 integrates ordinary Floors 1–4/7 group combat without a second
  engine: a monster arrival reserves the true site, and the existing 60Hz
  actor motor advances 30 fixed steps per due half-second event. Version-19
  saves retain intermediate fighter phases, projectiles, consumed resources,
  original gear and immutable capture frames with an exact next combat due
  tick. The monster site and finite rewards settle only at combat termination;
  recording views cannot trigger game simulation. The unique Level-6
  Troll duel remains an atomic legacy special encounter for a later
  integration, not a second newly authored motor. PR #208 adds real
  homeward traversal over visited tiles using the SAME spatial encounter
  authority. Only reaching a seeded floor entrance schedules one 20-tick
  portal event; its committed result creates an actual mid-day shop visitor
  handled by the existing physical NPC traffic system. Strict v20 saves
  preserve return intent and the uniquely owned crossing event through
  save/reload and bedtime. PR #209 adds v21 individual
  `liveDungeon.plans` (goal, action, source floor and committed tick)
  from the existing hero decision policy and optional group negotiation.
  An early-floor depth transition costs a real movement event only
  after a hero physically reaches a seeded stair via discovered,
  connected tiles. The existing party relationship reconciler now
  commits same-world joins, splits, deaths and voluntary companions
  into time-stamped events, never by examining a replay. The unique
  boss and Floor-7 special boundaries remain unchanged; post-shop
  standby and deeper authored floors remain pending. PR #210
  adds the ONE event-only known-state projection for the physical
  wall Board, R roster and mini feed. Real zero-HP crossings create a
  unique, clock-timed magical death signal without revealing the enemy,
  exact dungeon tile, loot or unseen fight. Upper/deep presence is an
  explicit coarse event, never read from hidden mutable hero position.
  The v22 validator refuses fabricated signals and event IDs. The
  spectator, rich history, provenance and Archive remain pending.

**Required migration strategy**:

1. Define one pure deterministic `advanceWorldUntil(state, targetTick,
   timedCommands)` or equivalent that consumes existing simulation
   authorities in bounded slices. Refactor the current daily functions
   instead of leaving **two** pathways resolving the same monster,
   awarding the same chest or settling the same customer.
2. Separate opening/closing service actions, visitor arrivals,
   transaction commit and overnight advancement from the
   current all-in-one day roll. Preserve existing state/rng and
   **owner-approved fresh V.003 campaign boundary** if the save schema changes. Old alpha/v13 compatibility is not required; no conversion adapters or second day motor. New-version saves still require exact-once deterministic state and clear incompatible-save handling.
3. Keep the dungeon's real site/hero progress, group encounter caches,
   company, hero autonomy, combat frames and reward conservation;
   the duration of a day is no longer an arbitrary `36 walk steps`
   *when migrated*. Until migration, current limits remain unchanged.
4. Move game-critical shop timers onto the same saved timebase with
   pausing and protection against dropped browser frames.
5. Replace planned three-phase Board 2.0 views with one genuinely
   **LIVE event/last-known status timeline** on the physical Board and
   expanded E/R roster. Both use one knowledge-safe observation source,
   not raw remote hero state or a repaint every rendered frame.
   See [LIVE_BOARD_LEDGER_AUDIT.md](LIVE_BOARD_LEDGER_AUDIT.md).
6. Simplify bedtime into real closing accounts/receipts and optional
   recorded-journey review. Retire the separate night-only `The Living`
   hero dashboard and compulsory `Sealed Expeditions` gate when their
   LIVE Board and always-accessible archive replacements work. See
   [LIVE_BOARD_LEDGER_AUDIT.md](LIVE_BOARD_LEDGER_AUDIT.md).
   Add a physical clock only after time is actually committed.

## Acceptance gates: player fun AND technical correctness

- **Same-day consequence:** a dungeon hero decides to return while
  Galvik is actively operating; Galvik gets only a valid known report,
  can prepare shelves/stock and can serve that hero **after a physical
  visit**, not before or automatically.
- **No pressure/exploits:** pause, AFK, settings, furniture planning,
  short/long shop days and deliberate early sleep cannot lose items,
  bypass visitor impatience, print gold, chain-refresh sites or
  damage heroes merely because real time elapsed with the game idle.
- **Exactly once:** one shared party fight has one committed site claim,
  finite treasure and actual individual HP/inventory consequences.
  Sleep, reload and replay cannot grant another payout.
- **Stable timeline:** replay bookmarks, Board reports and shop arrivals
  use consistent ordered world event identities. Same timed command
  sequence is deterministic across different hardware frame rates
  and save/reload.
- **Knowledge boundary:** sealed or unseen deaths/secret rooms remain
  unknown until a legitimate report or recording is observed.
- **Ten-day gameplay:** evaluate whether preparing for returns,
  merchandizing and informed shopping are actually more enjoyable than
  the bedtime-only model. If not, retune cadence/reporting **before**
  committing to a massive real-time combat/world rewrite.

**Non-goals:** MMO-scale continuous simulation; mandatory 3-phase
Morning/Midday/Evening turns; minute-by-minute micromanagement of
heroes; unlimited offscreen 60 Hz AI; real-world offline progress;
player-directed parties; hunger/stamina punishments; mandatory idle
waiting to finish a day.
