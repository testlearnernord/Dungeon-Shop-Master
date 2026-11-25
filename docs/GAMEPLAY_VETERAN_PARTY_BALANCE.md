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


### Boss-readiness diagnosis (next audit)

The accepted #363 baseline reaches Floor 10 reliably in Forge scenarios, but the 200-day seed 7351 lost eight heroes to the boss: six DPS, one healer and one tank, all equipped with weapon and armor, levels 7–12. Existing aggregate reports do not establish the party composition, exact gear tiers, injury state or damage source at entry. The current `isBossExpeditionCandidate` predicate checks a real pass, weapon and health (60%, or 70% for careful heroes); it does not require armor, a level threshold or a particular class mix. This is a plausible readiness gap, not proof that the predicate alone causes losses.

The next diagnostic PR adds no gameplay changes. The existing campaign audit reads settled Floor-10 recordings once per attempt, recording composition, exact entry HP, gear tiers, supplies, recorded attack/defense/heal cues, direct hit/landing/lava damage, outcome and remaining boss HP. A controlled matrix uses the same `caveTrollPartyOptions` and `resolveGroupCombat` production motor across all 16 two-/three-member role compositions, levels 6/9/12, complete T1/T2 gear, 65%/100% entry HP, zero/two herbs and four tactics seeds, with four independently seeded hero rosters (6,144 fights). Homogeneous controlled parties are experiments, not claimed natural party frequencies. Formation-slot rotation varies with tactics seed. Tests cover replay deduplication and damage-source accounting. No new state, clock, combat system or artificial rewards are introduced.

Use results to distinguish preparation, composition, survival and damage-output bottlenecks before proposing any change to voluntary recruitment, boss readiness or boss combat. Do not infer that more boss attempts alone are success. The existing manual animation and gameplay acceptance remains open.


### Unified live hero combat candidate (owner-locked architecture)

The #365 baseline diagnostic completed 6,144 controlled boss fights and all 28 campaign cases. Three healers won 367/384, two healers 207/384, the mixed tank/DPS/healer trio 200/384, tank/DPS 1/384 and two tanks 0/384. All 21 natural attempts in the four 100-day Forge cases were duos (16 DPS/healer, three DPS/DPS, two DPS/tank); one victory. These are baseline measurements, not acceptance of the old class imbalance.

The owner requires identical live hero combat mechanics against all present and future opponents. This candidate removes the production boss hero stat override and uses the already-proven ordinary roster projection, renamed `heroCombatAttributes`, for both encounter composers and the Lab. Hero attack preparation, equipment-derived poise, melee defense cancellation, compact DPS sidesteps, reach and the carried combat herb budget are no longer selected by enemy rank or by the presence of a signature opponent. Boss signature actions, their telegraphs, environment hazards, and ability-aware tactics remain; the historical solo preview is not a campaign composer. The boss settlement debits actual initial combat resources instead of a separate assumed budget.

The Troll's own 700 HP, 16 armor, damage, grapple and other enemy stats remain unchanged for this measurement; removing inflated boss-only hero stats may reduce conversion and is not assumed balanced. Current 35/90-second limits remain pending a deliberate scheduler/replay/retreat design; do not silently replace them or weaken enemy stats to hide a regression. New canonical active combat options require Alpha v40, with no migration. Verify cross-encounter profile parity, ordinary paired matrix, controlled boss compositions, and campaign outcomes before merge. If boss conversion regresses, adjust the common rules or explicit enemy profile based on evidence, never reintroduce opponent-specific hero stats.


### Unified candidate: measured regression and enemy profile sweep

At frozen #366 head 76f9b469, all 20,520 matched ordinary encounter summaries are identical to the accepted baseline (3,885 deaths, 13,977 wins, 2,676 draws). The unchanged Troll profile produces zero victories in 6,144 controlled encounters, versus 1,967 victories before hero unification. Do not merge a knowingly unbeatable tested boss or restore enemy-dependent hero bonuses. The campaign audit at that head remains independent.

This experimental branch adds an offline-only enemy profile sweep: anchor (360 HP, 8 armor, 27 damage, 34 grapple damage), lower armor (4), larger HP pool (480), and higher incoming pressure (34 damage, 42 grapple damage). Each varies one dimension relative to the anchor; all hero attributes, signature actions, collision, telegraphs, and 90-second measurement horizon stay fixed. Four seeds, 16 compositions, matched preparation cases and four tactics seeds produce 24,576 total fights. The starting values are experimental, not final lore or production balance. The sweep reports composition results, fully prepared cases by level, and role-specific damage, deaths and healing. Select a profile only after observing actual results; compare T1/T2 leverage, mixed party viability, healer stacking and underprepared mortality.

The production Troll remains unchanged in this branch. Once a profile is selected, consolidate into the single implementation candidate, remove temporary workflow branch exceptions, and validate real campaigns. The shared combat clock and replay/retreat horizon redesign are still open: do not remove a fixed limit without accounting for active checkpoints, finite storage and world day boundaries.


### Profile sweep result and selected candidate

All 24,576 profile-sweep cases completed successfully in run 45625152342 at frozen head 1a034ad. Each profile has 6,144 cases; each composition has 384. Mixed Tank/DPS/Healer victories: A 372, B 382, C 351, D 346. Three healers: 384, 384, 382, 384. DPS/Healer duos: 262, 361, 207, 227. Across all compositions: A 4,970, B 5,600, C 4,269, D 4,333 wins. All 48 fully prepared mixed trios per profile won without deaths, so none demonstrates final boss difficulty. Profile C is the selected measured starting point (480 HP, 8 armor, 27 raw hit, 34 raw grapple, existing 92 stagger threshold). The reduced HP/armor compensates for the removed artificial hero-stat bonuses.

The production candidate now uses C in the canonical live Troll profile, also consumed by strict recording validation; historical solo training remains separate. Healer stacking persists in every profile, so a separate experimental universal class rule increases offensive cast cooldown from 1.3 to 2.0 seconds for healer actors against **all** opponents. Cast contact, healing resources, healing action timing and damage arithmetic remain unchanged. This additional class rule was not present in the sweep; combined results are pending. Recheck ordinary survival, revenue, veteran supply, real boss conversion and T2 value rather than accepting a class nerf just for reducing triple-healer wins. Do not add hidden enemy-dependent hero bonuses. The full campaign and controlled matrices are rerun for this combined candidate. Fixed encounter horizons and autonomous retreat remain open.


### Healer offense: controlled follow-up

The cadence-only #367 candidate (329507f4) passed core CI and all matched ordinary combat cases. Across 6,840 healer cases, wins fell from 5,037 to 4,715, deaths from 1,261 to 716, and draws rose from 560 to 1,409. Tanks and DPS were unchanged. More time available for defense is a plausible explanation, not a proven causal attribution. The selected Troll profile with 2.0-second offensive healer cadence produced 317/384 mixed-trio victories and 382/384 triple-healer victories. Mixed-trio T1/T2 wins were 127/192 and 190/192; triple-healer T1/T2 wins were 190/192 and 192/192. The two completed 200-day Forge runs both defeated the Troll (five attempts, five boss deaths, 217 ordinary combat deaths, 28,056 paid gold, 2,294 served customers, seven living veterans). The four 100-day comparisons are still pending.

This follow-up changes only innate healer offensive damage from 6 to 3 in the canonical hero projection; intellect scaling, staff damage bonuses, healing capacity, armor, movement and 2.0-second offensive cadence remain unchanged. This is an experimental class-wide adjustment, not a boss exception. Compare matched ordinary cases directly to frozen #367, and rerun the controlled boss matrix. Full campaign validation is required if selected. Do not accept a weaker triple-healer composition at the cost of destroying solo viability or the value of forged staves. This overlapping branch must not be merged independently of #367; consolidate the winning candidate and retire experimental workflow exceptions. No time-limit changes yet.
