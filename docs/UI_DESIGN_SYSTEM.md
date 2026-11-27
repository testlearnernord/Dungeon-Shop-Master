# Dungeon Shop Master · Immersive UI Contract

### Cave Troll presentation quality rule (owner LOCKED; current Floor 10)

The Cave Troll arena's framing, volumetric art, directional lighting, 3D character animations, focus/fly controls, world-space health plates and hit effects are the **reference for every opt-in fight**. Different enemies get different authored arenas and attacks; Temporary Parties add actors and bars without downgrading the presentation. The ordinary LIVE/replay dungeon map stays abstract. The common stage and world-projection implementation is `combatSpectatorStage.ts` and `combatHudProjection.ts`; the Crypt is a themed art variant, not an alternate combat engine. The Floor-10 Temporary Party boss uses the shared 60-Hz group motor; the former Level-6 solo arena remains a historical/training visual reference.


> **Current implementation contract, reviewed 2026-11-18.** Read this
> alongside [GAME_BIBLE](GAME_BIBLE.md), [ARCHITECTURE](ARCHITECTURE.md)
> and [ROADMAP](ROADMAP.md). Implemented capabilities and future packages
> are distinguished there; package numbers are not reserved.

## Purpose
Galvik's **unnumbered cursed shop** is a first-person **cave**, not a desktop dashboard. Gameplay,
exploration and characters should remain visible; management is accessible
through contextual controls and focused overlays.

Reference art is **inspiration**, not a rigid wireframe or production asset.
This document is a maintainable implementation contract.

## Three information layers
1. **Glance HUD**: day, gold, core actions, active population, six item slots,
   plus a **conditional** compact live-service strip. Idle state is collapsed
   and translucent. No broad opaque backgrounds or second dashboard.
2. **Context world UI**: action toast, hero nameplate, item request, a small
   real-shelf crosshair action cue, placement previews, bed prompts and
   spectator context. Icons and short numeric labels first.
3. **Management**: roster, wholesale, debt book, credit dialogue, the staffed
   register, merchant ledger, build editor and campaign controls. Darker
   focused overlays are appropriate when readable records require space.

## Foundations
- `src/immersiveUi.css` overrides the old CSS last. New UI should prefer the
  shared tokens `--ui-bg`, `--ui-glass`, `--ui-glass-strong`,
  `--ui-border`, `--ui-text`, `--ui-muted`, `--ui-gold`,
  `--ui-focus`, `--ui-danger`, `--ui-success` and `--ui-radius`.
- Sizes follow a 4px-based rhythm, with 32–44px interactive targets where
  space permits. Borders are subordinate to content, not the design itself.
- Headings use restrained fantasy serif; operations, metrics, numbers and
  microcopy use a clear sans serif. Maintain accessible contrast on bright
  floor tiles, lava and near-white combat effects.
- Core controls have stable DOM IDs, keyboard access, visible focus, semantic
  button text and shortcuts. `prefers-reduced-motion` must be respected.
- Tooltips may reveal text, but essential state must never be **icon-only**:
  quantities and danger states keep readable numbers or accessible labels.

## Icon registry
- All **items**: `public/assets/ui-item-icons.svg#<item-id>`, via
  `itemIcon()` in `src/uiIcons.ts`. Used by the stocking dock, wholesale,
  receipts, roster, wish bubbles and debt history.
- All **semantic controls**: `public/assets/ui-interface-icons.svg#<name>`,
  via `uiIcon()` and `setupInterfaceIcons()`. Do not introduce another
  competing atlas or emoji-based controls.
- The dynamic, canvas-rendered hero nameplate deliberately draws its own
  portrait, name, level, role, **real carried gold** and health bar, since
  it is rendered into a Babylon texture rather than the DOM.
- The live-service strip reuses `public/assets/ui-item-icons.svg` for a
  real restock item; do not create another request icon atlas. Gold uses
  the existing `public/assets/ui-gold.svg`.

## Surface coverage
| Experience | Contract |
| --- | --- |
| Shop header / day / gold | Tiny top-left glance; extra details behind disclosure |
| Hotbar | Five ~54px translucent saleable slots, no whole-bar background; quantities visible, item label on focus |
| Live service strip | Conditional small top-center chips for ready-to-pay customers, live expiring restock and credit requests; **F/click selects stock**, no automatic merchant action |
| Physical shelf focus | The wooden slot remains the only pick/collision target; each stocked unit is a real GLB-derived 3D mesh sharing its loaded geometry, not a billboard or UI sprite. Aimed slot shows item/count/capacity, left/right one-unit clicks, Shift+click fills/empties physical stock, not the assignment; held-cart/bag warnings. Middle-click assigns/toggles the selected quickbar product; a small physical paper label on the shelf lip persists at zero stock. No assignment dialog |
| Controls | Collapsed by default, expandable above the measured dock |
| Visitors / roster | Small glance cluster, full cards and tactical details on demand |
| Wholesale | Item symbols, search, gold, stock, actionable costs and limits |
| Debt Book / begging | Shared icons and controls, ledger-like typography and readable debt |
| Merchant ledger | Cinematic day-end chapter experience, consistent tokens and metrics |
| Cashier | Two-stage timed receipt overlay opened from the real staff socket; item pictograms, real collected gold and tip, paid receipt remains visible; **E** explicitly takes the next physically-ready customer's cart without a modal/pointer-lock roundtrip, **Esc** exits; the GameStore is the only payment authority |
| Blueprint / placement / mining | Context prompt and real-world ghost; not a permanent sidebar |
| World nameplates / request bubbles | Portrait, level, role, gold and HP; individual icon-based restock/credit requests with real deadlines; one optional short role/item-aware customer remark above a visible NPC at a time, without intercepting world input |
| Normal-floor / Troll spectator | Compact panels, optional controls legend, same focus style. The shared ordinary and Floor-10 stages support world-projected HP plates and cue-driven floating numbers: gold hero→boss, red boss→hero, orange lava, green healing. Numeric HP remains in the bottom HUD. |
| Combat Lab model inspector | In the existing spectator toolbar, `Inspect Tripo GLB` opens an explicit read-only asset inspection panel with a browser-local GLB file input, accessible animation selector, drag-orbit/zoom camera and Escape-to-return behavior. No saved fighter or combat details are written. The regular battle HUD and cinematic are hidden while inspecting. |
| Audio / notifications / campaign | Consistent accessible controls; LIVE enters immediately, local playback can show cinematic titles. |

## Adventurer Board and roster

The magical wall board is an operational LIVE glance, not a second archive or an event-only list of question marks. It uses `liveRosterCards` from `heroCardView.ts`, the same current hero projection used by E/R and the compact day HUD. It shows active/shop/fighting/fallen counts, up to ten prioritized living heroes (shop, critical health, combat, then depth), role, level, floor/activity, actual weapon/armor tiers, party size and current committed HP. Overflow opens the roster. The 1536×960 texture is sampled on meaningful roster changes and world ticks, not per rendered frame. Wall dimensions and placement authority remain unchanged.

The E/R roster keeps the shared Hero Card renderer. Expanded entries span the full row rather than stretching the adjacent card; the summary becomes a collapse control instead of duplicating the expanded identity. Empty slots use role-appropriate muted art and explicit names. All current heroes share the same information policy. The roster is read-only with respect to expedition willingness; the former merchant permission controls are removed. Current facts do not grant hero AI omniscience; historical footage and event signals remain authentic and separate. No campaign writes from presentation except existing explicit merchant actions.

The nightly book contains merchant accounts, not a second hero roster. Alpha v51 only, no save migration. See [LIVE_BOARD_LEDGER_AUDIT.md](LIVE_BOARD_LEDGER_AUDIT.md).

- **One portal visual and service contract:** current normal customer arrivals
  and exits share one cursed doorway in the physical shop. Retained
  old `level4/level6` physical traffic keys are retired, not two visible
  dungeon-floor directions. Do not restore legacy Floor 4/Floor 6 signage,
  unreachable checkout lines or blocked entry paths. Placement and
  reachability tests must follow the new geometry. A swirling instance
  portal is the proposed visual direction, not a finished asset.
- **Floor 10 gate:** show a truthful blocked-party attempt when fewer than
  two living, eligible, saved temporary companions reach the real Floor-9
  lower stair. Respect autonomous medium-term goals; no merchant permission grants a party.
- **Knowledge safety:** no future-state backfill of earlier reports,
  guaranteed fatality labels for missing heroes, leaked sealed outcomes or
  extrapolated success odds. Warnings such as "unarmed" and "low HP"
  inform the merchant without redirecting autonomous hero decisions.
- **UX constraints:** physical board remains placeable without breaking
  wall support or player access; E/R keyboard and pointer-lock recovery
  continue; expanded UI supports many heroes and responsive widths.
  Contrast and reduced-motion settings must stay useful in the dark cave.

The worldwide Hero Cards, live event feed and shared 50-ms shop/dungeon world clock are **implemented**. Some in-world wall texture, notification styling, discoverability and timeline polish remain future UX work; this section is not evidence of a missing LIVE clock. The authority and observation boundary is defined in [LIVING_WORLD_CLOCK.md](LIVING_WORLD_CLOCK.md).

## Invariants and review gates
- Never hide a campaign save **error** behind a collapsed panel.
- Never move purchase or movement authority into presentation helpers.
- All five shelf-good item symbols remain distinguishable and share exact IDs.
- HUD dimensions remain narrow at 390px, 800px, and desktop 1440px.
- The register's paid state must never imply that another cart is already paid. The next-customer action stays disabled until `readyCheckoutHeroId()` and a real unpaid cart agree; merely viewing the next receipt or pressing E does not transfer value. Do not reattach the camera between consecutive registered customers; restore it when the overlay actually closes.
- The game stays keyboard operable without pointer lock; do not force
  unnecessary Esc/M roundtrips to handle the hotbar or cashier. Modal focus
  and pointer-lock restoration must remain understandable.
- The `#shop-shelf-focus` ray projection is visual and non-clickable; it
  must hide when nothing relevant is aimed at or when a dialog, mining or
  furniture blueprint owns the interaction. It must never replace the
  authoritative `InteractionSystem` stock/remove ray.
- The `#shop-service-brief` must show only physically present customers'
  active needs or an actually ready cashier head. Its current implementation
  hides when irrelevant, or when an open dialog or furniture blueprint owns
  the screen. Mining mode does not presently hide the top service strip.
  The **F** shortcut only selects an existing hotbar item; no transfer,
  purchase, credit grant or reserve belongs in HUD code.
- Existing valid version-13 saves, controls, dialogues and gameplay tests
  must continue working after UI changes; add visual/geometry checks for
  changed layout. Unsupported older campaigns are **not** silently migrated.
- The current automated checks include `shopUiPass.spec.ts`,
  `shopHudLayout.spec.ts`, `controlsDisclosure.spec.ts` and the
  existing crowded-shop browser flow. This does not replace human
  assessment of legibility and repeated-action friction.
- Shared combat HP plates and damage numbers hide during optional local intro only, remain noninteractive, respect camera projection and bounded screen placement, and never invent damage in saved replays. Floating numbers are decorative for assistive technology; the original numeric bottom HP/status remains readable. The new grab has a readable windup label and distinct grab/throw status cues. On the Tripo renderer a caught hero's existing model is visibly held between the actual animated left thumb, index and middle finger from successful contact until release, following the wrist's 3D motion; the airborne model then separates continuously from that hand and lands at the real motor location. The segmented legacy renderer remains a simpler fallback; the HUD uses only real recorded HP/lava cues and must not invent a hit for a missed grip.
- The compact persistent audio panel exposes **separate Music and Effects rows**. `#music-toggle`/`#music-volume` control the scene MP3 player; `#sfx-toggle`/`#sfx-volume` independently control synthesized effect feedback and the Troll arena ambience. Each range has a visible label and accessible name; toggles report `aria-pressed`. V arena opens with a temporary balanced mix of **Music 16% / SFX 40%**. The two sliders show these actual active levels; arena edits last for that arena visit only, while the prior persisted shop volumes are restored on exit. Mute buttons keep their usual persistent behavior. No new modal or arena toolbar is introduced.
- **Training SFX Lab:** The opt-in `SFX Lab` toolbar control is visible only for the unsaved V training preview. Its small, scrollable overlay exposes accessible independent Solo/Mute buttons by source and type, Reset mix, an optional collapsible 19-cue audition library and a bounded read-only activity feed. `aria-pressed` reflects active filtering. It never replaces the separate global music/SFX controls, never opens for saved footage or while inspecting models, and must not steal Space/Enter intro skips when focused.
- LIVE entry from World Echoes, map or hero view goes directly to the current committed fight with HUD and camera available. The world continues. Local recorded playback and Combat Lab retain optional cinematics (ordinary 5.2 s, boss 13.5 s); Dungeon Viewer LIVE music requests the corresponding cue with a 1.1 s crossfade, and its manual skip supports both scores. Acoustic and visual acceptance of the final changes remains open. Space/Enter skips an active local intro. V/Escape closes the Lab; Escape returns from the LIVE arena.
- Batch shelf fill/clear is implemented through `GameStore.transfer`. Customer remarks use the same read-only world projection as request bubbles, but never replace their item icon or timer. One speaker is rendered at a time; the rate limit and short lifetime prevent dialogue walls. Additional narrative reactions and cashier polish remain subject to [ROADMAP](ROADMAP.md).

## World Wide Hero Cards · Single visual source of truth

The project uses exactly one shared `HeroCardView` read-only presentation
projection (`src/game/heroCardView.ts`) and one DOM renderer
(`src/heroCard.ts`) with variants `mini`, `expanded` and `combat`.
The same 5×5 hero portrait atlas (`hero-portraits.webp`), stable
`heroPortraitIndex`, `ui-interface-icons.svg` and `ui-item-icons.svg`
are mandatory everywhere. Existing equipment names and icon IDs must
not be duplicated or redesigned in another view.

Entry points:
- **Shop:** hover a projected actual NPC to preview Mini. Alt-click the
  NPC to open the non-modal expanded card. The world clock and customer
  collision/shelf-selection remain untouched.
- **World Echoes:** level-up `hero-profile` click opens the global expanded
  card directly. The Feed does not need to open/close the whole Board.
- **Adventurer Board:** same Mini summaries and Expanded contents, retaining
  its filters, LIVE observation and last known contact reports.
- **LIVE Dungeon:** hero hover uses the global Mini, selected hero uses
  Expanded, with personally visible fog information and route preview.
- **Dungeon archive:** historical Expanded profile uses only recorded
  role, gear, HP, day/position/action; missing historical stats are unknown.
- **LIVE fights, saved Group Combat and V Lab:** `CombatPartyRoster` shows
  Combat Compact for every participating hero. Role, equipment, phase,
  attack, defense and recorded stamina come from genuine actor specs/frames.
  The old floating **world-space** HP plates and damage numbers stay in
  place. The side roster never duplicates those HP bars.
- **Floor-10 boss:** one Compact version uses the same renderer. The
  original Cave Troll HP plates and cinematic remain.

A Card is NEVER another simulation authority. In recorded contexts it
must never borrow current XP, levels, attributes, gold, inventory or gear
from the live roster. Only the immutable replay's recorded fields are
shown. Missing data is deliberately left blank or explicitly unknown.
The global panel does not pause shop, dungeon or battle clocks.

Do not add new per-context stat tables, portrait crop algorithms or
secondary equipment item icon atlases. Do not remove 3D combat health
plates or hit feedback when cleaning obsolete HTML inspectors.

### V.004 Hero Inspection usability and acceptance

- In the first-person shop, **F** opens the full worldwide Hero Card for
  the actual projected customer under Galvik's reticle. It takes priority over
  the existing **F = urgent restock item** shortcut only when a real hero is
  targeted; otherwise the original item shortcut still works. The former I
  key has no Hero Card binding. The small crosshair
  prompt appears only for a real eligible nearby customer, not a fabricated
  customer. While the card is open, release mouse lock and temporarily
  detach Galvik's FPS camera inputs, **without pausing** the shared clock.
  Closing restores the previous UI focus and normal camera controls.
- **Alt + left-click** on an actual projected customer is intercepted on
  `pointerdown` in the capture phase. A shop shelf/customer click must NOT
  already run before the inspection action, transfer goods, create sales or
  request pointer lock. Plain click still uses the existing merchant controls.
- Mini Card hover remains on true physical/shop and LIVE spectator entry
  points, but the Adventurer Board's inline Mini summaries do not create a
  redundant second floating Mini within the native board dialog.
- Ordinary and Floor-10 boss Compact combat cards use independent focus targets
  and accessible inspection buttons. The HUD maps **real committed phases**
  to corresponding action glyphs (parry, dodge, casting/healing, strike,
  hurt, death) and uses genuine HP ratio for danger-state border treatment.
  No second health bar or combat result solver is created.
- **Coal** has its own pictogram in the one canonical item icon atlas.
  Abstract loot tokens are retired; actual owned finds use their own item icons. A regression prevents catalog items without art.
- Responsive checks on phone/tablet/desktop verify the expanded card and
  close control stay inside the viewport; restoring keyboard focus works
  on Escape. Browser validation verifies actual shop NPC inspection and
  existing LIVE combat/cards without modifying the game world.
- Automated layout tests are necessary but NOT an artistic manual sign-off:
  review portrait cropping, target spacing, mobile device feel and audio
  against the deployed Pages build separately.

## Combat Lab configuration

Production rules expose role, level, starting HP and role-specific T1/T2 weapon/armor, with derived damage/armor/max HP read-only. Custom experiments expose manual final values. A captured LIVE encounter locks configuration while its exact initial options are replayed locally. Keep the configuration panel above actor plates; party cards belong on the opposite side on desktop. No hover overlay may block settings. Compact party cards are hidden in the narrow Lab layout rather than covering its controls. Both modes share the combat motor and renderer.

## Recovered Goods Chest

One procedural wooden/iron chest with hinged lid, sign SELL LOOT HERE and open/closed state. E or click toggles intake. A customer reaches its protected service dock using existing physical navigation before shelves or requests. Floating text reports paid material counts and gold expense from actual committed receipts. The Buyback Log is read-only, not an item-purchase menu. No second merchant inventory or service motor. Art and audio acceptance are separate from automated transaction checks.

The Employees (J) dialog is separate from the Adventurer Board. Each known employee has a status and supported task priorities Off/1–9. The dialog reports actual collection, delivery, return and blocked routes. Cashier shows walking/serving status; Charity (credit) shows walking to a petitioner or serving the request; all priorities start Off. The quickbar shows available stock and reserved quantity; the actual employee cargo projects saved state. Existing dialog pause and pointer-lock rules apply.
