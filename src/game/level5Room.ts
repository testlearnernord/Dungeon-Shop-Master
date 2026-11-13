/** Authoritative, renderer-independent Level 5 excavation delta.
 * The existing cave remains walkable without any mined cells. Expansion is
 * deliberately restricted to its side walls until a shared nav mesh exists.
 */
export interface Level5Room {
  readonly schemaVersion: 1;
  readonly expansionTier: number;
  readonly excavatedCells: readonly string[];
}
export interface RoomCell { readonly x:number; readonly z:number }
export type MineResult =
  | { readonly ok:true; readonly room:Level5Room; readonly cell:RoomCell }
  | { readonly ok:false; readonly reason:string };

export const BASE_ROOM_HALF_EXTENT=7;
export const MAX_EXPANSION_TIER=3;
export const MAX_MINED_CELLS=120;
const key=(x:number,z:number)=>`${x},${z}`;
const isIntegerCell=(c:RoomCell)=>Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.z);
const baseAir=(c:RoomCell)=>Math.abs(c.x)<=BASE_ROOM_HALF_EXTENT&&Math.abs(c.z)<=BASE_ROOM_HALF_EXTENT;
const allowedExtent=(tier:number)=>BASE_ROOM_HALF_EXTENT+2*tier;
/** The north/south dungeon connections remain protected at every tier. */
export function isProtectedRoomCell(c:RoomCell):boolean {
  return Math.abs(c.z)>=BASE_ROOM_HALF_EXTENT&&
    ((c.x>=-6&&c.x<=-2)||(c.x>=2&&c.x<=6));
}
export function createLevel5Room():Level5Room {
  return {schemaVersion:1,expansionTier:0,excavatedCells:[]};
}
export function isValidLevel5Room(value:unknown):value is Level5Room {
  if(!value||typeof value!=="object")return false;
  const room=value as Partial<Level5Room>;
  if(room.schemaVersion!==1||!Number.isSafeInteger(room.expansionTier)||
    room.expansionTier!<0||room.expansionTier!>MAX_EXPANSION_TIER||
    !Array.isArray(room.excavatedCells)||room.excavatedCells.length>MAX_MINED_CELLS)return false;
  const seen=new Set<string>();
  for(const entry of room.excavatedCells){
    if(typeof entry!=="string"||!/^-?\\d+,-?\\d+$/.test(entry)||seen.has(entry))return false;
    const [x,z]=entry.split(",").map(Number);
    const cell={x,z};
    if(!isIntegerCell(cell)||baseAir(cell)||isProtectedRoomCell(cell)||
      Math.abs(x)>allowedExtent(room.expansionTier!)||
      Math.abs(z)>allowedExtent(room.expansionTier!))return false;
    seen.add(entry);
  }
  // Every mined cell must connect back to the original cave, not float in rock.
  const connected=new Set<string>();
  let changed=true;
  while(changed){
    changed=false;
    for(const entry of seen){
      if(connected.has(entry))continue;
      const [x,z]=entry.split(",").map(Number);
      const neighbours=[{x:x+1,z},{x:x-1,z},{x,z:z+1},{x,z:z-1}];
      if(neighbours.some(c=>baseAir(c)||connected.has(key(c.x,c.z)))){
        connected.add(entry);changed=true;
      }
    }
  }
  return connected.size===seen.size;
}
export function isLevel5Air(room:Level5Room,c:RoomCell):boolean {
  return isIntegerCell(c)&&(baseAir(c)||room.excavatedCells.includes(key(c.x,c.z)));
}
/** Pure commit operation. The caller handles tool cost, save persistence,
 * collision mesh regeneration and navigation invalidation atomically.
 */
export function excavateLevel5Cell(room:Level5Room,c:RoomCell):MineResult {
  if(!isValidLevel5Room(room))return {ok:false,reason:"Invalid room state."};
  if(!isIntegerCell(c))return {ok:false,reason:"Mining targets integer cells."};
  if(room.expansionTier===0)return {ok:false,reason:"Unlock shop expansion first."};
  if(isProtectedRoomCell(c))return {ok:false,reason:"Dungeon entrances are protected."};
  if(isLevel5Air(room,c))return {ok:false,reason:"That cell is already open."};
  const limit=allowedExtent(room.expansionTier);
  if(Math.abs(c.x)>limit||Math.abs(c.z)>limit)
    return {ok:false,reason:"Outside the unlocked expansion boundary."};
  if(room.excavatedCells.length>=MAX_MINED_CELLS)
    return {ok:false,reason:"Maximum excavation capacity reached."};
  const neighbours=[{x:c.x+1,z:c.z},{x:c.x-1,z:c.z},
    {x:c.x,z:c.z+1},{x:c.x,z:c.z-1}];
  if(!neighbours.some(next=>isLevel5Air(room,next)))
    return {ok:false,reason:"Only exposed rock can be mined."};
  return {ok:true,cell:c,room:{...room,excavatedCells:[...room.excavatedCells,key(c.x,c.z)]}};
}
