# CI Policy (V.004, lean PR gate)

The required PR pipeline is a **fast defect gate**, not a 100-day campaign and not a cosmetic screenshot inspection. A passing PR gate does not certify every gameplay or rendering system.

## Required on each pull request

**Build and unit tests** (one job, stable check name): `npm ci`, `npm run build`, `npm run verify:pages`, then `npm run test:unit:core`. The core script is an explicit file selection from `tests/unit/`: state/save/time, live dungeon and temporary parties, 60-Hz combat, checkout and shop traffic, one portal and right-wall seal, furniture and cellar traversal, LIVE projection and shared tabletop/minimap camera orientation. No automatic all-unit discovery on PRs.

**Browser core smoke** (one job, stable check name): `npm run test:smoke`, with these ten Chromium test files (15 current smoke cases):

- `cashierReceipt.spec.ts`: physical cashier and real payment authority
- `shopTrafficReload.spec.ts`: persisted NPC routes, waits and checkout claims
- `liveDungeonClock.spec.ts`: persisted in-day world/dungeon progression
- `liveCombatArena.spec.ts`: opt-in combat arena observes the same real fight
- `singleShopPortal.spec.ts`: only one valid physical entry/exit
- `monsterObservation.spec.ts`: real committed monster observation
- `cellarForge.spec.ts`: physical forge and material flow
- `developerCombatLab.spec.ts`: production gear controls, explicit custom fixtures, local stepping, cinematic and isolation
- `heroBuyback.spec.ts`: physical recovered-goods chest and ownership
- `employees.spec.ts`: persisted priorities, shelf assignment, physical checkout/credit and combined commerce

The serial smoke job has a 20-minute overall ceiling instead of 12 minutes after repeated cancellation on slow runners. No individual Playwright timeout or acceptance assertion was relaxed. Build/unit job retains its 12-minute ceiling.

The explicit file names in `package.json` are authoritative. An `@ci-smoke` tag on another test does not enroll it in CI. The standalone Galvik table camera-handoff job was removed: its `observationTransition.spec.ts` remains available manually, while pure camera-orientation contracts run in the core unit gate. The advisory module graph audit also does not block every PR; run it when deleting source code or before releases.

## Manual regression

`npm run test:unit` runs **all** remaining deterministic unit tests. `npm test` runs **all** remaining Playwright tests (after installing Chromium). Actions > **Full browser regression** runs both complete suites, the module graph audit and collects failure artifacts. Use targeted tests on changes to fishing, battle visuals, Galvik's Table handoff, HUD interactions, performance, or multi-day campaign progression. The 100/200-day campaign and boss-readiness matrices are manual-dispatch only; branch names no longer launch them automatically. Existing narrow credit and upgrade experiments retain their explicit triggers. Use targeted build/unit/browser checks for presentation changes, core checks for geometry, and short focused simulations (normally 10–20 days) only where gameplay consequences warrant them. Reserve 100/200-day campaigns for significant balance milestones or a concrete long-horizon question. They are not a routine merge gate.

The repo intentionally deletes obsolete positive Floor-6 solo-boss/per-hero-permit Playwright checks, rather than preserving assertions that contradict the current single-portal/Floor-10-party design. Former-floor regression *guards* that reject obsolete save shapes remain valid and must not be dropped just because their names mention Floor 6.

## Change policy

1. If a removed PR smoke check catches a real regression, restore it (or a faster targeted equivalent) and document why.
2. Do not make production behavior wrong to satisfy an old test. Investigate outdated fixtures and remove tests only when the behavior is genuinely retired or duplicate.
3. Keep the new-playthrough save contract strict. No old-save migrations.
4. Keep the deployment workflow untouched. It builds and verifies the actual Pages output on `main`.
5. Report actual CI results and measured runtime, not estimated speedups. Passing a subset is not passing the full regression.

The targeted **Employee physical throughput audit** runs only when its explicit spec/workflow changes or via manual dispatch. Two matched policies use real browser callbacks; the spec skips unless `EMPLOYEE_AUDIT_POLICY` is set. This is diagnostic, not part of the ordinary required smoke gate.
