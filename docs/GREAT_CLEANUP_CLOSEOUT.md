# The Great Cleanup — verified closeout ledger

> **D2 review draft (#243), 21 November 2026.** This reports actual repository evidence, not a claim that visual/gameplay acceptance or V.003 Alpha is complete. The authoritative source is the current GitHub `main`; CI and deploy status must be refreshed on every PR. Base snapshot from [A1 audit](CLEANUP_AUDIT.md), end snapshot after **merged C3 #241**, with D1 #242 merged and its first guarded Pages deployment successful.

## 1. What actually changed

| Phase | Merged PRs / status | Confirmed action |
| --- | --- | --- |
| A1–A2 | #235, #236 merged | Versioned tree inventory, current architecture/game bible/roadmap/contributor contracts, historical information distinguished from implemented code |
| B1 | #237 merged | Removed only the byte-identical root `No Safe Passage.mp3`, retaining the served original `public/audio/no-safe-passage.mp3` and all other music; ignored deterministic generated Ghoul/Troll outputs |
| B2 | #238 merged | Moved required 11,449,256-byte Troll Grab/Throw source GLB from repository root to `assets/tripo/source/` **without modifying its Git blob**; updated generator, manifest, docs and integrity tests |
| C1 | #239 merged | Retired two unused night-only ledger projections and their isolated tests; kept current LIVE Board / archive and added active archive secrecy regression |
| C2 | #240 merged | Added read-only source import graph with fixture tests and CI evidence; recognized that nearly all source modules are reachable, preventing speculative deletion |
| C3 | #241 merged | Retired one test-only, never-wired group-boss adapter and its fixture; added regression of the **real** unique saved Floor-6 Troll fight and scheduled 60-Hz progression |
| D1 | **#242 merged and deployed** | The `dist/` Pages-base/asset-byte/GLB guard runs in CI **and** actual deploy. All three PR CI jobs passed in [run 44889145401](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44889145401). Squash commit `f0fe02c6aab03dbbf58faad1551319d735e264c8`; both guarded build/upload and Pages deployment succeeded in [run 44889663336](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44889663336) |
| D2 | **#243 draft, not merged** | This measured closeout report and final navigation/documentation reconciliation; no engine, combat, asset or test changes |

## 2. Exact tracked Git tree: before versus after C3

These counts come from complete, **non-truncated recursive Git trees**:
- Before: `366835babf84cab8b23a14fdaf6a5f238409feea`, A1 baseline after merged #234.
- After C3: `75d418245c0f90d10b632a0f1dec1cd0c2813651`, merged #241 on `main`. **The now-merged D1 additions and draft D2 changes are intentionally excluded from this fixed after-C3 comparison.**

| Metric | Before | After C3 | Difference |
| --- | ---: | ---: | ---: |
| Tracked file blobs | 460 | 461 | +1 |
| Total current file bytes | 107,355,788 | 99,984,861 | **−7,370,927** |
| `src/` tracked files | 176 | 173 | −3 |
| `src/` tracked bytes | 1,472,434 | 1,459,538 | −12,896 |
| `tests/` tracked files | 189 | 188 | −1 |
| `tests/` tracked bytes | 989,299 | 987,592 | −1,707 |
| `docs/` tracked files | 14 | 19 | +5 |
| `docs/` tracked bytes | 473,593 | 341,062 | −132,531 |
| `public/` tracked files / bytes | 52 / 42,847,701 | 52 / 42,847,701 | **Unchanged** |
| `assets/` tracked files / bytes | 5 / 33,729,214 | 6 / 45,178,658 | +1 archived original source GLB (plus metadata changes) |
| Tracked MP3 files | 22 | 21 | −1 duplicate |
| Tracked WAV files | 21 | 21 | **Unchanged** |
| Tracked GLB files | 12 | 12 | **Unchanged** |

The −7,370,927 bytes is a **current tracked-tree reduction**, not a Git-pack size reduction, browser download reduction, memory/performance improvement or historical Git purge. The root duplicate alone accounted for **7,152,000 bytes** (Git blob `a911c4a43359e98229d281d6a985bf75701e07f3`). The relocated raw Troll source kept blob `d1f42cc107cc733d94874c7315871373e0071f75`. Both source and deploy model counts are distinct from generated-but-untracked GLB outputs.

## 3. Tests and production artifact evidence

- Required PR CI for C3 #241 passed **Build and unit tests**, **Browser smoke shard 1/2**, **Browser smoke shard 2/2**: [run 44888389226](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44888389226). Its clean build included the original generators and preserved the Combat Lab interpolation regressions.
- C2's real source graph before C3 found **165 of 166 TypeScript source modules reachable from `src/main.ts`**, with only `liveBossEncounter.ts` test-only; **0** fully unreferenced modules. The graph is conservative, not a complete function-level call graph or memory profile.
- In D1 PR #242's initial `Build and unit tests` job, all **625 unit tests passed**, and its new `verify:pages` step verified **38 audio files (30,165,861 bytes)** and **10 model files (32,417,652 bytes)** in the actual built `dist/`, including emitted JS/CSS URLs under `/Dungeon-Shop-Master/`. The post-merge Pages run [44889663336](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44889663336) subsequently completed with `npm run verify:pages`, artifact upload, and deployment all **successful**. This proves the configured deployment jobs finished, not that every CDN URL has been accessed by an independent client.
- Four pre-D1 successful CI runs measured **55–65 seconds** for build/units, **246–254 seconds** for Playwright shard 1 and **212–313 seconds** for shard 2. Existing smoke coverage was **not** removed, capped, sharded onto a shared GPU, or replaced with lighter tests.
- `public/` sources, 21 Ghoul WAVs, 11 Troll MP3s, four canonical soundtracks and original Tripo source animations were preserved. No source GLB was re-encoded by the cleanup.
- All gameplay source changes in B/C were file deletions of proven unused code. Existing actual 60-Hz boss/group combat, time, shop, dynamic replay spectator, saved world and 10-Hz-recorded/refresh-interpolated Combat Lab remain independently tested, but **this is not an artistic or performance sign-off**.

## 4. Gates still OPEN: don't call the project fully accepted

1. **D1 #242 CI + deployment: CLOSED.** All three required PR CI jobs passed; the Pages build's `npm run verify:pages`, artifact upload and deploy job also passed on merge commit `f0fe02c6aab03dbbf58faad1551319d735e264c8`. Live CDN/visual/audio acceptance remains in points 3–5.
2. **Full browser regression:** the manual `.github/workflows/full-browser-ci.yml` workflow (`npm test`) is separate from normal two-shard `@ci-smoke` CI. No completed full-browser run was found among the 100 newest workflow runs inspected for this report. It still needs a separately triggered run and outcome review via GitHub Actions > Full browser regression > Run workflow (select `main`); absence in this sample is **not proof that the workflow has never run**.
3. **Live Pages acceptance:** check real served music/SFX/model URLs and game load after deployment. Built `dist/` verification alone cannot establish CDN or autoplay behavior.
4. **Human visual/audio acceptance:** compare authentic Floor-6 boss and Ghoul arenas, intros, animation blending, camera, sounds, and V Combat Lab 60-Hz simulation / interpolated presentation. CI cannot judge whether a clawswipe sounds convincing.
5. **Real-device performance:** measure FPS/latency and Babylon/DOM resource lifetime in intended browsers/hardware. No FPS gains are claimed from this cleanup, and no quality reductions or new caps were applied.
6. **V.003 release gates:** the cursed special-floor portal, authored deeper progression and individual Floor-10 pass are still planned or partial. The Great Cleanup is **not** the V.003 feature-completion milestone.

## 5. Safe handoff to the next ChatGPT session

Start with `main` + latest PRs + CI. Read `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/GAME_BIBLE.md`, `docs/ROADMAP.md`, `docs/ASSET_OWNERSHIP.md`, and this evidence-led closeout. For source candidates run `npm run audit:modules` (warnings require manual trace); for asset/Pages moves run `npm run build && npm run verify:pages` (D1 #242 is merged). Never infer an absent function from its name or delete a slow browser test to improve dashboard optics.

**Next engineering priority after verified closeout:** return to V.003's actual gameplay design gates (special shop portal, meaningful connected floors, ten-day campaign and true hero-equipment impact) in separate design-approved PRs. Keep FPS profiling evidence and visual/audible acceptance explicit.
