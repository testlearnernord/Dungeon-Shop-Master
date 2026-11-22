import {ITEMS,type ItemId} from "./economy.ts";
import type {LiveFloorHero} from "./liveFloorSpectator.ts";

/** A small, read-only source of options for the real LIVE floor inspector.
 * No world-clock state, hidden AI decisions, inventory mutation or rerolls. */
export function floorHeroLocatorOptions(
  heroes:readonly Pick<LiveFloorHero,"id"|"name"|"level"|"role"|"inCombat">[],
):readonly {id:string;label:string}[] {
  return [...heroes].sort((a,b)=>a.name.localeCompare(b.name)||
    a.id.localeCompare(b.id)).map(hero=>({
      id:hero.id,
      label:hero.name+" · Lv "+hero.level+" "+hero.role+
        (hero.inCombat?" · IN COMBAT":""),
    }));
}

/** One label per actually running encounter, derived only from the saved
 * combat roster. Never conjures enemies or predicts encounter outcomes. */
export function floorFightLocatorOptions(
  fights:readonly {id:string;x:number;z:number;
    heroIds:readonly string[];actors:readonly {team:string}[]}[],
):readonly {id:string;label:string;x:number;z:number}[] {
  return [...fights].sort((a,b)=>a.z-b.z||a.x-b.x||
    a.id.localeCompare(b.id)).map((fight,index)=>{
    const ghouls=fight.actors.filter(actor=>actor.team==="monsters").length;
    const heroes=fight.heroIds.length;
    return {id:fight.id,x:fight.x,z:fight.z,
      label:"Engagement "+(index+1)+" · "+ghouls+
        (ghouls===1?" Ghoul":" Ghouls")+" / "+heroes+
        (heroes===1?" hero":" heroes")+" · ("+fight.x+", "+fight.z+")"};
  });
}

/** Show only physically owned goods from the actual saved adventurer inventory.
 * No abstract haul token is projected as an item. */
export function formatHeroDungeonFinds(
  finds:Readonly<Partial<Record<ItemId,number>>>|undefined,
):string {
  const goods=ITEMS.flatMap(item=>{
    const count=finds?.[item.id]??0;
    return count>0?[item.name+" ×"+count]:[];
  });
  return goods.length?goods.join(" · "):"None carried";
}
