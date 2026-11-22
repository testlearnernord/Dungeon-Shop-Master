# Alpha v36 · 100-day LIVE gameplay/economy audit

**Measured:** 23 November 2026. **Source commit:** `bcad65ca009b5695f928bb7d8f61ef10b5652a5f`, based on `main` after merged PR #323 (`a77d0ce`). **Reproducible [GitHub Actions run #45083388092](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45083388092)**, four successful jobs, ten scenarios, 100 simulated days per scenario. Current save contract: Alpha v36, no old-save migration.

## What was really tested

`tools/analysis/gameplay-100day-audit.mjs` drives real `GameStore`, the saved world clock, ordinary-floor navigation, site regeneration, temporary parties, authentic combat and paid `payReservedCart` transactions. A scripted merchant restocks and performs available cart/physical-exit game operations. For each genuine living shop visitor the merchant also performs the existing, player-accessible `store.setBossPass(hero.id,true)` action; it does **not** forge credentials, force moves, teleport parties, inject XP or choose a boss result. Four seeds (`7351`, `42`, `2026`, `9321`) and four policies (absent/full on every seed, plus consumables-only/equipment-only on `7351`) form ten scenarios.

**Not represented:** actual Babylon NPC walking, congestion, customer arrival positions, cashier-player timing and real-device art/audio performance. These require separate browser and manual acceptance. The four Jobs finished technically successfully, which does not mean their balance goals passed.

## 100-day outcomes

| Seed | Shop strategy | Last day with XP gain | Highest level | Highest XP | Paid units | Actual walkouts | Deaths | Floor-10 attempts |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 7351 | absent | 53 | 4 | 336 | 0 | 604 | 27 | 0 |
| 7351 | consumables | 100 | 6 | 504 | 295 | 256 | 61 | 0 |
| 7351 | equipment | 35 | 5 | 420 | 34 | 573 | 17 | 0 |
| 7351 | full | 100 | 7 | 688 | 281 | 271 | 59 | 0 |
| 42 | absent | 56 | 5 | 436 | 0 | 583 | 12 | 0 |
| 42 | full | 87 | 9 | 840 | 247 | 400 | 21 | 0 |
| 2026 | absent | 39 | 4 | 336 | 0 | 589 | 52 | 0 |
| 2026 | full | 100 | 10 | 916 | 373 | 333 | 87 | 0 |
| 9321 | absent | 38 | 3 | 260 | 0 | 635 | 10 | 0 |
| 9321 | full | 100 | 11 | 1088 | 455 | 225 | 38 | 0 |

**True saved Shop Walkouts:** `unservedCustomers` now derives from committed `shop-walkout` events rather than only immediate script calls. The earlier test runner incorrectly showed zero for absent-stock despite hundreds of legitimate exits. Boss grant totals were 165 (`7351`), 56 (`42`), 92 (`2026`) and 78 (`9321`): **391 total actual `setBossPass` actions, zero Floor-10 entry events.** All ten scenarios recorded `bossVictory=false` and no `floorsCleared` entries.

### Full-shop XP checkpoints (highest recorded hero XP)

| Seed | Day 20 | Day 50 | Day 80 | Day 100 |
| --- | ---: | ---: | ---: | ---: |
| 7351 | 272 | 384 | 664 | 688 |
| 42 | 376 | 712 | 756 | 840 |
| 2026 | 324 | 712 | 768 | 916 |
| 9321 | 280 | 556 | 900 | 1088 |

## Conclusions grounded in this run

1. **Meaningful economic influence exists in the scripted-storefront scenario**: full stock permits higher cumulative XP and deeper progression indicators than absent stock. This is *correlation under controlled merchant policies*, not verified physical-shop performance; changing available items also changes survivorship and action frequency.
2. **Empty stores stagnate**: last XP gain occurs on Days 38–56 across all four absent-stock seeds. Equipment-only policy on seed 7351 also stops gaining XP on Day 35. Persistent dungeon-live/feed events after that do not automatically imply meaningful progression.
3. **Floor-10 end-to-end acceptance is unmet**: even with valid Boss Pass grants on real visits, **0/10 scenarios started the boss**. This does *not* by itself identify the cause. Instrument the deepest actually reached floor, floor-9 co-location, individual intent, party willingness and equip/health/visited thresholds before modifying balance or relaxing fight gates. Unit tests of direct-entry boss combat are **not** campaign proof.
4. **Physical NPC/cashier/portal acceptance remains separate**. The scripted merchant uses authoritative methods, but never proves Babylon pathfinding, visual collision, jammed checkout or actual player service time.
5. **Death and gold interpretation need care**: higher mortality in some full-stock runs is not automatically an equipment regression. The simulation has different influx/combat exposure and active-time histories. Compare survival rates per expedition or actor-time and distinguish gold permanently held by dead heroes before concluding economic health.

## Follow-up required for GitHub Issue #294

- Instrument **deepest floor ever reached**, per-hero floor-9 presence, persistent Temporary Party state, party-boss eligibility reasons and ordinary-floor goal distributions, without injecting heroes directly into the boss.
- Investigate the absent-stock/equipment-only progression plateaus and genuine shop demand/credit/buyback/late earnings. Avoid fabricated transactions or global XP bonuses.
- Run an actual multi-day browser player/customer cashier, credit, buyback, portal, cellar and reload path. Curated CI smoke is necessary but insufficient.
- Re-run the same matrix after *any* gameplay correction. Do not close #294 until meaningful late-game outcomes and natural Floor-10 party attempts are established, or the product deliberately adopts an explicit ending/remaining-depth design.

**Historical reports:** [Prior 100-day audit](GAMEPLAY_100DAY_AUDIT.md) predates the final v36 source and should not be conflated with these measurements. The original and rerun telemetry are recorded in GitHub Actions run artifacts (`gameplay-100day-report-<seed>`) subject to their workflow retention window.
