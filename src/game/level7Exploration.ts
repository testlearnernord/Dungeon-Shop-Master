import type { AdventurerState } from "./adventurers.ts";
import {
  dungeonNeighbors, dungeonShortestPath, generateExpeditionLayout, tileAt,
  type DungeonFeature, type DungeonLayout, type DungeonPoint,
} from "./dungeonLayout.ts";
import { resolveGroupCombat, type CombatantSpec, type GroupCombatOptions,
  type GroupCombatState, type GroupCombatReplay } from "./groupCombat.ts";
import { SeededRandom } from "./random.ts";
import {
  dungeonGenerationSeed, dungeonSiteGeneration, refreshDungeonSites,
  resolveDungeonSite, type DungeonSiteCycle,
} from "./dungeonRegeneration.ts";

/** Historical bedtime-only expedition cap. The LIVE scheduler will call the
 * same spatial authority with maxSteps=1 and determine cadence from world
 * time, not silently make 36 moves when a whole day ends.
 */
export const LEVEL7_STEP_BUDGET = 36;
export const LEVEL7_REPLAY_KEEP = 3;
/** Bound battle frequency within a longer day without inventing encounters. */
export const LEVEL7_MAX_ENCOUNTERS = 2;
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
  /** Companions who ACTUALLY shared this historical expedition day. */
  readonly partyMemberIds?: readonly string[];
  /** Each participant's authentic appearance at expedition commitment.
   * Optional in old v1 tapes; never reconstructed from today's mutable roster. */
  readonly partyAppearances?: readonly {
    readonly id:string;
    readonly role:AdventurerState["role"];
    readonly equipment:AdventurerState["equipment"];
  }[];
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

/** Prepare the original fight geometry/stats without advancing its clock. */
export function prepareSpatialDungeonCombat(
  party: readonly AdventurerState[], monster: DungeonFeature,
  campaignSeed: number, layout: DungeonLayout, approach: DungeonPoint, cycle = 0,
):{readonly options:GroupCombatOptions;readonly elite:boolean} {
  const monsterRand=new SeededRandom(dungeonGenerationSeed(
    (campaignSeed^Math.imul(monster.x+37*monster.z,2654435761))>>>0,cycle));
  // Only renewable sentries can become elites. No unique boss is regenerated.
  const elite=layout.floor===7 && cycle>0 && cycle%4===1 &&
    tileAt(layout,monster.x,monster.z)==="room";
  // Prior Ghouls had ~15-30 HP and often died in two hits (~4-5s).
  // Toughness is authoritative, not a slowed replay: each extra party member
  // adds some resistance so a three-hero party does not erase one Ghoul
  // before its authored attacks can play out. All choices stay seed-stable.
  // The 25-second encounter bound and actual hero/monster damage remain real.
  const baseGhoulHp=(layout.floor===7
    ?22+monsterRand.int(13):12+layout.floor*3+monsterRand.int(7))+
    (elite?24:0);
  const partyToughness=1+Math.max(0,party.length-1)*0.65;
  const monsterHp=Math.round(baseGhoulHp*2.4*partyToughness);

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
      equipment:{weapon:sword?"Iron Sword":null,
        armor:hero.equipment.armor==="Leather Vest"?"Leather Vest":null},
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
    armor:1+(elite?4:0),
    speed:elite?2.7:3.0,reach:elite?2:1.6,
    // The grab-and-throw is the signature of the UNIQUE Cave Troll.
    // The shared engine supports it, but renewable generic foes cannot
    // acquire that boss art/ability merely by spawning as elites.
    ...(elite?{radius:1.05,agility:8,staggerThreshold:12}:{}),
    ...(elite?{meleeAbility:"heavy" as const}:{}),
  });
  const obstacles=[];
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
    if(tileAt(layout,monster.x+dx,monster.z+dz)!=="wall")continue;
    const x=dx*2.5,z=dz*2.5;
    obstacles.push({id:"wall:"+dx+":"+dz,
      minX:x-1.2,maxX:x+1.2,minZ:z-1.2,maxZ:z+1.2});
  }
  return {elite,options:{
    actors:specs,obstacles,
    bounds:{minX:-8.75,maxX:8.75,minZ:-8.75,maxZ:8.75},
  }};
}

/** Legacy bounded encounter uses exactly the same prepared group fighters. */
function fightAgainst(
  party: readonly AdventurerState[], monster: DungeonFeature,
  campaignSeed: number, layout: DungeonLayout, approach: DungeonPoint, cycle = 0,
): {
  survivors: readonly {id:string;hp:number;healsUsed:number}[];
  outcome:"heroes"|"monsters"|"draw";combat:GroupCombatReplay;elite:boolean;
} {
  const prepared=prepareSpatialDungeonCombat(party,monster,campaignSeed,layout,approach,cycle);
  const encounter=resolveGroupCombat(prepared.options,LEVEL7_COMBAT_SECONDS);
  return {
    survivors:party.map(hero=>{
      const actor=encounter.state.actors.find(a=>a.id===hero.id)!;
      return {
        id:hero.id,hp:Math.max(0,Math.round(actor.hp)),
        healsUsed:Math.min(2,hero.inventory.healing)-actor.healCharges,
      };
    }),
    outcome:encounter.state.outcome==="fighting"?"draw":encounter.state.outcome,
    combat:encounter.replay,elite:prepared.elite,
  };
}

/**
 * Each companion proposes a legal next edge using only their own
 * discovered tiles. Shared direction is chosen by majority support;
 * tied proposals prefer an edge which is new to more companions and
 * finally stable grid coordinates. A camera/roster order does not lead
 * the group or reveal an unvisited hidden feature.
 */
export function choosePartyDungeonStep(
  layout:DungeonLayout,
  progress:readonly Level7HeroProgress[],
):DungeonPoint|null {
  if(!progress.length)return null;
  if(progress.some(hero=>hero.x!==progress[0].x||
    hero.z!==progress[0].z))
    throw new RangeError("A party cannot vote on paths from separate tiles");
  if(progress.length===1)return chooseLevel7Step(layout,progress[0]);
  const counts=new Map<string,{point:DungeonPoint;votes:number;unknown:number}>();
  for(const hero of progress){
    const candidate=chooseLevel7Step(layout,hero);
    if(!candidate)continue;
    const key=candidate.x+":"+candidate.z;
    const existing=counts.get(key);
    counts.set(key,{point:candidate,votes:(existing?.votes??0)+1,unknown:0});
  }
  if(!counts.size)return null;
  for(const item of counts.values()){
    const index=tileIndex(layout,item.point);
    item.unknown=progress.filter(hero=>!hero.visited.includes(index)).length;
  }
  return [...counts.values()].sort((a,b)=>
    b.votes-a.votes||b.unknown-a.unknown||
    byPoint(a.point,b.point))[0].point;
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
  /** A reserved, not-yet-resolved monster: combat advances via the world clock. */
  readonly pendingCombat?:PreparedSpatialEncounter;
}
export interface PreparedSpatialEncounter {
  readonly featureId:string;
  readonly floor:SpatialDungeonFloor;
  readonly x:number; readonly z:number;
  readonly siteCycle:number;
  readonly elite:boolean;
  readonly options:GroupCombatOptions;
}

/** A bounded advancement window for the ONE spatial/dungeon combat authority.
 * maxSteps=1 is the resume/schedule primitive, maxSteps=36 preserves old
 * history fixtures until the live day-cutover explicitly retires batching.
 * Never recompute an earlier tile or reroll an already-resolved site.
 */
/** Deterministic shortest homeward route across tiles this hero actually
 * knows. No hidden-map shortcut and no new movement/loot/combat engine.
 * The last tile is the dungeon entrance, which connects to Galvik's portal.
 */
export function chooseKnownRouteStep(
  layout:DungeonLayout,progress:Level7HeroProgress,target:DungeonPoint,
):DungeonPoint|null {
  const start=tileIndex(layout,progress);
  const goal=tileIndex(layout,target);
  if(start===goal)return null;
  const known=new Set(progress.visited);
  if(!known.has(start)||!known.has(goal))return null;
  const queue=[start],parents=new Map<number,number>([[start,start]]);
  for(let index=0;index<queue.length&&!parents.has(goal);index++){
    const here=queue[index],location={x:here%layout.width,
      z:Math.floor(here/layout.width)};
    for(const next of dungeonNeighbors(layout,location).sort(byPoint)){
      const cell=tileIndex(layout,next);
      if(!known.has(cell)||parents.has(cell))continue;
      parents.set(cell,here);queue.push(cell);
    }
  }
  if(!parents.has(goal))return null;
  let next=goal;
  while(parents.get(next)!==start){
    const parent=parents.get(next);
    if(parent===undefined)throw new RangeError("Broken return route");
    next=parent;
  }
  return {x:next%layout.width,z:Math.floor(next/layout.width)};
}

/** Return routes are stricter than elective stair travel: the entrance
 * was explored already and every leg MUST remain connected.
 */
export function chooseKnownReturnStep(
  layout:DungeonLayout,progress:Level7HeroProgress,
):DungeonPoint|null {
  const start=tileIndex(layout,progress);
  const goal=tileIndex(layout,layout.entrance);
  if(start===goal)return null;
  const known=new Set(progress.visited);
  if(!known.has(start)||!known.has(goal))
    throw new RangeError("Return route needs visited start and entrance");
  const next=chooseKnownRouteStep(layout,progress,layout.entrance);
  if(!next)throw new RangeError("Visited return route is disconnected");
  return next;
}

export interface SpatialDungeonAdvanceOptions {
  readonly maxSteps?: number;
  readonly maxEncounters?: number;
  /** The existing map motor backtracks ONLY across the hero's known cells. */
  readonly returnToEntrance?:boolean;
  /** A known real staircase tile, not a free remote floor transition. */
  readonly routeToKnownTarget?:DungeonPoint;
  /** A retreat on the live timeline must return via the portal, not teleport. */
  readonly deferReturn?:boolean;
  /** Live mode reserves the site, but does not prematurely calculate its result. */
  readonly deferCombat?:boolean;
  readonly blockedCombatSites?:ReadonlySet<string>;
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
  options:SpatialDungeonAdvanceOptions={},
): Level7PartyTick {
  const maxSteps=options.maxSteps??LEVEL7_STEP_BUDGET;
  const maxEncounters=options.maxEncounters??LEVEL7_MAX_ENCOUNTERS;
  if(!Number.isSafeInteger(maxSteps)||maxSteps<1||
     maxSteps>LEVEL7_STEP_BUDGET)
    throw new RangeError("Spatial dungeon steps must be a positive bounded integer.");
  if(!Number.isSafeInteger(maxEncounters)||maxEncounters<1||
     maxEncounters>LEVEL7_MAX_ENCOUNTERS)
    throw new RangeError("Spatial dungeon encounters must be bounded.");
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
  let encountersResolved=0;
  let pendingCombat:PreparedSpatialEncounter|undefined;

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

  for(let t=1;t<=maxSteps;t++){
    const routeProgress={...progress[0],...current,
      visited:members[0].visitedOrder};
    const stairStep=options.routeToKnownTarget
      ?chooseKnownRouteStep(layout,routeProgress,options.routeToKnownTarget)
      :null;
    const next=(options.returnToEntrance
      ?chooseKnownReturnStep(layout,routeProgress)
      :stairStep??choosePartyDungeonStep(layout,members.map(member=>({
        heroId:member.hero.id,...current,visited:member.visitedOrder,
      }))) ?? chooseRenewedSiteStep(layout,current,
      // Only discovered tiles may steer the renewable-site fallback. A
      // companion's actual knowledge is usable, never global fog of war.
      new Set(members.flatMap(member=>member.visitedOrder)),resolved));
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
      // A site already claimed by another live fight is NOT free loot and
      // does not spawn another combat while its first fight remains active.
      if(options.blockedCombatSites?.has(feature.id))continue;
      const active=members.filter(m=>m.hp>0).map(m=>({
        ...m.hero,health:m.hp,
        inventory:{...m.hero.inventory,healing:m.healing},
      }));
      const cycle=dungeonSiteGeneration(siteCycles,feature.id);
      if(options.deferCombat){
        const prepared=prepareSpatialDungeonCombat(active,feature,layout.seed,
          layout,previous,cycle);
        pendingCombat={featureId:feature.id,floor:floor as SpatialDungeonFloor,
          x:current.x,z:current.z,siteCycle:cycle,...prepared};
        step(t+0.1,"combat",feature.id);
        break;
      }
      const fight=fightAgainst(active,feature,layout.seed,layout,previous,cycle);
      for(const survivor of fight.survivors){
        const m=members.find(candidate=>candidate.hero.id===survivor.id)!;
        m.hp=survivor.hp;
        m.healing=Math.max(0,m.healing-survivor.healsUsed);
      }
      encounters.push({featureId:feature.id,...current,
        siteCycle:dungeonSiteGeneration(siteCycles,feature.id),
        combat:fight.combat});
      encountersResolved++;
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
        // A fallen companion ends this outing. Living friends don't
        // abandon the body and immediately charge into another battle.
        const casualty=members.some(m=>m.hp===0);
        const endangered=members.some(m=>m.hp>0 &&
          m.hp/m.hero.stats.maxHealth<0.35 && m.healing===0);
        if(casualty||endangered){
          outcome="retreat";
          for(const m of members)if(m.hp>0)m.steps.push({...current,t:t+0.3,
            action:"retreat",hp:m.hp});
          break;
        }
        // Battle victory does not magically end the day's exploration.
        // Keep walking the real connected floor until the step or encounter
        // budget is spent, or the party decides to retreat for safety.
        if(encountersResolved>=maxEncounters)break;
        continue;
      }else{
        outcome="retreat";
        for(const m of members)m.steps.push({...current,t:t+0.2,
          action:m.hp===0?"death":"retreat",hp:m.hp});
        break;
      }
    }
  }

  const partyIds=new Set(party.map(h=>h.id));
  const survivors=world.heroes.filter(progress=>!partyIds.has(progress.heroId));
  const outcomes:Omit<Level7Tick,"world">[]=members.map(m=>{
    const dead=m.hp<=0;
    const personalOutcome:Level7Outcome=dead?"death":outcome;
    const returning=!options.deferReturn&&floor===7 && !dead &&
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
      ...(party.length>1?{
        partyMemberIds:party.map(hero=>hero.id),
        partyAppearances:party.map(hero=>({
          id:hero.id,role:hero.role,equipment:{...hero.equipment},
        })),
      }:{}),
      steps:m.steps,encounters,outcome:personalOutcome,
    };
    return {adventurer,replay,
      gainedGold:m.gold,gainedLoot:m.loot,defeatedMonsters:m.kills};
  });
  const updatedWorld:Level7World={
    resolvedFeatureIds:[...resolved],heroes:survivors,siteCycles,
  };
  // Every viewpoint references the SAME settled world, not separate copies
  // that could independently claim the chest or revive the encounter.
  return {world:updatedWorld,
    ticks:outcomes.map(tick=>({...tick,world:updatedWorld})),
    ...(pendingCombat?{pendingCombat}:{})};
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

/**
 * A true single connected dungeon step for an existing hero/party at its
 * current saved location. The FULL spatial path/combat/loot engine above
 * remains authoritative: this adapter only chooses the step budget.
 *
 * A fight is still resolved atomically by the existing deterministic group
 * combat resolver. Binding its 60 Hz frames to elapsed shared world time is
 * a separate, explicit live-combat integration step; don't claim otherwise.
 */
export function advanceSpatialDungeonPartyStep(
  party:readonly AdventurerState[],world:Level7World,
  campaignSeed:number,day:number,occupiedHeroIds?:ReadonlySet<string>,
  liveOptions:Pick<SpatialDungeonAdvanceOptions,"deferCombat"|"blockedCombatSites"|
    "returnToEntrance"|"deferReturn"|"routeToKnownTarget">={},
):Level7PartyTick {
  return simulateSpatialDungeonPartyDay(party,world,campaignSeed,day,
    occupiedHeroIds,{maxSteps:1,maxEncounters:1,...liveOptions});
}


/** Commit a finished LIVE battle to the SAME spatial world and hero resource
 * ledger. The site has been reserved, not resolved, since the arrival step.
 * Only a genuine hero victory retires a monster generation and pays rewards.
 * This function never invokes combat AI, RNG or a viewer.
 */
export function settleSpatialDungeonCombat(
  party:readonly AdventurerState[],world:Level7World,day:number,
  encounter:PreparedSpatialEncounter,combat:GroupCombatState,
  recording:GroupCombatReplay,arrivals:readonly Level7Replay[],
):Level7PartyTick {
  if(party.length<1||party.length>3||party.length!==arrivals.length||
    combat.outcome==="fighting"||recording.outcome!==combat.outcome)
    throw new RangeError("LIVE battle is not ready for settlement.");
  const ids=new Set(party.map(hero=>hero.id));
  if(ids.size!==party.length||party.some((hero,i)=>
    hero.floor!==encounter.floor||hero.health<=0||
    arrivals[i].heroId!==hero.id||arrivals[i].floor!==encounter.floor))
    throw new RangeError("LIVE party changed while fighting.");
  const roster=new Map(combat.actors.map(actor=>[actor.id,actor]));
  if(encounter.options.actors.filter(actor=>actor.team==="monsters").length!==1||
    !roster.has(encounter.featureId)||party.some(hero=>!roster.has(hero.id)))
    throw new RangeError("LIVE combat has invalid fighters.");
  const winner=combat.outcome==="heroes";
  const settled=world.siteCycles?.find(site=>site.id===encounter.featureId);
  if(world.resolvedFeatureIds.includes(encounter.featureId)||
    (settled&&settled.cycle!==encounter.siteCycle))
    throw new RangeError("LIVE monster generation was already settled.");
  const shares=new Map<string,number>();
  const alive=party.map(hero=>({hero,actor:roster.get(hero.id)!}))
    .filter(pair=>pair.actor.hp>0).sort((a,b)=>
      a.hero.id.localeCompare(b.hero.id));
  const pot=winner?(encounter.elite?6:2):0;
  alive.forEach(({hero},i)=>{
    shares.set(hero.id,Math.floor(pot/alive.length)+
      (i<pot%alive.length?1:0));
  });
  const survivors=world.heroes.filter(progress=>!ids.has(progress.heroId));
  const noSafeContinuation=alive.some(({hero,actor})=>
    actor.hp/hero.stats.maxHealth<0.35&&actor.healCharges===0);
  const retreats=!winner||alive.length!==party.length||noSafeContinuation;
  const result:Omit<Level7Tick,"world">[]=party.map((hero,index)=>{
    const actor=roster.get(hero.id)!;
    const hp=Math.max(0,Math.round(actor.hp));
    const dead=hp===0;
    const used=Math.min(2,hero.inventory.healing)-actor.healCharges;
    if(used<0||used>hero.inventory.healing)
      throw new RangeError("LIVE combat invented a Healing Herb.");
    const personalOutcome:Level7Outcome=dead?"death":retreats?"retreat":"exploring";
    // LIVE campaigns never jump to a shop floor on battle termination.
    // The one shared world motor must physically backtrack first.
    const returning=false;
    const xp=hero.xp+(winner&&!dead?(encounter.elite?28:12):0);
    const gold=shares.get(hero.id)??0;
    const adventurer:AdventurerState={
      ...hero,health:hp,xp,level:1+Math.floor(xp/100),
      gold:hero.gold+gold,
      floor:returning?4:hero.floor,
      status:dead?"dead":returning?"traveling":hero.status,
      inventory:{...hero.inventory,healing:hero.inventory.healing-used},
    };
    const oldProgress=world.heroes.find(p=>p.heroId===hero.id);
    if(!dead&&!returning&&oldProgress)survivors.push(oldProgress);
    const arrival=arrivals[index];
    const t=arrival.steps[arrival.steps.length-1]?.t??1.1;
    const tail:Level7ReplayStep[]=[{
      x:encounter.x,z:encounter.z,t:t+0.1,
      action:dead?"death":winner?"defeat-monster":"retreat",
      hp,featureId:encounter.featureId,
    }];
    if(!dead&&winner&&retreats)tail.push({
      x:encounter.x,z:encounter.z,t:t+0.2,action:"retreat",hp,
    });
    return {
      adventurer,
      replay:{...arrival,steps:[...arrival.steps,...tail],
        encounters:[{featureId:encounter.featureId,x:encounter.x,z:encounter.z,
          siteCycle:encounter.siteCycle,combat:recording}],
        outcome:personalOutcome},
      gainedGold:gold,gainedLoot:0,
      defeatedMonsters:winner&&!dead&&alive[0]?.hero.id===hero.id?1:0,
    };
  });
  const nextWorld:Level7World={
    ...world,heroes:survivors,
    ...(winner?{
      resolvedFeatureIds:[...world.resolvedFeatureIds,encounter.featureId],
      siteCycles:resolveDungeonSite(world.siteCycles??[],
        encounter.featureId,day),
    }:{}),
  };
  return {world:nextWorld,ticks:result.map(tick=>({...tick,world:nextWorld}))};
}
