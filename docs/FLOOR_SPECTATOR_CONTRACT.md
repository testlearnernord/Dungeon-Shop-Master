# Floor LIVE Spectator Contract (PR #223 design handoff)

Status: **PR #223 establishes the boundaries and fixes LIVE party gait.**
The floor selector, per-hero clicks and subjective perception are **NOT implemented** by this document. They belong to #224–226. The opt-in Level-6-quality combat arena integration belongs to #227–231.

## Source of truth, read boundary and clocks

- Authoritative world: `GameStore.state`, `worldClock.tick`,
  `liveDungeon`, each floor's `Level7World.heroes`, `dungeonParties`,
  and the one authoritative set of `LiveDungeonCombat` states.
- Read-only projections: `selectLiveSpectatorFrame` today, and a future
  `selectLiveFloorSpectatorFrame(state, floor)` when #224 is implemented.
  Projections may select/filter/copy saved data, never run AI, combat or RNG.
- One selected floor at a time. Valid playable spatial floor keys today:
  1, 2, 3, 4, 7. Other floors and the cursed special floor must be
  explicitly supported by gameplay before being offered in the selector.
- The floor overview may intentionally reveal all **committed** positions to
  the Dungeon Shop Master. Hero knowledge is separate, does not inherit
  spectator observations and must not leak to passive merchant Board reports.
- One world clock keeps the shop, dungeon exploration and 60Hz combats alive.
  An optional viewing/camera/render update is never a simulation tick.
  Saved/reloaded data must be bit-for-bit independent of watching.
- Boss combat still has a separate authoritative solo motor. #229 must
  migrate it to one shared motor using parity tests before retiring anything.

## Data contract for #224

A pure `FloorSpectatorFrame` projection (not persisted, not the Board)
should expose:

- `floor`, `worldTick`, `day`, `layoutKey`
- `heroes[]`: stable hero ID, committed x/z checkpoint, role, current
  actual HP, equipment, gold/inventory, goals/intentions from *existing*
  saved records, saved party ID/member IDs and current activity; no
  invented information or default goals presented as truth
- `combats[]`: real saved fight ID and site, committed actor IDs and
  latest frame reference, and whether the fight is still running
- `features[]`: saved/seeded geometry and feature state as a spectator
  layer, not individual hero discoveries
- `knowledgeByHeroId`: read-only **per-hero** visited/visible data,
  never the union silently passed back to the hero AI

Do not derive hero positions by taking one focused actor's x/z for every
other actor. Read each hero's saved checkpoint from its floor world. Multiple
independent parties and solo explorers must coexist on the same map.

## UI and interaction for #224–226

1. Main toolbar selects a **floor**, never an individual hero tape.
   A detached **Replay archive** is still available to deliberately load
   historical expedition footage with its own local playback clock.
2. Dungeon map renders every committed hero/party on the selected floor.
   Group colors/markers must have unambiguous, selectable IDs.
3. Picking a hero opens a detail panel, adjusts only presentation fog to
   that hero's current and visited cells and follows their saved position
   if requested. Deselecting restores the neutral full-floor overview.
4. Clicking a real committed fight beacon enters the existing opt-in
   `LiveGroupCombatArena`; returning resumes the **same** floor, selected
   hero and map camera. No combat results may be resimulated on transition.
5. All object picking must have clear collision/priority between hero icons,
   combat beacons and the neutral map. Input on HUD controls must not be
   interpreted as world picking.

## Current reusable adapter, no new movement engine

- `liveSpectator.ts`: single-hero LIVE projection today. #224 should
  reuse its saved world and fog/visibility filters, not clone a resolver.
- `dungeonReplayScene.ts`: cheap abstract Babylon map and recorded route
  presenter; `dungeonViewer.ts` manages the map and archive view and
  switches one opt-in 3D fight scene.
- `livePartyPresentation.ts` (PR #223): pure, **cosmetic** adapter from
  two committed adjacent party checkpoints into a bounded 0.85s gait.
  No move when a checkpoint stays put, members change, a fight begins,
  the floor changes or steps were missed. Rendering at 60FPS is allowed
  to move meshes **only** along the known saved edge, never change state.
- `recordedTemporaryPartyFormation`: immutable historical party
  formation and its replay-local clock, not a second live movement source.
- `combatSpectatorStage.ts`, `combatHudProjection.ts`,
  `LiveGroupCombatArena`: existing Level-6-based visual fight stage/HUD.
  Visual reuse does **not** unify the separate authoritative combat motors.

## Legacy removal checklist

After the floor selector is working and covered by tests, remove the mixed
`#dungeon-replay-select` LIVE-hero + archived-tape chooser and obsolete
single-hero-only UI paths. Preserve the Board's explicit LIVE entry point,
which should open the relevant floor with that hero preselected. Preserve
the archived `openReplayAt` entry point in a separate archive. Only then
remove dead UI listeners, fixtures and documentation. Never delete the
Level-6 motor or regress saved combat to a graphical-only encounter.

## Required verification

- Pure tests: unchanged checkpoints, adjacent movement, member/floor/fight
  transitions, independent membership ordering, stable per-hero positions.
- Browser: selected floor shows two independent parties and solo actors,
  hero click/deselect, fog/view isolation, LIVE combat/beacon transition,
  return camera/selection and archive separation.
- Save/reload and watched/unwatched simulations have identical HP, loot,
  RNG, actor steps, deaths and clocks. No expensive per-fight model
  allocation in the neutral floor view. Build, unit suite and two
  Playwright browser smoke shards required before merge.
