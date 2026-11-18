# Ghoul (ordinary monster) · Tripo source audit

**Status: archived source only, NOT integrated into the game.** This is the user's current Tripo export, not a final Babylon-ready curated GLB. Keep the complete original for future animation selection. The existing ordinary monster spheres and combat data remain unchanged.

## Verified original

- Original upload: `tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788 (1).glb` (previously deposited at repository root).
- Canonical archive: `assets/tripo/source/tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788.glb`. Git blob is **reused byte-for-byte**; no model recompression or animation deletion.
- SHA-256: `966c8d9f9911989073a8c062ea5d26f51ec7b1a18309f4677e771c0cd3776c83`; 8,196,428 bytes.
- GLB 2.0 (Tripo), 1 textured triangle mesh, **19,789 triangles**, position accessor 26,973 vertices, **65-joint Mixamo-style skin**, 14 animation clips.
- Embedded images: 4096×4096 base color, 2048×2048 normal, 2048×2048 metallic/roughness. For runtime consider 2K base color, with visual approval.
- Semantic clip map and all exact source names live in [`assets/tripo/ghoul.manifest.json`](../assets/tripo/ghoul.manifest.json). Catalog aliases are NOT yet names written inside the archived GLB.

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

**Important:** The initial `predatory_stalk_v1` walk was rejected by the owner. The humanoid preset `walk_preset` is fallback only. `walk_feral_v2` is the later improved walk. `attack_claw_right`/`attack_claw_left` are **tentative arm assignments based on measured joint-rotation magnitudes**, not manually approved strike direction or timings. A separate proper combat idle was **not** found in this archive.

## Quality / integration gates still open

- Inspect front, side and rear model orientation, floor origin, collision radius, silhouette and skin weights in Babylon.
- Visually inspect all candidate clips, including whether left/right claw attacks contact a hero, and verify clean walking/sprinting loops. Source clip durations do not prove seamless loops.
- Root hip X/Z translation is near zero for most clips, but root position alone does **not** prove foot planting: bone rotations can still produce skating. Keep movement owned by the existing combat/navigation motor.
- Curate the candidate clips into a separate runtime GLB with stable semantic names; don't edit or prune the archived source. `public/assets/models/dungeon-ghoul-tripo.glb` is only a proposed output path, **not a committed artifact**.
- Produce, approve and integrate original Ghoul movement, attack, hit, vocal and death SFX; run actual spectator replay and performance tests before spawning any Ghoul.
- Cave Troll's existing archive, gameplay and model viewer remain untouched.

Source-of-truth gameplay and acceptance gates: [`MONSTER_ASSET_PIPELINE.md`](MONSTER_ASSET_PIPELINE.md).
