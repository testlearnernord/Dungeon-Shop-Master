import type { FurnitureId } from "./furnitureBlueprint.ts";
import type { ShelfPlacement } from "./shopLayout.ts";

export type QuarterTurn=ShelfPlacement["rotation"];
export interface FurnitureFacing {
  /** A visible, human-readable compass direction for the customer-facing side. */
  readonly label:"north"|"east"|"south"|"west";
  readonly x:number;
  readonly z:number;
}

/** Shelf slots face local +X; the cashier receives customers from local -Z.
 * This is also the orientation of the 3D preview's arrow indicator.
 */
export function furnitureFacing(id:FurnitureId,rotation:QuarterTurn):FurnitureFacing {
  const shelf=id!=="counter";
  const localX=shelf?1:0,localZ=shelf?0:-1;
  const x=rotation===0?localX:rotation===1?localZ:rotation===2?-localX:-localZ;
  const z=rotation===0?localZ:rotation===1?-localX:rotation===2?-localZ:localX;
  const label=x>0?"east":x<0?"west":z>0?"south":"north";
  return {label,x,z};
}
