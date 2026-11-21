# Phase C2 — TypeScript import-graph evidence, not automatic deletion

> **Review pending (#240)** on current `main` after C1 merged (#239), 21 November 2026.

## Motivation

Prior cleanup legitimately removed two retired night-only projections, but name-based searching and a text search are not reliable enough for the remaining battle, shop, Babylon or LIVE modules. Some apparent “legacy” paths still have live entrypoint callers. This is a small **maintenance-only** step: make the next round of unused-module classification reproducible without building a new runtime framework.

## Tool contract

Run `npm run audit:modules -- --json` locally or inspect the **Build and unit tests** GitHub Actions job log (the same command is run after unit tests). It reads `index.html` for production TypeScript entrypoints and scans all `src/**/*.ts(x)` plus `tests/**/*.ts(x)` using a small local, comment-aware token scanner. **TypeScript 7.0 no longer provides its old JavaScript Compiler API**, so the tool intentionally avoids a new compiler-version dependency; this is a conservative text-level audit, not an AST-verified result. It records import/export declarations, type imports and **literal** `import()` calls; then recursively follows local imports using the same source-path candidates used by the game.

The JSON intentionally distinguishes:

| Result | Meaning | Allowed action |
| --- | --- | --- |
| `entryReachableCount` | Number of source files reachable from actual HTML module entrypoints, **including type imports** for conservative classification | Keep. It does not prove a code path runs during every game |
| `testOnlyModules` | Source modules found by the scanned tests but not by the production entrypoint graph | Investigate. Testing a helper independently may be intentional, and a dynamic gameplay caller can still exist |
| `unreferencedModules` | Neither entry-reachable nor reachable from scanned tests | **Candidate only**. Search dynamic/reflection/asset/worker uses before a separate deletion PR |
| `unknownImports` | Non-literal dynamic imports or type imports, with file and source line | Manually trace; the graph cannot resolve computed paths |
| `unresolvedSourceImports` | A relative TypeScript-looking import could not be found in scanned TS/TSX paths | Investigate; TypeScript/Vite build is still the source of truth for resolving actual imports |

CSS, GLB, MP3, WAV, JSON and other asset imports are intentionally not classified as TypeScript modules. No data is uploaded; the script reads repo files and prints a report. The graph does **not** alter source, generated assets, world events, replay, combat, HUDs, sound or runtime memory. **Do not treat regex/token scanner reports as a complete call graph:** complex template interpolations and unusual syntax must be manually examined before claiming a module is dead.

## Test and acceptance

- The new `tests/unit/moduleGraphAudit.test.ts` fixtures verify static, type and literal lazy import reachability, test-only separation, and explicit computed/missing-import warnings.
- CI still requires **TypeScript/Vite build**, **all unit tests** and **both independent browser smoke shards**. Graph reporting is an additional quick read-only step in the existing build job; candidate lists do not block builds or trigger deletion.
- We tested the fixture tool against Node 22 with synthetic repos. The first GitHub CI showed the TypeScript 7.0 Compiler API is unavailable; C2 now uses a local, comment-aware lexer. The full clean-checkout CI rerun is the authoritative integration result.
- The job's report can guide C3's separately scoped module removals. No hardcoded candidate list or unsupported FPS/storage claim is included in this document because results should be read from the actual tested commit.

## Protected boundaries

Keep `gameState.advanceDay` for current day close/fixtures, `level6Combat.ts` and Troll/Group combat distinctions, physical shop exit, two-day rotations, live world clock, replay archive, source GLBs, authored cues, PR #233's interpolated Combat Lab, and the existing full smoke matrix. **No mass deletion from a graph report; human call-site review and fresh explicit merge approval for every follow-up.**

## Verified first clean-checkout report (C2 pre-lexer-warning fix)

The real **Build and unit tests** job in [Actions run 44887675777](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44887675777) completed successfully after switching away from the unavailable TypeScript 7 compiler API. Its read-only graph report identified:

- **166** TypeScript source modules in `src/`, with **165** conservatively reachable from `src/main.ts`.
- **1** test-only module: `src/game/liveBossEncounter.ts`. Its `prepareLiveBossEncounter` helper is imported by `tests/unit/liveBossEncounter.test.ts`; no production caller was found by this graph or a targeted code search. **Do not delete yet**: review how the current LIVE boss is actually constructed and whether this represents a disposable unused adapter, a testing fixture, or important design code.
- **0** completely unreferenced source modules.
- **0** unresolved relative TypeScript-looking source imports.

The first report also flagged several *false-positive* unknown static imports because the lightweight lexer saw a parameter named `from` in ordinary exported functions. The subsequent C2 commit now restricts `export ... from` scanning to real named/star reexports and adds a regression fixture. This repairs warning quality without changing entrypoint reachability. Remaining computed imports and runtime references still require manual inspection.

**Conclusion:** no evidence supports mass TypeScript-file removal. C3 should target the **single** test-only boss adapter by comparing it directly to the real LIVE boss constructor, or investigate duplicate function-level responsibilities in small focused PRs. Do not conflate source-file reachability with unused exports, render-loop costs or gameplay performance.
