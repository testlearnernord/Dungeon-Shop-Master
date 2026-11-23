# Floor LIVE Spectator — current contract

> Reconciled 22 November 2026. The original PR #223–#231 handoff and obsolete “not implemented” entries are preserved in Git history. This file documents the **actual projection boundary**, not an instruction to implement already-shipped selectors.

## One source of truth

- The saved `GameStore.state`, `liveDungeonRuntime.ts`, `worldClock.ts`, per-floor exploration checkpoints and `dungeonParties` own heroes, combat, resource changes, portals, and time.
- `selectLiveFloorSpectatorFrame(state,floor)` / `selectLiveSpectatorFrame(state,heroId)` derive **read-only** representations. They never make travel decisions, allocate loot, change RNG, run another fight or fill private hero knowledge.
- Ordinary **Floors 1–9** use the same live floor-world and seeded map semantics. The unique **Floor-10** Cave Troll is a saved 2–3-hero party encounter. Galvik's `cursed-shop` realm is not numbered Dungeon Floor 5.
- Visual observation may show **committed** floor facts while the passive shop Board remains restricted to plausible reported knowledge. Watching is never an information source for AI movement.

## LIVE map

- Show actual saved hero positions, health/equipment relevant to that view, party memberships, intentions, resolved sites and running fight beacons. Each hero has an individual saved checkpoint; never project one actor's tile onto all party members.
- Readable chests, traps, monsters and stairways use **seeded physical coordinates**, not fabricated resource rolls. Stairs on ordinary Floors 1–9 are real landmarks; Floor-9 descent must still pass the saved party/permit gate before a battle starts.

- **Shared observation orientation:** `dungeonObservationOrientation.ts` owns +Z north, unrotating north-up canvas/minimap hit-test projection, default LIVE yaw/pitch/distance, and the table-local front-to-LIVE alignment. The shop player's approach to the table is furniture-local +Z, whereas the LIVE camera faces from -Z. Its diorama child receives a documented 180° local observation rotation while the parent retains arbitrary P/Q/R furniture placement. The same saved x/z tiles and authored props remain intact. No new camera transition, save migration, AI or world state is introduced.
- The floor camera can pan, orbit, tilt, zoom and restore north. Knowledge-safe short route previews come only from the hero's actual saved plan/route. The map does not autorun combat or warp a hero when viewed.
- Camera movement, scene props, Babylon caching and diff-based redraw are **presentation**. The 50-ms shop/world clock and 60-Hz actor authority proceed independently while the viewer is open.

## LIVE battle and historical recordings

- Clicking a genuine committed combat beacon opens the existing opt-in `LiveGroupCombatArena` / shared spectator stage, not a separate combat solver. It may replay or follow committed actor frames.
- Normal Ghoul/multi-hero fights and the Floor-10 Troll share the `groupCombat.ts` motor. The latter has actual saved **partyBossCombat** state, death links and a shared **partyBossReplay** record.
- Opening the World Feed's Floor-10 boss result uses `DungeonViewer.openRecordedPartyBoss`; the **Expedition Archive** routes that same tape there. Its team, win/loss and 60-Hz cues remain immutable. Do not send it to the old solo BossReplay-v1 viewer.
- The historical **Level-6 solo** *training preview* remains available but current Alpha v35 campaigns do not produce or load the obsolete solo battle events. New regular Floor-6 recordings use the general dungeon replay and the Floor-10 boss uses the true party replay. The current world boss remains the real Floor-10 party encounter.
- Event timelines contain today plus two previous days; up to 12 explicitly pinned real recordings persist. No new footage may be manufactured for a marker that has no saved frames.

## Identity, UX and accessibility

- Use the same worldwide Hero Card, role indicators, equipment symbols and health semantics in shop, roster, floor and combat side roster. Different views can show only information legitimately available in that mode.
- Show a compact party strip in fights without covering world HP plates and cinematic camera action. Normal fights and boss intros have separate framing.
- Clicking HUD controls never becomes a map click. Existing auto-follow targets, replay controls, watch/return buttons and hero inspection must remain usable with mouse/keyboard.
- Dispose heavy 3D actors and scene resources on close/change while preserving the saved battle and the player's last selected map orientation.

## Acceptance

- Floor selection, individual hero/fight focus and scene interpolation never change world data or tick frequency.
- Save/Load resumes actual portal transit, party formation, combat and original replay result without new reward/HP mutations.
- Verify Floor 5 and 6 as **normal dungeon maps**, the Floor 9 lower stair party gate and Floor 10 original group footage.
- Validate physical rendering and performance with browser smoke and manual real-device inspection; unit tests alone cannot approve quality.

[Architecture](ARCHITECTURE.md) · [Game Bible](GAME_BIBLE.md) · [Legacy audit](LEGACY_OBSOLESCENCE_AUDIT.md)
