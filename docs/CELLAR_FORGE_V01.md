# Keller-Schmiede V0.1 — material-to-gear contract

> Owner priority 24 November 2026. Implemented in draft PR #345; only a green
> merged PR changes `main`. This replaces the old one-sword-for-all-class
> assumptions without importing an Alpha save migration.

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
- Shop stock initially reuses the two checked-in sword and vest GLBs as
  **temporary** stock geometry for new tiers/weapon families. Tier icons,
  distinct class weapon silhouettes on heroes and the functional anvil are
  already new. Premium models for shelves and hand-carried products are a
  separate art acceptance step, not fake claims of finalized geometry.
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
