# Asset ownership — runtime, sources and generated outputs

> B1 merged as PR #237; B2 proposes byte-exact relocation of the required Troll Grab/Throw source. This is an asset path/provenance contract, not an audio/visual quality sign-off. See [Great Cleanup audit](CLEANUP_AUDIT.md) and [Monster Asset Pipeline](MONSTER_ASSET_PIPELINE.md).

## Runtime soundtrack: exact stable paths

| Music scene | Canonical runtime file |
| --- | --- |
| Shop / The Lean Season | `public/audio/the-lean-season.mp3` |
| Abstract dungeon / Beneath the Surface | `public/audio/beneath-the-surface.mp3` |
| Ordinary fight / No Safe Passage | `public/audio/no-safe-passage.mp3` |
| Boss / Desperate Measures | `public/audio/desperate-measures.mp3` |

`src/soundtrack.ts` uses `import.meta.env.BASE_URL + "audio/" + filename`; Vite's GitHub Pages base is `/Dungeon-Shop-Master/`. The four canonical served MP3s must remain at their current URLs and must not be re-encoded, renamed or replaced by cleanup.

### Exact duplicate removal (B1 merged as #237)

Before this PR, `No Safe Passage.mp3` in the root **and** `public/audio/no-safe-passage.mp3` have the same Git blob SHA `a911c4a43359e98229d281d6a985bf75701e07f3`, each **7,152,000 bytes**. The root path is not the music load target. B1 removed the **root duplicate only**. The exact music bytes remain in `public/audio/no-safe-passage.mp3` and in Git history. This saves 7,152,000 bytes from the *current tracked tree*, **not** automatically the repository's historical Git storage.

Other root-level MP3 songs have no proven byte-identical runtime duplicates and are **not** being removed or renamed.

## Creature SFX

- `public/audio/sfx/ghoul/`: **21 WAV files** used by LIVE, replay and V Combat Lab through recorded group cues.
- `public/audio/sfx/cave-troll/`: **11 MP3 files** supporting the original Troll cinematic and attacks.
- `src/gameSfxSamples.ts` and `src/sfxCatalog.ts` declare the approved sample paths and cues. `src/game/groupCombatSfx.ts` derives opt-in Ghoul cues from actual motor events. `src/gameSfx.ts` owns gain, mute, preload, panning and throttling, **never** gameplay decisions.
- Existing `tests/unit/gameSfxSamples.test.ts` checks all **32** creature sample files. The 32 binaries stay unchanged.

## Tripo and generated models

| Asset path / class | Role | Safeguard |
| --- | --- | --- |
| `assets/tripo/source/tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788.glb` | Original Ghoul export | Required build source |
| `assets/tripo/source/tripo_convert_6edd4581-b0ef-49c3-9b0d-ebbee934e866.glb` | Ghoul combat idle source | Required build source |
| `assets/tripo/source/tripo_convert_ad846d87-3b98-4c37-a128-20fc302b37c7.glb` | Archived Troll Grab/Throw source, original Git blob `d1f42cc107cc733d94874c7315871373e0071f75` | Required build source; DO NOT delete |
| `public/assets/models/ashen-tunnel-mauler-tripo.glb` | Curated Troll input | Required build source and model comparison |
| `public/assets/models/ashen-tunnel-mauler-tripo-combat.glb` | Merged combat runtime model | Build-generated; ignored |
| `public/assets/models/dungeon-ghoul-tripo.glb` | Consolidated Ghoul runtime model | Build-generated; **newly ignored by B1** |
| Other original GLBs in `assets/tripo/source/` | Provenance archives | Preserve until substantive rig/clip audit |
| Other `public/assets/models/*.glb` | Committed game assets | Preserve; not all are generator outputs |

Both generated combat models are produced by `npm run dev` / `npm run build` pre-scripts on clean checkouts. Removing source exports or relocating them without updating generators would break the build, whether or not a developer has an old generated model locally.

## Rules for subsequent cleanups

- Classify source, runtime, generated and preview files separately. Hash-identical assets are not automatically safe to remove without checking code and source provenance.
- Preserve all approved audio and animated model bytes, all clip names and 65-bone rig constraints.
- Update build inputs, runtime URLs, manifests and browser tests **together** for any future move.
- Test with a fresh production build, unit tests, Pages-compatible audio and actual browser playback. The full visual/audible sign-off is not proven by byte hashes.
- Never migrate to Git LFS or rewrite history without separate owner approval.
