# V38 campaign progression instrumentation

This is Phase A of the parked progression roadmap (#294), reactivated after the forge implementation. No thresholds, prices, loot odds, combat rules, party rules or save schema are changed.

- The existing 100-day runner remains the only scripted merchant. Historical absent/consumables/equipment/full stock policies remain comparable. A new `tier1` policy includes Spear and Staff in the second existing shelf, correcting the old sword-only weapon coverage for this additional comparison. None of these policies buys salvage or crafts T2 yet; that is an explicit later controlled economy comparison.
- Optional detached diagnostic records identify the actual individual decision branch, final negotiated action, Floor-9 readiness checks, known stair routing and the exact physical crossing checks. The combat settlement's existing `bossReady=false` path is reported, not changed.
- Daily per-hero deepest sampled floor, sampled dwell ticks, actual gear, HP, gold, finds, permission, goal, return phase, known/resolved resources, sampled party co-location and formation/separation accompany the original economic metrics. The 20/50/80/100-day checkpoints aggregate crossing/readiness evidence. An accepted crossing also records Floor 10 even if it ends between samples.
- Failed predicates may overlap and are counts of observations, not mutually exclusive causes. Unknown stairs are not inherently unreachable. The artifact distinguishes no observed Floor 9 from Floor 9 without Floor 10. Root-cause claims require examining the completed run and reproducing the specific blocking case.
- The normal runtime has no collector, stored diagnostic data, new clock, UI exposure or RNG calls. The existing core LIVE suite compares observed and unobserved state and tests the actual rejected solo stair gate.

The CI audit workflow runs the original four seeds with the additional Tier 1 policy. Reports are diagnostic evidence, not visual or physical NPC acceptance.

## Initial evidence (audit run 45393826162)

All 14 scenarios completed (four seeds, 100 days each). No scenario reached Floor 9. Maximum sampled depth was Floor 4 or 5, including the class-complete T1 policy; peak hero levels with the T1 policy ranged from 13 to 16. Therefore the initial bottleneck precedes Floor 9, and the absence of boss attempts does not prove a boss-gate defect. No balance change is justified yet. See the attached workflow artifacts for daily hero and party observations. A separate core test revealed the strict save parser rejected genuine fights spanning a later map tick; the cadence validation now permits those real historical start ticks while still checking exact combat age and frame count.
