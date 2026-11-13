# Dungeon Shop Master · immersive UI contract

## Purpose
The Level 5 shop is a first-person **cave**, not a desktop dashboard. Gameplay,
exploration and characters should remain visible; management is accessible
through contextual controls and focused overlays.

Reference art is **inspiration**, not a rigid wireframe or production asset.
This document is a maintainable implementation contract.

## Three information layers
1. **Glance HUD**: Day, gold, core actions, active population, six item slots.
   Idle state is collapsed and translucent. No broad opaque backgrounds.
2. **Context world UI**: action toast, hero plate, item request, build previews,
   bed interactions, spectator context. Icons and short numeric labels first.
3. **Management**: roster, wholesale, debt book, credit dialogue, cashier,
   merchant ledger, build editor and campaign controls. May use darker opaque
   surfaces when real decisions or complex records require readable text.

## Foundations
- `src/immersiveUi.css` overrides the old CSS last. New UI should prefer the
  shared tokens `--ui-bg`, `--ui-glass`, `--ui-glass-strong`,
  `--ui-border`, `--ui-text`, `--ui-muted`, `--ui-gold`,
  `--ui-focus`, `--ui-danger`, `--ui-success` and `--ui-radius`.
- Sizes follow a 4px-based rhythm, with 32–44px interactive targets where
  space permits. Borders are subordinate to content, not the design itself.
- Headings use restrained fantasy serif; operations, metrics, numbers and
  microcopy use a clear sans serif. Maintain accessible contrast on bright
  floor tiles, lava and near-white combat effects.
- Core controls have stable DOM IDs, keyboard access, visible focus, semantic
  button text and shortcuts. `prefers-reduced-motion` must be respected.
- Tooltips may reveal text, but essential state must never be **icon-only**:
  quantities and danger states keep readable numbers or accessible labels.

## Icon registry
- All **items**: `public/assets/ui-item-icons.svg#<item-id>`, via
  `itemIcon()` in `src/uiIcons.ts`. Used by the stocking dock, wholesale,
  receipts, roster, wish bubbles and debt history.
- All **semantic controls**: `public/assets/ui-interface-icons.svg#<name>`,
  via `uiIcon()` and `setupInterfaceIcons()`. Do not introduce another
  competing atlas or emoji-based controls.
- The dynamic, canvas-rendered hero nameplate deliberately draws its own
  portrait, name, role and health bar, since it is rendered into a Babylon
  texture rather than the DOM.

## Surface coverage
| Experience | Contract |
| --- | --- |
| Shop header / day / gold | Tiny top-left glance; extra details behind disclosure |
| Hotbar | Six 54px-ish translucent slots, no whole-bar background; details on focus |
| Controls | Collapsed by default, expandable above the measured dock |
| Visitors / roster | Small glance cluster, full cards and tactical details on demand |
| Wholesale | Item symbols, search, gold, stock, actionable costs and limits |
| Debt Book / begging | Shared icons and controls, ledger-like typography and readable debt |
| Merchant ledger | Cinematic day-end chapter experience, consistent tokens and metrics |
| Cashier | One focused operational overlay; existing timing and sales unchanged |
| Blueprint / placement / mining | Context prompt and real-world ghost; not a permanent sidebar |
| World nameplates / request bubbles | Portrait, role and HP; separate iconic item requests |
| Level 6 / 7 spectator | Compact panels, optional controls legend, same focus style |
| Audio / notifications / campaign | Minimal chrome, consistent buttons and persistent errors |

## Invariants and review gates
- Never hide a campaign save **error** behind a collapsed panel.
- Never move purchase or movement authority into presentation helpers.
- All six item symbols remain distinguishable and share exact IDs.
- HUD dimensions remain narrow at 390px, 800px, and desktop 1440px.
- The game stays keyboard operable without pointer lock.
- Existing save files, controls, dialogues and gameplay tests must continue
  working after every UI change; add visual/geometry tests for new layout.
