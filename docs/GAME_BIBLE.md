# Dungeon Shop Master — Game Bible

> **Living design reference · reviewed 2026-11-14.** This document describes the currently valid game direction, not a chronological archive. Replace or delete superseded information in the same PR that changes it. Git history preserves previous drafts. The source code and tests, not this document, establish what is playable.

## Reading this document

- **CURRENT** means behavior verified in the repository. It does not mean permanent design approval.
- **LOCKED** means the project owner has explicitly accepted a design principle. A newer explicit decision can replace it.
- **OPEN** means unresolved, proposed or being explored. Do not present it as canon or silently implement it.
- **REJECTED** means a discarded direction; only revisit after an explicit new decision.
- The latest explicit project-owner decision overrides an older statement here. Update this document in the same change; do not let outdated text veto new work.
- A conceptual image, brainstorm, AI suggestion or prototype is **not** a LOCKED decision by itself.

## 1. The game we are making

**Identity (LOCKED):** An atmospheric, dark-fantasy shopkeeping simulator in a dangerous dungeon. The shop is physically operated, rather than being a menu. Adventurers are autonomous customers with identities and uncertain futures. Commerce, greed, survival and long-term consequences belong together.

**The shop:** A small, rough, inhabited cave on **Floor 5**, not a fully equipped city storefront. Galvik is a sharp-tongued, selfish, deeply greedy merchant. His black humor and lack of scruples are part of the intended character, not an instruction to make the player's UI hostile.

**The central choice:** The player controls what is ordered, stocked, arranged and made available. Heroes choose their own purchases. A good shop can help them survive; selling rubbish for a profit can have consequences. Retail prices are currently fixed in the item catalog, not player-adjustable.

**Scale:** A dungeon of up to 100 floors is the long-term fiction/ambition. It does **not** imply that 100 playable levels exist, or that a specific release scope or real-time simulation model has been approved.

## 2. Current playable alpha (CURRENT)

The repository currently implements:

- TypeScript/Vite with Babylon.js; first-person Level 5 shop, shelf restocking, wholesale purchasing, cashier interaction, credits and customer shopping behavior.
- NPC movement, checkout queues, credit/restock requests and shelf waiting, with a shared, geometry-aware service-spot reservation manager. Claims are temporary visual navigation state, not purchases or saves.
- Contextual furniture placement: shelves and compact checkout counter (new campaigns start at the corner near Galvik’s rest-room wall), plus bedroom desk/book, chest, candle/stool, bed and wall-mounted Adventurer Board. Previews are not saved until confirmed. Newly dug 1m cells can be used for furniture **once enough connected floor has been cleared for the entire object and its service access**.
- Level 5 room excavation/expansion, persistence, hero identities and roster.
- Deterministic day-based adventures on Floors 1–4, a Cave Troll encounter on Floor 6 and the shared Floor 7 exploration/replay systems. Later floors are not claimed as playable.
- Bed-based day close, four-part merchant ledger (reckoning, receipts, hero chronicle, sealed expedition recordings), and saved replay viewing that does not reroll outcomes.
- A browser build deployed through GitHub Pages. Desktop distribution and any engine migration remain unapproved possibilities.

For exact prices, damage, timers, controls, available rooms and release behavior, consult [README](../README.md), the implementation and tests. Avoid duplicating fast-changing numbers here.

## 3. Accepted gameplay rules (LOCKED)

### Shop and adventurers

- Adventurers have their own intentions, budgets and decisions; the player does **not** directly choose their shopping baskets.
- Item availability, service quality, shop layout, equipment and HP supplies should matter to subsequent risk.
- **No hunger or starvation mechanic.** The previous hunger system was removed. Waybread remains inexpensive **HP healing**, weaker than Healing Herbs, not a hunger meter. Do not reintroduce hunger through a renamed daily timer.
- Dungeon wounds and deaths must arise from actual HP damage, not an unrelated instant-kill roll, starvation or hidden punishment.
- Never fabricate free medicine, stock, sales or loot to make the economy look healthier.

### Dungeon, reports and replay

- Resolve outcomes once and store them; viewing or replaying a fight/exploration must not reroll victory, death, purchases, loot or gold.
- Information the player has not yet legitimately learned must stay sealed. Ledger summaries may show known purchases and movement, not secretly reveal unviewed battle outcomes.
- Reports should favor readable hero identities, portraits, item pictograms, losses, receipts and clear status over walls of raw event text.

### Physical shop

- Furniture previews must be cheap and non-mutating; the final placement must be validated. The cashier has distinct visitor and staff sockets, and Galvik can operate it only from the staff side.
- Shelf/checkout access and customer routes may not be obstructed by a committed rearrangement. Every active service position is exclusive per shopper, and moving furniture or excavating invalidates old reservations. Movable bedroom objects must keep dependent visuals/interactions together and preserve sleep access.

## 4. Narrative status

**CURRENT game premise:** Galvik is the cursed merchant in the Floor 5 shop, and the playable alpha currently controls him. This does not settle the final prologue, whether the perspective changes later, or how the curse ends.

**Character intent (LOCKED):** Galvik is cynical, opportunistic and unashamedly greedy, with cruel or macabre humor. The world may be tragic without turning Galvik into a generic heroic mentor.

**OPEN, not story canon:**

- What caused Galvik's curse, who imposed it, what sustains it and under what conditions it can end.
- Whether a **young hero** or a **mercenary leader** later becomes the player character, and why. The idea of a young hero *consciously accepting* a curse is one proposed solution to a causality problem, **not a finalized plot event**.
- Whether an amulet, a sick fiancée, letters, a mercenary expedition or Floor 100 are needed at all. These are prior brainstorming possibilities, **not required story elements**.
- How any transfer of the curse could be voluntary, comprehensible and causally connected to its consequences, rather than punishment for someone else's unrelated action.
- Why a potential successor would begin with a modest shop instead of inheriting a fully developed business; how Galvik could behave after a transfer.
- The ultimate ending, post-game loop and what, if anything, truly breaks the curse.

**Rejected approach (REJECTED):** Do not make the new protagonist a veteran who already knows every dungeon secret because they previously conquered all 100 floors. Do not treat unresolved amulet, transfer or mercenary lore as mandatory.

**Writing rule:** Short dialogue sketches, dark jokes and prototypes can be explored without declaring the entire scenario canon. Only promote story details to LOCKED after an explicit project decision.

## 5. Design questions still open (OPEN)

- How to keep watching autonomous dungeon expeditions engaging, and what indirect powers the player gains over routes, traps, hazards or boss encounters.
- Whether, when and how shop time and dungeon activity should interact continuously instead of only at committed day transitions. **No 24-hour concurrent simulation has been approved.**
- Meaningful short- and long-term shop decisions, possible player-controlled pricing (not in the current alpha), upgrades, helpers, money sinks and increasing demand.
- How exploration, deeper floors and hero progression expand gameplay without requiring 100 hand-built or repetitive levels.
- How to make early-floor (1–4) deaths observable or replay-backed. These floors currently simulate offscreen, and the ledger no longer showcases their unobserved casualties as a memorial.
- The long-term art/asset pipeline, optional desktop delivery and commercial release model.

These are questions, not permissions to undertake a large rewrite.

## 6. Explicit exclusions (REJECTED)

- Hunger/starvation, regardless of renamed meter.
- Replays that resolve combat again or alter committed outcomes.
- Mandatory lore built from unresolved curse/amulet/Mercenary/Floor 100 theories.
- Presenting concept art or brainstorming as final UI, story or production scope.

## 7. Keeping the Bible current

**Every gameplay, economy, story, UI or presentation PR must review this file.**

1. Update the affected **CURRENT** statements after implementing a mechanic. If something was removed, delete its current-feature claim.
2. Move a design between OPEN / LOCKED / REJECTED only when the owner has genuinely made that decision. Replace the old classification in place, instead of leaving two competing versions.
3. Remove superseded descriptions and obsolete proposals from the active reference. Use Git history and PR discussions for archaeology; **do not append an ever-growing historical decision log here**.
4. Keep the distinction between **what exists**, **what is explicitly approved**, and **what is merely being discussed**.
5. Review [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](../AGENTS.md) alongside this document. A PR that changes an invariant or workflow must synchronize the relevant sections of all three.

The documentation is maintained **with** the code/story change, never as an indefinitely deferred cleanup task.
