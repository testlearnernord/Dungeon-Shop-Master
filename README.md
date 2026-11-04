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

The default seed is `7351`. `GameState` stores both the initial seed and current RNG state; `createGameState(seed, config)` supports reproducible alternative worlds. Identical seeds, configuration and confirmed actions reproduce the same multi-day state, including after saving and loading. Invalid seeds, configuration, overflowing days and unsupported simulation versions are rejected.

### Campaign saves (MVP 0.6)

The latest valid campaign continues automatically, with its saved day shown in the HUD. Every successful `GameStore` transaction queues an autosave: confirmed End Day, wholesale purchase, stocking/removal and discard. Rejected actions, rendering and NPC walking never save or advance time. There is **no offline progression**.

Expand **Campaign** for **Export save**, **Import save** and **New Game**. Export downloads a JSON snapshot of the current in-memory campaign, even if browser storage failed. Import validates the file before asking permission to replace the campaign. New Game also requires confirmation and resets the economy, visitors, selection, player camera and HUD in place without refreshing.

`src/game/campaignSave.ts` keeps browser persistence separate from the pure simulation. IndexedDB stores one current envelope and a previous-good backup atomically. Writes are ordered, including after errors, so an older pending snapshot cannot overwrite a newer action. The envelope includes schema version, simulation version, UTC save timestamp and the complete authoritative `GameState`; RNG state, heroes (including dead heroes), shelves and events are retained exactly. Scene objects, camera position, menu state and walking routes are cosmetic and are not saved. Lifecycle events retry an unsaved snapshot best-effort; wait for **Saved Day …** before closing a tab for guaranteed completion of a queued write.

Saves belong to this browser profile and site origin; clearing site data, private browsing, quota limits, browser eviction or switching browser/device can lose them. Storage errors leave play available in memory and show a persistent warning rather than repeated dialogs. **Export regularly**, especially before upgrades or clearing browser data. There is no cloud synchronization or multi-tab conflict resolution: play a campaign in one tab at a time.

**Recovery:** an unreadable/corrupted/unsupported save is never automatically replaced. Autosave stays paused while you play the fresh in-memory state, so export any progress you want to keep. Use **Recover previous save** to validate the backup and explicitly confirm recovery, **Import save** to restore an exported file, or explicitly confirm **New Game** to start over. If storage itself is unavailable, export and restore later in a working browser. A backup is only the immediately previous valid snapshot, not a rewind history, and cannot protect against clearing/losing the entire browser database.

Schema version **1** supports simulation version **3** only. Unknown schema/simulation versions are rejected without deletion or pretend migrations. Future releases must implement and test an explicit migration before accepting older formats; retain an export and use a compatible game version otherwise.

The HUD renders only the last 3 world events, the latest 100 events of the current day and the bounded active roster (default 20, configurable maximum 100). Historical events and dead adventurers remain in the payload and exports, not thousands of DOM nodes. Saving/validation scan the snapshot linearly per committed change, never per frame; complete snapshot storage and the underlying simulation's append-only history still grow with campaign length. Unit and browser regressions cover 220 day ticks and deterministic continuation.

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

**Bankruptcy fallback:** if gold is below the 2g bread cost and neither bag nor shelves contain bread, the next confirmed day grants up to **2 Waybread**, limited by free bag space, once for that day. It must still be stocked and sold. In the catalog, expand **Free bag space** to discard individual bag items **without any refund**. Even with both bag and shelves full of reserved goods, discard bag items, right-click a shelf's stock into the bag, then discard those items to free shelf and bag space for aid. There is no rescue button or repeat-event reward; the foodless/poor checks prevent stockpiling aid. Daily aid is deliberately limited, not an unlimited same-day source of items or money.

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


### MVP 0.7a: individual Level 6 permits (preparation)

A **Grant L6 pass** button appears next to each living hero currently at the Level 5 shop. Click to authorize that specific hero, or **Revoke L6 pass** to withdraw permission while they are still visiting. Permissions are independent of one another, do **not** advance the day or consume RNG, and persist across departures and return visits. They are autosaved through the existing GameStore. No hero enters Level 6 yet: combat, gate visuals and expedition transitions remain intentionally deferred to the next MVP 0.7 slice. Players remain blocked by both gates.

**Save compatibility:** simulation version 4 adds the boolean `level6Permit` to each hero. Existing valid v3 campaign envelopes are strictly validated as v3 first, then migrated in memory by assigning `false` for each hero; RNG state, gold, inventories, events, historical heroes and day are preserved exactly. The next committed state change writes the migrated v4 format. Invalid or unknown-future versions are still rejected without overwriting the stored save. Exports always use v4.


### MVP 0.7b: Level 6 deterministic encounter (first vertical slice)

**Only living heroes at the Level 5 shop who have an individual Level 6 permit** depart on the next confirmed End Day, after that day's purchases and supplies are processed. The departure itself does not fight. At the following day's tick, their persistent hero stats/health and seeded RNG drive a six-round maximum encounter with one of three Level 6 enemies, followed by victory, retreat, or permanent death. Survivors travel back and arrive at the shop on the subsequent tick; no hero can access Level 7. Food and healing supplies are consumed by the existing daily rules before combat. First victories set the persistent `dungeonFloors` entry for Level 6 to cleared. All encounter events appear in the daily log and preserve unique IDs.

This slice uses **abstract combat only** and does not render 3D combat. The 3D Level 6 exit and entrance animation are added in MVP 0.7c. The player remains unable to leave Level 5. Sim v3 and v4 saves migrate strictly and non-destructively to v5; new v5 saves remain versioned.


### MVP 0.7c: 3D expedition gate

Heroes explicitly authorized to enter Level 6 now visibly depart via the **right-hand gate**, with normal floor 4 traffic using the **left-hand gate**. Level 6 survivors return through the right-hand gate on the day following their `level6-return` event. The gates lift independently, and **both player-only collision barriers stay permanently solid**: the curse still prevents the player from escaping the shop. Gameplay is entirely tied to confirmed daily ticks; movement and gate animation are only cosmetic. No 3D combat yet. No save schema change.


### MVP 0.8: Adventurer Wall Board

A live **Adventurer Board** is mounted on the stone wall behind the player's starting position (turn around to find it). Stand close and face the board, then press **E** or left-click it. For accessibility, **R** opens the same management window anywhere, as does **Open Roster Board (R)** in the existing adventurer HUD. Esc / R closes it. Opening releases pointer lock and detaches the camera until the dialog closes.

The wall dynamically shows names, dungeon location (including F6 expeditions), HP bars and the current day. The expanded window shows up to 20 active heroes by status with HP, XP, levels, stats, traits, equipment, food/healing/loot and individual Level 6 permit buttons for visiting heroes. A separate Fallen filter lists the last 40 deaths. All views derive directly from GameStore; no additional RPG state, extra daily RNG or save version is introduced. Hero portraits and equipment/supply icons now use the two compact original sprite atlases provided by the project owner (`public/assets/hero-portraits.webp`, `public/assets/item-icons.webp`). Hero portrait selection remains stable because its 0–24 index is derived from the persistent hero ID, not random UI state. Save compatibility is unaffected.


### MVP 0.8b: visible customer sales (display-only)

The existing **confirmed End Day** still performs every customer purchase, gold transfer, shelf decrement and inventory update atomically. A merchant sales banner below the gold total now reports the day's transaction result. Expand **Sales receipts** to see buyers, item icons, quantities and revenue (latest 20 receipts only; the complete event history remains persisted). When a visiting 3D NPC actually purchases something on a newly confirmed day tick, a short-lived **SOLD N +Xg** label appears over that exact customer, even while they depart. Reloading a saved campaign restores the receipt ledger without replaying animations or modifying economy. Stocked Waybread is sold to hungry visitors and Healing Herbs to injured visitors; Mana Potions and Iron Ore still have no buyers. There are no manual click-to-sell transactions or timing-dependent money transfers. No save schema change, no new gameplay system, and no extra RNG.


### MVP 0.9: food survival balance

Starvation is now **shop-opportunity-based**, not an arbitrary three-day death spiral. A hero must complete **three separate shop visits without having any food available** and accumulate at least **six hunger** before starvation deals a reduced **4 HP per day**. Spending two consecutive days in the same shop counts as one visit. Food purchased in the shop is consumed that day and counts as a successful visit. Finding/consuming food resets the accumulated missed visits; hungry heroes recover gradually when fed. Surviving encounters on floors 1–4, and victories on Level 6, have a deterministic **25% chance** to discover one ration, up to two carried; the following day they can eat it. A `found-food` or `food-shortage` event explains exactly what happened. Heroes can still die from ordinary combat, and repeatedly ignoring food can ultimately be fatal. No rewards are created while idle, at the shop, or on already completed journeys. No additional button or real-time RNG is involved.

Simulation version 6 adds `missedFoodShopVisits`; existing **v3, v4 and v5** saves are strictly checked under their original schemas then migrated without losing identity, XP, gold, day, inventory, event history or RNG. Older saves begin with zero missed visits, giving each existing hero a fair grace period.


### MVP 1.0a: first permanent equipment trade

The wholesale catalog now includes **Iron Sword (buy 5g / sell 9g)** and **Leather Vest (buy 5g / sell 8g)**, stockable on the existing ten shelves. On a confirmed End Day, only present, living visitors buy. Food and healing are always prioritized before gear, regardless of shelf ordering. A hero purchases an Iron Sword only if weaponless, a Leather Vest only if unarmored and only if enough gold remains. Each hero keeps these items permanently, with the exact same event-based receipt, sales accounting, inventory consumption and autosave rules as the original items. Already-equipped heroes never buy a duplicate. Swords grant +3 damage on Level 6 and slightly improve progress odds on floors 1–4; armor reduces regular dungeon/Level-6 damage by 2 and slightly decreases low-floor lethal risk. Neither item prevents ordinary combat deaths, and gear adds no extra RNG. Existing v3–v6 saves migrate strictly to **simulation v7** with zero new stock, preserving hero identities, equipment, stats, gold, prior event history and RNG. Existing gear names not matching the new catalog remain valid for legacy compatibility but grant no new bonuses.

### MVP 1.1a: Level 6 boss cavern spectator preview

Press **V** or click **Watch Level 6** on the shop HUD to enter an independent procedural 3D boss cavern. Level 6 is a large open basalt arena with a lethal lava perimeter, an enormous club-wielding troll, and a role-aware AI adventurer; no corridors or normal floor mob spawns. The scene is view-only: **WASD** flies the camera, hold **Shift** for turbo, **Q/E** move vertically, mouse look requires clicking the canvas, **Tab** cycles the current hero and the boss (and immediately frames the selected actor), and **V/Esc** returns to the shop. Use **Restart preview** to replay the local spectacle. The original shop scene, camera, economy, campaign and keyboard controls remain unaffected by entering/leaving.

**This is the scene-and-camera foundation, not yet the authoritative combat engine.** Its moving, telegraphing, attacking, dodging, parrying and healing actors form a clearly marked **training/expedition preview**; **no displayed victory/death is credited to the game**. The existing day-tick simulator remains authoritative and deterministic. This allows testing of viewing/camera/model/performance without a second conflicting source of RPG state. Subsequent MVP 1.1b/1.1c implement the single Troll Boss as the actual deterministic Level-6 combat encounter and animate the exact authoritative action transcript, with an equipped-hero survival gear check, synced health and permanent losses. The placeholder visuals here are procedural meshes, not final character models. No save-format or RNG change in 1.1a.

### MVP 1.1b: authoritative Level 6 Cave Troll boss

Every confirmed Level-6 expedition now faces **one fixed Cave Troll boss** (145 HP, heavy telegraphed swings and periodic ground slams), not the previous random three-enemy encounter. Pure seeded AI simulates attacks, role-based dodges, tank parries, finite healer spells/consumables, armor mitigation, knockback and lethal lava. A solo hero without armor and a proper weapon is likely to die; properly equipped adventurers have a meaningful chance to defeat the boss. The healer can use a ranged magic attack and limited self-healing. Only winning grants significant XP, gold and loot, unlocks Level 6's cleared marker and returns the hero through Level 5. Defeat is permanent, retreat is a non-victory. No parties, floor 7 or player combat controls.

The pure encounter also returns an **ordered immutable combat action transcript** (BossCombatAction[]) with round/actor/type/damage/HP/lava position for later exact 3D playback; this **does not** enter the saved GameState yet. The actual authoritative event and result remain booked exactly once by the confirmed global day tick, preserving previous save compatibility and deterministic reload. MVP 1.1c will render that transcript rather than a separate visual preview.

### MVP 1.1c (first action-combat pass): spatial spectator combat preview

The Level-6 spectator preview no longer alternates stationary attacks. A **fixed 60 Hz spatial action motor** drives both actors around the actual basalt arena: the hero continuously strafes and retreats/approaches, the troll pursues and locks its facing at the start of a glowing heavy-attack windup, and different roles choose attacks, healing, timed parries and sideways **rolling dodges with real displacement and i-frames**. Club strikes and melee attacks only connect during active frames **inside facing-angle and reach hitboxes**. Fireballs are actual moving projectiles, damage triggers only upon collision, parries cancel/stagger the boss, dodge windows avoid hits, interrupted heals fail, stamina is consumed and the lava boundary kills. Body/weapon/leg animation, the telegraph indicator and HUD are projections of the same spatial state, not independent fake animation flags.

**Important:** this is an improved *real-time preview only*: the saved day-tick combat still comes from the deterministic `level6Combat.ts` model. Restarting/watch mode never mutates GameStore, loot, RNG, day, hero stats or permanent deaths. The next dedicated task is to unify the two combat models so every visible dodge, parry and death corresponds to an authoritative committed expedition, instead of silently pretending preview outcomes are persistent. All original shop/camera controls and saves remain compatible.

### MVP 1.1d: authoritative Level 6 action-combat recording

Confirmed End Day now resolves Level-6 encounters using the **same fixed-step spatial combat motor** as the 3D preview. Movement, range, active-frame attack cones, timed dodge invulnerability windows, facing-aware parries, troll staggers, finite healing, actual projectile collisions, knockback and lethal lava determine real victory, retreat or permanent death. The saved result grants XP, gold and loot once, and simply watching never advances the day or rerolls the RNG.

Each new level6-combat world event carries a strictly validated, compact combatReplay of the same real encounter: sampled 3D actor positions, attack phases, HP, stamina, projectiles, telegraphs and hit/dodge/parry/heal cues. The **last three completed replays** remain in saves; older events retain their full textual history, IDs and outcomes. After confirming the combat day, press **V / Watch Level 6** to view the last committed encounter, then use TAB and WASD/Shift as before. The source-toggle button switches between recorded fights and independent uncommitted training. Reload/import restores the same recording; older v3–v7 saves lacking the optional replay field still load unchanged. Invalid replay data is rejected before loading. No extra mutable counter or migration is needed.

A pending expedition has no completed outcome yet; the explicitly labeled training preview is available until End Day confirms the actual combat. Parties and final character models are separate future milestones.

### Scene soundtracks

The original MP3s are served from `public/audio/` as static Vite assets (under the GitHub Pages base path).
**The Last Warm Light** loops in Galvik's Level-5 shop and **Trial by Iron** loops whenever the player watches Level 6, including the recorded combat replay and the independent training preview. Returning to the shop resumes its previous position, while entering the boss arena starts the boss theme from its beginning. Scene transitions use a 1.1-second volume crossfade and never trigger a game tick, alter the RNG or modify a save.

Browsers forbid unattended audio autoplay: music starts on the first eligible user pointer/key action, not automatically at page load. The always-visible mini-player has a mute toggle and a 0–100% volume slider (35% default); both settings are stored separately in localStorage so campaigns and save versions remain untouched. Disabling music pauses both tracks. If playback is blocked or a media file cannot load, the player reports it without breaking the game.

### MVP 1.2a: shared 3D hero visual foundation

The shop visitor and Level-6 combat viewer now instantiate the **same Babylon hero factory** (`src/game/heroVisual.ts`). Stable identity traits (skin/hair colors, beard, class silhouette, stature) derive deterministically from the persistent hero ID and role, using **zero gameplay RNG**. Actual equipped Iron Swords and Leather Vests are toggled from the hero's authoritative inventory, so a DPS does **not** magically receive a sword simply because of its role. Existing shop visitors update their meshes in place after purchasing equipment. Recorded boss fights use their **recorded sword/armor flags**, never later purchases; their silhouette and individual identity match the shop. The model factory exposes arm/leg pivots and a weapon socket for subsequent GLB/rigged model replacement and dungeon scene reuse.

This is the structural, low-poly first pass, not final character artwork. No new GameState fields, save schema version, loot, day tick, AI decision or combat outcome is introduced. Browser tests compare shop/boss visual signatures and basic equipment invariants. The next milestone can build dungeon exploration on these shared actors.

### MVP 1.2b: multi-actor combat foundation

The pure `src/game/groupCombat.ts` motor supports up to 24 combatants on two teams, each with independent HP, stamina, target choice, movement, attack/cast/heal states, active-frame melee arcs, dodge/parry windows, armor mitigation, finite healing charges and physically traveling projectiles. Walls block actors and projectiles, with collision sliding; all combatants are ordered by their persistent encounter ID for deterministic results. Team damage is disabled; dead actors do not fight, heal or block projectiles. The motor can capture a bounded, time-stamped replay suitable for a future dungeon spectator, **without changing any existing GameState/save format or resolving an encounter twice**.

`src/game/combatGeometry.ts` is the single source for attack arcs and defense windows used by the existing Level-6 boss motor and the multi-actor system. Level 6 itself remains on its original AI/replay path while the new group motor is exercised in isolation; this deliberately avoids rewriting existing boss save data or changing the troll's balancing in this stage.

Next milestones: feed generated dungeon map collision bounds and AI encounters to this motor, extend the replay schema/save boundary and connect the common viewer. Party behavior and pathfinding around complex obstacles need dedicated integration before actual dungeon gameplay.

### MVP 1.2c: Seeded dungeon level 7 and map inspection scene

- `src/game/dungeonLayout.ts` is the canonical level blueprint: a pure seeded DFS labyrinth, connected rooms, branching corridors and dead ends. Every walkable tile is reachable from the level entrance. Loot, traps and eight monster spawn markers are fixed from the campaign seed and floor ID; they are not rerolled by the day tick or camera.
- The spatial grid exposes bounds, tiles, walkable neighbours and deterministic BFS shortest paths for the later autonomous exploration AI.
- Press **G** or the **Preview Level 7** button to inspect the real Babylon map in a separate, read-only bird's-eye camera. WASD/Shift moves the camera, Q/E and mouse wheel change height, Tab cycles landmarks, R returns to the entrance and G/Esc returns to the shop. An always-visible *development layout map* shows the full generated map for debugging; it is explicitly not the future hero's fog of war.
- Wall/floor meshes share GPU geometry via instances; decorative chambers, torches, basic chest/trap/monster spawn markers and a single stationary hero reference model make the layout inspectable. **No live monsters, AI movement, combat, persistent dungeon loot or hero state changes are implied by the preview**. The existing day-tick and level 6 remain authoritative.
- **Beneath the Surface** loops while watching the dungeon, through the same crossfade/mute/volume mechanism as the shop and troll music. Audio is served as a public Vite asset.
- Old saves remain compatible because the level map is derived from the stable campaign seed. Dungeon exploration state and fog of war will be introduced in a separately validated save migration when actual navigation arrives.

### MVP 1.2d: authoritative autonomous Level 7 expeditions (simulation layer)

After Level 6 has been cleared, a living shop visitor authorized for further exploration automatically departs for Level 7 instead of repeating the same boss. Departure consumes one confirmed day; the first Level 7 exploration runs on the following confirmed day. The player cannot steer the hero once inside. Level 6 remains unchanged until a clear exists, while Floors 1–4 retain their existing abstract daily simulation.

The pure `simulateLevel7Day` processes **at most 16 adjacent grid moves and one encounter per hero per day**. The hero only chooses from walkable neighbours of its *own visited cells*, backtracks when appropriate and never targets an undiscovered treasure/monster with omniscient pathfinding. Collision queries are shared with the seeded dungeon blueprint. On entering a feature tile, real outcomes are committed once: chests grant inventory/gold, traps cause HP loss (armor helps), and monster encounters invoke the deterministic fixed-step **group combat engine**, including actual attacks, movement, parries, dodges and death.

`level7World` is shared and durable: resolved monsters, consumed chests and triggered traps never respawn simply because a different hero enters; individual hero positions/visited tile IDs survive the end of day and save/reload. The day's **exact movement steps and group-combat frames** are captured in a `level7-exploration` event with a Level 7 replay snapshot. Only the latest three heavy recordings are retained; old results remain in the event log. These records are authoritative, not independent render guesses. The animation player and per-hero fog of war are next (MVP 1.2e).

The simulation advances to version 8. The save parser strictly validates Level 7 world coordinates, feature IDs, recorded movement edges, equipment snapshots and bounded group combat frames/cues, while safely migrating previously valid v3–v7 campaigns. No save must be discarded and no day advancement is caused by watching the dungeon. All reward changes and monster kills occur exclusively in the confirmed tick.

### MVP 1.2e: Read-only Level 7 expedition playback and personal fog of war

The **Observe Level 7 (G)** view now defaults to the most recent retained real expedition recording. Use the **Footage** selector to switch between the last three retained recordings or the explicit **Layout preview**. The selector deliberately lists only the day and adventurer, *not their ending*. The full development map is never shown in spectator replay mode.

Replay playback is fully read-only: `dungeonReplayPlayback.ts` builds a timeline solely from `level7Replay.steps` and the existing `GroupCombatReplay.frames`. It does not rerun RNG, AI, damage, rewards, spawns or day ticks. Recorded combat movement, actual HP, phase animation and projectiles are rendered in the generated dungeon at the encounter's correct position. A hero uses the **same deterministic appearance and historical equipment** as Shop/Level 6. The recorded monster is a temporary low-poly placeholder until enemy art is available.

The camera supports free WASD/Shift, Q/E, wheel zoom, plus **Tab** cycling hero / monster / free camera, **R** to refocus the hero, and **Space** to play/pause. Buttons provide restart, timeline seeking, and 0.5×/1×/2×/4× speed. Playback can be replayed/rewound without mutation of any permanent data. When a recording ends, its outcome is revealed; no future result is displayed before then.

Personal Fog of War uses the hero's *historically known tiles at the start of that day* plus tiles entered up to the current playback time, revealing immediately adjacent terrain but never the entire maze. The minimap and rendered maze markers use the same visibility; triggered chests, traps and monsters disappear only after their recorded action, rather than using current-world status. Version 8 saves now optionally store `knownAtStart` and `resolvedAtStart` in new replay records with strict validation; older valid v8 recordings lacking these fields still load, with limited historical prior-knowledge reconstruction.

Unit and browser regressions cover chronological fog, rewinding, saved combat frames/HP, replay selection, persistence, version compatibility, camera controls, development map fallback and absence of gameplay mutation.

### MVP 1.2f.2a: persisted shelf placement

Use **P** or **Arrange Shelves** to open the in-world shelf editor. Choose either shelf, move it with the arrow keys/buttons in 0.25m steps and rotate with **Q**. The preview follows the complete shelf, including labels and stocked item models. Green wireframe indicates a valid location; red blocks saving because of walls, doors, the cashier counter, fixed visitor aisles or overlapping furniture. **Enter / Save** commits the new position to the campaign; **Esc / Cancel** restores the original transform. While editing, the game canvas is detached from camera controls and other modal actions are unavailable.

The placement exists in the authoritative, version 9 `GameState.shopLayout` and round-trips through IndexedDB/JSON export. Version 8 and earlier compatible saves migrate to the previous standard shelf positions. Slot IDs, quantities, gold, heroes and RNG remain unchanged. Inventory graphics are local to a shelf root and therefore move together with the furniture. Initial protected walkways remain fixed until the intent-driven NPC navigation milestone is implemented.

**Not yet available:** free placement of the checkout counter, wall order book, AI shopping reservations/payment, physical customer queue and cinematic day recap. Do not treat the placement editor as evidence that NPCs already navigate to movable stock.


### MVP 1.2f.3a: Intent-driven customer routes (pre-checkout)

Visitors no longer pick arbitrary repeated shelf routes. A pure, read-only shopping forecast projects the **existing** next-day purchase algorithm against current hero needs, gold, stocked shelf slots and competing customers. Results map to stable hero and slot IDs. On changing stock, gear, gold or furniture placement, those projected targets are refreshed. Existing Shop/Dungeon/Boss day-tick rules remain untouched.

The NPC viewer follows paths generated from the actual persisted furniture layout, avoiding the fixed counter and shelf bounding boxes. Customers approach the appropriate shelf, inspect it briefly, and wait in distinct positions. Local personal-space checks prevent overlapping 3D NPCs. Compact nameplates show gold, food/hunger and shopping interest.

**Important:** This milestone visualizes *planned interest*, NOT physical checkout. No item is permanently removed, carried, reserved, or paid during the visual animation. Until the cashier/cart milestone, money and inventory change only at **confirmed End Day**. Forecasts are recalculated when stock changes and can be invalidated before End Day. The UI does not label an intent as a completed sale. Existing sale feedback still derives from authoritative committed events.

Next: durable customer carts and stock reservations with a single atomic payment path, cashier E docking and the manual 2×R timing bonus. Moving final settlement away from End Day requires a save migration and full economy regression tests.


### MVP 1.2f.3b: atomic checkout transaction kernel (not a cashier UI)

The new pure customer checkout functions provide a **single authoritative transaction boundary** for the future physical register. A quote is a read-only snapshot of the already-shipped intent engine, listing the hero ID, day, actual shelf slot IDs, item quantities and total prices. The commit function always compares that entire quote with the current needs, funds and available stock before any transfer, rejecting stale or forged carts. On success it atomically moves units from shelves to the hero, subtracts hero gold, adds merchant revenue, updates daily sales, equips purchased weapons/armor and emits the existing validated, saved sale receipts. Reusing a receipt on the same day is rejected; no new world simulation or RNG runs at checkout.

This is **a backend foundation**, not yet a player-visible cashier mechanic. There is no automatic NPC pickup, register docking, QTE, tip, held-item mesh or cart reservation persistence in this milestone. Existing End Day sales remain unchanged. The next stage must connect the rendered shopping state machine to a real, reserved physical cart and activate this transaction only after actual register interaction. It must then remove automatic End Day purchases without breaking saves, starvation balance or the expedition tick. Do not represent quote previews as purchases.


### MVP 1.2f.3c: physical pickup and persistent unpaid baskets

Autonomous heroes now **take actual items from the actual stocked shelf** when they reach their shopping target and finish their short inspection. Each picked product is removed from the available shelf quantity and held in a strictly validated, saved `shopCarts` record with a stable hero/slot ID, unit quantity and original sale subtotal. New shoppers project available stock and *remaining* customer needs against that reservation, so held units cannot be sold twice. A carried item mesh, based on the same item ID, color and geometric class as the stocked item, attaches to the shared hero model's right hand. Nameplates show the unpaid carried value. Reloading the campaign restores every reservation and carried mesh. The player cannot overwrite/withdraw a shelf slot while any customer has an unpaid reservation against it.

**Interim day-end rule:** Until the requested register, staffing, QTE and tip system exist, confirming End Day automatically settles *reserved* baskets once, along with legacy day-tick purchases for other shoppers. Reserved sales generate ordinary validated receipts for the new day; heroes who already paid or had a cart settled cannot purchase twice during that transition. Merchandise, gold and receipts are not transferred at pickup. The full day-tick simulation remains authoritative for dungeon/boss outcomes, and legacy v9 campaigns migrate to an empty cart list. No new item model assets are bundled; existing game shapes are temporarily used.

**Still planned:** manual cashier docking, truly paid-at-register goods, two R timing windows and 110% bonus, audio feedback, employee staffing, wall order book and the cinematic day-end recap.
