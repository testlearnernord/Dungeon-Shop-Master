# Legacy and obsolescence — current boundaries

> Reviewed against Alpha v40, main after #374 (25 November 2026). The former dated cleanup matrix is available in this file's Git history. Completed removals are not pending work.

| Retired | Canonical current authority |
| --- | --- |
| Numbered shop/away/transit aliases and two gates | Unnumbered cursed shop, shopRoom, explicit shop/away/transit, single portal |
| Floor-specific ordinary exploration checkpoints | dungeonWorlds for Floors 1–9 |
| Abstract loot haul tokens | Actual owned inventory.finds, paid buyback |
| Separate day-batch dungeon resolver | Shared saved world clock and LIVE scheduler |
| Old solo Floor-6 preview, motor and replay adapters | Production groupCombat, Floor-10 party boss, V Combat Lab |
| Old fixed fight horizons | Natural outcomes, shared progress and physical retreat |
| Legacy quote checkout | Actual reserved carts, staffed payment, visit identity |
| Old-save compatibility | Strict Alpha v40, no migrations |

Do not reintroduce these as helpers, fallback modes or compatibility adapters. Retain negative regression tests that enforce removal. Check actual references, computed imports, dynamic assets, build generators and saved contracts before deleting anything. No asset removal or history rewrite without separate authorization. [Asset ownership](ASSET_OWNERSHIP.md), [Architecture](ARCHITECTURE.md) and [CI policy](CI_POLICY.md) govern current changes.
