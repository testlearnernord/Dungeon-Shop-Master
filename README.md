# Dungeon Shop Master

A small browser-based first-person prototype set in Galvik's mineshaft shop on Dungeon Level 5. The scene uses original placeholder geometry and materials; it has no backend or paid assets.

## Controls

- **WASD** to move and **mouse** to look (click the scene to capture the pointer).
- **Esc** releases the pointer.
- **Mouse wheel** selects an item from your starter inventory.
- **Left-click / hold** a shelf slot to stock it; **right-click / hold** to return one item at a time.
- **E** interacts with Galvik's checkout register when nearby.
- **N** requests End Day; **Y** confirms Next Day; **Esc** cancels a pending request (and releases the pointer as usual). There is no automatic progression or countdown.
- Alternatively, release the pointer with **Esc** and click **End Day**, then the separate **Confirm Next Day** button. Buttons also support Tab and Enter/Space. Requests alone never advance time; held shortcut keys and duplicate confirmations are ignored.

Each of the two shelves has five numbered slots. A slot can hold up to five of one item type. The HUD shows selected inventory and total bag capacity. Level 4 and Level 6 corridors are signed and blocked; checkout transactions are not implemented in this prototype.

## Architecture

- `src/game/firstPersonController.ts` configures first-person movement and collision.
- `src/game/inventory.ts` defines typed items, stacks, slots, interactables, and safe inventory capacity rules.
- `src/game/shop.ts` manages shelf slots and stocking/removal.
- `src/game/interactionSystem.ts` handles pointer lock, mouse interactions, repeat actions, wheel selection, and E interactions.
- `src/game/world.ts` builds the mineshaft, corridors, lighting, and checkout.
- `src/main.ts` connects the scene, game systems, and HUD.
- `src/game/gameState.ts` owns the pure, typed day simulation and confirmation state transition; `src/dayHud.ts` connects it to the HUD and deliberate input.
- `src/game/random.ts` provides a seeded 32-bit RNG; `adventurers.ts` generates persistent hero data, `dungeonSimulation.ts` resolves abstract floors 1–4, and `shopArrivals.ts` schedules shop stays and returns.

### Persistent adventurers and day simulation

A session starts on **Day 1 with exactly 10 generated adventurers**, IDs `adventurer-1` through `adventurer-10`. The first **3 are already at the Level 5 shop**; the other 7 explore seeded starting floors 1–4. Each hero has a generated name, tank/DPS/healer role, RPG stats, positive/neutral/negative traits, level, XP, HP, gold, equipment and inventory placeholders, floor/status, hunger and food. Names may repeat; IDs never do. Roles affect starting HP; traits and equipment are descriptive placeholders, not combat modifiers yet.

One confirmed action calls `advanceDay(state)` exactly once: **one day = one atomic tick**. The pure function returns `{ state, events }`, leaving its input unchanged, appending events to the world log, and emitting only that tick's events separately. Every event has a stable day/hero/kind ID for deduplication by consumers. Repeating a calculation on the same input returns the same result, not an additional day. No browser APIs, Babylon objects, frame callbacks, timestamps, or real-time timers participate in simulation.

The default seed is `7351`. `GameState` stores both the initial seed and current RNG state; `createGameState(seed, config)` supports reproducible alternative worlds. Identical seeds, configuration and confirmed actions reproduce the same multi-day state, including after JSON serialization. Heroes persist across days **in memory only**; reloading starts a fresh session, not a saved campaign. Invalid seeds, configuration, overflowing days and unsupported simulation versions are rejected.

#### Provisional abstract rules (not full combat)

- Each exploring/returning hero takes one outcome on floors 1–4 per tick: 4% hazard death, 18% retreat one floor (minimum 1), 48% advance one floor, 30% stay. All outcomes lose `1–6 + current floor` HP; reaching zero HP also causes death. Dead records remain permanently in the pool and never simulate or return.
- Survivors earn 8–20 XP; every 100 cumulative XP grants a level. Advance/stay outcomes discover 0–4 gold; a positive gold discovery has a 20% chance of adding one abstract loot token. Retreat/death grant no gold or loot. No other outcomes create items, and there are no transactions.
- Advancing from floor 4 marks travel, then the arrival scheduler places that same hero at the Level 5 shop in the same tick. A visitor has a 35% chance to remain one extra day, otherwise returns to floor 4. A second consecutive stay always ends in a return. Shop rest restores 8 HP, capped at maximum, without creating food. Returners explore again on the following tick and can revisit. No hero enters floor 6; gate authorization and 3D NPCs are out of scope.
- After existing heroes simulate, up to **2 newcomers per day** enter floor 1, subject to **20 living heroes** and a **30-newcomer lifetime budget**. Thus the default session has at most 40 identities including dead records; deaths free active slots but never replenish the budget. Traffic follows floor progression and return visits, not hard-coded day counts. The pool can eventually die out.
- Configure `dailyInflux` (nonnegative safe integer), `maxActive` (10–100), and `totalInflux` (0–1000) through `createGameState(seed, config)`. For example, `{ dailyInflux: 0 }` disables newcomers. Configuration never changes the initial 10/3 conditions.
- **Hunger and food are deferred**: both start at zero and remain unchanged. Dungeon outcomes never produce food; future food supplies must come only from the merchant. No hunger penalties or consumption/economy are implied by these placeholder fields.

The existing `Inventory` and `Shop` remain the sole owners of player bag contents and shelf slots. Day ticks neither copy nor alter them. Hero loot tokens and food fields are personal inventories, not another player stock system. Future stock integration must migrate ownership into simulation state before adapting the scene—never synchronize duplicate bag/shelf inventories. Shop economy and global floor-clear extension points remain null/empty.

#### Sample loop

Inspect the compact, scrollable **Adventurers** panel for active heroes' names, roles, level, HP, floor and status; the visitor line explicitly names everyone at the shop. Hover a roster row for XP, gold and traits. Collapse the panel to free screen space. This is read-only: no walking NPCs or purchases are simulated. Stock shelves as usual, press **N**, then **Y** to confirm End Day, and inspect arrivals, injuries, discoveries and losses in the latest-three-event log. Repeat to see the same named heroes return from floor 4; cancelling never changes the world.

## Local setup

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

For a production build and local preview:

```sh
npm run build
npm run preview
```

## Tests

Pure simulation and confirmation-guard tests use Node's built-in runner (no rendering or added test dependency):

```sh
npm run test:unit
```

Browser regressions:

```sh
npx playwright install --with-deps chromium
npm test
```

The test uses headed Chromium for real pointer-lock mouse movement. On a headless Linux machine, run `xvfb-run -a npm test` (also run by CI). It checks actual WASD input on the initial load and after three reloads, mouse look, pointer capture/release, 32 seconds of sustained input with scene-frame progress, gravity, and wall/shelf/counter collisions. Scene inspection lives only in the development test harness, not the production bundle.

The day-clock browser regression checks Day 1, confirmation/cancellation, double-click and held-key guards, ten consecutive day advances, recent messages, unchanged inventory, and movement/pointer lock while confirmation is pending. The adventurer regression compares the HUD against deterministic tick results across eleven days, checks textual visitors and persistent IDs, then stocks a shelf, advances a day and removes the item. Unit tests cover initial 10/3 conditions, all abstract outcomes, XP/HP/loot bounds, serialized deterministic replay, return visits, unique hero/event IDs, permanent death and finite/configurable influx over 100 days. CI runs the pure unit tests and browser regressions alongside the production build.

For just the new browser smoke test: `xvfb-run -a npm test -- tests/adventurers.spec.ts`.

### Movement freeze fix

Babylon's modular imports did not register `DefaultCollisionCoordinator`. The first WASD input entered collision handling and threw `DefaultCollisionCoordinator needs to be imported before...`, stopping the game render loop while the browser's own animation callbacks continued. This was reproduced in Chromium with pointer lock and real keyboard input; it was not a main-thread deadlock. Explicitly importing the collision coordinator fixes the failure without disabling collisions or gravity. Picking also required the `Ray` side-effect import. The extra negative ellipsoid offset was removed because Babylon already subtracts the ellipsoid half-height from the camera position; the offset placed the player's feet below the floor.

Verification: the browser regression passed, including three reloads, all four movement directions, 32 seconds of held-key movement, stable standing height, both shelves, both side walls, the front wall, and the counter. Removing the collision-coordinator import makes the regression fail on its first W input with the original exception and zero movement. `npm ci && npm run build` passed. Browser-protocol Escape does not reliably trigger Chromium's pointer-lock default action, so the automated release check uses `document.exitPointerLock()`; the manual walkthrough below covers Escape.

The built production preview was also exercised in Chromium: all WASD directions visibly changed the canvas on the initial load and three reloads, followed by 32 seconds of sustained input with WebGL draw progress checked every second and no captured runtime errors. Software rendering in the runner produced long tasks (up to 2.3 seconds), but rendering continued; this is not a claim of hardware-GPU performance or Windows-specific validation.

## GitHub Pages

The `Deploy to GitHub Pages` workflow builds and deploys pushes to `main`. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The Vite base path is `/Dungeon-Shop-Master/`.

## Test walkthrough

1. Start the dev server, open the local URL, and click the scene to capture the pointer.
2. Use WASD and mouse look to walk around; verify the floor, shop walls, counter, and shelves block movement.
3. Find the two signed blocked corridors, checkout counter, and both five-slot shelves.
4. Aim at a slot, left-click to stock, and hold to stock repeatedly; verify the inventory count and bag total decrease.
5. Right-click and hold to return goods; verify counts rise, and try switching to an incompatible item for an occupied slot.
6. Use the wheel to change the selected item, press E near the register, then press Esc to release the pointer.
7. Check Day 1 and the welcome event. Double-click End Day: it must only open confirmation. Cancel, then request and confirm: Day 2 must appear once. Hold N/Y, and repeat ten deliberate advances; verify WASD, pointer lock, stocking, and removal still work and the log shows the last three events.
8. On a fresh load, verify 10 active adventurers and 3 named shop visitors. Advance days and inspect HP/XP, discoveries, arrivals, returners and losses; confirm IDs (in row tooltips) remain stable and no floor exceeds 5. Collapse/expand the roster, scroll it with the pointer released, and keep moving/stocking with pointer lock.
