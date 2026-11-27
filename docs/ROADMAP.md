# Active roadmap — Alpha v48

> Current contract: Alpha v48 (Employee Cashier). This is the active backlog, not a numbered PR sequence. Completed features and old experiments are not tasks. Use [Architecture](ARCHITECTURE.md) for current runtime and [Alpha acceptance](ALPHA_V48_ACCEPTANCE.md) for evidence.

## P1 — current acceptance

[Issue #294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294) is the current gameplay acceptance tracker.

- Play ten actual Galvik days; verify merchant choice, meaningful sales, shortages, credit, automatic chest intake before shopping, open/closed and insufficient funds behavior, forge-to-shelf-to-paid-sale, repeat visits and real recovery/return.
- Verify LIVE direct entry from World Echoes and map, ordinary/boss score cue, animations, camera controls, replays and real-device FPS. Inspect the final #374 presentation changes.
- Check fresh Alpha v48 Save/Load, current visit identity, real portal/bed/cellar clearance and cross-day encounter continuity. File reproducible bugs instead of restarting general balance research.

The completed two pre-chest v40 200-day Forge campaigns reached and beat Floor 10; the controlled matrix confirms T2 leverage. The owner waived waiting for the four remaining 100-day jobs. Do not restart blanket long-run audits without a specific regression or owner request. No further balance adjustment is assumed. The v41 economy and v42 movement cadence have changed; historical audit figures do not validate the new pacing. The matched v42 ten-day Forge comparison ran successfully; it is a single-seed diagnostic, not proof of final balance.

## P3 — art backlog

[Issue #334](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/334): polish shared crypt relic and green ghost flame. Cosmetic only, deliberately deferred.

## Future design — not committed implementation

Additional authored deep-floor variation, new monsters, equipment tiers, repairs, broader relationships and lore are possible design topics, not scheduled tasks. Curse origin, Ghoul identity, transfer/ending and 100-floor ambitions remain open. Do not treat a concept as canon.

## Release gates

One saved world and combat authority, physical transactions, deterministic current-format saves, green relevant build/unit/browser checks and explicit manual acceptance. No old-save migration, fabricated loot or XP. A green scripted audit is not a physical playtest or proof of final balance.

- Pacing acceptance: check faster LIVE motion, pursuit escape, real return journeys, encounter density, shop arrivals and frame pacing without changing the world day or combat speed.

## Next integration priorities

- Validate observed threat memory against repeated evasive routes and co-located party behavior; inspect the corrected room texture on the actual Table-to-LIVE transition.
- Autonomous boss progression verified in two matched 45-day campaigns; validate elective class/tier gear demand and post-boss trade continuity; no new content or parallel AI. Fishing and mana potion integration remain separate design tasks.

- Next integration after elective resupply acceptance: remove the legacy forecast mutation adapter in favor of direct read-only planning if justified by observed defects, then resolve fishing and mana potion gameplay roles.

## Employee Management V0.001

- A/B: merged, saved employee identity, peaceful Ghoul presentation, shared physical route, task priorities.
- C1: merged (#385); persistent shelf assignments via quickbar and middle-click, physical paper slips, reload coverage passed. Manual visual acceptance open.
- C2: implemented physical pickup/delivery/return and shared bag reservations (#386); first CI passed, synchronized-base CI and visual acceptance pending.
- D: merged after green unit and browser CI; physical staff dock and shared front cart, three-second service timer, canonical payment without tips, manual takeover; manual visual acceptance pending.
- E: matched credit-demand audit passed (see Alpha v48 acceptance); owner approved opt-in physical credit work. Employee credit service merged after 373 core unit and 14 browser tests passed; visual acceptance pending.
- F: combined two-buyer physical restock/checkout scenario and priority/cargo regressions in the F candidate; CI, visual acceptance and sustained throughput tuning pending. Route availability candidate prevents disconnected shelf reservations and tests portrait changes before and after collection. No extra employee types until foundation works.
