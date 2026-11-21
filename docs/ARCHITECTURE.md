# Dungeon Shop Master — current technical architecture

> Runtime responsibilities and the V.004 status were re-verified through merged PR #266 (21 November 2026). The older PR #241/D1 audit remains historical evidence, not the current head. This document describes **present runtime responsibilities**, not proposed PR order. Inspect referenced modules and tests before modifying them. See [audit](CLEANUP_AUDIT.md), [Game Bible](GAME_BIBLE.md), [Roadmap](ROADMAP.md) and deep specialist contracts for details.

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

- `src/main.ts` wires rendering, player input, UI and the world. `src/game/gameStore.ts` is the outer mutation boundary; `gameState.ts` defines the current state and `SIMULATION_VERSION = 26`.
- `worldClock.ts` persists a monotonic tick and ordered future events, with 50-ms ticks, 20 ticks per game minute and 28,800 ticks per game day. Stable lane/sequence ordering is part of determinism. Gameplay events, not Babylon frames, advance customers, timed dungeon steps and combat.
- `liveDungeonRuntime.ts` schedules one connected spatial dungeon step every **200 world ticks** (10 unpaused seconds) and commits batches of **30 actual 60-Hz fight ticks** every **10 world ticks**. All newly generated combat, including the unique Floor-6 boss, now steps the real `groupCombat.ts` motor at 60 Hz. Floor 6 uses `sharedBossCombat.ts` solely to project those confirmed group actor positions, HP, defense, throws and cues into the existing BossReplay-v1 film/ledger shape; that projection does not reroll AI, deal damage or own a separate fight clock. The obsolete `liveBossEncounter.ts` adapter was retired in C3.
- `gameStore.ts` records actual player and shop actions, physical shop-exit events, accepted credit, paid cart settlement, save operations and bed closure. Day closure does not reroll live expeditions.

**Authority vs presentation:** no HUD, board, arena, particle effect, preview, music timer or replay may call game-progressing combat AI for authoritative outcomes. Render interpolation, camera easing and scene animation do not write HP, loot, purchases or hidden world information.

## 2. Authoritative modules

| Domain | Responsibility | Current modules |
| --- | --- | --- |
| World and saves | State contract, deterministic time/events, strict persisted validation | `gameState.ts`, `gameStore.ts`, `worldClock.ts`, `liveDungeonRuntime.ts`, `campaignSave.ts` |
| Physical commerce | Inventory, independent saved Ore/Coal workshop reserve, carts, genuine register transactions, debt, arriving/departing shoppers, paid adventurer loot buyback | `economy.ts`, `shopCarts.ts`, `shopCredit.ts`, `customerCheckout.ts`, `dungeonBuyback.ts`, `dungeonLoot.ts`, `shopArrivals.ts`, `shopTraffic.ts` |
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
- **Cave Troll:** `groupCombat.ts` runs the real live and newly resolved Floor-6 Troll encounter with signature strike/grapple/throw and authored cave-lava rules. `sharedBossCombat.ts` adapts this *one authoritative actor state* to the older BossReplay-v1 frame format while `level6Arena.ts` preserves its camera, HUD, Tripo animation and immutable old recordings. `arenaCombatMotion.ts` retains pure historical/fixture mechanics and legacy types; new gameplay callers no longer step its private solo pipeline.
- **Observation:** `liveBoardProjection.ts` is the single spoiler-safe Board source. `DungeonViewer` has optional broader explicit LIVE floor views, real hero and encounter locators, and individual physical-loot inspection. Those controls only change observer focus, not AI or rewards. Maps represent battles as inexpensive beacons, not animated skinned fighters. Only deliberate **Watch LIVE fight** constructs the opt-in `LiveGroupCombatArena`. A LIVE witness does not pause, resimulate or settle the encounter.
- **Historical archive:** the former night-only `ledgerHeroChronicle.ts` and `ledgerSealedExpeditions.ts` projections are unreferenced in active application imports and retired in proposed C1. Their former role is handled by `liveBoardProjection.ts` and `expeditionArchive.ts` respectively. `expeditionArchive.ts` lists real committed highlights for **today plus the previous two days**. A bounded set of **12 manually retained recordings** can outlive rolling footage. `dungeonReplayPlayback.ts` projects saved frames on a separate local playback clock; seeking cannot change world state or play old SFX hits again.
- **Death:** only committed genuine HP transition can emit a spoiler-limited magical warning. An unknown offscreen event cannot be promoted to omniscient Board HP or a fabricated replay.

**LIVE map compass invariant:** dungeon world +Z is permanently north, but the observer camera has unrestricted 360-degree yaw. The compass projects this yaw onto a north needle. Camera-relative WASD moves intuitively on screen; clicking the compass restores north, and R restores orientation, pitch and zoom. This does not constrain cinematic fight cameras.

**LIVE floor visual props:** dungeonFeatureProps.ts creates recognizable wooden chests and spiked pressure plates as child meshes of the existing feature roots. dungeonGhoulMapInstances.ts loads the authored build-generated Ghoul GLB once per Babylon floor scene and shares its static render mesh at actual seeded monster sites; failures keep the old illustrated fallback visible. Only the opt-in dungeonGhoulVisual.ts combat actor samples the 15 authored animation clips. The pure LIVE dungeon world and shared 60-Hz combat tick owner are unchanged.

**LIVE floor update boundary:** `liveFloorSceneDiff.ts` classifies committed floor-geometry/fog changes separately from combat-only frame and HP changes. `DungeonReplayScene.showLiveFloor` preserves the real updated frame and HP metadata on every new checkpoint while skipping costly Babylon lights, route meshes, fog and minimap redraws unless a spatial fact changes. It must not gate `GameStore`, 60-Hz combat, arena frames, loot or clock events.

## 5. Rendering and performance boundary

- Babylon scenes, NPC visual interpolation, fight camera timelines and DOM HUDs read saved projections. Dispose scene listeners, textures, materials, animation groups and arena instances when leaving; avoid repeated registrations or extra RAF loops.
- **V Developer Combat Lab** (`developerCombatLab.ts`) is **unsaved** and invokes the actual production group motor, not a second authority. Fixed **60-Hz** fight steps produce retained poses every sixth step (**10 Hz** compact checkpoints). `developerCombatPresentation.ts` presents at browser refresh rate by interpolating between **already committed** poses with one-checkpoint delay (PR #233). Never snap actors to each newly saved frame or treat motor frequency as an FPS cap. In the group motor, tanks favor parry but can also roll on real Troll telegraphs. The group spectator now renders committed parry/dodge labels and physical hero pose changes, animated hand-attached Troll grabs/throws, and movement-based Troll footsteps. `GroupCombatSoundCursor` maps real boss combat cues to the existing Troll samples without rerolling strikes or replaying audio on seeks. The actual Floor-6 scheduler, atomic Level-6 result recorder, V practice preview, ordinary LIVE dungeon encounters and Developer Combat Lab now share **the same `stepGroupCombat` encounter authority**. The old BossReplay-v1 film continues to read a projection for historical compatibility. The historic `arenaCombatMotion.ts` solo stepper remains exported for existing pure fixtures and until its tests/replay code can be retired safely; it must not be reintroduced into any current gameplay progression. Arena hazards, authentic attack variants, SFX routing and committed reaction labels are shared. Innate healer magic has been restored in the same motor and is accounted for separately from purchased healing Herbs. A scene-specific optional `tacticsSeed` is stored with authoritative combat for reproducible Lab and Level-6 balancing; absent-seed ordinary dungeon fights retain their original ID-based decision stream. Tactical defense takes real actor phases and stamina into account; highly agile heroes can cancel an unfinished attack windup when a committed Troll telegraph threatens them, with smoothly increasing reaction skill rather than any rendered invulnerability. Remaining per-phase art and subjective camera/audio acceptance belong to the shared 3D spectator, never another damage resolver.
- Ordinary opt-in arenas reuse `liveGroupCombatArena.ts` for LIVE and historical casts and the lab. Camera intro, health/damage overlays, actual equipment, Ghoul rig and animated opponent counts must not be degraded for “performance”. The same cinematic camera frames now drive a disposable `groupCombatIntroHud.ts` title card in the opt-in V/LIVE spectator, including the original Level-6 boss name and progress bar. World HP plates remain hidden until the film ends or is skipped, without hiding or altering committed combat data. The camera director selects a 5.2-second four-transition tactical intro for ordinary Ghoul/party fights, versus a 13.5-second multi-angle boss reveal based on actual saved hero and monster team centers; choosing an arena theme never changes encounter classification. The V Combat Lab's unsaved **Cinematic camera: ON/OFF** control immediately skips an active film when switched off; switching on affects the next configured fight without rewinding the current 60-Hz encounter. The dungeon spectator skips music by the selected film's actual duration, not an obsolete shared constant. Opening Tripo Model Inspector disposes the opt-in Lab scene and cinematic DOM overlay before constructing the asset scene; returning restarts only the same unsaved local test configuration, not world time.
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

`npm run build` executes both asset generators, TypeScript type checking and Vite bundling. D1 #242 runs `npm run verify:pages` immediately after build in PR CI **and** the Pages deploy workflow: it checks final `dist/` JS/CSS URL base, canonical music, all 32 creature SFX and generated/curated GLB copies without changing runtime assets. See [D1 artifact contract](CODE_CLEANUP_D1.md). `npm run test:unit` runs Node tests, `npm run test:smoke` runs the curated browser-flow whitelist; `npm test` runs full browser regression. GitHub Actions PR CI runs build/unit and **one core browser-smoke job**; the full browser regression is **manual**. Successful CI is not a substitute for real-device visual, audio or FPS acceptance.

The shipped HUD still labels the game **V.002 ALPHA**; V.003 remains a release target. The shared world clock, partial living dungeon, observed fights, LIVE spectator, updated SFX and post-shop rotation already exist and must **not** be described as merely planned. Remaining content and release gates are tracked only in [Roadmap](ROADMAP.md), not appended as PR-numbered sections here.

**Dungeon transitions:** dungeonStairways.ts projects the actual layout entrance
and dungeonDownStair(...) cells as view-only stair landmarks. 3D stone steps
and lit arch meshes belong to the existing replayScene marker visibility
pipeline. The current runtime only allows descent on floors 1–3; lower
passages on floors 4 and 7 are visibly SEALED, not fictional transitions.
No new floor crossing is synthesized by the renderer.


**Global World Echoes:** worldFeedProjection.ts reads committed WorldEvent
IDs and authoritative pre/post GameState snapshots. It coalesces chest
finds and traps across real party members; exact item/gold/damage details
are derived only from saved delta, including auto-equipped chest gear.
Floor-change notices require a truly changed floor, never a plan alone.
The renderer's eight configurable categories reuse a single HUD and
the same camera/hero jump methods, never a second dungeon runtime.

