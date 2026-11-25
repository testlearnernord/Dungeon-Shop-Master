# Dungeon Shop Master — current technical architecture

> Current contract: Alpha v43, including physical automatic buyback. Current runtime responsibilities, not a PR diary. See [Game Bible](GAME_BIBLE.md) and [Roadmap](ROADMAP.md).


**Combat contract:** All live encounters and the isolated Combat Lab use the same 60-Hz group motor, hero attributes, gear, tactics, defense and physical retreat policy. Enemy abilities and terrain may differ; hero rules do not. There is no elapsed-time fight cap. After 30 seconds without an effective HP cue or measurable retreat advance, the shared progress policy requests retreat; persistent blockage can resolve as a recorded stalemate. Combat can cross day boundaries. Stored positions are capped at 2,401 frames, preserving the initial frame and latest minute at 10 Hz; older positions are thinned, not the combat events. Alpha v43 is the only supported campaign schema. Reject v42 and earlier explicitly; no migration or legacy adapter. Current-format Save/Load must be deterministic.

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
        committed roster  immutable recordings
         Board / HUD      / timeline
                \         /
            Babylon / DOM / audio views
              (read-only presentation)
```

- `src/main.ts` wires rendering, player input, UI and the world. `src/game/gameStore.ts` is the outer mutation boundary; `gameState.ts` defines the current state and `SIMULATION_VERSION = 43`.
- `worldClock.ts` persists a monotonic tick and ordered future events, with 50-ms ticks, 20 ticks per game minute and 28,800 ticks per game day. Stable lane/sequence ordering is part of determinism. Gameplay events, not Babylon frames, advance customers, timed dungeon steps and combat.
- `liveDungeonRuntime.ts` schedules one connected spatial movement every **50 world ticks** and commits groups of **30 actual 60-Hz combat steps** every **10 world ticks**. The **Floor-10 2–3-member Temporary Party Cave Troll** uses the same `groupCombat.ts` authority as ordinary fights, with saved 10-Hz pose checkpoints, combat cues and replay validation through `livePartyBossSave.ts`.
- `gameStore.ts` records actual player and shop actions, physical shop-exit events, accepted credit, paid cart settlement, save operations and bed closure. Day closure does not reroll live expeditions.

**Ordinary combat and risk:** Ordinary fights use natural outcomes, 0.72-second Ghoul recovery, collision-checked stagger recoil and universal equipped DPS spear timing. Visible authored pack composition, health, gear, experience and traits guide solo hunting and pursuit reactions; actual collisions still enter combat. No alternate simulation. Saved retreat/progress checkpoints belong to the common motor, and both save validators share the replay timeline policy. `ghoulPack.ts` owns authored composition and elite classification; `dungeonThreatDecisions.ts` supplies a single visible solo risk preference to pursuit and live hunting selection. The future arena can reduce the authored pack count to fit geometry. `groupCombat.ts` remains the only live motor.

**Authority vs presentation:** no HUD, board, arena, particle effect, preview, music timer or replay may call game-progressing combat AI for authoritative outcomes. Render interpolation, camera easing and scene animation do not write HP, loot, purchases or hidden world information.

## 2. Authoritative modules

| Domain | Responsibility | Current modules |
| --- | --- | --- |
| World and saves | State contract, deterministic time/events, strict persisted validation | `gameState.ts`, `gameStore.ts`, `worldClock.ts`, `liveDungeonRuntime.ts`, `campaignSave.ts` |
| Physical commerce | Inventory, independent saved Iron Ore/Coal/Ghoul Leather workshop reserve, carts, genuine register transactions, debt, arriving/departing shoppers, automatic physical material buyback | `economy.ts`, `shopCarts.ts`, `shopCredit.ts`, `dungeonBuyback.ts`, `dungeonLoot.ts`, `shopArrivals.ts`, `shopTraffic.ts` |
| NPC travel and service | Saved visitor locations/waypoints and exclusive shelf/queue reservations, visuals follow simulation | `npcVisualSystem.ts`, `shopperNavigation.ts`, `shopServiceSpots.ts`, `checkoutQueue.ts` |
| Shop layout | One furniture registry, placement validation, mined room, service reachability | `furnitureRegistry.ts`, `furniturePlacement.ts`, `furnitureBlueprint.ts`, `shopRoomGeometry.ts`, `shopServiceReachability.ts` |
| Individual heroes | Persistent stats, equipment, medium-term intentions, voluntary parties | `adventurers.ts`, `dungeonDecisions.ts`, `dungeonParties.ts` |
| Spatial dungeon | Seeded **Floors 1–9**, connected rooms/stairs, site generations, distinct cursed-shop threshold and saved returns | `dungeonTopology.ts`, `dungeonLayout.ts`, `spatialDungeonExploration.ts`, `dungeonRegeneration.ts`, `liveDungeonRuntime.ts` |
| Ordinary fights | 60-Hz actor mechanics, group encounters, combat cues, real multi-Ghoul packs | `combatEncounter.ts`, `groupCombat.ts`, `combatMelee.ts`, `combatMovement.ts`, `combatActionClock.ts`, `combatTactics.ts` |
| Unique boss | Real permitted **Floor-10 Temporary Party** Cave Troll, signature attacks, lava/grapple/throw, immutable replay/save | `sharedBossCombat.ts`, `groupCombat.ts`, `livePartyBossSave.ts`, `liveDungeonRuntime.ts`, `dungeonTopology.ts` |
| Observation | One committed hero roster and read-only spectator | `heroCardView.ts`, `liveFloorSpectator.ts`, `rosterView.ts` |
| Recorded history | Bounded real highlights, separately sampled read-only dungeon/boss footage | `expeditionArchive.ts`, `replayRetention.ts`, `dungeonReplayPlayback.ts`, `dungeonViewer.ts` |

**Combat authority:** The old solo preview, its separate motor, renderer, replay format and training scenarios are removed. Ordinary Floors 1–9 and the Floor-10 party boss use `groupCombat.ts`, with `combatBehavior.ts` for capability profiles and a shared LIVE checkpoint advance. `combatLabController.ts` opens the disposable Combat Lab directly.

## 3. Shop and economic truth

- A fresh campaign has no shelves; the player builds four-slot shelves. `furnitureRegistry.ts` and one placement validator govern mount, collisions, reachability and legal commit. An editor preview is **not** a persistent placement.
- The physical customer motor owns enter/browse/consider/queue/leave positions and claims; its authoritative checkpoint is `shopTraffic.ts`. Babylon actors represent, never re-decide, those positions.
- Picking up goods reserves an **unpaid** cart. A successful staff-side cashier interaction makes a **real paid sale**, while explicit approval of credit writes a debt. Unpaid stock returns without false revenue when the day closes.
- A shop visitor is not off-duty merely because checkout finished: the saved real **outer-gate crossing** starts a bounded health-dependent recovery on the saved world clock. Existing return/reentry policy retains prior stats and explored paths without phantom healing.
- The old quote-based direct checkout has been removed. The staffed register settles ONLY physically reserved `shopCarts` through `payReservedShopCart` (GameStore `payReservedCart`); customer preference forecasts remain read-only.

## 4. Dungeon, combat, LIVE and replay

**Current topology:** `dungeonTopology.ts` defines ordinary **Floors 1–9** and the single **Floor-10** Cave Troll party gate. `CURSED_SHOP_REALM` is an unnumbered realm; normal NPC access uses one physical threshold. The real Floor-9-to-10 gate checks an actual saved Temporary Party, pass eligibility, health, available world time and the real stair position. Authored deep-floor diversity and manual physical acceptance remain open.

- **Monster AI (V0.004 A–D merged in #336–339):** `dungeonMonsterWorld.ts` persists ordinary Ghoul-Pack x/z, site cycle, 100-tick stepping and IDLE/ROAMING/CHASING/SEARCHING/RETURNING/ENGAGED state. Real LOS is bounded at five tiles, without spectator-derived omniscience. The same 50-tick LIVE world event is the only dungeon movement scheduler. True hero/party field contacts reserve the source pack generation and launch `groupCombat.ts`, with canonical stat seeds and replay coordinates. `dungeonThreatDecisions.ts` supplies one actual adjacent flee, support, sight-breaking or confrontation step to the existing `advanceSpatialDungeonPartyStep` adapter.
- **Monster observation (V0.004 E, #340):** `liveFloorSpectator.ts` supplies one saved view to the full LIVE map and Galvik's Table. `liveFloorFeatureIdentity.ts` includes active pack identity and site generation in the table's mesh lifecycle, but excludes ordinary x/z changes to avoid remeshing. Visual movement samples committed endpoints; skipped days never invent paths. The existing 60-Hz combat engine and shop clock remain independent of any active camera. Uncommon contact edge cases and full human browser visual acceptance remain explicit QA tasks.
- **Dungeon source:** seeded connected map, hero position, per-site resolution and renewal. Co-located voluntary Temporary Parties may fight together; actual actor HP, resources and records are per hero. A completed encounter and its loot settle only once per site/generation.
- **Group fights:** `groupCombat.ts` is the 60-Hz authoritative simulation. Special boss actions may reuse shared `combatGrapple.ts` mechanics; attacks do not hit solely because an animation looks plausible. Cues and committed actor poses are captured as real data.
- **Cave Troll:** `liveDungeonRuntime.ts` starts the real Level-10 Temporary Party combat through `caveTrollPartyOptions` and the 60-Hz `groupCombat.ts`; `livePartyBossSave.ts` validates active checkpoints and saved group tapes, and `dungeonViewer.ts` projects immutable recordings. The Combat Lab uses the same canonical `caveTrollActor` specification as the real encounter; only lab hero fixtures and test spawn positions are configurable.
- **Observation:** `liveRosterCards` in `heroCardView.ts` is the shared live wall, E/R and compact roster source, including committed fight HP. Event-based signals remain a separate historical notification policy, not a roster. `DungeonViewer` has optional broader explicit LIVE floor views, real hero and encounter locators, and individual physical-loot inspection. Those controls only change observer focus, not AI or rewards. Maps represent battles as inexpensive beacons, not animated skinned fighters. Only deliberate **Watch LIVE fight** constructs the opt-in `LiveGroupCombatArena`. A LIVE witness does not pause, resimulate or settle the encounter.
- **Historical archive:** the former night-only `ledgerHeroChronicle.ts` and `ledgerSealedExpeditions.ts` modules were already **retired in merged C1**, not pending another deletion. Their former role is handled by `liveBoardProjection.ts` and `expeditionArchive.ts` respectively. `expeditionArchive.ts` lists real committed highlights for **today plus the previous two days**. A bounded set of **12 manually retained recordings** can outlive rolling footage. `dungeonReplayPlayback.ts` projects saved frames on a separate local playback clock; seeking cannot change world state or play old SFX hits again.
- **Death:** only committed genuine HP transition can emit a spoiler-limited magical warning. The roster may display actual committed current HP and status; never invent cause, events or footage.

**LIVE map compass invariant:** dungeon world +Z is permanently north, but the observer camera has unrestricted 360-degree yaw. The compass projects this yaw onto a north needle. Camera-relative WASD moves intuitively on screen; clicking the compass restores north, and R restores orientation, pitch and zoom. This does not constrain cinematic fight cameras. The canonical projection lives in `dungeonObservationOrientation.ts`: +Z is north, the default spectator looks from -Z toward +Z, and the north-up minimap draws +Z toward canvas top without following orbit. Click and arrow-key navigation apply the matching inverse. Galvik approaches the table from furniture-local +Z; the diorama child is therefore aligned by 180° relative to the independently rotated furniture parent. Saved coordinates, layout seeds, AI and gameplay are never transformed. Both views continue to use the same read-only LIVE floor frame. Galvik's Table Step 2 is implemented through `observationTransitionDirector.ts` and `observationMatchPose.ts`: physical E-table zoom, matched shop/LIVE camera pose, persistent scene handoff veil, cancel/skip and restored FPS controls. Automated browser coverage lives in `tests/observationTransition.spec.ts`; remaining work is visual polish, not initial implementation.

**LIVE floor visual props:** dungeonFeatureProps.ts creates recognizable wooden chests and spiked pressure plates as child meshes of the existing feature roots. dungeonGhoulMapInstances.ts loads the authored build-generated Ghoul GLB once per Babylon floor scene and shares its render mesh at authoritative persisted monster positions in LIVE mode; failures keep the old illustrated fallback visible. V0.004 G map presentation uses `dungeonGhoulMapInstances.ts`: one shared authored 65-bone idle rig and one cloned walking rig per Babylon observer scene; cheap instances switch between `idle_combat` and `walk_feral` only during committed 1.2-second Ghoul travel. Only the opt-in `dungeonGhoulVisual.ts` combat actor uses the full individual 15-clip attack/death motor. No per-pack arena rig is allocated for the overview. The pure LIVE dungeon world and shared 60-Hz combat tick owner are unchanged.

**LIVE floor update boundary:** `liveFloorSceneDiff.ts` classifies committed floor-geometry/fog changes separately from combat-only frame and HP changes. `DungeonReplayScene.showLiveFloor` preserves the real updated frame and HP metadata on every new checkpoint while skipping costly Babylon lights, route meshes, fog and minimap redraws unless a spatial fact changes. It must not gate `GameStore`, 60-Hz combat, arena frames, loot or clock events.

## 5. Rendering and performance boundary

- Babylon scenes, NPC visual interpolation, fight camera timelines and DOM HUDs read saved projections. Dispose scene listeners, textures, materials, animation groups and arena instances when leaving; avoid repeated registrations or extra RAF loops.
- **V Developer Combat Lab** (`developerCombatLab.ts`) is **unsaved** and invokes the actual production group motor, not a second authority. Fixed **60-Hz** fight steps produce retained poses every sixth step (**10 Hz** compact checkpoints). `developerCombatPresentation.ts` presents at browser refresh rate by interpolating between **already committed** poses with one-checkpoint delay (PR #233). Never snap actors to each newly saved frame or treat motor frequency as an FPS cap. In the group motor, tanks favor parry but can also roll on real Troll telegraphs. The group spectator now renders committed parry/dodge labels and physical hero pose changes, animated hand-attached Troll grabs/throws, and movement-based Troll footsteps. `GroupCombatSoundCursor` maps real boss combat cues to the existing Troll samples without rerolling strikes or replaying audio on seeks. The actual Floor-10 party boss, ordinary LIVE dungeon encounters and Developer Combat Lab share **the same `stepGroupCombat` encounter authority**; the obsolete solo preview, replay adapter and stepper have been deleted. Arena hazards, authentic attack variants, SFX routing and committed reaction labels are shared. Innate healer magic has been restored in the same motor and is accounted for separately from purchased healing Herbs. A scene-specific optional `tacticsSeed` is stored with authoritative combat for reproducible Lab and Floor-10 balancing; absent-seed ordinary dungeon fights retain their original ID-based decision stream. Tactical defense takes real actor phases and stamina into account; highly agile heroes can cancel an unfinished attack windup when a committed Troll telegraph threatens them, with smoothly increasing reaction skill rather than any rendered invulnerability. Remaining per-phase art and subjective camera/audio acceptance belong to the shared 3D spectator, never another damage resolver.
- `liveGroupCombatArena.ts` is the shared presentation. LIVE entry from World Echoes, map or hero view goes directly to the current committed fight with HUD and camera available. The world continues. Local recorded playback and Combat Lab retain optional cinematics (ordinary 5.2 s, boss 13.5 s); Dungeon Viewer LIVE music requests the corresponding cue with a 1.1 s crossfade, and its manual skip supports both scores. Acoustic and visual acceptance of the final changes remains open. Opening Tripo Model Inspector disposes the local Lab scene; returning starts only its unsaved configuration.
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

Alpha v43 is the only supported campaign schema. Reject v42 and earlier explicitly; no migration or legacy adapter. Current-format Save/Load must be deterministic. The HUD label is still V.002 ALPHA; it is independent of save schema and implementation. Remaining work: [Current Alpha evidence](ALPHA_V43_ACCEPTANCE.md) and [issue #294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294).

**Dungeon transitions:** dungeonStairways.ts projects the actual layout entrance
and dungeonDownStair(...) cells as view-only stair landmarks. 3D stone steps
and lit arch meshes belong to the existing replayScene marker visibility
pipeline. Current ordinary Floors 1–9 show down-stairs and the real Level-9 party gate. A visible stair is **not** permission to bypass the saved world-clock group/health/access checks.
No new floor crossing is synthesized by the renderer.

**Global World Echoes:** worldFeedProjection.ts reads committed WorldEvent
IDs and authoritative pre/post GameState snapshots. It coalesces chest
finds and traps across real party members; exact item/gold/damage details
are derived only from saved delta, including auto-equipped chest gear.
Floor-change notices require a truly changed floor, never a plan alone.
The renderer's configurable categories reuse a single HUD and
the same camera/hero jump methods, never a second dungeon runtime.

**World Echoes victory / progression:** The same global worldFeedProjection.ts
observes true newly committed saved dungeon replay encounters and level
transitions. It publishes one post-combat victory per authentic settled party
with per-hero XP and tangible inventory/gold deltas, and a separate level-up
per changed hero. Recorded victories open existing immutable Combat Lab-quality
arena playback; boss victories open authored boss footage. The `hero-profile`
navigation contract is independent of the current Adventurer Board fallback
and can later serve the shared world-wide hero tooltip. Neither notification
projection nor its click handler drives the world clock or rewards.

**World Wide Hero Cards:** `heroCardView.ts` projects true live state or
strictly bounded historical replay fields into one immutable UI model.
`heroCard.ts` is the sole HTML renderer for mini / expanded / combat
variants. `worldHeroCards.ts` mounts one global non-modal inspection
surface. `combatPartyRoster.ts` updates individual combat phase and
tactical metrics from immutable group frames without building 60Hz DOM
trees or duplicating world-space HP plates. The ordinary LIVE Dungeon
inspector, roster's legacy raw stat paragraphs, and generic hero hover
text have been replaced. Combat AI, World Clock, RNG, Replay generation,
shop price/inventory authority and Babylon character construction are
unaffected. Historical omissions must remain unknown.

## Combat Lab configuration parity

V defaults to Production rules: `productionLabHero` derives hero power from the shared `heroCombatAttributes` and canonical gear catalog. Ordinary tests use the actual generated-site composer `prepareSpatialDungeonCombat` (including layout, pack size and open arena bounds); boss tests use `caveTrollPartyOptions`. The generated fixture deliberately uses a local seed and synthetic heroes unless roster snapshots are imported. Selecting a captured running LIVE encounter instead clones its exact initial `GroupCombatOptions` and restarts locally; it does not resume the current tick or mutate the campaign. Custom experiments explicitly override final stats, pack count and arena. Both modes still use one motor. Current HP, class-compatible T1/T2 selectors, and encounter-specific music are part of this configuration. No campaign save changes.

## Physical recovered-goods service

`buybackChestPlacement.ts` defines the fixed footprint and service dock. `shopFloorFixtures`, placement and the existing service reachability checks protect it. `NpcVisualSystem` schedules buyback before normal cart/resupply behavior using the existing service claims and routes. `GameStore.buybackAtChest` delegates to the sole paid material exchange at the dock; one atomic drop-off retains one valid receipt per unit. Visual feedback reads committed receipts. The saved `buybackChestOpen` flag was introduced in v41; the faster movement schedule now requires v42, without migration. Other goods are not sold by this system, and no negative treasury is permitted. `availableChestMaterials` is read-only; the retired per-item purchase API is deleted. The headless campaign uses the same mutation with an explicitly idealized service arrival, not a second pricing/stock-cap policy. Dungeon salvage return counts only accepted material IDs.

`dungeonPacing.ts` is the single owner of map cadence: 50 ticks per hero/party step, twice that interval per monster step. Three failed perception checks still terminate pursuit. Roaming delay multipliers preserve movement-relative idle behavior. Combat cadence, portal transit and shop/recovery durations remain in absolute world ticks. The observer interpolates committed positions, never advances time.

`LiveDungeonPlan.threatMemory` is an individual, bounded observation `{monsterId,x,z,seenTick}`, not a hidden monster locator. The existing tactical decision module excludes the remembered exposure zone from the existing known-path and frontier searches, shares observations within co-located parties, and permits a known upper-floor retreat or bounded wait if blocked. It does not advance movement itself. The observer uses the same pure response and does not predict steps while waiting. Room and corridor materials in `dungeonViewer.ts` share the original painted flagstone DynamicTexture; never clone the texture canvas for room tint.
