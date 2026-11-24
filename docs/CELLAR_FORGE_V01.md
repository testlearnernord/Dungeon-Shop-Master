# Cellar Forge V0.1 / V0.2 — material-to-gear contract

> V0.1 shipped in PR #345; V0.2 A integration and catalog costs shipped in
> PR #346. The class-specific equipment model requires no additional migration.

## One physical chain, one source of authority

1. Ordinary committed dungeon **Ghoul fights** roll deterministic real loot,
   including **Ghoul Leather**. Iron Ore and Coal are existing dungeon salvage.
2. Only living **physically returned** adventurers may offer their own saved
   `inventory.finds`. Galvik pays the offered price from real gold.
   `dungeonBuyback.ts` moves material immediately into
   `shopEconomy.materialStorage`; the 24-slot shopping bag stays reserved for
   finished merchandise.
3. Galvik approaches the **physical anvil in the cellar**, uses E or clicks it,
   and deliberately forges one item. `cellarForge.ts` checks all inputs and
   bag capacity before one atomic transaction, consuming every input once.
4. Exactly one crafted T2 item enters Galvik's bag. It still needs a real
   placed shelf, stock transfer, customer intent, actual held cart and staffed
   checkout to become a paid sale. Forging alone adds **zero merchant income**.
5. The hero equips only their **class-compatible** new gear, and the existing
   60Hz `groupCombat.ts` uses the same tier data as the UI and floor 10.

## First-tier product matrix

| Hero | T1 wholesale | T2 forge-only | Primary authentic advantage |
| --- | --- | --- | --- |
| TANK | Sword & Shield (one Weapon item) | Forged Sword & Shield | Melee damage plus extra protection |
| DPS / DD | Spear | Forged Spear | Stronger damage and melee reach |
| HEALER | Staff | Forged Staff | Magic heal charges and magical/ranged attack |
| All | Leather Vest | Ghoul Leather Vest | Armor and lower actual trap damage |

Initial, deliberately small recipes:
- Each T2 weapon: **1 Iron Ore + 1 Coal**.
- T2 Ghoul Leather Vest: **2 Ghoul Leather**.
- No free materials, invented smithing timers, recipe RNG, T2 wholesale,
  offscreen auto-crafting, free shelves, or new merchant authority.

## Compatibility and visuals

- The existing `iron-sword` economic ID is now the Tank T1 Sword & Shield.
  The existing `leather-vest` is the T1 armor for every class.
  The two historical internal equipment labels `Iron Sword` and `Leather Vest`
  remain valid for real recorded T1 objects; the displayed names clearly show
  the tier. Other T1/T2 gear has distinct stable item IDs.
- The V0.2 equipment presentation pass replaces the initial stock fallback
  with separate authored GLBs for every weapon family and tier. Shelves
  and carried products share these canonical models; equipped heroes
  retain their role-specific meshes with tier details. See
  [Equipment presentation V0.2](EQUIPMENT_PRESENTATION_V02.md).
- A **fresh Alpha v38** is required because material reserve and bag schemas
  changed. Unsupported old saves fail clearly without a conversion layer.

## Verification and next step

- Real buyback payment, 3 material reserve values, exact recipe consumption,
  full bag rejection, true T2 sale/upgrades, class enforcement, 60Hz fight
  effect, Ghoul-only leather source and strict Save/Load have explicit tests.
- Human sign-off still requires physically using the cellar anvil, stocking a
  shelf, completing a staffed sale, seeing new weapon meshes and comparing
  fights without/with T2, plus FPS/audio inspection.
- **Do not start the long-game economy audit #294 or conceptual PR #350+ until
  after this first forge cycle is accepted and the owner requests it.**

## V0.2 B — autonomous supply chain

- A real chest or Ghoul victory can trigger a haul return at four carried
  finds, only when LIVE settlement actually increases ownership. Dry fights
  and stale unsold stock alone do not restart a shop journey.
- Existing backtracking, the entrance tile and portal transit own arrival.
  Material ownership stays with the hero until Galvik explicitly pays.
- Credit uses canonical gear names and class/tier checks, consumes real stock
  and records debt without creating merchant revenue.
- Bounded integration fixtures use generated sites and the real 60Hz motor,
  with controlled prior inventory, position and budget; physical browser
  checkout also checks departure. The existing two off-duty days remain.
  No economic soak or balance adjustment is part of this acceptance step.

- A won Ghoul encounter atomically resolves the site and removes the live map
  occupant in the same combat tick. Saving before the next movement step is
  valid; the strict validator is not relaxed to accept a defeated pack.

- The fixed workshop and its positive-Z working approach are reserved by the shared cellar furniture placement rules. Preview, commit and strict save validation reject chest/table overlap; the renderer shares the same workshop position. Other supported cellar placements remain movable.
