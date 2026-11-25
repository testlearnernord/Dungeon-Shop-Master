# Dungeon Shop Master — living Game Bible

> Reviewed against Alpha v40, main after #374 (25 November 2026). Current design and lore; [Architecture](ARCHITECTURE.md) and [Roadmap](ROADMAP.md) distinguish implementation and acceptance.


**Combat contract:** All live encounters and the isolated Combat Lab use the same 60-Hz group motor, hero attributes, gear, tactics, defense and physical retreat policy. Enemy abilities and terrain may differ; hero rules do not. There is no elapsed-time fight cap. After 30 seconds without an effective HP cue or measurable retreat advance, the shared progress policy requests retreat; persistent blockage can resolve as a recorded stalemate. Combat can cross day boundaries. Stored positions are capped at 2,401 frames, preserving the initial frame and latest minute at 10 Hz; older positions are thinned, not the combat events.

## 1. Identity and player experience — LOCKED

**Dungeon Shop Master** is a dark-fantasy first-person shopkeeping game. The player is **Galvik**, a greedy, sharp-tongued merchant bound to his cursed shop. Galvik's dark humor belongs in character and atmosphere; the player UI must remain legible and fair.

- **Player fantasy:** run a tangible cave shop, order and arrange goods, serve individual adventurers, issue credit and profit from danger while discovering what happens to real recurring customers.
- **Heroes have agency:** equipment, budgets, needs, traits, goals, risk and actual damage matter. They choose purchases and expeditions themselves. Galvik can influence them *indirectly* by what he sells, not command their attacks or movement.
- **Consequences are genuine:** a bought sword, armor or herb must affect authentic inventory/combat/recovery rather than trigger a fake “you saved them” event. Real death, debt, finite treasure and unlucky decisions remain possible.
- **Three progression tracks:** Galvik's shop/economy, individual hero lives/relationships, and persistent dungeon discoveries/difficulty. A compelling day yields visible choices, not simply an extra ledger entry.
- **Tone:** atmospheric and sometimes cruel, with coherent character and dungeon history. Avoid detached features, lore patchwork and arbitrary comedic UI abuse.

## 2. Implemented now

**Release status:** Alpha v40 campaign schema; V.002 ALPHA remains the HUD label. No final release or manual acceptance claim.

| System | Implementation status |
| --- | --- |
| Physical shop and customer economy | **IMPLEMENTED:** first-person room, mining, modular four-slot shelves, furniture/portrait placement, real inventory and wholesale, unpaid carts, staffed receipt minigame, debt, saved physical NPC traffic and service decisions |
| One saved paced world | **IMPLEMENTED:** same deterministic 50-ms world clock for in-day shop, spatial expeditions and actual fight scheduling. Bed interaction closes the day |
| Heroes and renewable dungeon | **IMPLEMENTED core, PARTIAL art/content:** saved autonomous goals, real class-dependent capped progression, seeded connected **ordinary Floors 1–9**, common-site regeneration, Temporary Parties and physically connected shop-return journeys. Unique authored deep-floor content and full-run tuning remain unfinished |
| Boss | **IMPLEMENTED LIVE:** one Cave Troll on **Floor 10**, fought by an actual permitted **2–3-hero Temporary Party** in the shared 60-Hz motor; saved event/replay, telegraphs, dodge/parry, grabs, throws and lava. |
| LIVE information and observer | **IMPLEMENTED core:** global World Feed, worldwide Hero Cards, in-world Board, bounded magical death signals, history, read-only LIVE spectator for ordinary Floors **1–9**, optional 3D fights and authentic Floor-10 party recordings. Observation never controls a hero |
| Replay and night accounts | **IMPLEMENTED core:** immutable recorded fights, three-day rolling event/footage window plus up to 12 player-pinned recordings; two-page nightly merchant accounts |
| Quality and tooling | **IMPLEMENTED trial:** real Tripo Ghoul, crypt arena, multi-Ghoul fights, V Developer Combat Lab and interpolated presentation, 21 Ghoul WAV + 11 Troll MP3 samples, distinct battle music |
| Release acceptance | **PARTIAL:** two 200-day Forge campaigns completed with genuine boss victories; manual shop, combat, visual/audio/FPS acceptance remains open |

**Implemented does not mean final polish.** The Tripo troll/ghoul rig, hit contact alignment, audio mix, multiple-enemy camera composition and hardware FPS still require actual human observation. All externally added animation sources must remain intact until explicitly reviewed.

## 3. Core gameplay rules — LOCKED

Ordinary combat and autonomy: All live encounters and the isolated Combat Lab use the same 60-Hz group motor, hero attributes, gear, tactics, defense and physical retreat policy. Enemy abilities and terrain may differ; hero rules do not. There is no elapsed-time fight cap. After 30 seconds without an effective HP cue or measurable retreat advance, the shared progress policy requests retreat; persistent blockage can resolve as a recorded stalemate. Combat can cross day boundaries. Stored positions are capped at 2,401 frames, preserving the initial frame and latest minute at 10 Hz; older positions are thinned, not the combat events. Visible pack composition, HP, gear, experience and traits guide hunting and pursuit. Shopkeeper influence remains indirect. [Current Alpha evidence](ALPHA_V40_ACCEPTANCE.md) and [issue #294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294).

### Shop

- Fresh campaigns have **no shelves** and no magically stocked display. Build independent four-slot shelves and fill them from Galvik's real bag. Purchasing wholesale costs actual gold.
- Furniture and excavation follow a **single** physical placement and reachability contract. Moving fixtures cannot trap customers, bypass queue access or destroy required bed/staff-side access.
- Customers reserve merchandise in **unpaid carts**. Only completed staffed checkout creates sales income; approved credit is a debt, not a cash sale. Unserved goods return, not vanish or become fabricated purchases.
- Restock requests and queue traffic follow genuine simulation and saved world time. The player must physically deliver service; **F** is only a hotbar shortcut.
- Real **outside-gate departure** starts bounded recovery on the existing world clock. Injury and owned supplies determine its duration. Recovery consumes an owned healing dose at its scheduled deadline; additional owned doses can extend treatment if the same resupply threshold is still unmet. No free HP or instant teleport.

### Heroes, combat and records

- Heroes have independent HP, equipment, gold, inventory, roles, intentions and histories. **No hunger or starvation.** Waybread and Healing Herbs restore HP; a monster attack or actual trap may cause a fatal zero-HP outcome.
- Parties are voluntary and temporary. A shared chest, enemy or renewable site cannot be consumed once *per member*; finite treasure and recorded fight outcome belong to the actual encounter.
- All combat results come from deterministic actual steps. Boss cinematics, spectator cameras, animation, music and SFX can only *present* authentic cues.
- The LIVE merchant Board is limited to information Galvik could legitimately possess; unknown offscreen health, location, loot or cause of death is not automatically public. The explicit viewer may reveal legitimate currently observed or previously recorded detail.
- The compact timeline covers today and the previous two completed days. At most 12 manually saved authentic recordings persist beyond the rolling retention policy. A marker without video must never become manufactured footage.
- The authored Cave Troll presentation is the quality reference for shared combat. LIVE entry from World Echoes, map or hero view goes directly to the current committed fight with HUD and camera available. The world continues. Local recorded playback and Combat Lab retain optional cinematics (ordinary 5.2 s, boss 13.5 s); Dungeon Viewer LIVE music requests the corresponding cue with a 1.1 s crossfade, and its manual skip supports both scores. Acoustic and visual acceptance of the final changes remains open.

## 4. Implemented topology and open content

The [Living Dungeon design](THE_LIVING_DUNGEON.md) supplies the deeper current contract.

- **IMPLEMENTED design topology:** the shop is Galvik's single cursed, **unnumbered realm**, not ordinary Dungeon Floor 5. Normal arrivals and exits use one physical threshold, and the saved `shopRoom` and hero `"shop"` location are already canonical in Alpha v40. Historic room names are source-module labels, not extra saved doors or a numbered shop.
- Heroes choose **stay / deeper / higher** based on individual medium-term goals such as farming, testing gear, survival or progress. Plans and actual inter-floor movement persist; authored deep-floor variety remains open.
- **IMPLEMENTED core:** from any ordinary floor an upward/return choice may lead by physically connected, saved backtracking and timed portal transit to Galvik's shop. This is an expedition abort, not a free teleport; actual 3D crossing/reentry still requires playtesting.
- Returning customers recover outside both shop and dungeon for an initial **20–240 unpaused seconds** (initial tuning), then resume at their remembered floor entrance. Checkout, credit and walkout eligibility follow the current actual shop visit.
- Common opponents, traps and chests refresh on saved intervals across ordinary Floors 1–9; unique boss victories and persistent discoveries do not respawn as common loot.
- **IMPLEMENTED gate:** ordinary Floors 1–9 lead to the **Floor-10 Cave Troll**, which requires a real saved permitted Temporary Party of two or three heroes. Individual eligibility is the canonical `bossPass` field since Alpha v27. Alpha v40 is the only supported campaign schema. Reject v39 and earlier explicitly; no migration or legacy adapter. Current-format Save/Load must be deterministic. Authored variety and manual gameplay acceptance remain open.
- Full 100-floor progression is a long-range fiction/ambition, **not** a claim of implemented, promised or budgeted launch content.

## 5. Galvik and the story

**LOCKED:** Galvik is a cursed merchant whose greed is central to the shopkeeper fantasy. He has a past, tangible personal objects in his room and a darkly comic voice. Heroes die, survive, return and carry their own consequences. The dungeon must have a coherent identity rather than being a random backdrop to separate shop and arena games.

**OPEN / NON-CANON:** precise origin and enforcement of Galvik's curse, whether dead adventurers become Ghouls, a singular extremely greedy adventurer becoming a bound shopkeeper, potential transfer of the curse to another character, 400-year service, a new protagonist/NG+, the ending choice, specific alliances and a broader 100-floor mythology. These are promising *story concepts*, not locked implemented triggers. A previously discarded amulet should not be smuggled back as a mandatory explanation.

**Implemented:** the physical cellar, fiancée portrait passage, pond/fishing and functional forge exist. T1 gear is wholesale; T2 class-specific weapons and armor are crafted using owned materials. **Deferred:** expanded material economy, permanent social leadership and individual hero wearable rigs remain separate design work, not automatic commitments. Any new monster or hero must respect actual rig/equipment requirements and the existing [asset pipeline](MONSTER_ASSET_PIPELINE.md).

## 6. Rejected or superseded

- Hunger/starvation, including disguised stamina-as-hunger systems.
- Fake Morning / Midday / Evening authoritative engine phases and mandatory three-phase dungeon snapshots; the saved world clock replaced them.
- Endless automatic permanent replay video storage, fabricated missing expedition footage or resimulating a watched fight.
- Multiple independent fight engines or a second dungeon authority for better-looking viewers.
- Mandatory travel back through every dungeon floor or arbitrary five-floor shop outposts in the **approved target design**.
- Promoting a speculative curse-transfer ending, a concept image or an AI sketch straight to canon.

## 7. Decision hygiene

Gameplay changes must update the **existing** status lines rather than prepend another dated PR paragraph. Mark **IMPLEMENTED**, **PARTIAL**, **PLANNED**, **OPEN**, **REJECTED** or **HISTORICAL** accurately. Only explicit owner approval locks previously open lore or mechanics. Git history is the detailed chronology.
