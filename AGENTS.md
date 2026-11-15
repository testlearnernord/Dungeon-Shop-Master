# Dungeon Shop Master — Contributor Guide

> **Living instructions for human and AI contributors.** These rules describe how to work against the **current** project. Keep this file, `docs/GAME_BIBLE.md` and `docs/ARCHITECTURE.md` synchronized with each relevant change. Obsolete instructions must be replaced or deleted, not accumulated.

## Before editing

1. Read [Game Bible](docs/GAME_BIBLE.md) for accepted gameplay direction, deliberately removed systems and **OPEN** narrative questions.
2. Read [Architecture](docs/ARCHITECTURE.md) for authoritative state, preview/commit boundaries and the current code map.
3. Inspect [README](README.md), actual affected modules, callers and tests on the **current base branch**. Do not implement from remembered code or an old chat summary.
4. Distinguish what the user has **explicitly decided** from suggestions, mockups, previous assistant plans and unfinished experiments.

## Sources of truth

- **Implemented behavior:** current source, assets, tests and verified runtime.
- **Approved direction:** current owner-approved decisions marked **LOCKED** in the Game Bible.
- **Unresolved direction:** **OPEN** means not decided. Do not silently introduce canon or a speculative mechanic.
- **Newest explicit owner instruction wins** if it conflicts with an older document. Update the affected documentation **in the same PR** rather than following stale guidance.
- Documentation never proves a feature is implemented. A screenshot, concept mockup or AI proposal is not approval on its own.

## Current hard boundaries

- Shopkeepers influence autonomous hero purchasing through shop operations; do not convert their choices into direct orders.
- **No hunger/starvation system.** Waybread and Healing Herbs heal HP. Dungeon casualties require actual damage through zero HP, never a separate arbitrary instant-kill roll. Offscreen deaths are not automatically replay-verified memorials.
- Replays visualize **committed** results. Do not re-resolve fights or leak unwatched outcomes through the day ledger.
- Furniture previews are non-mutating; committed placement must preserve customer route/service access and movable interaction targets. The register is operated only from its staff docking side; customer queues use a separate facing socket.
- Source currently uses TypeScript/Vite/Babylon.js and strict save/version validation. Do not introduce an engine rewrite or save migration without a reason and current owner decision.
- **Story causality remains OPEN.** A young hero willingly inheriting a curse, an amulet, a mercenary leader, Floor 100 and Galvik's eventual role are not final canon. Do not “lock” them merely because they appear in a brainstorm.

## How to implement changes

1. Inspect existing rules and reuse systems instead of creating parallel state, UI or furniture editors.
2. Work in a cohesive PR; do not produce a string of tiny PRs for one unfinished feature. If scope is clear, implement and validate without repeated approval pauses.
3. Preserve deterministic simulation, economy invariants, replay correctness, save safety and NPC navigation.
4. Profile high-frequency work before optimization, particularly blueprint/pathfinding loops. Do not put expensive validation in render-frame hover paths.
5. Test the actual risk with small unit coverage and targeted browser regression; respect the repo's deliberately lean CI.
6. Inspect CI and review feedback, fix concrete failures and merge only after the required checks pass when merging is requested/authorized.
7. State exactly what was inspected, changed, tested, merged and deployed; do not report an intended action as completed.

## Mandatory three-file documentation review for every PR

Before marking a PR ready, **review all three** documents against its changes:

| File | Update when… |
| --- | --- |
| [Game Bible](docs/GAME_BIBLE.md) | The game gains/loses functionality, accepted design changes, a hypothesis is approved/rejected, or a story decision genuinely becomes canon |
| [Architecture](docs/ARCHITECTURE.md) | Modules, state ownership, saving, data flow, replay semantics, interfaces, technical constraints or CI workflow change |
| [AGENTS](AGENTS.md) | Contributor procedure, coding/testing expectations, source-of-truth rules or project invariants change |

- Update impacted sections **with the feature PR**, not in an indefinite later cleanup.
- **Replace/remove old descriptions** immediately when no longer true. Never keep competing “old/new” active instructions or append dated versions of the same section.
- Do **not** mechanically edit unrelated files to manufacture a documentation diff. If a document genuinely needs no change, leave it intact.
- In the PR description, include a short **Docs review** note stating which of the three were updated and which were reviewed without change. The reviewer can then see that nothing was overlooked.
- Do not turn the Game Bible into a changelog: Git history is the archive; the docs are the current working reference.

## Communication and story decisions

Call a change **CURRENT/implemented** only after verification; call an idea **OPEN/proposed** until the owner approves it. If a fundamental story choice remains undecided, keep implementation independent of that choice and document the uncertainty. Do not invent final lore simply to make a coding task easier.
