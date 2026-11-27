import { SeededRandom, validateSeed } from "./random.ts";

/**
 * Persistent room-first geometry blueprint for the numbered dungeon. This is deliberately pure:
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
 * Room-first sectors keep landmark chambers separated by real stone.
 * Connect the room graph before placing sites: a perimeter cycle guarantees
 * two independent inter-room routes; a seeded inner cross-link is optional.
 * Tile geometry remains the sole navigation/LOS/rendering authority.
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
  const entrance={x:1,z:1};
  const open=(x:number,z:number,kind:DungeonTile)=>{
    const i=indexOf(width,x,z);
    if(x<=0||z<=0||x>=width-1||z>=height-1)
      throw new RangeError("Dungeon carve crossed its boundary");
    if(tiles[i]!=="room"||kind==="room")tiles[i]=kind;
  };
  // Six sectors on large maps, four on small maps; rotate the large
  // composition with the seed instead of using one identical floor plan.
  const largeX=width>=27,largeZ=height>=27;
  const wide=largeX&&(!largeZ||random.int(2)===0);
  const columns=wide?3:2,rows=!wide&&largeZ?3:2;
  const rooms:DungeonRoom[]=[];
  const sector=(length:number,n:number,i:number)=>({
    lo:1+Math.floor((length-2)*i/n),
    hi:Math.floor((length-2)*(i+1)/n),
  });
  const oddSize=(span:number,landmark:boolean)=>{
    const max=Math.min(11,2*Math.floor((span-3)/2)+1);
    return Math.max(3,max-(landmark?0:2*random.int(2)));
  };
  const landmark=random.int(columns*rows);
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const sx=sector(width,columns,col),sz=sector(height,rows,row);
    const id=rooms.length,roomWidth=oddSize(sx.hi-sx.lo+1,id===landmark),
      roomHeight=oddSize(sz.hi-sz.lo+1,id===landmark);
    const rx=(roomWidth-1)/2,rz=(roomHeight-1)/2;
    const minX=sx.lo+1+rx,maxX=sx.hi-1-rx;
    const minZ=sz.lo+1+rz,maxZ=sz.hi-1-rz;
    const x=minX+random.int(maxX-minX+1),z=minZ+random.int(maxZ-minZ+1);
    const room={id:"room-"+id,x,z,width:roomWidth,height:roomHeight};
    rooms.push(room);
    for(let dz=-rz;dz<=rz;dz++)for(let dx=-rx;dx<=rx;dx++)
      open(x+dx,z+dz,"room");
  }

  function line(a:DungeonPoint,b:DungeonPoint){
    if(a.x!==b.x&&a.z!==b.z)throw new RangeError("Corridor segment must be axial");
    const dx=Math.sign(b.x-a.x),dz=Math.sign(b.z-a.z);
    let x=a.x,z=a.z;
    for(;;){
      open(x,z,"corridor");
      if(x===b.x&&z===b.z)break;
      x+=dx;z+=dz;
    }
  }
  const roomAt=(col:number,row:number)=>rooms[row*columns+col];
  function horizontal(col:number,row:number){
    const a=roomAt(col,row),b=roomAt(col+1,row);
    const seam=sector(width,columns,col).hi;
    line(a,{x:seam,z:a.z});
    line({x:seam,z:a.z},{x:seam,z:b.z});
    line({x:seam,z:b.z},b);
  }
  function vertical(col:number,row:number){
    const a=roomAt(col,row),b=roomAt(col,row+1);
    const seam=sector(height,rows,row).hi;
    line(a,{x:a.x,z:seam});
    line({x:a.x,z:seam},{x:b.x,z:seam});
    line({x:b.x,z:seam},b);
  }
  for(let col=0;col<columns-1;col++){
    horizontal(col,0);horizontal(col,rows-1);
  }
  for(let row=0;row<rows-1;row++){
    vertical(0,row);vertical(columns-1,row);
  }
  if(columns===3&&random.int(3)!==0)vertical(1,0);
  if(rows===3&&random.int(3)!==0)horizontal(0,1);
  const first=roomAt(0,0);
  // One authentic portal approach; no decorative blind corridor branches.
  if(random.int(2)===0){
    line(entrance,{x:first.x,z:entrance.z});
    line({x:first.x,z:entrance.z},first);
  }else{
    line(entrance,{x:entrance.x,z:first.z});
    line({x:entrance.x,z:first.z},first);
  }

  const draft:DungeonLayout={version:1,floor,seed,width,height,tiles,entrance,rooms,features:[]};
  const down=dungeonDownStair(draft);
  const used=new Set([indexOf(width,entrance.x,entrance.z),indexOf(width,down.x,down.z)]);
  const features:DungeonFeature[]=[];
  const eligible=(p:DungeonPoint)=>Math.abs(p.x-entrance.x)+Math.abs(p.z-entrance.z)>=6;
  const walkable=shuffle(tiles.flatMap((tile,i)=>tile==="wall"?[]:
    [{x:i%width,z:Math.floor(i/width)}]).filter(eligible),random);
  const reserve=(kind:DungeonFeatureKind,p:DungeonPoint,subtype:string)=>{
    const key=indexOf(width,p.x,p.z);
    if(used.has(key)||!eligible(p))return false;
    used.add(key);
    features.push({id:kind+"-"+features.filter(f=>f.kind===kind).length,
      kind,x:p.x,z:p.z,subtype});
    return true;
  };
  const fill=(kind:DungeonFeatureKind,subtype:string,count:number,candidates:DungeonPoint[])=>{
    let placed=features.filter(f=>f.kind===kind).length;
    for(const p of candidates){
      if(placed>=count)break;
      if(reserve(kind,p,subtype))placed++;
    }
    if(placed!==count)throw new RangeError("Insufficient dungeon sites for "+kind);
  };
  const centers=shuffle(rooms.map(({x,z})=>({x,z})),random);
  // Keep the existing site budget. Room sentries plus spaced patrol
  // origins; reserve both stairs before any feature can claim them.
  for(const p of centers)reserve("monster",p,"ghoul");
  const spaced=walkable.filter(p=>features.every(f=>
    Math.abs(f.x-p.x)+Math.abs(f.z-p.z)>=3));
  const corridors=walkable.filter(p=>tileAt(draft,p.x,p.z)==="corridor");
  const roomCells=walkable.filter(p=>tileAt(draft,p.x,p.z)==="room");
  fill("monster","ghoul",8,[...spaced.filter(p=>tileAt(draft,p.x,p.z)==="corridor"),...spaced,...walkable]);
  // One real reward per chamber where possible before using spare cells.
  // Traps favor transit corridors, but never occupy either staircase.
  const treasureCandidates=shuffle([...rooms],random).flatMap(room=>
    roomCells.filter(p=>Math.abs(p.x-room.x)<room.width/2&&
      Math.abs(p.z-room.z)<room.height/2).slice(0,1));
  fill("treasure","sealed-chest",4,[...treasureCandidates,...roomCells,...walkable]);
  fill("trap","floor-spikes",4,[...corridors,...walkable]);
  return {...draft,features};
}

/** The down staircase uses a genuine connected room in the one seeded
 * floor blueprint. No new map engine, hidden teleporter or nightly roll.
 * A hero must actually discover and reach this tile before descending.
 */
export function dungeonDownStair(layout:DungeonLayout):DungeonPoint {
  let furthest:{point:DungeonPoint;distance:number}|null=null;
  for(const room of layout.rooms){
    const path=dungeonShortestPath(layout,layout.entrance,room);
    if(!path.length)continue;
    const distance=path.length-1;
    if(!furthest||distance>furthest.distance||
      (distance===furthest.distance&&
        (room.z<furthest.point.z||
          room.z===furthest.point.z&&room.x<furthest.point.x)))
      furthest={point:{x:room.x,z:room.z},distance};
  }
  if(!furthest)throw new RangeError("Seeded dungeon has no reachable lower staircase.");
  return furthest.point;
}

/** One seeded geometry contract for ordinary early floors and the existing
 * Level 7 viewer. Smaller early maps keep progression playable in shop days. */
export function generateExpeditionLayout(
  campaignSeed: number, floor: number,
): DungeonLayout {
  return floor >= 1 && floor <= 4
    ? generateDungeonLayout(campaignSeed, floor, 19, 19)
    : generateDungeonLayout(campaignSeed, floor);
}
