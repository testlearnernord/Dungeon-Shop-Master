# Phase C1 — obsolete night-only hero/replay projections

> Code-review evidence at the PR #238 branch baseline, 21 November 2026. This is a focused dead-code audit, **not** a claim that the entire TypeScript tree has been exhaustively analyzed.

## Actual owner shift

The night book was reduced to genuine merchant accounts. The physical LIVE Board and expanded R roster now read the same `src/game/liveBoardProjection.ts`; the intentionally opened bounded timeline reads `src/game/expeditionArchive.ts` and playback from `src/game/dungeonReplayPlayback.ts`. The merchant ledger `src/merchantLedger.ts` imports neither of the obsolete nightly projections.

| Old code | Observed consumers on the baseline | Replacement and safety tests |
| --- | --- | --- |
| `src/ledgerHeroChronicle.ts` | `tests/unit/ledgerHeroChronicle.test.ts` only; no live `src/` imports | `src/game/liveBoardProjection.ts`, exercised by `tests/unit/liveBoardProjection.test.ts` including unknown remote HP/gear/death and genuine non-spoiler death signals |
| `src/ledgerSealedExpeditions.ts` | `tests/unit/ledgerSealedExpeditions.test.ts` only; no live `src/` imports | `src/game/expeditionArchive.ts`, exercised by `tests/unit/expeditionArchive.test.ts` including real committed timeline, bounded retention, bookmarks, replay pins, save/reload and the new secret-state no-leak regression |

Both old modules implement *retired* night-only UI data contracts. They are no longer used by `merchantLedger.ts`, `rosterBoardHud.ts`, `expeditionArchiveHud.ts` or the rendering setup. The old tests exclusively import the modules being removed. Their historical behavior is in Git history, not retained as parallel live authorities.

## Exact C1 change

Remove the two unused production modules and their two now-orphaned unit test files. **Do not delete** `src/ledgerViewState.ts`: the current two-page merchant ledger still imports its valid navigation recovery. Keep `src/merchantLedger.ts`, `gameState.advanceDay`, `level6Combat.ts`, replay disclosure compatibility and all source assets: they have active or test/compatibility callers.

Add one current-route regression: the Expedition Archive must remain **read-only**, must not leak an unobserved victory/death/secret loot/XP/gold through its listing, and must still identify real saved recordings without replay simulation.

## Verification gates

- Use code search/import references on the current branch and review all deleted functions before relying on dead-code classification.
- Run TypeScript/Vite build, all unit tests, both browser smoke shards; the code import graph must fail the build if a real application import was overlooked.
- The current LIVE Board secrecy, death-signal and archive lifecycle tests must remain and pass.
- No money, combat, time, customer pathing, art, SFX, GLB or player UI implementation changes. This is strictly removal of old unused exports.
- Re-audit any other potential duplicate in a separate PR; a name like `legacy` does **not** establish that code is unused.

## Measured scope and honest limits

The two removed source modules previously occupied **10,714 bytes** of tracked TypeScript; their two obsolete, module-only tests occupied **8,709 bytes**. The new current-route archive regression adds roughly **1.6 KB** to the existing test suite. Those old modules were not imported into the browser application, so this change is **maintenance simplification**, not a claimed runtime FPS or download-size improvement.

GitHub code-search results establish absence of ordinary imports at this audited revision, not a universal proof of every possible reflection/dynamic import. The production TypeScript/Vite build and the two browser-smoke shards are required to detect an overlooked real dependency. Do not expand this deletion to fixture-only combat or day-closure authorities without a separate call-site review.
