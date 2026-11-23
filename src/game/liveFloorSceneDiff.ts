import type {LiveFloorFight,LiveFloorHero,LiveFloorSpectatorFrame}
  from "./liveFloorSpectator.ts";

/** Only properties that actually affect the Babylon floor geometry, the
 * selected hero's fog of war, the minimap and the two-step route hints.
 * Combat HP/frames, world time, gold and inventory are intentionally absent:
 * the inspector and arena consume those values separately. */
type FloorMapHero=Pick<LiveFloorHero,
  "id"|"x"|"z"|"role"|"equipment"|"partyId"|"partyMemberIds"|
  "inCombat"|"visited"|"activity"|"plannedAction"|"goal">;
type FloorMapFight=Pick<LiveFloorFight,"id"|"x"|"z">;
export type FloorMapSnapshot={
  readonly floor:LiveFloorSpectatorFrame["floor"];
  readonly heroes:readonly FloorMapHero[];
  readonly fights:readonly FloorMapFight[];
  readonly monsters?:LiveFloorSpectatorFrame["monsters"];
  readonly resolved:readonly string[];
};

function sameList<T>(a:readonly T[],b:readonly T[]):boolean{
  return a===b||(a.length===b.length&&a.every((item,i)=>item===b[i]));
}

/** True means `showLiveFloor` may update only the saved per-hero HP metadata
 * and leave all floor meshes, lights, arrows and map canvas untouched.
 * Input order matters because floor models and hero selection are ordered.
 * This is a read-only projection comparator, NEVER a gameplay clock gate. */
export function sameLiveFloorMap(a:FloorMapSnapshot,b:FloorMapSnapshot):boolean{
  if(a===b)return true;
  if(a.floor!==b.floor||!sameList(a.resolved,b.resolved)||
     a.heroes.length!==b.heroes.length||a.fights.length!==b.fights.length)
    return false;
  for(let i=0;i<a.heroes.length;i++){
    const x=a.heroes[i],y=b.heroes[i];
    if(x.id!==y.id||x.x!==y.x||x.z!==y.z||
       x.role!==y.role||x.equipment.weapon!==y.equipment.weapon||
       x.equipment.armor!==y.equipment.armor||
       x.partyId!==y.partyId||!sameList(x.partyMemberIds,y.partyMemberIds)||
       x.inCombat!==y.inCombat||x.activity!==y.activity||
       x.goal!==y.goal||x.plannedAction!==y.plannedAction||
       !sameList(x.visited,y.visited))
      return false;
  }
  const oldMonsters=a.monsters??[],newMonsters=b.monsters??[];
  if(oldMonsters.length!==newMonsters.length)return false;
  for(let i=0;i<oldMonsters.length;i++){
    const x=oldMonsters[i],y=newMonsters[i];
    if(x.id!==y.id||x.x!==y.x||x.z!==y.z||x.mode!==y.mode||
       x.target?.x!==y.target?.x||x.target?.z!==y.target?.z)return false;
  }
  for(let i=0;i<a.fights.length;i++){
    const x=a.fights[i],y=b.fights[i];
    if(x.id!==y.id||x.x!==y.x||x.z!==y.z)return false;
  }
  return true;
}
