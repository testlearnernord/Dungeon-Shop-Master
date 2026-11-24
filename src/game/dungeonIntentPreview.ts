import type {DungeonLayout,DungeonPoint} from "./dungeonLayout.ts";
import {dungeonDownStair,dungeonNeighbors} from "./dungeonLayout.ts";
import {isOrdinaryDungeonFloor,FIRST_DUNGEON_FLOOR} from "./dungeonTopology.ts";
import {chooseDungeonTravelStep,type SpatialDungeonHeroProgress,type SpatialDungeonWorld}
  from "./spatialDungeonExploration.ts";
import {selectKnownResourceSite} from "./dungeonDecisions.ts";
import type {LiveFloorHero,LiveFloorSpectatorFrame} from "./liveFloorSpectator.ts";

type PreviewHero=Pick<LiveFloorHero,
  "id"|"x"|"z"|"visited"|"activity"|"inCombat"|"plannedAction"> &
  Partial<Pick<LiveFloorHero,"goal"|"partyMemberIds"|"threatNextStep">>;
type PreviewContext=Pick<LiveFloorSpectatorFrame,"heroes"|"monsters">;

function stairTarget(layout:DungeonLayout,hero:PreviewHero):DungeonPoint|null{
  if(!isOrdinaryDungeonFloor(layout.floor))return null;
  if(hero.activity==="backtracking"||hero.plannedAction==="shop"||
    hero.plannedAction==="ascend"&&layout.floor>FIRST_DUNGEON_FLOOR)return layout.entrance;
  return hero.plannedAction==="descend"?dungeonDownStair(layout):null;
}

/** Read-only forecast from the existing pure walker, never another owner. */
export function predictDungeonHeroSteps(
  layout:DungeonLayout,hero:PreviewHero,resolved:readonly string[]=[],
  context?:PreviewContext,
):readonly DungeonPoint[]{
  if(!isOrdinaryDungeonFloor(layout.floor)||hero.inCombat||hero.activity==="portal")return [];
  if(hero.threatNextStep)return dungeonNeighbors(layout,hero).some(p=>
    p.x===hero.threatNextStep!.x&&p.z===hero.threatNextStep!.z)?[hero.threatNextStep]:[];
  const peers=context?.heroes.filter(h=>h.id!==hero.id&&
    hero.partyMemberIds?.includes(h.id)&&h.x===hero.x&&h.z===hero.z&&
    !h.inCombat&&h.activity==="exploring")??[];
  const homeward=hero.activity==="backtracking"||hero.plannedAction==="shop";
  let progress:SpatialDungeonHeroProgress[]=[hero,...(homeward?[]:peers)].map(h=>({
    heroId:h.id,x:h.x,z:h.z,visited:[...h.visited],
  }));
  const result:DungeonPoint[]=[];
  const target=stairTarget(layout,hero);
  const resource=hero.goal==="loot-chest"?"treasure":hero.goal==="hunt-ghouls"?"monster":null;
  const world:SpatialDungeonWorld={resolvedFeatureIds:resolved,heroes:progress,
    ...(context?.monsters!==undefined?{monsters:context.monsters}:{})};
  const resourceTarget=resource&&!target?selectKnownResourceSite(layout,progress[0],world,resource):null;
  const resolvedSet=new Set(resolved);
  for(let i=0;i<2;i++){
    const current=progress[0];
    if(target&&current.x===target.x&&current.z===target.z)break;
    let next:DungeonPoint|null;
    try{
      next=chooseDungeonTravelStep(layout,progress,resolvedSet,{
        ...(homeward?{returnToEntrance:true}:target?{routeToKnownTarget:target}:{}),
        ...(resourceTarget?{routeToResource:resourceTarget}:{}),
      });
    }catch(error){
      if(!(error instanceof RangeError)||!homeward)throw error;
      break;
    }
    if(!next||!dungeonNeighbors(layout,current).some(p=>p.x===next!.x&&p.z===next!.z))break;
    result.push(next);
    const index=next.z*layout.width+next.x;
    progress=progress.map(h=>({...h,x:next!.x,z:next!.z,
      visited:h.visited.includes(index)?h.visited:[...h.visited,index]}));
    if(layout.features.some(f=>f.x===next!.x&&f.z===next!.z&&!resolvedSet.has(f.id)&&
      (f.kind!=="monster"||world.monsters===undefined))||
      world.monsters?.some(m=>m.x===next!.x&&m.z===next!.z))break;
  }
  return result;
}

export function dungeonPreviewExplanation(
  layout:DungeonLayout,hero:PreviewHero,resolved:readonly string[]=[],
  context?:PreviewContext,
):string{
  if(hero.inCombat)return "In LIVE combat · route forecast paused";
  if(hero.activity==="portal")return "Crossing the portal · no floor route";
  const next=predictDungeonHeroSteps(layout,hero,resolved,context);
  if(next.length===2)return next.map((p,i)=>
    (i+1)+": ("+p.x+", "+p.z+")").join(" → ")+" · PREVIEW";
  if(next.length===1){
    const cell=next[0],feature=layout.features.find(f=>
      f.x===cell.x&&f.z===cell.z&&!resolved.includes(f.id)&&
      (f.kind!=="monster"||context?.monsters===undefined));
    const monster=context?.monsters?.some(m=>m.x===cell.x&&m.z===cell.z);
    return "1: ("+cell.x+", "+cell.z+") · "+
      (feature||monster?"Site interaction next; step 2 depends on outcome":"Second step not predictable");
  }
  const target=stairTarget(layout,hero);
  if(target&&hero.x===target.x&&hero.z===target.z)
    return "At staircase / exit · awaiting committed transition";
  return "No connected next tile or eligible renewed site · awaiting world decision";
}
