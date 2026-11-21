import type {DungeonLayout,DungeonPoint} from "./dungeonLayout.ts";
import {dungeonDownStair,dungeonNeighbors} from "./dungeonLayout.ts";
import {chooseKnownRouteStep,chooseLevel7Step,
  type Level7HeroProgress} from "./level7Exploration.ts";
import type {LiveFloorHero} from "./liveFloorSpectator.ts";

/** Pure, speculative TWO-STEP floor annotation. Never writes an intention or
 * makes a game decision. The actual scheduler may change its mind when it
 * discovers an encounter, an ally, a newly revealed room, or an injury.
 * The tooltip must always say PREVIEW, never "committed route". */
export function predictDungeonHeroSteps(
  layout:DungeonLayout,hero:Pick<LiveFloorHero,
    "id"|"x"|"z"|"visited"|"activity"|"inCombat"|"plannedAction">,
):readonly DungeonPoint[]{
  if(hero.inCombat||hero.activity==="portal")return [];
  let current:Level7HeroProgress={
    heroId:hero.id,x:hero.x,z:hero.z,visited:[...hero.visited],
  };
  const result:DungeonPoint[]=[];
  const target=hero.activity==="backtracking"||
    hero.plannedAction==="shop"||hero.plannedAction==="ascend"
    ?layout.entrance:
    hero.plannedAction==="descend"?dungeonDownStair(layout):null;
  for(let i=0;i<2;i++){
    let next:DungeonPoint|null=null;
    if(target){
      next=chooseKnownRouteStep(layout,current,target);
      if(!next)return result;
    }else next=chooseLevel7Step(layout,current);
    if(!next||!dungeonNeighbors(layout,current).some(point=>
      point.x===next!.x&&point.z===next!.z))break;
    result.push(next);
    const index=next.z*layout.width+next.x;
    current={...current,x:next.x,z:next.z,
      visited:current.visited.includes(index)?current.visited:
        [...current.visited,index]};
    if(layout.features.some(feature=>feature.x===next.x&&
       feature.z===next.z))break; // The actual AI must resolve that feature first.
  }
  return result;
}
