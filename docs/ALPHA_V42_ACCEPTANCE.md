# Alpha v42 — Living Dungeon pacing acceptance

The shared map cadence is 50 world ticks per hero/party tile and 100 per monster tile, or 2.5 and 5 unpaused seconds. The 24-minute world day, 60 Hz combat, real portal transit, absolute recovery and shop request deadlines are unchanged. Monsters remain slower than heroes and retain three consecutive missed LOS checks; idle decision intervals scale with movement. No camera-dependent acceleration.

Fresh v42 campaigns only: the exact saved next movement and encounter alignment rules changed. No migration.

## Verification

- Exact scheduler intervals, half-speed monster movement, connected tiles, LOS pursuit and escape, shared encounter contact, save/reload and day-boundary continuity.
- Actual map and table movement playback on the new cadence; keep the existing 0.85s hero and 1.2s monster traversal bursts.
- Targeted before/after short scripted Forge campaigns: compare arrivals, material receipts, gold, deaths, dungeon depth and runtime. This is economic diagnostics, not physical or final balance acceptance.
- Check real shop traffic and physical intake, forged equipment purchases, audio, visual readability and device FPS as in [#294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294).

Prior evidence: [v41 intake scope](ALPHA_V41_ACCEPTANCE.md), [v40 combat and campaign evidence](ALPHA_V40_ACCEPTANCE.md). Neither proves v42 balance. Verify the actual CI result for the candidate; no blanket 100-day matrix is required.
