# Depth and forge comparison

> **HISTORICAL EVIDENCE — NOT CURRENT REQUIREMENTS.** This report describes its original dated candidate, tests or provenance. Old version numbers, pending tasks and runtime claims are not present instructions. See [Architecture](ARCHITECTURE.md), [Roadmap](ROADMAP.md) and [Alpha v40 acceptance](ALPHA_V40_ACCEPTANCE.md) for current contracts.

Follow-up to #294 and #352. The first fourteen 100-day scenarios reached at most Floors 4–5, even with class-complete T1 gear and peak levels 13–16. No Floor-9 bottleneck can be inferred from those runs. No production decision, movement, damage, loot, price or save rule is changed here.

The existing GameStore audit now reports the actual decisions, known stair connectivity and successful physical crossings for every ordinary floor. Decision counts are repeated observations, not unique heroes; a stair which has not been visited is not necessarily unreachable. The report exposes detached examples and checks per floor without dumping the entire daily JSON into logs.

The same four seeds and existing stock policies are retained. Two extra scripted policies, buyback and forge, use identical validated third-shelf placement, the existing T1 assortment, real paid material offers, reserve caps of 8 Iron Ore, 8 Coal and 16 Ghoul Leather, and a 10g merchant cash buffer for buyback. The buyback policy retains materials; the forge policy crafts only to replenish one real shelf unit per T2 product. All crafting, stocking, pickup and payment use original GameStore operations. There is no free material, fabricated customer or T2 wholesale purchase. Ledger checks reconcile all purchased and consumed materials, and all forged units with paid sales and remaining stock. Because crafting consumes materials, these policies are not a matched equal-spending intervention: report realized expenditure and outcomes before attribution.

These are explicitly selected experimental storefront policies, not new autonomous merchant gameplay. The real shop requires manual controls and physical walking; the audit retains the original idealized storefront abstraction.
