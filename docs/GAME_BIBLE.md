# Dungeon Shop Master — Game Bible

> **Living design reference · reviewed 2026-11-18.** This document describes the currently valid game direction, not a chronological archive. Replace or delete superseded information in the same PR that changes it. Git history preserves previous drafts. The source code and tests, not this document, establish what is playable.

## Reading this document

- **CURRENT** means behavior verified in the repository. It does not mean permanent design approval.
- **LOCKED** means the project owner has explicitly accepted a design principle. A newer explicit decision can replace it.
- **OPEN** means unresolved, proposed or being explored. Do not present it as canon or silently implement it.
- **REJECTED** means a discarded direction; only revisit after an explicit new decision.
- The latest explicit project-owner decision overrides an older statement here. Update this document in the same change; do not let outdated text veto new work.
- A conceptual image, brainstorm, AI suggestion or prototype is **not** a LOCKED decision by itself.

## 1. The game we are making

**Identity (LOCKED):** An atmospheric, dark-fantasy shopkeeping simulator in a dangerous dungeon. The shop is physically operated, rather than being a menu. Adventurers are autonomous customers with identities and uncertain futures. Commerce, greed, survival and long-term consequences belong together.

**The shop:** A small, rough, inhabited cursed cave, not a fully equipped city storefront. **CURRENT V.002:** its game-space is mapped to Floor 5. **APPROVED V.003 DIRECTION:** Galvik's same physical shop becomes a **cursed special floor outside the numbered dungeon**, entered and left through one supernatural gateway regardless of where a hero abandoned an expedition. Galvik is a sharp-tongued, selfish, deeply greedy merchant. His black humor and lack of scruples are part of the intended character, not an instruction to make the player's UI hostile.

**The central choice:** The player controls what is ordered, stocked, arranged and made available. Heroes choose their own purchases. A good shop can help them survive; selling rubbish for a profit can have consequences. Retail prices are currently fixed in the item catalog, not player-adjustable.

**Scale:** A dungeon of up to 100 floors is the long-term fiction/ambition. It does **not** imply that 100 playable levels exist, or that a specific release scope or real-time simulation model has been approved.

## 2. Current playable alpha (CURRENT)

**Version distinction:** the currently published game is **V.002 ALPHA**. **V.003 ALPHA — The Living Dungeon** is the **approved next design/release milestone**, not yet shipped. Its detailed target and acceptance criteria are in [THE_LIVING_DUNGEON.md](THE_LIVING_DUNGEON.md). The independent npm `package.json` metadata version is not a playable content claim.


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
- **Multi-hero boss special ability in shared combat (CURRENT after this PR):**
  The existing `groupCombat.ts` now supports an optional,
  deliberately telegraphed `grapple-throw` for melee boss
  combatants. A real hero can evade, parry or escape; a landed
  catch physically holds and throws one actual hero, dealing
  armor-mitigated damage only on wall collision or landing.
  A large boss has configurable stagger resistance so weak
  attacks do not cancel every long windup; successful parries
  and strong hits still interrupt. No item consumption or instant death is invented. Shared
  `combatGrapple.ts` supplies timing/escape/launch rules to
  the established single-hero Troll fight too. Party fights
  are executable and replay-recorded in the group engine;
  **the campaign and current Floor 6 cinematic still use
  the one-hero encounter**. This does not yet add multi-hero
  boss parties to live dungeon progression or decide the Floor 10 boss.
- **Recorded group dungeon playback and renewable elites (CURRENT after this PR):**
  The dungeon spectator projects *all* actors and projectiles from one
  saved `GroupCombatReplay`; TAB focuses only a fighter visible in
  the current combat frame. Newly recorded companions visibly carry
  their actual historically purchased Iron Sword/Leather Vest (if any).
  Older v1 footage lacking equipment snapshots stays neutral. No replay
  may query today's changed shop roster to dress a historical fighter. Floor 7 room sentries can return
  on a deterministic later site generation as elite melee monsters with
  genuine `grapple-throw` combat, physical collision, resistance and
  replayable results. They are renewable monsters, **not** the unique
  Cave Troll or a Floor 10 boss. The group campaign now supports
  real co-located 1–3-hero encounters; full V.003 progression is incomplete.
- **Autonomous co-located dungeon parties (CURRENT after this PR):**
  On Floors 1–4 and 7, willing heroes who already share the same
  physical tile can form an opportunistic group of up to three on
  their next committed expedition day. Only one real traversal,
  opponent, fight and site generation is resolved for that group.
  Each hero has real independent HP, healing charges, individual
  traps/armor effects, XP and replay POV; exactly one hero receives
  a chest's one loot unit, and the finite gold is shared. Party
  outcomes are cached for every hero during the day tick, not
  re-resolved on their later roster turn. Characters can choose
  different personal floor goals afterwards and separate again.
  **Persistent companionship (CURRENT after this PR):** an optional
  saved `dungeonParties` record keeps a consenting 2–3-hero group
  across multiple days. Existing companions take precedence over
  newcomers at the same tile. A unanimous short-term stay/ascend/descend
  decision and a genuinely shared destination position preserve the
  group on Floors 1–4; individual dissent, separation, death or shop
  return disbands it or removes casualties. The physical Adventurer
  Board shows a real “Party N” indicator. Expanding the real
  hero's R roster card shows actual companion identities, roles,
  current HP and the stored group founding day. Historical save
  v13 remains readable without the optional relationship field. **Not yet
  implemented:** social leadership/diplomacy, coordinated Floor 6 or
  8–10 progression, or a group Cave Troll campaign encounter.
  Shopkeepers do not command heroes.
- **One live actor state interface (CURRENT after this PR):**
  `combatActor.ts` provides a common mutable HP/position/stamina/
  heading/phase/cooldown/contact contract. Ordinary `GroupActor`
  objects implement it natively. The Cave Troll and hero use live
  views over their original fight-state fields, so neither HP
  nor phase is duplicated. Both fight types also use its common
  phase transitions, action ticks and stamina/cooldown refresh.
  Existing phase names, Tripo animation mapping and v1 replay
  frames stay unchanged. Generic multi-hero boss parties and
  reusable boss-only status effects are **not yet complete**.
- **Single top-level encounter simulation (CURRENT after this PR):**
  `combatEncounter.ts` now runs **all ordinary and Troll fights**
  through the same deterministic 60Hz pipeline: authoritative time,
  actor updates, projectiles, HP outcome and committed replay cues.
  It also owns the same bounded recorded-frame scheduler for both
  old group-v1 and boss-v1 formats. The Troll's actual grab, lift,
  launch and lava effects are boss-ability extensions plugged into
  that shared driver; its existing animation timing and historic
  recordings are preserved. Boss and group actor-specific states
  still differ, and the full V.003 special-floor and hero-expedition
  overhaul remains unfinished.
- **Shared fight decisions and projectiles (CURRENT after this PR):**
  both ordinary monsters and the Cave Troll select living targets,
  evaluate attack opportunity, react defensively and choose legal
  skills through `combatTactics.ts`, not duplicated fight-specific
  selection formulas. Group monsters can favor the nearest tank,
  and the Troll can only attempt its signature grab when actually
  in range and after the first attack. `combatProjectile.ts`
  resolves real swept enemy hitbox collisions for both encounters,
  with wall interception and no friendly fire in dungeon fights.
  Boss grab/throw special effects and the top-level encounter
  phase driver are **still distinct**, so do not claim complete
  boss+group engine unification or convert old replays.
- **Shared movement and actor action timeline (CURRENT after this PR):**
  both the ordinary group fights and the Cave Troll now use
  `combatMovement.ts` for real position integration with arena-specific
  collision and `combatActionClock.ts` for deterministic fixed-tick
  action contacts, completions, stamina and cooldown. Wall sliding,
  circular boss boundaries and the existing lava hazard still have
  different world constraints; animation never calculates hits.
  Troll grab/lift/throw remains an intentionally boss-specific
  effect after common contact and timing. The final unification of
  AI target selection and complex group/boss ability effects is OPEN.
- **Shared melee contact/ability profiles (CURRENT after this PR):**
  `combatMelee.ts` now resolves physical attack arc, line of sight,
  dodges and directional parries for ordinary group combat and the
  Cave Troll's smash, slam and sword-parryable grab. The same rules
  also govern the hero's own boss melee hit. A regenerating skeleton
  can gain a slower, wider-reaching and harder-hitting telegraphed
  `heavy` attack, with one real recorded strike and optional saved
  ability identity. The Troll's physical grab/throw/airborne landing
  remains an intentional boss-specific effect. Shared contact and
  HP rules **do not mean the two motion/targeting loops are fully
  unified yet**, nor do they alter previous v1 replay footage.
- **Shared combat vitality and actual Herbs (CURRENT after this PR):**
  `combatVitality.ts` is the common pure HP hit, mitigation and
  restoration authority used by ordinary `groupCombat` and the Troll
  boss motor. All roles (tank/DPS/healer) can spend **their own purchased
  Healing Herbs** for exactly **18 HP** in real ordinary fights; every
  completed use decrements actual supplies and is recorded with the
  combat replay. Healing does not resurrect dead actors. The shop
  catalogue uses the same authoritative Herb (+18) and Waybread (+8)
  values. Boss role-healer's separate innate 25 HP magic heal remains
  distinct from consumed 18 HP Herbs. The boss **behavior/ability motor
  is still separate** from ordinary multi-actor combat; this PR has
  not completed their full unification.
- **Shared spatial expedition engine CURRENT (after this PR merge):** Floors **1–4 and 7** use the same seeded map walker, actual paths/traps/treasure, `groupCombat` encounters and replay data. Floor 1–4 daily random damage/progress placeholder has been **deleted**. The Floor 6 Troll boss still has a separate fight authority pending unification. Later floors are not claimed playable.
- **Early-floor hero intentions CURRENT:** after genuine exploration, heroes choose short stay/ascend/descend/shop decisions based on health, equipment, loot, personal traits and explored locations. Floor 4 currently routes through the existing physical shop transition while the cursed special floor, shared gateway and two-day off-duty system remain **V.003 FUTURE**, not implemented.
- **Floor 7 renewable ordinary sites (CURRENT after the regen PR merge):**
  spatial monster encounters, common chests and resettable traps use
  independently staggered saved regeneration cycles. Site IDs, generation
  count and resolved day are persistent; observed fights, paid rewards,
  exploration geometry and old replays remain unchanged. An occupied
  site cannot respawn underneath a hero. The autonomous walker can revisit
  regenerated sites after a floor has been explored. Floors 1–4
  now share the same regeneration and combat core after this PR merges;
  the special Floor 6 boss remains an independent path until unified.
- **Cave Troll presentation (CURRENT, design LOCKED):** The first boss uses the owner-approved **Ashen Tunnel Mauler** character direction: pale ash-scarred, long-armed, hunched cave brute, ferocious face, rusted twin mining canisters, miner harness and an oversized two-handed iron-bound stone maul. The Level 6 arena renders a real articulated Babylon 3D figure with a miner-cavern set; in both V training preview and saved replay, existing combat phases drive chase gait, windup, slam, stagger, recovery and progressive death posing. The artwork is an approved visual direction, not a promise of photorealistic, hand-sculpted GLB production quality. **Neither the boss motor nor recorded outcomes change** because of visual animation. The visual rig has distance-driven gait, an overhead hammer strike, and **17 original vertex-painted anatomical surfaces sourced from the checked-in `ashen-mauler-sculpt.glb`**: skull, neck, shoulders/back, torso, arms, thighs, shins, feet and stone maul core. The root now faces the hero before the cinematic begins, with the original combat/replay heading unchanged. The face has been lowered and tucked forward beneath a broad humped back, reducing the rounded belly and removing skull horns that read as mechanical props. The current refinement uses densely interpolated, smooth anatomical contours rather than six stacked blocky sections; the ash-grey face sits lower between the shoulders with smaller recessed glowing eyes, nostrils, swept grey scalp/jowl hair and a movable jaw. Rounded layered shoulder armour, curved frayed apron cloth, separately articulated fingers and an irregular stone maul with ring iron bands replace the worst rigid box details. Cooler face fill preserves lava contrast. The maul's existing locked-arc windup brightens progressively; a visual-only stone shockwave, reused flying debris, grounded torso-compression recoil and brief impact light start at the combat motor's actual strike tick (0.14 seconds) and fade naturally through recover in training and committed replay alike. These effects never spawn gameplay projectiles, change a hit or rewrite combat history. On load these replace the original primitive surfaces in-place while all animated limbs, accessory geometry, names and combat state remain under the existing Babylon transform rig. A failed import retains the old geometry and records the failure; browser acceptance explicitly rejects that fallback. **This is a segmented GLB mesh set animated by the existing runtime rig, not a professionally hand-sculpted, skin-weighted character with embedded GLB animation clips.** Visual approval against the accepted concept and a later unified skinned character remain open.
  - **Approved art source:** [Ashen Tunnel Mauler character turnaround and attack concept](assets/ashen-tunnel-mauler-concept.webp). The repository artwork is a *visual target*, not a rigged 3D asset.
  - **Level 6 combat fairness (CURRENT):** New battles use a deterministic, recorded 60 Hz duel with **imperfect**, class/stat/tactics-seeded reaction reads: correct dodges and timed sword parries can prevent real hits, while hesitation and premature defense allow Cave Troll blows through. Standard and slam hits are dangerous even against armor. Ordinary navigation still steers inward, but an occasional poor dodge near the molten ledge can go outward, take one bounded 12-HP lava contact and recover inward; knockback can also reach lava. No repeated damage from one roll and no arbitrary instant-kill roll. The troll now attempts its signature **grab** on roughly 59% of eligible close-range attacks (a seeded chance plus every fourth attack as an attempt, not a guaranteed capture), tracks the hero only during the first 0.65s of its windup, and then locks the final attack lane to preserve real spatial escapes, dodges, parries and occasional agility breaks. An unsuccessful reach enters its own brief **grabMiss** retraction, never an empty-hand throw animation. Successful catches use a deliberate 1.20s warning, 1.25s grab/lift, 1.55s throw/release and 0.90s airborne flight, all from one authoritative 60 Hz timeline. A successful grapple suspends hero actions and throws them outward with a fixed-tick trajectory; landing deals 42 raw HP damage (34 HP to a sword-and-armor tank after mitigation), plus one capped 12-HP lava hit only when the real flight reaches the molten boundary. Actual contact, parries, early mistakes and final outcomes remain deterministic. No scripted kill or forced win. The 280-HP boss, readable windups and actual heal opportunities remain; final encounter outcomes are earned, not forced. Historical saved fights are never re-resolved. These adjustments do not recompute already saved encounters; their historical boss HP and outcomes remain authentic.
  - **Level 6 spectator HP / damage HUD (CURRENT):** compact world-anchored health bars over the real hero and Cave Troll; floating numbers only for real recorded/direct combat cues. Gold = hero damaging the boss, red = boss damaging the hero, orange = lava, green = healing. Historical lava events without an actual saved amount display only `LAVA!`, never an invented number. Hidden until the intro ends.
  - **Boss soundtrack (CURRENT):** The Level 6 Cave Troll preview and recorded boss fights play **Desperate Measures** (female wordless vocals), loaded from `public/audio/desperate-measures.mp3`. The shop retains **The Lean Season** and the dungeon viewer currently retains **Beneath the Surface**. A **13.5-second cinematic introduction** presents the arena, troll, lone hero and boss before playback or training simulation begins on the first musical impact. The camera follows the actual audio playhead where available, falling back to wall time if muted/blocked. Space/Enter skips to the combat downbeat; V/Escape returns to the shop. Audio and cinematic timing never alter combat ticks, persisted events or replay outcomes. When entering the V arena, the existing two audio sliders temporarily default to **16% Music / 40% SFX**. Changes within that arena session stay local; exiting restores the previous independently persisted shop music and SFX volumes. The arena preset does not alter mute state; mute toggles still use their normal persistent behavior.
- **Level 6 Tripo combat trial (CURRENT, NOT APPROVED ART):** A Level 6 spectator toggle selects the experimental skinned Tripo Troll from a **14-clip combat GLB** prepared locally at build/dev startup: the existing checked-in 12-clip curated GLB plus only the two 65-bone animation tracks from the owner's root-level \`tripo_convert_ad846d87-3b98-4c37-a128-20fc302b37c7.glb\` (\`grab_hero\` and \`throw_hero\`). The 12-clip original and Model Lab are retained. `tripoCaveTrollVisual.ts` samples walk, idle, windup/strike/recover, stagger and death from the existing live/replayed phase ages; the original segmented boss remains default and acts as a visible import-error fallback. Following player screenshots showing a backward-facing troll, stuttering backward skating, air punches and late-looking dust, the experimental renderer removes an erroneous 180° GLB pivot, samples a stabilized distance-driven walk and uses the actual two-handed overhead strike motion for all swings. The contact frame was measured from the model wrist animation and aligns with the unchanged 0.14 s motor hit and existing dust ring. The provisional stone maul was rejected after player tests because it floated between the hands and penetrated the ground; it is now **removed from the Tripo trial**, which instead uses bare-fisted overhead smashes. Its original legacy counterpart retains its older hammer. Weighted 0.19-second Babylon animation cross-fades soften pose switches, and turn-induced footsteps stop a completely planted-foot spin when the hero circles. The experimental Tripo renderer now reads the **actual animated left-hand palm, thumb, index and middle finger world transforms** after every pose sample. From successful contact until the exact throw-release tick, the shared hero model's torso is anchored inside the moving finger pocket and its rotation inherits the hand's wrist movement; the released hero travels continuously from that exact hand position to the motor's real landing, without shifting the collision/HP path. The 5-second source clips are retimed so the contact and release match the actual left-hand extension and overhead pose. This finger binding and its visual lift/flight are presentation-only (the segmented legacy renderer has no skin-weighted finger socket); the new authoritative grab/throw combat rules independently determine contact, flight, HP and real outcomes. Dedicated unarmed attacks and true positional circling remain OPEN; visual quality and foot planting still require owner approval. Newly recorded v1 replays may carry the strictly validated optional \`attack: grab\` frame tag and new grab/throw cue kinds; historical v1 frames remain byte-for-byte compatible and are never re-simulated. Existing sample grunts, hurt, fist swing, impact and lava audio are reused; no new SFX asset is needed. The owner still needs to visually judge the new attacks.
- **Level 6 sound effects (CURRENT, hybrid):** Eleven owner-reviewed Cave Troll MP3 one-shots now ship under `public/audio/sfx/cave-troll/` and replace six former synthesized cue branches: intro roar, windup grunt, footsteps, fist swing, ground impact and boss hurt. Two grunt and three hurt variations cycle using presentation-only counters. Normal punches use short swing/impact takes and motor-flagged slams use the heavy takes, each with a capped, softly faded playback window. The roar remains score-triggered at 5.9 seconds in the same 13.5-second cinematic; footsteps use real visible travel, impact uses actual motor cues. Breathing, stagger, death, Hero, World and quiet lava-bed cues remain original temporary Web Audio synthesis; unrelated checkout sounds retain their existing synthetic feedback. Effects have independent SFX on/off and gain, rudimentary spatial attenuation and stereo pan. All audio remains separate from combat, economy, RNG and saved replays.
- **Training-only SFX Lab (CURRENT):** The unsaved V training preview keeps source (Hero/Troll/World) and family (Voice/Movement/Melee/Ranged/Magic/Environment) Solo/Mute filters, a 19-cue audition list now marked MP3/synth, and recent trigger/filter/throttle/availability status. Repeated auditions cycle sampled takes. Filter state resets on leaving training and cannot modify music, combat, GameStore, or recorded replay results. Global SFX and music preferences persist independently.
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

## 5. V.003 ALPHA — The Living Dungeon (APPROVED DIRECTION, NOT CURRENT)

The owner has designated **The Living Dungeon** as the next major redesign
and the target for **V.003 ALPHA**. Full scope, proposed contracts, open
parameters and release gates: [The Living Dungeon design](THE_LIVING_DUNGEON.md).
This does **not** declare an implemented system or a shipped version.

**Direction accepted:**

- **One persistent, seeded, shared dungeon**, rather than unrelated Floor 1–4
  daily RNG outcomes, a special Floor 6 progression path and separate Floor 7
  exploration. Individual heroes and possible groups travel, discover,
  revisit, progress, recover or flee; the same world's rooms, enemies and
  resolved unique features persist. **Dungeon floor** and **hero level/XP**
  represent different kinds of progression. **Remove** the old Floors 1–4
  roll-based placeholder and redundant authoritative dungeon/combat
  implementations after migration. A universal, deterministic encounter motor
  must support **both** multi-hero/multi-monster fights and boss abilities;
  retain historical replay compatibility rather than a second live resolver.
- **Autonomous two-layer hero decisions, not merchant commands.**
  Short-term, heroes choose **stay / go deeper / go higher**. Medium-term,
  they pursue real goals like farming money on easier floors, testing
  newly bought gear, cautious survival, or progressing when strong enough.
  Their current HP, equipment, class, personality and danger inform those
  decisions without eliminating reckless choices. Real sale/credit and
  consumable usage influence genuinely recorded outcomes. Galvik still
  operates the shop, not the party's movement and combat controls.
- **Three recognizable progress tracks:** persistent dungeon discoveries and
  depth, hero survivorship/leveling/relationships, and shop goods/demand/
  revenue/expansion. A substantive ten-day vertical slice should make these
  visible through returns, true combat replays and meaningful new decisions.
- **Regenerative dungeon ecology:** permanent seeded floor geometry, discovered
  paths, story encounters and unique boss victories **remain persistent**.
  Ordinary monster groups, valid common treasure sites and resettable traps
  **repopulate after staggered in-world intervals** (stored site/cycle state).
  Farming earlier floors remains possible with bounded loot and danger.
  Respawn cannot duplicate a past reward, appear in an occupied encounter,
  silently resurrect a unique boss, reveal unseen contents on the Board or
  bypass a hero's Floor 10 pass. Exact cooldowns remain balance parameters.
- **Adventurer Board 2.0 is a central feature**, reusing the existing physical
  movable board and E/R roster. Both glance and expanded presentation keep
  numeric current/known **HP**, **character level**, **floor**, **current or
  last known intent**, **real weapon/armor item sockets** (including conspicuous
  empty slots) and the existing **item icons with consumable quantities**.
  Morning/Midday/Evening present stored intent/activity/floor snapshots,
  supported by a dungeon-depth map, party markers and hero detail/history.
  Warnings such as unarmed/low HP are honest information, not automatic orders.
- **No fabricated causality or omniscience.** The player can see a bought Herb
  genuinely heal a recorded fighter, or armor mitigate a real blow, but the
  UI must not invent an unseen event, predict certain survival or expose
  sealed results. A missing hero is *last known / unknown* until reported.
- **Initially retain a shop-day structure**, with morning/midday/evening
  expedition phases as the design target rather than silently committing to a
  free-running 24-hour simulation. **After leaving the shop**, a hero spends
  **two complete game days off duty**, neither in the dungeon nor in the
  shop, before being eligible to return. Replays remain immutable. Any save
  migration or altered day clock must be deliberate and tested.
- **Small first chapter rather than fake 100-floor coverage:** investigate a
  playable first ten-floor vertical slice with the Cave Troll as a likely
  later chapter boss. Current Floor 6/7 recordings remain truthful history.

**Approved V.003 special-floor/shop access direction (NOT CURRENT):**
Galvik's shop is **not a numbered dungeon level**. The current separate
Floor-4 and Floor-6 shop entrances are to be replaced by **one large cursed
portal** for all arriving/departing heroes. Heroes can decide to **abort
an expedition from any floor when choosing an upward floor transition**,
enter the same shop, buy/sell as real customers, then leave to spend
**two complete days off duty** in the outside world. No full-dungeon
backtrack, arbitrary every-five-floors access rule, duplicated shop
instances or instant reentry into the just-abandoned fight. After standby
they may start a new expedition; the safe return/reentry anchor is OPEN.
All new shop gate/queue/furniture reachability must be rebuilt for one
physical portal, without silent legacy two-entrance assumptions.

**Temporary Floor 10 restriction (APPROVED TARGET, NOT IMPLEMENTED):**
Level 10 remains inaccessible to an individual hero until **Galvik grants
that hero a pass**. The permit mechanic may be redesigned later, but the
restriction itself remains in the first V.003 chapter. Today's different
`level6Permit` gameplay remains CURRENT only until migrated. Moving the
Cave Troll to Floor 10 is a separate still-open placement choice.

**Still OPEN within that direction:** exact room count and floor geometry,
day-phase triggers, group formation rules, regenerative-site timing,
loot tables and economy balance, shop-portal visual/lore, post-standby
safe reentry anchor, downtime HP recovery, later Floor 10 permit redesign
and possible Troll placement, mana/class resource model, new supply chains,
economic balance, visual asset reuse, full real-time progression and curse lore.
They remain proposals until worked through and approved.

**Out of scope for this milestone:** basement forge/pond implementation,
full Floor 100, hunger, a protagonist switch or an engine rewrite.
The recently merged experimental 14-clip Tripo Troll renderer and real
grab/throw are CURRENT as a **trial**; appearance and timing still require
the owner's actual visual acceptance. The old segmented renderer remains a
fallback. They are not evidence that the Living Dungeon itself exists.

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
