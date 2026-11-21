# V.004 LIVE Dungeon · Map Readability and Autonomy

## Current integration order

1. **PR #261**: Camera and LIVE floor map. Correct W/S, two-button drag
   orbit/tilt, focus zoom, a modern compact spectator HUD, Ghoul icon
   portraits, source-derived counts, hover tooltips and up to two preview
   route arrows. The same saved scene and the opt-in combat arena remain.
2. **PR #262** (this branch): One real spatial move every **200 world ticks
   (10 unpaused real seconds)**, down from 600 ticks (30 seconds).
   No simulation runs in the rendering frame loop. Bedtime processes all
   committed clock events; the page viewer remains read-only.
3. The saved AI can now select `loot-chest` or `hunt-ghouls`, preferring
   a personally visited or immediately adjacent unresolved site. Greedy
   adventurers prioritize a chest; equipped or brave heroes may pursue a
   known active Ghoul. Goals commit only on real world-clock steps and the
   existing spatial resolver still owns every connected tile, combat and
   reward. Path overlays are short, explicitly *forecast* intentions and
   never authorize a movement outcome.
4. All existing chest gold/abstract loot and Ghoul XP/gold/temporary-party
   shares continue to use the same existing settlement. **Concrete
   inventories (ore, coal, herbs, swords, leather armor) and player
   buyback interactions are a distinct pending inventory/economy PR**.
   Do not display fabricated loot, promises or automatically transfer
   stock to Galvik before implementing its real ownership ledger.

## Performance / world safeguards

- Maximum one genuine tile per ten seconds per active solo/party; no
  per-frame AI, fake animation checkpoints, resimulated combat or camera
  authority over gameplay.
- Keep the battle's original 60Hz fighter frames and 0.5s clock event
  cadence; the abstract map displays only markers.
- Existing campaigns with pending 600-tick events may need an explicit
  migration before this scheduling change is deployed; the strict save
  validator will not silently accept inconsistent timers.
- Verify deterministic watched vs unwatched expedition outcomes, 3D map
  performance, real hero knowledge, and shop/dungeon clock parity.
