# Employee Management V0.001 A/B — Tettel

## Owner vision

Tettel is a prototype name. He is nearly identical to the current dungeon Ghoul, but peaceful: he repeatedly returned to Galvik even after being beaten, was hidden in the cellar because customers were frightened, and learned shelf stocking and cashier work by decades of observation. Reliable, slower than the player, never receives tips. The reference concept image is not an asset design contract.

## Implemented foundation

- One known employee by default, no hire price or wages in this stage; no combat membership. Reuse existing Ghoul model and idle/walk clips, no new rig.
- Saved modular definitions, supported tasks, priorities Off/1–9. A/B defaults all Off to avoid unrequested interference. Lower number wins; equal priority favors the older continuously available task type, then stable task/target ordering. Keep equivalent current target when valid.
- Real work opportunities: physically waiting head of checkout queue, configured nonempty shelf with spare capacity and owned stock, actual active credit request with service claim. No phantom tasks for unavailable stock.
- Physical fixed-step movement at 1.47 m/s (70% of nominal customer walking speed), same world clock and existing connected route search, private-room geometry and real ramp height. Open portrait to permit travel; blocked routes wait and retry. Idle returns to available cellar home. No teleport through closed doors.
- Employee UI J or Employees button, persisted priorities and checkpoint. No actual work effects in A/B. Manual Galvik retains all transaction authority. No service reservation or manual-employee takeover yet; those are requirements for C/D, not implied features.

## Next phases

C: configured empty shelf restock intent, physical storage pickup and shared stock reservation; D: real cashier authority without tips and manual takeover; E: evaluate real charity demand and policy; F: combined physical workflow and performance. Exact work speeds, hiring, running costs and charity policy are tuning/design choices, not established lore.

## Verification

Strict v46 save, priority/identity validation, route crossing, fixed movement bounds, no stock/gold effects and actual browser model/priority reload test. Visual and physical play acceptance remain open until tested. Headless economic campaigns do not emulate worker walking or work at this stage.
