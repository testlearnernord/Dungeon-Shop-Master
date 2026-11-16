# Dungeon Shop Master

**Playable browser alpha:** https://testlearnernord.github.io/Dungeon-Shop-Master/  
**Repository:** https://github.com/testlearnernord/Dungeon-Shop-Master

A first-person, dark-fantasy shopkeeping game built with TypeScript, Vite and
Babylon.js. The player currently controls Galvik, the cursed proprietor of
a physical shop on **Floor 5**. Autonomous adventurers from the upper floors
buy supplies, risk their lives below, and may or may not return.

The *100-floor dungeon* is the setting's long-term premise, **not** a claim
that 100 playable floors exist. The current alpha is **day-based**, not a
continuously running dungeon simulation.

## Start here: source of truth

- [Game Bible](docs/GAME_BIBLE.md): current implementation versus explicitly
  accepted (**LOCKED**), undecided (**OPEN**) and discarded (**REJECTED**)
  design. Do not turn brainstorms into canon.
- [Architecture](docs/ARCHITECTURE.md): authoritative state, navigation,
  furniture contracts, saves, replays and current code ownership.
- [UI Design System](docs/UI_DESIGN_SYSTEM.md): the compact first-person
  interaction and visual language, including customer service hints.
- [Development Roadmap](docs/ROADMAP.md): proposed next five PRs, success
  criteria and deliberately excluded scope.
- [Contributor/AI Guide](AGENTS.md): how to begin work and keep these files
  synchronized with the implementation.

**For a new AI/chat session:** read these documents on the latest `main`;
then inspect the live repository source, open PRs and their CI. Previous
chat messages, screenshots and PR descriptions are not authoritative if they
disagree with current code. No PR is automatically merged merely because it
was mentioned in a roadmap.

## What is playable now

| System | Current alpha behavior |
| --- | --- |
| First-person shop | Walk/look, order wholesale goods, stock and remove physical shelf items, operate a staffed register and grant credit |
| Furniture / expansion | Build compact 4-slot shelves, move registered furniture, hang Galvik's portrait, excavate Level 5 and place furniture on sufficiently cleared floor |
| Shoppers | Individual needs, gold, gear and HP; real shelf pickups into unpaid carts; collision-aware browsing, a five-place physical checkout queue with overflow, local restock/credit requests and walkouts; short event-triggered character remarks in the physical shop |
| Player service | Crosshair shelf details for actual stock and valid actions; compact live checkout/restock/credit status; **F** selects the most urgent requested item in the existing hotbar |
| Money | Real bag/slot inventory, wholesale costs, fixed retail prices, credit debt book and manual receipts. Outstanding collected carts settle once at end of day |
| Adventurers / dungeon | Persistent identities and equipment; deterministic offscreen Floors 1–4; individually authorized Floor 6 Cave Troll; Floor 7 observation/replay |
| Day / reports | End the day at Galvik's bed; merchant ledger, receipts, hero records and spoiler-safe sealed replay presentation; validated campaign save/load |

**Implemented does not mean visually perfect.** The CI checks safety and
functional behavior; customer acting, friction and interface placement still
need human game testing. Shop remarks never alter sales or dungeon outcomes.

### First few minutes

1. Start or load a campaign. **A fresh shop has no shelves**, no shelf stock
   and a small initial merchandise bag, not prebuilt giant racks.
2. Press **N** to place a small four-slot shelf; rotate with **R**, confirm
   with left-click or cancel with right-click/Esc. A new shelf starts empty.
3. Select a bag item with **1–6** or the mouse wheel; look at a real shelf
   slot and **left-click to stock** or **right-click to remove** one unit.
   **Shift + left-click** fills that slot from your real bag; **Shift +
   right-click** clears it as far as bag capacity allows. The crosshair
   prompt explains capacity, wrong-item selection and cart-related locks.
4. Buy stock through **B** (wholesale). When a real customer asks for
   replenishment, the small service strip displays the expiring request;
   press **F** to select that item, then walk over and stock it yourself.
   Neither F nor the strip purchases or transfers anything.
5. Customers choose what to buy. At the staff side of the register use
   **E** when someone with a cart is ready; finish its two-stage timing/receipt interaction. The actual amount and any
   customer-funded tip appear on a paid receipt; the register stays open.
   When the next **physically ready** buyer arrives, press **E** again to
   begin the next checkout without reopening the modal. **Esc** leaves the
   register. No customer is charged until their own two stages succeed.
   A nearby credit customer can also be addressed with **E**, with the
   actual item issued as debt, not a sale.
6. To close the day, go to Galvik's bedroom and **hold E** at the bed.
   The ledger opens and the next day is committed. Saved dungeon footage
   can be watched without rerolling the outcome.

### Common controls

| Key / input | Shop action |
| --- | --- |
| WASD / mouse / Shift | Move, look, sprint |
| 1–6 / wheel | Select a carried stocking item |
| Left-click / right-click at shelf | Stock one / remove one; holding repeats on the same slot |
| Shift + left-click / Shift + right-click at shelf | Fill / clear targeted slot, respecting bag capacity and customer reservations |
| E | Contextual interaction; after a paid register receipt, serve the next physically ready buyer |
| Hold E at bed | Finish day |
| F | Select the earliest-expiring **live restock** item, if any |
| B | Wholesale |
| N / Shift+N | Build a four-slot shelf / hang portrait |
| P | Move looked-at furniture; R / Q rotate while placing |
| U | Mining mode; Shift+U is an alpha expansion-tier development control |
| R (outside placement) | Adventurer roster |
| V / G | Level 6 arena / Level 7 dungeon viewer |
| M | Toggle mouse/HUD cursor mode |
| Esc | Release cursor or cancel/close the current interaction |

This table describes current code, not proposed controls. Full context
prompts are shown in-game.

## Economy and survival facts

Heroes have **HP, not hunger**. Waybread and Healing Herbs both restore HP:

| Product | Wholesale | Retail | HP restored |
| --- | ---: | ---: | ---: |
| Waybread | 2g | 4g | 8 |
| Healing Herb | 3g | 6g | 18 |

Other current stock: Mana Potion, Iron Ore, Iron Sword and Leather Vest.
The retailer's bag and shelf stock are distinct from a hero's supplies.
Heroes choose purchases according to need, gold and availability. Damage,
deaths and equipment consequences come from the committed dungeon
simulation, not random starvation or arbitrary visual effects.

## Local development

Requires **Node.js 22** and npm.

```bash
npm ci
npm run dev
```

```bash
npm run build
npm run test:unit
npx playwright install chromium
npm test
```

The project uses `npm run build` for the TypeScript/Vite production build,
Node's built-in runner for unit tests, and Playwright for browser scenarios.
Playwright's test runner may need a display or `xvfb-run` on headless Linux.

### GitHub workflows

- **CI** on pull requests into `main`: build, unit tests and four selected
  Playwright specs (`dayClock`, `cashierReceipt`, `level5Excavation`,
  `shopperFlowReliability`). Each spec can contain multiple browser tests.
- **Full browser regression**: manually dispatched GitHub Actions workflow,
  not the default PR run.
- **Deploy to GitHub Pages**: triggered by pushes to `main`. A green PR
  build is not proof that Pages has finished deploying; check its workflow.

Prefer focused additional coverage over inflating the default CI.

### Saves and compatibility

`SIMULATION_VERSION = 13` in `src/game/gameState.ts`. Saves require the
persisted Level 5 room, bedroom furniture, board, counter, all shelf
instances and matching four-slot inventories. Version-12/partial or old
five-slot giant-shelf campaigns **are not automatically migrated**. Invalid
stored saves are not silently overwritten. Start a fresh campaign if an
older alpha save cannot be loaded.

## Where to code

| Area | Authoritative code |
| --- | --- |
| Simulation and merchant mutations | `src/game/gameState.ts`, `src/game/gameStore.ts`, `src/game/economy.ts` |
| Actual collected carts, cashier and debt | `src/game/shopCarts.ts`, `src/cashierHud.ts`, `src/game/shopCredit.ts` |
| NPC intents and visual traffic | `src/game/shopperIntents.ts`, `src/game/npcVisualSystem.ts`, `src/game/shopServiceSpots.ts`, `src/game/shopperNavigation.ts` |
| Furniture and mining | `src/game/furnitureRegistry.ts`, `src/game/furniturePlacement.ts`, `src/blueprintHud.ts`, `src/game/level5Room.ts` |
| Player UX | `src/game/interactionSystem.ts`, `src/game/shopServiceFocus.ts`, `src/shopHudLayout.ts`, `src/uiIcons.ts`, `src/immersiveUi.css` |
| Dungeon / observation | `src/game/dungeonSimulation.ts`, `src/game/level6Combat.ts`, `src/game/level7Exploration.ts`, `src/game/level6Arena.ts`, `src/game/dungeonViewer.ts` |
| Saved results / ledger | `src/game/campaignSave.ts`, `src/merchantLedger.ts`, `src/ledgerViewState.ts` |

For details and non-negotiable invariants, use the
[architecture map](docs/ARCHITECTURE.md), not this quick reference.

## Upcoming development

The agreed **five-step working sequence** begins with checkout feel (the
continuous-register feature is delivered in PR #153 for review), physical
restocking ergonomics, customer personality, meaningful shop-to-dungeon
feedback, and ten-day balance/playtesting. As documentation itself uses
PR #152, feature PRs are tentatively **#153–#157** (not reserved).
**None of these five feature changes is implemented or promised merged
by this README.** Follow [ROADMAP](docs/ROADMAP.md) and check GitHub.

Illustrations, previous brainstorms and historical conversations are
references, not alternative canonical implementations.
