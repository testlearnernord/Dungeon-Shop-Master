# Dungeon Shop Master

A first-person dark-fantasy shopkeeping game about **Galvik**, a cursed merchant whose customers are autonomous adventurers. Stock a physical shop, serve actual customers, follow expeditions and witness the consequences of what they bought.

[Play on GitHub Pages](https://testlearnernord.github.io/Dungeon-Shop-Master/) · [Repository](https://github.com/testlearnernord/Dungeon-Shop-Master)

## Current Alpha

Current contract: Alpha v43, including physical automatic buyback. The displayed HUD label is still V.002 ALPHA; the campaign schema (v43), in-game label and npm version (0.1.0) are independent. The Living Dungeon, cellar and forge are implemented; manual acceptance is pending. Alpha v43 is the only supported campaign schema. Reject v42 and earlier explicitly; no migration or legacy adapter. Current-format Save/Load must be deterministic.

| Area | Implemented |
| --- | --- |
| Shop | First-person physical shop, mining, movable furniture, four-slot shelves, 24-unit bag, TAB inventory and six editable quickbar slots |
| Commerce | Wholesale T1 stock, actual physical customers, unpaid carts, staffed LIVE cashier, receipts, credit/debt, restock waits and automatic physical material buyback |
| World | One 50-ms saved world tick; 28,800 ticks per day (24 unpaused real minutes). Galvik's movable wall clock reads it. Bed ends the day |
| Dungeon | Ordinary Floors 1–9, connected seeded layouts, autonomous individual heroes, voluntary Temporary Parties, actual loot, traps, renewable Ghoul packs, pursuit and returns |
| Boss | Floor-10 Cave Troll for eligible 2–3-hero parties; shared combat engine, unique grabs/throws and lava |
| Forge | Real ore/coal/Ghoul Leather buyback into workshop reserve; T2 class weapons and vest crafted into bag, then stocked and sold physically |
| Cellar | Secret portrait passage, stairs, excavation, fishing pond, forge and Galvik's Table |
| Observation | Knowledge-limited Board, World Echoes, Hero Cards, LIVE floor overview, table diorama and implemented matched-camera transition, opt-in 3D arenas |
| Replay / tools | Today plus two prior days of rolling footage; up to 12 pinned recordings; V opens isolated Combat Lab using production motor |
| Audio | Shop: The Lean Season; dungeon: Beneath the Surface; ordinary: No Safe Passage; boss: Desperate Measures |

All live encounters and the isolated Combat Lab use the same 60-Hz group motor, hero attributes, gear, tactics, defense and physical retreat policy. Enemy abilities and terrain may differ; hero rules do not. There is no elapsed-time fight cap. After 30 seconds without an effective HP cue or measurable retreat advance, the shared progress policy requests retreat; persistent blockage can resolve as a recorded stalemate. Combat can cross day boundaries. Stored positions are capped at 2,401 frames, preserving the initial frame and latest minute at 10 Hz; older positions are thinned, not the combat events.

LIVE entry from World Echoes, map or hero view goes directly to the current committed fight with HUD and camera available. The world continues. Local recorded playback and Combat Lab retain optional cinematics (ordinary 5.2 s, boss 13.5 s); Dungeon Viewer LIVE music requests the corresponding cue with a 1.1 s crossfade, and its manual skip supports both scores. Acoustic and visual acceptance of the final changes remains open.

## Start playing

Build shelves with N, buy wholesale stock with B, organize your bag/quickbar with Tab and stock shelves physically. Serve customers at the staff side of the register with E. T1 sword/shield (Tank), spear (DPS), staff (Healer) and vest are wholesale; the four T2 products require the cellar forge. Purchase decisions and combat consequences belong to heroes, not player-issued commands.

### Common controls

| Input | Purpose |
| --- | --- |
| WASD / mouse / Shift | Move, look, sprint |
| 1–6 / mouse wheel | Select a custom quickbar slot |
| Tab | Open inventory; drag owned stock onto the six quickbar slots |
| Left / right click on shelf | Add / remove one item |
| Shift + left / right click | Fill / empty reachable slot, respecting stock rules |
| B / F | Open wholesale / select urgent restock item |
| E / hold E at bed | Interact / end the day |
| N | Build a shelf; interact with the fixed portrait to access the cellar |
| P / R / Q while placing | Move furniture / rotate |
| U / Shift+U | Mine exposed rock / unlock another expansion tier, including in the cellar. Exposed stone and flagstone now share world-aligned UVs with the original shop and dungeon viewer |
| E at revealed cellar pond | Cast a line; perform three quick accurate mouse flicks to catch a fish |
| R outside placement | Adventurer roster |
| G | Dungeon spectator, LIVE or historical |
| V | Developer Combat Lab and asset inspector |
| M / Esc | Cursor mode / dismiss interaction |

The controls are context-sensitive; in-game prompts take priority. See [UI Design System](docs/UI_DESIGN_SYSTEM.md).



## Develop

Requires Node.js 22 and npm. The supported contributor workflow is GitHub branches and PRs; all repository prose and comments are English.

```bash
npm ci
npm run dev
npm run build
npm run verify:pages
npm run test:unit:core
npx playwright install chromium
npm run test:smoke
npm run test:unit
npm test
```

The asset generators run before dev/build. Preserve original source GLBs, approved audio and the Pages base path. The PR gate is a curated unit/browser suite; full regression and long-run audits are separate. See [CI policy](docs/CI_POLICY.md).

## Documentation

- [Contributor contract](AGENTS.md)
- [Documentation index](docs/README.md): current contracts and explicitly historical evidence
- [Architecture](docs/ARCHITECTURE.md) · [Game Bible](docs/GAME_BIBLE.md) · [Roadmap](docs/ROADMAP.md)
- [Alpha v43 acceptance and prior evidence](docs/ALPHA_V43_ACCEPTANCE.md)

Current source and tests outrank old prose. Historical reports are not implementation instructions. No extra simulation, fake rewards, hunger or old-save migrations.

### Recovered Goods Chest

The fixed chest reads **SELL LOOT HERE**. E or left-click toggles the actual hinged lid and saved intake state. Customers with affordable Iron Ore, Coal or Ghoul Leather visit the chest before shopping. Gold transfers through the existing buyback authority, and materials go directly into the workshop reserve. Other finds remain owned in V0.1. The former offers menu is a read-only Buyback log. No overdraft or fake income. A new v43 campaign is required.

### Living Dungeon V0.005 — pacing

Hero and party tiles commit every 2.5 unpaused seconds, monster tiles no faster than every 5 seconds. The world day remains 24 minutes and combat still runs at 60 Hz. This changes real offscreen simulation, not just spectator playback. Fresh v43 campaign required; balance and device acceptance remain open.

### Observed threats and room surfaces

Solo heroes and voluntary parties remember the last genuinely observed dangerous pack for up to 50 seconds. They use the existing known-route and frontier searches to avoid the remembered exposure zone, retreat upstairs if safe, or wait when no safe route exists. A capable newly formed party may reconsider. The full LIVE viewer uses the actual baked flagstone texture for room and corridor materials, matching the Table's shared texture source. New v43 campaign required.
