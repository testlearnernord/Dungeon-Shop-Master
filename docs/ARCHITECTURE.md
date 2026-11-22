# Dungeon Shop Master — current technical architecture

> Runtime responsibilities were reconciled on 22 November 2026 through merged #321; proposed strict inventory schema is Alpha v36. The older PR #241/D1 audit remains historical evidence, not the current head. This document describes **present runtime responsibilities**, not proposed PR order. Inspect referenced modules and tests before modifying them. See [audit](CLEANUP_AUDIT.md), [Game Bible](GAME_BIBLE.md), [Roadmap](ROADMAP.md) and deep specialist contracts for details.

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

- `src/main.ts` wires rendering, player input, UI and the world. `src/game/gameStore.ts` is the outer mutation boundary; `gameState.ts` defines the current state and `SIMULATION_VERSION = 36`.
- `worldClock.ts` persists a monotonic tick and ordered future events, with 50-ms ticks, 20 ticks per game minute and 28,800 ticks per game day. Stable lane/sequence ordering is part of determinism. Gameplay events, not Babylon frames, advance customers, timed dungeon steps and combat.
- `liveDungeonRuntime.ts` schedules one connected spatial movement every **200 world ticks** and commits groups of **30 actual 60-Hz combat steps** every **10 world ticks**. The **Floor-10 2–3-member Temporary Party Cave Troll** uses the same `groupCombat.ts` authority as ordinary fights, with saved 60-Hz frames and replay validation through `livePartyBossSave.ts`. The old single-hero Floor-6 BossReplay-v1 adaptor remains for historical recordings/training; it is not the active deep-dungeon boss.
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
| Spatial dungeon | Seeded **Floors 1–9**, connected rooms/stairs, site generations, distinct cursed-shop threshold and saved returns | `dungeonTopology.ts`, `dungeonLayout.ts`, `level7Exploration.ts`, `dungeonRegeneration.ts`, `liveDungeonRuntime.ts` |
| Ordinary fights | 60-Hz actor mechanics, group encounters, combat cues, real multi-Ghoul packs | `combatEncounter.ts`, `groupCombat.ts`, `combatMelee.ts`, `combatMovement.ts`, `combatActionClock.ts`, `combatTactics.ts` |
| Unique boss | Real permitted **Floor-10 Temporary Party** Cave Troll, signature attacks, lava/grapple/throw, immutable replay/save | `sharedBossCombat.ts`, `groupCombat.ts`, `livePartyBossSave.ts`, `liveDungeonRuntime.ts`, `dungeonTopology.ts` |
| Observation | One limited-knowledge merchant projection and committed-only spectator | `liveBoardProjection.ts`, `liveFloorSpectator.ts`, `rosterView.ts` |
| Recorded history | Bounded real highlights, separately sampled read-only dungeon/boss footage | `expeditionArchive.ts`, `replayRetention.ts`, `dungeonReplayPlayback.ts`, `dungeonViewer.ts` |

**Legacy isolation:** Actual Floor-10 Cave Troll combat uses the sole LIVE `groupCombat.ts` authority. The former LIVE Floor-6 solo checkpoint/scheduler was removed by PR #306. The separate non-LIVE `simulateLevel6Combat` dispatcher and its shop-to-Floor-6/7 teleport were retired next; there is no valid solo Floor-6 boss entry in either clock. `arenaCombatMotion.ts`, `sharedBossCombat.ts`, BossReplay-v1 and `level6Arena.ts` remain exclusively as authored training/preview and read-only historical presentation. The remaining non-LIVE daily batch itself is still obsolete and must be retired independently, without migration.

## 3. Shop and economic truth

- A fresh campaign has no shelves; the player builds four-slot shelves. `furnitureRegistry.ts` and one placement validator govern mount, collisions, reachability and legal commit. An editor preview is **not** a persistent placement.
- The physical customer motor owns enter/browse/consider/queue/leave positions and claims; its authoritative checkpoint is `shopTraffic.ts`. Babylon actors represent, never re-decide, those positions.
- Picking up goods reserves an **unpaid** cart. A successful staff-side cashier interaction makes a **real paid sale**, while explicit approval of credit writes a debt. Unpaid stock returns without false revenue when the day closes.
- A shop visitor is not off-duty merely because checkout finished: the saved real **outer-gate crossing** starts two complete subsequent days outside both shop and dungeon. Existing return/reentry policy retains prior stats and explored paths without phantom healing.
- The old quote-based direct checkout has been removed. The staffed register settles ONLY physically reserved `shopCarts` through `payReservedShopCart` (GameStore `payReservedCart`); customer preference forecasts remain read-only.

## 4. Dungeon, combat, LIVE and replay

**Current topology:** `dungeonTopology.ts` defines ordinary **Floors 1–9** and the single **Floor-10** Cave Troll party gate. `CURSED_SHOP_REALM` is an unnumbered realm; normal NPC access uses one physical threshold. The real Floor-9-to-10 gate checks an actual saved Temporary Party, pass eligibility, health, available world time and the real stair position. Conceptual topology is implemented, but authored deep-floor diversity, physical portal polish and breaking legacy-field removal (without save migration) still require work.

- **Dungeon source:** seeded connected map, hero position, per-site resolution and renewal. Co-located voluntary Temporary Parties may fight together; actual actor HP, resources and records are per hero. A completed encounter and its loot settle only once per site/generation.
- **Group fights:** `groupCombat.ts` is the 60-Hz authoritative simulation. Special boss actions may reuse shared `combatGrapple.ts` mechanics; attacks do not hit solely because an animation looks plausible. Cues and committed actor poses are captured as real data.
- **Cave Troll:** `liveDungeonRuntime.ts` starts the real Level-10 Temporary Party combat through `caveTrollPartyOptions` and the 60-Hz `groupCombat.ts`; `livePartyBossSave.ts` validates active checkpoints and saved group tapes, and `dungeonViewer.ts` projects immutable recordings. The historical `level6Arena.ts` and `arenaCombatMotion.ts` remain for visual/animation/audio previews, but no Floor-6 solo encounter may write a campaign result.
- **Observation:** `liveBoardProjection.ts` is the single spoiler-safe Board source. `DungeonViewer` has optional broader explicit LIVE floor views, real hero and encounter locators, and individual physical-loot inspection. Those controls only change observer focus, not AI or rewards. Maps represent battles as inexpensive beacons, not animated skinned fighters. Only deliberate **Watch LIVE fight** constructs the opt-in `LiveGroupCombatArena`. A LIVE witness does not pause, resimulate or settle the encounter.
- **Historical archive:** the former night-only `ledgerHeroChronicle.ts` and `ledgerSealedExpeditions.ts` modules were already **retired in merged C1**, not pending another deletion. Their former role is handled by `liveBoardProjection.ts` and `expeditionArchive.ts` respectively. `expeditionArchive.ts` lists real committed highlights for **today plus the previous two days**. A bounded set of **12 manually retained recordings** can outlive rolling footage. `dungeonReplayPlayback.ts` projects saved frames on a separate local playback clock; seeking cannot change world state or play old SFX hits again.
- **Death:** only committed genuine HP transition can emit a spoiler-limited magical warning. An unknown offscreen event cannot be promoted to omniscient Board HP or a fabricated replay.

**LIVE map compass invariant:** dungeon world +Z is permanently north, but the observer camera has unrestricted 360-degree yaw. The compass projects this yaw onto a north needle. Camera-relative WASD moves intuitively on screen; clicking the compass restores north, and R restores orientation, pitch and zoom. This does not constrain cinematic fight cameras.

**LIVE floor visual props:** dungeonFeatureProps.ts creates recognizable wooden chests and spiked pressure plates as child meshes of the existing feature roots. dungeonGhoulMapInstances.ts loads the authored build-generated Ghoul GLB once per Babylon floor scene and shares its static render mesh at actual seeded monster sites; failures keep the old illustrated fallback visible. Only the opt-in dungeonGhoulVisual.ts combat actor samples the 15 authored animation clips. The pure LIVE dungeon world and shared 60-Hz combat tick owner are unchanged.

**LIVE floor update boundary:** `liveFloorSceneDiff.ts` classifies committed floor-geometry/fog changes separately from combat-only frame and HP changes. `DungeonReplayScene.showLiveFloor` preserves the real updated frame and HP metadata on every new checkpoint while skipping costly Babylon lights, route meshes, fog and minimap redraws unless a spatial fact changes. It must not gate `GameStore`, 60-Hz combat, arena frames, loot or clock events.

## 5. Rendering and performance boundary

- Babylon scenes, NPC visual interpolation, fight camera timelines and DOM HUDs read saved projections. Dispose scene listeners, textures, materials, animation groups and arena instances when leaving; avoid repeated registrations or extra RAF loops.
- **V Developer Combat Lab** (`developerCombatLab.ts`) is **unsaved** and invokes the actual production group motor, not a second authority. Fixed **60-Hz** fight steps produce retained poses every sixth step (**10 Hz** compact checkpoints). `developerCombatPresentation.ts` presents at browser refresh rate by interpolating between **already committed** poses with one-checkpoint delay (PR #233). Never snap actors to each newly saved frame or treat motor frequency as an FPS cap. In the group motor, tanks favor parry but can also roll on real Troll telegraphs. The group spectator now renders committed parry/dodge labels and physical hero pose changes, animated hand-attached Troll grabs/throws, and movement-based Troll footsteps. `GroupCombatSoundCursor` maps real boss combat cues to the existing Troll samples without rerolling strikes or replaying audio on seeks. The actual Floor-10 party boss, ordinary LIVE dungeon encounters and Developer Combat Lab share **the same `stepGroupCombat` encounter authority**; the solo Level-6 preview remains a compatible training/specialized viewer. The old BossReplay-v1 film continues to read a projection for historical compatibility. The historic `arenaCombatMotion.ts` solo stepper remains exported for existing pure fixtures and until its tests/replay code can be retired safely; it must not be reintroduced into any current gameplay progression. Arena hazards, authentic attack variants, SFX routing and committed reaction labels are shared. Innate healer magic has been restored in the same motor and is accounted for separately from purchased healing Herbs. A scene-specific optional `tacticsSeed` is stored with authoritative combat for reproducible Lab and Level-6 balancing; absent-seed ordinary dungeon fights retain their original ID-based decision stream. Tactical defense takes real actor phases and stamina into account; highly agile heroes can cancel an unfinished attack windup when a committed Troll telegraph threatens them, with smoothly increasing reaction skill rather than any rendered invulnerability. Remaining per-phase art and subjective camera/audio acceptance belong to the shared 3D spectator, never another damage resolver.
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

The shipped HUD still labels the game **V.002 ALPHA**; V.003 remains a release target, not a missing-code claim. The former Floor-6 boss is now a Floor-10 LIVE party gate; the persisted shop room is now `shopRoom` (v31) rather than `level5Room`; hero shop-occupant `floor="shop"` and off-duty `floor="away"` are distinct from playable Dungeon Floor 5 (v32); residual historical source types remain separate legacy tasks; traffic uses only `gateSide="portal"` and `doorY.portal` pending a **breaking fresh-save cleanup with explicit rejection of older formats, no migration**. The shared world clock, partial living dungeon, observed fights, LIVE spectator, updated SFX and post-shop rotation already exist and must **not** be described as merely planned. Remaining content and release gates are tracked only in [Roadmap](ROADMAP.md), not appended as PR-numbered sections here.

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
The renderer's eight configurable categories reuse a single HUD and
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


### Historical Alpha v29 hard save boundary (Issue #300, third code slice)

The current parser and writer use only `SIMULATION_VERSION=36`; v35 and older Alpha campaigns are rejected with an explicit New Game message, without migration. The LIVE Solo-Troll/Floor-6 `bossCombat` checkpoint is no longer accepted or generated, while legitimate Floor-10 group battles use `partyBossCombat` exclusively. `bossPass` is the only stored hero permission field used for the Floor-10 Temporary Party gate. Numeric shop occupancy was replaced by explicit `"shop"`/`"away"` in v32; the parallel daily motor and old Solo-F6 event contracts were removed in #319/#320. The persisted `level5Room` key was replaced by `shopRoom` in v31. The solo Floor-6 day dispatcher itself is retired. The two physical `level4|level6` traffic gates have been deleted in favor of one portal, including a single-`doorY` checkpoint and reserved furniture clearance. The original and mined cave use one world-aligned stone/floor UV projection; the dungeon spectator shares the same authored surface family. The retired runtime and event paths require no reintroduction or save migrations.

**Alpha v30 / Galvik's Table (#305):** Galvik's one-of-a-kind Tripo table uses the shared P/Blueprint furniture transaction in the cellar. The required `cellarTable` transform is validated and persisted alongside `cellarChest`; prior v29 saves are intentionally incompatible, with no adapter or migration. The model is presentation-only and does not add another simulation or combat system.

**Floor-6 replay routing cleanup (#300):** The Expedition Archive now chooses a playback stage from the actual replay kind, not an old numeric Floor-6 alias. Ordinary Floor-6 `dungeonReplay` tapes use `DungeonViewer` and retain their timeline bookmarks. Only true `partyBossReplay` opens the Floor-10 boss recording route. Retired Solo-F6 feed and death-click targets were removed; #320 also retired the historical event readers and save aliases. Combat Lab and authored training visualizations were not removed.

**Current v30 Save/event boundary (#300 follow-up):** No legitimate v30 gameplay ever emits `level6-departure`, `level6-combat`, `level6-return` or the former `level7-departure` shortcut. The strict save parser now explicitly rejects all four event types and their obsolete Solo-F6 `combatOutcome/combatReplay` metadata, while continuing to validate authentic ordinary dungeon and Floor-10 party tapes. This is a rejection of unreachable old fixture formats, not a migration or a new save version. Historical interface types and isolated arena preview implementation remain separate cleanup tasks.

**PR #310 / shadow checkout boundary:** GameStore no longer exposes forecast-only quote/checkout settlement. Its sole staffed cash register is `payReservedCart` on durable, physically held `shopCarts`. Current paid-gear vs. Floor-10 party boss tests use real shelf pickup and this register. The obsolete direct `customerCheckout.ts` module and its historical unit-only tests were removed in the following PR; tests now pay using actual shelf pickup, reservation and register settlement. Alpha save schema remains v30.

**PR #311 / single sale authority:** The alternative forecast-to-sale transaction is deleted, not merely unreachable from the UI. Current unit and browser receipt tests use real held stock, one cashier settlement, current-format save/reload and gold conservation. The shopping intent engine remains a read-only consumer-needs forecast for choosing actual items, not a payment engine. `payReservedShopCart` is the only normal merchant sale commit; `issueShopCredit` and loot buyback retain their distinct economic semantics. No schema bump in v30 because no persisted field changed.

### Alpha v31: canonical cursed-shop room state (Issue #300 / PR #312)

The physical shop's mined geometry is stored once as `GameState.shopRoom` / `payload.shopRoom`. All existing shop mining, wall mounting, furniture footprints, NPC reachability, room visuals and blueprint previews read that same state. `cellarRoom` remains an independent basement expansion state, never overwritten by shop mining. The strict writer/parser rejects old v30 files and refuses missing or extra `level5Room` keys: **no compatibility field, no data migration**. Existing source module names (`level5Room.ts`, `Level5Room`) continue to provide tested room geometry and are not separate saves or engines. The **next independent cut** will replace heroes' numeric shop `floor=5` occupancy with a true unnumbered place identifier across the LIVE portal return, offline status, Board and validation. It is not claimed finished in this PR.

### Alpha v32: Hero places are not fake numeric floors (#313)

The canonical hero floor value distinguishes actual dungeon depths 1–10 from unnumbered `"shop"` (at-shop/departing) and `"away"` (the two off-duty days). Strict Save validation rejects numeric Floor 5 for shop occupancy and refuses the old v31 save format; **no migration, no dual-compatible aliases**. The real dungeon's playable numeric Floor 5 remains unchanged. Portal-arrival/observed-shop-exit transitions and buyback now require authentic shop presence; LIVE hero cards and world-feed floor targets expose numeric floors only for genuine dungeon occupants. In the subsequent v33 cut, both LIVE portal returns and isolated daily travel instead use `"transit"`, never a fake numeric Floor 4. The Floor-7 state split and legacy day motor also remain open in issue #300.

### Alpha v33: Portal transit is not numeric Dungeon Floor 4 (#314)

`AdventurerState.floor` accepts genuine numeric Dungeon Floors 1–10 and three explicit non-floor places: `"shop"`, `"away"`, `"transit"`. `traveling` and `returning` statuses require `"transit"` in the strict writer/parser. The LIVE return requires an actual physical path to the recorded dungeon entrance plus one scheduled portal tick, and saves the traveler's last real dungeon depth separately. The non-LIVE day motor was retired in #319; the LIVE scheduler resumes a legitimate remembered floor only after a real portal and off-duty interval. Read-only shopping forecasts still cannot create paid sales. v32 and older saves are explicitly rejected without migration. The playable real Floor 4, the single physical shop threshold, furniture mining, Floor-10 party boss and current replay systems remain intact. The day motor and dedicated Floor-7 world structure were subsequently deleted in #319 and #315; the v36 follow-up removes abstract loot tokens; the remaining #300 scope concerns current-code naming and evidence-based dead-code cleanup.

### Alpha v34: one canonical ordinary-floor world checkpoint (#315)

Every genuine Dungeon Floor 1–9, including Floor 7, now uses the same required persisted `dungeonWorlds` collection, keyed by its real numeric floor. There is no independent `level7World`, optional `earlyDungeonWorlds` extension or parallel save authority. LIVE movement, combat settlement, party positions, World Feed observation, spectator and viewer invalidation read the same per-floor collection. The strict validator rejects missing keys, duplicate floors, out-of-range floors and obsolete v33 fields. That v34 cut rejected v33 and older saves without migration. The subsequent #319/#320 cuts removed the non-LIVE day engine and historical `level7Replay` event payloads; current Alpha is v36.

### Alpha v35: current event and recording boundary (#320)

The historical standalone end-of-day simulation was removed in merged #319: all day closure fixtures use the same LIVE event scheduler. The current v35 `WorldEvent` vocabulary no longer includes Solo-F6 `level6-*`, `level7-departure`, old `dungeon-outcome`/`dungeon-exploration`, or the dedicated `level7-exploration` shape. Ordinary Floor 1–9 footage has exactly one `dungeonReplay` property, and the unique actual Floor-10 party boss uses `partyBossReplay`. Neither the saved schema nor the old V preview loads a Solo-F6 campaign recording. These are breaking changes with no older-Alpha migration. PR #321 restricts ordinary Floor 1–9 participants to `"exploring"`, retires the old Floor-7-only `"expedition"` status and test-only `simulateLevel7Day` entry point, while preserving `"expedition"` for authentic Floor-10 party boss participants. No valid v35 save layout is changed.
