# Dungeon Shop Master | 100-day gameplay loop audit

> **HISTORICAL EVIDENCE — NOT CURRENT REQUIREMENTS.** This report describes its original dated candidate, tests or provenance. Old version numbers, pending tasks and runtime claims are not present instructions. See [Architecture](ARCHITECTURE.md), [Roadmap](ROADMAP.md) and [Alpha v40 acceptance](ALPHA_V40_ACCEPTANCE.md) for current contracts.

> **HISTORICAL MEASUREMENT, predating Alpha v36.** Former source path `level7Exploration.ts` was renamed to `spatialDungeonExploration.ts` in #323; historical stack traces and measured outcomes below retain their original source names. The old `inventory.loot` token and its arrival-time reset were removed in the v36 cleanup; references to that field below describe earlier code, not current gameplay. Fresh long-game economy evidence is still required by #294.
>
> **HISTORICAL MEASUREMENT.** The tables below are exact evidence for
> earlier tested source revisions, not for merged #296–#298. Current code has
> real class progression, role-aware shopping, Floors 1–9 and a Floor-10
> party boss; new 20/50/100-day multi-seed results are still required.
> Track the remaining work in GitHub issue #294 and the [current roadmap](ROADMAP.md).

## Post-fix verification — 22 November 2026

**Status: the seed-9321 crash and permanent merchant-era return/loot plateau have been fixed in the audit branch.** This section supersedes the historical baseline table and "P0" findings below. The original results remain for before/after comparison.

Fixes in source:
- `level7Exploration.ts`: a hero arriving on the lower stair may explore genuine adjacent connected tiles when the upper portal is unknown. No teleport, global hidden-map knowledge or fabricated saved path.
- `campaignSave.ts`: strict saves accept an actual lower stair arrival on Floors 2–4 while rejecting arbitrary unanchored locations.
- `liveDungeonRuntime.ts` / `shopArrivals.ts`: unloading the old abstract `inventory.loot` haul counter on arrival breaks the eternal loot-triggered resupply cycle, without selling or deleting any real `inventory.finds`, cash or equipment.
- `liveDungeonRuntime.ts`: in the historical baseline, heroes spent genuinely owned bread/herbs during two protected off-duty days (one dose per day). The v39 candidate supersedes that rule with a bounded world-tick deadline and a single owned dose upon reentry. There is **no free healing**, gold, item creation, dungeon movement or premature reentry.
- Seeded regression and strict save tests were added or updated. The four-seed × 100-day diagnostic run [45011370044](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45011370044) completed **successfully in all four jobs**.

### Actual post-fix 100-day outcomes

The full assortment uses optimistic scripted cashier/door service, not a simulated Babylon pedestrian motor. "Last XP day" is based on the committed state after each closed day.

| Seed | Policy | Dead accumulated | Original ten survivors | Peak level | Last XP gain day | Galvik gold | Living hero gold |
|---|---|---:|---:|---:|---:|---:|---:|
| 7351 | No merchant | 16 | 4 | 1 | 18 | 20 | 439 |
| 7351 | Consumables only | 22 | 4 | 13 | 100 | 467 | 165 |
| 7351 | Equipment only | 18 | 5 | 3 | 36 | 150 | 257 |
| 7351 | Full assortment | 17 | 4 | 9 | 99 | 390 | 96 |
| 42 | No merchant | 9 | 8 | 3 | 23 | 20 | 529 |
| 42 | Full assortment | 30 | 4 | 12 | 99 | 454 | 163 |
| 2026 | No merchant | 34 | 3 | 3 | 29 | 20 | 449 |
| 2026 | Full assortment | 47 | 2 | 11 | 100 | 340 | 101 |
| 9321 | No merchant | 6 | 7 | 4 | 21 | 20 | 569 |
| 9321 | Full assortment | 22 | 5 | 10 | 100 | 627 | 134 |

**Interpretation:** the P0 navigation crash is eliminated on the reproducing seed, and provisioned heroes keep generating XP through Day 99/100. Unprovisioned or equipment-only campaigns can still stagnate because injured heroes cannot recover and item demand changes. High death rates and very large gold imbalance remain balance risks, **not fully corrected**. XP `level` is still a displayed progress number without general stat growth, and this fix does not claim player-fun proof.

Do not turn the original baseline tables below into current performance claims. They describe the state *before* these code fixes.

---

**Date:** 2026-11-22
**Base:** `main` at `af62940df94307e70fd39712710987761536258f`, simulation version 26.
**Execution:** Production `GameStore` + `activateLiveDungeon` + 200-tick movement + authentic scheduled 60-Hz fights, automated from `tools/analysis/gameplay-100day-audit.mjs`.
**CI:** Dedicated, manually rerunnable branch workflow `.github/workflows/gameplay-100day-audit.yml`. Not part of regular PR smoke or release CI.

## Scope and important limitations

- Each run spans **100 completed world days** (final displayed state is at the start of Day 101), from a fresh GameState, not an accelerated replacement dungeon combat model.
- Four experiments for seed 7351: empty shop/no sales, consumables only, permanent equipment only, full merchandise. Additional empty/full comparisons on seeds 42, 2026, and 9321.
- Merchant actions (two legal shelves, wholesale orders, stocking, physical pickup, exact-one checkout, door exit and walkout) use real GameStore APIs. **Babylon NPC animations, collision/navigation, cashier timing/minigame and human availability are NOT executed in Node**; immediate, perfectly served shop actions and door crossings are scripted and optimistic. In-world pathfinding issues require a browser follow-up.
- No player-initiated loans, ore/coal buyback, cellar/fishing, individual boss permits, Floor-6 duels or later deeper floors. Their systems still require playtesting. Thus all observed fatalities in this audit are ordinary early-floor combat, not a boss balance sample.
- Same seed does not guarantee the same future encounters across scenarios: different purchases alter individual behavior, routes, survival, party choices and generated influx. Differences are observational, **not isolated item-effect estimates**.
- 3 complete seeds are informative regression samples, **not statistically meaningful game-balance confidence intervals**.

## Historical baseline at Day 100 (before fixes)

| Seed | Scenario | Living | Dead accumulated | Original 10 survivors | Peak level | Last XP increase day | Galvik gold | Living hero gold | Dead hero gold |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 7351 | No goods | 20 | 14 | 5 | 1 | 15 | 20 | 393 | 235 |
| 7351 | Healing only | 20 | 7 | 6 | 1 | 15 | 159 | 135 | 96 |
| 7351 | Gear only | 20 | 12 | 5 | 2 | 18 | 131 | 159 | 139 |
| 7351 | Full | 20 | 7 | 6 | 1 | 15 | 168 | 64 | 96 |
| 42 | No goods | 20 | 6 | 8 | 2 | 16 | 20 | 514 | 94 |
| 42 | Full | 20 | 11 | 7 | 5 | 42 | 273 | 119 | 131 |
| 2026 | No goods | 20 | 35 | 3 | 3 | 33 | 20 | 432 | 486 |
| 2026 | Full | 20 | 42 | 3 | 2 | 36 | 209 | 113 | 455 |
| 9321 | No goods / Full | **CRASH** | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

Every completed seed eventually **stops generating XP before Day 50** while shop visits, walkouts, party reports and dungeon step events continue. This is a major lack of sustained gameplay feedback, even where heroes still live and the nominal world clock advances. Active population caps at 20; early deaths are replaced by 2/day until full. The peak level in these samples is 5 but there is no continuing character strength system attached to XP levels.

### Historical P0 crash, now addressed

On seed `9321`, both scenarios abort with:

```text
RangeError: Return route needs visited start and entrance
    at chooseKnownReturnStep (src/game/level7Exploration.ts:398)
    at simulateSpatialDungeonPartyDay (src/game/level7Exploration.ts:510)
    at advanceSpatialDungeonPartyStep (src/game/level7Exploration.ts:719)
    at commitDungeonTick (src/game/liveDungeonRuntime.ts:472)
    at commitLiveWorldEvent (src/game/liveDungeonRuntime.ts:810)
```

**Priority P0.** The shop-return path requires both current tile and floor entrance in the hero's personal `visited` set, even though heroes may enter a floor via a different stair and have not mapped its entrance. Verify the precise route transition and fix at the source of the physically valid state, **not** by silently teleporting heroes or fabricating explored tiles. Add seed-9321 replay regression plus a per-floor stair/return invariant.

## Gold accounting: money is not conserved across outside systems

Fresh game: Galvik 20g, 10 heroes collectively 107g, so 127g recorded. Correct accounting must distinguish:

1. Galvik's liquid gold;
2. gold in living heroes' pockets;
3. **locked gold owned by dead heroes** (still present in dead hero GameState but cannot be spent);
4. external **new hero starting cash** generated at influx;
5. gold minted by real chests/monster rewards;
6. wholesale purchases **draining** gold out of the local merchant+hero economy;
7. credit IOUs (not cash); and buyback transfers (no minting).

Example seed 7351 with no trade: 127 starting + 249 minted on new hero arrivals + 272 from dungeon = **648g across all hero/merchant records**, but 235g is held by dead heroes, meaning only 413g is available to living actors + Galvik.

Seed 7351 full service: 127 starting +174 influx +220 dungeon -193 wholesale = **328g recorded**; of that 168 is Galvik, 64 living heroes, 96 dead heroes. **Only 232g spendable in the local living economy**. Credit and dead hero recovery are not part of this audit.

Dead-hero gold is a sizable economic sink unless recovered. Merchant profits may coexist with impoverished customers: low merchant liquidity is not the only failure mode.

## Item popularity across three successful full-merchandise seeds

| SKU | Sold units | Share of 258 units | Sales gold | Implemented purpose |
|---|---:|---:|---:|---|
| Waybread | 158 | 61.2% | 632g | 8 HP healing |
| Healing Herb | 65 | 25.2% | 390g | 18 HP healing |
| Iron Sword | 22 | 8.5% | 198g | +5 base physical combat damage |
| Leather Vest | 13 | 5.0% | 104g | More damage mitigation in combat, -3 trap damage |
| Mana Potion | 0 | 0% | 0g | Not included in current shopping preference/actual checkout, no proven mana demand |

**Total: 258 items / 1324g sales.** A supply-first algorithm buys bread (target 2) and herbs (target 1) before saving for sword or armor. Initial hero cash is only 5..15g, encouraging repeat consumables before permanent gear. That makes the economic experience narrow and can suppress equipment progression. Dungeon chest finds may also equip some survivors at zero Galvik sales.

Consumed healing is unexpectedly low versus purchase volume. Seed 7351 full-service sold 45 bread and 14 herbs, but only 7 bread and 1 herb were used in recorded day-start healing; seed 42 full sold 56 bread and 32 herbs, but only 14 bread and 1 herb were used in day-start healing. (Some herbs may be consumed inside combat rather than emitting `healed` events, so **this is not total item consumption**.) This requires separate inventory-delta accounting across fights.

## Who dies, and what changes their odds

Across successful **full-merchandise** seeds: 60 deaths total:
- Floor 2: 22 (36.7%)
- Floor 3: 38 (63.3%)
- No deaths observed on Floors 1, 4 or the unpermitted Cave Troll floor.
- All recorded fatal transitions classified as ordinary **combat**. This category is inferred from actual actor-death and replay context, not a game-native `deathCause` enum. Trap damage still exists and can contribute to a later combat death.

Notably full assortment does **not** imply better survival: seed 7351 changes deaths from 14 to 7, seed 42 from 6 to 11, seed 2026 from 35 to 42. The full-game causal response is complex and may be unhealthy; verify item-specific prevention through paired identical combat scenarios and equal exposure.

## Character progression and long-term stagnation

- `level = 1 + floor(xp / 100)` is computed, yet `stats.strength/agility/intellect/maxHealth` never automatically level up. Combatants draw attack/HP from **base stats plus permanent Sword/Vest plus consumables**. A level-5 hero does not gain improved base combat ability merely by reaching level 5.
- Dungeon AI uses HP thresholds, explored-tile thresholds, and `inventory.loot >= 2` as an unconditional shop-resupply trigger. The abstract loot token increases on chest rewards and has no observed production path that clears it. It is **not** the tangible `inventory.finds` merchandise bought back by Galvik. This is a plausible persistent shop-return loop, not fully isolated proof of the entire stall.
- Day-20 to Day-100 on seed 7351 produces ~1600 `dungeon-live` signals and ~530 each arrivals/walkouts/door exits **with zero new XP, casualties or sales**. The simulation consumes events without producing progress.
- Shop inventory demand is also exhausted early; gear never wears out, food is not consumed absent injury and supplies remain in backpacks. Customers repeatedly visit and immediately leave while the world looks active.

## Priority changes (keep game identity)

**P0, correctness**
1. Repair seed-9321 return-path crash with physical stair/portal-consistent routing; reproducible regression.
2. Diagnose no-XP plateau with telemetry showing `active` vs `idle` hero intentions, unresolved/renewed sites and per-hero visits. Fix persistent resource/return/exploration loop, not artificial XP injection.

**P1, actual long-game fun and causality**
3. Level progression: class-specific **small, capped** HP and skill growth, possibly trait/skill unlocks and combat XP; test from 1–100 days, prevent immortal gods.
4. Differentiate real **loot** from obsolete abstract `inventory.loot`; sell/deposit/drop tangible physical `finds` at the shop, retire/reset token after real settlement.
5. More meaningful recurring item needs and at least two equipment tiers; avoid food-first budgeting starving gear. Improve hero-specific priorities (tanks favor armor, damage dealers weapons, wounded favor healing).
6. Visible item-effect attribution: merchant receipt -> expedition -> hit prevented / HP healed -> survival difference with replay bookmarks; do not falsely claim Galvik saved a life when the counterfactual is unproven.
7. Economic loop: voluntary buyback, salvage from fallen heroes, sane gold recirculation, distinct gross sales / purchases / profit / debtor outstanding / inaccessible dead gold. No phantom cash minting.
8. Break repetitive unused shop visits: believable motives, limited supply, repair/gear upgrade, social needs/merchant reputation, and ability for heroes to stay away or leave the campaign.

**P2, richer simulation, after P0/P1**
9. Differentiated role and personality behavior, loot demand, temporary parties, retreat behavior, shop relationship and memory; ask whether individual names become worth caring about.
10. Full authored deeper floors including intended floor 10, cautious difficulty curve and gear-demand progression, instead of tuning indefinite shallow farming alone.
11. Make `Mana Potion` actually useful in a mana-using fight/healing archetype, or remove/disable it from initial wholesale catalog until it has a purpose.
12. User-test the actual 3D cashier, traffic and store layout for obstruction and fatigue. Current Node audit gives an optimistic upper bound on player transaction throughput and cannot answer whether the checkout minigame stays enjoyable on day 30.

## Game-quality acceptance gate

Run multiple seeds across **100 days**, plus fixed-seed scripted policies:
- No unhandled errors on any seed; identical `seed + player actions` deterministically replay after save/load.
- Nonzero meaningful events and XP/resource progress continue after days 20, 50 and 80 unless explicit completed campaign/endgame phase is reached.
- Some veterans survive and develop class-specific strength; some die; no guaranteed wipe and no permanent immortality.
- No unsourced money; track `start + influx + dungeon - wholesale = local gold (living+dead+Galvik)` exactly (minus any other explicitly tracked external sinks when added).
- Player choice affects real combat survival in controlled experiments, not merely purchase totals.
- Show financial decisions and *reasonably varied* return visits rather than hundreds of unnecessary walkouts; expose profitable and unprofitable merchant choices.
- The same runs under **slow customer service** and **simulated stockouts/underinvestment** as with optimistic instant scripted checkouts.
- Native 3D/manual playtesting remains mandatory to judge player delight and camera/audio fatigue.

**Historical conclusion before the fixes:** the original first 5–40 days could produce real stories, but the long run stalled and seed 9321 crashed. **Post-fix tests above supersede this baseline**: supplied/provisioned campaigns now keep moving through Day 99/100, while long-run balance, scarce goods, no-merchant recovery, class scaling and human 3D playtesting remain open.
