# Dungeon Shop Master · Monster Asset Pipeline

> Reviewed against Alpha v40, main after #374 (25 November 2026). Ghouls and the unique Cave Troll are integrated; visual/audio acceptance remains separate.

## Identity comes before code

A monster is not finished because its stats resolve or the combat engine
accepts `monster`. Before any new species can be called implemented:

1. **Design / concept sign-off:** one coherent visual character sheet,
   including front/side/back or three-quarter views and a clear silhouette.
   Define habitat/floor, scale against real hero height, temperament and
   recognizable threat. Obtain explicit visual approval before committing a
   final identity. No generic horror stock art masquerading as original art.
2. **3D model:** importable, clean GLB derived from the approved concept,
   sensible topology/materials, no floating detached limbs, correct origin,
   facing, collision radius, ground height and consistent meter scale.
   Test in the actual Babylon scene and spectator camera, not only a gallery.
3. **Rig and animation clips:** at minimum idle, walk/run, attack windup,
   contact/swing, hit reaction, death and transitions. Check feet remain
   planted, root motion and gameplay positions agree, hit timing and
   animation contact cues align and clips blend smoothly.
4. **Sound identity:** own movement, vocal/idle, attack whoosh, hit/impact,
   hurt and death assets. Generate and listen to each candidate, cut unwanted
   silence/artefacts, avoid borrowed boss files and legacy placeholder SFX.
   Bind to genuinely recorded cues; no audio triggered by inventing combat.
5. **Engine integration:** connect authored GLB, animations, sounds, scale,
   gameplay subtype and abilities through a single declarative species
   mapping. Retain only one encounter authority in `groupCombat.ts` and
   one replay authority in the saved GroupCombatReplay. No second HP clock,
   ad hoc actor AI or duplicate legacy species adapter.
6. **Acceptance and cleanup:** inspect movement, attack, death and fade
   during real dungeon replay; ensure deterministic recorded combat and
   strict current-format Save/Load. Verify asset references resolve in
   production Pages. Remove obsolete placeholders for the integrated
   species. Run targeted unit plus browser smoke plus visual preview,
   then update `AGENTS.md`, `GAME_BIBLE.md`, `ARCHITECTURE.md`,
   `ROADMAP.md`, README and this asset contract.

## Ability ownership: shared code is not shared monster lore

- **Cave Troll:** the cinematic grapple/lift/throw is his distinctive
  boss skill. The shared combat engine implements the physics,
  counterplay and replay metadata for the actual Floor-10 party encounter.
- **Ordinary regenerated elites:** can be tougher and use a telegraphed
  `heavy` strike, but **never gain the Troll's grab/throw automatically**.
- No legacy solo recording format is accepted in Alpha v40.
- A future other boss can use a mechanically related grip only after
  a specific authored identity, distinct animation/sounds and explicit
  approved design. Capability flags are not random loot tables.

## Cave Troll visual effects in the shared 3D spectator

The authored Cave Troll remains the shared presentation quality reference. Optional
`LiveGroupCombatArena` playback now constructs one bounded
`caveTrollImpactVisual.ts` mesh/light pool for each actual Troll identity.
Its attack-sector telegraph, shockwave, 16 reusable rock fragments and flash
sample the existing `bossStrikeGeometry` and `sampleMaulerImpact` curves from
**committed** group actor phases. Authored Tripo melee clips and the heavy
slam sound variation use the real recorded `troll-slam` ability; a throw
cannot invent a smash hit or spawn additional damage.

This system renders **only when the player explicitly watches a fight**
or opens V Developer Combat Lab. The LIVE dungeon map remains abstract,
and neither animation nor sound is a combat authority. Browser tests
assert the full Troll impact stage exists in the Lab. Audible quality,
frame pacing and final artistic sign-off still require human review.

## Ghoul first playable runtime pass: still needs visual and audio approval

The owner supplied a rigged retopologized Tripo Ghoul GLB with 14 clips,
plus a later **separate** 1-clip `idle_combat` export.
Both original source GLBs and their hashes remain archived in
[`TRIPO_GHOUL_ASSET_AUDIT.md`](TRIPO_GHOUL_ASSET_AUDIT.md) and
[`assets/tripo/ghoul.manifest.json`](../assets/tripo/ghoul.manifest.json).
`predev/prebuild` now losslessly consolidates all 15 animations into
`public/assets/models/dungeon-ghoul-tripo.glb`; no altered source
archives or throwaway generated code enter version control.

**CURRENT runtime:** `dungeonLayout.ts` spawns only Ghouls in ordinary
spatial encounter sites across Floors 1–9. `dungeonGhoulVisual.ts`
loads the actual 65-joint textured rig in recorded combat, chooses
walk, windup/leap, claw, stagger, death or idle clips from the REAL
`GroupCombatReplay` phase age, and hides the primitive loading fallback
once ready. The room layout keeps its genuine walkable graph and
combat collision authority, with separate crypt tomb/pillar/ghostflame
cosmetics in `ghoulCryptArt.ts`.

**Still required for the finished monster:** actual player screenshot
approval of model direction, height, feet/ground contact, which side
each claw strikes, animation transitions and visual hit timing;
Ghoul-specific attack, movement, hurt and death SFX are integrated (21 WAVs); verify the mix. Texture-size
optimization and browser/performance spot-check on real hardware.
The emitted 15-clip runtime is a playable **first integration**, not
a declaration that every clip is polished. The Cave Troll's authored
grapple/throw remains exclusively his; the Ghoul has no inherited throw.

## Replay and pacing

All live encounters and the isolated Combat Lab use the same 60-Hz group motor, hero attributes, gear, tactics, defense and physical retreat policy. Enemy abilities and terrain may differ; hero rules do not. There is no elapsed-time fight cap. After 30 seconds without an effective HP cue or measurable retreat advance, the shared progress policy requests retreat; persistent blockage can resolve as a recorded stalemate. Combat can cross day boundaries. Stored positions are capped at 2,401 frames, preserving the initial frame and latest minute at 10 Hz; older positions are thinned, not the combat events.

LIVE entry from World Echoes, map or hero view goes directly to the current committed fight with HUD and camera available. The world continues. Local recorded playback and Combat Lab retain optional cinematics (ordinary 5.2 s, boss 13.5 s); Dungeon Viewer LIVE music requests the corresponding cue with a 1.1 s crossfade, and its manual skip supports both scores. Acoustic and visual acceptance of the final changes remains open.

The saved world clock replaces fixed morning/midday/evening stages or artificial daily contact quotas. Never pad footage or infer damage from a visual effect.
