# Dungeon Shop Master — Next Development Pass

> **Working roadmap, reviewed 2026-11-16.** This is a prioritized,
> owner-accepted direction. **PR #153 (cashier) and #154 (physical
> merchandise assets) are already merged.** Further package numbers are
> not reserved: GitHub numbers do not match this conceptual roadmap.
> This is **not** a list of completed gameplay changes or final approval
> of every design detail. Inspect `main`, open PRs and CI before starting.

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

**Delivery status:** Implemented on the feature branch pending CI and review: Shift+click fills/clears the aimed slot atomically using existing transfer rules, normal clicks remain single-unit and held clicks never spill into adjacent slots. Existing hand motion and SFX are reused.

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

## Feature work package 4 (tentatively PR #156): Shop → dungeon consequence feedback

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

## Feature work package 5 (tentatively PR #157): First ten-day playability and balance

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
