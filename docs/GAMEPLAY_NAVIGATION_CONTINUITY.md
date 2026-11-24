# Navigation and expedition continuity

Phase C of #294. Baseline #354: the four forge treatments reached Floors 6–7. Across Floors 3+, 63,399 of 64,505 sampled descent-route decisions lacked a personally walked route to the stair. This is an observation, not proof that all those moves were wasteful: discovering a hidden stair is legitimate.

This pass changes the existing walker, not its cadence or the dungeon layout:
- A co-located party uses the union of its real walked cells while routing to a committed staircase. A stair genuinely visible from any of those cells is eligible for a connected route across observed walkable cells. No fog is revealed into personal visited history and a hidden staircase does not steer the frontier search.
- Stair search uses a single shared nearest-frontier search rather than voting between individual knowledge sets; the renewable-site farming fallback cannot divert a committed transition or move a party away from an already reached stair.
- A healthy ordinary-floor explorer retains a prior descent through a nonurgent stay decision; injury, combat retreat and actual salvage return retain priority. Combat settlement now uses the existing party negotiation and actual surviving members' readiness rather than hard-coding the Floor-9 readiness flag to false.
- Add actual movement, new walked tile, reached stair, tactical diversion, observed route and blocked route observations to the existing audit. The individual walked-route count remains comparable to the baseline; the additional usable-route measure must not be confused with it.

No new clock, combat authority, saved fields, global hero knowledge, free healing, gear/stat buff, price change, loot change, stair relocation or portal shortcut. The pure regression walks all 36 seed/floor combinations; the existing long-run matrix is the actual acceptance gate. The tests do not assert natural boss success without completed campaign evidence. Salvage-return tuning and boss-party recruitment remain separate evidence-driven steps.
