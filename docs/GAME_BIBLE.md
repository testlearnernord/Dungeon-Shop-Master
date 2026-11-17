# Dungeon Shop Master — Game Bible

> **Living design reference · reviewed 2026-11-17.** This document describes the currently valid game direction, not a chronological archive. Replace or delete superseded information in the same PR that changes it. Git history preserves previous drafts. The source code and tests, not this document, establish what is playable.

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

- TypeScript/Vite with Babylon.js; first-person Level 5 shop, shelf restocking, wholesale purchasing, cashier interaction, credits and customer shopping behavior. All six stocked goods have distinct original low-poly GLB assets loaded by Babylon once per scene, with painted meshes reused for shelf stock rather than geometry rebuilt independently in code. These meshes follow slot quantity and cannot be targeted or obstruct NPC movement; item UI icons remain a separate shared atlas.
- **Customer navigation:** shoppers move along geometry-aware paths with smoothed turns, measured speed changes, real shelf service access and a finite five-position physical checkout line. Extra buyers use safe overflow positions. The single `ShopServiceSpots` manager exclusively reserves shelf browsing/waiting, register, petition and overflow destinations, including in mined shop extensions. Moving a fixture invalidates affected claims; customers should not occupy exits or block active traffic.
- **Customer purchases and departure:** a hero inspects actual shelf goods, reserves stock into a saved unpaid cart and carries it to the register. Successful manual checkout is real, exactly-once accounting with an immediate *physical* departure; paid buyers cannot reroll into a next-day shop stay just because the day closes, while independently approved dungeon expeditions still take priority. Outstanding held carts are settled once at the bed-based day transition. Roster or inventory refreshes do not respawn a paid, exiting customer.
- **Staffed register:** the existing two-stage goods/receipt timing challenge processes a real cart from the customer side of a physical five-place queue, but only the player standing at the **staff** dock may operate it. Once a payment commits, the paid receipt shows actual gold and any customer-funded tip. The register remains open so **E** explicitly admits the next *physically ready* customer without closing/reopening the modal. Every customer's two stages remain mandatory; opening a new transaction does not itself pay anyone. **Esc** exits the register.
- **Requests and credit:** an unavailable item produces a specific icon/restock request with a 60-second limit. The visitor waits in a reachable quiet pocket, may roam locally or yield to traffic and leaves upset when the timer expires. A visitor unable to afford goods may request *credit*, which requires the player's active decision and creates a debt entry, **not immediate merchant revenue**. An E conversation pauses only that visitor's request/movement as implemented.
- **Customer visual performance:** adventurers accelerate/brake, turn smoothly, look toward actual merchandise/register/player, briefly reach for **confirmed** goods and react to **confirmed** payment. Idle glances and credit/restock gestures are spaced and restrained. A single, short, world-anchored speech bubble can surface a deterministic character remark after a real pickup, manually paid cart, granted credit, restock/credit petition or unsatisfied walkout. Comments are per-visit bounded, rate-limited and never reveal sealed expedition outcomes. All these visual cues leave purchases, pathfinding, request countdowns, debt, damage and save state untouched.
- Unpaid or unserved visitors may still follow the normal day-based stay/departure rules; these outcomes are not automatically treated as successful sales.
- **Player service focus:** aiming at a physical shelf slot reveals the **real** item, capacity, selected bag item, valid left/right-click actions, Shift+click fill/clear and blockers (wrong item, full slot, empty bag or unpaid customer cart). A small, translucent top-center service strip reports **physically present** register-ready buyers and live restock/credit requests; earliest-expiring restock takes priority. **F** (or its icon chip) only selects that item in the existing six-item hotbar. The player still goes to the shelf to stock, and to the staff side of the counter or nearby debtor to interact with E. There is no auto-buy, auto-stock or auto-pay.
- **Contextual furniture placement:** shelves and compact checkout counter (new campaigns start at the corner near Galvik’s rest-room wall), plus bedroom desk/book, chest, candle/stool, bed, wall-mounted Adventurer Board and the placeable portrait of Galvik's lost beloved. Existing furniture is moved using P; new campaigns start with no shelves. Build Shelf (N) creates a compact, initially empty shelf with four persistent stock slots, bounded to 12 shelves for the current alpha. Starter merchandise lives in the bag until the player builds and stocks a shelf. The floor editor can target visible excavated wing surfaces from the original cave; preview and commit share one authoritative check. Previews are not saved until confirmed. Newly dug 1m cells can be used for furniture **once enough connected floor has been cleared for the entire object and customer access**.
- Level 5 room excavation/expansion, persistence, hero identities and roster. Mining reuses unchanged cave geometry between strikes; the first-person pickaxe has a raised wooden shaft and overhead strike.
- Deterministic day-based adventures on Floors 1–4, a Cave Troll encounter on Floor 6 and the shared Floor 7 exploration/replay systems. Later floors are not claimed as playable.
- **Cave Troll presentation (CURRENT, design LOCKED):** The first boss uses the owner-approved **Ashen Tunnel Mauler** character direction: pale ash-scarred, long-armed, hunched cave brute, ferocious face, rusted twin mining canisters, miner harness and an oversized two-handed iron-bound stone maul. The Level 6 arena renders a real articulated Babylon 3D figure with a miner-cavern set; in both V training preview and saved replay, existing combat phases drive chase gait, windup, slam, stagger, recovery and progressive death posing. The artwork is an approved visual direction, not a promise of photorealistic, hand-sculpted GLB production quality. **Neither the boss motor nor recorded outcomes change** because of visual animation. The visual rig has distance-driven gait, an overhead hammer strike, and **17 original vertex-painted anatomical surfaces sourced from the checked-in `ashen-mauler-sculpt.glb`**: skull, neck, shoulders/back, torso, arms, thighs, shins, feet and stone maul core. The root now faces the hero before the cinematic begins, with the original combat/replay heading unchanged. The face has been lowered and tucked forward beneath a broad humped back, reducing the rounded belly and removing skull horns that read as mechanical props. The current refinement uses densely interpolated, smooth anatomical contours rather than six stacked blocky sections; the ash-grey face sits lower between the shoulders with smaller recessed glowing eyes, nostrils, swept grey scalp/jowl hair and a movable jaw. Rounded layered shoulder armour, curved frayed apron cloth, separately articulated fingers and an irregular stone maul with ring iron bands replace the worst rigid box details. Cooler face fill preserves lava contrast. The maul's existing locked-arc windup brightens progressively; a visual-only stone shockwave, reused flying debris, grounded torso-compression recoil and brief impact light start at the combat motor's actual strike tick (0.14 seconds) and fade naturally through recover in training and committed replay alike. These effects never spawn gameplay projectiles, change a hit or rewrite combat history. On load these replace the original primitive surfaces in-place while all animated limbs, accessory geometry, names and combat state remain under the existing Babylon transform rig. A failed import retains the old geometry and records the failure; browser acceptance explicitly rejects that fallback. **This is a segmented GLB mesh set animated by the existing runtime rig, not a professionally hand-sculpted, skin-weighted character with embedded GLB animation clips.** Visual approval against the accepted concept and a later unified skinned character remain open.
  - **Approved art source:** [Ashen Tunnel Mauler character turnaround and attack concept](assets/ashen-tunnel-mauler-concept.webp). The repository artwork is a *visual target*, not a rigged 3D asset.
  - **Level 6 combat fairness (CURRENT):** New battles use the same deterministic, recorded 60 Hz duel with safe inward-steering and bounded dodge/knockback destinations, and the reachable molten ledge deals actual limited HP damage rather than an instant kill. Increased boss endurance, longer breathing space between attacks and earlier real heal windows provide a longer fight for *Desperate Measures*. These adjustments do not recompute already saved encounters; their historical boss HP and outcomes remain authentic.
  - **Level 6 spectator HP / damage HUD (CURRENT):** compact world-anchored health bars over the real hero and Cave Troll; floating numbers only for real recorded/direct combat cues. Gold = hero damaging the boss, red = boss damaging the hero, orange = lava, green = healing. Historical lava events without an actual saved amount display only `LAVA!`, never an invented number. Hidden until the intro ends.
  - **Boss soundtrack (CURRENT):** The Level 6 Cave Troll preview and recorded boss fights play **Desperate Measures** (female wordless vocals), loaded from `public/audio/desperate-measures.mp3`. The shop retains **The Lean Season** and the dungeon viewer currently retains **Beneath the Surface**. A **13.5-second cinematic introduction** presents the arena, troll, lone hero and boss before playback or training simulation begins on the first musical impact. The camera follows the actual audio playhead where available, falling back to wall time if muted/blocked. Space/Enter skips to the combat downbeat; V/Escape returns to the shop. Audio and cinematic timing never alter combat ticks, persisted events or replay outcomes.
- **Level 6 Tripo combat trial (CURRENT, NOT APPROVED ART):** A Level 6 spectator toggle selects the checked-in twelve-clip skinned Tripo Troll as a presentation-only candidate. `tripoCaveTrollVisual.ts` samples walk, idle, windup/strike/recover, stagger and death from the existing live/replayed phase ages; the original segmented boss remains default and acts as a visible import-error fallback. Following player screenshots showing a backward-facing troll, stuttering backward skating, air punches and late-looking dust, the experimental renderer removes an erroneous 180° GLB pivot, samples a stabilized distance-driven walk and uses the actual two-handed overhead strike motion for all swings. The contact frame was measured from the model wrist animation and aligns with the unchanged 0.14 s motor hit and existing dust ring. The provisional stone maul was rejected after player tests because it floated between the hands and penetrated the ground; it is now **removed from the Tripo trial**, which instead uses bare-fisted overhead smashes. Its original legacy counterpart retains its older hammer. Weighted 0.19-second Babylon animation cross-fades soften pose switches, and turn-induced footsteps stop a completely planted-foot spin when the hero circles. This changes only presentation, not combat positions, collision, damage or saved outcomes. Dedicated unarmed attacks and true positional circling remain OPEN; visual quality and foot planting still require owner approval. The authoritative simulation, replay frames, sounds, HUD, existing Model Lab and saved campaign are unchanged.
- **Level 6 training and model lab (CURRENT):** V opens an unsaved preview by default, even when older footage exists (explicit Ledger footage and the C switch still show the identical recording). When no hero is authorized for Floor 6, every V training preview/restart chooses a different fictional combat setup (role, equipment, stats and tactics), never altering real heroes, day simulation or saved footage. Recorded combat restarts always show the identical committed frames. Inside the arena, **Inspect Tripo GLB** opens a browser-local 3D model viewer using the existing Babylon canvas; the player can load a `.glb` from disk or select the checked-in twelve-clip Ashen Tunnel Mauler candidate, orbit/zoom and inspect its embedded animation clips. The full 55-clip source remains archived for comparison. This is an asset trial, not a replacement of the shipped troll in combat.
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
- CURRENT technical foundation: all current movable furniture, including Galvik's wall portrait, shares one universal registry for geometry, labels, mount surfaces, focus/interaction metadata and shelf/counter service semantics, plus ONE authoritative preview/placement transaction. Shelves are separate player-built instances with four independently stocked slots each; no shelves, fixed left/right IDs or pre-stocked merchandise spawn in a new campaign. Only built instances have meshes, collision, customer service faces and persistent slots. The obsolete coordinate-based shelf editor has been removed. Shop-floor shelves and cashier expose physical NPC collision and service points; private bedroom props retain mandatory bed/door access. Wall fixtures share the same structural wall-anchor/support system: the Adventurer Board and portrait can mount only on valid supported walls, and mining must first move any mounted fixture that would lose its support. Furniture placement never changes hero shopping decisions or RNG, although stocked extra shelves naturally create more buying options. Other furniture types are currently single instances, not unlimited decorations.
- Shelf/checkout access, both entrances and at least two distinct reachable restock/credit petition stations may not be obstructed by a committed rearrangement. Petition stations are generated from the current excavated room and furniture rather than fixed coordinates from the starter cave. Every active service destination is exclusive per shopper, including safe roaming targets; moving furniture or excavating invalidates old reservations. The Level 5 side expansion uses the same floor-walkability and routes as the original cave. Bedroom objects and the wall noticeboard have their own player-only access rules and must preserve dependent visuals/interactions and sleep access. **Future shop-floor furniture** must join the authoritative placement, collision, pathfinding, service-reachability and persistence contract before it is considered playable; as-yet-unimplemented furniture cannot be claimed tested.

## 4. Narrative status

**CURRENT game premise:** Galvik is the cursed merchant in the Floor 5 shop, and the playable alpha currently controls him. This does not settle the final prologue, whether the perspective changes later, or how the curse ends.

**Character intent (LOCKED):** Galvik is cynical, opportunistic and unashamedly greedy, with cruel or macabre humor. The world may be tragic without turning Galvik into a generic heroic mentor.

**OPEN, not story canon:**

- What caused Galvik's curse, who imposed it, what sustains it and under what conditions it can end.
- Whether a **young hero** or a **mercenary leader** later becomes the player character, and why. The idea of a young hero *consciously accepting* a curse is one proposed solution to a causality problem, **not a finalized plot event**.
- Whether letters, a fiancée's illness, a mercenary expedition or the deepest floors play any narrative role. These are previous brainstorms, **not required story events**. The portrait asset is implemented decoration, not proof that any suggested backstory has been canonized.
- How any transfer of the curse could be voluntary, comprehensible and causally connected to its consequences, rather than punishment for someone else's unrelated action.
- Why a potential successor would begin with a modest shop instead of inheriting a fully developed business; how Galvik could behave after a transfer. A later Galvik who lounges in the shop and throws short, cruel, occasionally useful comments at the player is a candidate character beat, **not** an implemented NPC or finalized plot transition.
- The ultimate ending, post-game loop and what, if anything, truly breaks the curse.

**Rejected approach (REJECTED):** Do not make the new protagonist a veteran who already knows every dungeon secret because they previously conquered all 100 floors. The prior **amulet mechanic has been removed from the current concept**; do not reintroduce it as an OPEN dependency or treat curse-transfer/mercenary lore as mandatory.

**Writing rule:** Short dialogue sketches, dark jokes and prototypes can be explored without declaring the entire scenario canon. Only promote story details to LOCKED after an explicit project decision.

## 5. Design questions still open (OPEN)

- How to keep watching autonomous dungeon expeditions engaging, and what indirect powers the player gains over routes, traps, hazards or boss encounters.
- Whether, when and how shop time and dungeon activity should interact continuously instead of only at committed day transitions. **No 24-hour concurrent simulation has been approved.**
- Meaningful short- and long-term shop decisions, possible player-controlled pricing (not in the current alpha), upgrades, helpers, money sinks and increasing demand.
- How exploration, deeper floors and hero progression expand gameplay without requiring 100 hand-built or repetitive levels.
- How to make early-floor (1–4) deaths observable or replay-backed. These floors currently simulate offscreen, and the ledger no longer showcases their unobserved casualties as a memorial.
- Whether the one-model Tripo AI trial can become a repeatable import, rigging and animation pipeline for future dungeon monsters and eventually heroes.
- The long-term art/asset pipeline, optional desktop delivery and commercial release model.

These are questions, not permissions to undertake a large rewrite.

**Approved near-term sequence (implementation is separately verified):**
The staffed cashier, physical stocking improvements and customer reactions
are already implemented. The local Tripo GLB inspection viewer and varied
Level 6 training-only battles shipped in #166. They do **not** replace the
actual boss model or establish a generalized animated-asset pipeline.

The next approved trial is **one externally generated, skinned Tripo AI Cave
Troll** in the existing Level 6 fight. It is **not CURRENT** until a verified
PR actually imports and animates the candidate in gameplay. The shipped
Babylon transform-rig Cave Troll stays the implemented baseline until then.

After that trial, prioritize boss visual/gameplay acceptance, observable
shop-to-dungeon consequences and a measured ten-day playthrough. Possible
pricing/economy expansions or an excavated basement, forge and pond remain
design discussions, not committed implementations. No always-running
simulation, automated merchant, new protagonist or definitive curse lore
has been approved by this priority change. See [ROADMAP.md](ROADMAP.md).

## 6. Explicit exclusions (REJECTED)

- Hunger/starvation, regardless of renamed meter.
- Replays that resolve combat again or alter committed outcomes.
- The discarded amulet mechanism or mandatory lore constructed from unresolved curse-transfer, mercenary or Floor 100 theories.
- Presenting concept art or brainstorming as final UI, story or production scope.

## 7. Keeping the Bible current

**Every gameplay, economy, story, UI or presentation PR must review this file.**

1. Update the affected **CURRENT** statements after implementing a mechanic. If something was removed, delete its current-feature claim.
2. Move a design between OPEN / LOCKED / REJECTED only when the owner has genuinely made that decision. Replace the old classification in place, instead of leaving two competing versions.
3. Remove superseded descriptions and obsolete proposals from the active reference. Use Git history and PR discussions for archaeology; **do not append an ever-growing historical decision log here**.
4. Keep the distinction between **what exists**, **what is explicitly approved**, and **what is merely being discussed**.
5. Review [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](../AGENTS.md) alongside this document. A PR that changes an invariant or workflow must synchronize the relevant sections of all three.

The documentation is maintained **with** the code/story change, never as an indefinitely deferred cleanup task.
