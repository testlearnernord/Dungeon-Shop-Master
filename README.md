# Dungeon Shop Master

A browser-based 3D dungeon-shop simulator. Play as Galvik, a cursed merchant
bound to his small shop on Level 5 of a 100-floor dungeon. Adventurers from
the upper floors arrive, inspect shelves, buy supplies and equipment, and
continue into dangers they do not necessarily survive.

**Play:** https://testlearnernord.github.io/Dungeon-Shop-Master/

## Current alpha loop

- **Shop:** first-person movement, stocking and removing shelf items,
  wholesale orders, a cashier interaction, placeable furniture, optional
  room excavation and compact merchant HUD. Customers have individual
  shopping interests, queues, waiting timers and credit requests.
- **Adventurers:** persistent hero identities, classes, equipment, HP,
  money, XP and dungeon status. A roster and wall board show their records.
- **Dungeon:** deterministic day-based exploration on floors 1–4,
  individually authorized Cave Troll encounters on Level 6, and the
  shared Level 7 world with replay and fog. Watching saved footage never
  rerolls or changes the authoritative outcome.
- **End Day:** Galvik sleeps at his bed. A merchant ledger summarizes
  the closing day before the next begins. All sales, hero decisions
  and simulated events are persisted and reproducible.
- **Reports:** grouped events and receipts are available on demand.
  Heavy combat/dungeon outcomes remain sealed until their replay is viewed.

## HP supplies and combat risk

Heroes have **HP, not an exhaustion or daily-food timer**. They can be
injured or killed by the actual dungeon and fight simulation. The shop
supports two affordable kinds of healing:

| Product | Wholesale | Retail | HP restored |
|---|---:|---:|---:|
| Waybread | 2g | 4g | 8 |
| Healing Herb | 3g | 6g | 18 |

Both are `healing` items. Individual hero inventories keep
`bread` and `healing` counts; they are not merchant bag stock.
Waybread is cheaper and weaker. An injured hero may consume one healing
item during the daily simulation. Full-health heroes never consume a
healing item simply because a day passes. When both are available,
small wounds use Waybread and serious wounds use Herbs. Wounds cap at
the hero's maximum HP. No free stock or combat loot is generated to
replace shop purchases.

Equipment changes later dungeon survival chances. Heroes buy according
to need, gold and shelf availability, not a player-directed command.

## Running locally

Requires Node.js 22 and npm.

```bash
npm ci
npm run dev
```

Validation:

```bash
npm run build
npm run test:unit
npm test
```

The latest campaign format is **simulation version 12**. This alpha
intentionally does **not migrate older saves**. If a previous build's
campaign cannot be loaded, start a new campaign. Invalid stored data is
preserved rather than silently overwritten.

## CI policy

Every pull request runs TypeScript/Vite build, all quick Node unit tests,
and four essential Playwright browser smoke specs in a single runner:
day clock, cashier receipt, Level 5 excavation and shopper checkout flow.
The full Playwright suite is opt-in through the GitHub Actions
**Full browser regression** workflow; it does not run nightly. This
keeps ordinary PR feedback short without dropping the ability to run
deeper regressions when changing architecture.

## Code map

| Area | Main files |
|---|---|
| Persistent simulation and day ticks | `src/game/gameState.ts`, `src/game/adventurers.ts` |
| Catalog, sales and HP-supply demand | `src/game/economy.ts`, `src/game/shopperIntents.ts` |
| Physical customer checkout / held stock | `src/game/shopCarts.ts`, `src/game/customerCheckout.ts`, `src/game/shopCredit.ts` |
| Dungeon and boss | `src/game/dungeonSimulation.ts`, `src/game/level6Combat.ts`, `src/game/level7Exploration.ts` |
| Shop scene, guests, controls | `src/game/interactionSystem.ts`, `src/game/npcVisualSystem.ts` |
| Save validation | `src/game/campaignSave.ts` |
| Interface / icon system | `src/immersiveUi.css`, `src/uiIcons.ts` |
| Merchant end-day ledger | `src/merchantLedger.ts` |

UI concept images and historical roadmap notes are inspiration rather
than binding specifications. The current gameplay rules are defined by
the source modules and the tests.
