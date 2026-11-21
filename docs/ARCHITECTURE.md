# Dungeon Shop Master — current technical architecture

> Runtime module responsibilities re-verified through merged PR #241 (21 November 2026); D1 artifact verification is merged and deployed (#242); D2 closeout is a documentation-only review draft (#243). This document describes **present runtime responsibilities**, not proposed PR order. Inspect referenced modules and tests before modifying them. See [audit](CLEANUP_AUDIT.md), [Game Bible](GAME_BIBLE.md), [Roadmap](ROADMAP.md) and deep specialist contracts for details.

## 1. Execution model and ownership

```text
Browser input / shop interactions
            |
       GameStore and validated GameState mutations
            |
       one persisted WorldClock + ordered world events
          /           |              \
 physical shop    dungeon hero AI     live 60-Hz combat ticks
  movement        / floor steps        group + unique Troll
          \           |              /
             committed state / events
                |         |
        knowledge-safe    immutable recordings
         Board / HUD      / timeline
                \         /
            Babylon / DOM / audio views
              (read-only presentation)
```

- `src/main.ts` wires rendering, player input, UI and the world. `src/game/gameStore.ts` is the outer mutation boundary; `gameState.ts` defines the current state and `SIMULATION_VERSION = 24`.
- `worldClock.ts` persists a monotonic tick and ordered future events, with 50-ms ticks, 20 ticks per game minute and 28,800 ticks per game day. Stable lane/sequence ordering is part of determinism. Gameplay events, not Babylon frames, advance customers, timed dungeon steps and combat.
- `liveDungeonRuntime.ts` schedules one connected spatial dungeon step every **600 world ticks** and commits batches of **30 actual 60-Hz fight ticks** every **10 world ticks**. The unique Floor-6 boss also persists real fight state through this world clock. The live boss is constructed via `createCombatPreview` in `liveDungeonRuntime.ts` and uses `stepCombatPreview` at 60 Hz, **not** the unused group-combat `liveBossEncounter.ts` adapter audited for retirement in [C3](CODE_CLEANUP_C3.md).
- `gameStore.ts` records actual player and shop actions, physical shop-exit events, accepted credit, paid cart settlement, save operations and bed closure. Day closure does not reroll live expeditions.

**Authority vs presentation:** no HUD, board, arena, particle effect, preview, music timer or replay may call game-progressing combat AI for authoritative outcomes. Render interpolation, camera easing and scene animation do not write HP, loot, purchases or hidden world information.

## 2. Authoritative modules

| Domain | Responsibility | Current modules |
| --- | --- | --- |
| World and saves | State contract, deterministic time/events, strict persisted validation | `gameState.ts`, `gameStore.ts`, `worldClock.ts`, `liveDungeonRuntime.ts`, `campaignSave.ts` |
| Physical commerce | Inventory, carts, genuine register transaction, debt, arriving/departing shoppers | `economy.ts`, `shopCarts.ts`, `shopCredit.ts`, `customerCheckout.ts`, `shopArrivals.ts`, `shopTraffic.ts` |
| NPC travel and service | Saved visitor locations/waypoints and exclusive shelf/queue reservations, visuals follow simulation | `npcVisualSystem.ts`, `shopperNavigation.ts`, `shopServiceSpots.ts`, `checkoutQueue.ts` |
| Shop layout | One furniture registry, placement validation, mined room, service reachability | `furnitureRegistry.ts`, `furniturePlacement.ts`, `furnitureBlueprint.ts`, `level5Room.ts`, `shopServiceReachability.ts` |
| Individual heroes | Persistent stats, equipment, medium-term intentions, voluntary parties | `adventurers.ts`, `dungeonDecisions.ts`, `dungeonParties.ts` |
| Spatial dungeon | Seeded Floors 1–4 and 7, connected rooms, stairs, site generations and returns | `dungeonLayout.ts`, `level7Exploration.ts`, `dungeonRegeneration.ts`, `liveDungeonRuntime.ts` |
| Ordinary fights | 60-Hz actor mechanics, group encounters, combat cues, real multi-Ghoul packs | `combatEncounter.ts`, `groupCombat.ts`, `combatMelee.ts`, `combatMovement.ts`, `combatActionClock.ts`, `combatTactics.ts` |
| Unique boss | Level-6 Cave Troll states, signature attacks, lava/grab/throw, boss recordings | `arenaCombatMotion.ts`, `bossCombatReplay.ts`, `level6Combat.ts`, `combatGrapple.ts` |
| Observation | One limited-knowledge merchant projection and committed-only spectator | `liveBoardProjection.ts`, `liveFloorSpectator.ts`, `rosterView.ts` |
| Recorded history | Bounded real highlights, separately sampled read-only dungeon/boss footage | `expeditionArchive.ts`, `replayRetention.ts`, `dungeonReplayPlayback.ts`, `dungeonViewer.ts` |

**Important distinction:** shared top-level `combatEncounter.ts` and reusable melee/tactics/movement helpers do **not** mean boss and ordinary encounter state, attacks and serialized frame schemas are identical. `groupCombat.ts` and `arenaCombatMotion.ts` retain different encounter-specific logic. Do not erase either because the other “looks redundant”. The older `simulateLevel6Combat` API and legacy fixture paths also require a caller/test audit before being classified as dead code.

## 3. Shop and economic truth

- A fresh campaign has no shelves; the player builds four-slot shelves. `furnitureRegistry.ts` and one placement validator govern mount, collisions, reachability and legal commit. An editor preview is **not** a persistent placement.
- The physical customer motor owns enter/browse/consider/queue/leave positions and claims; its authoritative checkpoint is `shopTraffic.ts`. Babylon actors represent, never re-decide, those positions.
- Picking up goods reserves an **unpaid** cart. A successful staff-side cashier interaction makes a **real paid sale**, while explicit approval of credit writes a debt. Unpaid stock returns without false revenue when the day closes.
- A shop visitor is not off-duty merely because checkout finished: the saved real **outer-gate crossing** starts two complete subsequent days outside both shop and dungeon. Existing return/reentry policy retains prior stats and explored paths without phantom healing.
- Existing quote-based checkout APIs may be retained for legitimate callers/tests; never remove by filename alone.

## 4. Dungeon, combat, LIVE and replay

**Current spatial coverage:** `SpatialDungeonFloor` and `LIVE_SPECTATOR_FLOORS` explicitly enumerate **1, 2, 3, 4, 7**. The unique Cave Troll remains at **Floor 6**, with an independent specialized encounter state but a shared fixed-tick driver. Floors 8–10 and the new special-floor portal are not generally implemented just because the broader design mentions them.

- **Dungeon source:** seeded connected map, hero position, per-site resolution and renewal. Co-located voluntary Temporary Parties may fight together; actual actor HP, resources and records are per hero. A completed encounter and its loot settle only once per site/generation.
- **Group fights:** `groupCombat.ts` is the 60-Hz authoritative simulation. Special boss actions may reuse shared `combatGrapple.ts` mechanics; attacks do not hit solely because an animation looks plausible. Cues and committed actor poses are captured as real data.
- **Cave Troll:** `arenaCombatMotion.ts` holds the authentic individual boss encounter, including saved signature phases and lava. `level6Arena.ts` projects the original cinematography, HUD and historical frames without altering the fight.
- **Observation:** `liveBoardProjection.ts` is the single spoiler-safe Board source. `DungeonViewer` has optional broader explicit LIVE floor views; maps represent battles as inexpensive beacons, not animated skinned fighters. Only deliberate **Watch LIVE fight** constructs the opt-in `LiveGroupCombatArena`. A LIVE witness does not pause, resimulate or settle the encounter.
- **Historical archive:** the former night-only `ledgerHeroChronicle.ts` and `ledgerSealedExpeditions.ts` projections are unreferenced in active application imports and retired in proposed C1. Their former role is handled by `liveBoardProjection.ts` and `expeditionArchive.ts` respectively. `expeditionArchive.ts` lists real committed highlights for **today plus the previous two days**. A bounded set of **12 manually retained recordings** can outlive rolling footage. `dungeonReplayPlayback.ts` projects saved frames on a separate local playback clock; seeking cannot change world state or play old SFX hits again.
- **Death:** only committed genuine HP transition can emit a spoiler-limited magical warning. An unknown offscreen event cannot be promoted to omniscient Board HP or a fabricated replay.

## 5. Rendering and performance boundary

- Babylon scenes, NPC visual interpolation, fight camera timelines and DOM HUDs read saved projections. Dispose scene listeners, textures, materials, animation groups and arena instances when leaving; avoid repeated registrations or extra RAF loops.
- **V Developer Combat Lab** (`developerCombatLab.ts`) is **unsaved** and invokes the actual production group motor, not a second authority. Fixed **60-Hz** fight steps produce retained poses every sixth step (**10 Hz** compact checkpoints). `developerCombatPresentation.ts` presents at browser refresh rate by interpolating between **already committed** poses with one-checkpoint delay (PR #233). Never snap actors to each newly saved frame or treat motor frequency as an FPS cap. In the group motor, tanks favor parry but can also roll on real Troll telegraphs. The group spectator now renders committed parry/dodge labels and physical hero pose changes, animated hand-attached Troll grabs/throws, and movement-based Troll footsteps. `GroupCombatSoundCursor` maps real boss combat cues to the existing Troll samples without rerolling strikes or replaying audio on seeks. **The specialized solo `arenaCombatMotion.ts` and group `groupCombat.ts` decision pipelines are not yet merged.** The group motor now supports an explicit `cave-lava` arena rule and emits true boundary damage; replay poses carry Troll smash/slam/grapple provenance so the unified viewer does not misanimate a heavy attack as an ordinary smash. Solo Troll cinematic keyframes and score-led cues are also available in the group spectator, and SFX Lab is accessible from V Developer Combat Lab. The remaining critical migration is making the real Floor-6 scheduler execute `groupCombat.ts` rather than `stepCombatPreview`, followed by retiring the old simulator as an authority.
- Ordinary opt-in arenas reuse `liveGroupCombatArena.ts` for LIVE and historical casts and the lab. Camera intro, health/damage overlays, actual equipment, Ghoul rig and animated opponent counts must not be degraded for “performance”. The same cinematic camera frames now drive one disposable `groupCombatIntroHud.ts` title card in the opt-in V/LIVE spectator, including the original Level-6 boss name and progress bar; world HP plates stay hidden until the film ends or is skipped, without hiding or altering committed combat data.
- Dynamic render resolution is a user choice; **Native** is default. Do not enable hidden 60-Hz drawing caps or reduce simulation precision to make statistics look better. [Performance investigation](PERFORMANCE_INVESTIGATION.md) is historical evidence; measure actual browsers again for new optimizations.

## 6. Asset and audio flow

```text
Committed original Tripo GLBs
   + curated runtime Tripo model
      -> npm predev/prebuild asset scripts
      -> ignored/generated combat GLBs in public/assets/models/
      -> Babylon glTF loader in opt-in battle
```

- `tools/asset_generation/merge_tripo_grab_throw.mjs` needs the archived `assets/tripo/source/tripo_convert_ad846d87-3b98-4c37-a128-20fc302b37c7.glb` plus curated `public/assets/models/ashen-tunnel-mauler-tripo.glb`, producing `ashen-tunnel-mauler-tripo-combat.glb`.
- `consolidate_tripo_ghoul.mjs` needs **two separate** archived Ghoul source exports in `assets/tripo/source/` to produce `public/assets/models/dungeon-ghoul-tripo.glb`. Neither source alone supplies the complete selected animation set. Keep the 65-bone skeleton contract.
- Ghoul **21 WAVs**, Troll **11 MP3s**, scene tracks and source preview files have distinct ownership. `gameSfxSamples.ts`, `sfxCatalog.ts`, `groupCombatSfx.ts` map committed motor cues to presentation-only audio through `gameSfx.ts`; `src/soundtrack.ts` owns scene transitions.
- The former root `No Safe Passage.mp3` was byte-identical to `public/audio/no-safe-passage.mp3`. B1 removed **only** the redundant root path; the canonical served song and its bytes stay intact. See [Asset Ownership](ASSET_OWNERSHIP.md) and the [dated audit](CLEANUP_AUDIT.md).
- Vite base `/Dungeon-Shop-Master/` must stay correct on GitHub Pages; move no asset without updating every runtime/script/test reference.

## 7. CI, verification and release state

`npm run audit:modules` extracts conservative static, type-only and literal dynamic TypeScript imports from the actual `index.html` entrypoint. It reports test-only, unreferenced and computed-import candidates for **manual review only**; it does not remove code or prove unreachable dynamic/reflection paths. See [C2 graph audit](CODE_CLEANUP_C2.md).

`npm run build` executes both asset generators, TypeScript type checking and Vite bundling. D1 #242 runs `npm run verify:pages` immediately after build in PR CI **and** the Pages deploy workflow: it checks final `dist/` JS/CSS URL base, canonical music, all 32 creature SFX and generated/curated GLB copies without changing runtime assets. See [D1 artifact contract](CODE_CLEANUP_D1.md). `npm run test:unit` runs Node tests, `npm run test:smoke` runs tagged Playwright checks; `npm test` runs full browser regression. GitHub Actions PR CI runs build/unit/two-browser-shard smoke; full browser regression is **manual**. Successful CI is not a substitute for real-device visual, audio or FPS acceptance.

The shipped HUD still labels the game **V.002 ALPHA**; V.003 remains a release target. The shared world clock, partial living dungeon, observed fights, LIVE spectator, updated SFX and post-shop rotation already exist and must **not** be described as merely planned. Remaining content and release gates are tracked only in [Roadmap](ROADMAP.md), not appended as PR-numbered sections here.
