# Ashen Tunnel Mauler · Tripo 3D asset audit

**Source:** user-exported `tripo_convert_8abe2288-7e4b-485c-abf8-a983c3533dd9.glb` from 2026-11-17, generated from the approved Cave Troll concept. This is a technical curation; not a visual quality sign-off or a runtime boss replacement.

## Inventory

| Variant | Status |
| --- | --- |
| High-poly `orc warrior 3d model.glb` | 68.7 MB, about 1.93M triangles; source only |
| Retopo-only `orc warrior 3d model (1).glb` | ~13 MB, 19,645 triangles, unrigged |
| Previous `tripo_convert_dd203763-6b97-45f2-9821-5e9bc39de139.glb` | ~13.4 MB, skinned with 20 clips |
| `orc warrior 3d model (2).glb` | ~14.5 MB, skinned **without animations**, do not substitute |
| **Newest source** `tripo_convert_8abe2288-7e4b-485c-abf8-a983c3533dd9.glb` | 14,923,028 bytes, 33 clips, 65 joints, 19,645 triangles |
| **Curated** `ashen-tunnel-mauler-tripo-curated.glb` | 11,343,256 bytes, 12 selected clips, 65 joints, 19,645 triangles |
| Existing shipped `public/assets/models/ashen-mauler-sculpt.glb` | Keep as the working game boss until the Tripo replacement is approved |

The new source contains the previous 20 clips plus later attempts. Its XZ hip translation is constant in the inspected clips, so **Stay in Place** is effective. The source and curated SHA256s are recorded in `assets/tripo/ashen-tunnel-mauler.manifest.json`.

## Animation curation (preliminary)

| Curated clip | Intended use |
| --- | --- |
| `idle_combat` | Fighting stance |
| `walk_heavy` | Primary walk candidate, from `walk.001` |
| `walk_aggressive` | Alternative walk candidate, from the later arms-down aggressive walk |
| `run_charge` | Charge only, not normal movement |
| `attack_2h_swing` | Two-handed attack; hammer grip untested |
| `attack_slam` | Hammer impact; visual timing untested |
| `ready_2h_weapon` | Weapon-ready stance |
| `hit_light` / `hit_heavy` | Hit reactions |
| `stagger` | Stagger reaction |
| `roar` | Enrage or shout |
| `death_fall` | Non-looping death |

The other 21 clips remain in the owner's full archival export, **not in the curated file**. They include failed walk prompts, alternative reactions, rocket attacks, lifting, jumping, scratching and fleeing.

**Measured real foot motion:** vertical travel of the left/right foot relative to the hips, model units:

- `walk.001`: 0.084 / 0.093 (alternate stepping; strong candidate)
- aggressive arms-down walk: 0.089 / 0.076 (alternate stepping, loop seam needs checking)
- `run.001`: 0.139 / 0.150 (too fast for regular pursuit)
- `langsame gehbewegung, massiger großer troll.001`: 0.003 / 0.005 (**reject as walk**)
- long text-prompt "walking aggressively holding a hammer": 0.002 / 0.004 (**reject as walk**)
- long text-prompt "holding a hammer over the head": 0.001 / 0.001 (**reject as walk**)

These figures establish *some* leg movement, not convincing weight, foot planting or seamless locomotion. Use the existing in-game `Inspect Tripo GLB` viewer to assess them before mapping real boss phases.

## Reproduce the curation

Run from the repo root, using the unmodified 33-clip source:

```bash
python -m pip install Pillow
python tools/asset_generation/consolidate_tripo_troll.py \
  "tripo_convert_8abe2288-7e4b-485c-abf8-a983c3533dd9.glb" \
  public/assets/models/ashen-tunnel-mauler-tripo.glb --resize-color
```

The script selects twelve actual existing animations and renames them, removes unreferenced animation buffers and downsizes only the 4096px BaseColor texture to 2048px. The skin, 2K normal/metallic-roughness maps and source model geometry remain. It validates the resulting GLB structure and prints hashes.

## Merge gate and asset rights

**The binary is not part of the PR until it is actually committed at the intended path.** The current functional model and generic in-game viewer must not be removed. Runtime boss switching, weapon binding, replay stability and frame-to-frame animation quality are separate review gates.

The model was generated in the owner's Tripo AI account, with a paid subscription later canceled. Review the actual generation-time license before public distribution; no exclusivity is assumed.
