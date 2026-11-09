import type { GateSide } from "./npcVisitors.ts";
import type { ShopPoint } from "./shopperNavigation.ts";

/** Separate inbound and outbound traffic within the 2.4m corridor. */
export function gateTravelLane(gate:GateSide,phase:"entering"|"leaving"):number {
  const center=gate==="level4"?-4:4;
  const side=gate==="level4"?-1:1;
  return center+side*(phase==="entering"?0.43:-0.43);
}

/** Stagger new entrants along their lane so a burst never spawns overlapping bodies. */
export function nextEntranceSpawnZ(laneX:number,occupied:readonly ShopPoint[]):number {
  for(let i=0;i<120;i++){
    const z=13+i*0.8;
    if(occupied.every(p=>Math.hypot(p.x-laneX,p.z-z)>=0.7))return z;
  }
  return 13+120*0.8;
}

/** Idle visitors must not stand in the Level 4/6 gate approaches (z >= 3).
 * Deliberately distinct from the checkout head and from shop shelf footprints.
 */
export function idleShopPosition(slot:number):ShopPoint {
  if(!Number.isSafeInteger(slot)||slot<0)throw new RangeError("Invalid visitor slot");
  const x=[-4.6,-3.5,-2.4,2.4,3.5,4.6][slot%6];
  const z=[-0.9,-1.9,-2.9,-3.9,-4.9,-5.9][Math.floor(slot/6)%6];
  return {x,z};
}
