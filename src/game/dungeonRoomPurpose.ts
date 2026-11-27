import {dungeonRoomCells,dungeonRoomContains,type DungeonLayout,type DungeonRoom,type DungeonPoint} from "./dungeonLayout.ts";

export type DungeonRoomTheme="hall"|"crypt"|"vault"|"guardroom"|"workshop";
export const ROOM_THEME_NAMES:Readonly<Record<DungeonRoomTheme,string>>={
  hall:"Pillared Hall",crypt:"Burial Crypt",vault:"Treasure Vault",
  guardroom:"Guardroom",workshop:"Forgotten Workshop",
};
export interface DungeonRoomPurpose {
  readonly room:DungeonRoom;
  readonly theme:DungeonRoomTheme;
}

/** One derived classification for both real loot settlement and observation.
 * No extra RNG, hidden hero knowledge, mutable room state or alternate map.
 * The vault and deep workshop prefer actual existing treasure sites. */
export function dungeonRoomPurposes(layout:DungeonLayout):readonly DungeonRoomPurpose[]{
  const ranked=[...layout.rooms].sort((a,b)=>
    dungeonRoomCells(layout,b).length-dungeonRoomCells(layout,a).length||
    a.id.localeCompare(b.id));
  const hall=ranked.shift();
  const treasureCount=(room:DungeonRoom)=>layout.features.filter(f=>
    f.kind==="treasure"&&dungeonRoomContains(layout,room,f)).length;
  ranked.sort((a,b)=>treasureCount(b)-treasureCount(a)||a.id.localeCompare(b.id));
  const vault=ranked.shift();
  const workshop=layout.floor>=5&&ranked.length>=3&&ranked[0]&&treasureCount(ranked[0])>0
    ?ranked.shift():undefined;
  const offset=layout.seed%2;
  return layout.rooms.map(room=>({room,theme:
    room===hall?"hall":room===vault?"vault":room===workshop?"workshop":
    (ranked.indexOf(room)+offset)%2===0?"crypt":"guardroom"}));
}
export function dungeonRoomPurposeAt(layout:DungeonLayout,p:DungeonPoint):DungeonRoomTheme|undefined{
  return dungeonRoomPurposes(layout).find(entry=>dungeonRoomContains(layout,entry.room,p))?.theme;
}
