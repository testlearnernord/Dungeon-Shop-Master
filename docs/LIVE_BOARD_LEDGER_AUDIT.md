# LIVE Adventurer Board and day-end ledger — current contract

> Current contract: Alpha v44 (Autonomous Boss Progression). The original planning/audit is preserved in Git history.

- One shared current hero projection (`liveRosterCards` in `heroCardView.ts`) supplies the wall Board, E/R and compact day HUD. The global World Echoes feed derives committed events. The event-only signal selector is retained for historical notification semantics, not current roster data. No hero AI knowledge or outcome is modified.
- A single Hero Card projection/renderer supplies roster, inspector and combat party views. Unknown historical values stay unknown.
- Actual deaths may emit a bounded magical signal. A click opens an actual active fight or original committed recording, never invents footage.
- Bed closes the day and provides lean merchant accounts; the ledger does not simulate dungeon actions or function as a second Board. Paid sales, buyback costs and credit/debt remain distinct.
- The saved world clock drives expeditions and customer traffic throughout the day. Real physical departure begins bounded health-dependent recovery; a real next visit has its own checkout/credit identity.
- The archive retains today plus two earlier days and at most 12 player-pinned recordings. LIVE entry immediately displays the actual committed fight; only local playback uses optional pre-fight films.
- Strict Alpha v44 saves only; no migration or legacy adapter.

See [Architecture](ARCHITECTURE.md), [World clock](LIVING_WORLD_CLOCK.md), [Floor spectator](FLOOR_SPECTATOR_CONTRACT.md) and [current acceptance](ALPHA_V44_ACCEPTANCE.md).

The Buyback Log is a read-only view of actual material expense receipts. The physical chest owns intake, not the nightly ledger or an offers modal.
