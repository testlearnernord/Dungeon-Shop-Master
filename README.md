# Dungeon Shop Master

A first-person dark-fantasy shopkeeping game about **Galvik**, a cursed merchant whose customers are autonomous adventurers. Stock a physical shop, serve actual customers, follow their expeditions and witness the consequences of what they bought. The shop is not a menu and the adventurers are not player-controlled units.

**[Play on GitHub Pages](https://testlearnernord.github.io/Dungeon-Shop-Master/)** · **[Source repository](https://github.com/testlearnernord/Dungeon-Shop-Master)**

**Current in-game label:** V.002 ALPHA (see `index.html`). **V.003 ALPHA / The Living Dungeon** is the next *release target*, not a claim that the work described below is missing. Many foundational V.003 systems are already implemented on `main`. The independent npm version is `0.1.0`.

## Implemented on the audited main baseline

Gameplay implementation last source-verified through merged **PR #241** (21 November 2026); Phase D1 artifact verification was merged in #242 and its Pages deploy passed; D2 closeout documentation remains in draft #243. This is not a claim of full V.003 release readiness. See the [Great Cleanup closeout ledger](docs/GREAT_CLEANUP_CLOSEOUT.md) for measured before/after inventory and outstanding acceptance.

| Area | Currently implemented |
| --- | --- |
| Physical shop | First-person movement, independently built four-slot shelves, real bag/shelf inventory, wholesale purchases, excavation and furniture placement |
| Customers and economy | Saved physical navigation, shelf claims, unpaid carts, a staffed two-stage manual checkout, real paid receipts, credit/debt, restock requests, walkouts and finite checkout queue |
| Persistent world | One ordered 50-ms saved world-tick scheduler; shop, active dungeon expeditions and scheduled fights advance on that shared clock. Only the bed ends a shop day |
| Heroes and exploration | Individual HP, equipment, purchases and intentions; seeded connected exploration on Floors **1–4 and 7**, persistent site generation/refresh and voluntary Temporary Parties |
| Combat | Deterministic **60-Hz** combat; ordinary multi-hero/multi-Ghoul encounters; authentic **Floor 6 Cave Troll** boss abilities including grab/throw and lava. Original boss presentation is the quality reference |
| LIVE observation | Knowledge-limited Adventurer Board, death signals, floor-wide LIVE spectator for Floors 1–4 and 7, abstract fight markers and opt-in 3D arena. Observation never advances a second fight simulation |
| Replays | Read-only immutable committed fights; rolling timeline (today + two earlier days), up to 12 deliberately saved recordings, separate historical playback |
| Developer tools | **V Developer Combat Lab** with hero, monster, arena and balancing controls; same production group motor; smooth display interpolation independent of saved 10-Hz pose checkpoints |
| Audio | Shop: **The Lean Season**; abstract dungeon: **Beneath the Surface**; ordinary fights: **No Safe Passage**; boss: **Desperate Measures**. 21 recorded Ghoul WAVs and 11 Cave Troll MP3 cues share the existing presentation-only sound system |
| Persistence | Strict version-24 campaigns; correct current-save continuation is required. Old alpha save migration is intentionally not guaranteed |

**Partially implemented / not yet released:** integrated deeper dungeon progression and Floor 8–10 content, a single physical cursed portal replacing the numbered-floor shop access, the individual Floor-10 pass, full ten-day gameplay/pacing acceptance and visual/audio acceptance on real hardware. Do not use old PR-labelled roadmap paragraphs to infer these states. See [Roadmap](docs/ROADMAP.md).

## Start playing

1. Start or load a campaign. Fresh shops contain **no built shelves**. Press **N** to build a four-slot shelf and stock it with carried merchandise.
2. Select an item with **1–6** or the mouse wheel. Look at a shelf slot: left-click stocks, right-click removes. **Shift + click** fills/clears within actual inventory and reservation limits.
3. Use **B** to purchase wholesale stock. **F** selects the most urgent live restock request's item; you must still restock it physically.
4. Work from the **staff** side of the checkout. **E** opens the real customer transaction, with a two-stage payment/receipt interaction. Credits are debts, never instant cash.
5. Inspect the live roster with **R** or the wall Board. **G** opens the Dungeon viewer; watch a marked battle in its separate 3D arena, or open a previously committed recording. The LIVE map itself stays abstract during combat.
6. **V** opens developer combat testing; its configuration does not modify real customers, world time or saved outcomes. Hold **E** at Galvik's bed to close the day.

### Common controls

| Input | Purpose |
| --- | --- |
| WASD / mouse / Shift | Move, look, sprint |
| 1–6 / mouse wheel | Choose a carried item |
| Left / right click on shelf | Add / remove one item |
| Shift + left / right click | Fill / empty reachable slot, respecting stock rules |
| B / F | Open wholesale / select urgent restock item |
| E / hold E at bed | Interact / end the day |
| N / Shift+N | Build a shelf / hang Galvik's portrait |
| P / R / Q while placing | Move furniture / rotate |
| U | Mine / excavate |
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
npm run test:unit
npx playwright install chromium
npm run test:smoke
npm test
```

`predev` and `prebuild` first construct the **Troll Grab/Throw** and **Ghoul** animation GLBs from committed source assets. Do not delete or relocate those sources without adjusting and verifying the generators. Vite uses `/Dungeon-Shop-Master/` as its Pages base.

**GitHub Actions:** PR CI performs the production build, all unit tests and two separate browser-smoke shards. The *complete* Playwright regression runs through the **manual** `Full browser regression` workflow; `main` pushes run the GitHub Pages deployment. A successful build is not an audible SFX sign-off, visual-combat review or measured end-user FPS test.

## Project documents

- **[AGENTS.md](AGENTS.md):** short rules for future ChatGPT / GitHub work; read before changing code.
- **[Architecture](docs/ARCHITECTURE.md):** current module ownership, data flow, authoritative simulation and presentation boundaries.
- **[Game Bible](docs/GAME_BIBLE.md):** identity, approved rules, lore and *implemented / partial / planned / rejected* distinctions.
- **[Roadmap](docs/ROADMAP.md):** only current open work and release gates, not a chronological list of PRs.
- **[The Living Dungeon](docs/THE_LIVING_DUNGEON.md):** detailed design target; historically accumulated implementation notes are not a live status report.
- **[World Clock contract](docs/LIVING_WORLD_CLOCK.md)**, **[LIVE Board/Ledger design](docs/LIVE_BOARD_LEDGER_AUDIT.md)**, **[Floor Spectator contract](docs/FLOOR_SPECTATOR_CONTRACT.md)** and **[Monster asset pipeline](docs/MONSTER_ASSET_PIPELINE.md):** deeper subsystem contracts.
- **[Great Cleanup audit](docs/CLEANUP_AUDIT.md):** original dated baseline, asset dependencies and historical risks.
- **[Great Cleanup closeout](docs/GREAT_CLEANUP_CLOSEOUT.md):** verified before/after Git-tree counts, completed PR scopes, CI results and remaining acceptance gates.

**Source-of-truth order:** current `main` code/assets and tests → merged PR and CI evidence → these living docs for agreed intent. For old text, Git history is the archive. Never infer that a proposed branch merged just because a past chat or document mentioned it.

## Important protection rules

The merchant never directly commands heroes. Recorded fights never resolve again while watched. HUD and Babylon visuals never commit HP, money, world time or loot. Keep the Cave Troll's authored intro and abilities, the 60-Hz motors, the Combat Lab's smooth interpolation, and all approved audio and animation clips intact. No hunger meter, invented sales or independent secondary combat engine.
