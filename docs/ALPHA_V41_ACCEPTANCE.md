# Alpha v41 — current acceptance

The Recovered Goods Chest changes the merchant intake policy and adds a saved open/closed flag. Start a fresh v41 campaign; no migration from v40. Prior combat and campaign evidence is retained in [Alpha v40 evidence](ALPHA_V40_ACCEPTANCE.md), not relabeled as a v41 playtest.

## Verification scope

- Build and targeted unit/browser regressions: check the latest PR #379 workflow, not this document for a live CI verdict.
- Verify open/closed interaction and saved state; a seller reaches the reserved dock before browsing. Two sellers must not share the same service claim.
- Verify treasury-limited partial sales, no bag use, distinct per-unit expense receipts, actual hero gold, no duplicate transfer on reload, and unchanged ownership of other finds.
- Verify the real cellar forge consumes the actual reserve and crafted T2 gear goes through shelves and cashier. The headless campaign explicitly models ideal service arrival using production settlement; it does not measure physical customer pathfinding.
- Check visual/audio/interaction polish on the actual device, including floating receipt readability. No dedicated drop sound or falling item mesh is claimed.
- Continue manual acceptance under [#294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294) and integration tracking under [#376](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/376). [#334](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/334) remains deferred art polish.

The prior v40 long-run evidence used capped scripted manual purchases. The v41 audit uses the real automatic acceptance and price policy with no artificial purse/stock caps. Compare new runs as a changed treatment, not as an identical repetition of the old economic experiment. Do not start a blanket long-run audit without a specific reason or owner request.
