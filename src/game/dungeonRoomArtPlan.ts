import {dungeonDownStair,dungeonRoomContains,dungeonRoomCells,tileAt,type DungeonLayout,type DungeonRoom,type DungeonPoint} from "./dungeonLayout.ts";
import {DUNGEON_WORLD_TILE_SIZE as TILE} from "./dungeonObservationOrientation.ts";

export type DungeonRoomTheme="hall"|"crypt"|"vault"|"guardroom";
export const ROOM_THEME_NAMES:Readonly<Record<DungeonRoomTheme,string>>={
  hall:"Pillared Hall",crypt:"Burial Crypt",vault:"Treasure Vault",guardroom:"Guardroom",
};
export interface DungeonRoomArtAnchor extends DungeonPoint {
  readonly cell:DungeonPoint;
  readonly corner:number;
}
export interface DungeonRoomArtPlan {
  readonly room:DungeonRoom;
  readonly theme:DungeonRoomTheme;
  readonly anchors:readonly DungeonRoomArtAnchor[];
}

/** Presentation only: use actual chambers and reserved sites, not another
 * map or RNG stream. Never change tile occupancy or hero knowledge. */
export function dungeonRoomArtPlan(layout:DungeonLayout):readonly DungeonRoomArtPlan[]{
  const footprints=new Map(layout.rooms.map(r=>[r.id,dungeonRoomCells(layout,r)]));
  const ranked=[...layout.rooms].sort((a,b)=>footprints.get(b.id)!.length-footprints.get(a.id)!.length||
    a.id.localeCompare(b.id));
  const hall=ranked.shift();
  const treasureCount=(room:DungeonRoom)=>layout.features.filter(f=>
    f.kind==="treasure"&&dungeonRoomContains(layout,room,f)).length;
  ranked.sort((a,b)=>treasureCount(b)-treasureCount(a)||a.id.localeCompare(b.id));
  const vault=ranked.shift();
  const reserved=[layout.entrance,dungeonDownStair(layout),...layout.features];
  const directions=[[-1,-1],[1,-1],[1,1],[-1,1]] as const;
  const offset=layout.seed%2;
  return layout.rooms.map(room=>{
    const theme:DungeonRoomTheme=room===hall?"hall":room===vault?"vault":
      (ranked.indexOf(room)+offset)%2===0?"crypt":"guardroom";
    const occupied=new Set<string>();
    const anchors:DungeonRoomArtAnchor[]=directions.flatMap(([dx,dz],corner)=>{
      // Choose an actual convex corner of the footprint, not its bounding
      // rectangle. Clipped and cruciform chambers have several candidates.
      const candidate=footprints.get(room.id)!.filter(p=>
        dx*(p.x-room.x)>=0&&dz*(p.z-room.z)>=0&&
        tileAt(layout,p.x+dx,p.z)==="wall"&&tileAt(layout,p.x,p.z+dz)==="wall"&&
        !occupied.has(p.x+":"+p.z)&&!reserved.some(f=>f.x===p.x&&f.z===p.z))
        .sort((a,b)=>dx*(b.x-a.x)+dz*(b.z-a.z)||a.z-b.z||a.x-b.x)[0];
      if(!candidate)return [];
      const {x,z}=candidate;
      occupied.add(x+":"+z);
      return [{cell:{x,z},corner,x:(x-room.x)*TILE+dx*.63,z:(z-room.z)*TILE+dz*.63}];
    });
    return {room,theme,anchors};
  });
}
