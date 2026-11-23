import {tileAt,type DungeonLayout,type DungeonPoint} from "./dungeonLayout.ts";
import type {LiveFloorHero,LiveFloorSpectatorFrame} from "./liveFloorSpectator.ts";

/** Visual perception range in *tiles*. A wall is visible, what is behind it is not. */
export const HERO_SIGHT_RADIUS=5;

export interface HeroFloorPerception {
  readonly heroId:string;
  /** Current line of sight, including the first blocking walls. */
  readonly visible:ReadonlySet<number>;
  /** Memory from this hero's own committed travel path, never other heroes'. */
  readonly explored:ReadonlySet<number>;
  /** Other saved actors with an unobstructed line of sight right now. */
  readonly visibleHeroIds:readonly string[];
  /** Unresolved authored monsters currently in line of sight. */
  readonly visibleMonsterIds:readonly string[];
  /** Contacts independently seen by the observer or a co-located party member. */
  readonly partyVisibleHeroIds:readonly string[];
}

const at=(layout:DungeonLayout,p:DungeonPoint)=>p.z*layout.width+p.x;
const inBounds=(layout:DungeonLayout,p:DungeonPoint)=>
  p.x>=0&&p.z>=0&&p.x<layout.width&&p.z<layout.height;

/** Supercover-style grid ray with blocked corners. It is deterministic,
 * operates exclusively on the seeded fixed geometry and consumes no RNG.
 * No AI movement or combat takes place here. */
export function hasDungeonLineOfSight(
  layout:DungeonLayout,origin:DungeonPoint,target:DungeonPoint,
  radius=HERO_SIGHT_RADIUS,
):boolean {
  if(!inBounds(layout,origin)||!inBounds(layout,target)||
     tileAt(layout,origin.x,origin.z)==="wall")return false;
  const dx=target.x-origin.x,dz=target.z-origin.z;
  if(dx*dx+dz*dz>radius*radius)return false;
  const nx=Math.abs(dx),nz=Math.abs(dz);
  const sx=Math.sign(dx),sz=Math.sign(dz);
  let x=origin.x,z=origin.z,ix=0,iz=0;
  while(ix<nx||iz<nz){
    const lhs=(1+2*ix)*nz,rhs=(1+2*iz)*nx;
    if(lhs===rhs){
      // Two solid cardinal neighbours close a diagonal corner completely.
      if(tileAt(layout,x+sx,z)==="wall"&&
         tileAt(layout,x,z+sz)==="wall")return false;
      x+=sx;z+=sz;ix++;iz++;
    }else if(lhs<rhs){x+=sx;ix++;}
    else{z+=sz;iz++;}
    // The first solid surface is recognizable, but blocks all deeper cells.
    if(x===target.x&&z===target.z)return true;
    if(tileAt(layout,x,z)==="wall")return false;
  }
  return true;
}

export function dungeonCurrentSight(
  layout:DungeonLayout,origin:DungeonPoint,radius=HERO_SIGHT_RADIUS,
):ReadonlySet<number> {
  const visible=new Set<number>();
  const r=Math.ceil(radius);
  for(let z=Math.max(0,origin.z-r);z<Math.min(layout.height,origin.z+r+1);z++){
    for(let x=Math.max(0,origin.x-r);x<Math.min(layout.width,origin.x+r+1);x++){
      if(hasDungeonLineOfSight(layout,origin,{x,z},radius))
        visible.add(z*layout.width+x);
    }
  }
  return visible;
}

/** A permanent-looking view derives strictly from the hero's actual saved
 * path. It never writes knowledge into GameState or unites another party's
 * visited tiles. The cached result is keyed by immutable save arrays. */
const discoveredByLayout=new WeakMap<DungeonLayout,WeakMap<readonly number[],ReadonlySet<number>>>();
export function dungeonExploredSight(
  layout:DungeonLayout,visited:readonly number[],
):ReadonlySet<number> {
  let byPath=discoveredByLayout.get(layout);
  if(!byPath){byPath=new WeakMap();discoveredByLayout.set(layout,byPath);}
  const cached=byPath.get(visited);
  if(cached)return cached;
  const explored=new Set<number>();
  for(const cell of visited){
    if(!Number.isInteger(cell)||cell<0||cell>=layout.tiles.length)continue;
    const point={x:cell%layout.width,z:Math.floor(cell/layout.width)};
    for(const visible of dungeonCurrentSight(layout,point))explored.add(visible);
  }
  byPath.set(visited,explored);
  return explored;
}

/** The all-knowing Dungeon Shop Master view is deliberately NOT passed in.
 * This per-hero projection identifies reciprocal contacts by true geometry.
 * It is a read-only contract for UI and future autonomous AI decisions,
 * never a command, shared hero memory, or passive Board disclosure. */
export function selectHeroFloorPerception(
  layout:DungeonLayout,frame:LiveFloorSpectatorFrame,heroId:string,
):HeroFloorPerception|null {
  const observer=frame.heroes.find(hero=>hero.id===heroId);
  if(!observer||layout.floor!==frame.floor)return null;
  const sight=dungeonCurrentSight(layout,observer);
  const explored=new Set(dungeonExploredSight(layout,observer.visited));
  for(const cell of sight)explored.add(cell);
  const sees=(other:LiveFloorHero)=>
    other.id!==observer.id&&sight.has(at(layout,other));
  const visibleHeroIds=frame.heroes.filter(sees).map(hero=>hero.id);
  const resolved=new Set(frame.resolved);
  const monsterPositions=frame.monsters??layout.features.filter(f=>
    f.kind==="monster").map(f=>({...f,mode:"IDLE" as const}));
  const visibleMonsterIds=monsterPositions.filter(monster=>
    monster.mode!=="ENGAGED"&&!resolved.has(monster.id)&&
    sight.has(at(layout,monster))).map(monster=>monster.id);
  const partyMembers=frame.heroes.filter(hero=>
    hero.id!==observer.id&&observer.partyMemberIds.includes(hero.id)&&
    hero.x===observer.x&&hero.z===observer.z);
  const partyContacts=new Set(visibleHeroIds);
  for(const member of partyMembers){
    const memberSight=dungeonCurrentSight(layout,member);
    for(const other of frame.heroes){
      if(other.id!==observer.id&&!observer.partyMemberIds.includes(other.id)&&
         memberSight.has(at(layout,other)))partyContacts.add(other.id);
    }
  }
  return {heroId,visible:sight,explored,
    visibleHeroIds,visibleMonsterIds,
    partyVisibleHeroIds:[...partyContacts].sort()};
}
