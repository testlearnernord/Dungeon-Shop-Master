# Dungeon Shop Master · Monster Asset Pipeline

> **Production contract, 2026-11-18.** This is a workflow and acceptance
> checklist, not a claim that any ordinary monster asset is shipped. GitHub's
> current world has seeded `goblin`, `skeleton`, `slime`, and `cultist`
> encounter labels with actual simulated stats/AI, but the 3D spectator still
> uses anonymous primitive spheres for ordinary enemies. **No original
> animated ordinary monster model is production-ready.** The Tripo Cave Troll
> is a separately integrated unique boss, NOT the ordinary-monster template.

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
   save backwards compatibility. Verify asset references resolve in
   production Pages. Remove obsolete placeholders for the integrated
   species. Run targeted unit plus browser smoke plus visual preview,
   then update `AGENTS.md`, `GAME_BIBLE.md`, `ARCHITECTURE.md`,
   `ROADMAP.md`, README and this asset contract.

## Ability ownership: shared code is not shared monster lore

- **Cave Troll:** the cinematic grapple/lift/throw is his distinctive
  boss skill. The shared combat engine implements the physics,
  counterplay and replay metadata so a real party encounter can reuse
  the *technical code* when the unique boss is finally integrated.
- **Ordinary regenerated elites:** can be tougher and use a telegraphed
  `heavy` strike, but **never gain the Troll's grab/throw automatically**.
- **Historical v1 recordings** created before the correction may still
  contain the previous ability on a renewable elite; parse and replay
  them faithfully instead of silently rewriting the past. Do not grant
  that ability to any newly generated ordinary encounter.
- A future other boss can use a mechanically related grip only after
  a specific authored identity, distinct animation/sounds and explicit
  approved design. Capability flags are not random loot tables.

## Ghoul candidate: Tripo source archived, NOT integrated

The owner selected a retopologized Ghoul look and supplied a rigged Tripo GLB
with 14 raw animation clips. The **unaltered source**, its SHA-256 and the
candidate/rejected clip index are documented in
[`TRIPO_GHOUL_ASSET_AUDIT.md`](TRIPO_GHOUL_ASSET_AUDIT.md) and
[`assets/tripo/ghoul.manifest.json`](../assets/tripo/ghoul.manifest.json).
This is **source asset progress only**, not a shipped monster, a validated
runtime animation set, approved final combat role, or a spawn-pool change.
The original is archived outside `public/`; a future curated runtime GLB,
Idle, unique SFX, actual Babylon preview and replay tests are still needed.
Do not recycle the Cave Troll's animations or audio for the Ghoul.

## Replay and daily pacing contract

- The recorded dungeon has a bounded **36 actual tile movements** and
  up to **two real monster contacts** per committed day. A victory may
  lead to continued exploration unless injuries, casualties or supply
  shortages justify retreat. This makes many days materially longer,
  not just playback slowed down.
- Shorter recordings are still legitimate if heroes die, retreat or
  cannot find a path. Never pad the replay with fake fights, idle
  activities or simulated time that did not occur.
- Combat footage uses saved fixed-step frames. The viewer may interpolate
  presentation positions without rerolling HP, encounters or rewards.
- **Morning/Midday/Evening world snapshots are still future work.**
  The board must not claim actual hours or event phases until the
  authoritative day model records them explicitly.
