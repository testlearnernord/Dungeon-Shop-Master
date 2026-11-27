# The Dungeon Reforged — implementation contract

Baseline production revision: `fe3477576f92fb924bcdde7b3fb8da86baa1b88c` (Alpha v48). Baseline audit #393 passed all ten relevant jobs. The merged Phase 2 rectangular room-first generator is the Alpha v49 comparison reference. The shaped-chamber candidate requires a fresh Alpha v50 campaign. The release name is a working title.

## Observed architecture and risks

- `dungeonLayout.ts` carves a DFS maze and overlays rooms; down stairs choose the most distant room by grid distance. The rectangular bounds helper uses width for both axes. This was the baseline architecture. The replacement carves rectangular sectors using independent axis bounds.
- `dungeonTopology.ts` defines ordinary Floors 1–9, unique Floor-10 party boss and the unnumbered cursed shop. Do not silently add Floors 11–100 or bypass the gate.
- `spatialDungeonExploration.ts` owns personal visited tiles and real adjacent steps; nearest-frontier selection depends on geometry. More room tiles can increase exploration time despite shorter routes. `dungeonThreatDecisions.ts`, `heroPerception.ts`, `dungeonMonsterWorld.ts`, party formation and the LIVE scheduler must share the same traversability and line of sight.
- Ordinary combat samples local walkable cells around real contacts; the geometry also determines arena capacity, pack strength seeds and elite classification. Keep the shared 60-Hz engine and test encounter exposure and retreat in changed geometry.
- `dungeonWorldState.ts` persists per-floor heroes, resolved sites and monster state; the geometry is derived from the campaign seed. Site IDs and tile indices are coupled to save validation and recorded footage. When generation changes, explicitly bump the campaign schema; no old-save migration.
- `dungeonStairways.ts`, `liveFloorSpectator.ts`, `galviksTableDiorama.ts`, `dungeonViewer.ts`, minimap, surfaces and replay must project the same layout and coordinates, not reconstruct separate maps or grant gameplay authority to rendering.
- Loot, real returns, material buyback, forge, paid gear and credit form a coupled economy. Hold their rules fixed for the initial matched experiment, then adjust only where evidence supports it.

## Baseline and acceptance

Use the existing production GameStore audit, seeds 42, 7351, 9321, 2026, 100 completed days and its existing 200-day Forge cases. Report geometry, grid cycles (including room interiors), unrewarded degree-one tiles, stairs distance, sampled floor/tile/room occupancy, combat exposure by role and pack, death, deepest floor, returns, shop turnover, material ledgers and forged sales. Heatmaps count sampled occupancy, not actual path transitions. Stationary samples are not proof of deadlock. Existing storefront automation is optimistic and does not execute the Babylon pedestrian motor or human timing; visual/fun acceptance requires separate browser/manual checks. No balance claim before completed artifacts.

## Room-first candidate and acceptance gate

The v49 reference carves four or six variable rectangular chambers in a seeded orientation, then a cyclic perimeter of actual corridors with optional cross-link on six-room maps. Both stairs are excluded from the unchanged 8/4/4 site budget. No empty blind corridor branches are authored. Room and corridor tiles, spatial actors, movement, stairs, combat and renderer contracts stay shared. Geometry changes invalidate old saved indices; v48 is explicitly incompatible. Static visual themes are now a separate presentation slice; permanent modification remains out of scope. The room graph is not a second runtime navigation model.

1. Replace maze-first generation with seeded room-first geometry: landmark rooms, meaningful optional branches and multiple inter-room connections. Preserve the canonical tile contract and initial feature budgets where possible; distinguish meaningful inter-room loops from grid cycles inside rooms.
2. Validate deterministic connectivity, boundary walls, rectangular dimensions, unique reachable features, both stairs and bounded distances across seeds and ordinary floors. Revisit tests whose old maze/dead-end assumptions encode retired design.
3. Audit all navigation, visibility, party travel, threats, encounter geometry, stair routes, serialization and observation consumers. Adapt shared contracts, not individual compensating hacks. Use actual known routes; never grant omniscience.
4. Compare matched long campaigns; investigate changes in death exposure, depth, return times and crafting throughput. Validate browser observation, table handoff and replay on the same maps. No merge on failing critical invariants.
5. Introduce room purposes, visual themes and permanent modifications only after the new static geometry works. Any persistent topology mutation requires explicit authoritative geometry state/revision, path invalidation and historical geometry handling; seed-only reconstruction would no longer suffice.

## First candidate evidence (Alpha v49)

Run [46005785013](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/46005785013): three 100-day seed groups, both 200-day Forge runs and all four controlled boss matrices succeeded. Seed 7351's grouped 100-day job reached day 100 in absent mode, then emitted no final report before the 60-minute job cancellation; the cause is not yet established. Split that seed into independent mode jobs and persist each completed report before logging. Full candidate unit run: 810/845 passed; browser smoke and build passed. Several failures concern outdated version and item expectations; compare remaining failures against the actual baseline, do not infer a runtime regression or delete assertions merely from a failed test. Prior results are not final visual or balance acceptance.

## Room art slice

Four cosmetic styles share one deterministic room plan and mesh factory: the largest chamber by actual open footprint is the hall, a remaining chamber with the most existing treasure sites is the vault, and remaining rooms alternate crypt and guardroom. This does not create treasure or alter existing sites. Props use free wall-backed convex corners of the actual footprint; both observers use identical local art transforms, while the table disposes full-scale lights. Replay and subjective observation preserve their existing room-centre fog gate. The art-only slice did not bump the schema, change gameplay, add assets or consume campaign RNG. Core tests cover deterministic placement; the existing browser observer test compares rendered room IDs, themes and child geometry. Manual art quality and future functional rooms remain open.

## Shaped geometry candidate (Alpha v50)

The existing seeded sector and perimeter graph remains the topology authority. Selected rooms have clipped corners; larger landmark rooms can have cruciform footprints. Straight runs gain up to one (small floors) or two (large floors) genuine 2x3 passing bays where the grid permits. No isolated alcoves, blocked centre axes, new obstacles, extra monsters, additional treasure or parallel navigation system. The 8/4/4 site budget remains unchanged; reserve unused treasure candidates per actual chamber before fallback. Room dimensions now describe bounding boxes; shared dungeonRoomContains and dungeonRoomCells read the actual canonical room tiles for art placement and occupancy telemetry. All renderers, minimaps, stairs, LOS, combat and paths still use the same grid. Version 49 is rejected, no migration.

Acceptance: core checks and real browser observation; short focused simulation if a concrete gameplay concern warrants it. The owner explicitly rejected routine 100/200-day runs for incremental changes. Existing v49 evidence is a reference, not a mandatory new audit for every geometry iteration. Reserve manual long-run comparisons for major balance milestones. No final balance claim from core CI alone. Manual visual quality and functional room mechanics remain open.

## Functional room slice A (prepared after the shaped geometry candidate)

`dungeonRoomPurpose.ts` owns the shared deterministic chamber classification. Vaults prefer existing treasure sites and their chests yield at least two of the ordinary items (maximum three). A sufficiently large floor from Floor 5 may have a Forgotten Workshop where a real chest already exists; the first of its normal one-to-three items is iron ore or coal. Other rewards, gold, XP, monster loot and site regeneration are unchanged. Existing party ownership, physical chest contact, buyback and forge settlement remain authoritative. Room art uses the same purpose and supplies cosmetic workbenches/anvils. No new persisted fields, items or unlock flags. Functional guardrooms, crypts, halls and unique discoveries/blueprints remain future work. No long-run campaign gate for this incremental slice.

## Visual polish

Room footprints now provide wall-backed relief panels, worn banners or plaques, thematic trim, floor inlays and shared textured stone/wood materials. Corridors get a bounded seeded set of wall-mounted jambs and lanterns. Both observation scales use the same local geometry, while replay enables passage art only at its existing fog tile. Passage props have no extra point lights, colliders, interactions or gameplay effect. The shared map viewer uses a darker ambient baseline and stronger local room lighting. Functional discoveries and new hero behavior are deferred until visual acceptance. Manual screenshots and GPU performance still need review.
