/** Fixed V0.1 service fixture. Geometry shared by art, pathing and placement. */
export const BUYBACK_CHEST=Object.freeze({x:6.1,z:-5.8,width:1.65,depth:1.05,height:.95});
export const BUYBACK_DOCK=Object.freeze({x:6.1,z:-4.6});
export const BUYBACK_SOLID=Object.freeze({minX:BUYBACK_CHEST.x-BUYBACK_CHEST.width/2,maxX:BUYBACK_CHEST.x+BUYBACK_CHEST.width/2,minZ:BUYBACK_CHEST.z-BUYBACK_CHEST.depth/2,maxZ:BUYBACK_CHEST.z+BUYBACK_CHEST.depth/2});
export const BUYBACK_CLEARANCE=Object.freeze({minX:5.0,maxX:7.15,minZ:-6.5,maxZ:-4.05});
