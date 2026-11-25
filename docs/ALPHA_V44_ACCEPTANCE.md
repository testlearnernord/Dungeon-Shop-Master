# Alpha v44 — autonomous boss progression evidence

> Superseded by [Alpha v45 acceptance](ALPHA_V45_ACCEPTANCE.md). This records the v44 result only.

Fresh v44 campaign only, no migration from v43. The previous merchant permission field, GameStore action, roster controls, manual grants in analysis and separate permission-based audit treatment are removed. No substitute permit, fake party, teleport or alternate battle motor.

## Policy and verification
- Floor 9: minimum experience, real class weapon and armor (reckless may forgo armor), sufficient health, supplies/forged gear and risk tolerance determine willingness. See [The Living Dungeon](THE_LIVING_DUNGEON.md) for exact initial thresholds.
- Two or three individually ready living heroes must physically reach the same lower stair, have an authentic saved Temporary Party, and consent to descend. Recheck on crossing. Active and archived combat use the existing real actor engine; Lab can test weak groups without the campaign risk preference.
- CI regression tests: class gear and supplies change willingness, injury/low level/wrong weapon reject it, personality changes risk, an unprepared party member prevents a stale crossing, actual visible rendezvous and physical boss entry survive JSON reload, old permission fields are rejected. Existing browser smoke checks that shop portal behavior needs no permission UI.
- Targeted autonomous Forge campaigns (45 days, seeds 42 and 7351): measure first attempt/victory, deepest floor, losses, gear, shop gold. These use existing scripted storefront, not physical service acceptance. A finite campaign with no attempt is a diagnostic result, not a reason to fabricate one.

Previous evidence: [v43](ALPHA_V43_ACCEPTANCE.md), [v42](ALPHA_V42_ACCEPTANCE.md), [v40](ALPHA_V40_ACCEPTANCE.md). Manual acceptance [#294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294) remains open.

## Actual v44 result

PR #382 merged after CI and both 45-day Forge campaigns passed. Seeds 7351 and 42 both independently reached and defeated the unique Cave Troll (one attempt each). At day 45: living 20/20, deaths 3/9, served customers 245/213, shop gold 665/749, living hero gold 2221/1725, unsold finds 172/115, and Floor-9 population 20/17. Scripted storefront evidence, not physical play acceptance. Deep-floor concentration and carried capital motivate v45 elective resupply; no proof of an absolute deadlock.
