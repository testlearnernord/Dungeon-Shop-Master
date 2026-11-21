import type {DungeonLayout,DungeonPoint} from "./dungeonLayout.ts";
import {dungeonDownStair,dungeonNeighbors} from "./dungeonLayout.ts";
import {chooseKnownRouteStep,chooseLevel7Step,chooseKnownResourceStep,
  chooseRenewedSiteStep,
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
  const homeward=hero.activity==="backtracking"||
    hero.plannedAction==="shop";
  const validAscend=hero.plannedAction==="ascend"&&
    layout.floor>1&&layout.floor<=4;
  const validDescend=hero.plannedAction==="descend"&&layout.floor<4;
  const target=homeward||validAscend?layout.entrance:
    validDescend?dungeonDownStair(layout):null;
  const resource=hero.goal==="loot-chest"?"treasure":
    hero.goal==="hunt-ghouls"?"monster":null;
  const resourceTarget=resource&&!target?selectKnownResourceSite(layout,current,
    {resolvedFeatureIds:resolved,heroes:[]},resource):null;
  for(let i=0;i<2;i++){
    // Mirror the authoritative advanceSpatialDungeonPartyStep order:
    // known stair / resource route, ordinary frontier, then renewed site.
    // A blocked or not-yet-known optional stair route does NOT halt movement.
    // Return-to-shop remains strict, and arriving at the stair is a floor
    // transition (not another invented in-floor movement arrow).
    if(target&&current.x===target.x&&current.z===target.z)break;
    let next:DungeonPoint|null=target
      ?chooseKnownRouteStep(layout,current,target):null;
    if(!next&&homeward)break;
    if(!next&&resourceTarget)
      next=chooseKnownResourceStep(layout,current,resourceTarget);
    next??=chooseLevel7Step(layout,current);
    next??=chooseRenewedSiteStep(layout,current,
      new Set(current.visited),new Set(resolved));
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
  const hasDownStair=hero.plannedAction==="descend"&&layout.floor<4;
  const hasUpStair=hero.plannedAction==="ascend"&&
    layout.floor>1&&layout.floor<=4;
  const atStair=hasDownStair?dungeonDownStair(layout):
    layout.entrance;
  if((hasDownStair||hasUpStair||hero.plannedAction==="shop")&&
    hero.x===atStair.x&&hero.z===atStair.z)
    return "At staircase / exit · awaiting committed transition";
  return "No connected next tile or eligible renewed site · awaiting world decision";
}
