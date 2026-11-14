# Dungeon Shop Master — Game Design Bible

> **Status: living draft · 2026-11-14.** This is the canonical record of the **intended design**, not proof that a feature has been implemented. The repository's code, data and tests are authoritative for **current behavior**. Do not turn an open question into lore or a feature without a design decision.

## 1. Game identity and promise

**Genre:** Dark-fantasy dungeon shopkeeper simulation with autonomous adventurers, commerce, persistent consequences, and watchable dungeon expeditions.

**Player fantasy:** Maintain a shop deep inside a dangerous, living dungeon. The customers are people rather than disposable units: they have identities, needs, money, equipment, injuries, and uncertain futures. Your stock, prices, choices and shop layout can change who returns.

**Tone:** Grounded dark fantasy: a rare pocket of warmth and commerce surrounded by danger, loss, debt and moral compromises. Emotional consequences matter more than gratuitous punishment or survival meters.

**Long-term horizon:** A 100-floor dungeon is a narrative and progression aspiration, **not** a claim that 100 playable floors exist in the current build.

## 2. Decision labels

- **LOCKED:** Explicitly decided design intent. Preserve unless the project owner changes it.
- **CURRENT:** Verified implementation in source/README. Not necessarily final design.
- **OPEN:** Unresolved choice. Do not assume an answer or silently implement one.
- **REJECTED:** Idea deliberately removed or abandoned. Do not reintroduce casually.
- **EXPERIMENTAL:** Testable option, not a committed direction.

A decision changed by the project owner moves to the decision log with date and rationale. Major feature PRs must update this document when the intended design changes.

## 3. Core gameplay pillars

1. **A real shop, not a passive menu.** Physically stock shelves, serve customers, manage wholesale inventory and money, and arrange usable furniture.
2. **Autonomous heroes.** Heroes independently decide whether and what to buy based on need, available gold and stock; the player affects outcomes indirectly rather than puppeteering their purchases.
3. **Consequences without arbitrary attrition.** Heroes can be injured or die as a result of dungeon gameplay. Supplies and equipment meaningfully affect their chances.
4. **Truthful dungeon simulation and replay.** A recorded replay presents committed outcomes. Viewing it must never generate a different fight or reroll loot, death or survival.
5. **Progression with meaning.** Shop improvements, hero development, and deeper floors should create new strategic choices. Exact progression schedule is **OPEN**.
6. **Readable, atmospheric presentation.** Make hero identity, inventory, sales, deaths and other important changes understandable without walls of log text.

## 4. Current playable alpha (CURRENT, checked against README/source)

- Browser-based TypeScript game rendered with Babylon.js.
- The current playable shop is Galvik's cursed shop on dungeon **Level 5**.
- First-person shop; physical shelving and cashier interaction, wholesale buying, furniture placement, shop excavation/expansion.
- Persistent hero identities with roles, HP, money, equipment, experience and dungeon states.
- Day advancement through sleeping; merchant ledger, receipts and reports.
- Deterministic simulation of upper floors 1–4; Level 6 Cave Troll encounter; shared Level 7 exploration, fog and replay.
- Current published build and exact gameplay details: consult [README](../README.md), source and tests. This section must be revised when code changes.

## 5. Locked gameplay decisions (LOCKED)

### Heroes, survival and merchandise
- **No hunger, starvation or daily food-consumption system.** It was consciously removed because this kind of death is difficult for a shopkeeper to influence and distracts from actual dungeon risk.
- **Waybread stays** as inexpensive, relatively weak **HP healing**, while Healing Herbs restore more HP for more gold. These are healing supplies, **not hunger meters**.
- Hero spending and equipment decisions remain autonomous; player influence is primarily through stock, availability, and shop operations.
- Injuries and deaths must follow actual dungeon simulation, not arbitrary background timers.
- No free healing items should be conjured to compensate for unsold stock.

### Dungeon and presentation
- Dungeon outcomes are committed before playback; replay is a faithful visualization, not a second simulation.
- Shopkeeper-relevant consequences should be legible in the interface, especially the end-of-day report.
- A furniture preview is visual only until confirmed; invalid furniture placements must not block vital customer routes.

### Technical product direction
- Browser delivery is the current development workflow, **not** a permanent limitation or exclusive release platform.
- Desktop distribution is a possible future direction, **not** an approved engine migration or finalized release plan.

## 6. Story — locked direction vs. open canon

### Locked narrative direction (LOCKED)
- The story is a tragedy of **desperate choices and their consequences**, not arbitrary punishment.
- The **young hero consciously chooses** to take on the curse, rather than being punished for a mercenary leader's unrelated mistake.
- Do **not** write the protagonist as an all-knowing veteran who has already mastered the entire dungeon before the game begins.

### Existing premise (CURRENT, implementation-facing)
- The running game starts in Galvik's cursed Level 5 shop. This does not settle the final prologue, player identity, or ending.

### Unresolved story questions (OPEN, not canon)
1. **Galvik:** Why was he cursed, by whom, and under which fair, comprehensible rules?
2. **Protagonist:** What exact sacrifice does the young hero knowingly accept, when, and with what information?
3. **Motive:** What is the precise role of the sick fiancée, medicine, money, letters and personal stakes? Earlier concepts are *proposals*, not finalized facts.
4. **Amulet:** Is it essential? If yes, who created it, why does it matter, and why would its fate affect the curse?
5. **Mercenaries / Level 100:** Are they part of the definitive story? If so, establish causality without blaming the young hero for their independent acts.
6. **Shop reset:** Why does the player begin with a small shop and limited means despite Galvik's prior history?
7. **Ending / New Game Plus:** What breaks the curse? How does the ending honor the player's decisions and support a coherent replay loop?

**Rule:** Do not implement plot triggers, cutscenes, or claim narrative canon until these questions are resolved by the project owner.

## 7. Game design questions (OPEN)

- How much direct control should the player gain without destroying hero autonomy?
- What are the major shop-management choices and meaningful money sinks in early, middle and late game?
- How does progressing deeper change stock, demand, expedition risk and the visual shop?
- Which upgrades are permanent, temporary, optional or ethically costly?
- How can the 100-floor ambition avoid repetitive daily loops?
- What is the final visual style for characters, furniture, monsters, props and environment?
- What is the final commercial/distribution strategy: web demo, downloadable desktop build, Steam, or a combination?

## 8. Explicitly rejected directions (REJECTED)

- **Hunger/starvation simulation.** Do not revive it as a daily food meter under a new name.
- **Replays that can change a previously committed outcome.**
- **A protagonist who already knows every dungeon secret because they previously conquered the dungeon.**
- **Making unresolved amulet/mercenary lore into mandatory canon without resolving causal gaps.**

## 9. Decision log

| Date | Status | Decision | Why |
| --- | --- | --- | --- |
| 2026-11 | LOCKED | Remove hunger entirely; Waybread heals HP | Avoid unmanageable off-screen starvation and preserve meaningful combat risk |
| 2026-11 | LOCKED | Hero buys independently; player influences indirectly | Preserve the living-shop simulation |
| 2026-11 | LOCKED | Dungeon replay cannot reroll outcomes | Results and consequences must be trustworthy |
| 2026-11-14 | LOCKED | Young hero **knowingly** accepts the curse | Moral agency and a coherent tragedy rather than arbitrary inherited punishment |
| 2026-11-14 | OPEN | Exact story causality, ending and Level 100 logic | Require a coherent final narrative before implementation |
| 2026-11-14 | OPEN | Desktop delivery and visual asset pipeline | Keep options open; no premature engine rewrite |

## 10. How to maintain this bible

- Update **intent** in this document when a mechanic, story rule or artistic direction is intentionally approved/changed.
- Update **CURRENT** descriptions only when implementation has actually changed; refer to code/tests.
- Preserve superseded decisions in the log instead of silently overwriting history.
- Do not mistake a chat suggestion, mockup, music experiment or old roadmap for an approved feature.
- For the code map and integration constraints, read [ARCHITECTURE.md](ARCHITECTURE.md). AI collaborators start with [AGENTS.md](../AGENTS.md).
