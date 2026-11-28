# One Living World Clock — current runtime contract

> Current contract: Alpha v52 (Room-first Dungeon). Current world clock and timing contract.

## Authority and unit of time

`GameState.worldClock` stores a monotonic ordered world clock. `GameStore` commits game changes; `src/game/worldClock.ts` defines scheduling; `liveDungeonRuntime.ts` advances ordinary floor movement, combat, timer-driven returns and genuine world events.

- **1 world tick = 50 ms; 20 ticks = one game minute; 28,800 ticks = one full in-game day.**
- **One connected dungeon step = 50 world ticks** (2.5 unpaused seconds); a monster moves no faster than once every 100 ticks (5 seconds). Combat advances in committed 60-Hz steps in bounded world-clock batches. A visual frame is never a world tick.
- Shop NPC routes, visits, requests, paid checkout/credit, dungeon decisions and fight scheduling belong to the **same persisted timeline**. Opening a camera, Board, archive, 3D fight spectator, fishing view or overlay creates no extra economic/combat authority.
- `endDay`/bed closure is a player action, not the sole time at which adventures advance. World-time processing remains ordered, deterministic, and bounded. No offline progress when the browser is closed and no frame-rate-dependent enemy damage.

## Physical shop, returns and rotation

1. An adventurer finishes a real exploration decision, may choose shop, and backtracks **known connected tiles** toward a seeded entrance. The LIVE clock schedules a real portal crossing, not an invented arrival from a hidden map.
2. The unnumbered cursed shop has one physical portal. The current save uses `shopRoom`, `doorY.portal`, `gateSide=portal`, and distinct hero places `shop`, `away`, `transit`.
3. A paid/credited visitor still needs a **real physical departure** before `off-duty` begins. After leaving, a saved offDutyUntilTick deadline controls recovery on the existing movement lane, even across midnight. Healthy heroes return after 400 ticks plus at most one movement interval. No second clock or daily reset.
4. Off-duty healing consumes genuinely owned Waybread/Herbs if available. No passive full heal, debt cancellation, free item, gold grant or instant reentry.
5. Time-bound restock waits and shopping-cart claims are durable saved events/objects. Cancelling/reloading a viewer never renews a deadline or sells a reserved cart. Day closure restores unpaid goods without phantom receipts.

## Dungeon and combat within that clock

- Ordinary **Floors 1–9** are genuine seeded traversable maps. Heroes have independent saved position, HP, intent and treasures; Temporary Parties form naturally from actual positions.
- A **Floor-9** real party reaches the lower stair together and may enter the **Floor-10 Cave Troll** only when the actual 2–3 members satisfy autonomous readiness and physical crossing conditions. A solo hero never creates a fake group.
- `groupCombat.ts` settles the 60-Hz authoritative fight, retaining real actor poses/cues and one original outcome. Scene interpolation, cinematic intro and the local recording clock may read those frames but cannot replace, rewind or resimulate the fight.
- Alpha v52 is the only supported campaign schema. Reject v51 and earlier explicitly; no migration or legacy adapter. Current-format Save/Load must be deterministic. The unique boss checkpoint is `partyBossCombat`; the old solo dispatcher and recording adapters are retired. All live encounters and the isolated Combat Lab use the same 60-Hz group motor, hero attributes, gear, tactics, defense and physical retreat policy. Enemy abilities and terrain may differ; hero rules do not. There is no elapsed-time fight cap. After 30 seconds without an effective HP cue or measurable retreat advance, the shared progress policy requests retreat; persistent blockage can resolve as a recorded stalemate. Combat can cross day boundaries. Stored positions are capped at 2,401 frames, preserving the initial frame and latest minute at 10 Hz; older positions are thinned, not the combat events.

## Knowledge and retention

- World Feed entries and the Adventurer Board derive **committed** authentic events. The passive Board may hide unknown remote details; the optional LIVE floor viewer may inspect legitimate committed positions without teaching the hero AI secret information.
- One timeline holds today + two prior days, with up to 12 deliberately pinned recordings. Expired footage disappears without deleting event facts or inserting a made-up film.
- All current-version Save/Load, clock/event ordering, shop claims, portal returns, combat checkpoints, archive links and strict bounds must agree across a roundtrip.

## Verification and remaining risks

**Implemented and testable:** shared tick owner; 50-tick spatial pacing; 60-Hz combat; physical shop cart/checkout; portal return; health-dependent recovery; genuine group boss; bounded archive.

**Still open:** physical NPC/service pathing, current-save recovery, final visual/audio and real-device FPS acceptance. [Prior v48 evidence](ALPHA_V48_ACCEPTANCE.md) and [issue #294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294).

Never “fix” stalled XP by fast-forwarding the calendar, inventing loot, granting invisible purchases, or letting an observer HUD simulate extra battles.

The five-second remains search uses two existing 50-tick movement intervals. Monster contact arbitration precedes settlement. The manual used-equipment offer waits up to twelve seconds in the persisted shop traffic phase, not on a browser timer.
