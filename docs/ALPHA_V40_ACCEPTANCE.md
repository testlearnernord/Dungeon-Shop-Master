# Alpha v40 — evidence and remaining acceptance

Baseline: merged [#374](https://github.com/testlearnernord/Dungeon-Shop-Master/pull/374), `a4c5730678af99bb57dce25414e9e5e0c753e3b2`. The last audited gameplay head was `fe3542565d4f0a720ca03da7327513c5c0242cb2`; subsequent camera/audio changes are presentation-only but their final CI and manual listening were not confirmed at merge.

## Completed evidence

[CI](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45667661481), [ordinary combat matrix](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45667661551), [profile sweep](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45667661690) passed at the audited head.

[Long-run audit](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45667661590):

| 200-day Forge campaign | Seed 7351 | Seed 42 |
| --- | ---: | ---: |
| Reported encounter outcomes (audit aggregate) | 1727 | 1950 |
| Distinct recorded ordinary combat exposures | 1203 | 1447 |
| Draws | 0 | 0 |
| Hero deaths | 10 | 16 |
| First boss victory | Day 35 | Day 18 |
| Final shop gold | 3415 | 4110 |

Each campaign settled one genuine boss attempt, a fully T2-equipped DPS/healer duo; both won without a boss-fight death. The aggregate outcomes are not unique fights. The scripted storefront uses real GameStore/clock and transactions but is not a human-operated physical Babylon shop.

Controlled production boss matrix (four seeds): 6,144 encounters; 4,199 wins, 1,060 losses, 883 retreats, two draws. T1 1,548/3,072 wins; T2 2,651/3,072 wins. Mixed and triple-healer T2 parties each won 192/192 controlled cases. Prepared matrix is separate. Equipment influence is demonstrated; overall composition and economy balance are not proven. The owner approved merging without waiting for four remaining 100-day jobs. Do not claim they passed.

## Current acceptance

[Issue #294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294) tracks ten hands-on days, physical economy and forge, Save/Load, camera/music, animation and FPS. No additional blanket campaign audit or balance changes are required without a concrete reason or owner instruction. [#334](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/334) is a deferred cosmetic issue. Fresh v40 campaign required.

The actual soundtrack cues are requested at 5.2 s/13.5 s; these are provisional musical entry points tied to the existing intro lengths, not verified audible downbeats. The updated smoke assertion was not run at merge. Do not claim final visual, audio or balance sign-off.
