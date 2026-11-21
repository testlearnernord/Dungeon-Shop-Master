import type {DungeonLayout,DungeonPoint} from "./dungeonLayout.ts";
import {dungeonDownStair,dungeonNeighbors} from "./dungeonLayout.ts";
import {chooseKnownRouteStep,chooseLevel7Step,chooseKnownResourceStep,
  type Level7HeroProgress} from "./level7Exploration.ts";
import {selectKnownResourceSite} from "./dungeonDecisions.ts";
import type {LiveFloorHero} from "./liveFloorSpectator.ts";

/** Pure, speculative TWO-STEP floor annotation. Never writes an intention or
 * makes a game decision. The actual scheduler may change its mind when it
 * discovers an encounter, an ally, a newly revealed room, or an injury.
 * The tooltip must always say PREVIEW, never "committed route". */
export function predictDungeonHeroSteps(
  layout:DungeonLayout,hero:Pick<LiveFloorHero,
    "id"|"x"|"z"|"visited"|"activity"|"inCombat"|"plannedAction"> &
  {readonly goal?:LiveFloorHero["goal"]},
  resolved:readonly string[]=[],
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
  const resource=hero.goal==="loot-chest"?"treasure":
    hero.goal==="hunt-ghouls"?"monster":null;
  const resourceTarget=resource?selectKnownResourceSite(layout,current,
    {resolvedFeatureIds:resolved,heroes:[]},resource):null;
  for(let i=0;i<2;i++){
    let next:DungeonPoint|null=null;
    if(target){
      next=chooseKnownRouteStep(layout,current,target);
      if(!next)return result;
    }else if(resourceTarget)next=chooseKnownResourceStep(layout,current,resourceTarget);
    else next=chooseLevel7Step(layout,current);
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

/** Explain WHY only one or zero arrow segments are visible. A route is an
 * observation-time forecast, not a queued AI order or a second navigator. */
export function dungeonPreviewExplanation(
  layout:DungeonLayout,
  hero:Parameters<typeof predictDungeonHeroSteps>[1],
  resolved:readonly string[]=[],
):string{
  if(hero.inCombat)return "In LIVE combat · route forecast paused";
  if(hero.activity==="portal")return "Crossing the portal · no floor route";
  const next=predictDungeonHeroSteps(layout,hero,resolved);
  if(next.length===2)return next.map((p,i)=>
    (i+1)+": ("+p.x+", "+p.z+")").join(" → ")+" · PREVIEW";
  if(next.length===1){
    const cell=next[0],feature=layout.features.find(f=>
      f.x===cell.x&&f.z===cell.z&&!resolved.includes(f.id));
    return "1: ("+cell.x+", "+cell.z+") · "+
      (feature?"Site interaction next; step 2 depends on outcome":
        "Second step not predictable");
  }
  const stair=hero.plannedAction==="descend"?
    dungeonDownStair(layout):layout.entrance;
  if((hero.plannedAction==="descend"||hero.plannedAction==="ascend"||
      hero.plannedAction==="shop")&&
     hero.x===stair.x&&hero.z===stair.z)
    return "At staircase / exit · awaiting committed transition";
  return "No safe next tile predicted · awaiting a new world decision";
}
