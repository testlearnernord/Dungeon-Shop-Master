# Veteran progression and party balance

**Current baseline:** Alpha v39, merged #363, 25 November 2026. The merchant influences autonomous heroes through authentic purchases, equipment, supplies and recovery. The shared world clock and 60-Hz combat motor own outcomes. No survival guarantee, forced party membership or free progression.

## Current mechanics

- The renewable site's authored pack is independent of party size: one Ghoul on Floor 1, one or two on Floors 2–7, two or three on Floors 8–9. Actual spawn capacity can reduce the count. Elite classification and authored count are shared with the visible-pack decision.
- Ordinary fights use a 35-second limit (scheduler and save validation share the constant), Ghoul recovery of 0.72 s, 0.42 s hurt phase and collision-checked recoil up to 0.18 m. The ordinary hero recovery is 0.38 s. The unique Cave Troll retains its separate authored timing within the same motor.
- Equipped ordinary melee DPS with spear reach use 0.46 s thrust preparation rather than 0.62 s and compact sidesteps at 2.8 m/s rather than 4.2 m/s. Damage, immunity and stamina rules are unchanged. Unarmed DPS and boss timing are unaffected.
- Solo hunting and pursuit decisions use visible authored pack composition, actual health, equipment, experience, supplies and personality. Armed experienced or brave/reckless heroes may confront one ordinary Ghoul above 70% HP. Two-Ghoul/elite encounters require armor and greater preparation; deeper encounters require forged equipment and, where applicable, supplies. Deliberately challenging three Ghouls alone requires a reckless, non-careful level-7+ hero with both T2 items and at least 90% HP. A hero may seek visible support or break LOS using the existing movement authority. Physical contact still starts real combat; an avoided encounter is not free loot.
- Actual co-located Temporary Parties retain their existing formation, negotiation and class-role preferences. Found goods are genuinely owned, compatible needed gear and healing are retained, and surplus can be sold via real buyback. Paid receipts, physical departure, bounded recovery and repeated visit eligibility remain authoritative.

## Controlled combat evidence

The paired matrix uses the actual production composer and motor, four seeds, Floors 1–9, five experience levels, unarmed/T1/T2, three HP ratios, zero/two herbs and real-site pack subsets. Each revision has 20,520 matched cases. This deliberately controlled mix is not a natural encounter distribution.

| Measure | Before #361 | Pacing candidate 2 | Accepted spear candidate |
| --- | ---: | ---: | ---: |
| Mean seconds | 16.43 | 19.89 | 17.67 |
| Deaths | 4,213 | 4,053 | 3,885 |
| Wins | 11,871 | 12,985 | 13,977 |
| Draws | 4,436 | 3,500 | 2,676 |

Spear candidate vs candidate 2: DPS deaths 1,626 to 1,458; wins 3,805 to 4,797. Two-Ghoul wins in the 960 scenarios per gear tier: unarmed 205 to 205, T1 343 to 536, T2 730 to 930. Tank and healer solo summaries were unchanged. #363's 20,520 matched summary results were identical to #362, isolating the risk-policy experiment from combat mechanics.

The fixed 0.70-second same-target attack spacing experiment was rejected: it increased deaths from 4,053 to 4,579, reduced wins to 12,209 and disproportionately harmed healers. Its code is not in the accepted revision. Historical trials remain in Git and PRs #361–363.

## Natural campaign evidence

Both #362 and #363 passed core CI, all twelve controlled-matrix jobs and all 28 natural GameStore audit scenarios (26 at 100 days and two at 200 days), using the same scripted merchant policies and real world scheduler. Boss passes are granted by the audit merchant, not by a new automatic runtime rule.

| Forge aggregate | #362 (spear) | #363 (accepted risk) |
| --- | ---: | ---: |
| Four 100-day runs: ordinary combat deaths | 244 | 191 |
| Paid gold | 28,429 | 27,081 |
| Served customers | 2,059 | 2,042 |
| Living veterans | 29 | 32 |
| Boss attempts / successful campaigns | 6 / 2 | 21 / 1 |
| Two 200-day runs: ordinary combat deaths | 268 | 216 |
| Paid gold | 28,328 | 27,998 |
| Served customers | 2,139 | 2,265 |
| Living veterans | 10 | 10 |
| Boss attempts / successful campaigns | 3 / 2 | 8 / 1 |

All six Forge runs reached Floor 10 in both candidates. No rewardless short expeditions were reported in either candidate's matched campaign suite. In the two 200-day Forge runs, ordinary deaths fell by 19.4% while paid gold fell by 1.2%; in the four 100-day runs they fell by 21.7% and 4.7%, respectively. These are finite seeded experiments, not guaranteed probabilities.

The accepted policy increases boss opportunities but reduces conversion into wins; eight boss deaths occurred in its two 200-day Forge runs versus one in #362. Do not equate more attempts with a balanced boss. Absent/full-stock scenarios did not reach Floor 10; tier-one-only scenarios also did not reach it in this comparison. The Forge policy and actual T2 commerce remain important progression levers.

## Verification and open acceptance

- [#362 audit](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45594422983), [#363 audit](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45595832932), [#363 matrix](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45595833168), [#363 CI](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/45595832795).
- Reproduce with the existing `tools/analysis/ordinary-combat-matrix.mjs` and `tools/analysis/gameplay-100day-audit.mjs`; retain their fixtures and scenario coverage. Compare current PR against its actual base.
- The audit is a scripted merchant, not a hands-on Babylon playtest. Manual Ghoul direction/animation, hit timing, camera, audio, hardware performance, real shop flow and enjoyment remain open.
- Next targeted diagnosis: boss party conversion, class/equipment composition and real preparation; avoid broad combat nerfs or duplicate systems. Full release acceptance is not claimed.

Earlier audit revisions and detailed candidate history remain recoverable from Git; this file is the current contract and evidence, not an accumulating PR diary.
