import type {AdventurerState} from "./adventurers.ts";
import {heroProgression} from "./heroProgression.ts";
import {equipmentEffects,gearFromName} from "./gearCatalog.ts";
import {dungeonNeighbors,type DungeonLayout,type DungeonPoint}
  from "./dungeonLayout.ts";
import {getSpatialDungeonProgress,chooseKnownRouteStep,
  type SpatialDungeonWorld} from "./spatialDungeonExploration.ts";
import {hasDungeonLineOfSight} from "./heroPerception.ts";
import {MONSTER_SIGHT_RADIUS,type DungeonMonsterState} from "./dungeonMonsterWorld.ts";
import {observedGhoulPackSize,isEliteGhoulSite} from "./ghoulPack.ts";

export type DungeonThreatAction="ESCAPING"|"BREAKING_LOS"|
  "PREPARING_TO_FIGHT"|"SEEKING_SUPPORT";
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
