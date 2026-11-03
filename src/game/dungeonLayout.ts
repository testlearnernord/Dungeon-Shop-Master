import { SeededRandom, validateSeed } from "./random.ts";

/**
 * Persistent geometry blueprint for level 7. This is deliberately pure:
 * campaign seed + floor ID, never the day-tick RNG, determines the map.
 */
export type DungeonTile = "wall" | "corridor" | "room";
export type DungeonFeatureKind = "monster" | "treasure" | "trap";
export interface DungeonPoint { readonly x: number; readonly z: number }
export interface DungeonRoom extends DungeonPoint {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}
export interface DungeonFeature extends DungeonPoint {
  readonly id: string;
  readonly kind: DungeonFeatureKind;
  readonly subtype: string;
}
export interface DungeonLayout {
  readonly version: 1;
  readonly floor: number;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly DungeonTile[];
  readonly entrance: DungeonPoint;
  readonly rooms: readonly DungeonRoom[];
  readonly features: readonly DungeonFeature[];
}

const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const indexOf = (width: number, x: number, z: number) => z * width + x;
const inside = (width: number, x: number, z: number) =>
  x > 0 && z > 0 && x < width - 1 && z < width - 1;

export function dungeonSeed(campaignSeed: number, floor: number): number {
  validateSeed(campaignSeed);
  if (!Number.isSafeInteger(floor) || floor < 1 || floor > 100) {
    throw new RangeError("Dungeon floor must be 1–100");
  }
  // Map generation does not advance or consume the campaign's RNG stream.
  return (Math.imul((campaignSeed ^ 0x9e3779b9) >>> 0, 2654435761) ^
    Math.imul(floor, 2246822519)) >>> 0;
}

export function tileAt(layout: DungeonLayout, x: number, z: number): DungeonTile {
  return x >= 0 && z >= 0 && x < layout.width && z < layout.height
    ? layout.tiles[indexOf(layout.width, x, z)] : "wall";
}

export function dungeonNeighbors(layout: DungeonLayout, p: DungeonPoint): DungeonPoint[] {
  return DIRECTIONS.map(([dx, dz]) => ({x: p.x + dx, z: p.z + dz}))
    .filter(({x,z}) => tileAt(layout, x, z) !== "wall");
}

/** Bounded grid BFS: a future AI can use this identical navigable geometry. */
export function dungeonShortestPath(
  layout: DungeonLayout, from: DungeonPoint, to: DungeonPoint,
): DungeonPoint[] {
  if (tileAt(layout, from.x, from.z) === "wall" ||
      tileAt(layout, to.x, to.z) === "wall") return [];
  const start = indexOf(layout.width, from.x, from.z);
  const goal = indexOf(layout.width, to.x, to.z);
  const queue = [start], previous = new Int32Array(layout.tiles.length).fill(-1);
  previous[start] = start;
  for (let cursor = 0; cursor < queue.length && previous[goal] === -1; cursor++) {
    const point = queue[cursor];
    const x = point % layout.width, z = Math.floor(point / layout.width);
    for (const next of dungeonNeighbors(layout, {x,z})) {
      const key = indexOf(layout.width, next.x, next.z);
      if (previous[key] !== -1) continue;
      previous[key] = point;
      queue.push(key);
    }
  }
  if (previous[goal] === -1) return [];
  const result: DungeonPoint[] = [];
  for (let cell = goal; ; cell = previous[cell]) {
    result.push({x: cell % layout.width, z: Math.floor(cell / layout.width)});
    if (cell === start) break;
  }
  return result.reverse();
}

function shuffle<T>(array: T[], rng: SeededRandom): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Carve a perfect DFS labyrinth, then enlarge a few cells to real rooms.
 * Connecting odd maze nodes are never removed: every walkable tile and feature
 * is reachable from the shop-side entrance, including dead-end chambers.
 */
export function generateDungeonLayout(
  campaignSeed: number, floor = 7, width = 31, height = 31,
): DungeonLayout {
  if (width < 15 || height < 15 || width > 61 || height > 61 ||
      width % 2 !== 1 || height % 2 !== 1 ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new RangeError("Dungeon dimensions must be odd integers 15–61");
  }
  const seed = dungeonSeed(campaignSeed, floor);
  const random = new SeededRandom(seed);
  const tiles: DungeonTile[] = Array(width * height).fill("wall");
  const open = (x: number, z: number, kind: DungeonTile) =>
    { tiles[indexOf(width,x,z)] = kind; };
  const isOpen = (x: number, z: number) =>
    tiles[indexOf(width,x,z)] !== "wall";

  const stack: DungeonPoint[] = [{x:1,z:1}];
  open(1,1,"corridor");
  while (stack.length) {
    const here = stack[stack.length - 1];
    const options = shuffle([...DIRECTIONS], random).filter(([dx,dz]) => {
      const nx = here.x + dx * 2, nz = here.z + dz * 2;
      return inside(width,nx,nz) && !isOpen(nx,nz);
    });
    if (!options.length) { stack.pop(); continue; }
    const [dx,dz] = options[0];
    open(here.x + dx,here.z + dz,"corridor");
    const next = {x:here.x + dx * 2,z:here.z + dz * 2};
    open(next.x,next.z,"corridor");
    stack.push(next);
  }

  // 3x3 and 5x5 rooms over existing corridors. Entrance remains unobstructed.
  const rooms: DungeonRoom[] = [];
  const candidates: DungeonPoint[] = [];
  for (let z = 5; z < height - 4; z += 2)
    for (let x = 5; x < width - 4; x += 2) candidates.push({x,z});
  shuffle(candidates,random);
  for (const center of candidates) {
    if (rooms.length >= 6) break;
    const size = rooms.length % 3 === 0 ? 5 : 3;
    const radius = (size-1)/2;
    if (center.x-radius <= 1 || center.z-radius <= 1 ||
      center.x+radius >= width-2 || center.z+radius >= height-2) continue;
    if (rooms.some(r => Math.abs(r.x-center.x) <= (r.width+size)/2 + 1 &&
      Math.abs(r.z-center.z) <= (r.height+size)/2 + 1)) continue;
    for (let dz=-radius;dz<=radius;dz++)
      for (let dx=-radius;dx<=radius;dx++)
        open(center.x+dx,center.z+dz,"room");
    rooms.push({id:"room-"+rooms.length,x:center.x,z:center.z,width:size,height:size});
  }

  const draft: DungeonLayout = {
    version:1,floor,seed,width,height,tiles,entrance:{x:1,z:1},rooms,features:[],
  };
  const walkable: DungeonPoint[] = [];
  for (let z=1;z<height-1;z++)
    for (let x=1;x<width-1;x++)
      if (tileAt(draft,x,z)!=="wall") walkable.push({x,z});
  const deadEnds = shuffle(walkable.filter(p =>
    dungeonNeighbors(draft,p).length===1 &&
    Math.abs(p.x-1)+Math.abs(p.z-1)>4),random);
  const used = new Set([indexOf(width,1,1)]);
  const features: DungeonFeature[] = [];
  const reserve = (kind:DungeonFeatureKind,p:DungeonPoint,subtype:string) => {
    const key=indexOf(width,p.x,p.z);
    if (used.has(key)) return false;
    used.add(key);
    features.push({
      id:kind+"-"+features.filter(f=>f.kind===kind).length,
      kind,x:p.x,z:p.z,subtype,
    });
    return true;
  };
  // Dead ends reward exploration but can also punish carelessness.
  for (const p of deadEnds.slice(0,Math.min(4,deadEnds.length)))
    reserve("treasure",p,"sealed-chest");
  for (const p of deadEnds.slice(4,Math.min(8,deadEnds.length)))
    reserve("trap",p,"floor-spikes");

  // Room sentries and corridor patrol origins are fixed, not simulated yet.
  const monsters = shuffle([
    ...rooms.map(room=>({x:room.x,z:room.z})),
    ...walkable.filter(p=>p.x>3&&p.z>3&&
      (p.x+p.z)%5===0 && dungeonNeighbors(draft,p).length>=2),
  ],random);
  for(const p of monsters){
    if(features.filter(f=>f.kind==="monster").length>=8)break;
    if(Math.abs(p.x-1)+Math.abs(p.z-1)<6)continue;
    const types=["goblin","skeleton","slime","cultist"];
    reserve("monster",p,types[random.int(types.length)]);
  }

  // Fill in spare dead ends if any of the initial chosen positions were occupied.
  const available = shuffle(walkable.filter(p=>
    Math.abs(p.x-1)+Math.abs(p.z-1)>6 &&
    !used.has(indexOf(width,p.x,p.z))),random);
  for(const kind of ["treasure","trap"] as const) {
    while(features.filter(f=>f.kind===kind).length<4 && available.length)
      reserve(kind,available.pop()!,kind==="treasure"?"sealed-chest":"floor-spikes");
  }
  return {...draft,features};
}
