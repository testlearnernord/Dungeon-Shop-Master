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
- NPC movement, a finite single-file checkout line (overflow buyers wait at separate safe stands) with station spacing compatible with exclusive customer reservations, credit/restock requests and shelf waiting, with a shared, geometry-aware service-spot manager covering browsing, petition and queue destinations. Unserved customers ask for a particular item or credit, then move periodically through safe low-traffic areas; the request bubble follows them, the original 60-second request expires even while walking, and Galvik can still speak to a nearby beggar. Roaming shoppers yield active routes instead of blocking the register. Claims and movement are temporary visual state, not purchases or saves.
- Confirmed sales start an immediate physical departure. At day close a paid buyer cannot randomly stay for a second shop day. Unpaid/unserved visitors may still follow the existing stay/departure simulation rules; approved Level 6 expeditions take priority. Unrelated roster or merchandise changes must not respawn a departed paid visual.
- Contextual furniture placement: shelves and compact checkout counter (new campaigns start at the corner near Galvik’s rest-room wall), plus bedroom desk/book, chest, candle/stool, bed and wall-mounted Adventurer Board. The floor editor can target visible excavated wing surfaces from the original cave; the preview and commit share one authoritative check. Previews are not saved until confirmed. Newly dug 1m cells can be used for furniture **once enough connected floor has been cleared for the entire object and its service access**.
- Level 5 room excavation/expansion, persistence, hero identities and roster. Mining reuses unchanged cave geometry between strikes; the first-person pickaxe has a raised wooden shaft and overhead strike.
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
- CURRENT technical foundation: all eight existing movable objects share a universal furniture registry for geometry, mounting and interaction metadata, plus ONE authoritative preview/placement transaction. Shop-floor shelves and cashier expose physical NPC collision and service points; private bedroom props retain mandatory bed/door access and the wall noticeboard needs a supported stone wall. The board can mount on appropriately wide excavated rock walls, but mining must first move any board that would lose its support. Furniture transforms remain in the existing save fields; furniture placement never changes hero shopping intentions, purchases or RNG.
- Shelf/checkout access, both entrances and at least two distinct reachable restock/credit petition stations may not be obstructed by a committed rearrangement. Every active service destination is exclusive per shopper, including safe roaming targets; moving furniture or excavating invalidates old reservations. The Level 5 side expansion uses the same floor-walkability and routes as the original cave. Bedroom objects and the wall noticeboard have their own player-only access rules and must preserve dependent visuals/interactions and sleep access. **Future shop-floor furniture** must join the authoritative placement, collision, pathfinding, service-reachability and persistence contract before it is considered playable; as-yet-unimplemented furniture cannot be claimed tested.

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
