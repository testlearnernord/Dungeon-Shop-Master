# Dungeon Shop Master · Immersive UI Contract

> **Current implementation contract, reviewed 2026-11-16.** Read this
> alongside [GAME_BIBLE](GAME_BIBLE.md), [ARCHITECTURE](ARCHITECTURE.md)
> and [ROADMAP](ROADMAP.md). Features planned for #152–#156 are not yet
> implemented by this document.

## Purpose
The Level 5 shop is a first-person **cave**, not a desktop dashboard. Gameplay,
exploration and characters should remain visible; management is accessible
through contextual controls and focused overlays.

Reference art is **inspiration**, not a rigid wireframe or production asset.
This document is a maintainable implementation contract.

## Three information layers
1. **Glance HUD**: day, gold, core actions, active population, six item slots,
   plus a **conditional** compact live-service strip. Idle state is collapsed
   and translucent. No broad opaque backgrounds or second dashboard.
2. **Context world UI**: action toast, hero nameplate, item request, a small
   real-shelf crosshair action cue, placement previews, bed prompts and
   spectator context. Icons and short numeric labels first.
3. **Management**: roster, wholesale, debt book, credit dialogue, the staffed
   register, merchant ledger, build editor and campaign controls. Darker
   focused overlays are appropriate when readable records require space.

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
  portrait, name, level, role, **real carried gold** and health bar, since
  it is rendered into a Babylon texture rather than the DOM.
- The live-service strip reuses `public/assets/ui-item-icons.svg` for a
  real restock item; do not create another request icon atlas. Gold uses
  the existing `public/assets/ui-gold.svg`.

## Surface coverage
| Experience | Contract |
| --- | --- |
| Shop header / day / gold | Tiny top-left glance; extra details behind disclosure |
| Hotbar | Six ~54px translucent slots, no whole-bar background; quantities visible, item label on focus |
| Live service strip | Conditional small top-center chips for ready-to-pay customers, live expiring restock and credit requests; **F/click selects stock**, no automatic merchant action |
| Physical shelf focus | Aimed actual slot shows item/count/capacity, correct left/right click and held-cart/bag warnings; no extra modal or pointer interception |
| Controls | Collapsed by default, expandable above the measured dock |
| Visitors / roster | Small glance cluster, full cards and tactical details on demand |
| Wholesale | Item symbols, search, gold, stock, actionable costs and limits |
| Debt Book / begging | Shared icons and controls, ledger-like typography and readable debt |
| Merchant ledger | Cinematic day-end chapter experience, consistent tokens and metrics |
| Cashier | One focused two-stage timed receipt overlay; opens only at the physical staff side with the true next customer; booked sale remains a GameStore action |
| Blueprint / placement / mining | Context prompt and real-world ghost; not a permanent sidebar |
| World nameplates / request bubbles | Portrait, level, role, gold and HP; individual icon-based restock/credit requests with real deadlines |
| Level 6 / 7 spectator | Compact panels, optional controls legend, same focus style |
| Audio / notifications / campaign | Minimal chrome, consistent buttons and persistent errors |

## Invariants and review gates
- Never hide a campaign save **error** behind a collapsed panel.
- Never move purchase or movement authority into presentation helpers.
- All six item symbols remain distinguishable and share exact IDs.
- HUD dimensions remain narrow at 390px, 800px, and desktop 1440px.
- The game stays keyboard operable without pointer lock; do not force
  unnecessary Esc/M roundtrips to handle the hotbar or cashier. Modal focus
  and pointer-lock restoration must remain understandable.
- The `#shop-shelf-focus` ray projection is visual and non-clickable; it
  must hide when nothing relevant is aimed at or when a dialog, mining or
  furniture blueprint owns the interaction. It must never replace the
  authoritative `InteractionSystem` stock/remove ray.
- The `#shop-service-brief` must show only physically present customers'
  active needs or an actually ready cashier head. Its current implementation
  hides when irrelevant, or when an open dialog or furniture blueprint owns
  the screen. Mining mode does not presently hide the top service strip.
  The **F** shortcut only selects an existing hotbar item; no transfer,
  purchase, credit grant or reserve belongs in HUD code.
- Existing valid version-13 saves, controls, dialogues and gameplay tests
  must continue working after UI changes; add visual/geometry checks for
  changed layout. Unsupported older campaigns are **not** silently migrated.
- The current automated checks include `shopUiPass.spec.ts`,
  `shopHudLayout.spec.ts`, `controlsDisclosure.spec.ts` and the
  existing crowded-shop browser flow. This does not replace human
  assessment of legibility and repeated-action friction.
- Proposed cashier flow polish, batch restocking and additional customer
  reactions belong to [ROADMAP](ROADMAP.md), not CURRENT functionality.
