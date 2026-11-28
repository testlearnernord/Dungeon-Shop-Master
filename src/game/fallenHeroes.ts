import type {AdventurerState} from "./adventurers.ts";
import type {SpatialDungeonPartyTick,SpatialDungeonFloor} from "./spatialDungeonExploration.ts";
import type {SurveyorPlan} from "./dungeonDiscovery.ts";
import {MATERIAL_ITEMS} from "./economy.ts";

export interface FallenHero {
  readonly heroId:string;
  readonly floor:SpatialDungeonFloor;
  readonly x:number;
  readonly z:number;
  readonly day:number;
}

/** Death settlement, not a render event or a retained replay lookup.
 * The last real death step locates the remains even after tape expiry. */
export function recordFallenHeroes(
  existing:readonly FallenHero[],result:SpatialDungeonPartyTick,day:number,
):readonly FallenHero[]{
  let next=existing;
  for(const entry of result.ticks){
    if(entry.adventurer.status!=="dead"||entry.adventurer.health!==0||
      existing.some(f=>f.heroId===entry.adventurer.id))continue;
    const death=[...entry.replay.steps].reverse().find(s=>s.action==="death"&&s.hp===0);
    if(!death||entry.replay.floor>9)continue;
    next=[...next,{heroId:entry.adventurer.id,floor:entry.replay.floor,
      x:death.x,z:death.z,day}];
  }
  return next;
}

/** The dead roster remains the sole owner of unclaimed possessions.
 * Recover only from the actual occupied tile, never copy or roll new loot.
 * First slice transfers gold, forge materials and the unique discovery.
 * Equipment and supplies remain with the body for future recovery rules. */
export function recoverFallenAt(
  fallen:readonly FallenHero[],roster:ReadonlyMap<string,AdventurerState>,
  hero:AdventurerState,point:{x:number;z:number},plan:SurveyorPlan|null,
):{hero:AdventurerState;plan:SurveyorPlan|null;deceased:readonly AdventurerState[]}{
  const deceased:AdventurerState[]=[];
  if(hero.status!=="exploring"||hero.health<=0||typeof hero.floor!=="number")
    return {hero,plan,deceased};
  for(const body of fallen.filter(f=>f.floor===hero.floor&&f.x===point.x&&f.z===point.z)
    .sort((a,b)=>a.heroId.localeCompare(b.heroId))){
    const dead=roster.get(body.heroId);
    if(!dead||dead.status!=="dead"||dead.health!==0)continue;
    const gold=Math.min(dead.gold,Number.MAX_SAFE_INTEGER-hero.gold);
    const finds={...hero.inventory.finds},remaining={...dead.inventory.finds};
    let capacity=1000-Object.values(finds).reduce((sum,n)=>sum+(n??0),0);
    let changed=gold>0;
    for(const item of MATERIAL_ITEMS){
      const count=Math.max(0,Math.min(capacity,remaining[item.id]??0));
      if(!count)continue;
      finds[item.id]=(finds[item.id]??0)+count;
      capacity-=count;
      const left=(remaining[item.id]??0)-count;
      if(left)remaining[item.id]=left;else delete remaining[item.id];
      changed=true;
    }
    if(plan?.status==="carried"&&plan.heroId===dead.id)
      plan={...plan,heroId:hero.id};
    if(!changed)continue;
    hero={...hero,gold:hero.gold+gold,inventory:{...hero.inventory,finds}};
    deceased.push({...dead,gold:dead.gold-gold,inventory:{...dead.inventory,finds:remaining}});
  }
  return {hero,plan,deceased};
}
