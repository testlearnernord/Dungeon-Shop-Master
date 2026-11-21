# Dungeon Shop Master — living Game Bible

> **Current design and lore**, audited after merged PR #234 on 21 November 2026. Current implementation is verified in source; accepted intent is distinguished from implemented features below. This is **not** a PR diary. Consult [Architecture](ARCHITECTURE.md), [Roadmap](ROADMAP.md) and the detailed [Living Dungeon design](THE_LIVING_DUNGEON.md).

## 1. Identity and player experience — LOCKED

**Dungeon Shop Master** is a dark-fantasy first-person shopkeeping game. The player is **Galvik**, a greedy, sharp-tongued merchant bound to his cursed shop. Galvik's dark humor belongs in character and atmosphere; the player UI must remain legible and fair.

- **Player fantasy:** run a tangible cave shop, order and arrange goods, serve individual adventurers, issue credit and profit from danger while discovering what happens to real recurring customers.
- **Heroes have agency:** equipment, budgets, needs, traits, goals, risk and actual damage matter. They choose purchases and expeditions themselves. Galvik can influence them *indirectly* by what he sells, not command their attacks or movement.
- **Consequences are genuine:** a bought sword, armor or herb must affect authentic inventory/combat/recovery rather than trigger a fake “you saved them” event. Real death, debt, finite treasure and unlucky decisions remain possible.
- **Three progression tracks:** Galvik's shop/economy, individual hero lives/relationships, and persistent dungeon discoveries/difficulty. A compelling day yields visible choices, not simply an extra ledger entry.
- **Tone:** atmospheric and sometimes cruel, with coherent character and dungeon history. Avoid detached features, lore patchwork and arbitrary comedic UI abuse.

## 2. Implemented now

**Release status:** the rendered shop title still reads **V.002 ALPHA**. **V.003 ALPHA — The Living Dungeon** is an *unfinished release milestone* even though significant parts of that architecture are already implemented. npm `0.1.0` is independent.

| System | Implementation status |
| --- | --- |
| Physical shop and customer economy | **IMPLEMENTED:** first-person room, mining, modular four-slot shelves, furniture/portrait placement, real inventory and wholesale, unpaid carts, staffed receipt minigame, debt, saved physical NPC traffic and service decisions |
| One saved paced world | **IMPLEMENTED:** same deterministic 50-ms world clock for in-day shop, spatial expeditions and actual fight scheduling. Bed interaction closes the day |
| Heroes and renewable dungeon | **PARTIAL:** saved autonomous intentions, independent HP/equipment, seeded connected Floors 1–4 and 7, common-site regeneration, real Temporary Parties and retreat/return journeys; broader content remains incomplete |
| Boss | **IMPLEMENTED reference fight:** unique Cave Troll on Floor 6, including real telegraphs, imperfect dodges/parries, grabs, throws and lava. Signature abilities remain even when shared motor helpers are used |
| LIVE information and observer | **PARTIAL:** in-world Board, bounded magical death signal, history and read-only LIVE spatial spectator; supported numbered spatial floors are 1–4 and 7, with a separate Floor-6 boss view. Observation does not control a hero |
| Replay and night accounts | **IMPLEMENTED core:** immutable recorded fights, three-day rolling event/footage window plus up to 12 player-pinned recordings; two-page nightly merchant accounts |
| Quality and tooling | **IMPLEMENTED trial:** real Tripo Ghoul, crypt arena, multi-Ghoul fights, V Developer Combat Lab and interpolated presentation, 21 Ghoul WAV + 11 Troll MP3 samples, distinct battle music |
| First V.003 chapter | **OPEN for release:** full authored deeper floors, unnumbered cursed-shop access with one portal, individual Floor-10 pass, balance/pacing and comprehensive visual/audio/hardware sign-off |

**Implemented does not mean final polish.** The Tripo troll/ghoul rig, hit contact alignment, audio mix, multiple-enemy camera composition and hardware FPS still require actual human observation. All externally added animation sources must remain intact until explicitly reviewed.

## 3. Core gameplay rules — LOCKED

### Shop

- Fresh campaigns have **no shelves** and no magically stocked display. Build independent four-slot shelves and fill them from Galvik's real bag. Purchasing wholesale costs actual gold.
- Furniture and excavation follow a **single** physical placement and reachability contract. Moving fixtures cannot trap customers, bypass queue access or destroy required bed/staff-side access.
- Customers reserve merchandise in **unpaid carts**. Only completed staffed checkout creates sales income; approved credit is a debt, not a cash sale. Unserved goods return, not vanish or become fabricated purchases.
- Restock requests and queue traffic follow genuine simulation and saved world time. The player must physically deliver service; **F** is only a hotbar shortcut.
- Real **outside-gate departure** starts the existing two complete off-duty game days before a hero may reenter the dungeon. No automatic free healing or instant post-shop reentry.

### Heroes, combat and records

- Heroes have independent HP, equipment, gold, inventory, roles, intentions and histories. **No hunger or starvation.** Waybread and Healing Herbs restore HP; a monster attack or actual trap may cause a fatal zero-HP outcome.
- Parties are voluntary and temporary. A shared chest, enemy or renewable site cannot be consumed once *per member*; finite treasure and recorded fight outcome belong to the actual encounter.
- All combat results come from deterministic actual steps. Boss cinematics, spectator cameras, animation, music and SFX can only *present* authentic cues.
- The LIVE merchant Board is limited to information Galvik could legitimately possess; unknown offscreen health, location, loot or cause of death is not automatically public. The explicit viewer may reveal legitimate currently observed or previously recorded detail.
- The compact timeline covers today and the previous two completed days. At most 12 manually saved authentic recordings persist beyond the rolling retention policy. A marker without video must never become manufactured footage.
- The **Floor-6 Cave Troll** is the authored quality reference for all dungeon combat. Ordinary enemies may have different art and behaviors but must not be downgraded to sterile combat spreadsheets.

## 4. Approved V.003 direction: partially delivered, still unfinished

The [Living Dungeon design](THE_LIVING_DUNGEON.md) supplies the deeper contract. Decisions below are approved direction, **not** claims of full current implementation.

- **The shop eventually becomes one cursed special floor, not numbered Floor 5.** One physical magical portal replaces the current separate numbered-floor entrances. Galvik operates one shop instance.
- Heroes choose **stay / deeper / higher** based on individual medium-term goals such as farming, testing gear, survival or progress. **CURRENT:** plans and parts of same-day movement already persist; deeper/full-floor progression remains incomplete.
- On an upward transition a hero may terminate an expedition to visit the same shop **from any depth**. **CURRENT:** connected physical backtracking and timed returns exist, but the approved universally accessible single-portal flow is not implemented.
- Returning customers leave for **two complete off-duty days** outside shop and dungeon. **CURRENT:** physical departure, saved cooldown and safe entry already exist; the future portal topology/reentry presentation remains open.
- Ordinary room opponents, eligible traps and chests refresh on saved deterministic intervals; unique victories and permanent discoveries do not. **CURRENT:** renewable common sites are wired for Floors 1–4 and 7.
- The early chapter should contain substantive **Floors 1–10**, with **an individual Galvik-granted pass before Floor 10**. This pass and deeper-floor content remain **PLANNED**. Moving the Cave Troll from current Floor 6 to Floor 10 is **OPEN**, not enacted.
- Full 100-floor progression is a long-range fiction/ambition, **not** a claim of implemented, promised or budgeted launch content.

## 5. Galvik and the story

**LOCKED:** Galvik is a cursed merchant whose greed is central to the shopkeeper fantasy. He has a past, tangible personal objects in his room and a darkly comic voice. Heroes die, survive, return and carry their own consequences. The dungeon must have a coherent identity rather than being a random backdrop to separate shop and arena games.

**OPEN / NON-CANON:** precise origin and enforcement of Galvik's curse, whether dead adventurers become Ghouls, a singular extremely greedy adventurer becoming a bound shopkeeper, potential transfer of the curse to another character, 400-year service, a new protagonist/NG+, the ending choice, specific alliances and a broader 100-floor mythology. These are promising *story concepts*, not locked implemented triggers. A previously discarded amulet should not be smuggled back as a mandatory explanation.

**Deferred:** cellar, forge, pond, extra supply chains, permanent social leadership and wider hero models with individualized wearables remain separate design work, not commitments of this release. Any new monster or hero must respect actual rig/equipment requirements and the existing [asset pipeline](MONSTER_ASSET_PIPELINE.md).

## 6. Rejected or superseded

- Hunger/starvation, including disguised stamina-as-hunger systems.
- Fake Morning / Midday / Evening authoritative engine phases and mandatory three-phase dungeon snapshots; the saved world clock replaced them.
- Endless automatic permanent replay video storage, fabricated missing expedition footage or resimulating a watched fight.
- Multiple independent fight engines or a second dungeon authority for better-looking viewers.
- Mandatory travel back through every dungeon floor or arbitrary five-floor shop outposts in the **approved target design**.
- Promoting a speculative curse-transfer ending, a concept image or an AI sketch straight to canon.

## 7. Decision hygiene

Gameplay changes must update the **existing** status lines rather than prepend another dated PR paragraph. Mark **IMPLEMENTED**, **PARTIAL**, **PLANNED**, **OPEN**, **REJECTED** or **HISTORICAL** accurately. Only explicit owner approval locks previously open lore or mechanics. Git history is the detailed chronology.
