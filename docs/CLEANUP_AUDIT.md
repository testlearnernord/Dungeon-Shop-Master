# The Great Cleanup — Audited baseline (Phase A1)

> Evidence snapshot: **2026-11-21**, `main` commit [`366835babf84`](https://github.com/testlearnernord/Dungeon-Shop-Master/commit/366835babf84cab8b23a14fdaf6a5f238409feea), after **merged PR #234**. This is an evidence inventory and risk register, **not** a claim that cleanup or exhaustive static analysis is complete. Source code, tests, manifests and build scripts take precedence over historical PR narration.

## Safety contract

No gameplay feature, 60 Hz combat calculation, visual interpolation, animated model, camera intro, music, SFX, active save/reload behavior, or GitHub Pages path may be changed just to improve folder aesthetics. Never automatically merge cleanup PRs. Full relevant CI and owner review are required before merging each subsequent PR.

## Reproducible inventory

All numbers are derived from the GitHub recursive Git tree at the baseline SHA, including committed files only; directory objects are counted separately.

| Inventory item | Count / tracked bytes |
| --- | ---: |
| Tree entries | 480 (460 file blobs, 20 directory entries) |
| Total file blob bytes | 107,355,788 |
| `src/` | 176 files, 1,472,434 bytes |
| `tests/` | 189 files, 989,299 bytes |
| `tests/unit/` | 120 files |
| Browser `*.spec.ts` in `tests/` | 64 files |
| `public/` | 52 files, 42,847,701 bytes |
| `assets/` | 5 files, 33,729,214 bytes |
| `docs/` | 14 files, 473,593 bytes |
| Root `README.md` | 40,837 blob bytes |
| Root `AGENTS.md` | 55,798 blob bytes |
| GLB files | 12 |
| WAV files | 21 (Ghoul pack; 11 additional Cave Troll cues are MP3) |
| MP3 files | 22 |

Tree contents are **not** the same as the GitHub-reported repository storage or a production download size. Binary assets and Git history require separate accounting.

## Verified runtime/build boundaries

- `src/game/worldClock.ts`: a single persisted 50 ms world tick; ordered scheduled lanes. Dungeon, shop, and combat remain authoritative while optional viewing is read-only.
- `src/game/combatEncounter.ts` and `src/game/groupCombat.ts`: the deterministic combat step is 1/60 second. `src/game/liveDungeonRuntime.ts` schedules progression on the shared world time. No second fight engine may be introduced in cleanup.
- `src/game/developerCombatLab.ts` uses the production group-combat motor and `LiveGroupCombatArena`. `src/game/developerCombatPresentation.ts` keeps 10 Hz recorded checkpoints but interpolates display poses smoothly. Never render raw checkpoints as the presentation rate (PR #233 regression).
- `src/game/dungeonReplayPlayback.ts`: read-only historical replay projection. The LIVE dungeon's map is abstract; detailed fights load only upon deliberate arena observation.
- `src/gameSfxSamples.ts` and `src/sfxCatalog.ts`: the PR #234 Ghoul sample/cue inventory. Existing `public/audio/sfx/ghoul/` contains 21 WAV files; `public/audio/sfx/cave-troll/` contains 11 MP3 files.
- `vite.config.ts` uses `/Dungeon-Shop-Master/` as the deployment base. Asset path changes must pass a Pages build and actual URL checks.
- `package.json`: both `predev` and `prebuild` generate two GLB outputs. Neither output is a committed input. See below for source dependencies.

### Important asset classification

| Path | Classification | Evidence / handling |
| --- | --- | --- |
| `public/audio/no-safe-passage.mp3` | Runtime asset | Resolved by `src/soundtrack.ts`; **keep** |
| `No Safe Passage.mp3` (root) | Identical binary copy / provenance candidate | Exact same Git blob SHA `a911c4a43359e98229d281d6a985bf75701e07f3` as runtime version; the **only** exact duplicate SHA found across tracked blobs. Do not remove until owner/source handling is decided |
| `tripo_convert_ad846d87-3b98-4c37-a128-20fc302b37c7.glb` (root) | **Required generator input** | Hardcoded in `tools/asset_generation/merge_tripo_grab_throw.mjs`; removing or relocating without changing the generator breaks `npm run build` |
| `public/assets/models/ashen-tunnel-mauler-tripo.glb` | Required curated generator input | Same Troll script reads it; generated combat model retains original animation quality |
| `assets/tripo/source/tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788.glb` | Required original Ghoul source | Read by `consolidate_tripo_ghoul.mjs` |
| `assets/tripo/source/tripo_convert_6edd4581-b0ef-49c3-9b0d-ebbee934e866.glb` | Required Ghoul idle source | Read by `consolidate_tripo_ghoul.mjs`; not a complete replacement for the original animation file |
| `assets/tripo/source/tripo_convert_ccb6e0dc-612d-460c-9bed-804e863d9706.glb` | Archived source, **preserve pending provenance review** | Described in `ashen-tunnel-mauler.manifest.json`; large does not imply unused |
| `public/assets/models/ashen-tunnel-mauler-tripo-combat.glb` | Build-generated output, not committed | Produced by `merge_tripo_grab_throw.mjs` |
| `public/assets/models/dungeon-ghoul-tripo.glb` | Build-generated output, not committed | Produced by `consolidate_tripo_ghoul.mjs` |
| `public/audio/sfx/ghoul/` | Runtime audio, preserve all 21 | PR #234 owns shared playback mapping |

No asset was moved or deleted in this audit. Semantic duplication among different GLB containers cannot be proven using byte hashes alone.

## Documentation contradictions (confirmed)

1. `docs/GAME_BIBLE.md` said “No Ghoul-specific recorded SFX pack exists yet”. That was false after merged PR #234, which added 21 WAV files. A focused correction is part of this PR.
2. `README.md` and `docs/ROADMAP.md` still open with historical PR #218/#220 branch planning and previously pending boss integration, despite later #227–#234 changes. Historical text must not be interpreted as current status.
3. `docs/THE_LIVING_DUNGEON.md` still says PR #211 is in development and references an older release checkpoint. Verify the active build label separately instead of inferring shipping status from this note.
4. `docs/ARCHITECTURE.md` and `AGENTS.md` are heavily front-loaded with chronological PR logs (respectively ~97 KB and ~56 KB). Their first sections are poor machine-readable entry points. Replace them with concise present-tense contracts in Phase A2, retaining valuable historical evidence where necessary.
5. Source inspection confirms the important #233 separation of sandbox motor frequency, recorded checkpoint cadence and presentation interpolation. Do not regress this distinction in docs or code.

## CI and evidence limits

- `.github/workflows/ci.yml`: PR-triggered `npm ci`, `npm run build`, `npm run test:unit`, two independent Chromium smoke shards.
- `.github/workflows/deploy.yml`: `main` pushes produce the GitHub Pages deployment.
- `.github/workflows/full-browser-ci.yml`: the complete Playwright browser suite runs **on manual dispatch only**, not on every PR.
- At this baseline: the PR #234 GitHub CI run concluded **success**; the merge commit's GitHub Pages deployment run concluded **success**. This does **not** establish full browser regression, subjective Ghoul SFX mixing, or local-device FPS acceptance.
- Not yet verified: full import/export reachability for every module; semantic duplicate code; unused interfaces; event/listener leak profiling; browser auditory/visual parity. Label these findings **unverified**, not “safe to delete”.

## Candidate triage

| Status | Item | Rationale |
| --- | --- | --- |
| **Confirmed exact duplicate, not automatically disposable** | Root `No Safe Passage.mp3` | Same committed Git blob as the runtime version; original/source provenance and future import conventions need explicit resolution |
| **Required** | Root Troll grab/throw GLB | Script references it directly at build time |
| **Required** | Two Ghoul generator source GLBs | Both are hardcoded build inputs |
| **Required** | 21 Ghoul WAV + 11 Troll MP3 | Runtime cues and their tests depend on them |
| **Potentially historical** | Older milestones in roadmap, PR paragraphs in guides | Narrative can move to Git history/archive once present-tense documentation is verified |
| **Unverified** | Export/file/module dead-code candidates | Full cross-import/call-graph and dynamic-load audit pending |

## Proposed separately reviewable PR sequence

- **A1 (this PR):** baseline evidence, false Ghoul SFX claim, warning links on historically misleading docs. **Documentation-only**.
- **A2:** reduce `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `GAME_BIBLE.md` and `ROADMAP.md` to verified, present-tense contracts; archive only truly needed prior detail; maintain a clear CURRENT / PARTIAL / PLANNED / REJECTED / HISTORICAL distinction.
- **B1:** audio classification, runtime paths and source retention; decide root MP3 dedupe with unchanged audio bytes and automated Pages checks.
- **B2:** GLB source/build/runtime classification; preserve original sources, graft scripts and all clips; only then consider path migration with generator and model tests.
- **C1–C2:** static import/call analysis and narrowly scoped code consolidation (world state, combat projection, UI/renderer ownership), one domain per PR. Dead-code claims require negative references **plus** tests and dynamic-load evaluation.
- **D:** test redundancy evidence, full CI/browser regression, asset URL checks, final repository hygiene and before/after measurements.

## Acceptance and non-claims

This phase only establishes a **source-verified audit snapshot** and selected documentation corrections. It does **not** assert that unused code was deleted, assets reduced, all documents rewritten, or all regression tests executed. Future PRs must report changed paths, file-by-file risks, test runs, CI URLs, remaining caveats, and owner approval before merging.

**Verified baseline CI:** [PR #234 CI](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44845016880) | [GitHub Pages deployment](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44845506607).
