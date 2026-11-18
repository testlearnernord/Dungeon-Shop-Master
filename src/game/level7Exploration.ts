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
/** One committed world and one replay viewpoint per real participant. */
export interface Level7PartyTick {
  readonly ticks: readonly Level7Tick[];
  readonly world: Level7World;
}

/**
 * Shared spatial navigation and combat authority for solo and co-located
 * parties. Each member walks the same actual edges; all inventory, HP and
 * character XP settlement remains individual. One monster site can only
 * yield one generation of loot/gold, no matter how many heroes fight it.
 */
export function simulateSpatialDungeonPartyDay(
  party: readonly AdventurerState[], world: Level7World,
  campaignSeed: number, day: number,
  occupiedHeroIds?: ReadonlySet<string>,
): Level7PartyTick {
  if(party.length<1||party.length>3)
    throw new RangeError("Spatial expeditions support 1–3 co-located heroes");
  const floor=party[0].floor;
  const ids=new Set(party.map(hero=>hero.id));
  if(ids.size!==party.length ||
    !([1,2,3,4,7] as readonly number[]).includes(floor) ||
    party.some(hero=>hero.floor!==floor||hero.health<=0||
      (floor===7?hero.status!=="expedition":hero.status!=="exploring")))
    throw new RangeError("Party members must be distinct living explorers on one floor");
  const layout=generateExpeditionLayout(campaignSeed,floor);
  const progress=party.map(hero=>getLevel7Progress(world,hero.id,layout));
  const entry=progress[0];
  if(party.some((_,index)=>progress[index].x!==entry.x||
    progress[index].z!==entry.z) ||
    tileAt(layout,entry.x,entry.z)==="wall")
    throw new RangeError("Party members must start on the same walkable dungeon tile");

  // Only truly active bodies block site refresh; historical hero knowledge
  // from other floors is retained but does not represent an occupant.
  const occupied=occupiedHeroIds===undefined?world:
    {...world,heroes:world.heroes.filter(p=>occupiedHeroIds.has(p.heroId))};
  const refreshed=refreshDungeonSites(occupied,layout,day);
  const resolved=new Set(refreshed.resolvedFeatureIds);
  let siteCycles=refreshed.siteCycles;
  const members=party.map((hero,index)=>({
    hero,progress:progress[index],
    visited:new Set(progress[index].visited),
    visitedOrder:[...progress[index].visited],
    hp:hero.health,healing:hero.inventory.healing,
    xp:0,gold:0,loot:0,kills:0,
    steps:[{x:entry.x,z:entry.z,t:0,action:"enter" as Level7Action,
      hp:hero.health}] as Level7ReplayStep[],
  }));
  const encounters:Level7ReplayEncounter[]=[];
  let current:DungeonPoint={x:entry.x,z:entry.z};
  let outcome:Level7Outcome="exploring";

  const step=(t:number,action:Level7Action,featureId?:string):void=>{
    for(const m of members)m.steps.push({
      ...current,t,action,hp:m.hp,...(featureId?{featureId}:{}),
    });
  };
  const shareGold=(amount:number):void=>{
    const eligible=members.filter(m=>m.hp>0).sort((a,b)=>
      a.hero.id.localeCompare(b.hero.id));
    if(!eligible.length)return;
    const each=Math.floor(amount/eligible.length),extra=amount%eligible.length;
    eligible.forEach((m,index)=>{m.gold+=each+(index<extra?1:0);});
  };

  for(let t=1;t<=LEVEL7_STEP_BUDGET;t++){
    const lead=members[0];
    const next=chooseLevel7Step(layout,{
      heroId:lead.hero.id,x:current.x,z:current.z,visited:lead.visitedOrder,
    }) ?? chooseRenewedSiteStep(layout,current,lead.visited,resolved);
    if(!next){
      outcome="completed";
      step(t,"complete");
      break;
    }
    if(!dungeonNeighbors(layout,current).some(p=>p.x===next.x&&p.z===next.z))
      throw new Error("Party navigation tried to cross a dungeon wall");
    const previous=current;
    current=next;
    const idx=tileIndex(layout,current);
    for(const m of members)if(!m.visited.has(idx)){
      m.visited.add(idx);m.visitedOrder.push(idx);
    }
    step(t,"walk");
    const feature=layout.features.find(f=>f.x===current.x&&f.z===current.z);
    if(!feature||resolved.has(feature.id))continue;
    if(feature.kind==="treasure"){
      const rng=new SeededRandom(dungeonGenerationSeed(
        (layout.seed^Math.imul(idx,1597334677))>>>0,
        dungeonSiteGeneration(siteCycles,feature.id)));
      const gain=7+rng.int(9);
      shareGold(gain);
      const claimant=members.find(m=>m.hp>0);
      if(claimant)claimant.loot+=1; // One chest contains one actual loot unit.
      for(const m of members)if(m.hp>0)m.xp+=8;
      resolved.add(feature.id);
      siteCycles=resolveDungeonSite(siteCycles,feature.id,day);
      step(t+0.1,"treasure",feature.id);
    }else if(feature.kind==="trap"){
      const rng=new SeededRandom(dungeonGenerationSeed(
        (layout.seed^Math.imul(idx,3266489917))>>>0,
        dungeonSiteGeneration(siteCycles,feature.id)));
      const raw=5+rng.int(7);
      // Everybody physically walking across this tile suffers the same
      // trap activation, reduced by their OWN purchased Leather Vest.
      for(const m of members)m.hp=Math.max(0,m.hp-Math.max(1,raw-
        (m.hero.equipment.armor==="Leather Vest"?3:0)));
      resolved.add(feature.id);
      siteCycles=resolveDungeonSite(siteCycles,feature.id,day);
      step(t+0.1,"trap",feature.id);
      if(members.some(m=>m.hp===0)){
        outcome="retreat";
        for(const m of members)m.steps.push({...current,t:t+0.2,
          action:m.hp===0?"death":"retreat",hp:m.hp});
        break;
      }
    }else{
      const active=members.filter(m=>m.hp>0).map(m=>({
        ...m.hero,health:m.hp,
        inventory:{...m.hero.inventory,healing:m.healing},
      }));
      const fight=fightAgainst(active,feature,layout.seed,layout,previous,
        dungeonSiteGeneration(siteCycles,feature.id));
      for(const survivor of fight.survivors){
        const m=members.find(candidate=>candidate.hero.id===survivor.id)!;
        m.hp=survivor.hp;
        m.healing=Math.max(0,m.healing-survivor.healsUsed);
      }
      encounters.push({featureId:feature.id,...current,
        siteCycle:dungeonSiteGeneration(siteCycles,feature.id),
        combat:fight.combat});
      step(t+0.1,"combat",feature.id);
      if(fight.outcome==="heroes"){
        resolved.add(feature.id);
        siteCycles=resolveDungeonSite(siteCycles,feature.id,day);
        const alive=members.filter(m=>m.hp>0);
        for(const m of alive)m.xp+=fight.elite?28:12;
        if(alive.length)alive[0].kills+=1;
        shareGold(fight.elite?6:2);
        for(const m of members)m.steps.push({...current,t:t+0.2,
          action:m.hp===0?"death":"defeat-monster",featureId:feature.id,hp:m.hp});
      }else{
        outcome="retreat";
        for(const m of members)m.steps.push({...current,t:t+0.2,
          action:m.hp===0?"death":"retreat",hp:m.hp});
      }
      // Exactly one encounter/site/day, regardless of surviving party size.
      break;
    }
  }

  const partyIds=new Set(party.map(h=>h.id));
  const survivors=world.heroes.filter(progress=>!partyIds.has(progress.heroId));
  const ticks:Level7Tick[]=members.map(m=>{
    const dead=m.hp<=0;
    const personalOutcome:Level7Outcome=dead?"death":outcome;
    const returning=floor===7 && !dead &&
      (personalOutcome==="retreat"||personalOutcome==="completed");
    const xp=m.hero.xp+m.xp;
    const adventurer:AdventurerState={
      ...m.hero,health:m.hp,xp,level:1+Math.floor(xp/100),
      gold:m.hero.gold+m.gold,
      floor:returning?4:floor,
      status:dead?"dead":returning?"traveling":
        floor===7?"expedition":"exploring",
      inventory:{...m.hero.inventory,
        loot:m.hero.inventory.loot+m.loot,healing:m.healing},
    };
    if(!dead&&!returning)survivors.push({
      heroId:m.hero.id,...current,visited:m.visitedOrder,
    });
    const replay:Level7Replay={
      version:1,day,heroId:m.hero.id,floor:floor as SpatialDungeonFloor,
      appearance:{role:m.hero.role,equipment:{...m.hero.equipment}},
      knownAtStart:[...m.progress.visited],
      resolvedAtStart:[...refreshed.resolvedFeatureIds],
      steps:m.steps,encounters,outcome:personalOutcome,
    };
    return {adventurer,world:undefined as never,replay,
      gainedGold:m.gold,gainedLoot:m.loot,defeatedMonsters:m.kills};
  });
  const updatedWorld:Level7World={
    resolvedFeatureIds:[...resolved],heroes:survivors,siteCycles,
  };
  // Every viewpoint references the SAME settled world, not separate copies
  // that could independently claim the chest or revive the encounter.
  return {world:updatedWorld,
    ticks:ticks.map(tick=>({...tick,world:updatedWorld}))};
}

/** The existing one-hero public API is now just the size-one party path. */
export function simulateSpatialDungeonDay(
  hero: AdventurerState, world: Level7World, campaignSeed: number, day: number,
  occupiedHeroIds?: ReadonlySet<string>,
): Level7Tick {
  return simulateSpatialDungeonPartyDay([hero],world,campaignSeed,day,
    occupiedHeroIds).ticks[0];
}

/** Legacy Level 7 API remains a strict wrapper over the SAME motor. */
export function simulateLevel7Day(
  hero: AdventurerState, world: Level7World, campaignSeed: number, day: number,
): Level7Tick {
  if(hero.status!=="expedition"||hero.floor!==7||hero.health<=0)
    throw new RangeError("Level 7 run requires a living F7 expedition hero");
  return simulateSpatialDungeonDay(hero,world,campaignSeed,day);
}
