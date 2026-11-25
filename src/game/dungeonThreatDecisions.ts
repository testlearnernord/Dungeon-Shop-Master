import type {AdventurerState} from "./adventurers.ts";
import {heroProgression} from "./heroProgression.ts";
import {equipmentEffects,gearFromName} from "./gearCatalog.ts";
import {dungeonNeighbors,type DungeonLayout,type DungeonPoint}
  from "./dungeonLayout.ts";
import {getSpatialDungeonProgress,chooseKnownRouteStep,chooseSpatialDungeonStep,chooseDungeonTransitionRoute,
  type SpatialDungeonWorld} from "./spatialDungeonExploration.ts";
import {hasDungeonLineOfSight,dungeonCurrentSight} from "./heroPerception.ts";
import {MONSTER_SIGHT_RADIUS,type DungeonMonsterState} from "./dungeonMonsterWorld.ts";
import {observedGhoulPackSize,isEliteGhoulSite} from "./ghoulPack.ts";

import {DUNGEON_STEP_INTERVAL_TICKS} from "./dungeonPacing.ts";

export type DungeonThreatAction="ESCAPING"|"BREAKING_LOS"|
  "PREPARING_TO_FIGHT"|"SEEKING_SUPPORT"|"AVOIDING_THREAT"|"WAITING_FOR_SAFETY";
export interface DungeonThreatReaction {
  readonly action:DungeonThreatAction;
  readonly monsterId:string;
  readonly step:DungeonPoint;
}

const distance=(a:DungeonPoint,b:DungeonPoint)=>
  Math.abs(a.x-b.x)+Math.abs(a.z-b.z);
const compare=(a:DungeonPoint,b:DungeonPoint)=>a.z-b.z||a.x-b.x;

/** A risk preference for a currently visible pack, not a combat forecast
 * or an immunity rule. Only the observer's actual owned equipment, health,
 * experience, supplies and personality affect willingness to engage.
 * A real collision still enters the normal fight regardless of this choice.
 */
export function canSoloChallengeVisiblePack(
  hero:AdventurerState,layout:DungeonLayout,monster:DungeonMonsterState,
):boolean{
  const gear=equipmentEffects(hero.role,hero.equipment);
  const hp=hero.health/heroProgression(hero).maxHealth;
  const careful=hero.traits.positive==="careful";
  const reckless=hero.traits.negative==="reckless";
  const brave=hero.traits.positive==="brave";
  if(!gear.weapon)return false;
  const source={x:monster.homeX,z:monster.homeZ};
  const pack=observedGhoulPackSize(layout,source,monster.siteCycle);
  const elite=isEliteGhoulSite(layout,source,monster.siteCycle);
  const weaponTier=gearFromName(gear.weapon)?.tier??0;
  const armorTier=gearFromName(gear.vest)?.tier??0;
  const supplies=hero.inventory.healing>0;
  if(pack===1&&!elite)
    return hp>.70&&(hero.level>=3||brave||reckless);
  // Deep packs are a different risk class, even if the hero previously
  // defeated lone opponents on that floor. Recklessness relaxes but
  // never erases preparation requirements.
  if(pack===3){
    return reckless&&!careful&&weaponTier===2&&armorTier===2&&
      hero.level>=7&&hp>=.90;
  }
  const minimumLevel=Math.max(2,layout.floor-3);
  const healthThreshold=careful?.90:reckless?.70:brave?.77:.82;
  if(hp<healthThreshold||hero.level<minimumLevel)return false;
  if(!armorTier)return false;
  if(layout.floor>=5||elite){
    if(weaponTier<2&&armorTier<2)return false;
    if(!supplies&&armorTier<2&&hero.role!=="healer")return false;
  }
  return true;
}

/** The existing walker executes this ONE actual adjacent tile.
 * The decision uses only monsters this party can really see right now,
 * and other heroes whose real coordinates are equally visible. Neither
 * the global spectator nor a future undiscovered route supplies facts. */
export function chooseDungeonThreatReaction(
  layout:DungeonLayout,world:SpatialDungeonWorld,
  group:readonly AdventurerState[],roster:readonly AdventurerState[],returning=false,
  cautious=false,
):DungeonThreatReaction|null{
  if(!group.length||!world.monsters?.length)return null;
  const leader=group[0];
  const at=getSpatialDungeonProgress(world,leader.id,layout);
  const partyIds=new Set(group.map(hero=>hero.id));
  const visible=world.monsters.filter(monster=>
    monster.mode!=="ENGAGED"&&
    (cautious||(monster.mode==="CHASING"||monster.mode==="ALERT")&&
      !!monster.targetHeroId&&partyIds.has(monster.targetHeroId))&&
    hasDungeonLineOfSight(layout,at,monster,MONSTER_SIGHT_RADIUS));
  if(!visible.length)return null;
  const monster=[...visible].sort((a,b)=>
    distance(at,a)-distance(at,b)||a.id.localeCompare(b.id))[0];
  const neighbors=dungeonNeighbors(layout,at).sort(compare);
  if(!neighbors.length)return null;

  const health=Math.min(...group.map(hero=>
    hero.health/heroProgression(hero).maxHealth));
  const equipped=group.filter(hero=>equipmentEffects(hero.role,hero.equipment).weapon!==null).length;
  const careful=group.some(hero=>hero.traits.positive==="careful");
  const strong=!returning&&(group.length===1
    ?visible.every(pack=>canSoloChallengeVisiblePack(leader,layout,pack))&&visible.length===1
    :health>.70&&equipped>0);

  const visibleAllies=roster.filter(hero=>
    !partyIds.has(hero.id)&&hero.status==="exploring"&&
    hero.floor===layout.floor&&hero.health>0&&
    hasDungeonLineOfSight(layout,at,
      getSpatialDungeonProgress(world,hero.id,layout),MONSTER_SIGHT_RADIUS))
    .map(hero=>({
      hero,point:getSpatialDungeonProgress(world,hero.id,layout),
    })).sort((a,b)=>distance(at,a.point)-distance(at,b.point)||
      a.hero.id.localeCompare(b.hero.id));

  // If a grievously hurt member requests retreat, the whole Temporary
  // Party follows: no split party, teleport, or free rescue.
  if(returning||cautious||health<.45||careful&&health<.7){
    const saved=getSpatialDungeonProgress(world,leader.id,layout);
    const home=chooseKnownRouteStep(layout,saved,layout.entrance);
    const choices=neighbors.filter(point=>
      !visible.some(body=>body.x===point.x&&body.z===point.z));
    if(!choices.length)return null;
    const safer=[...choices].sort((a,b)=>{
      const score=(point:DungeonPoint)=>
        (hasDungeonLineOfSight(layout,point,monster,MONSTER_SIGHT_RADIUS)?0:10)+
        distance(point,monster)*3+
        (saved.visited.includes(point.z*layout.width+point.x)?2:0)+
        (home&&home.x===point.x&&home.z===point.z?2:0);
      return score(b)-score(a)||compare(a,b);
    })[0];
    return {action:"ESCAPING",monsterId:monster.id,step:safer};
  }

  // An isolated underequipped survivor may physically meet another visible
  // adventurer. Joining still depends on the existing party negotiation.
  if(group.length===1&&!strong&&visibleAllies.length){
    const ally=visibleAllies[0].point;
    const toward=neighbors.filter(point=>
      !visible.some(body=>body.x===point.x&&body.z===point.z)&&
      distance(point,ally)<distance(at,ally))
      .sort((a,b)=>distance(a,ally)-distance(b,ally)||compare(a,b))[0];
    if(toward)return {action:"SEEKING_SUPPORT",monsterId:monster.id,
      step:toward};
  }

  if(strong){
    const toward=neighbors.filter(point=>
      distance(point,monster)<distance(at,monster))
      .sort((a,b)=>distance(a,monster)-distance(b,monster)||compare(a,b))[0];
    if(toward)return {action:"PREPARING_TO_FIGHT",
      monsterId:monster.id,step:toward};
  }

  // The cautious alternative bends around a nearby corridor if that breaks
  // the Ghoul's physical sightline, otherwise maximizes actual separation.
  const safer=neighbors.filter(point=>
    !visible.some(body=>body.x===point.x&&body.z===point.z))
    .sort((a,b)=>{
      const score=(point:DungeonPoint)=>
        (hasDungeonLineOfSight(layout,point,monster,MONSTER_SIGHT_RADIUS)?0:20)+
        distance(point,monster)*2;
      return score(b)-score(a)||compare(a,b);
    })[0];
  return safer?{action:"BREAKING_LOS",monsterId:monster.id,step:safer}:null;
}

/** Only a personally seen location, never a live hidden pack locator. */
export interface DungeonThreatMemory extends DungeonPoint {
  readonly monsterId:string;
  readonly seenTick:number;
}
export const THREAT_MEMORY_TICKS=20*DUNGEON_STEP_INTERVAL_TICKS;
export interface RememberedThreatReaction {
  readonly action:"AVOIDING_THREAT"|"WAITING_FOR_SAFETY";
  readonly monsterId:string;
  readonly step:DungeonPoint|null;
  readonly retreatUp:boolean;
}
export function recentDungeonThreat(
  memories:readonly (DungeonThreatMemory|undefined)[],tick:number,
):DungeonThreatMemory|undefined{
  return memories.filter((m):m is DungeonThreatMemory=>!!m&&
    m.seenTick<=tick&&tick-m.seenTick<THREAT_MEMORY_TICKS)
    .sort((a,b)=>b.seenTick-a.seenTick||a.monsterId.localeCompare(b.monsterId))[0];
}

/** Share only memories of co-located companions. Use the existing known
 * route and frontier search with the last observed danger zone excluded.
 * If the goal is blocked, explore safely, retreat upstairs or wait to
 * reassess. No new movement authority, hidden location or forced combat. */
export function chooseRememberedThreatReaction(
  layout:DungeonLayout,world:SpatialDungeonWorld,group:readonly AdventurerState[],
  memory:DungeonThreatMemory|undefined,target:DungeonPoint|undefined,returning=false,
):RememberedThreatReaction|null{
  if(!memory||!group.length)return null;
  // A sufficiently healthy armed group can reconsider a former solo threat.
  if(!returning&&group.length>1&&group.every(h=>h.health/heroProgression(h).maxHealth>.70)&&
    group.some(h=>!!equipmentEffects(h.role,h.equipment).weapon))return null;
  const progress=group.map(h=>getSpatialDungeonProgress(world,h.id,layout));
  const current=progress[0];
  const avoided=dungeonCurrentSight(layout,memory,MONSTER_SIGHT_RADIUS);
  const shared={...current,visited:[...new Set(progress.flatMap(p=>p.visited))]};
  const result=(step:DungeonPoint|null,retreatUp=false):RememberedThreatReaction=>({
    action:step?"AVOIDING_THREAT":"WAITING_FOR_SAFETY",monsterId:memory.monsterId,step,retreatUp,
  });
  const desired=returning?layout.entrance:target;
  if(desired){
    const route=chooseDungeonTransitionRoute(layout,progress,desired,avoided);
    if(route.step)return result(route.step);
  }else{
    const frontier=chooseSpatialDungeonStep(layout,shared,avoided);
    if(frontier)return result(frontier);
  }
  // Prefer a physically known safe upper exit rather than trying the same
  // blocked descent again. A shop-bound explorer retains its original trip.
  if(!returning&&layout.floor>1){
    if(current.x===layout.entrance.x&&current.z===layout.entrance.z)
      return result(null,true);
    const up=chooseKnownRouteStep(layout,shared,layout.entrance,avoided);
    if(up)return result(up,true);
  }
  // If still inside the remembered exposure zone, step farther away rather
  // than returning toward the last observed danger. Never fabricate a path.
  const away=dungeonNeighbors(layout,current).filter(p=>
    distance(p,memory)>distance(current,memory))
    .sort((a,b)=>Number(avoided.has(a.z*layout.width+a.x))-
      Number(avoided.has(b.z*layout.width+b.x))||distance(b,memory)-distance(a,memory)||compare(a,b))[0];
  if(avoided.has(current.z*layout.width+current.x)&&away)return result(away);
  return result(null);
}
