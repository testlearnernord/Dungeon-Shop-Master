# Ghoul (ordinary monster) · Tripo source audit

**Status: first playable runtime integration, final visual/audio sign-off pending.**
The author's two unmodified Tripo source exports are both preserved.
Predev/prebuild now losslessly grafts the standalone Idle into the
14-clip source to produce
`public/assets/models/dungeon-ghoul-tripo.glb`.
The ordinary spatial dungeon now spawns only Ghouls and the
Babylon replay loads their real skinned 65-joint 15-clip visual,
driven by actual recorded fight frames (no new battle motor).
The surrounding dungeon has an independent burial crypt art style.
Until the player inspects actual screenshots/animations we do not
claim correct foot planting, scale, facing, attack alignment or
complete unique Ghoul SFX.

## Verified original

- Original upload: `tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788 (1).glb` (previously deposited at repository root).
- Canonical archive: `assets/tripo/source/tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788.glb`. Git blob is **reused byte-for-byte**; no model recompression or animation deletion.
- SHA-256: `966c8d9f9911989073a8c062ea5d26f51ec7b1a18309f4677e771c0cd3776c83`; 8,196,428 bytes.
- GLB 2.0 (Tripo), 1 textured triangle mesh, **19,789 triangles**, position accessor 26,973 vertices, **65-joint Mixamo-style skin**, 14 animation clips.
- Embedded images: 4096×4096 base color, 2048×2048 normal, 2048×2048 metallic/roughness. For runtime consider 2K base color, with visual approval.
- Semantic clip map and all exact source names live in [`assets/tripo/ghoul.manifest.json`](../assets/tripo/ghoul.manifest.json). Catalog aliases are NOT yet names written inside the archived GLB.

## Later Idle export: verified, one clip only

- Later user upload: `tripo_convert_6edd4581-b0ef-49c3-9b0d-ebbee934e866.glb` (7,106,304 bytes) archived **in addition to** the full 14-clip original. Git blob SHA: `28a716469aaab2e23ed98a3df23ffd5ce5183e13`.
- **CI inspected the binary:** 19,789 triangles, 65 skin joints, **exactly one new animation** named `A feral undead ghoul stands in a low, hunched combat stance, br` (Tripo's truncated label). It is the requested Combat Idle. None of the previous 14 clips are in this later export. The original export preserves them.
- Candidate assembly is reproducible by `node tools/asset_generation/consolidate_tripo_ghoul.mjs <output.glb>`; it grafts only the Idle animation samples into the 14-clip source and renames the appended track `idle_combat`. It does not put a finished Ghoul into the game or modify either archived original.

## Animation candidates (source indices, zero-based)

| Clip | Alias | Duration | Assessment |
| --- | --- | ---: | --- |
| 0 | `walk_predatory_v1` | 4.958 s | rejected: Owner reported poor result; archive only |
| 1 | `attack_leap_a` | 3.958 s | candidate: Multistage attack candidate; confirm contact and landing |
| 2 | `attack_claw_left_initial` | 2.958 s | alternate: Longer initial left-arm slash; compare against clip 8 |
| 3 | `hit_stagger` | 1.958 s | candidate: Short hit reaction; inspect recovery |
| 4 | `jump_down_preset` | 3.708 s | unused: Do not use as Ghoul jump without visual inspection |
| 5 | `walk_preset` | 2.333 s | fallback: Humanoid preset; owner found preset gait too human |
| 6 | `dribble_preset` | 9.292 s | unused: Unrelated preset |
| 7 | `attack_claw_right` | 1.958 s | candidate: Measured right arm and forearm rotation dominates |
| 8 | `attack_claw_left` | 1.958 s | candidate: Measured left arm and forearm rotation dominates |
| 9 | `death_fall` | 3.958 s | candidate: Non-looping death; check final floor contact |
| 10 | `attack_leap_b` | 3.958 s | alternate: Alternate multistage leap; compare against clip 1 |
| 11 | `run_aggressive` | 1.958 s | candidate: Inspect actual leg motion and loop seam |
| 12 | `attack_charge` | 1.958 s | candidate: Short rush, not a substitute for repeatable run |
| 13 | `walk_feral_v2` | 4.958 s | candidate: Later shortened prompt; owner reported improvement |

**Important:** The initial `predatory_stalk_v1` walk was rejected by the owner. The humanoid preset `walk_preset` is fallback only. `walk_feral_v2` is the later improved walk. `attack_claw_right`/`attack_claw_left` are **tentative arm assignments based on measured joint-rotation magnitudes**, not manually approved strike direction or timings. The original 14-clip source contains no idle; the newer standalone 1-clip source **does** provide combat Idle and can be grafted into this rig.

## Quality / integration gates still open

- Inspect front, side and rear model orientation, floor origin, collision radius, silhouette and skin weights in Babylon.
- Visually inspect all candidate clips, including whether left/right claw attacks contact a hero, and verify clean walking/sprinting loops. Source clip durations do not prove seamless loops.
- Root hip X/Z translation is near zero for most clips, but root position alone does **not** prove foot planting: bone rotations can still produce skating. Keep movement owned by the existing combat/navigation motor.
- Review the **15-clip assembled candidate** using the reproducible merge script. Later curate approved candidates into a compact runtime GLB with stable semantic names; do not edit or prune the archived sources. `public/assets/models/dungeon-ghoul-tripo.glb` remains a proposed runtime path, **not committed or shipped**.
- Produce, approve and integrate original Ghoul movement, attack, hit, vocal and death SFX; run actual spectator replay and performance tests before spawning any Ghoul.
- Cave Troll's existing archive, gameplay and model viewer remain untouched.

Source-of-truth gameplay and acceptance gates: [`MONSTER_ASSET_PIPELINE.md`](MONSTER_ASSET_PIPELINE.md).
