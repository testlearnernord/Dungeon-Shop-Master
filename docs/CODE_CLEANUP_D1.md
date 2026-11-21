# Phase D1 — production GitHub Pages artifact verification

> **D1 merged as PR #242**, 21 November 2026. Its built-asset check and Pages deploy succeeded ([run 44889663336](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44889663336)). No gameplay source, animation, music, model or 60-Hz timing was changed.

## Measured CI baseline

The four completed, successful PR CI runs prior to D1 (44885924573, 44886377430, 44887908314 and 44888389226) show:

| Required job | Observed durations |
| --- | --- |
| Build + all unit tests (+ import graph where present) | 55–65 seconds |
| Playwright browser smoke shard 1/2 | 246–254 seconds |
| Playwright browser smoke shard 2/2 | 212–313 seconds |
| `npm ci` in individual runners | 3–5 seconds |
| `npx playwright install chromium` | 7–10 seconds |
| Vite/TypeScript build itself | 2–3 seconds |

The long checks are **real Playwright execution**, not package installation or TypeScript compilation. Deleting slow browser coverage merely to shorten CI is not acceptable. Keep both independent shards and all `@ci-smoke` tests.

## Exact D1 safeguard

The old source-level tests proved that `public/audio/` source files existed, but did not check the **published** `dist/` bytes or the generated Troll/Ghoul combat models. This PR adds `tools/maintenance/verify_pages_dist.mjs`:

- Run **only after** `npm run build`, never before the two GLB generators.
- Parse the real Vite-built `dist/index.html`: all emitted JS and CSS references must begin with `/Dungeon-Shop-Master/` and point to files inside `dist/`; no development `/src/main.ts` placeholder may remain.
- Verify four canonical shop/dungeon/combat/boss soundtrack files, 21 Ghoul WAVs and 11 Troll MP3s. Automatically require byte-for-byte matching for **every** file under `public/audio/` and its published `dist/audio/` copy, including other soundtracks.
- Verify the curated Troll and both generated combat GLBs exist in `public/assets/models/`. Compare **all** model files byte-for-byte against their `dist/assets/models/` copies and validate GLB v2 headers and declared lengths.
- Fail the build job / Pages deployment on missing, changed, corrupt or incorrectly based assets. This is a **read-only, no-network** check; it does not re-encode audio, parse gameplay or call Babylon.

`tests/unit/pagesDistGuard.test.ts` tests isolated synthetic build trees: a valid Pages payload, a broken base path, a damaged soundtrack copy and invalid generated GLB bytes. Neither unit tests nor Playwright need a pre-existing `dist/` to run in isolation.

## Verification and explicit limits

The D1 PR triggers unchanged TypeScript/Vite + generators, existing unit suite and two independent browser shards, with an additional `verify:pages` step in `.github/workflows/ci.yml`. The same command runs immediately before `actions/upload-pages-artifact` in `.github/workflows/deploy.yml`. The actual deploy workflow completed successfully on merged `main` ([run 44889663336](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44889663336)), including `npm run verify:pages`, Pages artifact upload and deploy steps.

The script checks the built artifact **before upload**, not live network/CDN responses, autoplay behavior, audible mixing, timing, FPS or visual quality. Those need the separate full-browser workflow and human device review. It does not seek to shorten CI or remove smoke tests.

## Remaining Great Cleanup closeout

D2's separately reviewed [closeout ledger](GREAT_CLEANUP_CLOSEOUT.md) records the verified before/after Git-tree numbers, asset provenance and accepted CI/deploy evidence. The manually dispatched **Full browser regression**, actual Pages CDN checks and human visual/audio/performance acceptance remain open and must not be silently marked complete.
