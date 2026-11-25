# Cellar Forge V0.1 / V0.2 — material-to-gear contract

> Current contract: Alpha v42, including physical automatic buyback. The functional V0.1/V0.2 forge is merged; manual acceptance is tracked in #294.

## One physical chain, one source of authority

1. Ordinary committed dungeon **Ghoul fights** roll deterministic real loot,
   including **Ghoul Leather**. Iron Ore and Coal are existing dungeon salvage.
2. Living **physically returned** adventurers with affordable forge materials
   walk to the open Recovered Goods Chest before shopping. Galvik automatically
   pays the canonical price from real gold at its service dock.
   `dungeonBuyback.ts` moves the paid material into
   `shopEconomy.materialStorage`; the 24-slot bag remains for merchandise.
   Other finds and unpaid materials stay with their owner.
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
- Alpha v42 is the only supported campaign schema. Reject v41 and earlier explicitly; no migration or legacy adapter. Current-format Save/Load must be deterministic.

## Verification and next step

- Real buyback payment, 3 material reserve values, exact recipe consumption,
  full bag rejection, true T2 sale/upgrades, class enforcement, 60Hz fight
  effect, Ghoul-only leather source and strict Save/Load have explicit tests.
- Human sign-off still requires physically using the cellar anvil, stocking a
  shelf, completing a staffed sale, seeing new weapon meshes and comparing
  fights without/with T2, plus FPS/audio inspection.
- The current acceptance scope and historical campaign evidence are in [Alpha v42 acceptance](ALPHA_V42_ACCEPTANCE.md); no additional forge backend work is planned without a reproducible defect.

## V0.2 B — autonomous supply chain

- A real chest or Ghoul victory can trigger a haul return at the canonical
  material threshold (four early-game units, higher for prepared explorers), only when LIVE settlement actually increases ownership. Dry fights
  and stale unsold stock alone do not restart a shop journey.
- Existing backtracking, the entrance tile and portal transit own arrival.
  Material ownership stays with the hero until the actual automatic paid drop-off.
- Credit uses canonical gear names and class/tier checks, consumes real stock
  and records debt without creating merchant revenue.
- Bounded integration fixtures use generated sites and the real 60Hz motor,
  with controlled prior inventory, position and budget; physical browser
  checkout also checks departure. Reentry now uses the shared health-dependent world-clock recovery.
  Historical integration fixtures are not a manual full-campaign sign-off.

- A won Ghoul encounter atomically resolves the site and removes the live map
  occupant in the same combat tick. Saving before the next movement step is
  valid; the strict validator is not relaxed to accept a defeated pack.

- The fixed workshop and its positive-Z working approach are reserved by the shared cellar furniture placement rules. Preview, commit and strict save validation reject chest/table overlap; the renderer shares the same workshop position. Other supported cellar placements remain movable.

## Automatic physical intake (introduced in Alpha v41)

The open Recovered Goods Chest replaces manual offer purchase UI. The existing customer motor walks to the reserved service dock, pauses for the drop-off gesture and invokes the sole paid buyback mutation once for the affordable haul. One receipt per unit is committed atomically. Materials bypass the bag and enter the three workshop reserves. Insufficient funds leave unpaid goods with their owner; a closed chest is skipped. The player can toggle the real lid and acceptance with E or click; state is saved. The log is read-only. No new economy, automatic crafting or second pathfinding motor.
