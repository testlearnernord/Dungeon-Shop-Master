# One cursed shop portal and consistent mined surfaces

> Current contract: Alpha v43 (Observed Threat Memory).

## One physical entrance/exit

- `shopPortal.ts` owns the **one** shop doorway at X = **-4 m**, its inside/outside thresholds, the 2.4 m corridor and distinct traffic lanes (incoming X = -4.57 m, outgoing X = -3.43 m). Shopkeeper, NPC traffic and clearance tests refer to these same constants.
- The obsolete right opening near X = +4 m is **permanent colliding rock**. No saved actor can select `level4` or `level6` as a gate, the old second corridor and animated right barrier are removed, and an older Alpha save is not converted.
- `npcVisualSystem.ts` owns actual Babylon motion and the single moving `cursed-portal-door`; `npcTraffic.ts` owns lane yielding, spawn spacing and congestion recovery; `shopTraffic.ts` stores a strict single-door `doorY.portal` checkpoint. None of these calculate loot, checkout, gold or expedition decisions.
- A character departing physically still finishes the real outside crossing. Autonomous dungeon return and off-duty rotation remain the separate authoritative LIVE world-clock decision.

## Identical space reserved for blueprints and traffic

- `SHOP_PORTAL_BUILD_CLEARANCE` blocks the live doorway and approach. `SEALED_PASSAGE_BUILD_CLEARANCE` protects the permanent right rock plug. These are physical **no-build footprints** shared with `shopLayoutProblem`.
- `furniturePlacement.ts` and the P/N blueprint UI use the same authoritative `GameStore.previewFurniturePlacement` / `placeFurniture` contracts; a forbidden preview is red/invalid, and clicking cannot commit it.
- Existing shelf/counter collisions, staff service reachability, checkout queues, actor occupancy and excavated floor support remain mandatory. This change does **not** permit furniture on solid rock or in a corridor merely because the Blueprint ghost can be aimed there.
- Wall-mounted objects still respect their own support validation; no mount is invented on the sealed rock. Mineable wall faces still have actual pick geometry.

## Shop, cellar, mining, dungeon surfaces

- `dungeonSurfaces.ts` still bakes exactly **three** deterministic material textures per Babylon scene: stone, flagstone and timber. No new texture asset, RNG consumer or lighting system was introduced.
- `caveSurfaceProjection.ts` defines **2 m per texture repeat** from world XYZ. `applyCaveWorldUV` uses actual mesh positions and face normals, not each box's width/depth.
- Original shop floor/walls/ceiling, new 1 m mined floor/ceilings/exposed faces, cellar floor/walls and the read-only dungeon floor spectator now share the authored stone/flagstone family. The spectator remains a distinct overview with tinted room squares; it is **not** a claim that the top-down tiles are a seamless first-person continuous world.
- Excavation topology stays renderer-independent in `shopRoomGeometry.ts` and `shopWallFaces.ts`: only real connected side-rock cells can be removed. `shopRoomVisuals.ts` continues rebuilding only changed rock/floor meshes, not the full cave or the gameplay world.
- Cave world-space UV projection applies to **unrotated box geometry only**, not the rotated cellar ramp or decorative timber. No changes to physical footprints, mining cooldown, tool costs, player collisions or excavation saves.

## Alpha save policy

Alpha v43 is the only supported campaign schema. Reject v42 and earlier explicitly; no migration or legacy adapter. Current-format Save/Load must be deterministic. The room, one portal and hero place keys are canonical; the old numerical shop/transit aliases are removed.

## Checks

- Unit tests: singleton portal lane/path, no-build footprint, actual Blueprint preview + commit rejection, strict traffic checkpoint + old-format rejection, world UV continuity across original/mine/cellar and old combat/checkout contracts.
- Browser smoke: one physical visible portal, permanently sealed right rock, normal NPC arrival and departure, existing checkout/visitor/clock/cellar suite.
- Build and Pages verification, module graph and strict current-save roundtrip must remain green.

**Manual sign-off still required:** mine both shop wings and the cellar on a real GPU, check texture scale and seams with torches on; try P/N repositioning over both gate footprints; cross the true portal, jam the gate with simultaneous customers, test the former right tunnel, and evaluate FPS/lighting. Automated tests cannot certify beauty.
