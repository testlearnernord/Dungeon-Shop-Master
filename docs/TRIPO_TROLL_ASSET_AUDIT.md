# Ashen Tunnel Mauler · Tripo 3D asset audit

**Source:** The twelve-clip binary was curated from the earlier 33-clip export `tripo_convert_8abe2288-7e4b-485c-abf8-a983c3533dd9.glb`. The owner subsequently uploaded the **55-clip** `tripo_convert_ccb6e0dc-612d-460c-9bed-804e863d9706.glb`, archived at `assets/tripo/source/`. This is a technical curation, not a visual quality sign-off or runtime boss replacement.

## Inventory

| Variant | Status |
| --- | --- |
| High-poly `orc warrior 3d model.glb` | 68.7 MB, about 1.93M triangles; source only |
| Retopo-only `orc warrior 3d model (1).glb` | ~13 MB, 19,645 triangles, unrigged |
| Previous `tripo_convert_dd203763-6b97-45f2-9821-5e9bc39de139.glb` | ~13.4 MB, skinned with 20 clips |
| `orc warrior 3d model (2).glb` | ~14.5 MB, skinned **without animations**, do not substitute |
| **Newest source** `tripo_convert_8abe2288-7e4b-485c-abf8-a983c3533dd9.glb` | 14,923,028 bytes, 33 clips, 65 joints, 19,645 triangles |
| **Curated** `ashen-tunnel-mauler-tripo.glb` | 11,343,256 bytes, 12 selected clips, 65 joints, 19,645 triangles; checked-in Model Lab preset |
| **Latest archive** `tripo_convert_ccb6e0dc-612d-460c-9bed-804e863d9706.glb` | 18,416,560 bytes, 55 clips, 65 joints; full original retained in `assets/tripo/source/` |
| Existing shipped `public/assets/models/ashen-mauler-sculpt.glb` | Keep as the working game boss until the Tripo replacement is approved |

The earlier 33-clip source contained previous 20 clips plus later attempts. The newest 55-clip export preserves **all 12 curated animations exactly**, verified channel-by-channel across every keyframe. Mesh positions, normals, UVs, joint indices and skin weights also match. No re-curation is needed to retain those 12 motions. The remaining 43 clips are archived for later assessment, including rejected text prompts and alternate preset animations. Both exports have constant XZ hip translation, so **Stay in Place** removes root drift, not foot sliding. Original/archive SHA256s are recorded in the manifest.

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

Run from the repo root using the archived 55-clip source. The checked-in candidate was generated from the earlier 33-clip predecessor; regeneration from 55 clips selects equivalent motions but may differ in container metadata and bytes:

```bash
python -m pip install Pillow
python tools/asset_generation/consolidate_tripo_troll.py \
  "assets/tripo/source/tripo_convert_ccb6e0dc-612d-460c-9bed-804e863d9706.glb" \
  public/assets/models/ashen-tunnel-mauler-tripo.glb --resize-color
```

The script selects twelve actual existing animations and renames them, removes unreferenced animation buffers and downsizes only the 4096px BaseColor texture to 2048px. The skin, 2K normal/metallic-roughness maps and source model geometry remain. It validates the resulting GLB structure and prints hashes.

## Merge gate and asset rights

**The binary is checked in at the intended path** and selectable from the existing Model Lab. The functional combat model and generic local-import viewer remain unchanged. Runtime boss switching, weapon binding, replay stability and frame-to-frame animation quality are separate review gates.

The model was generated in the owner's Tripo AI account, with a paid subscription later canceled. Review the actual generation-time license before public distribution; no exclusivity is assumed.
