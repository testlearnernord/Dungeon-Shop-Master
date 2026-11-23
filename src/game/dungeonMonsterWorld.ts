import {dungeonNeighbors,dungeonShortestPath,tileAt,
  type DungeonLayout,type DungeonPoint} from "./dungeonLayout.ts";
import {dungeonSiteGeneration,refreshDungeonSites} from "./dungeonRegeneration.ts";
import {SeededRandom} from "./random.ts";
import type {SpatialDungeonWorld} from "./spatialDungeonExploration.ts";

/** A pack occupies ONE persisted world tile; its individual fighters are
 * created only when the existing GroupCombat encounter is reserved. */
export type DungeonMonsterMode =
  "IDLE"|"ROAMING"|"ALERT"|"CHASING"|"SEARCHING"|"RETURNING"|"ENGAGED";
export interface DungeonMonsterState extends DungeonPoint {
  readonly id:string;
  readonly siteCycle:number;
  readonly homeX:number;
  readonly homeZ:number;
  readonly mode:DungeonMonsterMode;
  readonly lastMoveTick:number;
  readonly nextDecisionTick:number;
  readonly target?:DungeonPoint;
}

/** Game rules, not renderer delays. A hero moves every 200 world ticks. */
export const MONSTER_STEP_TICKS=400;
export const MONSTER_ROAM_CHANCE=0.12;
export const MONSTER_ROAM_MIN_DISTANCE=3;
export const MONSTER_ROAM_MAX_DISTANCE=6;

const key=(p:DungeonPoint)=>p.x+":"+p.z;
const same=(a:DungeonPoint,b:DungeonPoint)=>a.x===b.x&&a.z===b.z;
const hash=(value:string):number=>{
  let h=2166136261;
  for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);
  return h>>>0;
};
const roll=(layout:DungeonLayout,id:string,cycle:number,tick:number)=>
  new SeededRandom((layout.seed^hash(id)^
    Math.imul(cycle+1,0x9e3779b1)^Math.imul(tick+1,0x85ebca6b))>>>0);

/** Bounded BFS. Destinations are real connected cells, not Euclidean wishes. */
function roamDestinations(layout:DungeonLayout,from:DungeonPoint):DungeonPoint[]{
  const queue:[DungeonPoint,number][]=[[from,0]];
  const seen=new Set([key(from)]);
  const possible:DungeonPoint[]=[];
  for(let i=0;i<queue.length;i++){
    const [at,dist]=queue[i];
    if(dist>=MONSTER_ROAM_MIN_DISTANCE)possible.push(at);
    if(dist===MONSTER_ROAM_MAX_DISTANCE)continue;
    for(const next of dungeonNeighbors(layout,at)){
      if(seen.has(key(next)))continue;
      seen.add(key(next));queue.push([next,dist+1]);
    }
  }
  return possible;
}

function beginIdle(monster:DungeonMonsterState,tick:number,rng:SeededRandom):DungeonMonsterState{
  const {target:_priorTarget,...rest}=monster;
  return {...rest,mode:"IDLE",
    nextDecisionTick:tick+MONSTER_STEP_TICKS*(2+rng.int(7))};
}

function advanceOne(
  monster:DungeonMonsterState,layout:DungeonLayout,tick:number,
  occupied:ReadonlySet<string>,
):DungeonMonsterState {
  if(monster.mode==="ENGAGED"||monster.mode!=="IDLE"&&monster.mode!=="ROAMING")
    return monster;
  if(monster.mode==="IDLE"&&tick>=monster.nextDecisionTick){
    const rng=roll(layout,monster.id,monster.siteCycle,tick);
    const sites=rng.next()<MONSTER_ROAM_CHANCE
      ?roamDestinations(layout,monster):[];
    if(!sites.length)return {...monster,
      nextDecisionTick:tick+MONSTER_STEP_TICKS*(1+rng.int(5))};
    monster={...monster,mode:"ROAMING",
      target:sites[rng.int(sites.length)]};
  }
  if(monster.mode!=="ROAMING"||!monster.target||
     tick-monster.lastMoveTick<MONSTER_STEP_TICKS)return monster;
  const rng=roll(layout,monster.id,monster.siteCycle,tick);
  if(same(monster,monster.target))return beginIdle(monster,tick,rng);
  const path=dungeonShortestPath(layout,monster,monster.target);
  const next=path[1];
  if(!next||occupied.has(key(next)))return monster;
  const moved={...monster,x:next.x,z:next.z,lastMoveTick:tick};
  return same(moved,monster.target)
    ?beginIdle(moved,tick,rng):moved;
}

/** Reconcile renewable site generations and take ONE clock-owned world step.
 * No animation frame, observer state or mutable campaign RNG is consulted.
 * The caller supplies only genuinely present heroes and combat reservations. */
export function advanceDungeonMonsterWorld(
  world:SpatialDungeonWorld,layout:DungeonLayout,day:number,tick:number,
  occupiedHeroes:readonly DungeonPoint[]=[],
  reservedSiteIds:ReadonlySet<string>=new Set(),
):SpatialDungeonWorld {
  if(layout.floor<1||layout.floor>9)return world;
  const refreshed=refreshDungeonSites(world,layout,day);
  const resolved=new Set(refreshed.resolvedFeatureIds);
  const previous=new Map((world.monsters??[]).map(monster=>[monster.id,monster]));
  const active=layout.features.filter(feature=>
    feature.kind==="monster"&&!resolved.has(feature.id));
  const activeWithCycle=active.map(feature=>({
    feature,siteCycle:dungeonSiteGeneration(refreshed.siteCycles,feature.id),
  }));
  const preserved=activeWithCycle.flatMap(({feature,siteCycle})=>{
    const saved=previous.get(feature.id);
    return saved&&saved.siteCycle===siteCycle?[saved]:[];
  });
  // Reserve ALL still-living positions before advancing any pack. Without
  // this first pass, an early pack can step onto a later pack's tile, or
  // a regenerated site can respawn on top of an unrelated roaming Ghoul.
  const packOccupied=new Set(preserved.map(key));
  const heroOccupied=new Set(occupiedHeroes.map(key));
  const monsters:DungeonMonsterState[]=[];
  for(const {feature,siteCycle} of activeWithCycle){
    const saved=previous.get(feature.id);
    let base:DungeonMonsterState;
    if(saved&&saved.siteCycle===siteCycle){
      base=saved;
      packOccupied.delete(key(saved));
    }else{
      // A just-regenerated pack must find the nearest actually free tile.
      // Connected BFS keeps tie-breaking stable; home remains immutable.
      const queue:DungeonPoint[]=[feature];
      const searched=new Set([key(feature)]);
      let spawn:DungeonPoint|undefined;
      for(let i=0;i<queue.length;i++){
        const p=queue[i];
        if(!packOccupied.has(key(p))&&!heroOccupied.has(key(p))){
          spawn=p;break;
        }
        for(const next of dungeonNeighbors(layout,p)){
          if(searched.has(key(next)))continue;
          searched.add(key(next));queue.push(next);
        }
      }
      if(!spawn)throw new RangeError("No free dungeon tile for renewed monster");
      base={
        id:feature.id,siteCycle,x:spawn.x,z:spawn.z,
        homeX:feature.x,homeZ:feature.z,mode:"IDLE",
        lastMoveTick:tick,
        nextDecisionTick:tick+MONSTER_STEP_TICKS*(2+
          roll(layout,feature.id,siteCycle,tick).int(7)),
      };
    }
    const engaged=reservedSiteIds.has(feature.id);
    const candidate:DungeonMonsterState=engaged
      ?(()=>{const {target:_prior,...rest}=base;
          return {...rest,mode:"ENGAGED" as const};})()
      :base.mode==="ENGAGED"
        ?beginIdle(base,tick,roll(layout,base.id,siteCycle,tick))
        :base;
    // A roaming pack cannot enter any other pack's current or newly
    // committed tile, nor walk onto a hero as part of random wandering.
    const occupied=new Set([...packOccupied,...heroOccupied]);
    const moved=engaged?candidate:advanceOne(candidate,layout,tick,occupied);
    if(tileAt(layout,moved.x,moved.z)==="wall"||packOccupied.has(key(moved)))
      throw new RangeError("Monster crossed blocked dungeon geometry or actor");
    monsters.push(moved);
    packOccupied.add(key(moved));
  }
  return {...world,...refreshed,monsters};
}
