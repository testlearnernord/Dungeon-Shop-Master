import {dungeonDownStair,type DungeonLayout,type DungeonPoint}
  from "./dungeonLayout.ts";

export type StairwayKind="exit"|"ascend"|"descend"|"sealed";
export interface DungeonStairway extends DungeonPoint{
  readonly id:string;
  readonly kind:StairwayKind;
  readonly label:string;
  readonly destinationFloor:number|null;
}

/** Uses seeded entrance/down-stair coordinates from the authoritative LIVE
 * map. Ordinary Floors 1–9 are traversable; the Floor-9 descent is subject
 * to the separate saved party/readiness check in liveDungeonRuntime.ts. The
 * visual descriptor never grants access, awards a boss or changes state. */
export function dungeonFloorStairways(layout:DungeonLayout):readonly DungeonStairway[]{
  const floor=layout.floor;
  const exit=floor===1;
  const up: DungeonStairway={...layout.entrance,
    id:"stair-up-floor-"+floor,kind:exit?"exit":"ascend",
    label:exit?"ASCEND · CURSED SHOP PORTAL":"ASCEND · FLOOR "+(floor-1)+
      " / CURSED SHOP PORTAL",
    destinationFloor:exit?null:floor-1,
  };
  if(floor<1||floor>9)return [up];
  const down=dungeonDownStair(layout);
  return [up,{...down,id:"stair-down-floor-"+floor,
    kind:"descend",
    label:floor===9?"DESCEND · FLOOR 10 · CAVE TROLL (PARTY ONLY)":
      "DESCEND · FLOOR "+(floor+1),
    destinationFloor:floor+1}];
}
