# PR #214 — Ten-day acceptance and browser performance baseline

> **Historical subsystem audit / implementation evidence.** This document records earlier PR stages, not current unfinished work. See [Architecture](ARCHITECTURE.md), [Roadmap](ROADMAP.md) and [Legacy audit](LEGACY_OBSOLESCENCE_AUDIT.md) for the present world. In particular, the obsolete `src/expeditionHud.ts` widget and `level6Progress.ts` projection have now been retired in favor of one World Feed / Expedition Archive; saved solo v26 recordings remain readable.


This is a **regression and profiling gate**, not a declaration that V.003 Alpha is
ready to ship. All claims are grounded in executed tests, saved world events
and the actual UI. Old save formats remain deliberately incompatible with v24.

## What is tested

| Source | Contract |
| --- | --- |
| `tests/unit/livingWorldAcceptance.test.ts` | One seeded ten-day LIVE campaign, with a legal on-credit good and real debt, a reserved shelf item paid through the staffed-cart authority, accurate treasury and hero inventory, observed outer-gate departures and two full days off duty |
| Same | A lethal seeded spatial trap generates one real magical death report without leaking its location/cause onto the passive Board; two co-located explorers form a saved Temporary Party |
| Same | A **different** seeded monster generates a real 60Hz saved group fight; only that combat gets pinned for permanent review. No imaginary recording is attached to the trap death |
| Same | Each day through Day 11 compares the uninterrupted and independently strict-saved/reloaded simulations: identical world tick, outcomes, parties, HP, event identities, debts, stock and money. One manually pinned tape remains byte-for-byte unchanged after normal replay expiration |
| `tests/livingWorldCampaign.spec.ts` | Ten consecutive browser day closes using the actual store/bed day-transition API; confirms IndexedDB persistence, world-clock identity, no phantom checkout, compact archive and a real mid-run and end-run reload |
| `tests/runtimePerformance.spec.ts` | An explicit world-only tick does NOT re-render the Level-6 historical HUD; logs representative JavaScript `requestAnimationFrame` median/p95/worst intervals with and without the cashier. During checkout, Babylon frame IDs must remain frozen while the visible needle animates |
| Existing smoke and unit suite | Player bed gesture, interactive checkout, missed-frame fairness, physical traffic recovery, shop/nav furniture, short LIVE observer, Board death notices, real party and boss replays |

## What changed in the runtime

- `shopCredit.ts`: in LIVE campaigns, issuing a credit item makes the visitor
  `departing` on the shop's own floor. The existing physical shop motor,
  checkpoint and verified outer-gate event must run before the visitor is
  `off-duty`. Legacy standalone fixture behavior is isolated.
- `npcVisualSystem.ts`: an exiting credit/walkout shopper can no longer be
  turned around into an arriving one by a day/roster refresh.
- `expeditionHud.ts`: the old subscriber rescanned the full event log and
  rebuilt the Level-6 DOM on every clock/physical-traffic state update.
  It now observes relevant saved event/floor collections and explicit replay
  disclosure, while clock-only ticks skip all that work.

## Running the acceptance checks

```bash
npm run build
npm run test:unit
xvfb-run -a npm run test:smoke
```

The CI browser runs on **virtualized hardware** that may render via software
WebGL. Frame interval figures are relative diagnostics, **not** verified
real-machine frame rates, causal proof of all bottlenecks, or a guarantee of
smooth checkout on every display. The displayed cashier needle is already
graded at its last rendered position, including after a 570ms stalled frame;
this pass tests that Babylon really stays inactive during that modal.

## Still unaccepted for V.003 release

One cursed special-floor portal replacing both old doors; individual Floor-10
permission and authored progression; one unified unique-boss/ordinary combat
authority; representative physical-PC FPS and 10-day hands-on pacing, balance,
UI visibility and animation quality. A green CI cannot approve those by itself.
