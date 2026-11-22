/** Authoritative renderer-independent excavation state for Galvik's cursed
 * shop, independent of every numbered dungeon floor.
 * This type is the existing required GameState.shopRoom payload. The
 * source-name cleanup does not alter saved fields or introduce migrations.
 * The cave starts walkable; expansion uses its exposed side-wall cells.
 */
export interface ShopRoomGeometry {
  readonly schemaVersion: 1;
  readonly expansionTier: number;
  readonly excavatedCells: readonly string[];
}
export interface RoomCell { readonly x:number; readonly z:number }
export type MineResult =
  | { readonly ok:true; readonly room:ShopRoomGeometry; readonly cell:RoomCell }
  | { readonly ok:false; readonly reason:string };

export const BASE_ROOM_HALF_EXTENT=7;
export const MAX_EXPANSION_TIER=3;
export const MAX_MINED_CELLS=120;
const key=(x:number,z:number)=>`${x},${z}`;
const isIntegerCell=(c:RoomCell)=>Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.z);
const baseAir=(c:RoomCell)=>Math.abs(c.x)<=BASE_ROOM_HALF_EXTENT&&Math.abs(c.z)<=BASE_ROOM_HALF_EXTENT;
const allowedExtent=(tier:number)=>BASE_ROOM_HALF_EXTENT+2*tier;
/** Only side tunnels are currently represented by the shop renderer. */
const inSideTunnel=(c:RoomCell)=>Math.abs(c.x)>BASE_ROOM_HALF_EXTENT&&Math.abs(c.z)<=6;
/** The one cursed threshold and the permanently sealed second opening
 * remain protected from excavation at every tier. */
export function isProtectedRoomCell(c:RoomCell):boolean {
  return Math.abs(c.z)>=BASE_ROOM_HALF_EXTENT&&
    ((c.x>=-6&&c.x<=-2)||(c.x>=2&&c.x<=6));
}
export function createShopRoomGeometry():ShopRoomGeometry {
  return {schemaVersion:1,expansionTier:0,excavatedCells:[]};
}
export function isValidShopRoomGeometry(value:unknown):value is ShopRoomGeometry {
  if(!value||typeof value!=="object")return false;
  const room=value as Partial<ShopRoomGeometry>;
  if(room.schemaVersion!==1||!Number.isSafeInteger(room.expansionTier)||
    (room.expansionTier as number)<0||(room.expansionTier as number)>MAX_EXPANSION_TIER||
    !Array.isArray(room.excavatedCells)||room.excavatedCells.length>MAX_MINED_CELLS)return false;
  const seen=new Set<string>();
  for(const entry of room.excavatedCells){
    if(typeof entry!=="string"||!/^-?[0-9]+,-?[0-9]+$/.test(entry)||seen.has(entry))return false;
    const [x,z]=entry.split(",").map(Number);
    const cell={x,z};
    if(!isIntegerCell(cell)||baseAir(cell)||!inSideTunnel(cell)||isProtectedRoomCell(cell)||
      Math.abs(x)>allowedExtent((room.expansionTier as number))||
      Math.abs(z)>allowedExtent((room.expansionTier as number)))return false;
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
export function isShopRoomAir(room:ShopRoomGeometry,c:RoomCell):boolean {
  return isIntegerCell(c)&&(baseAir(c)||room.excavatedCells.includes(key(c.x,c.z)));
}
/** Pure commit operation. The caller handles tool cost, save persistence,
 * collision mesh regeneration and navigation invalidation atomically.
 */
export function excavateShopRoomCell(room:ShopRoomGeometry,c:RoomCell):MineResult {
  if(!isValidShopRoomGeometry(room))return {ok:false,reason:"Invalid room state."};
  if(!isIntegerCell(c))return {ok:false,reason:"Mining targets integer cells."};
  if(room.expansionTier===0)return {ok:false,reason:"Unlock shop expansion first."};
  if(isProtectedRoomCell(c))return {ok:false,reason:"Dungeon entrances are protected."};
  if(!inSideTunnel(c))return {ok:false,reason:"Only the side tunnels can be excavated."};
  if(isShopRoomAir(room,c))return {ok:false,reason:"That cell is already open."};
  const limit=allowedExtent(room.expansionTier);
  if(Math.abs(c.x)>limit||Math.abs(c.z)>limit)
    return {ok:false,reason:"Outside the unlocked expansion boundary."};
  if(room.excavatedCells.length>=MAX_MINED_CELLS)
    return {ok:false,reason:"Maximum excavation capacity reached."};
  const neighbours=[{x:c.x+1,z:c.z},{x:c.x-1,z:c.z},
    {x:c.x,z:c.z+1},{x:c.x,z:c.z-1}];
  if(!neighbours.some(next=>isShopRoomAir(room,next)))
    return {ok:false,reason:"Only exposed rock can be mined."};
  return {ok:true,cell:c,room:{...room,excavatedCells:[...room.excavatedCells,key(c.x,c.z)]}};
}
