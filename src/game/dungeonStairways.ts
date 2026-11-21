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
  const exit= floor===1||floor===7;
  const up: DungeonStairway={...layout.entrance,
    id:"stair-up-floor-"+floor,kind:exit?"exit":"ascend",
    label:exit?"EXIT · RETURN TO SHOP":"ASCEND · FLOOR "+(floor-1),
    destinationFloor:exit?null:floor-1,
  };
  if(floor!==1&&floor!==2&&floor!==3&&floor!==4&&floor!==7)return [up];
  const down=dungeonDownStair(layout);
  const traversable=floor<4;
  return [up,{...down,id:"stair-down-floor-"+floor,
    kind:traversable?"descend":"sealed",
    label:traversable?"DESCEND · FLOOR "+(floor+1):
      "SEALED LOWER PASSAGE · NOT TRAVERSABLE",
    destinationFloor:traversable?floor+1:null}];
}
