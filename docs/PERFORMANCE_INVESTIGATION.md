# PR #215 · Diagnosing the post-#200 shop FPS regression

## PR #217: Was the parallel live-world simulation overlooked?

**Yes, it can cause separate CPU hitching on real hardware.** The PR #216
CI graphics ablation held world time paused: its poor FPS proves a
SwiftShader software WebGL render limitation **in that test environment**,
but does not exclude added main-thread work after the shared world-clock
migration on the player's hardware.

PR #217 measures a real ten-hero browser campaign at Day 1 and Day 11,
using the current shared-clock scheduler. For each day, the exact same
scene is sampled during paused/live pacing; while paused, six test-only
`GameStore.advanceWorldTime(600)` bursts each commit the next **genuine**
scheduled dungeon event (600 world ticks = 30 unpaused real seconds).
This fast-forward deliberately does not interleave each 50ms physical
NPC motor step: the timing is **the scheduler/events and subscribers**,
not total game runtime. Final run #44744094263 passed all 25 browser
smoke tests.

| Virtual CI measurement | Day 1 | Day 11 |
| --- | ---: | ---: |
| Six genuine 600-tick dungeon-event bursts | **7.5–15.8ms** | **7.7–11.2ms** |
| Maximum ordinary sampled world step | 0.1ms | 0.1ms |
| Paused-world shop median rAF interval | 50ms | 66.6ms |
| Live-world shop median rAF interval | 50ms | 50.1ms |
| Remaining living heroes | 10 | 10 |
| Active group combats in measured burst samples | **0** | **0** |

This demonstrates that **scheduled dungeon event bursts** can consume a
substantial portion of a **16.7ms/frame 60FPS budget** even while normal
50ms ticks are cheap. However, the persistently poor virtual-CI rAF
rates remain when simulation is stopped, indicating that the render
cost is independent here. *No live simultaneous combat workload was
observed*, therefore this test does **not** falsify the user's concern
about multiple simultaneous fights and save spikes on their PC.

The new production F3 diagnostics display world CPU rolling p95/max,
number of frames over 16ms, and **worst world CPU and autosave sync
over the entire current F3 session**, not only averages. This helps
identify rare 30-second scheduling spikes. Press F4 to force **Native**
quality and compare the same camera with the regular running shop
versus **P blueprint mode** (world paused, main 3D render remains active);
then repeat with 10+ heroes or active live combats.

If real hardware shows world CPU spikes, prioritize distributing
scheduled hero-expedition work into bounded deterministic saved
substeps, reducing duplicate state notifications and carefully
profiling 60Hz fight resolution and saves. Do not eliminate concurrent
world simulation merely because the browser's *virtual* GPU also
performs poorly.

---


## PR #216: Definitive *CI-specific* rendering ablation

Run #44712298171 on Ubuntu CI, **local** `http://127.0.0.1:5174`
Vite dev server, Xvfb Chromium, ANGLE Vulkan **SwiftShader Device
(Subzero)**. World pacer frozen in every test variant; 55 measured
rAF intervals per case. Counts vary with camera and model loading:
301 scene meshes, 50 active meshes, approximately 4,464 active triangles,
73 materials, 13 textures, 6 lights, five of them PointLights.

| A/B condition, same scene | Median interval | Median equivalent FPS |
| --- | ---: | ---: |
| Full scene, 800×600 pixel framebuffer | 50ms | ~20 |
| **Babylon scene.render skipped** | 16.7ms | ~60 |
| Full scene at **400×300** framebuffer | 16.7ms | ~60 |
| All 5 point lights switched off, ambient stays | 33.3ms | ~30 |
| Stock/furniture/bedroom/flames subset hidden | 50ms | ~20 |
| Almost every non-NPC world mesh hidden | 16.7ms | ~60 |
| Restored full scene | 50ms | ~20 |

Because halving BOTH width and height alone gives nearly 3× frame
throughput while all 20Hz simulation, dynamic lighting, shader programs,
meshes, material counts and world state remain, this is strong evidence
that **software WebGL raster/shader/pixel cost is dominating these CI
frames**. Lights materially contribute, geometry is modest. Skipping
Babylon rendering also restores 60 FPS, so compositor/JS alone does not
account for the observed 50ms stalls. `scene.render()` synchronous
JavaScript timing may be only 1–4ms while ANGLE/SwiftShader work is
scheduled elsewhere, so the former is NOT a GPU timer.

This DOES NOT mean owner's Chrome with hardware GPU or GitHub Pages
also takes 50ms, and it does not establish its actual performance.
The test was local Vite, **never GitHub Pages**. Pages serves a static
`vite build` bundle; a local `npm run build && npm run preview`
with the SAME browser, monitor, GPU, viewport and resolution is the
appropriate apples-to-apples comparison.

### Implemented rendering adaptation

`AdaptiveResolutionPolicy` samples frame intervals with CPU
cost attribution (world + synchronous render). When the **shop scene**
runs, after startup warmup and at least two sustained low-FPS windows
with little synchronous JS cost, it incrementally raises Babylon
hardware scaling 1 → 1.25 → 1.5 → 1.75 → 2. This reduces internal
3D pixels but not CSS canvas size or DOM UI resolution. Never touch
committed gameplay ticks, 60Hz group fights, physical shop checkpoint
or replay records. On strong hardware it remains at native.
Recovery attempts gradually restore sharper graphics only after
prolonged stable fast frames. E2E deliberately disables automatic
changes to preserve the controlled experiment; F4 explicit-mode
browser tests check the real internal render buffer.

Players can use **F3** for FPS, world/render JS CPU, WebGL renderer
identity, render buffer and active meshes/lights. **F4** cycles
Auto / Native (100% linear) / Balanced (~67%) / Performance (50%) / Auto.
The quality mode is local and intentionally not saved into the game
campaign, keeping save schema unaffected.

### Further priorities

1. Test on a real GPU/driver. Chrome `chrome://gpu` and F3 renderer
   distinguish hardware acceleration from software rasterization.
2. If a hardware GPU is still fill-rate bound, profile lighting/shader
   overdraw and selectively limit distant point light coverage or
   adapt dynamic-light quality while retaining atmospheric torches.
3. If the hardware bottleneck is **draw calls**, batch/instance
   decorative static meshes by materials, preserve collider and
   interaction names. Do not change geometry blindly: only 50
   meshes are active in this CI camera.
4. If world CPU/saves dominate in large 10-day campaigns, profile
   actual heroic AI/DOM events and save sizes there separately; do
   not touch deterministic tick count before measuring.
5. Target sustained hardware-specific 60 FPS at 1080p, p95 frame
   <25ms, and verify accurate world ticks and reproducible save/
   reload against all quality modes.

---

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
