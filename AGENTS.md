# Dungeon Shop Master — contributor and AI working contract

This is the compact, **current** instruction file for developing Dungeon Shop Master through ChatGPT and GitHub. Last audited after merged PR #234 (21 November 2026); always verify the **latest** `main`, open PRs and CI before editing. The detailed evidence snapshot is [CLEANUP_AUDIT.md](docs/CLEANUP_AUDIT.md).

## Source of truth and status words

1. **IMPLEMENTED:** confirmed in current source, relevant tests and/or runtime; code wins over old prose.
2. **PARTIAL:** a working vertical slice exists but its stated release acceptance or coverage remains open.
3. **PLANNED:** approved direction, not implemented merely because the design document says so.
4. **OPEN:** not decided; do not declare canon or choose an unrequested mechanic.
5. **REJECTED / HISTORICAL:** intentionally excluded, superseded or no longer current. Git history preserves prior details.

Read [README](README.md), [Architecture](docs/ARCHITECTURE.md), [Game Bible](docs/GAME_BIBLE.md), [Roadmap](docs/ROADMAP.md) and the affected specialist contract. Inspect **actual modules, callers, tests and asset paths** at the current commit. The latest explicit owner instruction beats an older document, but update the affected documents in the same PR. Never assume an old chat, screenshot, proposed PR number or generated AI summary is the repository state.

## Unbreakable runtime invariants

- **One authority:** `GameState` / `GameStore`, `worldClock.ts` and validated committed world events own gameplay. 20 world ticks per game minute, 50 ms per tick. Shop, exploration and battles progress on this same persisted timeline; sleeping alone closes a day. UI, Babylon scenes and animation cannot award loot, income, heal, advance hero decisions or determine RNG.
- **Combat:** actual `groupCombat.ts` and Troll `arenaCombatMotion.ts` steps use the shared deterministic `combatEncounter.ts` driver at **60 Hz**, while retaining distinct encounter-specific actor state and boss abilities. Do not invent parallel engines or trade away signature grabs, throws, lava, stagger, dodge, parry, multi-hero/multi-monster fights or recorded outcomes.
- **PR #233 safeguard:** Combat Lab records compact **10-Hz checkpoints**, but uses `developerCombatPresentation.ts` to interpolate rendered poses between *committed* frames at browser refresh speed. Never revert presentation to discrete 10-Hz pose painting or tie motor steps to display FPS. Rendering can interpolate spatial presentation but must not predict damage.
- **Viewers and replay are read-only:** abstract floor LIVE maps contain only the authentic hero/party and combat marker projections; heavy 3D opponents, combat cast and projectiles load only on opt-in arena. Historical replays use immutable committed frames and a separate playback clock, never new AI or GameStore state changes.
- **Knowledge boundary:** the shop Board and roster use `liveBoardProjection.ts`, not hidden dungeon state. Offscreen death warnings may communicate only approved magical signals; unobserved HP, secret opponents and unearned outcomes remain hidden.
- **Commerce:** buyers physically acquire and reserve goods; unpaid carts are not revenue. Only real cashier confirmation pays, credit creates debt, expiry yields true walkouts. Never grant phantom money, stock, medication or duplicated loot. Customer locomotion, service claims and checkout must survive save/reload and furniture relocation.
- **Shop and heroes:** player runs the shop, not adventurer movement/combat commands. No hunger/starvation mechanic. Death results from actual HP damage. Shop departure must be physically confirmed before two complete off-duty days begin; no free recovery.
- **Save and reproducibility:** the current format is `SIMULATION_VERSION = 24`, verified in `gameState.ts`. Current save/reload and ordered deterministic replays are mandatory. Historical alpha-save migration is **not** a requirement, but never silently corrupt current saves.
- **Presentation quality:** original Floor-6 Cave Troll intro, music, boss HUD, animations and cinematics remain the reference for all fights. Monsters may differ in abilities and art; ordinary encounters must not regress to cheap presentation. Experimentation in `V` remains isolated.
- **PR #234 audio:** `gameSfxSamples.ts`, `sfxCatalog.ts` and `groupCombatSfx.ts` map 21 Ghoul WAVs and 11 Troll MP3s through existing mixer/mute, cue filtering and spatial playback. Sounds never drive combat; seek/repaint cannot replay old hits. No regenerated or substituted approved sounds.
- **Assets:** both `predev` and `prebuild` require source GLBs and scripts under `tools/asset_generation/`. The Troll Grab/Throw GLB is a **required** generator input now archived byte-for-byte under `assets/tripo/source/`; never delete it merely because only generated combat GLBs load at runtime. See [Asset Ownership](docs/ASSET_OWNERSHIP.md) for the confirmed B1 removal of a byte-identical *music* duplicate; the served original bytes remain. Keep the GitHub Pages Vite base path correct. No LFS conversion, Git-history rewrite or destructive asset cleanup without separate authorization.

## Where changes belong

| Concern | Start with |
| --- | --- |
| State, time, save | `src/game/gameState.ts`, `gameStore.ts`, `worldClock.ts`, `campaignSave.ts` |
| Customers, checkout, credit | `shopTraffic.ts`, `npcVisualSystem.ts`, `shopServiceSpots.ts`, `shopCarts.ts`, `customerCheckout.ts`, `shopCredit.ts`, `src/cashierHud.ts` |
| Dungeon decisions and party ownership | `liveDungeonRuntime.ts`, `level7Exploration.ts`, `dungeonDecisions.ts`, `dungeonParties.ts`, `dungeonRegeneration.ts` |
| Combat | `combatEncounter.ts`, `groupCombat.ts`, `arenaCombatMotion.ts`, `combatGrapple.ts`, `combatTactics.ts` |
| LIVE and archives | `liveBoardProjection.ts`, `liveFloorSpectator.ts`, `dungeonViewer.ts`, `expeditionArchive.ts`, `dungeonReplayPlayback.ts` |
| Opt-in combat/asset rendering | `liveGroupCombatArena.ts`, `level6Arena.ts`, `developerCombatLab.ts`, `developerCombatPresentation.ts`, `tripoCaveTrollVisual.ts`, `dungeonGhoulVisual.ts` |
| Audio | `src/soundtrack.ts`, `gameSfx.ts`, `gameSfxSamples.ts`, `sfxCatalog.ts`, `src/game/groupCombatSfx.ts` |
| Furniture, HUD | `furnitureRegistry.ts`, `furniturePlacement.ts`, `src/blueprintHud.ts`, `src/rosterBoardHud.ts` |

Names here are navigational, not a promise that any function is unused or safely interchangeable.

## Workflow and required verification

1. Fetch `main`, open PRs, head commits and relevant tests. Create an isolated branch; explain scope, known risks and explicit non-goals.
2. Change the **smallest existing owner** that solves the problem. Avoid architecture-by-abstraction, duplicate engines, surprise UI redesigns and mutations in projections.
3. For public asset moves and generated GLB changes, run `npm run build` then `npm run verify:pages` to validate the final deployable `dist/` folder, not just the source `public/` tree. Before proposing a code deletion, run `npm run audit:modules`; inspect the static graph, computed-import warnings, real callers and related tests. **Test-only or unreferenced does not itself mean safe to delete.** Test the affected pure rules with unit tests; for camera, Babylon, sound, placement and live/save flows, use targeted Playwright and real browser checks. Run `npm run build` and `npm run test:unit` for code edits. CI additionally runs two browser-smoke shards. Manually dispatch **Full browser regression** for high-risk changes.
4. Report actual commands, CI conclusion and human-only acceptance gaps honestly. A green CI does not prove audible mixing, real-device FPS, animation quality or overall gameplay balance.
5. Review the living docs that changed behavior: [Game Bible](docs/GAME_BIBLE.md), [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md), [UI](docs/UI_DESIGN_SYSTEM.md) and specialist contracts. **Replace** old claims instead of appending a new PR log.
6. **Never merge without explicit owner approval.** If approval is withheld, leave a draft PR with its independent checks, follow-ups and risks visible.

## Scope and design decisions

V.003 remains a **release target** even though the shared world clock, LIVE Board, partial spatial floors, real scheduled fights, spectator, post-shop off-duty rotation and compact replay timeline already exist. The planned special *unnumbered* cursed shop, single physical portal, fully authored deeper floors and individual Floor-10 pass remain open work. The transfer-of-the-curse ending, extra shops, forge/pond and wider lore are **not locked canon**. An ever-growing all-history video archive and hunger system have been rejected.

No new gameplay features should sneak into a cleanup PR.
