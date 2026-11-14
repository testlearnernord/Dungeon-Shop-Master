# Working on Dungeon Shop Master (human and AI contributors)

**Before editing gameplay, story, UI or architecture:**
1. Read [docs/GAME_BIBLE.md](docs/GAME_BIBLE.md): approved vision, rejected ideas and open decisions.
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): source map, system boundaries and invariants.
3. Read [README.md](README.md), then inspect the **current source and tests** for the feature you are touching.

## Source-of-truth rules

- **Current behavior:** code, asset data, tests and verified runtime output.
- **Approved intended behavior:** decisions marked **LOCKED** in the Game Bible.
- **Unresolved behavior:** items marked **OPEN**. Ask the project owner to decide, or implement nothing dependent on that choice. Never invent canon.
- Historical chat messages, old roadmaps, mockups and unmerged experiments are not authoritative.
- If a design decision and implementation disagree, report it explicitly. Do not claim a documented feature already works merely because it is planned.

## Non-negotiable current project decisions

- Heroes have HP and dungeon risk, **not hunger or starvation**. Waybread heals HP; Healing Herbs heal more.
- Heroes autonomously decide what to buy. The player influences them through shop choices.
- Replays display already committed simulation; opening or replaying must not reroll outcomes.
- Furniture previews do not modify saved state. Committed furniture placement must preserve customer service paths.
- The young hero's **conscious acceptance of the curse** is approved narrative direction; the curse's mechanics, Galvik's origin, the amulet, Level 100 and finale are **not finalized**.
- Browser/Babylon.js/TypeScript is the current implementation, **not** an irrevocable platform decision.

## How to change things

1. Inspect the involved modules and their callers before writing code. Prefer small, focused changes and reuse existing rules.
2. Preserve authoritative state transitions, replay determinism and item/economy invariants.
3. For furniture and other high-frequency interactions, avoid expensive validation during every mouse move; measure before broad optimizations.
4. Add focused regression coverage for behavior you change. Avoid unrelated tests or CI expansion.
5. Run appropriate build/tests when possible, and disclose what was **not** run.
6. Update [docs/GAME_BIBLE.md](docs/GAME_BIBLE.md) and/or [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) in the same PR if a decision, rule or system boundary changes.
7. Record new approved decisions with date, status and rationale. Mark superseded decisions explicitly rather than silently erasing them.
8. Do not create save migrations, new mechanics, large engine rewrites or story canon without an explicit reason and current approval.

## Communication

- State what was read and actually changed; do not imply a branch, build, PR or merge succeeded until verified.
- Distinguish **implemented**, **planned**, **proposed**, and **unresolved** work in summaries.
- When a choice is genuinely needed, bring the narrow decision to the owner instead of silently deciding for them.
