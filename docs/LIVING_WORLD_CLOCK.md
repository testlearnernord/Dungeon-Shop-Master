# One Living World Clock — current runtime contract

> Reconciled 22 November 2026. Older PR #203–#215 planning/implementation chronology has been retired from this living document, but remains available in Git history. This document describes the world *that exists*, not a future replacement engine.

## Authority and unit of time

`GameState.worldClock` stores a monotonic ordered world clock. `GameStore` commits game changes; `src/game/worldClock.ts` defines scheduling; `liveDungeonRuntime.ts` advances ordinary floor movement, combat, timer-driven returns and genuine world events.

- **1 world tick = 50 ms; 20 ticks = one game minute; 28,800 ticks = one full in-game day.**
- **One connected dungeon step = 200 world ticks** (10 unpaused seconds). Combat advances in committed 60-Hz steps in bounded world-clock batches. A visual frame is never a world tick.
- Shop NPC routes, visits, requests, paid checkout/credit, dungeon decisions and fight scheduling belong to the **same persisted timeline**. Opening a camera, Board, archive, 3D fight spectator, fishing view or overlay creates no extra economic/combat authority.
- `endDay`/bed closure is a player action, not the sole time at which adventures advance. World-time processing remains ordered, deterministic, and bounded. No offline progress when the browser is closed and no frame-rate-dependent enemy damage.

## Physical shop, returns and rotation

1. An adventurer finishes a real exploration decision, may choose shop, and backtracks **known connected tiles** toward a seeded entrance. The LIVE clock schedules a real portal crossing, not an invented arrival from a hidden map.
2. Galvik's shop is a separate **unnumbered cursed realm**. Normal NPC arrivals and departures share one physical shop threshold. The current Alpha v34 physical shop checkpoint contains exactly one `portal` door. Former `level4`/`level6` gates are removed and v27 saves are rejected (no migration); the separately named shop `floor=5` occupancy still needs its own cleanup.
3. A paid/credited visitor still needs a **real physical departure** before `off-duty` begins. After leaving on Day D, the hero spends full Days D+1 and D+2 outside shop/dungeon. Earliest renewed expedition begins Day D+3.
4. Off-duty healing consumes genuinely owned Waybread/Herbs if available. No passive full heal, debt cancellation, free item, gold grant or instant reentry.
5. Time-bound restock waits and shopping-cart claims are durable saved events/objects. Cancelling/reloading a viewer never renews a deadline or sells a reserved cart. Day closure restores unpaid goods without phantom receipts.

## Dungeon and combat within that clock

- Ordinary **Floors 1–9** are genuine seeded traversable maps. Heroes have independent saved position, HP, intent and treasures; Temporary Parties form naturally from actual positions.
- A **Floor-9** real party reaches the lower stair together and may enter the **Floor-10 Cave Troll** only when the actual 2–3 members satisfy pass/health/time conditions. A solo flag never creates a fake group.
- `groupCombat.ts` settles the 60-Hz authoritative fight, retaining real actor poses/cues and one original outcome. Scene interpolation, cinematic intro and the local recording clock may read those frames but cannot replace, rewind or resimulate the fight.
- Current v30 saves do **not** admit a Solo Floor-6 `liveDungeon.bossCombat` field, and LIVE world time cannot spawn or settle one. The old `level6Combat` dispatcher was removed after the LIVE cleanup; only preview/replay readers retain solo-tape metadata. The real LIVE Troll is exclusively the Floor-10 GroupCombat party.

## Knowledge and retention

- World Feed entries and the Adventurer Board derive **committed** authentic events. The passive Board may hide unknown remote details; the optional LIVE floor viewer may inspect legitimate committed positions without teaching the hero AI secret information.
- One timeline holds today + two prior days, with up to 12 deliberately pinned recordings. Expired footage disappears without deleting event facts or inserting a made-up film.
- All current-version Save/Load, clock/event ordering, shop claims, portal returns, combat checkpoints, archive links and strict bounds must agree across a roundtrip.

## Verification and remaining risks

**Implemented and testable:** shared tick owner; 200-tick spatial pacing; 60-Hz combat; physical shop cart/checkout; portal return; two-day rotation; genuine group boss; bounded archive.

**Still open:** full 20-/50-/100-day current-code balancing; actual physical NPC pathfinding under slow checkout/service; re-entry and shop gate migration out of legacy keys; representative device frame pacing and audio/visual acceptance. See [Roadmap](ROADMAP.md) and open issue #294.

Never “fix” stalled XP by fast-forwarding the calendar, inventing loot, granting invisible purchases, or letting an observer HUD simulate extra battles.
