import type { AdventurerState } from "./adventurers.ts";
import {
  dungeonNeighbors, dungeonShortestPath, generateDungeonLayout, tileAt,
  type DungeonFeature, type DungeonLayout, type DungeonPoint,
} from "./dungeonLayout.ts";
import { resolveGroupCombat, type CombatantSpec, type GroupCombatReplay } from "./groupCombat.ts";
import { SeededRandom } from "./random.ts";

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
  /** Actual fixed-step combat output. Do not resimulate on playback. */
  readonly combat: GroupCombatReplay;
}
export interface Level7Replay {
  readonly version: 1;
  readonly day: number;
  readonly heroId: string;
  readonly floor: 7;
  readonly appearance: {
    readonly role: AdventurerState["role"];
    readonly equipment: AdventurerState["equipment"];
  };
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
  const frontier: DungeonPoint[] = [];
  for(const idx of known){
    const p={x:idx%layout.width,z:Math.floor(idx/layout.width)};
    if(dungeonNeighbors(layout,p).some(n=>!known.has(tileIndex(layout,n))))frontier.push(p);
  }
  let bestPath: DungeonPoint[] = [];
  for(const target of frontier.sort(byPoint)){
    const path = dungeonShortestPath(layout,current,target);
    if(!path.length || path.some(p=>!known.has(tileIndex(layout,p))))continue;
    if(!bestPath.length||path.length<bestPath.length)bestPath=path;
  }
  return bestPath.length>1?bestPath[1]:null;
}

function fightAgainst(
  hero: AdventurerState, monster: DungeonFeature, campaignSeed: number,
): {hp:number;outcome:"heroes"|"monsters"|"draw";combat:GroupCombatReplay} {
  const monsterRand=new SeededRandom(
    (campaignSeed^Math.imul(monster.x+37*monster.z,2654435761))>>>0);
  const sword=hero.equipment.weapon==="Iron Sword";
  const armored=hero.equipment.armor==="Leather Vest";
  const monsterHp=22+monsterRand.int(13);
  const specs:CombatantSpec[]=[
    {
      id:hero.id,team:"heroes",role:hero.role,
      style:hero.role==="healer"||hero.role==="DPS"&&!sword?"ranged":"melee",
      x:-2,z:0,hp:hero.health,maxHp:hero.stats.maxHealth,
      damage:6+Math.floor((hero.role==="healer"?hero.stats.intellect:
        hero.role==="DPS"?hero.stats.agility:hero.stats.strength)/2)+(sword?5:0),
      armor:armored?5:1,
      speed:hero.role==="tank"?2.5:3.1,
      reach:1.75,
      healCharges:hero.role==="healer"?Math.min(2,hero.inventory.healing):0,
    },
    {
      id:monster.id,team:"monsters",role:"monster",style:"melee",
      x:2,z:0,hp:monsterHp,maxHp:monsterHp,
      damage:8+monsterRand.int(4),armor:monster.subtype==="skeleton"?3:1,
      speed:2.6,reach:1.6,
    },
  ];
  const encounter=resolveGroupCombat({
    actors:specs,
    // Encounter coordinates are local to the room. The viewer will offset
    // them to the actual dungeon tile when replaying this encounter.
    bounds:{minX:-7,maxX:7,minZ:-6,maxZ:6},
  }, LEVEL7_COMBAT_SECONDS);
  const survivor=encounter.state.actors.find(a=>a.id===hero.id)!;
  return {
    hp:Math.max(0,Math.round(survivor.hp)),
    outcome:encounter.state.outcome==="fighting"?"draw":encounter.state.outcome,
    combat:encounter.replay,
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
 * Exactly one bounded, authoritative Level 7 run per confirmed day.
 * This function is pure: it returns new state, the event's replay and rewards;
 * it never writes to the shop or calls rendering APIs.
 */
export function simulateLevel7Day(
  hero: AdventurerState, world: Level7World, campaignSeed: number, day: number,
): Level7Tick {
  if(hero.status!=="expedition"||hero.floor!==7||hero.health<=0)
    throw new RangeError("Level 7 run requires a living F7 expedition hero");
  const layout=generateDungeonLayout(campaignSeed,7);
  const progress=getLevel7Progress(world,hero.id,layout);
  if(tileAt(layout,progress.x,progress.z)==="wall")
    throw new RangeError("Saved Level 7 hero position is not walkable");
  const resolved=new Set(world.resolvedFeatureIds);
  const visited=new Set(progress.visited);
  const orderedVisited=[...progress.visited];
  const steps:Level7ReplayStep[]=[
    {x:progress.x,z:progress.z,t:0,action:"enter",hp:hero.health},
  ];
  const encounters:Level7ReplayEncounter[]=[];
  let current={x:progress.x,z:progress.z};
  let hp=hero.health, xp=0, gold=0, loot=0, kills=0;
  let outcome:Level7Outcome="exploring";
  for(let t=1;t<=LEVEL7_STEP_BUDGET;t++){
    const next=chooseLevel7Step(layout,{
      heroId:hero.id,x:current.x,z:current.z,visited:orderedVisited,
    });
    if(!next){
      outcome="completed";
      steps.push({...current,t,action:"complete",hp});
      break;
    }
    // No teleporting through walls. Every actual movement occupies one edge.
    if(!dungeonNeighbors(layout,current).some(p=>p.x===next.x&&p.z===next.z))
      throw new Error("Level 7 navigation tried to cross a wall");
    current=next;
    const idx=tileIndex(layout,current);
    if(!visited.has(idx)){visited.add(idx);orderedVisited.push(idx);}
    steps.push({...current,t,action:"walk",hp});
    const feature=layout.features.find(f=>f.x===current.x&&f.z===current.z);
    if(!feature||resolved.has(feature.id))continue;
    if(feature.kind==="treasure"){
      const treasureRng=new SeededRandom((layout.seed^Math.imul(idx,1597334677))>>>0);
      const gain=7+treasureRng.int(9);
      gold+=gain;loot++;xp+=8;
      resolved.add(feature.id);
      steps.push({...current,t:t+0.1,action:"treasure",featureId:feature.id,hp});
    }else if(feature.kind==="trap"){
      const roll=new SeededRandom((layout.seed^Math.imul(idx,3266489917))>>>0);
      const damage=Math.max(1,5+roll.int(7)-(hero.equipment.armor==="Leather Vest"?3:0));
      hp=Math.max(0,hp-damage);
      resolved.add(feature.id);
      steps.push({...current,t:t+0.1,action:"trap",featureId:feature.id,hp});
      if(hp===0){outcome="death";steps.push({...current,t:t+0.2,action:"death",hp});break;}
    }else {
      const fight=fightAgainst({...hero,health:hp},feature,layout.seed);
      encounters.push({featureId:feature.id,...current,combat:fight.combat});
      hp=fight.hp;
      steps.push({...current,t:t+0.1,action:"combat",featureId:feature.id,hp});
      if(fight.outcome==="heroes"){
        resolved.add(feature.id);
        kills++;xp+=12;gold+=2;
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
  const returning=outcome==="retreat"||finished;
  const adventurer:AdventurerState={
    ...hero,health:hp,gold:hero.gold+gold,xp:xpTotal,
    level:1+Math.floor(xpTotal/100),
    floor:(returning?4:7),
    status:dead?"dead":returning?"traveling":"expedition",
    inventory:{...hero.inventory,loot:hero.inventory.loot+loot},
  };
  // Death leaves the world intact but removes that hero from active progress.
  const updated:Level7HeroProgress={
    heroId:hero.id,x:current.x,z:current.z,visited:orderedVisited,
  };
  const heroes=world.heroes.filter(x=>x.heroId!==hero.id);
  if(!dead&&!returning)heroes.push(updated);
  const replay:Level7Replay={
    version:1,day,heroId:hero.id,floor:7,
    appearance:{role:hero.role,equipment:{...hero.equipment}},
    steps,encounters,outcome,
  };
  return {
    adventurer,
    world:{resolvedFeatureIds:[...resolved],heroes},
    replay,gainedGold:gold,gainedLoot:loot,defeatedMonsters:kills,
  };
}
