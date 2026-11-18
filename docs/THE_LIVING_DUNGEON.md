# The Living Dungeon — V.003 ALPHA design target

> **Approved direction, not implemented gameplay · 2026-11-18.**
> Dungeon Shop Master's next named milestone is **V.003 ALPHA — The Living Dungeon**.
> The existing published build still displays **V.002 ALPHA** and the npm package
> still has independent metadata `0.1.0`. Do not bump the in-game release label
> or claim V.003 is playable until its release acceptance gates are met.
> Current code/tests and the Game Bible govern implemented mechanics; this
> document governs the **agreed design goals** and identifies proposals to test.

## Why we are changing the dungeon

The intended game is **a shopkeeper's indirect influence on a living dungeon**,
not a disconnected shop game plus a linear boss minigame. Galvik runs one physical
shop. Customers remain autonomous heroes, not the player's units. The player's
merchandise, availability, credit and service influence their **real inventories**,
which influence their **actual decisions, combat outcomes, survival and progression**.
The player can recognize that causal chain from observable returns and recordings.

### Non-negotiable gameplay loop

1. **Prepare the shop:** choose stock, buy wholesale, place goods, manage space,
   serve distinct customers and decide whether to extend credit.
2. **Heroes prepare autonomously:** choose affordable and useful purchases,
   make plans, find companions, depart or reconsider. Galvik does not assign
   party members, routes or attack commands.
3. **Expedition:** persistent individual heroes (and optional small parties)
   explore a single shared seeded world. A short-term navigation choice
   (stay, descend or ascend) follows their medium-term purpose (farm money,
   test new gear, explore, progress cautiously, recover, avoid overpowered
   enemies). On an **upward floor transition** they may end the expedition
   and enter Galvik's cursed shop regardless of dungeon depth.
4. **Shop visit and outside-world rotation:** purchase, sell, seek credit
   and then depart via the *same* portal. After leaving the shop, the hero
   spends **two complete game days outside both shop and dungeon** (e.g.
   village, family, rest), then may start a new expedition.
5. **Observe legitimate consequences:** morning/noon/evening board snapshots,
   returning characters, discovered information and committed recordings reveal
   what the player's goods did. Unknown/offscreen outcomes remain unknown.
6. **Advance all three progress tracks:** deeper access and altered dungeon
   rooms, surviving/leveling heroes, a richer shop with new demand and choices.
   Every day should present an understandable next decision, not just +1 day.

**Success criterion:** a player who sold a Healing Herb, weapon or defensive item
can later identify an authentic recorded use/hit/defense (when observed) rather
than being shown a fabricated "your purchase saved them" reward. A ten-day
campaign should visibly change all three tracks while preserving failure risk.

## Delivery checkpoint (CURRENT vs planned)

**Implemented in code (as of this feature branch, pending merge):**

- Floors 1–4 and 7 share the same seeded spatial walker,
  ordinary enemies/loot/traps, deterministic site regeneration
  and saved real group fights. The old 1–4 RNG placeholder is deleted.
- Every new fight uses the common `combatEncounter.ts`
  fixed-step actor/projectile/outcome pipeline and replay
  recorder. Ordinary enemies and the Cave Troll share HP/
  healing, melee contact, movement, action clocks, tactical
  decisions and swept projectile collision.
- `combatActor.ts` unifies the **live mutable actor contract**
  and phase/resource lifecycle. `GroupActor` implements
  it directly; the Troll and boss hero use live state adapters
  with no duplicated HP, position, stamina or phase.
- Existing boss grab/lift/throw and Tripo presentation
  are still physically simulated; historical group-v1 and
  boss-v1 replays stay immutable. Save version 13 remains.

**Current engine extension (after this PR merges):** multi-hero boss
encounters are now executable through the **existing group
engine**, with a reusable, resistible, telegraphed
`grapple-throw` ability and actual armor-mitigated flight/
landing. The single-hero Troll cinematic uses the same
authored grapple timing and geometry helpers; its old v1
replays remain intact. **This is not yet an in-campaign
multi-hero boss fight or a multi-hero Troll presentation**.

**Next tested integration (after this PR merges):**
the existing 3D dungeon replay viewer renders all saved group
actors and projectiles from the same immutable combat frames,
with spoiler-safe focus. On Floor 7, some later-generation room
sentries now fight as genuinely stronger, resistible grapple/throw
elites in the actual solo expedition day and receive real
recorded loot/XP accounting. They are renewable monster sites,
not unique boss kills, and use no new replay/save version.

**Current limited cooperative slice (after this PR merges):**
willing co-located heroes can travel together for one committed
day on Floors 1–4/7 and genuinely fight the same encountered
monster with their own HP/Herbs, a single shared world-site
claim, finite split gold and individual saved replay POVs.
New replay actor specs retain historical Iron Sword/Leather Vest
ownership for every participant's 3D model, without looking up
the current roster or changing previous v1 recordings.
An optional saved relationship now retains willing co-located
groups across several days and *unanimous* already-supported
floor transitions, provided all surviving members still share a
genuine destination tile. They independently choose strategy;
separation, dissent, shop departure and casualty may dissolve
the group. No player-issued party command, second combat motor,
fabricated teleport, duplicated treasure or new save version.
The current physical Adventurer Board displays saved party sizes.

**Not implemented:** long-term party negotiation/leadership,
party-vs-unique-Troll campaign encounters, fully general status/
ability effects, dungeon Floors 8–10, cursed out-of-number
shop entrance, two-day hero standby, full Morning/Midday/
Evening world snapshots or Adventurer Board 2.0.
The old Floor 6 boss progression remains separately routed.

**Release label:** V.003 Alpha is the **future milestone**.
The playable game still identifies as **V.002 Alpha**.

## Dungeon, heroes and pace

### One shared dungeon rather than three incompatible mini-simulations

- Replace the isolated Floors 1–4 daily outcome rolls, Floor 6 special-case
  progression and Floor 7-only spatial exploration with **one authoritative
  expedition progression model**. Reuse the current seeded floor generation,
  persistent Level 7 exploration and group combat where appropriate; do not
  clone an independent second simulation.
- Each campaign's floors/room connections are determined by the campaign seed
  and persist for the save. Distinct rooms, corridors, traps, monsters, chests,
  routes, shortcuts and gates have **shared** world state. Geometry, discovered
  routes, milestones, individually gated access and **unique boss victories**
  persist, while ordinary encounter sites are **renewable through deterministic
  Dungeon Regeneration** (specified below). Do not treat all looted chests or
  defeated common enemies as permanently cleared.
- Draft target: the **first ten floors as one playable vertical slice**, with
  roughly **6–10 meaningful locations per floor**, not 100 empty maze floors.
  Room count and floor geometry are provisional balancing numbers, not canon.
- Reaching a lower floor requires an actual discovered/reachable route or
  cleared obstacle. "Floor number" is *dungeon depth*, independent of hero
  **character level and XP**. No automatic floor-up based on XP or day count.
- Each hero has persistent location, exploration knowledge, carried gear,
  consumables, HP, suitable skill resources, intent and expedition history.
  Heroes can travel in small parties or split up as behavior and danger dictate.
  A defeated/surviving party must update the same world and real inventories.
- No random instant-kill table, hunger meter or arbitrary scarcity kill.
  Death follows authoritative damage reaching zero HP; escape and healing are
  real choices. Failure, caution and losses remain possible.

### Dungeon Regeneration — APPROVED V.003 DIRECTION, NOT CURRENT

The dungeon is a **persistent place whose ordinary contents regenerate over
time**. Players and heroes can revisit/farm earlier floors; exploration is not
a single finite clearance checklist. Respawns are actual authoritative world
events rather than visual resets or rerolled old fights.

**Permanent and nonrenewable:**

- Floor geometry, fixed stairs and routes, confirmed maps, unique major
  discoveries, story progress and defeated one-off bosses remain persistent.
  The temporary **per-hero Floor 10 pass** is not lost or bypassed by a
  refresh. Unique quest objects and story treasures do not duplicate.
- Historic kills, purchased items, earned loot, XP, deaths and immutable
  encounter replays are never undone or replayed by regeneration.

**Renewable normal contents:**

- **Ordinary monsters:** population/encounter sites replenish after
  time, with variety in creature types, group size and bounded strength
  appropriate to that region. A room can be safer just after clearing and
  threatening again later; rare wandering/elite spawns are possible at
  lower frequencies.
- **Ordinary treasure:** eligible sites may generate a *new chest with
  genuinely new loot* after a cooldown. Previously looted chest instances
  remain historically looted, not mysteriously "unlooted" in existing
  records. Rare permanent/story treasure stays one-time.
- **Traps:** reusable mechanisms may reset; new ordinary traps can occupy
  valid predefined/hazard-compatible sites after a longer/different
  interval. A recorded triggered trap is not retroactively reset.
- **Optional ambient changes:** camps/patrols, local hazard intensity and
  small resource nodes can rotate without restructuring the permanent
  dungeon map.

**How to schedule safely and predictably:**

- Regeneration is calculated **per room / encounter site**, not a single
  globally synchronized "all levels reset at midnight" action. On a
  committed shop-day/expedition phase, an eligible site's saved cooldown,
  elapsed world day and generation counter determine whether a *new*
  population/treasure/trap generation spawns.
- Seed variants from the **campaign seed + floor + stable site ID +
  persisted regeneration cycle**, independently from camera/viewer RNG.
  Persist the generated instance IDs, cooldowns and last-resolved times so
  reloading, switching spectator scenes and repeating the same projection
  never generates extra gold, monsters or chests.
- Never respawn on top of an occupying hero/party, in a currently observed
  combat, or as an unexplained sudden apparition in their visible room.
  Defer eligible refresh at occupied sites until a safe unoccupied phase;
  don't double-spawn afterward.
- Reappearance does not mean easy free money. Reward volume, per-site
  cooldown, difficulty, risk, injury, consumable costs and hero decisions
  must keep **safe lower-floor farming** viable but not economically dominant.
  Do not nerf merchant demand by making every hero self-sufficient.
- The Board/dungeon map may show *last confirmed clear* or *last observed
  activity*. It must **not automatically know** that a room has regenerated
  when no hero has discovered the new contents. Actual fight, chest opening
  and trap damage are only shown from recorded/known events.

**Initial tuning hypothesis (OPEN, not locked):** ordinary monster sites
could replenish roughly every **2–4 in-game days**, common chest sites
less often (e.g. **4–6 days**), while trap reset windows vary by trap type.
Different sites should stagger their schedules. These values require
seeded ten-day playtests and may change; no fixed guaranteed reward every
N days, no guaranteed rare chest and no entirely safe permanent farms.

**Acceptance:** clear a common site, save/reload, advance several days,
then verify a new deterministic encounter/chest/trap can appear there or
at another eligible site without changing the map, duplicating old loot,
reviving a unique boss, bypassing a Floor 10 pass or leaking unseen facts.
Two independent heroes must encounter the **same actual generation** of
that site and be unable to claim the same one-time chest twice.

### Explicit retirement of the old simulation/combat islands

**Mandatory implementation goal for V.003, not already done:**

- **Completed for Floors 1–4:** deleted `dungeonSimulation.ts`
  and replaced its daily damage/advance rolls with the same actual
  `simulateSpatialDungeonDay` navigation, shared encounter, regeneration,
  inventory, HP and replay path as Floor 7. Hero strategies decide
  floor movement/return using real recorded states.
- Eliminate **parallel authoritative combat resolvers**. The existing
  `arenaCombatMotion.ts` has valuable real-time telegraphs, parry/dodge,
  stagger, boss-specific grab, hit and damage semantics, while
  `groupCombat.ts` already supports multiple actors and projectiles.
  Design a **single deterministic encounter motor** that supports both
  normal multi-actor fights and configurable boss abilities. Reuse proven
  mechanics from both; do **not** simply replace group fights with the
  current one-on-one boss controller.
- Retire `level6Combat.ts`-only progression and
  `level7Exploration.ts`-only expedition ownership as separate current
  gameplay paths **after** their behavior is integrated into the unified
  world and combat authority. Remove dead code, redundant entrypoints,
  obsolete fixtures and stale docs, not just add a fourth new path next to
  the old three.
- Keep old *committed replay records* valid even if legacy simulation and
  visual adapters survive only as explicitly bounded, read-only
  compatibility renderers. Never use legacy outcome code for new runs.
  Preserve the Tripo Troll assets/skills and training tooling without
  preserving a separate live combat RNG/HP authority.
- Verify by search/tests that new Floor 1–4 combat and boss encounters
  commit through the same engine; no dormant import, debug toggle or
  day transition should silently invoke a removed simulator. Enforce
  exactly-once HP, item consumption, loot, XP, sales and deaths.

### Two layers of autonomous hero decisions

**Short term (at each meaningful expedition/navigation decision):**
`stay` on the current floor, `descend` one dungeon floor, or `ascend`
one floor. When choosing an upward transition, a hero can instead finish the
expedition and enter the **cursed shop instance**, from any dungeon depth.
The ascent/abort decision is a **choice**, not forced by floor count, no
all-floor backtracking required and no free in-combat teleport. A deeper gate
that is not unlocked cannot be passed, even by a high-level hero.

**Medium term (planning across successive phases/days):** the hero forms
a goal from its actual condition, temperament and equipment; e.g. "I need
gold, farm safer floors", "I just bought a sword, test it", "I'm under-equipped
and should be cautious", "I am strong enough to progress", "these enemies
are too dangerous, leave", or "find a healer/group". A medium-term goal
biases successive short-term moves and supplies purchase intent, but may
change after a serious injury, new loot, death of an ally or a newly
discovered route. Character level/XP and dungeon floor are separate.

**Observable activities (not a second decision-making AI):**

- **Farm:** revisit known **renewable** reward opportunities for modest income
  or supplies; capped and risky enough not to replace shop purchases.
- **Discover:** explore uncertain paths, map rooms and seek hidden routes.
- **Progress:** deliberately aim for a deeper gate or challenge.
- **Fight:** engage a physical encounter or defend against one.
- **Flee:** seek safety after a dangerous situation; can fail and costs time.
- **Recover:** use legitimate restorative items/resources and take a safer plan;
  never a disguised hunger mechanic.
- **Group:** join/travel with allies when compatible; roles affect cooperation.
- **Shop:** following the hero's upward-transition/expedition-abort choice,
  visit Galvik and autonomously evaluate prices, needs and available
  goods rather than following player orders.
- **Off-duty:** after physically departing the shop, spend two complete game
  days outside **both** the dungeon and Galvik's shop before expedition
  eligibility resumes. This is not a shop customer's waiting timer, nor an
  HP hunger mechanic.

Decisions reflect personality (careful/reckless/greedy), level, HP, relative
enemy threat, carried consumables, class role and party state. Avoid purely
cosmetic intentions. UI must distinguish **intention** (what the hero is trying)
from **observed action** (what actually happened). A reckless unarmed hero can
choose to push too deep and face consequences; the Board may warn but must not
silently veto that decision.

### Time and deterministic recording

- **Initial design: retain shop days**, with **Morning, Midday and Evening**
  as three explicit expedition snapshots/commit windows. This is a design
  target, not a claim of continuous runtime. Actual timing relative to the
  physical shop day and bed transition must be established without replay
  spoilers, double-settlement or time-dependent frame-rate results.
- Only one authoritative engine advances the world and consumes the relevant
  seeded RNG. Resolve events **once**, store them and show read-only board,
  ledger, combat and exploration views from those committed events. Camera,
  focus, reload or opening the board must never advance/roll the dungeon.
- A single expedition can last across several days and snapshots. There is
  **no forced return to Floor 4/5** and no traverse-all-floors return trip.
  A hero leaves by a deliberate upward-transition/shop choice from their
  current depth; commerce is real and free restocks are forbidden.
- Shop visits and **outside-world standby** are explicit, mutually exclusive
  lifecycle states. **Two full days after physically leaving the shop** are
  spent away from the shop and away from the dungeon. Example: exit shop on
  Day 4, away Days 5 and 6, eligible for a new expedition from Day 7.
  Board snapshots display off-duty/last known accurately. The exact
  moment of arriving at/departing through the shared portal follows the
  deterministic day-phase contract; no extra sale or customer spawn.
- Preserve the hero's personal deepest floor and dungeon discoveries across
  visits. A proposed re-entry rule is a **safe known entrance/checkpoint on
  the last reachable depth**, not a teleport directly into the last fight
  room. This precise placement, any injuries recovered while away, and
  how parties resume are still balancing decisions. Standby does not by
  itself confer full free HP or inventory replenishment.
- Player knowledge is separate from truth: a spell-bound board **might**
  report rough location/activity (accepted as design direction for the Board)
  without identifying every item, secret room or instantaneous death. Unverified
  heroes become **last seen / no signal** instead of retrospectively labeled
  "dead" before the result is legitimately discovered.
- Saved Level 6 and Level 7 recordings and past combat results are immutable.
  A compatibility/migration plan must be defined before replacing persisted
  schemas. A new live run must not alter previous recorded footage.

## Merchandising with real combat consequences

The first slice should make the current six stock items meaningful **before**
building a huge item tree:

| Shop item | Proposed authoritative effect |
| --- | --- |
| Healing Herb | Real +18 HP when needed, in or between encounters; decrement owned supply and log the use. |
| Waybread | Cheap +8 HP for smaller wounds; **not** hunger/food survival. |
| Mana Potion | Refill a limited hero class/ability resource enabling a tangible extra spell/heal; specify resource storage and balance during implementation. |
| Iron Sword | Apply actual combat damage/reach contribution and affect encounters rather than just a descriptive score. |
| Leather Vest | Reduce recorded incoming damage from appropriate attacks/traps. |
| Iron Ore | Make meaningful via a future repair/smithing/order use, **not** pretend it currently has a combat effect. If no use is ready, do not pressure heroes to buy it artificially. |

- Carry item quantities from **real paid purchases or real credit**, through
  preparation, expedition, depletion and return. Merchant income never comes
  from unpaid carts or credit alone; no automatic free gear.
- A causal chain must be inspectable without inventing counterfactual certainty:
  "Bought herb on Day 4 → used +18 HP in recorded combat → survived with 6 HP"
  is valid; "would certainly have died without Galvik" is not guaranteed unless
  a precise counterfactual was actually proven.
- New or deeper regions alter **demand**, income opportunities and obtainable
  supplier goods. Balance gold sinks, loot supply and danger so farming cannot
  erase shop economics. No forced hero success to keep the merchant profitable.

## Adventurer Board 2.0 — core feature, not a side HUD

Preserve the **physical, placeable wall-mounted Adventurer Board** and existing
**E / R** access to its expanded roster. Rework its projection, not create a
new independent roster/state owner.

### Two scales of information

1. **Physical board in the shop:** glance-readable hero portraits/identities;
   current or **last known** dungeon floor; one clear intent/activity symbol;
   compact three-phase day trail, **visible HP meter with current/max values**,
   and actual **item-atlas icons** for weapon, armor and carried consumables
   with counts. Keep empty weapon and armor sockets plainly visible.
2. **Expanded E/R board:** scannable Morning / Midday / Evening columns,
   scroll/filter/sort by hero, floor, group, risk, last contact and status;
   a compact vertical dungeon-depth overview with hero/group markers;
   hero detail card with equipment/HP/level/intent, actual item acquisition,
   uses, last confirmed reports and links to **available verified** fight/
   exploration replays. Portraits move across floors only when real events
   resolve. It must remain readable for many heroes, not become a wall of text.

**Activity language:** farming, progressing, discovering, fighting, fleeing,
recovering, grouping, shopping, missing/unknown. Each icon has accessible
text and must map to an actual committed action or genuine intention.
Use the existing `ui-interface-icons.svg` (extend deliberately if needed)
and `ui-item-icons.svg` for equipment and consumables; **no emoji-based
production interface, no duplicate atlas**.

### The point of the display

A glance should make the player think, "That idiot has **no sword**, half his
HP and one loaf of Waybread, yet he's heading into Floor 6." Therefore:
- HP, level, floor, current goal and **empty gear slots** must be visible
  without expanding a card, not buried under a tooltip.
- Actual weapon/vest/Herb/Waybread/Mana Potion icons and quantities remain
  visible on both scales as space permits; use a compact priority/overflow
  strategy on the physical wall. No invented carried item counts.
- Warnings such as "unarmed", "low HP", "no healing" or "dangerous depth"
  are **informational**, derived from known values. No synthetic guaranteed
  death odds and no automatic hero-course correction.
- A three-phase cell shows reported floor, action **and information recency**.
  Never use future state to fill morning retroactively, reveal sealed
  recordings or make a missing hero visibly dead before that is known.
- Board opens are read-only and do not alter combat, RNG, movement, purchases,
  money or saved replays. Text labels and keyboard access must work without
  pointer lock; keep the existing mounted-board placement and collision.

### Suggested minimal example (illustrative, NOT a real save)

| Hero | Morning | Midday | Evening | Readable gear |
| --- | --- | --- | --- | --- |
| Bram, Lv 6, 42/55 HP | F6 fighting | F6 ascending | At cursed shop | Sword, vest, Herbs ×2 |
| Finn, Lv 4, 19/45 HP | F7 farming | F8 discovering | F8 fleeing | **No sword**, **no armor**, Bread ×1 |
| Eira, Lv 5, 38/43 HP | Off duty | Off duty | Off duty | Vest, Herb ×1, Mana ×2 |

The table is a target **shape**, not three simulated example outcomes.
"At cursed shop" is a **special-floor state**, never a numbered F5 tile;
"off duty" is a complete day outside both dungeon and shop. Actual labels
must honor the three committed phase snapshots and protected knowledge.

## First chapter, cursed shop instance and one entrance

**Approved V.003 direction (supersedes all Floor-5-location and return-path
proposals in earlier planning):**

- **Galvik's physical shop is a cursed SPECIAL FLOOR**, outside the
  numbered dungeon progression. Its sales floor, bedroom, excavated areas,
  furniture and inventory are one shared persistent space. It is no longer
  "on Floor 5". Numerically counted dungeon floors contain exploration
  rather than a compulsory mid-run merchant level.
- **One large cursed gateway** replaces the present separate Floor 4 and
  Floor 6 entrances to the shop. All entering and departing adventurers
  use the same supernatural portal and must still obey queue/traffic,
  player-access and shop-layout collision checks. Visual direction to
  explore: an ominous swirling instance-style vortex with rune/light
  ambience, **not** a final art asset or approved exact appearance.
  Do not build one physically duplicated shop for every dungeon floor.
- **Any-floor shop access is conditional on a hero deciding to ascend:**
  after choosing to move up from their current dungeon floor, the hero
  may instead end the expedition and go directly to the cursed shop.
  They do **not** have to backtrack from Floor 8 to Floor 5. Choosing
  stay, deeper, or higher normally still changes real floor/position.
  Ending an expedition does not let a hero teleport out mid-attack.
- **Two-day post-shop absence (approved balancing direction):** when
  a hero physically leaves Galvik's shop, they spend the next **two
  full game days** away from both shop and dungeon (town, family, holiday,
  etc. are narrative labels, not a separately simulated village).
  Their avatar cannot instantly reappear at a shelf or dungeon fight.
  They may start another expedition afterward, retaining character
  advancement, gear, legitimate supplies and recorded discoveries.
  This rotation creates a natural flow of returning and absent customers
  without arbitrary "you can shop only every five floors" rules.
- **Return location proposal:** resume at a safe known floor-entry/anchor,
  not the last combat coordinate, with no hard reset of explored dungeon
  topology. Exact anchor selection and whether/how HP recovers during
  outside-world days remain OPEN and need economic/balance tests.
- **Floor 10 progression is BLOCKED until Galvik grants that specific
  hero a pass.** Treat this as the accepted temporary gate rule for
  the first chapter, regardless of that hero's strength or discoveries.
  The owner intends to redesign the permit system separately later.
  The *current implementation* uses a different `level6Permit` flag
  for Floor 6, so the V.003 design must explicitly migrate/replace the
  permit gate; never call the new Floor 10 restriction implemented.
- The **Cave Troll is a possible boss around Floor 10** in the new chapter.
  Floor 10 pass gate and boss placement are distinct questions: the
  former remains blocked pending a player-granted pass, the latter is
  not final until approved. The original Floor 6 audio, Tripo rig,
  grab/throw skills and immutable old fights remain valuable components
  for the unified encounter motor.
- The shop's single entrance must be designed with actual NPC spawn,
  queue, movement, restock, checkout and departure throughput. Replace
  legacy two-gate route assumptions in shop navigation, furniture
  reachability, tests and visuals rather than retaining dead "Floor 4/
  Floor 6" door logic with the new portal hidden on top.
- **No escape-rope item in this scope**: the previously proposed
  emergency extraction item is not needed to make returning practical
  and is deferred. The normal ascension/shop choice already provides
  travel access; consumable escapes can be reconsidered only if
  playtesting reveals a meaningful distinct role.

**Balancing check:** leaving to shop must be attractive but not optimal
after *every* encounter. The full two-day absence and need to restart
a later expedition supply an opportunity cost. If shop visits become
rare, revisit decision weights and merchant traffic before imposing an
arbitrary floor lock. If the cooldown empties the shop, tune population
rotation and progression, **not** fake customer spawns.

**Example hero story (illustrative, not current gameplay):** Finn farms Floor
3 for gold, buys a sword on his first shop visit, spends two full days with
family outside the game world, then returns and tests it. Much later on Floor
8, he takes damage, chooses to ascend, elects to end his expedition at
Galvik's special-floor portal and buys herbs. During the next two days he
is visibly **off duty**, not simultaneously counted as dungeon-active or a
shop customer. He remains personally blocked from Floor 10 until he receives
Galvik's pass.

Expansion of Galvik's basement, forge/pond, player-controlled prices, lore
resolution and a full hundred floors are **outside the first vertical
slice** and not prerequisites to fix the expedition loop.

## Architecture work packages (planned, no PR numbers reserved)

1. **World schema and contracts:** enumerate authoritative floor, room,
   feature, path, per-hero position, party, short-term floor direction,
   medium-term purpose, personal deepest depth, **cursed shop instance**,
   shared portal entry/exit, two-day off-duty states, per-hero Floor 10
   permit, **per-site regeneration schedules, cycle counters and instance
   IDs**, three-phase snapshots, knowledge and immutable event/replay records. Define v13 save compatibility
   or an **explicit, tested** migration before changing schemas. Keep live and
   known snapshots separate.
2. **Shared explorer + regenerative sites:** incrementally replace
   `dungeonSimulation.ts` Floor 1–4 coin flips with seeded navigation/
   encounters built from existing `dungeonLayout.ts`,
   `level7Exploration.ts` and `groupCombat.ts`. Each regular encounter,
   chest and trap site can regenerate via one deterministic saved cooldown/
   cycle, with occupancy protection and shared multi-hero ownership.
   Boss/quest milestones never reset. No 100-floor rewrite.
3. **Items and economy:** wire every ready-to-sell item to real persisted
   inventory and recorded fight/use logic; implement class resources only
   when fully specified. Check cash/credit/stock conservation and repeated
   day transitions.
4. **Board vertical slice:** move `rosterBoard.ts`, `rosterBoardHud.ts`,
   `rosterView.ts` onto one read-only snapshot projection. Show three
   phases, true/last-known status, HP, visible equipment sockets/icons,
   short direction, medium-term goal, **at shop / off duty / dungeon**,
   personal Floor 10 gate, and depth markers. Reuse mounted board/roster
   controls.
5. **Unified combat + observation:** expand reusable group combat with
   monster/boss skills, align actual item effects, generate and **keep**
   immutable replay metadata, and expose honest viewed recordings.
6. **Playable first chapter and one portal:** content/encounter pacing for
   Floors 1–10, real ascending/abort/shop/standby/new-run rotation, one
   physical swirling shop entrance replacing both old doors, the hero-specific
   Floor 10 pass gate, possible Floor 10 Troll integration, economy balance,
   repeated ten-day runs and owner visual acceptance.

These are **coherent development packages**, not a mandate for six tiny PRs.
Combine tightly coupled contracts into larger, testable changes; prefer
vertical integration rather than new disconnected framework islands.

## Release acceptance: when V.003 ALPHA can replace V.002

- Fresh campaign: sale/credit → physical inventory → real expedition decision
  → real combat/item effect → board and returned-hero feedback, verified in a
  replay without invented causes or early spoiler leakage.
- The same seed, choices and phase commits produce identical snapshots,
  HP, fights, loot, gold, results and saved/reloaded state.
- A known example of an **unarmed low-HP hero heading too deep** is visible
  at a glance on the actual physical board and on its expanded view, with
  truly empty gear sockets and correct item counts.
- Multiple heroes/parties share floor changes without duplicated loot,
  kills, shoppers, debt or softlocked corridors. A dead hero does not become
  alive just because the board or shop redraws.
- **Regeneration acceptance:** common monsters/chests/traps can refresh
  after independently staggered intervals without changing permanent maps,
  unique boss kills, hero-specific Floor 10 access or saved historical
  results; an unoccupied safe site receives at most one deterministic
  generation per eligible cycle.
- The same hero can stop on any depth, choose an **upward-transition exit**
  to the **single cursed shop**, purchase goods, physically leave through
  the **single portal**, spend two **complete** days off duty and return
  later without a free in-combat escape or duplicate presence. No hero
  enters **Floor 10** unless that hero has been granted Galvik's pass.
  Both legacy floor-labeled shop doors and associated two-route layout
  requirements are retired in the new shop topology.
- Ten days of shop operation remain enjoyable and comprehensible; walking,
  furniture, cashier, excavation, save/load, ledger and training viewers
  work. A player can recognize three sorts of progress without being
  forced to study an event log.
- Automated checks stay targeted: seeded world/decision/gear/phase contract
  tests, replay/save regression, shop-economy invariants and a real browser
  Board + transaction + expedition path. Human 3D/readability checks remain
  necessary. Update current docs when each package actually ships.

## Explicitly unresolved

Exact phase scheduling within a live shop day; whether the player can observe
ongoing fights or only committed footage; number/types of rooms; thresholds
for hero joining/retreating; exact per-site respawn cooldowns, loot weights,
elite frequencies and farming balance; new mana/ability model; mystical explanation
and visual detail of the shared portal; exact safe re-entry anchor after
standby, HP recovery off duty and party-splitting semantics; eventual
redesign of the temporary hero-specific Floor 10 pass; final Floor 10
boss placement; difficulty and economy values; the game's larger curse
lore; future full real-time simulation.

**Design approval does not mean those details are final.** Prefer an
observable, grounded vertical slice before expanding the world further.
