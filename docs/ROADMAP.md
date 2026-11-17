# Dungeon Shop Master — Next Development Pass

> **Current planning reference, reviewed 2026-11-17.** GitHub source,
> merged PRs and tests define implemented behavior. The merged work through
> **#166** includes real shop service, customer presentation, the current
> Cave Troll visual/duel improvements, leaner PR CI and a local asset lab.
> Future PR numbers are **not reserved**. The next asset experiment is approved
> for a trial, not already shipped. Check open PRs before starting work.

## Current state and the next asset gate

**CURRENT on `main`:** #160 adds the 13.5-second score-led boss cinematic
and locomotion, #161 imports the original 17-part vertex-painted
`ashen-mauler-sculpt.glb` onto the Babylon transform rig, and #162 adds
grounded impact effects. **#163** fixes the sculpt's alpha/depth rendering,
makes newly generated boss encounters less vulnerable to lava-edge pathing,
lengthens fights via actual combat balance, and adds hero/troll HP plates and
cue-based floating damage/healing numbers. Existing committed battle replays
remain immutable. Those fixes have been merged; do **not** list them as
unimplemented tasks.

**CURRENT asset limitation:** the repository's generated 17-part GLB is
still surface geometry driven by the existing runtime transform rig, **not**
a unified skinned character with imported animation clips. The owner-approved
Ashen Tunnel Mauler concept remains the visual target, not a claim of final
in-game model quality. Human visual acceptance is still outstanding.

**CURRENT model trial tooling (merged #166):** the Level 6 spectator
offers **Inspect Tripo GLB**, a local-only model viewer using Babylon's
scene and a selector for exported animation clips. Training-only fights
randomize fictional hero roles, equipment and tactics on restart; V opens
fresh practice by default, while the Ledger/C switch still exposes exact
saved combat. The tool does **not** yet put the Tripo creature into real
combat. The curated 12-clip candidate is now checked in alongside the
archived 55-clip source and selectable in the existing Model Lab.

**CURRENT experimental implementation:** The checked-in 12-clip candidate can now be selected for the existing Level 6 fight with the **Legacy boss · try Tripo** switch. The same simulation and immutable replay drive visual-only pose sampling, and the old boss remains the default and loading/error fallback. An animation-alignment follow-up fixes reversed rendering and frame-by-frame gait switching. After player review, the incompatible weapon prop was removed completely; this Tripo trial is **unarmed** with short clip cross-fades and visible turn-induced steps. True positional circling and dedicated unarmed attack curation remain future visual/AI work. Awaiting player visual acceptance. This is a **trial awaiting browser/owner visual acceptance**, not a finalized boss art replacement or a reusable creature pipeline. The Model Lab and its local `.glb` inspector are preserved.

**NEXT, approved experiment (VISUAL ACCEPTANCE OPEN):** evaluate the skinned
**Tripo AI-generated Cave Troll** and its usable embedded clips in the
local model lab, then integrate an optimized, approved asset into the
existing Level 6 visual rig while preserving authoritative combat and
immutable saved footage. Do not claim the character is already shipped
in the fight, technically validated there, or part of a reusable asset
pipeline until an implementation PR and a real browser review prove it.

Acceptance of that **one model-pipeline trial** requires:
- Actual model and animation clips import correctly; no invisible,
  transparent, incorrectly facing, floating or badly scaled character.
- Walk/chase, strike and death are readable and consistently driven by the
  battle's existing authoritative phases. Identify which clips the asset
  really provides; do not claim missing clips exist.
- The music-led cinematic, preview, saved replay, hit timing, HP/damage HUD,
  scene restart and cleanup still work. Never re-resolve saved outcomes,
  add a second combat controller or change collision/damage just for visuals.
- A real browser review compares the result with the concept and examines
  walking, hammer impact, dying and camera framing. Targeted regression
  covers import/fallback and lifecycle without inflating default PR CI.
- Record model provenance and permitted use before treating the candidate
  as a reusable production asset. Keep the previous working implementation
  recoverable until the new asset is approved.

**Decision after the trial:** if it works, evaluate a repeatable import/rig/
animation process for future monsters and **possibly heroes**. That reuse is
a goal to investigate, not yet an implemented general system. If it fails,
keep the existing boss and return to gameplay work without endless sculpt
micro-iterations.

**After this asset gate:** do a short real-player Level 6 acceptance pass,
then prioritize **shop-to-dungeon consequence feedback** and **ten-day
playability/balance** using the existing systems. New shop economics and
larger excavated areas/cellar activities remain separate, later decisions.

**CI baseline:** merged #164 uses build, unit tests and six tagged
Playwright PR smoke scenarios. The full browser suite and visual boss
screenshots run through the manually dispatched regression workflow.

## Why this sequence

The alpha has one shop, real movable furniture and excavation, autonomous
customers, real shelf pickups, a staffed register, credit, navigation and
persistent dungeon/day results. Multiple rounds of traffic and animation
work have made the systems functional. The next goal is **a shop that is
pleasant and meaningful to play**, not another parallel AI, furniture or
navigation framework.

**Design compass:** stock goods → serve autonomous customers → observe
consequences in committed expeditions → make a better or greedier decision
tomorrow. The player's actions affect stock and access; the heroes still
choose what they buy.

## Feature work package 1 (PR #153): Cashier feel and flow

**Delivery status:** the continuous two-stage register, real paid receipt,
item icons and explicit E-to-next-customer transition are implemented in
merged PR #153. The owner still reviews
visual pacing and may request revisions. Subsequent package numbers are
unreserved.

**Player goal:** A complete checkout feels satisfying and is manageable
with a queue, not repetitive button bureaucracy.

- Inspect the **existing** two-step timing/receipt interaction in
  `src/cashierHud.ts` and `src/game/cashierChallenge.ts` in a busy shop.
- Tighten visual presentation, input responsiveness, readable receipt
  totals, gold/stock confirmation and existing checkout audio. Keep player
  feedback compact and within the current UI design system. A paid receipt
  must show actual collected gold/tips and offer E/Next for the next
  physically admitted, unpaid customer in the *same* dialog; Esc exits.
- Respect counter **staff-side** docking, real front-of-line admission,
  committed cart and receipt, one payment per shopper, and immediate
  physical departure on payment. Extra buyers stay at safe overflow spots.
- Fix observed repetition/friction; do **not** invent a new cashier economy,
  automate every sale, or introduce a second transaction path. Each cart
  still requires its own two confirmed timing stages.

**Acceptance:** A crowded live browser test pays several actual carts
without overlapping register admission, duplicate gold, phantom receipts
or unnecessary pointer-lock roundtrips. Human playtest judges pacing.

## Feature work package 2: Stocking ergonomics

**Delivery status:** Shipped in merged PR #156. Shift+click fills/clears the aimed slot atomically through existing transfer rules; ordinary clicks remain single-unit and held clicks cannot spill into adjacent slots. Existing hand animation and SFX are reused.

**Player goal:** Respond to restock pressure quickly while still
physically operating the shelves.

- Try deliberate **hold-to-stock or Shift+click** multi-unit action,
  whichever behaves best with current pointer lock, hover and input rules.
  Preserve ordinary single-item left/right click.
- Reuse `GameStore.transfer` / `transferShelf` and current bag, slot
  capacity, item match and **unpaid-cart reservation** protections. Do
  not add another stocking inventory or bulk-transfer authority.
- Better feedback for successful placement, capacity and empty bag. Use
  the existing icon/hotbar language and SFX/animation hooks.
- Keep 60-second live restock requests and `F` as **selection only**;
  a request never automatically creates or purchases stock.

**Acceptance:** Rapid stocking cannot create free units, overwrite
customer-held items, exceed a shelf, or make UI and saved quantities
disagree. Include actual shelf-ray and mixed-customer browser regression.

## Feature work package 3: Distinct short customer reactions

**Delivery status:** Shipped in merged PR #157. Short, deterministic world-anchored reactions follow only observed pickup, payment, restock/credit petition, verified credit issue and walkout. One voice appears at a time, with no simulation changes.

**Player goal:** Recognizable, darkly funny customers rather than bots
without halting the shop loop for dialogue.

- Short lines/gestures based on **already-known** intent, gold,
  equipment, transaction, stockout, credit, survival and repeat visits.
- Keep messages brief enough for an active register; stagger, rate-limit
  and prioritize, with no overlapping wall of text and no invented
  knowledge of unviewed future dungeon outcomes.
- Use existing hero identities and visualization events, not a second
  shopper behavior tree, new budget RNG or blocking dialogue framework.
- Galvik's potential future role as a lounging, insulting non-player
  commentator is **OPEN story/gameplay design**. This PR must not
  silently implement a protagonist transfer or declare story canon.

**Acceptance:** Repeatable, correct reactions under load; barks never
change purchases, pathfinding, request timers or deterministic outcomes.

## Feature work package 4: Shop → dungeon consequence feedback

**Player goal:** Care what happens to customers **after** their purchase.

- Make the existing links from real sales, equipment, HP supply and
  later **committed** expedition events legible through returning
  adventurers, roster/history, ledger and replay views.
- Give the player understandable feedback on survival, wounds,
  equipment and lost customers when that outcome is legitimately known.
- Preserve spoiler sealing: Level 6/7 footage never rerolls; unwatched
  outcomes do not leak through summary, NPC speech or business HUD.
  Floors 1–4 remain offscreen until separately designed and implemented.
- Do **not** introduce an unapproved always-running 24-hour dungeon,
  arbitrary floor-6 deaths, a 100-floor content claim, or new unearned loot.

**Acceptance:** Starting with known sales, a recorded day and its
replay/reload yield exactly the same economy and hero outcome; the
narrative UI communicates cause and uncertainty honestly.

## Feature work package 5: First ten-day playability and balance

**Player goal:** Ten days of coherent decisions, progress and tension
rather than a technically correct but repetitive loop.

- Run repeatable simulations across varied seeds, shelf layouts,
  physical traffic and buying behavior, and one or more real browser
  playthroughs from a **fresh empty-shelf campaign**.
- Record economy dynamics: purchases, unsold/expired requests, debts,
  stocking effort, queue delays, survival and meaningful player choices.
- Tune values only where data or playtesting demonstrates actual
  frustration, empty days, unearned scarcity or runaway money. Document
  which numbers were changed and why.
- Verify mining/placement, bedtime, pending carts, day ledger, save
  reload and replay semantics through the whole period.
- Do not hide balance flaws by handing out free goods or adding
  hunger/starvation; leave unrelated giant rewrites out of scope.

**Acceptance:** Ten-day deterministic progression can be reproduced
and the player has understandable, consequential choices. Repeated
campaigns and layouts do not reveal a hard lock or money duplication.

## Work discipline for every upcoming PR

1. Inspect the latest `main`, current open PRs, the actual affected code,
   [Game Bible](GAME_BIBLE.md), [Architecture](ARCHITECTURE.md),
   [UI contract](UI_DESIGN_SYSTEM.md) when relevant and [AGENTS](../AGENTS.md).
   **Do not implement from an old conversation or guessed branch state.**
2. Build on established `GameStore`, `ShopServiceSpots`, the universal
   furniture registry, `NpcVisualSystem`, current UI tokens and real
   saved transaction records. No duplicate state machines or editors.
3. Make one cohesive PR per problem; implement and validate without
   unnecessary repeated approval pauses. Leave PRs **unmerged** unless
   the owner explicitly authorizes merging.
4. Preserve determinism, truthful accounting, physical access, save
   validation and spoiler-safe replays. Add narrow unit tests and the
   relevant existing Playwright scenario. Do not grow the default CI
   indiscriminately.
5. Update **current** behavior in the affected documents in the same
   feature PR; remove superseded claims rather than appending history.
   Verify actual CI results before claiming a build or test passed.

## Out of scope / still OPEN

A continuous concurrent shop-and-dungeon clock, a 100-floor implementation,
player-controlled pricing, a new game engine, a save migration strategy,
final curse mythology, a forced protagonist swap and additional broad
furniture systems have **not** been approved as part of these five PRs.
Their existence in a brainstorm is not implementation authorization.

This file is a plan. **GitHub source, tests and the current PR list decide
what exists.** Update this roadmap in place when scope or priorities change.
