# The Dungeon Reforged — implementation contract

Baseline production revision: `fe3477576f92fb924bcdde7b3fb8da86baa1b88c` (Alpha v48). Baseline audit #393 passed all ten relevant jobs. Phase 2 candidate replaces the generator and requires a fresh Alpha v49 campaign. The release name is a working title.

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

The candidate carves four or six variable rectangular chambers in a seeded orientation, then a cyclic perimeter of actual corridors with optional cross-link on six-room maps. Both stairs are excluded from the unchanged 8/4/4 site budget. No empty blind corridor branches are authored. Room and corridor tiles, spatial actors, movement, stairs, combat and renderer contracts stay shared. Geometry changes invalidate old saved indices; v48 is explicitly incompatible. Visual themes and permanent modification remain out of scope. The room graph is not a second runtime navigation model.

1. Replace maze-first generation with seeded room-first geometry: landmark rooms, meaningful optional branches and multiple inter-room connections. Preserve the canonical tile contract and initial feature budgets where possible; distinguish meaningful inter-room loops from grid cycles inside rooms.
2. Validate deterministic connectivity, boundary walls, rectangular dimensions, unique reachable features, both stairs and bounded distances across seeds and ordinary floors. Revisit tests whose old maze/dead-end assumptions encode retired design.
3. Audit all navigation, visibility, party travel, threats, encounter geometry, stair routes, serialization and observation consumers. Adapt shared contracts, not individual compensating hacks. Use actual known routes; never grant omniscience.
4. Compare matched long campaigns; investigate changes in death exposure, depth, return times and crafting throughput. Validate browser observation, table handoff and replay on the same maps. No merge on failing critical invariants.
5. Introduce room purposes, visual themes and permanent modifications only after the new static geometry works. Any persistent topology mutation requires explicit authoritative geometry state/revision, path invalidation and historical geometry handling; seed-only reconstruction would no longer suffice.
