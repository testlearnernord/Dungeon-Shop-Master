# Dungeon Shop Master — active roadmap

> Current planning snapshot after merged PR #243, 21 November 2026. **Not a PR history.** Verify current `main` and open branches before work. The browser still labels the game V.002 ALPHA; V.003 ALPHA is a release target. Source and tests establish feature status, not earlier roadmap promises.

## Completed foundations (IMPLEMENTED; do not schedule again)

- Shared deterministic 50-ms world clock, in-day shop activity and real connected dungeon steps.
- Real 60-Hz scheduled group fights, preserved authentic Floor-6 Cave Troll combat and reusable encounter driver; multi-Ghoul packs and existing boss signature actions.
- Physical shopper exits and two full off-duty days; stored safe reentry without invented healing.
- LIVE merchant Board and spoiler-safe death signals; bounded three-day Expedition Timeline with up to 12 manually pinned recordings.
- Floor-wide LIVE spectator for supported Floors 1–4 and 7, abstract combat beacons and optional premium 3D arenas; separate historical playback.
- V Developer Combat Lab with editable heroes, enemies, arenas and actual 60-Hz production engine; smooth per-display-frame interpolated presentation of committed 10-Hz checkpoints (PR #233).
- Approved 21 Ghoul WAV samples integrated into LIVE, historical 3D replays and Combat Lab, plus preserved Cave Troll cues (PR #234).

These are **foundations**, not proof of full V.003 release readiness.

## Completed milestone: The Great Cleanup

Owner rule: **no lost gameplay, scenes, animations, cues, saves, rendering quality or score; no automatic merges.** All sub-PRs require separate review.

| Phase | State | Work |
| --- | --- | --- |
| A1: audited baseline | **Merged (#235)** | Source-verified inventory, contradictions, and original safety baseline |
| A2: living documentation | **Merged (#236)** | Replace dated PR accumulation in README/AGENTS/Architecture/Bible/Roadmap with current module map, approved choices and status distinctions |
| B1: audio ownership | **Merged (#237)** | Proposed removal of one exact root music copy; canonical audio untouched; generated Ghoul GLB ignored and owners documented |
| B2: model provenance | **Merged (#238)** | Archive the original Troll Grab/Throw source with unchanged Git blob; update generator, manifest, docs and integrity test |
| C: TypeScript | **Merged (#239–241)** | Retired obsolete nightly ledger projections, audited module reachability and removed the unused group-boss adapter while preserving the real LIVE Troll with new tests |
| D: CI and acceptance | **Merged (#242–243)** | Pages build verifies dist/ assets; the measured closeout ledger documents confirmed CI/deploy results and explicitly open full-browser/device/audio/FPS sign-offs |

See [CLEANUP_AUDIT.md](CLEANUP_AUDIT.md) for the source-verified A1 baseline and known risk classifications.

## Current milestone: V.003 gameplay and acceptance

**P0.1 review draft (#244):** trace paid, stocked Iron Sword and Leather Vest through a legitimate manual checkout into the **actual saved** unique Troll encounter, comparing a nonbuyer control and checking exact 60-Hz Save/Reload. This is a test-only boundary proof, **not** a claim that a complete ten-day played economy, physical portal or purchased-equipment outcome balance is accepted. The broader ten-day browser test already checks world/ledger/replay retention, but deliberately has zero physical sales. 

## Remaining V.003 work (PARTIAL / PLANNED)

### P0 — preserve truth, improve understanding and acceptance

- **PARTIAL:** run a representative ten-day uninterrupted/paused/reloaded campaign covering physical sales, debt, real equipment effects, genuine casualties, Temporary Parties, renewable sites, returns and historical records. Validate that players can explain why an item mattered. Keep existing strict v24 saves deterministic.
- **PARTIAL:** actual browser evaluation of Troll and Ghoul facing, hits, animation blending, leap/impact/death, camera intros, multienemy composition and Ghoul SFX layering. Approval cannot be inferred from green unit tests.
- **OPEN PERFORMANCE GATE:** profile representative player hardware and browsers; identify genuine render vs. simulation bottlenecks without reducing combat authority or silently lowering native rendering quality. Check scene cleanup and render-frame churn.

### P1 — complete the living physical dungeon

- **PARTIAL:** seed/persist additional authored floor content, connective progression, observable threats and regenerating common sites beyond current 1–4 and 7.
- **PLANNED:** replace the current numbered-floor shop doors with one **unnumbered cursed special-floor shop** and a physically represented two-way portal. Preserve all legitimate customer queue/service access.
- **PLANNED:** a hero choosing an upward transition from any depth can abort an expedition and enter that one shop, then physically depart and remain off-duty for two complete game days. The *existing* departure/cooldown engine is foundational but does not establish full portal semantics.
- **PLANNED:** meaningful first **ten-floor** chapter, individual **Floor-10 pass** and fair reentry/progression gate. Troll relocation to Floor 10 is **OPEN** pending design and regression of the authentic Floor-6 encounter.

### P2 — meaningful risk, economy and clarity

- **PARTIAL:** demonstrate purchased weapon/armor/HP supply effects in saved combat and resource decisions; ensure renewable farming remains finite and non-exploitable.
- **PARTIAL:** improve comprehensibility of actual last-known Board HP/equipment/intent, death warnings, source provenance, multi-hero party status and event jump links without exposing secret state.
- **OPEN:** additional shop inventory, broader item crafting, cellar/forge/pond and extra hero wearable rigs require separate decisions; not automatic V.003 promises.

## V.003 release gates

1. Real item choices measurably affect recorded survival and the shop ledger without invented bonuses.
2. Dungeon/shop share one persisted clock, exact event ordering and deterministic current-version Save/Reload; no extra authoritative combat engine.
3. Distinctive connected renewable levels and legitimate exploration/party progress support a meaningful first chapter, not fake 100-floor coverage.
4. One cursed physical shop portal, sensible any-depth abort/return, two full off-duty days and a tested individual Floor-10 pass.
5. LIVE Board/Archive are readable, spoiler-safe and historically correct; player can replay selected authentic footage without mutating results.
6. Ten representative game days offer noticeable progress in shop, heroes and dungeon.
7. Build, relevant unit, browser, visual, audio, Pages and real-device performance acceptance pass while preserving the Cave Troll quality bar.

## Explicit non-goals and decisions still open

Hunger, arbitrary three-phase daily engine, fake replay video and automatic endless archives are **REJECTED**. Full 100-floor release, protagonist transfer/curse ending, forge/pond and big new economy systems are **DEFERRED or OPEN**. Do not convert speculative lore to locked canon.

**Delivery discipline:** keep each feature/cleanup PR cohesive; inspect actual code and the [architecture](ARCHITECTURE.md), [Game Bible](GAME_BIBLE.md) and [AGENTS.md](../AGENTS.md). Update status in place, run the relevant checks, state what is and is not proven, then wait for explicit merge approval.

## V.004 concept prototype (unmerged branch)

The V.004 **walkable cellar** is being prototyped independently of outstanding V.003 release gates. The proposed change makes Galvik's beloved portrait a fixed hinged doorway in his rear bedroom wall and extends the same Babylon shop scene with a sloping stair and lower cave. Cellar excavation reuses `excavateLevel5Cell`, `level5RockFaces` and `createLevel5RoomVisuals`; the first chest reuses the canonical furniture registry and P blueprint/commit. Its door, room cells and furniture transform persist on the same campaign state/world clock (strict save version 25). No new economics, fishing, pond or dungeon simulation is included. Playwright and human in-browser staircase/collision checks remain a release gate.

## V.004 pond and fishing (PR #253; draft, not released)

A sealed two-by-three basin occupies connected left-side cellar excavation
cells `x=-8,-9`, `z=-1..1` in room-local coordinates. The existing U pickaxe
must excavate all six before a water-surface interaction appears. The pond is
rendered in the same physical shop scene, with no added time or inventory owner.
The first fishing implementation is intentionally small: cast, wait for bite,
land three direction/speed-validated pointer-lock mouse flicks before three
misses, and receive a durable trophy count through GameStore. The existing SFX
mixer plays provisional cast/bite/flick/miss/catch sounds. No saleable fish or
independent fishing economy yet.

### Acceptance gates
- Real U excavation of each pond tile, water only after all six cells
- Enter and leave the fishing interaction with E / Esc
- Mouse delta quality and miss/timeout validation
- Original Babylon FPS controls restored after closing the game
- Existing shop/dungeon shared clock continues while the fishing UI is active
- Mute/volume honored, no duplicate sound engine
- Saved fish count survives strict load; shop economy stays untouched
- Browser smoke, manual pointer-lock feel and actual audio check
