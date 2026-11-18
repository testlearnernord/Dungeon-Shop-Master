# Dungeon Shop Master

**Playable browser alpha:** https://testlearnernord.github.io/Dungeon-Shop-Master/  
**Repository:** https://github.com/testlearnernord/Dungeon-Shop-Master

**Current playable release:** V.002 ALPHA  
**Next approved design milestone:** **V.003 ALPHA — The Living Dungeon** (**planned, not shipped**). See [The Living Dungeon design](docs/THE_LIVING_DUNGEON.md).

A first-person, dark-fantasy shopkeeping game built with TypeScript, Vite and
Babylon.js. The player currently controls Galvik, the cursed proprietor of
a physical shop on **Floor 5**. Autonomous adventurers from the upper floors
buy supplies, risk their lives below, and may or may not return.

The *100-floor dungeon* is the setting's long-term premise, **not** a claim
that 100 playable floors exist. The current alpha is **day-based**, not a
continuously running dungeon simulation.

## Start here: source of truth

- [Game Bible](docs/GAME_BIBLE.md): current implementation versus explicitly
  accepted (**LOCKED**), undecided (**OPEN**) and discarded (**REJECTED**)
  design. Do not turn brainstorms into canon.
- [Architecture](docs/ARCHITECTURE.md): authoritative state, navigation,
  furniture contracts, saves, replays and current code ownership.
- [UI Design System](docs/UI_DESIGN_SYSTEM.md): the compact first-person
  interaction and visual language, including customer service hints.
- [Development Roadmap](docs/ROADMAP.md): **V.003 ALPHA** implementation packages and release gates; supersedes the old post-#166 feature sequence.
- [The Living Dungeon design](docs/THE_LIVING_DUNGEON.md): agreed future loop, persistent dungeon, item causality, autonomous heroes, and Adventurer Board 2.0 with morning/midday/evening progress, HP and equipment icons.
- [Contributor/AI Guide](AGENTS.md): how to begin work and keep these files
  synchronized with the implementation.

**For a new AI/chat session:** read these documents on the latest `main`;
then inspect the live repository source, open PRs and their CI. Previous
chat messages, screenshots and PR descriptions are not authoritative if they
disagree with current code. No PR is automatically merged merely because it
was mentioned in a roadmap.

## What is playable now

| System | Current alpha behavior |
| --- | --- |
| First-person shop | Walk/look, order wholesale goods, stock and remove physical shelf items, operate a staffed register and grant credit |
| Furniture / expansion | Build compact 4-slot shelves, move registered furniture, hang Galvik's portrait, excavate Level 5 and place furniture on sufficiently cleared floor |
| Shoppers | Individual needs, gold, gear and HP; real shelf pickups into unpaid carts; collision-aware browsing, a five-place physical checkout queue with overflow, local restock/credit requests and walkouts; short event-triggered character remarks in the physical shop |
| Player service | Crosshair shelf details for actual stock and valid actions; compact live checkout/restock/credit status; **F** selects the most urgent requested item in the existing hotbar |
| Money | Real bag/slot inventory, wholesale costs, fixed retail prices, credit debt book and manual receipts. Outstanding collected carts settle once at end of day |
| Adventurers / dungeon | Persistent identities and equipment; **Floors 1–4 and 7** now use real seeded map exploration, renewable common monster/chest/trap sites, committed group fights and 3D replay recordings (Floors 1–4 share the Level 7 explorer, without the old random outcome formula); individually authorized Floor 6 Cave Troll with a score-synchronized 13.5s entrance, an original 17-piece vertex-painted GLB surface sculpt on the existing animated rig, and visually grounded maul attacks; deterministic boss duel with imperfect dodges, timed parries, real incoming hits, a breakable grab/throw with occasional real lava landings with hero/troll HP plates and cue-colored floating damage, lava and healing; Floor 7 observation/replay |
| Day / reports | End the day at Galvik's bed; merchant ledger, receipts, hero records and spoiler-safe sealed replay presentation; validated campaign save/load |

**For V.003 design (NOT CURRENT):** Galvik's shop moves conceptually
off the numbered dungeon floors to a single **cursed special floor**,
served by one large supernatural entrance/exit rather than the existing
two Floor-4/Floor-6 doors. Dungeon heroes choose stay/up/down; an ascent
may terminate an expedition at the shop from any depth. When they
physically leave, they are absent from both shop and dungeon for
**two complete game days** before becoming eligible for a new expedition.
Dungeon Floor 10 is blocked until Galvik gives **that hero** a pass;
the current Floor-6 permit is not the future gate. These rules are
documented, not implemented.

**Dungeon Regeneration (V.003 planned):** the world's geometry,
known paths, unique victories and story milestones remain saved while
ordinary monsters, common chests and resettable traps renew at
staggered, deterministic per-site intervals. This keeps farming viable
without resetting bosses or duplicating historical loot. Exact day
intervals and reward balance still require testing; no regeneration
system has been implemented in V.002.

**New shared combat runtime (after the current PR merges):**
ordinary dungeon combat and the Cave Troll share physical actor
movement/integration and a once-only timed-action scheduler in
addition to their existing shared hit/heal/defense contracts.
Boss-specific grab/throw and group-specific actor states
remain distinct **inside the now-common encounter stepper**.
No game release label or save format has changed.

**Shared combat tactics and projectile collision (after this PR merges):**
ordinary encounters and the Cave Troll use the same
target-selection, engagement, defense and ability policy,
plus physically swept projectile collision. The special
Troll grab/throw special states remain intact as callbacks
to the common encounter driver; merging their actor schema
with group actors is future work. Saved fights and the
playable V.002 release label are unchanged.

**Shared encounter simulation driver (after this PR merges):**
`combatEncounter.ts` runs normal group encounters and the
Cave Troll through one real fixed-step fight pipeline and replay
recorder, with signature boss grab/throw effects injected
rather than replacing their animations with ordinary monster
attacks. Actor state/ability schemas and the planned cursed
portal/Board systems remain unfinished; playable label
stays V.002 Alpha.

**One combat actor contract (after this PR merges):**
ordinary fighters and the Cave Troll/arena hero now share
`combatActor.ts` for live HP, position, stamina, phase,
cooldowns and action transitions. Boss adapters write
straight into the original fight state so animations
and older saved replays stay valid. Signature grab/throw
effects remain specialized; general multi-hero boss
encounters still need additional work.

**Multi-hero boss combat foundation (after this PR merges):**
the real group encounter engine can simulate multiple heroes
versus a boss monster with a physical, counterable
grapple-and-throw. Boss/ordinary combat still use the same
authoritative stepper and replay recorder; existing Troll
duel/cinematic animations remain compatible. The party
boss encounter has not been connected to the dungeon
campaign yet. The dungeon viewer can render the full saved
multi-actor cast, but live expeditions still resolve one hero per fight.

**Recorded-cast dungeon viewer and renewable elites (after this PR merges):**
the Floor 1–4/7 footage viewer now displays every saved combat participant
and projectile, with TAB cycling only through currently visible fighters.
Historical purchased gear is drawn from a saved combat actor's
equipment snapshot when present, never from today's roster. Older recordings
without that optional v1 field stay deliberately neutral. On Floor 7, some room sentries in later deterministic
respawn generations become stronger grapple/throw elites. Their HP, defenses,
throws, rewards and frame data come from the existing encounter engine and
v13 saved replays. This is a real solo expedition encounter, not the unique
Cave Troll, a new floor gate or autonomous multi-hero party campaign.

**Co-located hero parties (after this PR merges):**
During a committed dungeon day, up to three willing heroes who already
occupy the same tile may walk and fight together. Every actor has their
own HP, equipment and real Healing Herbs, with one genuine group fight
and one claimed monster/chest/trap site. Chest gold is split, a single
loot item has one claimant, and every survivor's actual XP, inventory
and personal route/recording are committed without rerolling combat.
Established, willing parties now survive multiple committed days in
a saved relationship record. They can keep their formation after a
unanimous transition to a neighboring early dungeon floor **only**
when every survivor really arrives at the same saved tile; individual
choices, casualties, separation and returns to the shop can dissolve
the group. The physical Adventurer Board displays “Party 2/3” on
actual members. Expand that hero's card in the R roster to see
the real companions' names, roles, HP and when the group formed.
There are no player-issued orders or teleport
corrections, and the unique Level 6 Cave Troll cinematic is unchanged.
V.002 stays the playable version.

**V.003 is a target, not an implemented version.** Floors 1–4 and 7 now share the real spatial explorer and recorded combat; the separate Floor 6 boss battle has **not** been consolidated. The cursed special-floor shop, two-day off-duty period, three-phase Adventurer Board and complete hero/item causality upgrades remain future work. The npm package version `0.1.0` is independent of the in-game V.002 / planned V.003 release labels.

**Implemented does not mean visually perfect.** The CI checks safety and
functional behavior; customer acting, friction and interface placement still
need human game testing. Shop remarks never alter sales or dungeon outcomes.

### First few minutes

1. Start or load a campaign. **A fresh shop has no shelves**, no shelf stock
   and a small initial merchandise bag, not prebuilt giant racks.
2. Press **N** to place a small four-slot shelf; rotate with **R**, confirm
   with left-click or cancel with right-click/Esc. A new shelf starts empty.
3. Select a bag item with **1–6** or the mouse wheel; look at a real shelf
   slot and **left-click to stock** or **right-click to remove** one unit.
   **Shift + left-click** fills that slot from your real bag; **Shift +
   right-click** clears it as far as bag capacity allows. The crosshair
   prompt explains capacity, wrong-item selection and cart-related locks.
4. Buy stock through **B** (wholesale). When a real customer asks for
   replenishment, the small service strip displays the expiring request;
   press **F** to select that item, then walk over and stock it yourself.
   Neither F nor the strip purchases or transfers anything.
5. Customers choose what to buy. At the staff side of the register use
   **E** when someone with a cart is ready; finish its two-stage timing/receipt interaction. The actual amount and any
   customer-funded tip appear on a paid receipt; the register stays open.
   When the next **physically ready** buyer arrives, press **E** again to
   begin the next checkout without reopening the modal. **Esc** leaves the
   register. No customer is charged until their own two stages succeed.
   A nearby credit customer can also be addressed with **E**, with the
   actual item issued as debt, not a sale.
6. To close the day, go to Galvik's bedroom and **hold E** at the bed.
   The ledger opens and the next day is committed. Saved dungeon footage
   can be watched without rerolling the outcome.

### Common controls

| Key / input | Shop action |
| --- | --- |
| WASD / mouse / Shift | Move, look, sprint |
| 1–6 / wheel | Select a carried stocking item |
| Left-click / right-click at shelf | Stock one / remove one; holding repeats on the same slot |
| Shift + left-click / Shift + right-click at shelf | Fill / clear targeted slot, respecting bag capacity and customer reservations |
| E | Contextual interaction; after a paid register receipt, serve the next physically ready buyer |
| Hold E at bed | Finish day |
| F | Select the earliest-expiring **live restock** item, if any |
| B | Wholesale |
| N / Shift+N | Build a four-slot shelf / hang portrait |
| P | Move looked-at furniture; R / Q rotate while placing |
| U | Mining mode; Shift+U is an alpha expansion-tier development control |
| R (outside placement) | Adventurer roster |
| V / G | Level 6 arena (13.5s music-led intro) / Level 7 dungeon viewer |
| V with old footage available | Opens a fresh preview by default; use C / the spectator source button for saved footage. Opening a specific Ledger recording still shows that recording directly. |
| Inspect Tripo GLB (inside Level 6) | Open a local-only model lab: select a rigged `.glb`, orbit/zoom and choose any embedded animation; Esc returns to the battle. Training-only fights with no authorized hero randomize on each restart. Saved replays never reroll. |
| SFX Lab (V training preview only) | Toggle beside Restart. Solo/Mute Hero, Troll or World and independently Voice, Movement, Melee, Ranged, Magic or Environment. Expand the 19-sound list to audition each cue, now explicitly labelled MP3 or synth, and inspect recent sound events. Filters reset outside training. |
| Audio panel | Separate Music and Effects (SFX) mute/volume controls persist independently outside V; Level 6 temporarily starts with a 16% Music / 40% SFX balance and restores previous settings when closed. The Level 6 Troll now uses eleven curated MP3 one-shots: one roar, two grunts, one footstep, two fist swings, two impacts and three hurt takes. Heavy slam samples follow the actual combat motor. Breathing, death, Hero and environment cues and shop feedback are still provisional Web Audio synthesis, not finished Foley. |
| Space / Enter (during Level 6 intro) | Skip the cinematic and seek Desperate Measures to the 13.5s combat downbeat; V / Esc still returns to the shop |
| M | Toggle mouse/HUD cursor mode |
| Esc | Release cursor or cancel/close the current interaction |

This table describes current code, not proposed controls. Full context
prompts are shown in-game.

## Economy and survival facts

Heroes have **HP, not hunger**. Waybread and Healing Herbs both restore HP:

| Product | Wholesale | Retail | HP restored |
| --- | ---: | ---: | ---: |
| Waybread | 2g | 4g | 8 |
| Healing Herb | 3g | 6g | 18 |

Other current stock: Mana Potion, Iron Ore, Iron Sword and Leather Vest.
The retailer's bag and shelf stock are distinct from a hero's supplies.
Heroes choose purchases according to need, gold and availability. Damage,
deaths and equipment consequences come from the committed dungeon
simulation, not random starvation or arbitrary visual effects.

## Local development

Requires **Node.js 22** and npm.

```bash
npm ci
npm run dev
```

```bash
npm run build
npm run test:unit
npx playwright install chromium
npm run test:smoke  # six fast PR browser smoke scenarios
npm test            # complete Playwright regression
```

The project uses `npm run build` for the TypeScript/Vite production build,
Node's built-in runner for unit tests, and Playwright for browser scenarios.
Playwright's test runner may need a display or `xvfb-run` on headless Linux.

### GitHub workflows

- **CI** on pull requests into `main`: production build, all unit tests,
  and exactly six explicitly tagged `@ci-smoke` Playwright scenarios:
  bed-based day closure and ledger, real cashier settlement, N/P shelf
  placement on excavated floor, saved physical shop stock, a shopper's
  path to a relocated register, and Level 6 intro/music handoff. Run them
  locally with `npm run test:smoke`. Heavy multi-customer simulations and
  complete boss visuals are **not** part of the automatic PR checks.
- **Full browser regression**: manually dispatched GitHub Actions workflow
  running `npm test` (all browser tests, including smoke scenarios).
  Successful boss-training screenshots are uploaded here instead of on
  every PR; browser failure diagnostics are still uploaded on failure.
- **Deploy to GitHub Pages**: triggered by pushes to `main`. A green PR
  build is not proof that Pages has finished deploying; check its workflow.

Prefer focused additional coverage over inflating the default CI.

### Saves and compatibility

`SIMULATION_VERSION = 13` in `src/game/gameState.ts`. Saves require the
persisted Level 5 room, bedroom furniture, board, counter, all shelf
instances and matching four-slot inventories. Version-12/partial or old
five-slot giant-shelf campaigns **are not automatically migrated**. Invalid
stored saves are not silently overwritten. Start a fresh campaign if an
older alpha save cannot be loaded.

## Where to code

| Area | Authoritative code |
| --- | --- |
| Simulation and merchant mutations | `src/game/gameState.ts`, `src/game/gameStore.ts`, `src/game/economy.ts` |
| Actual collected carts, cashier and debt | `src/game/shopCarts.ts`, `src/cashierHud.ts`, `src/game/shopCredit.ts` |
| NPC intents and visual traffic | `src/game/shopperIntents.ts`, `src/game/npcVisualSystem.ts`, `src/game/shopServiceSpots.ts`, `src/game/shopperNavigation.ts` |
| Furniture and mining | `src/game/furnitureRegistry.ts`, `src/game/furniturePlacement.ts`, `src/blueprintHud.ts`, `src/game/level5Room.ts` |
| Player UX | `src/game/interactionSystem.ts`, `src/game/shopServiceFocus.ts`, `src/shopHudLayout.ts`, `src/uiIcons.ts`, `src/immersiveUi.css` |
| Dungeon / observation | `src/game/level7Exploration.ts`, `src/game/dungeonDecisions.ts`, `src/game/dungeonRegeneration.ts`, `src/game/level6Combat.ts`, `src/game/level6Arena.ts`, `src/game/dungeonViewer.ts` |
| Saved results / ledger | `src/game/campaignSave.ts`, `src/merchantLedger.ts`, `src/ledgerViewState.ts` |

For details and non-negotiable invariants, use the
[architecture map](docs/ARCHITECTURE.md), not this quick reference.

## Boss asset regeneration

`public/assets/models/ashen-mauler-sculpt.glb` contains 17 original,
vertex-painted anatomical surfaces. It is committed as a regular binary asset;
regenerate deterministically with:

```bash
node tools/asset_generation/build_cave_troll.mjs
```

The existing Babylon transform rig animates the imported geometry. This is
**not** yet a unified hand-sculpted, skinned GLB with embedded animation clips.

## Upcoming development

The staffed register (#153), physical stock and stocking improvements
(#154–#156), customer remarks (#157), boss preview, cinematic, visual
sculpt and impacts (#158–#162), and boss combat fairness, opacity and HUD
(#163) have shipped. #164 reduced required PR browser CI to six tagged
smoke scenarios; the larger suite remains available for manual regression.

**Implemented in #166:** Level 6 has a browser-local Tripo GLB inspection
viewer and varied fictional training previews. The shipped Cave Troll in
actual fights is **still the original 17-part GLB on the Babylon transform
rig**, not the externally animated Tripo character.

**Curated candidate available, not an in-game boss:** the 55-clip source is archived at `assets/tripo/source/`. The twelve-clip selection is checked in at `public/assets/models/ashen-tunnel-mauler-tripo.glb` (details in `docs/TRIPO_TROLL_ASSET_AUDIT.md`). In Level 6 choose **Inspect Tripo GLB → Ashen Tunnel Mauler · curated** to inspect the repository asset. Local `.glb` uploads still work.

**Experimental Level 6 boss swap (awaiting visual approval):** in Level 6 use **Legacy boss · try Tripo** to switch between the shipped segmented boss and the skinned 14-clip Tripo combat candidate (12 retained clips plus authored Grab/Throw). It restarts the cinematic without rerolling the current training fighter, and also works on exact saved replays. The renderer never controls combat; newly simulated fights can grab, throw, damage and occasionally fling an adventurer into lava. Old saved replays never reroll. The original model is the default and fallback; the local Model Lab remains available. `tripoBossMotion.ts` maps the fight phases to imported GLB poses with render-frame-stable, distance-driven gait and the actual overhead clip's 1.9–2.1 s hand contact synchronized to the existing hit tick. `tripoCaveTrollVisual.ts` loads only on selection, faces forward without the erroneous 180° correction and deliberately uses no weapon: the old experimental stone maul floated between his hands and clipped through the floor. Bare fists, short weighted clip cross-fades and turning footsteps are used instead. The two new 5-second Tripo Grab/Throw clips are merged at \`npm run dev\`/\`npm run build\` from the root-level upload into an ignored generated combat GLB; the original curated GLB and Model Lab remain intact. Existing sounds underscore grip, release and landing. Grab/Throw uses the actual Tripo left-hand thumb/finger pose to hold and rotate the hero until release; the visual flight detaches directly from that pose and converges on the motor's unchanged landing. Grab attempts are more common in close combat and landed throws now deal 42 raw damage (armor mitigated), without guaranteeing any catch. The slower fixed-step warning, lift and airborne flight remain; an unsuccessful grab retracts its hand without an empty throw, using a light existing swing effect instead of a fake heavy impact. Precise foot planting, interaction poses and the unarmed rhythm still need visual approval.

**Next art gate, not yet implemented:** visually approve the rigged Tripo model's
walk, strikes and death clips in the local viewer, then import the approved
skinned asset into the existing Level 6 presentation without replacing the
combat logic or changing saved fight outcomes. Verify facing, foot contact,
hammer attachment, visual quality, replay playback and cleanup in a real
browser before replacing the existing boss. An automated pipeline for future
monsters or heroes remains a possibility to evaluate, not a shipped system.

After the art trial and a short Level 6 playtest, prioritize visible
shop-to-dungeon consequences and a measured ten-day playability/balance pass.
Deeper economic systems and an optional cellar, forge or pond are still
design concepts. See [ROADMAP](docs/ROADMAP.md) and open PRs rather than
reserving speculative numbers.

Illustrations, previous brainstorms and historical conversations are
references, not alternative canonical implementations.
