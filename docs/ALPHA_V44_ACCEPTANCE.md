# Alpha v44 — autonomous boss progression

Fresh v44 campaign only, no migration from v43. The previous merchant permission field, GameStore action, roster controls, manual grants in analysis and separate permission-based audit treatment are removed. No substitute permit, fake party, teleport or alternate battle motor.

## Policy and verification
- Floor 9: minimum experience, real class weapon and armor (reckless may forgo armor), sufficient health, supplies/forged gear and risk tolerance determine willingness. See [The Living Dungeon](THE_LIVING_DUNGEON.md) for exact initial thresholds.
- Two or three individually ready living heroes must physically reach the same lower stair, have an authentic saved Temporary Party, and consent to descend. Recheck on crossing. Active and archived combat use the existing real actor engine; Lab can test weak groups without the campaign risk preference.
- CI regression tests: class gear and supplies change willingness, injury/low level/wrong weapon reject it, personality changes risk, an unprepared party member prevents a stale crossing, actual visible rendezvous and physical boss entry survive JSON reload, old permission fields are rejected. Existing browser smoke checks that shop portal behavior needs no permission UI.
- Targeted autonomous Forge campaigns (45 days, seeds 42 and 7351): measure first attempt/victory, deepest floor, losses, gear, shop gold. These use existing scripted storefront, not physical service acceptance. A finite campaign with no attempt is a diagnostic result, not a reason to fabricate one.

Previous evidence: [v43](ALPHA_V43_ACCEPTANCE.md), [v42](ALPHA_V42_ACCEPTANCE.md), [v40](ALPHA_V40_ACCEPTANCE.md). Manual acceptance [#294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294) remains open.
