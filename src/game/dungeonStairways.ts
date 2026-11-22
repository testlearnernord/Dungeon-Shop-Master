import {dungeonDownStair,type DungeonLayout,type DungeonPoint}
  from "./dungeonLayout.ts";

export type StairwayKind="exit"|"ascend"|"descend"|"sealed";
export interface DungeonStairway extends DungeonPoint{
  readonly id:string;
  readonly kind:StairwayKind;
  readonly label:string;
  readonly destinationFloor:number|null;
}

/** Uses exactly the seeded entrance/down-stair coordinates that the single
 * authoritative LIVE expedition scheduler already uses. A sealed endpoint
 * is a purely visual landmark, NEVER a traversable floor transition. */
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
  const traversable=floor<9;
  return [up,{...down,id:"stair-down-floor-"+floor,
    kind:traversable?"descend":"sealed",
    label:traversable?"DESCEND · FLOOR "+(floor+1):
      "CAVE TROLL CHAMBER · PARTY GATE (NOT YET OPEN)",
    destinationFloor:traversable?floor+1:null}];
}
