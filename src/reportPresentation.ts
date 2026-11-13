import type {WorldEvent} from "./game/gameState.ts";
import type {InterfaceIcon} from "./uiIcons.ts";
export type ReportCategory="shop"|"dungeon"|"other";
const SHOP_TYPES=new Set<WorldEvent["type"]>([
  "sale","tip","shop-arrival","shop-stay","shop-departure",
  "shop-walkout","shop-credit","food-shortage","rescue"
]);
const DUNGEON_TYPES=new Set<WorldEvent["type"]>([
  "dungeon-outcome","level6-departure","level6-combat","level6-return",
  "level7-departure","level7-exploration","found-food",
  "ate","healed","starvation"
]);
export function reportCategory(event:Pick<WorldEvent,"type">):ReportCategory{
  if(SHOP_TYPES.has(event.type))return "shop";
  if(DUNGEON_TYPES.has(event.type))return "dungeon";
  return "other";
}
export function reportIcon(event:Pick<WorldEvent,"type">):InterfaceIcon{
  if(event.type==="sale")return "receipt";
  if(event.type==="shop-credit")return "receipt";
  if(event.type==="starvation"||event.type==="food-shortage")return "warning";
  if(event.type==="healed")return "heart";
  if(event.type==="found-food"||event.type==="ate")return "food";
  if(reportCategory(event)==="dungeon")return "swords";
  if(reportCategory(event)==="shop")return "shop";
  return "calendar";
}
export function reportCounts(events:readonly Pick<WorldEvent,"type">[]){
  const categories={shop:0,dungeon:0,other:0};
  for(const event of events)categories[reportCategory(event)]++;
  return {total:events.length,...categories};
}
