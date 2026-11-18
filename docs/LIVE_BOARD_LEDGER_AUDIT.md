# Live Adventurer Board and lean day-end ledger

> **Owner-approved V.003 design audit, 18 November 2026.**
> This is the migration contract for the new shared world clock, **not a
> claim that the current V.002 shop already has live dungeon updates.**
> Crucial owner choice: **backward compatibility with old alpha campaign
> saves is not a requirement**. Prefer one clean state schema, eliminate
> obsolete implementations, and test deterministic saving only for the
> NEW version. Do not ship two parallel simulations or two boards.

## Existing code, confirmed

| Current location | What it actually does | V.003 decision |
| --- | --- | --- |
| `src/game/gameState.ts::advanceDay` | Computes all expedition steps and party combat at overnight transition, despite the shop already having physical daytime service | **Replace** with in-day, scheduled, shared-clock world advances |
| `src/game/gameStore.ts::endDay` and `src/dayHud.ts` | Bed closes the shop, commits one bulk day tick, then opens the 4-page report | **Split:** close service, finish due events to next morning exactly once, show accounts/archive, explicitly start the next day |
| `src/game/rosterBoard.ts` | Physical texture already has `store.subscribe(draw)` for any committed state replacement | **Keep** placement, 3D mount and renderer. Drive it from a shared **known-state projection**, not authoritative hidden combat state |
| `src/rosterBoardHud.ts` | Expanded roster already has `store.subscribe(render)` | **Keep** E/R access and Temporary Party UI, refactor its source to the same safe live observations; avoid redrawing a 1024×640 wall texture every render frame |
| `src/dayHud.ts` feed | Reacts to GameStore mutations but dungeon commits currently arrive mainly at bedtime | **Keep** as a live observed-event feed, not a second dungeon solver |
| `src/merchantLedger.ts` | The Reckoning, Goods & Receipts, The Living, Sealed Expeditions; night summary built from before/after game states | **Keep** book/finance UI and actual receipts; **remove duplicate night-time hero dashboard and hard sealed-archive gate** when the live replacement ships |
| `src/ledgerHeroChronicle.ts` | Rebuilds a long list of overnight hero cards and suppresses unknown outcomes | **Retire** that night-only projection after E/R Board and per-event reports replace it |
| `src/ledgerSealedExpeditions.ts` | Projects sealed dossiers from all recordings of the batch-processed night | **Retire** as the required night gate. Reuse only valid recording identity metadata in a compact, continuously accessible **Expedition Archive** |
| `src/replayDisclosure.ts` | UI-only sessionStorage list decides whether a recording counts as watched; it does not modify GameState | **Replace** hard outcome secrecy-by-click with actual in-world information provenance. Optional *watched/unwatched* UI history may remain, but cannot be the authority for world truth |
| `src/game/dungeonViewer.ts` | Replays already committed trajectories and fights without simulating them again | **Keep** and add event bookmarks, jump-to-fight, continuous expedition archive, and correctly distinct world/replay times |
| `src/ledgerViewState.ts` and bedtime ledger recovery | Restore the old 4-page modal/page number | **Simplify** to the new book layout; legacy page state may be dropped |
| Old `SIMULATION_VERSION=13` | Defines current alpha snapshot with day-batch dungeon state and optional replay fields | **Break on purpose if necessary.** One new schema; no legacy loader, parallel resolver, or v13 replay-shim mandated by V.003 |

## The physical Board really is LIVE, but not omniscient

**LIVE means new legitimate dungeon information can appear throughout
the actual opened shop day** as world time advances, even without Galvik
sleeping. It does NOT mean exposing the hidden truth of every dungeon tile.

One authoritative in-game clock commits the real physical world
(supplies, shop customers, portal, heroes, travel, temporary parties,
encounters, deaths, site regeneration and shop credit) in ordered
deterministic events. A **separate observation ledger** records what
Galvik can reasonably know. Proposed per-hero projection:

- Stable identity, portrait, role, personal depth and last confirmed
  shop transaction; **last reported tick**, floor/sector and report
  origin; current *reported* action/medium-term intent if known.
- Known or last-reported HP and actual equipped items, clearly marked
  as potentially **stale**. A hidden post-combat injury or unobserved
  death does NOT immediately change the visible HP/name/status simply
  because `GameState.adventurers` changed.
- Temporary Party membership only after an actual observable join,
  shared departure, magical signal or legitimate replay report; no
  third-party omniscience from a cached global `dungeonParties` array.
- **Unknown / no signal / last seen** is a first-class state. Do not
  fabricate live reports every tick. A global magical Board may reveal
  a coarse activity/region by an explicit lore/tech rule; detailed
  HP, secret room, loot, death and hidden enemy information require
  an actual accepted information channel.
- Event log in chronological order with distinct
  `occurredAtTick`, `reportedAtTick`, `source` and stable event ID.
  Delayed reports display their true timestamp, not a rewritten
  current-time floor or inferred survival.
- The **same projection** backs the wall-mounted canvas and E/R panel.
  R adds a compact depth map, filters, hero/TP details, recency and
  links to already committed, legally revealable replay bookmarks.
  Do not mandate morning/noon/evening columns.
- Board updates on committed **observation revisions**, not 60 FPS
  rendering ticks. A throttle/coalescer can protect the canvas but
  must not lose events or defer player-relevant warnings indefinitely.

**Concrete player benefit:** a verified TP chooses to return during
Galvik's active opening hours. The Board marks the last contact as
`Returning`; Galvik may restock before the **physical** arrival.
Only after an actual checkout does the gear/credit belong to a hero.
No retroactive supplies, remote healing or merchant-issued hero orders.

## Bedtime is account closing, not a second Adventurer Board

The screenshots of the four-page **Galvik's Private Accounts** book
show strong art direction worth keeping. Retire redundant mechanics,
not the typography, bookbinding or dramatic transition.

| Existing folio | Decision | Reason |
| --- | --- | --- |
| **The Reckoning** | **KEEP, simplify** to closing balance, legitimate sales/expenses, new credit/debt, relevant item stock, net change and one deliberate `Begin Next Day` action | End-of-day financial review and merchant planning are still gameplay |
| **Goods & Receipts** | **KEEP as expandable drilldown** beneath closing accounts; itemized paid/credited receipts, no fabricated overnight purchases | Relevant fiscal trail without forcing the player through another chapter |
| **The Living** | **REMOVE as separate nightly roster.** Keep only optional compact *reported highlights* if useful in the review | The Live Board already owns current/last-known hero identities and movements. Night reprinting 14 characters adds clicks, not decisions |
| **Sealed Expeditions** | **REMOVE as mandatory seal/reveal gate.** Move recordings to an always-accessible **Expedition Archive** linked from R/Board; offer optional overnight Watch/Skip | Replay is a historical observation and entertainment tool. Watching cannot change yesterday's HP, money, outcome or loot. A *new report* can update knowledge, not world truth |
| **Gold at Dawn / Overnight Change** | **REMOVE if always identical to closing cash**; display genuine overnight economic changes only when an actual simulated transaction exists, clearly attributed | No duplicate money or meaningless +0g tile |
| **Visitors at closing** | **KEEP only if unresolved physical occupancy matters**, else report served/walked-out visitors instead | Real physical service, not a glorified headcount |
| **NIGHT N / LEAVING DAY N+1** | **Replace** with closed Day N snapshot; next morning is not started merely by opening the book | Avoid confusing day labels and committing future shop events too early |

The archive should let the player jump from a report directly to a
committed departure, combat, loot, TP join/split or return bookmark and
watch the complete journey. Replay playback pauses the world.
World-event time and video time are distinct. Never generate extra
footage to occupy an arbitrary full-day duration.

## Chosen clean break: no legacy saves required

The owner does **not** require preserving old alpha saves. When the
world-clock implementation is ready, bump the simulation/save version
and declare a **fresh campaign boundary**. Do not implement v13→v14
migration, deprecated fields, dual day motors, conversion shims or old
four-folio session recovery merely to keep experimental saves alive.

Still required:
- A clear, non-destructive **"Old alpha campaign incompatible; start
  a new campaign"** message instead of silently corrupting or
  reinterpreting stored data. No background replay or old cash import.
- Deterministic **new-version** save/load/resume at every valid clock
  boundary, and no duplicated purchases, chest loot, enemy rewards,
  Temporary Party joins or NPC arrivals after reloading.
- Restore the current paused/active service state and pending
  once-only world events. Save corruption must be detectable, not
  mysteriously repair itself with guessed outcomes.

## Coherent implementation order, avoiding parallel systems

1. **Time and transaction authority:** add one world-clock tick and
   scheduled event executor. Refactor `advanceDay` into in-day
   commits + bedtime close/overnight advancement. Move current
   customer patience/restock/request timers onto this single clock.
   Cut over atomically: no two damage, loot or sales resolvers.
2. **Observation projection and Live Board:** persist ordered
   information events; route the current physical Board + E/R roster
   + day feed through one known-state selector. Test reports arriving
   while Galvik actively stocks/services; test hidden deaths remain
   unknown. Avoid global re-render-per-frame.
3. **Lean accounts and continuous archive:** replace the four-page
   `merchantLedger.ts` contract; drop
   `ledgerHeroChronicle.ts`, `ledgerSealedExpeditions.ts`,
   obsolete `replayDisclosure` logic and related old tests/DOM
   only once their new readers and deep links are functional.
   Preserve actual receipts, debt and training/replay viewers.
4. **Polish:** the physically placed enchanted clock reads saved
   world time; event bookmarks and skip-fight; true live portal
   arrivals, early sleep/AFK/pause and repeated ten-day shop runs.

**Acceptance before shipping V.003:** ten real shop days, a same-day
returning Temporary Party, physical replenishment through a paid or
credited shop visit, stable paused/hidden behavior, deterministic
repeated runs and fresh saves, reliable no-spoiler Board reports,
readable performance on a 35h shopkeeper's ordinary gaming PC, and
no irrelevant end-of-day hero card wall.

This is a **future migration plan**, not a claim of a shipped live
world clock or removal of currently functional bedtime UI.
