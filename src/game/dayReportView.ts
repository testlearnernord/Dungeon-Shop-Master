import type {WorldEvent} from "./gameState.ts";

export type EventGroup="trade"|"visitors"|"expeditions"|"survival"|"other";
export const EVENT_GROUPS:readonly EventGroup[]=[
  "trade","visitors","expeditions","survival","other",
];
export function eventGroup(type:WorldEvent["type"]):EventGroup{
  if(["sale","tip","shop-credit"].includes(type))return "trade";
  if(["shop-arrival","shop-stay","shop-departure","shop-walkout","influx"].includes(type))
    return "visitors";
  if(type.startsWith("level6-")||type.startsWith("level7-")||type==="dungeon-outcome")
    return "expeditions";
  if(["ate","healed","starvation","rescue","food-shortage","found-food"].includes(type))
    return "survival";
  return "other";
}
export function groupedDayEvents(events:readonly WorldEvent[]){
  return EVENT_GROUPS.map(group=>({
    group,events:events.filter(event=>eventGroup(event.type)===group),
  })).filter(section=>section.events.length>0);
}
export function dayReportMetrics(events:readonly WorldEvent[]){
  return {
    revenue:events.filter(e=>e.type==="sale").reduce((sum,e)=>sum+(e.revenue??0),0),
    units:events.filter(e=>e.type==="sale").reduce((sum,e)=>sum+(e.quantity??0),0),
    arrivals:events.filter(e=>e.type==="shop-arrival").length,
    expeditionEvents:events.filter(e=>eventGroup(e.type)==="expeditions").length,
    loans:events.filter(e=>e.type==="shop-credit").reduce((sum,e)=>sum+(e.debtGold??0),0),
  };
}
