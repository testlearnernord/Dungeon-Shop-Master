# Phase C3 — retire inactive group-boss adapter, protect the real boss

> **C3 merged as PR #241**, 21 November 2026, after C2 (#240). This is a historical scope/evidence contract, not a new boss design. No new player mechanic or change in combat outcomes is intended.

## Proven real ownership

The current, **production** Floor-6 boss is owned by `src/game/liveDungeonRuntime.ts`:

- One eligible hero is chosen in roster order when the unique monster is encountered; subsequent eligible heroes cannot create a duplicate active Troll.
- Its state comes from `createCombatPreview` in `src/game/arenaCombatMotion.ts`, with authentic grab/throw, lava, sword parry, dodge, hit timings and original BossReplay v1.
- The same world clock commits 30 actual 60-Hz `stepCombatPreview` ticks per 10 world ticks, independently of render or spectator.
- Save/reload strictly validates the active state in `src/game/liveBossSave.ts`; rewarded outcomes settle only once. Both real unit tests and browser smoke tests exist.

The **separate** `src/game/liveBossEncounter.ts` module was the one test-only C2 source. It exports a hypothetical three-hero `GroupCombatOptions` factory and duplicated Troll ID/HP constants, but the real game imports **none** of it. Its only importer is `tests/unit/liveBossEncounter.test.ts`. That test exercises a legitimate group engine **through a dead adapter**, not the game’s authoritative Floor-6 encounter. In particular it cannot establish that multiple heroes actually fight the Troll today.

## C3 scope

1. Remove the unreferenced-by-gameplay 2,180-byte module and its isolated 1,870-byte adapter test; keep Git history for provenance.
2. Add a **real GameStore test** to `tests/unit/liveBossWorldClock.test.ts` for two simultaneous Floor-6 explorers: only one saved Troll fight, stable roster-order challenger, one scheduled world event, no fake second group encounter or phantom damage, current-version save/reload, and real 60-Hz progress.
3. Retain `tests/unit/combatSignatureAbilities.test.ts` (still validates shared Smash/Slam/Grab and multi-actor group signature ability), `tests/unit/level6GrabThrow.test.ts`, `tests/unit/liveBossWorldClock.test.ts`, `tests/liveBossWorldClock.spec.ts`, and all boss audio, animations, Tripo sources and 3D scenes.
4. Do not modify combat state, timing, RNG, world code, assets, UI or runtime imports; no change to V.003 feature scope. **Multi-hero unique Troll fights remain unimplemented**, not intentionally rejected.

## Verification / risk gate

- An import graph or plain-text search alone is insufficient; the actual construction/scheduler and source-level callers were manually inspected.
- Run all unit tests, clean build and both browser-smoke shards. The new test protects actual boss uniqueness rather than merely verifying an unused helper.
- Game design and visual acceptance remain separate from CI. Deleting the unused adapter does **not** prove FPS, JS bundle or runtime memory improvement; it removes only inactive source/test maintenance burden.
- C2 #240 and C3 #241 are merged with explicit owner approval. C3's [full PR CI](https://github.com/testlearnernord/Dungeon-Shop-Master/actions/runs/44888389226) passed build, units and both browser shards. Future changes still require independent CI and owner approval.
