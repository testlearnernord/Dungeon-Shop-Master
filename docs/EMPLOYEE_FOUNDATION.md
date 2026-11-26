# Employee Management V0.001 A–C — Tettel

## Owner vision

Tettel is a prototype name. He is nearly identical to the current dungeon Ghoul, but peaceful: he repeatedly returned to Galvik even after being beaten, was hidden in the cellar because customers were frightened, and learned shelf stocking and cashier work by decades of observation. Reliable, slower than the player, never receives tips. The reference concept image is not an asset design contract.

## Implemented foundation

- One known employee by default, no hire price or wages in this stage; no combat membership. Reuse existing Ghoul model and idle/walk clips, no new rig.
- Saved modular definitions, supported tasks, priorities Off/1–9. A/B defaults all Off to avoid unrequested interference. Lower number wins; equal priority favors the older continuously available task type, then stable task/target ordering. Keep equivalent current target when valid.
- Real work opportunities: physically waiting head of checkout queue, configured nonempty shelf with spare capacity and owned stock, actual active credit request with service claim. No phantom tasks for unavailable stock.
- Physical fixed-step movement at 1.47 m/s (70% of nominal customer walking speed), same world clock and existing connected route search, private-room geometry and real ramp height. Open portrait to permit travel; blocked routes wait and retry. Idle returns to available cellar home. No teleport through closed doors.
- Employee UI J or Employees button, persisted priorities and checkpoint. No actual work effects in A/B. Manual Galvik retains all transaction authority. No service reservation or manual-employee takeover yet; those are requirements for C/D, not implied features.

## Next phases

C: persistent owner-controlled shelf assignments, physical storage pickup and shared stock reservation; D: real cashier authority without tips and manual takeover; E: evaluate real charity demand and policy; F: combined physical workflow and performance. Exact work speeds, hiring, running costs and charity policy are tuning/design choices, not established lore.

### Owner-approved shelf assignment contract (C1 implementation)

Galvik can assign a specific sellable item to each individual shelf slot independently of its current quantity. This is a general shop-management feature, usable without an employee. The assignment persists until Galvik explicitly clears or changes it, including when the last unit is sold or removed, when stock is unavailable, across save/reload and when the same shelf is moved. Employees may restock assigned slots but must never choose, clear or change their assignments.

Proposed implementation safeguards: retain the canonical stock and cart authority; an assignment is not stock and cannot itself satisfy shopping demand. Reject incompatible assignments or clearing while physical or cart-reserved goods remain, rather than deleting or converting goods. An empty assigned slot is a valid restocking target only when the matching stock is available and the physical task can proceed. Preserve existing cart-return capacity checks. C1 uses the existing slot `itemId` as the persistent assignment and `quantity` as physical stock. Middle-click on a reachable slot assigns the selected quickbar product, toggles off the same assignment, or clears an empty assigned slot with an empty quickbar selection. Quickbar product references can be bound even at zero inventory. A small non-pickable paper slip on the physical shelf shows the assigned product at any stock count. Initial manual stocking of an unassigned slot also assigns it. Left/right-click retain stock/remove semantics. Assignment and manual transfer are available without employee work. C2 shared worker reservations and actual stock transfer are implemented on the C2 branch. C1 and C2 CI and visual acceptance remain pending. The existing v46 slot shape remains valid, including an unassigned empty slot with previously reserved customer goods; the cart lock still protects it.

## C2 physical restocking

- The existing bag remains the single owned merchandise pool; the cellar chest is a physical employee collection/return dock, not a second inventory.
- Claim only real matching available units up to one shelf's remaining capacity. The saved reservation is a subset of bag stock. Manual transfer, discard and bag-funded credit cannot consume reserved units. Manual stocking of the target may cancel an uncollected claim.
- Physical collection, delivery and return use the existing employee route and clock. Collection/return take 20 ticks; placement takes 20 ticks per reserved unit. Cargo is visible only after collection. A stale assignment, full shelf, new unpaid customer cart or disabled priority cancels uncollected work or triggers a physical return. No remote work on missed ticks.
- All transfers use the canonical shelf mutation; no gold or customer equipment changes. Cashier/charity remain configurable but do not preempt active restocking until implemented.

## Verification

New strict v47 campaign, no migration from v46. Unit regressions cover reservation conservation, actual chest arrival, physical ramp travel, cancellation, manual takeover and save/reload in transit. C1 browser coverage uses actual quickbar and physical middle-click note. C2 browser performance, animation, route and economy acceptance remain open; headless economic campaigns do not emulate worker movement. See [Alpha v47 acceptance](ALPHA_V47_ACCEPTANCE.md).
