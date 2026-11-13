# Level 5: a modular shop, not a fixed corridor with furniture

Status: historical architecture concept. Current rules are in README.md.

Status: engineering design. The first live building milestone is the in-world
furniture blueprint. Mining, extra furnishings and unified navigation are not
implemented by this document.

## Gameplay contract

- The shop begins as a cramped cave on dungeon Level 5. Expanding it is earned.
- Existing gates to Levels 4 and 6, Galvik's bed, safety paths and save data are
  permanently protected. Mining cannot open the dungeon directly or bypass a
  boss, an entrance, or an intentionally closed boundary.
- Player picks an object from a furniture catalog. The cursor aims at a real
  floor, wall or ceiling mount. A separate green/red ghost previews geometry.
  Left click commits, right click cancels, R rotates where the mount permits.
- Customers do not invent trips to remote waiting areas. Every agent has a
  concrete goal, path, claim on a service position, and a reason for pausing.
- The authoritative economy and day clock are unchanged. Navigation, animations
  and cosmetics NEVER grant purchases, settle carts, create debts or re-roll
  encounters.

## 1. Room topology and excavation

Create a persistent `Level5Room` domain model independent of Babylon meshes.

Suggested cells:
```ts
interface RoomCell {
  x: number; y: number; z: number; // integer metre voxels
  material: "air" | "rock" | "reinforced" | "feature";
}
interface RoomTopology {
  schemaVersion: 1;
  excavatedCells: readonly string[]; // sparse delta from deterministic base rock
  expansionTier: number;
}
```

The original cave remains the baseline terrain; saves store only mined cells.
Use integer cells for mining and smaller 0.25 m coordinates for furniture. The
same topology generates visible/collidable rock boundaries, walkable flooring,
and mounted surfaces. Do NOT fake holes by hiding a texture on a solid wall.

Excavation rules:
1. Only exposed cells adjacent to already excavated air may be mined.
2. Never excavate protected structural cells, corridors, bed access, gates,
   beyond a tier-specific boundary, or leave isolated floating geometry.
3. Digging spends a resource (time, stamina, tool durability, contractor
   capacity or money) with a deliberate limit per shop tier. A hard maximum
   excavated count and spatial extent is a secondary safety net.
4. Seeded discovery cells may hold minerals, relics, forgotten storerooms, etc.
   The seed/outcome is committed once, not rerolled by re-entering the scene.
5. Rebuild only affected wall/floor/ceiling render chunks. Batch adjacent faces
   and rebuild collider geometry from the same authoritative cells.

## 2. One data-driven furniture system

The present game has two legacy shelves and a cash counter with stable stock
IDs. Preserve those identities when migrating to an extensible registry:

```ts
type Surface = "floor" | "wall" | "ceiling";
interface FurnitureDefinition {
  type: string;
  mount: readonly Surface[];
  bounds: {width: number; depth: number; height: number};
  customerSockets?: readonly {kind: "browse"|"checkout"|"queue"; x:number;z:number}[];
}
interface FurnitureInstance {
  id: string;
  type: string;
  position: {x:number;y:number;z:number};
  rotation: number;
  surfaceId?: string;
}
```

Every committed placement checks wall/floor support, protected clearances, no
overlaps with active characters or reserved NPC destinations, and navigability
from BOTH entrances to the cashier, each stocking socket and the exit. The
preview must not move colliders or trigger re-routes. Optional decor can be
placed only on reachable anchors; ceiling/wall fixtures consume no floor cells
but still require support and cannot obstruct a character's volume.

## 3. Shared navigation and NPC behavior

Introduce a `ShopNavigationService` that builds a walkable graph from room
topology + committed furniture footprints and reachable service sockets.

- Use 0.5m navigation resolution initially, with a clearance radius and
  diagonal corner-cutting forbidden. Never route through solid rock.
- Compute and cache topology by room/furniture revision. Invalidate impacted
  regions only after a COMMITTED build or excavation event.
- A* (or equivalent) is event-driven, not recalculated for all 20 heroes every
  frame. Smooth routes only across collision-free line of sight.
- Per-customer state: `enter -> select-need -> reserve-shelf-socket -> travel ->
  inspect/pick -> reserve-checkout -> travel -> pay -> exit`. Alternative
  branches `request-restock`, `petition`, `leave` are explicit states.
- Queue logic uses atomic socket reservations and stable FIFO tickets. A
  temporary shelf conflict uses a nearby, unobstructed holding pocket. A
  sold-out item uses a separate request area. No target means queue off-path
  and retry, not stand permanently in the doorway.
- Static route planner handles furniture/rock; a local steering layer handles
  temporary bodies and two-way gate rights-of-way. Soft-pass may recover
  genuine simulation deadlocks but must not be the ordinary way two visible
  humans cross.
- Walking animation derives from ACTUAL displacement, not the logical
  `queueing/browsing` label. Standing and movement blend smoothly.

## 4. Current-format validation and observable tests

The current alpha intentionally accepts only the latest simulation format.
No old saves are migrated. Within a running campaign, shelf IDs, cash
receipts, customer debt, held carts and existing transforms must remain
consistent. Invalid saves must fail validation without silent repair.

Acceptance scenarios:
- 20 NPCs simultaneously, 10-minute reproducible browser test, no permanent
  doorway/shelf/cashier deadlock or invisible route teleports.
- Four NPCs wanting the same item: only one owns the shelf socket; remaining
  shoppers wait nearby, animate while moving, and progress without blocking
  unrelated customers.
- Counter and shelves moved or rotated: route cache invalidates immediately
  after commit; ghost preview does not change it.
- Excavation removes a real rock collider, updates both floor and path graph,
  and allows movement through the new opening. Reload reproduces it exactly.
- A shelf moved into a dangerous/isolating position is rejected before saving.
- Debt issuance appears as credit in the merchant ledger, never as earned gold.

## Delivery sequence

1. Stabilize animation from actual travel, local shelf staging, and day-close
   credit reporting.
2. Replace coordinate nudging with raycast blueprint editing for existing
   furniture. Retain old UI as a temporary diagnostic fallback.
3. Introduce versioned room topology plus mesh/collider chunk regeneration.
4. Generalize furniture definitions and service sockets, preserving all shelf
   and counter state inside the current campaign format.
5. Integrate a room-derived dynamic nav graph and reservation-based customer
   tasks with a 20-NPC browser stress test.
6. Enable tier-limited pickaxe excavation with discovery content after room
   geometry, navigation and saves are proven together.

Do not expose mineable cells to players before steps 3–5 pass. A new hole that
only the mesh understands but the pathfinder doesn't is worse than the current
fixed wall.
