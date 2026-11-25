# Alpha v42 — prior Living Dungeon pacing acceptance

> Superseded by [Alpha v43 acceptance](ALPHA_V43_ACCEPTANCE.md). This file preserves the pacing contract and prior test scope, not v43 evidence.

The shared map cadence is 50 world ticks per hero/party tile and 100 per monster tile, or 2.5 and 5 unpaused seconds. The 24-minute world day, 60 Hz combat, real portal transit, absolute recovery and shop request deadlines are unchanged. Monsters remain slower than heroes and retain three consecutive missed LOS checks; idle decision intervals scale with movement. No camera-dependent acceleration.

Fresh v42 campaigns only: the exact saved next movement and encounter alignment rules changed. No migration.

## Verification

- Exact scheduler intervals, half-speed monster movement, connected tiles, LOS pursuit and escape, shared encounter contact, save/reload and day-boundary continuity.
- Actual map and table movement playback on the new cadence; keep the existing 0.85s hero and 1.2s monster traversal bursts.
- Targeted before/after short scripted Forge campaigns: compare arrivals, material receipts, gold, deaths, dungeon depth and runtime. This is economic diagnostics, not physical or final balance acceptance.
- Check real shop traffic and physical intake, forged equipment purchases, audio, visual readability and device FPS as in [#294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294).

Prior evidence: [v41 intake scope](ALPHA_V41_ACCEPTANCE.md), [v40 combat and campaign evidence](ALPHA_V40_ACCEPTANCE.md). Neither proves v42 balance. Verify the actual CI result for the candidate; no blanket 100-day matrix is required.

Concurrent encounter regression: a newly created ordinary or boss fight must not consume the preceding half-second when its arrival shares an already scheduled combat burst. Its age and initial frame remain zero until the next burst. The strict checkpoint validator remains unchanged.

The corrected matched ten-day Forge audit (seed 7351) recorded 42 vs 50 served customers, 1535 vs 1814 events, 74 vs 78 materials purchased, 286 vs 222 shop gold, and 0 vs 2 hero deaths for v41/v42 respectively. CI passed before #380 merged. One seed and scripted service are not final physical gameplay acceptance.
