# Dungeon Shop Master

A small browser-based first-person prototype set in Galvik's mineshaft shop on Dungeon Level 5. The scene uses original placeholder geometry and materials; it has no backend or paid assets.

## Controls

- **WASD** to move and **mouse** to look (click the scene to capture the pointer).
- **Esc** releases the pointer.
- **Mouse wheel** selects an item from your starter inventory.
- **Left-click / hold** a shelf slot to stock it; **right-click / hold** to return one item at a time.
- **E** interacts with Galvik's checkout register when nearby.
- **B** opens/closes wholesale (also available from the HUD or register). Opening releases pointer lock and pauses movement controls; **Esc** closes it. Click the scene to capture the pointer again. Catalog input cannot stock shelves or advance days.
- **N** requests End Day; **Y** confirms Next Day; **Esc** cancels a pending request (and releases the pointer as usual). There is no automatic progression or countdown.
- Alternatively, release the pointer with **Esc** and click **End Day**, then the separate **Confirm Next Day** button. Buttons also support Tab and Enter/Space. Requests alone never advance time; held shortcut keys and duplicate confirmations are ignored.

Each of the two shelves has five numbered slots. A slot can hold up to five of one item type. The HUD shows selected inventory, bag capacity, merchant gold, shelf totals and the last daily sales result. Level 4 and Level 6 corridors remain signed and blocked.

## Architecture

- `src/game/firstPersonController.ts` configures first-person movement and collision.
- `src/game/economy.ts` defines the typed catalog, balance constants and pure wholesale, stocking and customer transactions; `inventory.ts` re-exports shared item/slot types.
- `src/game/gameStore.ts` holds the authoritative `GameState` and publishes immutable transaction results. Neither the bag nor shelves have a second owner.
- `src/game/shop.ts` projects authoritative shelf slots into meshes and delegates stocking/removal to the store.
- `src/game/interactionSystem.ts` handles pointer lock, mouse interactions, repeat actions, wheel selection, and E interactions.
- `src/game/world.ts` builds the mineshaft, corridors, lighting, and checkout.
- `src/main.ts` connects the scene, game systems, and HUD.
- `src/game/gameState.ts` owns the pure, typed day simulation and confirmation state transition; `src/dayHud.ts` connects it to the HUD and deliberate input.
- `src/economyHud.ts` connects wholesale controls and compact economic summaries to the same store.
- `src/game/random.ts` provides a seeded 32-bit RNG; `adventurers.ts` generates persistent hero data, `dungeonSimulation.ts` resolves abstract floors 1–4, and `shopArrivals.ts` schedules shop stays and returns.

### Persistent adventurers and day simulation

A session starts on **Day 1 with exactly 10 generated adventurers**, IDs `adventurer-1` through `adventurer-10`. The first **3 are already at the Level 5 shop**; the other 7 explore seeded starting floors 1–4. Each hero has a generated name, tank/DPS/healer role, RPG stats, positive/neutral/negative traits, level, XP, HP, gold, equipment and inventory placeholders, floor/status, hunger and food. Names may repeat; IDs never do. Roles affect starting HP; traits and equipment are descriptive placeholders, not combat modifiers yet.

One confirmed action calls `advanceDay(state)` exactly once: **one day = one atomic tick**. The pure function returns `{ state, events }`, leaving its input unchanged, appending events to the world log, and emitting only that tick's events separately. Every event has a stable day/hero/kind ID for deduplication by consumers. Repeating a calculation on the same input returns the same result, not an additional day. No browser APIs, Babylon objects, frame callbacks, timestamps, or real-time timers participate in simulation.

The default seed is `7351`. `GameState` stores both the initial seed and current RNG state; `createGameState(seed, config)` supports reproducible alternative worlds. Identical seeds, configuration and confirmed actions reproduce the same multi-day state, including after JSON serialization. Heroes persist across days **in memory only**; reloading starts a fresh session, not a saved campaign. Invalid seeds, configuration, overflowing days and unsupported simulation versions are rejected.

#### Merchant economy and tick order

Balance lives in `ITEMS` and `ECONOMY` in `src/game/economy.ts`, not in the renderer. Start with **20 gold**, a **24-item bag** containing 5 healing herbs, 3 mana potions, 4 iron ore and 2 Waybread, plus 3 Waybread and 2 herbs already shelved. Each shelf slot holds 5 units.

| Item | Wholesale | Sale | Current use |
| --- | ---: | ---: | --- |
| Waybread | 2g | 4g | Consume at most 1/day; reduce hunger by 3 (minimum 0) |
| Healing Herb | 3g | 6g | Consume at most 1/day when injured; restore 18 HP, capped at max |
| Mana Potion | 4g | 7g | Reserved for future mana mechanics; visitors do not buy/use it |
| Iron Ore | 2g | 3g | Nonconsumable material reserved for future use; visitors do not buy it |

Wholesale buttons buy **one unit immediately**, deducting its price and adding it to the bag atomically. Prices and quantity are shown on each button/row. Invalid quantities/items, insufficient gold and full bags reject the entire action. Stocking/removal transfers one item without changing money and never mutates an earlier state snapshot. Purchases are guarded against duplicate order IDs, double-clicks and held activation keys.

Every confirmed End Day executes this order (events are labeled with the resulting day):

1. Apply eligible emergency aid to the **bag**, never directly to a shelf or hero.
2. Existing `at-shop` visitors buy in persistent roster order; shelf order breaks stock ties. Each buys toward **2 carried food** and, if injured, **1 carried herb**, limited by their gold and available stock. Each sale removes shelf units, adds personal consumables, debits the hero and credits the merchant together. Departing customers can buy; traveling/newly arriving heroes cannot shop until a later tick.
3. Every living hero consumes at most one food and one healing supply. Without food, hunger increases by 1. At hunger **3 or more**, starvation removes **8 HP/day** after consumption/healing and can kill. Food comes only through merchant sales: neither new heroes nor dungeon loot carry food. Supplies improve survival but cannot prevent all hazards.
4. Resolve abstract dungeon combat for exploring/returning heroes, then travel, shop stays and departures. There is **no free shop healing**.
5. Fill living-population vacancies with newcomers, up to the daily and active caps. Newcomers start consuming/exploring on the next tick.

**Bankruptcy fallback:** if gold is below the 2g bread cost and neither bag nor shelves contain bread, the next confirmed day grants up to **2 Waybread**, limited by free bag space, once for that day. It must still be stocked and sold. Clear bag space onto shelves if necessary. There is no rescue button or repeat-event reward; the foodless/poor checks prevent stockpiling aid. Daily aid is deliberately limited, not an unlimited same-day source of items or money.

#### Provisional abstract dungeon rules (not full combat)

- Each exploring/returning hero takes one outcome on floors 1–4 per tick: 4% hazard death, 18% retreat one floor (minimum 1), 48% advance one floor, 30% stay. All outcomes lose `1–6 + current floor` HP; reaching zero HP also causes death. Dead records remain permanently in the pool and never simulate or return.
- Survivors earn 8–20 XP; every 100 cumulative XP grants a level. Advance/stay outcomes discover 0–4 gold; a positive gold discovery has a 20% chance of adding one nonconsumable abstract loot token. Retreat/death grant no gold or loot. These documented dungeon rewards and newcomer purses are world sources; merchant trades themselves conserve all items and gold.
- Advancing from floor 4 marks travel, then the arrival scheduler places that same hero at the Level 5 shop in the same tick. A visitor has a 35% chance to remain one extra day, otherwise returns to floor 4. A second consecutive stay always ends in a return. Returners explore again on the following tick and can revisit. No hero enters floor 6; gate authorization remains out of scope.
- After existing heroes simulate, up to **2 newcomers per day** enter floor 1, subject to **20 living heroes**. There is **no lifetime influx cap**: deaths free active slots, allowing recovery even after day 49 or a complete collapse. IDs increase monotonically; dead records never revive. Only living heroes simulate, while historical records/events remain available in memory (history grows with campaign length).
- Configure `dailyInflux` (nonnegative safe integer) and `maxActive` (10–100) through `createGameState(seed, config)`. For example, `{ dailyInflux: 0 }` disables newcomers. Configuration never changes the initial 10/3 conditions.

`GameState.shopEconomy` owns the bag, shelves, merchant balance, daily sales and last aid day. Hero food/healing are individual inventories; loot tokens are never consumables. The scene reads this state and submits pure transactions through `GameStore`; visual animation cannot trigger trades. Plain data and the simulation version support future save/load, which is not implemented in this milestone. Global floor-clear progress remains an empty extension point.

#### Sample loop

Inspect the compact, scrollable **Adventurers** panel for HP, hunger, carried food and visitor identities. Hover a roster row for XP, gold and traits; collapse it to free screen space. Buy bread/herbs with **B**, stock shelves, then press **N**, **Y**. Check gold earned and shelf totals. Expand **Full day report** for named sales, eating, healing, starvation and dungeon deaths; only three recent events appear in the main HUD. Repeat to see heroes return; cancelling never changes the world.

### 3D shop visitors

The Babylon scene renders only persistent GameState heroes whose status is `at-shop`. Day 1's three visitors enter through the Level 4 corridor; each has a name/role label, role-colored low-poly gear, and procedural walk/idle motion between a shelf, checkout queue and waiting area. Visitor IDs reconcile on confirmed day changes: staying heroes keep their meshes and routes, arrivals walk in, and departing heroes walk out before their scene objects are disposed. Larger groups use spaced queue and shelf positions. These are visual-only agents: frame time changes neither RPG state nor day, hunger, inventory or arrivals.

The Level 4 gate panel raises for visitor passage. A separate invisible collider keeps the player blocked by WASD while that visual gate is open; the Level 6 barrier is unchanged. NPC meshes do not collide with the player or participate in picking. Their animations never transact or consume food, and they never enter Level 6. Paths and animations are visual approximations; authoritative purchases and survival resolve only on confirmed days.

## Local setup

Requires Node.js 22 or newer.

```sh
npm ci
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

The day-clock browser regression checks confirmation/cancellation, double-click and held-key guards, consecutive days, recent messages and movement/pointer lock. The adventurer regression compares the HUD against deterministic tick results and tests shelf stocking/removal. `tests/npcVisitors.spec.ts` checks scene IDs/labels, frame-driven movement, mesh-safe persistence, departures and the solid player gate. `tests/economy.spec.ts` covers wholesale, double-click/held activation protection, modal input isolation, stocking, next-day sell-out and wholesale replenishment at desktop/laptop sizes. Unit tests cover atomic transactions, limited aid, food/healing survival effects, shopping order, stock competition, serialized multi-day replay, permanent deaths and vacancy-driven recovery beyond day 49. CI runs unit tests, all browser regressions and the production build.

For the economy smoke test: `xvfb-run -a npm test -- tests/economy.spec.ts`.

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
8. On a fresh load, verify 10 active adventurers and 3 named shop visitors entering with role labels. Advance days and inspect HP/XP, discoveries, arrivals, returners and losses; confirm IDs (in row tooltips) remain stable and no floor exceeds 5. Watch staying visitors retain their paths while departures exit through the Level 4 gate; confirm the player remains blocked by that gate. Collapse/expand the roster, scroll it with the pointer released, and keep moving/stocking with pointer lock.
