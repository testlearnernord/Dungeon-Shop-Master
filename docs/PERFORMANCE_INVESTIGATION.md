# PR #215 · Diagnosing the post-#200 shop FPS regression

**Date:** 20 November 2026. **Main source of truth:** GitHub commits and
`tests/runtimePerformance.spec.ts`. **Status:** deterministic bottleneck
analysis + safe cleanup, **not** owner-hardware FPS acceptance.

## Historical changes, verified in source

Before PR #201, `src/main.ts` did not advance an authoritative world
clock on every render frame or commit a physical traffic checkpoint every
50ms. PR #203 introduced the 20Hz fixed-step shopper motor and shared
clock. PR #204 added strict per-step persisted traffic snapshots.
The new `campaignSaveCadence` saves a full campaign after every 20
movement ticks (=1 real second with the shop unpaused), and immediately
after material player changes or pending world event changes.

Consequently, clock changes now trigger frequent `GameStore` notifications,
a full physical checkpoint copy, strict traffic validation and, before
the optimization, two full JSON serializations for traffic equality on
every confirmed physical tick. Each ordinary autosave calls
`createSave`: strict validation, structured clone and JSON encoding,
and previously always did a **second** full strict parse of the previous
latest snapshot just to rotate a backup.

## Reproducible baseline: same virtual browser, same scene

The E2E-only sampler profiles native `performance.now()` around real
gameplay functions, *not a second world simulator*.

| Baseline CI metric | World paused | World active |
| --- | ---: | ---: |
| 60 rAF frames, median interval | 50.0ms | 50.0ms |
| 95th percentile interval | 66.7ms | 66.7ms |
| Babylon synchronous scene-render time | 134.2ms / 62 calls | 41.6ms / 61 calls |
| World scheduler (63 real ticks) | none | 0.5ms total |
| Actual NPC motor (63 ticks) | none | 7.1ms total |
| Traffic snapshot (63 ticks) | none | 0.6ms total |
| Full JSON comparison (63 ticks) | none | 1.1ms total |
| Strict traffic validation + listeners (63 ticks) | none | 1.2ms total |

A day-one save occupied 8,655 UTF-16 characters and cost 1.1ms to
validate/clone/encode, then 0.8ms to strictly reparse. These are short
diagnostic windows on **virtualized CI hardware**; fluctuations and
frame pacing are expected. The fixed ~20 FPS even with the world clock
**paused** means the CI metric cannot be used as proof that the
clock introduced the visible low-FPS symptom on the owner's hardware.
Neither JavaScript render duration nor rAF cadence is GPU time.
The cashier previously measured 16.7ms median on the same virtual CI,
with Babylon rendering explicitly suspended.

## Implemented reduction, without save/replay rule changes

1. Physical tick: always commit the fresh deterministic NPC checkpoint,
   without doing two massive stringifications to compare the already
   known changed tick state. Off-tick material UI/roster changes still
   use a complete equality guard to avoid redundant writes.
2. Backup rotation: cache the **exact** successfully saved or strictly
   loaded latest text for the same storage adapter. Avoid parsing
   that same full snapshot again at each 1-second autosave; unknown,
   externally changed, malformed or failed-write data remain subject
   to the previous full-validation and backup-preservation rules.
3. Avoid an unnecessary full `structuredClone` before each ordinary autosave
   JSON encode. `serializeSave` validates the same strict state and captures
   its JSON synchronously, before the promise is queued, so subsequent
   caller mutations cannot change the stored bytes. `createSave` still
   returns a fully detached envelope for explicit exports/tests.
4. Remove the separate **visual 20Hz stutter**: PR #203 deliberately
   moved physical NPCs on 50ms saved ticks, but until now the Babylon
   mesh also jumped at 20Hz even on faster displays. For shop rendering,
   remember the consecutive **already committed** physical traffic poses;
   interpolate only the transient render x/z/yaw (shortest heading arc),
   restoring exact root positions in `finally`. Actual gameplay, nav,
   save, exit-gate validation and queues see no interpolated coordinates.
   No independent simulation, time advance or movement reroll was added.
5. Show an **opt-in F3** diagnostic overlay during gameplay. It reports
   measured browser FPS, p95 frame gap, synchronous world tick CPU per
   frame, synchronous Babylon render CPU per frame, actual world ticks/s,
   and main-thread work in the last autosave. It changes no simulation,
   saved state or encounter; it is hidden until manually enabled.

The autosave frequency, strictly validated source snapshots, physical
checkpoints, item/gold transactions, combat RNG and replay payloads remain
unchanged. Fractional 60Hz+ **presentation** corrects quantized
pedestrian visuals but does not claim to increase actual rendered FPS. The full E2E campaign + existing movement/save/load contract
suite is required to pass before merge.

## What remains unproven

Only an in-browser reading on representative physical hardware can
identify whether slow frames coincide with world simulation, autosave,
WebGL driver synchronization or a separate rendering cost. If FPS is poor
while F3 reports low *world* and *render* CPU time, further CPU tick
optimizations cannot explain the stall; use Chromium Performance and GPU
profiling on that hardware. Do not claim a 20→60 FPS improvement simply
because the new monitor displays a number.

The F3 panel is for diagnosis, not a permanent new HUD or another
controller. Hidden mode does not materialize per-frame charts, and the
game's one saved 50ms clock remains the only event authority.
