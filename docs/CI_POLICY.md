# CI Policy (V.004)

## Mandatory pull-request checks

The PR pipeline is intentionally small and protects correctness rather than replaying an entire campaign on every commit.

- **Build and unit tests**: `npm ci`, `npm run build`, `npm run verify:pages`, and all deterministic `tests/unit/*.test.ts` tests.
- **Browser core smoke**: a single Chromium/SwiftShader runner with a fixed whitelist of real game flows:
  - `cashierReceipt.spec.ts`: atomic checkout and live shop traffic during cashier interaction.
  - `shopTrafficReload.spec.ts`: saved positions, routes, waits and claims survive reload.
  - `liveDungeonClock.spec.ts`: committed expedition positions and shared clock survive reload.
  - `liveCombatArena.spec.ts`: the live battle is abstract on the map; opening the arena is observational, not a second simulation.
  - `liveFloorSpectator.spec.ts`: the floor selector and party spectator are driven by saved world state.

Run the exact PR browser set with `npm run test:smoke`. The existing `@ci-smoke` labels on other tests are historical metadata and **do not** place them back in the mandatory suite. Only the explicit file whitelist is authoritative.

Keep the core suite deterministic and under approximately 2–3 minutes overall when runner capacity permits. This is a target, not a guaranteed duration. Prefer fixtures that construct the desired encounter from known map and save state, not hard-coded world-clock delays.

## Optional full regression

Run **Actions > Full browser regression > Run workflow** for changes involving combat cinematics, fishing, performance/render architecture, long campaign progression, multi-Ghoul packs, or before a larger release.

That workflow retains **every browser spec** via `npm test`, plus the unit suite and advisory module graph audit. This includes:

- `fishingPond.spec.ts` (currently timing-sensitive around the randomized flick/reel transition).
- `liveBossWorldClock.spec.ts`, `liveGhoulPack.spec.ts` and deep arena tests.
- `developerCombatLab.spec.ts`, `livingWorldCampaign.spec.ts`, `renderAblation.spec.ts`, `liveWorldSpikeProfile.spec.ts`, and `runtimePerformance.spec.ts`.

A failure in the optional regression is not automatically a flaky test. Diagnose real simulation regressions, update obsolete encounter fixtures and avoid changing gameplay merely to satisfy a hard-coded test time.

## Updating the smoke suite

When changing the mandatory whitelist:

1. Keep at least one authentic browser check for checkout, save/reload, in-day dungeon progression, and opt-in combat observation.
2. Keep most behavioral coverage in fast, deterministic unit/integration tests.
3. Do not silently disable failing core checks. Fix the production code or the stale fixture before merge.
4. Record the observed CI runtime and test counts in the PR. Promote additional tests only when their bug-detection value justifies running on every commit.
5. If repository rules require the old shard job names, update the required checks to `Build and unit tests` and `Browser core smoke` when the branch protection allows it.

## Deployment

`deploy.yml` publishes the built and verified `main` tree on successful push. Its deployment concurrency remains unchanged. The manual dispatch trigger in that workflow is retained for operational recovery; it must never be used to deploy unmerged PR code.
