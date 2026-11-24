### Galvik's World Clock (Alpha v37)

A Tripo wall-clock prop is installed on the central rear stone wall at New Game. Aim at it and press **P** to relocate it to any supported shop wall via the existing Blueprints, collision and persistence system. Its gold-and-amethyst spear is a **separate 3D mesh** and only reads `GameState.worldClock.tick`. One 24-hour turn = 28,800 committed ticks (24 unpaused real minutes). At the last tick of the day it stops at the top rune and glows red, until Galvik ends the day via the bed. No separate timer, game simulation or automatic sleep rule. Asset: `public/assets/models/galviks-world-clock.glb`.

# Dungeon Shop Master

A first-person dark-fantasy shopkeeping game about **Galvik**, a cursed merchant whose customers are autonomous adventurers. Stock a physical shop, serve actual customers, follow their expeditions and witness the consequences of what they bought. The shop is not a menu and the adventurers are not player-controlled units.

**[Play on GitHub Pages](https://testlearnernord.github.io/Dungeon-Shop-Master/)** · **[Source repository](https://github.com/testlearnernord/Dungeon-Shop-Master)**

**Current in-game label:** V.002 ALPHA (see `index.html`). **V.003 ALPHA / The Living Dungeon** is the next *release target*, not a claim that the work described below is missing. Many foundational V.003 systems are already implemented on `main`. The independent npm version is `0.1.0`.

## Implemented on the audited main baseline

Core systems were reconciled on 22 November 2026 through merged #322 (Alpha v36). V.004 cellar, fishing, LIVE cashier, dungeon autonomy and spectators already exist, together with real class progression and the Floor-10 group boss. This is not a claim of full V.003 release readiness. See the [Great Cleanup closeout ledger](docs/GREAT_CLEANUP_CLOSEOUT.md) for measured before/after inventory and outstanding acceptance.

| Area | Currently implemented |
| --- | --- |
| Physical shop | First-person movement, independently built four-slot shelves, real bag/shelf inventory, wholesale purchases, excavation and furniture placement |
| Customers and economy | Saved physical navigation, shelf claims, unpaid carts, LIVE two-stage cashier QTE, real paid receipts, credit/debt, restock requests, walkouts, finite checkout queue and real gold/item buyback of returning adventurers' found goods |
| Persistent world | One ordered 50-ms saved world-tick scheduler; shop, active dungeon expeditions and scheduled fights advance on that shared clock. Only the bed ends a shop day |
| Heroes and exploration | Class-dependent effective stats (capped at Level 20), role/injury-aware purchases, individually saved goals, Temporary Parties, real loot and connected exploration every **200 world ticks** on ordinary numbered Floors **1–9** |
| Combat | Deterministic **60-Hz** shared group combat; ordinary multi-hero/Ghoul encounters; authentic **Floor-10 Cave Troll** for permitted **2–3-hero Temporary Parties**, including throw/lava and immutable footage. The former Floor-6 solo arena remains a historical/training presentation reference |
| LIVE observation | Knowledge-limited Board, one World Feed, worldwide Hero Cards, genuine death signals and replays, floor-wide LIVE spectator for ordinary Floors 1–9, real hero/fight locators, concrete loot inspector and opt-in 3D arenas. Observation does not run game simulation |
| Replays | Read-only immutable committed fights; rolling timeline (today + two earlier days), up to 12 deliberately saved recordings, separate historical playback |
| Developer tools | **V Developer Combat Lab** with hero, monster, arena and balancing controls; same production group motor; smooth display interpolation independent of saved 10-Hz pose checkpoints |
| Audio | Shop: **The Lean Season**; abstract dungeon: **Beneath the Surface**; ordinary fights: **No Safe Passage**; boss: **Desperate Measures**. 21 recorded Ghoul WAVs and 11 Cave Troll MP3 cues share the existing presentation-only sound system |
| Persistence | Strict current **Alpha v36** saves persist the independently mined cursed `shopRoom`, one `portal` traffic checkpoint, explicit `"shop"`/`"away"`/`"transit"` hero places, ordinary Floor 1–9 `dungeonWorlds`, real Floor-10 group combat and immutable recordings. **V35 and older Alpha files are incompatible**, not migrated; breaking changes require a fresh campaign |

**V.004 cellar (merged PRs #252 and #254):** Galvik's fixed fiancée portrait opens a secret, physically traversable stairway to the cellar. The widened corridor and ramp support normal first-person descent, ascent and off-centre approaches. Cellar mining uses the same rock cells and U excavation tool; a chest uses the same P furniture blueprint registry and save state.

**Galvik's Table (new campaigns):** A one-of-a-kind, freely movable Tripo observation-table prop starts against the cellar's rear wall. Aim at it and press **P** to move it using the shared furniture Blueprint system (rotate with Q/R). Its physical placement, full floor support and chest clearance are saved in the current no-migration Alpha format. **Step 1 LIVE 3D diorama:** the table recess contains a genuine, compact 3D copy of the selected LIVE Dungeon floor, inside the existing shop scene. Both the full spectator and tabletop consume the same seeded layout and authoritative LIVE floor frame; no second combat, AI, clock or world state is created. Batched three-dimensional walls and floors now sample the same authored `getDungeonSurfaces` stone and flagstone textures as the fullscreen LIVE Viewer, with contrast and scoped miniature-only lighting. Actual `createReadableDungeonChest`/`createReadableDungeonTrap` feature models, `createGhoulCryptRoom` relics, `createDungeonStairwayProp` stairs, `createHeroVisual` equipped adventurers and a single instance-shared canonical Ghoul GLB replace the old grey debug walls and coloured cylinder proxies. The inset uses an **adaptive border fit**: the original LIVE topology stays intact, the tile X/Z aspect is capped at 1.24, and the remaining area of the 1.16 × 0.84 m visually calibrated physical recess is filled edge-to-edge by two symmetric cutaway bedrock banks made from the same stone materials. There are no letterbox gaps, cropped dungeon tiles, extra gameplay routes or stretched fullscreen screenshots. Floor 1 and Floor 6 receive the same furniture-fitted silhouette, real 3D relief and physical FLOOR XX label. The obsolete RTT/readback/cross-scene texture bridge is removed. The tabletop only updates its presentation while Galvik is nearby in the cellar, and all objects inherit the saved P-placement/Q-R rotation of Galvik's Table. The **approach/camera transition, control runes and table interaction** are reserved for Step 2 and are not implemented. Runtime model: `public/assets/models/galviks-table.glb`.

**V.004 pond and fishing (merged PRs #253 and #256):** excavate six connected cells on the cellar's left wall with U to uncover the water. E/click opens a LIVE first-person fishing interaction with a visible rod, 3D line and bobber, a small bottom HUD and crosshair-guided mouse flicks. Three accurate pulls win a persistent trophy count (not saleable fish goods); the five original synth sounds use GameSfx volume/mute settings. The world clock runs during fishing.

**V.004 cashier (merged PR #255):** the original two accurate stamps, receipts and tip/payment rules remain unchanged. Checkout is now a non-modal LIVE HUD showing a brass timing ring at the bottom of the screen, while NPCs and the common world clock continue running. Existing queue positions are preserved and advancing shoppers prefer clear, direct steps rather than an outward route detour.

**V.004 LIVE Dungeon overhaul (merged PRs #261 and #262):** a readable floor-wide dungeon map with camera orbit, W/S movement correction, knowledge-safe two-step hero previews and resource intentions. The authoritative scheduler commits one connected move every 200 ticks (10 unpaused real seconds), while ordinary and boss fights continue using their shared 60-Hz combat authority.

**V.004 dungeon economy (merged PR #264):** resolved Ghoul sites and treasure chests grant deterministic concrete goods to one living adventurer. Equipment can be retained; surplus ore, coal, herbs and gear remain in individual inventories. Only a confirmed shop buyback transfers an owned item and paid gold, recorded in Galvik's ledger as **cost**, not sales income.

**V.004 spectator QoL (merged PRs #265 and #266):** locate actual LIVE heroes and running fights through compact selectors. Focusing a target preserves the player's orbit and zoom; the inspector shows real saved finds. Selecting a fight focuses its committed tile and the existing Watch action opens that exact opt-in 3D encounter.

**Partially implemented / not yet released:** ordinary Floors 1–9 and the Floor-10 party gate are functional, and Galvik's cursed shop is conceptually unnumbered with one normal physical threshold. The current v36 canonical source/module cleanup is completed in merged #323, while **#294 remains open** after a [fresh 100-day measured audit](docs/GAMEPLAY_100DAY_V36.md): an empty shop stalls late XP and the real Floor-10 group boss receives no natural attempts across ten 100-day scenarios, even when the scripted merchant grants authentic passes. Still needed: root-cause investigation, real physical customer/cashier/portal acceptance, authored deep-floor variety, ten-day hands-on pacing and real-device visual/audio verification. Do not use old PR-labelled roadmap paragraphs to infer these states. See [Roadmap](docs/ROADMAP.md).

## Start playing

1. Start or load a campaign. Fresh shops contain **no built shelves**. Press **N** to build a four-slot shelf and stock it with carried merchandise.
2. Select an item with **1–6** or the mouse wheel. Look at a shelf slot: left-click stocks, right-click removes. **Shift + click** fills/clears within actual inventory and reservation limits.
3. Use **B** to purchase wholesale stock. **F** selects the most urgent live restock request's item; you must still restock it physically.
4. Work from the **staff** side of the checkout. **E** opens the real customer transaction, with a two-stage payment/receipt interaction. Credits are debts, never instant cash. Healthy heroes can prefer class-appropriate gear, injured heroes survival supplies.
5. Inspect heroes with the in-world Board, **R** roster or contextual **F** Hero Card. **G** opens the Dungeon viewer; watch a marked battle in its separate 3D arena, or open a previously committed recording. The LIVE map itself stays abstract during combat.
6. **V** opens developer combat testing; its configuration does not modify real customers, world time or saved outcomes. Hold **E** at Galvik's bed to close the day.

### Common controls

| Input | Purpose |
| --- | --- |
| WASD / mouse / Shift | Move, look, sprint |
| 1–0 / mouse wheel | Choose an actual shelf-stock item |
| Left / right click on shelf | Add / remove one item |
| Shift + left / right click | Fill / empty reachable slot, respecting stock rules |
| B / F | Open wholesale / select urgent restock item |
| E / hold E at bed | Interact / end the day |
| N | Build a shelf; Galvik's portrait is now a fixed secret door |
| P / R / Q while placing | Move furniture / rotate |
| U / Shift+U | Mine exposed rock / unlock another expansion tier, including in the cellar. Exposed stone and flagstone now share world-aligned UVs with the original shop and dungeon viewer |
| E at revealed cellar pond | Cast a line; perform three quick accurate mouse flicks to catch a fish |
| R outside placement | Adventurer roster |
| G | Dungeon spectator, LIVE or historical |
| V | Developer Combat Lab and boss/training tools |
| M / Esc | Cursor mode / dismiss interaction |

The controls are context-sensitive; in-game prompts take priority. See [UI Design System](docs/UI_DESIGN_SYSTEM.md).

## Develop

Requires **Node.js 22** and npm. For work directly in GitHub, contributors can open PRs without setting up an IDE.

```bash
npm ci
npm run dev
npm run build
npm run test:unit:core
npm run test:unit    # complete optional unit regression
npx playwright install chromium
npm run test:smoke
npm test
```

`predev` and `prebuild` first construct the **Troll Grab/Throw** and **Ghoul** animation GLBs from committed source assets. Do not delete or relocate those sources without adjusting and verifying the generators. Vite uses `/Dungeon-Shop-Master/` as its Pages base.

**GitHub Actions:** PR CI performs the production build, a curated core unit suite and five real browser smoke flows. The *complete* Playwright regression runs through the **manual** `Full browser regression` workflow; `main` pushes run the GitHub Pages deployment. A successful build is not an audible SFX sign-off, visual-combat review or measured end-user FPS test.

## Project documents

- **[AGENTS.md](AGENTS.md):** short rules for future ChatGPT / GitHub work; read before changing code.
- **[Architecture](docs/ARCHITECTURE.md):** current module ownership, data flow, authoritative simulation and presentation boundaries.
- **[Game Bible](docs/GAME_BIBLE.md):** identity, approved rules, lore and *implemented / partial / planned / rejected* distinctions.
- **[Roadmap](docs/ROADMAP.md):** only current open work and release gates, not a chronological list of PRs.
- **[The Living Dungeon](docs/THE_LIVING_DUNGEON.md):** current consolidated design/acceptance contract; obsolete PR chronology lives in Git history.
- **[World Clock contract](docs/LIVING_WORLD_CLOCK.md)**, **[LIVE Board/Ledger design](docs/LIVE_BOARD_LEDGER_AUDIT.md)**, **[Floor Spectator contract](docs/FLOOR_SPECTATOR_CONTRACT.md)** and **[Monster asset pipeline](docs/MONSTER_ASSET_PIPELINE.md):** deeper subsystem contracts.
- **[Legacy and obsolescence audit](docs/LEGACY_OBSOLESCENCE_AUDIT.md):** current code/docs/asset candidate classifications and planned breaking fresh-save cleanup.
- **[Great Cleanup audit](docs/CLEANUP_AUDIT.md):** original dated baseline, asset dependencies and historical risks.
- **[Great Cleanup closeout](docs/GREAT_CLEANUP_CLOSEOUT.md):** verified before/after Git-tree counts, completed PR scopes, CI results and remaining acceptance gates.

**Alpha save policy:** schema-breaking updates may invalidate earlier campaigns. **No migration scripts or compatibility adapters for old formats.** Unsupported files should get an explicit incompatibility message, not silent partial loading. Current-format Save/Load must remain lossless and deterministic.

**Source-of-truth order:** current `main` code/assets and tests → merged PR and CI evidence → these living docs for agreed intent. For old text, Git history is the archive. Never infer that a proposed branch merged just because a past chat or document mentioned it.

## Important protection rules

The merchant never directly commands heroes. Recorded fights never resolve again while watched. HUD and Babylon visuals never commit HP, money, world time or loot. Keep the Cave Troll's authored intro and abilities, the 60-Hz motors, the Combat Lab's smooth interpolation, and all approved audio and animation clips intact. No hunger meter, invented sales or independent secondary combat engine.
