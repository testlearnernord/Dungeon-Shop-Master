import {dungeonDownStair,tileAt,type DungeonLayout,type DungeonRoom,type DungeonPoint} from "./dungeonLayout.ts";
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
  const contains=(room:DungeonRoom,p:DungeonPoint)=>
    Math.abs(p.x-room.x)<room.width/2&&Math.abs(p.z-room.z)<room.height/2;
  const ranked=[...layout.rooms].sort((a,b)=>b.width*b.height-a.width*a.height||
    a.id.localeCompare(b.id));
  const hall=ranked.shift();
  const treasureCount=(room:DungeonRoom)=>layout.features.filter(f=>
    f.kind==="treasure"&&contains(room,f)).length;
  ranked.sort((a,b)=>treasureCount(b)-treasureCount(a)||a.id.localeCompare(b.id));
  const vault=ranked.shift();
  const reserved=[layout.entrance,dungeonDownStair(layout),...layout.features];
  const directions=[[-1,-1],[1,-1],[1,1],[-1,1]] as const;
  const offset=layout.seed%2;
  return layout.rooms.map(room=>{
    const theme:DungeonRoomTheme=room===hall?"hall":room===vault?"vault":
      (ranked.indexOf(room)+offset)%2===0?"crypt":"guardroom";
    const anchors:DungeonRoomArtAnchor[]=directions.flatMap(([dx,dz],corner)=>{
      const x=room.x+dx*Math.floor(room.width/2),z=room.z+dz*Math.floor(room.height/2);
      // A prop may sit only in a wall-backed free corner, never a site or
      // entrance. Shift toward the wall; the walking cell centre stays clear.
      if(tileAt(layout,x,z)!=="room"||tileAt(layout,x+dx,z)!=="wall"||
        tileAt(layout,x,z+dz)!=="wall"||reserved.some(p=>p.x===x&&p.z===z))return [];
      return [{cell:{x,z},corner,x:(x-room.x)*TILE+dx*.63,z:(z-room.z)*TILE+dz*.63}];
    });
    return {room,theme,anchors};
  });
}
