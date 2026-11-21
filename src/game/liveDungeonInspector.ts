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

/** The abstract `inventory.loot` counter is not a physical item.
 * Show only goods that a real saved adventurer currently owns. */
export function formatHeroDungeonFinds(
  finds:Readonly<Partial<Record<ItemId,number>>>|undefined,
):string {
  const goods=ITEMS.flatMap(item=>{
    const count=finds?.[item.id]??0;
    return count>0?[item.name+" ×"+count]:[];
  });
  return goods.length?goods.join(" · "):"None carried";
}
