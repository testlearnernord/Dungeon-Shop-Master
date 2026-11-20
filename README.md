# Dungeon Shop Master

### PR #217 · Frame-spike evidence after the shared-clock migration

The user-observed lag began after #200; a SwiftShader graphics bottleneck on CI does **not** prove the new live-world work is free on a real PC. A new browser test compares a genuine seeded day-one campaign and the same ten-hero campaign on **day eleven**, both with rendering active and world pacing paused versus live, and measures six real scheduled dungeon-event intervals. World-only ticks are lightweight in the sample; **scheduled dungeon events take 7.5–15.8ms on day one and 7.7–11.2ms on day eleven** when artificially advanced in 600-tick chunks. These periodic CPU spikes can exceed a remaining 60 FPS frame budget after rendering, even if sustained low CI FPS still occurs with simulation paused. This sample contains **zero active group combats**, so many simultaneous live combats are **not yet benchmarked**.

- Open **F3** to see world CPU mean, p95/max in the rolling window, **worst world-frame and autosave cost since F3 was opened**, and number of simulation frames over 16ms. Fast averages hide occasional 30-second scheduled dungeon spikes.
- For a real PC A/B, fix **F4 to Native**, read F3 with the normal shop running, then enter the **P blueprint mode** which pauses world pacing while the main 3D scene continues to render. Compare the *same camera position* and repeat on advanced campaign days. FPS improvement when the world is paused means CPU/event work contributes; identical low FPS points to browser/WebGL work.
- No simulation cadence, save frequency, gameplay decisions or GPU quality is changed by this instrumentation. See [performance investigation](docs/PERFORMANCE_INVESTIGATION.md).


### PR #216 · Shop FPS: measured WebGL bottleneck and adaptive render resolution

**Controlled comparison on identical local Vite CI + Chromium SwiftShader (software WebGL):** normal shop 20 FPS median, world simulation fully paused still 20 FPS, Babylon rendering disabled 60 FPS, **half width/height drawing resolution 60 FPS**, five dynamic point lights disabled 30 FPS, hiding some furniture/decor unchanged at 20 FPS, most world meshes hidden 60 FPS. Actual scene baseline: 301 meshes, 50 active, ~4,464 active triangles, six lights (five point + ambient). The bottleneck **on CI** is the WebGL pixel/shader/lighting pipeline, not an extreme polygon count or the 20Hz dungeon simulation. **This is NOT a claim about physical user's GPU or GitHub Pages FPS.**

- **Automatic display-quality optimization:** Retains native Babylon resolution when smooth; under sustained GPU-like frame stalls drops only the 3D render buffer through 80%, 67%, 57% and 50% linear resolution. Native HTML HUD, text and icons stay at full browser clarity. Does not change shop traffic, world time, gameplay, physics, combat, checkpoints or autosave frequency. Auto is disabled in deterministic E2E benchmark sessions.
- **F3** shows real device FPS/p95, world and draw CPU, Babylon render buffer, render scale, active/total meshes, lights and actual WebGL renderer name. **F4** cycles Auto → Native (100%) → Balanced (67%) → Performance (50%) → Auto. Manually forced quality does not self-adjust.
- The static GitHub Pages deployment serves the same `vite build` artifacts that a local `npm run build && npm run preview` would serve. Hosting affects initial transfer and caching, not each WebGL draw call; the CI FPS data were recorded on `127.0.0.1`, **not GitHub Pages**.
- Detailed evidence, controlled ablations, limitations and prioritized next steps: [Performance investigation](docs/PERFORMANCE_INVESTIGATION.md).

### PR #215 live-clock performance investigation (CI measurements, device verification pending)

- Press **F3** in the playable shop to show/hide a small real-device performance meter: FPS, p95 frame gap, world-tick CPU, synchronous Babylon render CPU, ticks/s, last autosave serialization/validation time. It is off by default, does not pause/modify the world and is not a GPU profiler.
- Source comparison confirms the 50ms world step arrived with #203 and full physical shop traffic checkpoints with #204. #215 avoids full JSON equality checks on every **known committed physical tick**; non-clock mutations retain their guarded comparison. Strict traffic/save validation is unchanged.
- **Visible motion regression fixed:** #203 tied NPC root movement to 20Hz saved ticks. Shop meshes now interpolate **presentation only** between the previous and current already-committed poses at display refresh rate. Babylon roots return to exact saved physics positions immediately after each render. Collision, pickups, combat, replay and autosaves never see interpolated coordinates.
- Autosave rotation previously re-parsed/strictly validated the last full snapshot **every second**, including snapshots already validated and committed by this exact adapter. Now it reuses that proven value, while externally changed/corrupt latest saves still receive a full validation, failures never certify records and backups remain intact. Full autosave JSON is captured synchronously after strict validation without an extra intermediate `structuredClone` of the same entire state; manual `createSave` keeps its detached-object contract.
- **Important:** CI itself reports ~50ms median frame gaps both when this world clock is paused and when it runs. That prevents falsely attributing CI's ~20 FPS to the new world motor; hardware performance on a real player's PC is still unmeasured. See [performance investigation](docs/PERFORMANCE_INVESTIGATION.md).

### PR #213 physical shop rotation (merged)

- Physical shopper crossing is authoritative: `NpcVisualSystem` removes the outer-gate actor, `shopTraffic` persists its cleared checkpoint, and only then `GameStore.completePhysicalShopExit` books one ticked `shop-departure` event.
- `at-shop` -> `departing` starts an actual pedestrian walk; manual checkout, unsatisfied walkout and sleeping alone **do not** start cooldown. After observed exit on day D, the hero is absent from both shop and dungeon for complete days D+1 and D+2; earliest reentry is D+3.
- Reentry uses the seeded safe known entrance, retains discovered routes, HP, equipment, supplies and true committed site generations; no free healing, RNG or second simulation. The old individually granted Level-6/7 boss permit is temporarily honored **only after** the required off-duty days.
- The night book now has only **The Reckoning** and **Goods & Receipts**; LIVE Board and the bounded Expedition Timeline replace duplicate nightly hero/replay pages. Old four-page session indices are safely reset.
- Strict `SIMULATION_VERSION = 24` snapshots validate new statuses, `offDutyUntilDay` and real clock-stamped departures. Earlier Alpha snapshots do not migrate.
- **NOT SHIPPED V.003:** cursed special-floor single physical portal, Floor-10 permit, deeper progression, unified boss fight architecture and integrated performance acceptance are still open.

**Playable browser alpha:** https://testlearnernord.github.io/Dungeon-Shop-Master/  
**Repository:** https://github.com/testlearnernord/Dungeon-Shop-Master

**Current playable release:** V.002 ALPHA  
**Next approved design milestone:** **V.003 ALPHA — The Living Dungeon** (**planned, not shipped**). See [The Living Dungeon design](docs/THE_LIVING_DUNGEON.md).

A first-person, dark-fantasy shopkeeping game built with TypeScript, Vite and
Babylon.js. The player currently controls Galvik, the cursed proprietor of
a physical shop on **Floor 5**. Autonomous adventurers from the upper floors
buy supplies, risk their lives below, and may or may not return.

The *100-floor dungeon* is the setting's long-term premise, **not** a claim
that 100 playable floors exist. The current alpha has one deterministic, pausable live world clock: shop customers, dungeon exploration and ordinary fights run while the shop is open, and the bed ends the day. The full V.003 release remains unshipped.

**V.003 migration note (PRs #212–214):** The experimental Expedition
Archive has been redesigned as a small timeline of today's and the
previous two days' actual highlights. Save individual recordings to
retain them long-term (up to 12). Do not expect an infinite replay
library. A separate cashier/observer performance pass reduces wasted
rendering. PR #214 adds seeded ten-day live-campaign and browser
save/reload checks and stops the Level-6 HUD from rebuilding its entire
history for every shop/world tick. Live shop credit now follows the
same witnessed door exit and two complete days off duty as paid customers.
GitHub Actions measures representative browser frame intervals, but this
is NOT a verified FPS figure for any player's own hardware. The single
cursed portal, Floor-10 pass migration, deeper authored content and full
release acceptance remain open.

## Start here: source of truth

- [Game Bible](docs/GAME_BIBLE.md): current implementation versus explicitly
  accepted (**LOCKED**), undecided (**OPEN**) and discarded (**REJECTED**)
  design. Do not turn brainstorms into canon.
- [Architecture](docs/ARCHITECTURE.md): authoritative state, navigation,
  furniture contracts, saves, replays and current code ownership.
- [UI Design System](docs/UI_DESIGN_SYSTEM.md): the compact first-person
  interaction and visual language, including customer service hints.
- [Development Roadmap](docs/ROADMAP.md): **V.003 ALPHA** implementation packages and release gates; supersedes the old post-#166 feature sequence.
- [The Living Dungeon design](docs/THE_LIVING_DUNGEON.md): agreed future loop, persistent dungeon, item causality, autonomous heroes, and an event/last-known Adventurer Board 2.0 with HP and equipment icons.
- [Living World Clock](docs/LIVING_WORLD_CLOCK.md): approved deterministic paced shared shop/dungeon clock, pauses, sleep, replay timestamps and observation boundaries. **Design only, not shipped.**
- [Live Board & Ledger Audit](docs/LIVE_BOARD_LEDGER_AUDIT.md): chosen LIVE Adventurer Board, obsolete nighttime pages, retained accounts/receipts and approved clean old-save break. **Design only, not shipped.**
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
respawn generations become armored heavy-strike elites. Their real HP,
defenses, rewards and frame data come from the existing encounter engine;
the unique Cave Troll's grapple/throw is reserved for authored bosses and
saved dungeon replays. Real solo heroes and co-located parties can encounter these ordinary renewable elites; they are neither the unique Cave Troll nor a new floor gate.

**Co-located hero parties (after this PR merges):**
During a committed dungeon day, up to three willing heroes who already
occupy the same tile may walk and fight together. Every actor has their
own HP, equipment and real Healing Herbs, with one genuine group fight
and one claimed monster/chest/trap site. Chest gold is split, a single
loot item has one claimant, and every survivor's actual XP, inventory
and personal route/recording are committed without rerolling combat.
Group routes are selected from every present hero's own known next steps, with deterministic majority voting and no unseen map information. Following one real battle, armed and healthy companions may agree to descend, patient explorers may wait for a cautious friend, or a healer/generous ally may escort someone upward. No hero is forced into an unsafe descent or prevented from resupplying; personal goals remain distinct.
**Temporary Party feedback (after this PR):** the wall-mounted
Adventurer Board shows a common numbered `TP` marker for heroes
travelling together (TP = Temporary Party), and the expanded R
roster shows the full group and individual companions. Dungeon
footage shows the *historical* members of the recorded day and
highlights the TAB-followed character. All members with
historically recorded appearances are now physically rendered
walking and turning along the shared saved dungeon route, with
matching gold TP rings. The camera can follow companions before
combat, while real fight footage uses independent actual recorded
positions. No new pathfinding, equipment guesses or hidden state
is invented; old v1 tapes stay compatible. The Dungeon feed receives
actual join and leave messages when a confirmed day changes a party,
without inventing a relationship from proximity or announcing
combat outcomes. Solo/older recordings retain their existing view.

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

**Authentic longer daily dungeon footage (after this PR):**
An expedition now records up to 36 actual connected moves and two
separate real encounters instead of ending automatically at the first
won battle. A real defeat, unsafe lack of supplies or inaccessible
route can still end the tape early. Older v1 records remain playable
with the unchanged combat replay schema; the outer campaign save is now v16. No filler frames are added.
The physical Adventurer Board now shows empty/owned W/A equipment
slots plus numeric HP. Its chronological event/last-reported timeline
remains a target, not three mandatory day phases.
**Ghoul first playable pass:** Generated ordinary encounters now use
the owner's actual skinned Tripo Ghoul instead of placeholder
Goblin/Skeleton/Slime/Cultist labels and sphere fighters. At build
time, the 14-clip source is joined with the separately exported
Combat Idle into one GLB; the Babylon spectator renders real Ghoul
locomotion, attacks, hurt and death from committed replay frames.
A new crypt/ruins environment decorates the EXISTING navigable
rooms with tombs, broken pillars and ghostly lights, adding no
second arena or gameplay collision authority. This needs final
visual and original Ghoul SFX sign-off before calling the asset
finished. See [Monster Asset Pipeline](docs/MONSTER_ASSET_PIPELINE.md).

**V.003 is a target, not an implemented version.** Floors 1–4 and 7 now share the real spatial explorer and recorded combat; the separate Floor 6 boss battle has **not** been consolidated. The cursed special-floor shop, two-day off-duty period, shared paced world clock, event-timeline Adventurer Board and complete hero/item causality upgrades remain future work. The npm package version `0.1.0` is independent of the in-game V.002 / planned V.003 release labels.

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

**V.002 still playable; PR #204 persistent shop traffic:**
`SIMULATION_VERSION = 18` in `src/game/gameState.ts`. A new campaign
persists one monotonic **50-ms world tick**. Twenty ticks form one game
minute; 28,800 ticks form a 24-game-hour day (24 foreground real minutes
at current pacing). Shop requests last 1,200 ticks = 60 real seconds;
pausing the game pauses this countdown. Scene-owned customer walking,
routing, collision decisions and shelf pickups now advance ONLY when
the shared world clock commits a tick, not during Babylon render frames.
Clock/traffic-only autosaves are throttled to once per second; all real
shopping, queue-event and receipt changes save immediately. Shop checkpoints
now also persist visitor positions, headings, routes, waypoints, local waits,
exclusive shelf/queue claims, their stable actor order and door positions.
Mid-visit reload hydrates the SAME physical customer motor without running
a fresh entrance simulation. Strict v18 campaigns additionally persist
the single live dungeon scheduler and its per-hero activity checkpoint.
Old v17/v16/v15/v14/v13 alpha saves are deliberately **incompatible**
and retained on load failure.
No migration adapter or offline progression is supplied.

**Shop transactions:** buyers physically reserve shelf goods without paying.
Only the actual staffed cashier transfers sales revenue; approved credit
records a receivable instead. Bedtime **returns all unpaid cart stock**
to shelves without creating purchases, while due petition expiries commit
one real world-time-stamped walkout. Menus and blueprint planning pause
physical customer motion and the world clock.

**PR #206 partial live dungeon cutover:** real browser campaigns now
use the shared world clock for autonomous Floors 1–4/7 expedition movement
every 600 committed world ticks (30 active real seconds). Each event
advances the SAME physical party/path/loot engine by at most one connected
tile, updates HP, visited locations, gold, treasures and site cycles
immediately, and saves the next expedition deadline. The unique Floor 6
boss uses its existing resolver during a scheduled expedition event.
Bedtime fast-forwards outstanding world events once, then closes only
the shop; it no longer rerolls dungeon outcomes for live campaigns.
Direct legacy test fixtures must explicitly remain outside this live
mode; they cannot run simultaneously with it.

**Still planned for V.003:** combats must advance across their actual
60 Hz world-time frames, not resolve an entire fight instantaneously at
one dungeon event. Player-visible live battle spectator, persistent
hero floor/long-term goals, physical travel back to the shop, true
chronological expedition recordings and a live magic death notification
also remain unfinished. The partial scheduler does not make V.003
releasable. Strict version-18 campaign continuation is required.

## Where to code

| Area | Authoritative code |
| --- | --- |
| Simulation and merchant mutations | `src/game/gameState.ts`, `src/game/gameStore.ts`, `src/game/economy.ts` |
| Actual collected carts, cashier and debt | `src/game/shopCarts.ts`, `src/cashierHud.ts`, `src/game/shopCredit.ts` |
| NPC intents, physical traffic and saved checkpoint | `src/game/shopperIntents.ts`, `src/game/npcVisualSystem.ts`, `src/game/shopTraffic.ts`, `src/game/shopServiceSpots.ts`, `src/game/shopperNavigation.ts` |
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
