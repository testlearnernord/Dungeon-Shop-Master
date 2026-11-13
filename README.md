# Dungeon Shop Master

**Current playable milestone: V.002 Alpha.** The default shop track is **The Lean Season** (`public/audio/the-lean-season.mp3`); the dungeon and boss cues are unchanged. **Fortune Returns (fem vocals)** is present as an unassigned source track, not the shop loop.

A small browser-based first-person prototype set in Galvik's mineshaft shop on Dungeon Level 5. The scene uses original placeholder geometry and materials; it has no backend or paid assets.

## Controls

- **WASD** to move and **mouse** to look (click the scene to capture the pointer).
- **Esc** releases the pointer.
- **Mouse wheel** selects an item from your starter inventory.
- **Left-click / hold** a shelf slot to stock it; **right-click / hold** to return one item at a time.
- **E** interacts with Galvik's checkout register when nearby.
- **B** opens/closes wholesale (also available from the HUD or register). Opening releases pointer lock and pauses movement controls; **Esc** closes it. Click the scene to capture the pointer again. Catalog input cannot stock shelves or advance days.
- **Galvik's bedroom:** Behind the shop's rear wall is a cramped side chamber with his bed. Approach it and **hold E for 1.5 seconds** to close the shop and sleep. Releasing early or walking away cancels; tapping E does nothing.
- Rest fades to black, settles the single authoritative day tick, and opens the four-chapter **Merchant's Ledger**. Inspect revenue, receipts, visitors and sealed expedition recordings. Choose **EXPEDITION · WATCH** to open the saved spectator footage before learning an outcome. **Begin Next Day** closes the book and returns to the shop. The old N/Y/Z shortcuts and HUD End Day button have been removed.

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

### Persistent adventurers and simulation (v12)

Every new campaign begins with 10 persistent adventurers, three of whom are already visiting Galvik's Level 5 shop. Heroes explore Floors 1–4 independently. Galvik can supply them, stock shelves, adjust the shop, issue credit, manage customers and grant individual Level 6 access. Level 6 runs a deterministic monster combat with saved replay; cleared Level 6 unlocks recorded exploration on Level 7. Heroes can die in combat or traps, but **never from a daily survival tax**.

The authoritative world is `GameState`, advanced by precisely one deterministic `advanceDay` tick when Galvik sleeps. Real-time NPC movement and spectator playback do not change a hero's underlying simulation. Hero health, traits, XP, equipment, gold, loot, healing supplies and expedition status are persisted. Seeded RNG and event IDs make saves and replays reproducible.

### Healing and item economy

There is no hunger, food clock, nutrition stat, missed meal counter, starvation, emergency ration aid or automatic daily healing. Both consumables restore HP **only when the hero is already injured**. Full-health heroes retain their supplies. At most one healing item is used per day.

| Item | Wholesale | Shelf price | Effect |
| --- | ---: | ---: | --- |
| Waybread | 2g | 4g | +8 HP, inexpensive healing |
| Healing Herb | 3g | 6g | +18 HP, stronger healing |
| Mana Potion | 4g | 7g | Future alchemical use |
| Iron Ore | 2g | 3g | Material for later crafting |
| Iron Sword | 5g | 9g | Permanent weapon, improves dungeon attacks |
| Leather Vest | 5g | 8g | Permanent armor, reduces damage |

The economy starts with 20g and 24 bag slots; ten physical shelf slots hold five items each. Customers buy from **shelves**, not Galvik's private bag. Purchasing and settlement transfer stock, individual gold and revenue atomically. At least a small reserve of healing can be bought in advance; missing HP, affordability and held stock determine further purchases. For light wounds the hero prefers Waybread; for serious injuries Healing Herbs take priority. Cheap bread can fill the remaining small gap after a stronger herb.

Customer shopping is simulated and also represented by physical NPCs: browsing, item pickup, cashier queues, a timed checkout interaction, begging for credit and a short restock-wait window. Reserved items remain unpaid until checkout or day settlement. Customers who find nothing affordable or available may leave. Distinct standing spots and navigation avoid the most obvious doorway conflicts, though this is still an alpha shop simulation.

### Saving and compatibility

Saves are browser-local IndexedDB records with one current snapshot and a previous valid backup. The `Campaign` controls allow manual JSON export/import, restoring the previous save or explicitly starting a new game. Saves contain the world and its seeded RNG, not cosmetic camera/NPC animation state. Store writes are queued and validation rejects malformed or inconsistent snapshots.

**Schema version 1, simulation version 12.** Saves from versions 3–11 are deliberately **not migrated** and cannot be loaded by this build. Invalid older saves remain untouched rather than silently converted. Start a new campaign after upgrading and export v12 campaigns for backup.

### Verification

`npm run build` typechecks and creates the Vite bundle. `npm run test:unit` runs the full local unit suite and `npm test` the complete Playwright browser suite. PR CI uses a fast set of focused unit and browser smoke tests. A separate `Full browser regression` GitHub Actions workflow can be run manually and is also scheduled overnight.

Game files live in `src/game`; `GameStore` is the single owner of gameplay state, `shopperIntents.ts` determines customer needs, `shopCarts.ts` and `customerCheckout.ts` perform atomic sales, `npcTraffic.ts` and `npcVisualSystem.ts` handle shop movement, and `campaignSave.ts` validates persistence. The Unreal-quality visuals imagined for the finished game are not in this browser alpha yet.
