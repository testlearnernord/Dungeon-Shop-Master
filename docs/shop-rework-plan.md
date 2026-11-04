# Shop Loop Redesign: Merchant Gameplay, Customers, Checkout, End of Day
Status: IN PROGRESS. MVP 1.2f.1, shelf placement (1.2f.2a) and intent-driven visual customer routes (1.2f.3a) are shipped. Checkout kernel (1.2f.3b) provides atomically validated purchases and receipts without activating a UI. Physical reservations, cashier docking and timing rewards, wall order book, full day recap and checkout-led daily settlement are not implemented yet.

## Product principles

- The player is the merchant, never an expedition commander. Heroes act autonomously.
- One confirmed Day Tick remains the only authority for dungeon and boss expedition results.
- Merchant actions during the open shop day may be transactional, but must be committed atomically, exactly once and saved before the next day tick.
- Visual NPCs follow the same intended purchase decisions and transaction IDs as the economic model. Animation never invents sales.
- Watching an expedition is read-only and never changes state or rerolls combat.
- Keep Shop / Level 7 / Level 6 sharing hero appearance and equipment at the correct historic moment.

## Planned work order

1. **1.2f.1 usability patch**: Wall-mounted torches, shelves against actual walls, walk speed and Shift sprint, N/Z keyboard, bulk wholesale buttons, and essential always-visible roster information. No save schema changes. This is the only work implemented by the initial patch.
2. **1.2f.2 staging + placement**: (Shelf placement implemented first; movable cashier desk and wall order book still pending.) Move wholesale to a wall order book, replace the center wholesale counter with a cashier desk, support grid-snapped shelf/desk placement with collision checks against walls, doors and aisles. Persist transform data with explicit version migration and identity-preserving shelf slot IDs. Visual placement cannot move inventory or create gold.
3. **1.2f.3 intent-driven customers**: Current shipped previews select real shelf targets but do not reserve goods or take money. A separate checkout transaction kernel is now available for integration. Next, introduce individual ShoppingSession with buyer ID, reserved cart, item IDs/slot IDs, affordable subtotal and state machine:
   `enter → consider → navigate-to-shelf → take-item → carry-to-register → queue → await-payment → paid → leave`.
   Uninterested or broke heroes may leave with no purchases. Pathfinding honours placed furniture, doors, queue lanes and NPC personal space. Must avoid teleporting through furniture or standing inside another NPC. Inventory is not permanently transferred until a valid atomic checkout. Pending carts reserve stock to avoid overselling; reservation cancellation returns stock.
4. **1.2f.4 manual cashier**: Press E at the movable register to dock into cashier mode; E again to leave. Only a docked cashier can take payment. Press R twice at two independently timed, green-window beats of a circular register dial. Two successful beats earn 110% of the displayed subtotal; otherwise payment remains at 100%. QTE cannot mint extra money by repeating an already-paid transaction. Include three distinct original/UI-licensed sounds: register cash, double-success reward and missed-beat feedback. Future employees use the same payment transaction without a player minigame. Agree on a fixed-point currency unit for exact 10% tips before implementing.
5. **1.2f.5 HUD clarity**: Nameplates show concise gold, food/hunger status, worn weapon/armor and carried items; billboard LOD hides secondary lines at a distance. Physical roster board shows the same concise inventory/hunger/gear indicators, and dims heroes outside the shop. Roster modal defaults to a compact, readable whole-roster overview, with details/permits still reachable.
6. **1.2f.6 cinematic day recap**: End Day enters a modal full-screen black/dark parchment overlay, *after exactly one committed day tick*, with three keyboard-navigable screens:
    - **The Ledger**: Yesterday's sold items, quantities, income, costs, tips, stock changes, merchant balance. Animate totals conservatively.
    - **The Adventurers**: Hero portrait cards, past-day movements and purchases; expedition outcomes initially redacted as `ADA FLINT · EXPEDITION · WATCH`, with replay actions. Never display deaths, health losses, monster results in the recap until the corresponding replay is viewed. Other game HUD panels must not leak hidden outcomes while recap is open.
    - **Tomorrow**: Remaining supplies, customers expected/awaiting checkout, readiness and a clear `Begin Day N` action. The viewer can skip every recap screen and immediately continue; watching replays is never mandatory.
   Persist or consciously define viewed-replay state separately from authoritative battle results, so revisiting a day summary can reflect what has actually been watched.

## Shop UI wireflow

```text
┌────────────────────────── GALVIK'S SHOP | DAY 24 ───────────────────────────┐
│ INVENTORY     [Player-controlled 3D shop]             ADVENTURER OVERVIEW  │
│ B: Order book Shelf A... [Visitor walking to shelf]   Ada · Food ! · 9g    │
│ E: Place mode                          [Register]     Hale · Sword · 14g   │
│                                 [Checkout queue]                              │
│                        E: Serve at register                              │
│ [Docked] ◉ TIMING DIAL: R at two green zones   Cart: 2x Bread · 8g          │
└───────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────── END OF DAY · 24 ──────────────────────────────┐
│   [ 1 THE LEDGER ]   [ 2 ADVENTURERS ]   [ 3 TOMORROW ]                    │
│                                                                         │
│   SOLD TODAY           INCOME                 TIPS                        │
│   Waybread       ×4     16g                    +1.6g                       │
│   Healing Herb   ×2     12g                    ...                         │
│                       TOTAL                   ...                         │
│                                                                         │
│   [Previous]       [Skip recap / Begin next day]           [Next]          │
└─────────────────────────────────────────────────────────────────────────┘
```

The sample numbers are UI illustrative, not economy values.

## Acceptance tests / must-not-break

- Existing save schema remains valid through explicit version migrations; no corrupted inventory, shop geometry or hero identity.
- Stock conservation across merchant bag, shelves, reserved carts, paid carts, hero inventory, and item consumption.
- A customer's cart is unique and cannot be paid twice; QTE affects only the tip, not purchase validity.
- In unattended checkout mode no customer receives items for free, and no ghost sale occurs in the end-day ledger.
- Roster/nameplates reflect equipped items only after payment commits.
- Each visitor navigates to the actual shelf with reserved goods and joins a physical queue without clipping through other customers/furniture.
- Replays and summary UI never resimulate or spoil not-yet-watched expedition outcomes.
- Shop frame rate under at least 10 contemporaneous heroes and ordinary placed fixtures remains usable.
- Keyboard interactions are scoped (R in cashier mode versus R for roster; N/Z on QWERTZ); Escape consistently exits modal/dock/placement states without unintended item transactions.
