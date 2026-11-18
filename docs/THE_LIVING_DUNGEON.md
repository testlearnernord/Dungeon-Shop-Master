# The Living Dungeon — V.0003 ALPHA design target

> **Approved direction, not implemented gameplay · 2026-11-18.**
> Dungeon Shop Master's next named milestone is **V.0003 ALPHA — The Living Dungeon**.
> The existing published build still displays **V.002 ALPHA** and the npm package
> still has independent metadata `0.1.0`. Do not bump the in-game release label
> or claim V.0003 is playable until its release acceptance gates are met.
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
   explore a single shared seeded world; encounter enemies, traps and treasure;
   choose to farm, discover, push deeper, recover or flee.
4. **Observe legitimate consequences:** morning/noon/evening board snapshots,
   returning characters, discovered information and committed recordings reveal
   what the player's goods did. Unknown/offscreen outcomes remain unknown.
5. **Advance all three progress tracks:** deeper access and altered dungeon
   rooms, surviving/leveling heroes, a richer shop with new demand and choices.
   Every day should present an understandable next decision, not just +1 day.

**Success criterion:** a player who sold a Healing Herb, weapon or defensive item
can later identify an authentic recorded use/hit/defense (when observed) rather
than being shown a fabricated "your purchase saved them" reward. A ten-day
campaign should visibly change all three tracks while preserving failure risk.

## Dungeon, heroes and pace

### One shared dungeon rather than three incompatible mini-simulations

- Replace the isolated Floors 1–4 daily outcome rolls, Floor 6 special-case
  progression and Floor 7-only spatial exploration with **one authoritative
  expedition progression model**. Reuse the current seeded floor generation,
  persistent Level 7 exploration and group combat where appropriate; do not
  clone an independent second simulation.
- Each campaign's floors/room connections are determined by the campaign seed
  and persist for the save. Distinct rooms, corridors, traps, monsters, chests,
  routes, shortcuts and gates have **shared** world state. Unique defeated
  enemies and looted one-shot chests stay resolved; renewable resources need
  explicit location/timer rules to avoid infinite free loot.
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

### Decision-making, not player-directed adventurers

- **Farm:** revisit known **renewable** reward opportunities for modest income
  or supplies; capped and risky enough not to replace shop purchases.
- **Discover:** explore uncertain paths, map rooms and seek hidden routes.
- **Progress:** deliberately aim for a deeper gate or challenge.
- **Fight:** engage a physical encounter or defend against one.
- **Flee:** seek safety after a dangerous situation; can fail and costs time.
- **Recover:** use legitimate restorative items/resources and take a safer plan;
  never a disguised hunger mechanic.
- **Group:** join/travel with allies when compatible; roles affect cooperation.
- **Shop:** visit Galvik and autonomously evaluate prices, need and available
  goods rather than following player orders.

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
- A single expedition can last across several days and snapshots without
  a forced return to Floor 4/5. Position and supplies persist. Shop visits
  remain real commerce, with no free restocks/teleports.
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
| Bram, Lv 6, 42/55 HP | F5 shopping | F6 fighting | F7 progressing | Sword, vest, Herbs ×2 |
| Finn, Lv 4, 19/45 HP | F6 farming | F7 discovering | F7 fleeing | **No sword**, **no armor**, Bread ×1 |
| Eira, Lv 5, 38/43 HP | F5 shopping | F6 grouping | F6 recovering | Vest, Herb ×1, Mana ×2 |

The table is a target **shape**, not three simulated example outcomes.

## The first chapter and shop access

- The candidate **first ten floors** form an escalating chapter of risks,
  unique rooms, progress discoveries and profitable demand. The Cave Troll
  is a potential **Floor 10 chapter boss** rather than permanently tied to
  Floor 6. **Boss placement and mandatory unlock rules remain a specific
  design choice to validate**, not new implemented canon.
- The previous music-led Troll arena, its Tripo hand/grab/throw work, sound,
  and historical replays remain useful. Boss mechanics should become reusable
  encounters on the common combat authority, retaining boss-specific
  animations/abilities.
- A **single physical Galvik shop with later unlockable dungeon access
  points** is the favored concept for deeper regions; it must not give all
  heroes free healing after every room. Exact entrance distribution, travel
  cost and curse explanation are **OPEN**. Current physical Floor 5 shop
  remains until a separate approved implementation changes it.
- Expansion of Galvik's basement, forge/pond, player-controlled prices, lore
  resolution and a full hundred floors are **outside the first vertical
  slice** and not prerequisites to fix the expedition loop.

## Architecture work packages (planned, no PR numbers reserved)

1. **World schema and contracts:** enumerate authoritative floor, room,
   feature, path, per-hero position, party, intent, three-phase snapshots,
   knowledge and immutable event/replay records. Define v13 save compatibility
   or an **explicit, tested** migration before changing schemas. Keep live and
   known snapshots separate.
2. **Shared explorer:** incrementally replace `dungeonSimulation.ts`
   Floor 1–4 coin flips with seeded navigation/encounters built from existing
   `dungeonLayout.ts`, `level7Exploration.ts` and `groupCombat.ts`.
   Validate feature ownership and multi-hero persistence. No 100-floor rewrite.
3. **Items and economy:** wire every ready-to-sell item to real persisted
   inventory and recorded fight/use logic; implement class resources only
   when fully specified. Check cash/credit/stock conservation and repeated
   day transitions.
4. **Board vertical slice:** move `rosterBoard.ts`, `rosterBoardHud.ts`,
   `rosterView.ts` onto one read-only snapshot projection. Show three
   phases, true/last-known status, HP, visible equipment sockets/icons,
   intent and depth markers. Reuse mounted board/roster controls.
5. **Unified combat + observation:** expand reusable group combat with
   monster/boss skills, align actual item effects, generate and **keep**
   immutable replay metadata, and expose honest viewed recordings.
6. **Playable first chapter:** content/encounter pacing for Floors 1–10,
   realistic preparation and returns, possible Floor 10 Troll integration,
   economy balance, repeated ten-day runs and owner visual acceptance.

These are **coherent development packages**, not a mandate for six tiny PRs.
Combine tightly coupled contracts into larger, testable changes; prefer
vertical integration rather than new disconnected framework islands.

## Release acceptance: when V.0003 ALPHA can replace V.002

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
for hero joining/retreating; new mana/ability model; shop access magic and
depth; final Floor 10 boss placement; difficulty and economy values;
the game's larger curse lore; future full real-time simulation.

**Design approval does not mean those details are final.** Prefer an
observable, grounded vertical slice before expanding the world further.
