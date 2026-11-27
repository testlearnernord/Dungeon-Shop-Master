import {dungeonDownStair,dungeonRoomCells,tileAt,type DungeonLayout,type DungeonRoom,type DungeonPoint,type DungeonTile} from "./dungeonLayout.ts";
import {DUNGEON_WORLD_TILE_SIZE as TILE} from "./dungeonObservationOrientation.ts";

import {dungeonRoomPurposes,ROOM_THEME_NAMES,type DungeonRoomTheme} from "./dungeonRoomPurpose.ts";
export {ROOM_THEME_NAMES,type DungeonRoomTheme} from "./dungeonRoomPurpose.ts";
export interface DungeonRoomArtAnchor extends DungeonPoint {
  readonly cell:DungeonPoint;
  readonly corner:number;
}
export interface DungeonWallDetail extends DungeonPoint {
  readonly cell:DungeonPoint;
  readonly dx:number;readonly dz:number;
}
export interface DungeonRoomArtPlan {
  readonly room:DungeonRoom;
  readonly theme:DungeonRoomTheme;
  readonly anchors:readonly DungeonRoomArtAnchor[];
  readonly wallDetails:readonly DungeonWallDetail[];
  readonly floorAccent:DungeonPoint|null;
}

/** Presentation only: use actual chambers and reserved sites, not another
 * map or RNG stream. Never change tile occupancy or hero knowledge. Room purposes are shared with real loot settlement. */
const cardinal=[[1,0],[0,1],[-1,0],[0,-1]] as const;
const key=(p:DungeonPoint)=>p.x+":"+p.z;
function reservedArtCells(layout:DungeonLayout){
  return new Set([layout.entrance,dungeonDownStair(layout),...layout.features].map(key));
}
function artRank(seed:number,p:DungeonPoint){
  return Math.imul(seed^Math.imul(p.x+1,73856093)^Math.imul(p.z+1,19349663),1597334677)>>>0;
}
export function dungeonRoomArtPlan(layout:DungeonLayout):readonly DungeonRoomArtPlan[]{
  const footprints=new Map(layout.rooms.map(r=>[r.id,dungeonRoomCells(layout,r)]));
  const reserved=reservedArtCells(layout);
  const directions=[[-1,-1],[1,-1],[1,1],[-1,1]] as const;
  return dungeonRoomPurposes(layout).map(({room,theme})=>{
    const occupied=new Set<string>();
    const anchors:DungeonRoomArtAnchor[]=directions.flatMap(([dx,dz],corner)=>{
      // Choose an actual convex corner of the footprint, not its bounding
      // rectangle. Clipped and cruciform chambers have several candidates.
      const candidate=footprints.get(room.id)!.filter(p=>
        dx*(p.x-room.x)>=0&&dz*(p.z-room.z)>=0&&
        tileAt(layout,p.x+dx,p.z)==="wall"&&tileAt(layout,p.x,p.z+dz)==="wall"&&
        !occupied.has(p.x+":"+p.z)&&!reserved.has(key(p)))
        .sort((a,b)=>dx*(b.x-a.x)+dz*(b.z-a.z)||a.z-b.z||a.x-b.x)[0];
      if(!candidate)return [];
      const {x,z}=candidate;
      occupied.add(x+":"+z);
      return [{cell:{x,z},corner,x:(x-room.x)*TILE+dx*.63,z:(z-room.z)*TILE+dz*.63}];
    });
    // Real wall-backed relief stays away from doorways and sites.
    const wallDetails:DungeonWallDetail[]=[];
    const free=footprints.get(room.id)!.filter(p=>!reserved.has(key(p))&&!occupied.has(key(p)));
    const candidates=free.flatMap(cell=>cardinal.flatMap(([dx,dz])=>
      tileAt(layout,cell.x+dx,cell.z+dz)==="wall"?[{cell,dx,dz,
        x:(cell.x-room.x)*TILE+dx*1.03,z:(cell.z-room.z)*TILE+dz*1.03}]:[]));
    candidates.sort((a,b)=>artRank(layout.seed,a.cell)-artRank(layout.seed,b.cell));
    for(const detail of candidates){
      if(wallDetails.length>=2)break;
      if(wallDetails.some(p=>Math.abs(p.cell.x-detail.cell.x)+Math.abs(p.cell.z-detail.cell.z)<2))continue;
      wallDetails.push(detail);occupied.add(key(detail.cell));
    }
    const accent=free.filter(p=>!occupied.has(key(p))&&cardinal.every(([dx,dz])=>
      tileAt(layout,p.x+dx,p.z+dz)==="room")).sort((a,b)=>
      Math.abs(a.x-room.x)+Math.abs(a.z-room.z)-Math.abs(b.x-room.x)-Math.abs(b.z-room.z))[0];
    const floorAccent=accent?{x:(accent.x-room.x)*TILE,z:(accent.z-room.z)*TILE}:null;
    return {room,theme,anchors,wallDetails,floorAccent};
  });
}

export interface DungeonPassageArtPlan {
  readonly cell:DungeonPoint;
  readonly dx:number;readonly dz:number;
  readonly doorway:boolean;
}
/** Real corridor wall faces, not fake blocking arches. Bounded and seeded
 * spacing keeps the entire observation floor inexpensive to render. */
export function dungeonPassageArtPlan(layout:DungeonLayout):readonly DungeonPassageArtPlan[]{
  const reserved=reservedArtCells(layout);
  const candidates:DungeonPassageArtPlan[]=[];
  for(let z=1;z<layout.height-1;z++)for(let x=1;x<layout.width-1;x++){
    const cell={x,z};
    if(tileAt(layout,x,z)!=="corridor"||reserved.has(key(cell)))continue;
    const doorway=cardinal.some(([dx,dz])=>tileAt(layout,x+dx,z+dz)==="room");
    const walls=cardinal.filter(([dx,dz])=>tileAt(layout,x+dx,z+dz)==="wall");
    if(!walls.length)continue;
    const [dx,dz]=walls[artRank(layout.seed,cell)%walls.length];
    candidates.push({cell,dx,dz,doorway});
  }
  candidates.sort((a,b)=>Number(b.doorway)-Number(a.doorway)||
    artRank(layout.seed,a.cell)-artRank(layout.seed,b.cell));
  const result:DungeonPassageArtPlan[]=[];
  for(const plan of candidates){
    if(result.length>=(layout.rooms.length<=4?5:8))break;
    if(result.some(p=>Math.abs(p.cell.x-plan.cell.x)+Math.abs(p.cell.z-plan.cell.z)<3))continue;
    result.push(plan);
  }
  return result;
}

/** Multipliers over the same baked flagstone texture, not alternate floors.
 * The two presentation adapters use the same relative color identity. */
export const ROOM_SURFACE_TINTS={
  hall:[1.18,1.09,.93],crypt:[.82,1.04,.91],vault:[1.28,1.08,.72],
  guardroom:[1.10,.86,.72],workshop:[.91,.96,1.13],
} as const satisfies Record<DungeonRoomTheme,readonly [number,number,number]>;
export const ROOM_THEMES=Object.keys(ROOM_SURFACE_TINTS) as DungeonRoomTheme[];
export function dungeonRoomTileThemes(layout:DungeonLayout,plans:readonly DungeonRoomArtPlan[]){
  const themes=new Map<number,DungeonRoomTheme>();
  for(const plan of plans)for(const p of dungeonRoomCells(layout,plan.room))
    themes.set(p.z*layout.width+p.x,plan.theme);
  return themes;
}

/** Muted terrain colors leave bright feature/actor markers legible. These
 * colors and descriptions belong only to the explicit full-floor overview. */
export const ROOM_OVERVIEW_COLORS={
  hall:"#827c6b",crypt:"#637c73",vault:"#957b4c",
  guardroom:"#8c6658",workshop:"#64758c",
} as const satisfies Record<DungeonRoomTheme,string>;

export function dungeonOverviewTileColor(kind:DungeonTile,theme?:DungeonRoomTheme):string{
  return kind==="wall"?"#171b20":kind==="corridor"?"#565960":
    theme?ROOM_OVERVIEW_COLORS[theme]:"#81786d";
}

export function dungeonOverviewRoomLabel(theme:DungeonRoomTheme):string{
  const note=theme==="vault"?"Chests: 2–3 ordinary goods":
    theme==="workshop"?"Chests: one forge material guaranteed":
    "Ordinary site rules";
  return ROOM_THEME_NAMES[theme]+" · "+note;
}
