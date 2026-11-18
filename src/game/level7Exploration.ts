import type { AdventurerState } from "./adventurers.ts";
import {
  dungeonNeighbors, dungeonShortestPath, generateExpeditionLayout, tileAt,
  type DungeonFeature, type DungeonLayout, type DungeonPoint,
} from "./dungeonLayout.ts";
import { resolveGroupCombat, type CombatantSpec, type GroupCombatReplay } from "./groupCombat.ts";
import { SeededRandom } from "./random.ts";
import {
  dungeonGenerationSeed, dungeonSiteGeneration, refreshDungeonSites,
  resolveDungeonSite, type DungeonSiteCycle,
} from "./dungeonRegeneration.ts";

export const LEVEL7_STEP_BUDGET = 16;
export const LEVEL7_REPLAY_KEEP = 3;
export const LEVEL7_MAX_ENCOUNTERS = 1;
export const LEVEL7_COMBAT_SECONDS = 25;

/** A durable, global shared dungeon world plus per-hero independent exploration. */
export interface Level7HeroProgress {
  readonly heroId: string;
  readonly x: number;
  readonly z: number;
  /** Canonical grid indices, in the order the hero first visited them. */
  readonly visited: readonly number[];
}
export interface Level7World {
  readonly resolvedFeatureIds: readonly string[];
  readonly heroes: readonly Level7HeroProgress[];
  /** Version-13 backwards compatible; each ordinary site's current generation. */
  readonly siteCycles?: readonly DungeonSiteCycle[];
}
export type Level7Outcome = "exploring" | "retreat" | "death" | "completed";
export type Level7Action = "enter" | "walk" | "treasure" | "trap" |
  "combat" | "defeat-monster" | "retreat" | "death" | "complete";
export interface Level7ReplayStep extends DungeonPoint {
  readonly t: number;
  readonly action: Level7Action;
  readonly hp: number;
  readonly featureId?: string;
}
export interface Level7ReplayEncounter {
  readonly featureId: string;
  readonly x: number;
  readonly z: number;
  /** Optional site generation. Older recordings without it are cycle zero. */
  readonly siteCycle?: number;
  /** Actual fixed-step combat output. Do not resimulate on playback. */
  readonly combat: GroupCombatReplay;
}
/** Replays from all spatial early floors share the same immutable frame schema. */
export type SpatialDungeonFloor = 1 | 2 | 3 | 4 | 7;
export interface Level7Replay {
  readonly version: 1;
  readonly day: number;
  readonly heroId: string;
  readonly floor: SpatialDungeonFloor;
  readonly appearance: {
    readonly role: AdventurerState["role"];
    readonly equipment: AdventurerState["equipment"];
  };
  /** Historical knowledge before this day; older v8 recordings may omit it. */
  readonly knownAtStart?: readonly number[];
  readonly resolvedAtStart?: readonly string[];
  readonly steps: readonly Level7ReplayStep[];
  readonly encounters: readonly Level7ReplayEncounter[];
  readonly outcome: Level7Outcome;
}
export const emptyLevel7World = (): Level7World => ({
  resolvedFeatureIds: [], heroes: [],
});
export function getLevel7Progress(
  world: Level7World, heroId: string, layout: DungeonLayout,
): Level7HeroProgress {
  return world.heroes.find(h => h.heroId === heroId) ?? {
    heroId, ...layout.entrance,
    visited: [layout.entrance.z * layout.width + layout.entrance.x],
  };
}
const tileIndex = (layout: DungeonLayout, p: DungeonPoint) =>
  p.z * layout.width + p.x;
const byPoint = (a: DungeonPoint,b: DungeonPoint) => a.z-b.z||a.x-b.x;

/**
 * A cautious autonomous walker. It can inspect only its own visited cells
 * and their immediate open neighbours; it does not navigate directly to
 * unknown monster/chest coordinates. No UI/camera input is consulted.
 */
export function chooseLevel7Step(
  layout: DungeonLayout, progress: Level7HeroProgress,
): DungeonPoint | null {
  const current = {x:progress.x,z:progress.z};
  const known = new Set(progress.visited);
  const adjacent = dungeonNeighbors(layout,current).sort(byPoint);
  const newNeighbor = adjacent.find(p=>!known.has(tileIndex(layout,p)));
  if(newNeighbor)return newNeighbor;
  // One BFS over visited tiles, not a shortest-path search for each frontier.
  // The first reached frontier is the nearest known branch needing exploration.
  const start=tileIndex(layout,current);
  const queue:[number]=[start];
  const parent=new Map<number,number>([[start,start]]);
  for(let i=0;i<queue.length;i++){
    const idx=queue[i],here={x:idx%layout.width,z:Math.floor(idx/layout.width)};
    const neighbors=dungeonNeighbors(layout,here).sort(byPoint);
    if(idx!==start && neighbors.some(n=>!known.has(tileIndex(layout,n)))){
      let toward=idx;
      while(parent.get(toward)!==start)toward=parent.get(toward)!;
      return {x:toward%layout.width,z:Math.floor(toward/layout.width)};
    }
    for(const next of neighbors){
      const key=tileIndex(layout,next);
      if(!known.has(key)||parent.has(key))continue;
      parent.set(key,idx);
      queue.push(key);
    }
  }
  return null;
}

/**
 * Once a floor is completely mapped, re-visit actually renewed unresolved
 * feature sites. The same BFS/path rules apply: never walk through unknown
 * stone or teleport to a newly spawned reward.
 */
function chooseRenewedSiteStep(
  layout: DungeonLayout, current: DungeonPoint,
  visited: ReadonlySet<number>, resolved: ReadonlySet<string>,
): DungeonPoint | null {
  const available = layout.features
    .filter(feature => !resolved.has(feature.id) &&
      visited.has(tileIndex(layout,feature)) &&
      (feature.x !== current.x || feature.z !== current.z))
    .map(feature => dungeonShortestPath(layout,current,feature))
    .filter(route => route.length > 1)
    .sort((a,b) => a.length-b.length ||
      tileIndex(layout,a.at(-1)!)-tileIndex(layout,b.at(-1)!));
  return available[0]?.[1] ?? null;
}

/** Real team fight, resolved once; every hero supplies their own stats and Herbs. */
function fightAgainst(
  party: readonly AdventurerState[], monster: DungeonFeature,
  campaignSeed: number, layout: DungeonLayout, approach: DungeonPoint, cycle = 0,
): {
  survivors: readonly {id:string;hp:number;healsUsed:number}[];
  outcome:"heroes"|"monsters"|"draw";combat:GroupCombatReplay;elite:boolean;
} {
  const monsterRand=new SeededRandom(dungeonGenerationSeed(
    (campaignSeed^Math.imul(monster.x+37*monster.z,2654435761))>>>0,cycle));
  // Only renewable sentries can become elites. No unique boss is regenerated.
  const elite=layout.floor===7 && cycle>0 && cycle%4===1 &&
    tileAt(layout,monster.x,monster.z)==="room";
  const monsterHp=(layout.floor===7
    ?22+monsterRand.int(13):12+layout.floor*3+monsterRand.int(7))+
    (elite?24:0);

  // Use distinct physically walkable grid cells inside this same 7x7 arena.
  // In a narrow corridor spawning three bodies at the same point would be
  // technically accepted by the constructor but visually and physically wrong.
  const available:DungeonPoint[]=[approach];
  const candidates:DungeonPoint[]=[];
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
    const p={x:monster.x+dx,z:monster.z+dz};
    if(tileAt(layout,p.x,p.z)==="wall"||
      (p.x===monster.x&&p.z===monster.z)||
      (p.x===approach.x&&p.z===approach.z))continue;
    candidates.push(p);
  }
  candidates.sort((a,b)=>
    (Math.abs(a.x-approach.x)+Math.abs(a.z-approach.z))-
    (Math.abs(b.x-approach.x)+Math.abs(b.z-approach.z))||
    a.z-b.z||a.x-b.x);
  available.push(...candidates);
  if(available.length<party.length)
    throw new RangeError("Insufficient physical entry positions for this party");
  const specs:CombatantSpec[]=party.map((hero,index)=>{
    const spawn=available[index];
    const sword=hero.equipment.weapon==="Iron Sword";
    return {
      id:hero.id,team:"heroes",role:hero.role,
      style:hero.role==="healer"||hero.role==="DPS"&&!sword?"ranged":"melee",
      x:(spawn.x-monster.x)*2.5,z:(spawn.z-monster.z)*2.5,
      hp:hero.health,maxHp:hero.stats.maxHealth,
      damage:6+Math.floor((hero.role==="healer"?hero.stats.intellect:
        hero.role==="DPS"?hero.stats.agility:hero.stats.strength)/2)+(sword?5:0),
      armor:hero.equipment.armor==="Leather Vest"?5:1,
      agility:hero.stats.agility,
      speed:hero.role==="tank"?2.5:3.1,reach:1.75,
      healCharges:Math.min(2,hero.inventory.healing),
    };
  });
  specs.push({
    id:monster.id,team:"monsters",role:"monster",style:"melee",
    x:0,z:0,hp:monsterHp,maxHp:monsterHp,
    damage:(layout.floor===7?8+monsterRand.int(4):2+layout.floor+monsterRand.int(3))+
      (elite?4:0),
    armor:(monster.subtype==="skeleton"?3:1)+(elite?4:0),
    speed:elite?2.3:2.6,reach:elite?2:1.6,
    ...(elite?{radius:1.05,specialAbility:"grapple-throw" as const,
      grappleDamage:24,agility:8,staggerThreshold:12}:{}),
    ...(monster.subtype==="skeleton" && cycle>0 && cycle%2===1
      ?{meleeAbility:"heavy" as const}:{}),
  });
  const obstacles=[];
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
    if(tileAt(layout,monster.x+dx,monster.z+dz)!=="wall")continue;
    const x=dx*2.5,z=dz*2.5;
    obstacles.push({id:"wall:"+dx+":"+dz,
      minX:x-1.2,maxX:x+1.2,minZ:z-1.2,maxZ:z+1.2});
  }
  const encounter=resolveGroupCombat({
    actors:specs,obstacles,
    bounds:{minX:-8.75,maxX:8.75,minZ:-8.75,maxZ:8.75},
  },LEVEL7_COMBAT_SECONDS);
  return {
    survivors:party.map(hero=>{
      const actor=encounter.state.actors.find(a=>a.id===hero.id)!;
      return {
        id:hero.id,hp:Math.max(0,Math.round(actor.hp)),
        healsUsed:Math.min(2,hero.inventory.healing)-actor.healCharges,
      };
    }),
    outcome:encounter.state.outcome==="fighting"?"draw":encounter.state.outcome,
    combat:encounter.replay,elite,
  };
}

export interface Level7Tick {
  readonly adventurer: AdventurerState;
  readonly world: Level7World;
  readonly replay: Level7Replay;
  readonly gainedGold: number;
  readonly gainedLoot: number;
  readonly defeatedMonsters: number;
}
/**
 * One bounded spatial expedition step for Floors 1–4 AND Level 7.
 * All of them use the same real navigation, seeded site regeneration,
 * treasury/trap resolution, groupCombat motor and immutable replay schema.
 * This is pure and does not access the shop, DOM, camera or global RNG.
 */
export function simulateSpatialDungeonDay(
  hero: AdventurerState, world: Level7World, campaignSeed: number, day: number,
  occupiedHeroIds?: ReadonlySet<string>,
): Level7Tick {
  const floor=hero.floor;
  if(!([1,2,3,4,7] as readonly number[]).includes(floor) ||
     (floor===7 ? hero.status!=="expedition" : hero.status!=="exploring") ||
     hero.health<=0)
    throw new RangeError("A living hero on spatial Floor 1–4 or 7 is required");
  const layout=generateExpeditionLayout(campaignSeed,floor);
  const progress=getLevel7Progress(world,hero.id,layout);
  if(tileAt(layout,progress.x,progress.z)==="wall")
    throw new RangeError("Saved Level 7 hero position is not walkable");
  // Remember old exploration for returning heroes, but don't treat heroes
  // on a different floor as physically occupying a respawn location.
  const occupied = occupiedHeroIds === undefined ? world :
    {...world,heroes:world.heroes.filter(h=>occupiedHeroIds.has(h.heroId))};
  const refreshed=refreshDungeonSites(occupied,layout,day);
  const resolved=new Set(refreshed.resolvedFeatureIds);
  let siteCycles=refreshed.siteCycles;
  const visited=new Set(progress.visited);
  const orderedVisited=[...progress.visited];
  const steps:Level7ReplayStep[]=[
    {x:progress.x,z:progress.z,t:0,action:"enter",hp:hero.health},
  ];
  const encounters:Level7ReplayEncounter[]=[];
  let current={x:progress.x,z:progress.z};
  let hp=hero.health, xp=0, gold=0, loot=0, kills=0;
  let healingSupplies=hero.inventory.healing;
  let outcome:Level7Outcome="exploring";
  for(let t=1;t<=LEVEL7_STEP_BUDGET;t++){
    const next=chooseLevel7Step(layout,{
      heroId:hero.id,x:current.x,z:current.z,visited:orderedVisited,
    }) ?? chooseRenewedSiteStep(layout,current,visited,resolved);
    if(!next){
      outcome="completed";
      steps.push({...current,t,action:"complete",hp});
      break;
    }
    // No teleporting through walls. Every actual movement occupies one edge.
    if(!dungeonNeighbors(layout,current).some(p=>p.x===next.x&&p.z===next.z))
      throw new Error("Level 7 navigation tried to cross a wall");
    const previous=current;
    current=next;
    const idx=tileIndex(layout,current);
    if(!visited.has(idx)){visited.add(idx);orderedVisited.push(idx);}
    steps.push({...current,t,action:"walk",hp});
    const feature=layout.features.find(f=>f.x===current.x&&f.z===current.z);
    if(!feature||resolved.has(feature.id))continue;
    if(feature.kind==="treasure"){
      const treasureRng=new SeededRandom(dungeonGenerationSeed(
        (layout.seed^Math.imul(idx,1597334677))>>>0,
        dungeonSiteGeneration(siteCycles,feature.id)));
      const gain=7+treasureRng.int(9);
      gold+=gain;loot++;xp+=8;
      resolved.add(feature.id);
      siteCycles=resolveDungeonSite(siteCycles,feature.id,day);
      steps.push({...current,t:t+0.1,action:"treasure",featureId:feature.id,hp});
    }else if(feature.kind==="trap"){
      const roll=new SeededRandom(dungeonGenerationSeed(
        (layout.seed^Math.imul(idx,3266489917))>>>0,
        dungeonSiteGeneration(siteCycles,feature.id)));
      const damage=Math.max(1,5+roll.int(7)-(hero.equipment.armor==="Leather Vest"?3:0));
      hp=Math.max(0,hp-damage);
      resolved.add(feature.id);
      siteCycles=resolveDungeonSite(siteCycles,feature.id,day);
      steps.push({...current,t:t+0.1,action:"trap",featureId:feature.id,hp});
      if(hp===0){outcome="death";steps.push({...current,t:t+0.2,action:"death",hp});break;}
    }else {
      const fight=fightAgainst({
        ...hero,health:hp,inventory:{...hero.inventory,healing:healingSupplies},
      },feature,layout.seed,layout,previous,
        dungeonSiteGeneration(siteCycles,feature.id));
      healingSupplies=Math.max(0,healingSupplies-fight.healsUsed);
      encounters.push({featureId:feature.id,...current,
        siteCycle:dungeonSiteGeneration(siteCycles,feature.id),
        combat:fight.combat});
      hp=fight.hp;
      steps.push({...current,t:t+0.1,action:"combat",featureId:feature.id,hp});
      if(fight.outcome==="heroes"){
        resolved.add(feature.id);
        siteCycles=resolveDungeonSite(siteCycles,feature.id,day);
        kills++;xp+=fight.elite?28:12;gold+=fight.elite?6:2;
        steps.push({...current,t:t+0.2,action:"defeat-monster",featureId:feature.id,hp});
        // One combat at most per confirmed day; no simulated encounters offscreen.
        break;
      }
      outcome=hp===0?"death":"retreat";
      steps.push({...current,t:t+0.2,action:hp===0?"death":"retreat",hp});
      break;
    }
  }
  const xpTotal=hero.xp+xp;
  const dead=hp<=0;
  const finished=outcome==="completed";
  const returning=floor===7 && (outcome==="retreat"||finished);
  const adventurer:AdventurerState={
    ...hero,health:hp,gold:hero.gold+gold,xp:xpTotal,
    level:1+Math.floor(xpTotal/100),
    floor:(returning?4:floor),
    status:dead?"dead":returning?"traveling":floor===7?"expedition":"exploring",
    inventory:{...hero.inventory,loot:hero.inventory.loot+loot,healing:healingSupplies},
  };
  // Death leaves the world intact but removes that hero from active progress.
  const updated:Level7HeroProgress={
    heroId:hero.id,x:current.x,z:current.z,visited:orderedVisited,
  };
  const heroes=world.heroes.filter(x=>x.heroId!==hero.id);
  if(!dead&&!returning)heroes.push(updated);
  const replay:Level7Replay={
    version:1,day,heroId:hero.id,floor:floor as SpatialDungeonFloor,
    appearance:{role:hero.role,equipment:{...hero.equipment}},
    knownAtStart:[...progress.visited],
    resolvedAtStart:[...refreshed.resolvedFeatureIds],
    steps,encounters,outcome,
  };
  return {
    adventurer,
    world:{resolvedFeatureIds:[...resolved],heroes,siteCycles},
    replay,gainedGold:gold,gainedLoot:loot,defeatedMonsters:kills,
  };
}

/** Legacy Level 7 API remains a strict wrapper over the SAME motor. */
export function simulateLevel7Day(
  hero: AdventurerState, world: Level7World, campaignSeed: number, day: number,
): Level7Tick {
  if(hero.status!=="expedition"||hero.floor!==7||hero.health<=0)
    throw new RangeError("Level 7 run requires a living F7 expedition hero");
  return simulateSpatialDungeonDay(hero,world,campaignSeed,day);
}
