# LIVE Dungeon — current map, exploration and observer contract

> Reconciled 22 November 2026 after merged #295–#298. The former PR #265–#279 progress journal is retained in Git history, not as an active backlog. Runtime authority lives in [Architecture](ARCHITECTURE.md) and [Floor Spectator](FLOOR_SPECTATOR_CONTRACT.md).

## Gameplay state and map

- Ordinary **Floors 1–9** use seeded connected rooms, the shared explorer and regeneration state. Each hero has individual saved visited cells, goals, health, loot and equipment. Floor 10 is the singular actual Cave Troll **Temporary Party** combat, not a normal common-monster farming map.
- `liveDungeonRuntime.ts` owns planned decisions and floor crossings. The lower stair of Floor 9 triggers a 2–3-hero real party eligibility check. `dungeonTopology.ts` distinguishes numbered floors from Galvik's unnumbered cursed shop.
- Hero goals can favor money, gear tests, loot, cautious exploration, Ghoul hunting, descent, ascent or shop recovery. No hero gains all other explorers' maps merely by being on the same selected floor.
- Treasure/trap/monster features have actual positions, committed site changes and renewable generation rules. One site cannot be looted independently once per party member.

## Read-only spectator

- `liveFloorSpectator.ts` and `liveSpectator.ts` derive committed actor/site views. `dungeonViewer.ts` manages focus, floor selector, WASD/pan/orbit/tilt, north restoration, minimap, enemy/chest/trap props, and short personal movement previews.
- A committed combat appears as an inexpensive beacon; opening Watch constructs the premium shared 3D combat arena. The scene consumes saved frames only. Map camera/mini icons do not award XP or reveal every hero's hidden knowledge to the passive shop Board.
- `liveFloorSceneDiff.ts` limits geometry/DOM redraws when only combat pose/HP changes. Visual interpolation may smooth checkpoints while authoritative movement stays at the same 200-tick cadence.
- One World Feed announces genuine loot, traps, return trips, real victories, level-ups, death signals and party challenges. Clicking a victory/death links to real original footage, or a truthful report if no recording was retained.
- Both the Event Feed and Expedition Archive support the saved **Floor-10 partyBossReplay** alongside older compatible solo BossReplay-v1 records. There is one archive, not a redundant Level-6-only report.

## Shop and equipment economy

- Physically owned ore, coal, herbs, gear and other `inventory.finds` belong to one real adventurer. Only an explicit **paid buyback** changes that owner and Galvik's gold/workshop storage.
- Alpha v36 no longer persists or displays the obsolete abstract `inventory.loot` counter. Shop-return decisions can use real injury or newly collected physical `inventory.finds`; unsold items persist with their owner until an authentic paid buyback.
- Customers with a paid budget now prioritize useful class gear if healthy and owned supplies if injured. Penniless customers' begging/restock requests remain survival-first; a desire is not a free transfer.
- The merchant's future forge/repair supply chain, better late-game item tiers and truly useful Mana Potions remain OPEN design/economy tasks.

## Validation

- Opening, closing and seeking a floor view or 3D battle never alters GameState, RNG, gold, XP, HP, clock tick or replay events.
- Return paths use real connected traversed tiles; Floor 9->10 requires an actual group and produces one actual boss outcome. Save/Load carries route/party/combat state without a second solver.
- The original Cave Troll animations/cinematography, 21 Ghoul WAV cues, Troll samples and music are presentation resources, never hit rules. Browser and hardware performance/audio checks remain separate.
- Run targeted unit + curated browser smoke; full Playwright and multi-seed 100-day audits are independent gates. A green unit run is not evidence of physical NPC clearance or economic fun.

Related: [Game Bible](GAME_BIBLE.md) · [Roadmap](ROADMAP.md) · [Legacy audit](LEGACY_OBSOLESCENCE_AUDIT.md).
