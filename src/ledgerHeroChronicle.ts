import type {GameState,WorldEvent} from "./game/gameState.ts";
import type {AdventurerState} from "./game/adventurers.ts";
import type {ItemId} from "./game/economy.ts";
import {heroDisplayNames,heroPortraitIndex} from "./game/heroIdentity.ts";

/** Publicly known activity, not a projection of the hidden dungeon outcome.
 * The merchant can account for shop purchases, entrances and departures,
 * but must watch a sealed replay before learning who survived and what loot
 * they won. In particular, NEVER derive a ledger badge from after.status,
 * after.health, after.gold (other than posted receipts), or after.inventory.
 */
export type LedgerHeroKind=
  "sealed"|"descended"|"arrived"|"departed"|"stayed"|
  "walkout"|"shop"|"newcomer"|"traded"|"fallen";
export interface LedgerHeroLine {
  readonly id:string;
  readonly name:string;
  readonly role:AdventurerState["role"];
  readonly level:number;
  readonly portrait:number;
  readonly kind:LedgerHeroKind;
  readonly label:string;
  readonly explanation:string;
  readonly paidGold:number;
  readonly soldUnits:number;
  readonly goods:readonly {readonly id:ItemId;readonly quantity:number}[];
  readonly creditGold:number;
}
export interface LedgerHeroChronicle {
  readonly lines:readonly LedgerHeroLine[];
  readonly remembered:readonly LedgerHeroLine[];
  readonly rememberedTotal:number;
  readonly knownShopVisitors:number;
  readonly payingHeroes:number;
  readonly sealedRecords:number;
  readonly arrivals:number;
  readonly departures:number;
}
export type LedgerSalesEvent=Pick<WorldEvent,"adventurerId"|"itemId"|"quantity"|"revenue">;

const KNOWN_MOVEMENT=new Set<WorldEvent["type"]>([
  "shop-arrival","shop-stay","shop-departure","shop-walkout",
  "influx","level6-departure","level7-departure",
]);
const statusFor=(types:ReadonlySet<WorldEvent["type"]>,
  visited:boolean,hasTrade:boolean,hasSealed:boolean):{
    kind:LedgerHeroKind;label:string;explanation:string;
  }=>{
  if(hasSealed)return {kind:"sealed",label:"RECORD SEALED",
    explanation:"Expedition outcome withheld until the recording is watched"};
  if(types.has("level7-departure"))return {kind:"descended",label:"TO FLOOR 7",
    explanation:"Entry recorded; expedition outcome not yet observed"};
  if(types.has("level6-departure"))return {kind:"descended",label:"TO FLOOR 6",
    explanation:"Entry recorded; expedition outcome not yet observed"};
  if(types.has("shop-departure"))return {kind:"departed",label:"LEFT THE SHOP",
    explanation:"Last confirmed movement: left Galvik's shop"};
  if(types.has("shop-walkout"))return {kind:"walkout",label:"WALKED OUT",
    explanation:"Left without making a purchase"};
  if(types.has("shop-arrival"))return {kind:"arrived",label:"ARRIVED AT SHOP",
    explanation:"Arrival registered at the fifth floor"};
  if(types.has("shop-stay"))return {kind:"stayed",label:"STAYING",
    explanation:"Stayed in the shop at the day boundary"};
  if(types.has("influx"))return {kind:"newcomer",label:"NEW ADVENTURER",
    explanation:"Newcomer joined the expedition roster"};
  if(visited)return {kind:"shop",label:"AT CLOSING",
    explanation:"Seen in the shop before the merchant went to bed"};
  return {kind:"traded",label:"CUSTOMER",explanation:hasTrade?
    "Purchase or credit recorded at the shop":"Account entry"};
};

export function buildLedgerHeroChronicle(
  before:GameState,after:GameState,
  sales:readonly LedgerSalesEvent[],credits:readonly WorldEvent[],
  newlyBooked:readonly WorldEvent[],
):LedgerHeroChronicle{
  const oldById=new Map(before.adventurers.map(hero=>[hero.id,hero]));
  const afterById=new Map(after.adventurers.map(hero=>[hero.id,hero]));
  const displayNames=heroDisplayNames(after.adventurers);
  const events=[...before.events.filter(e=>e.day===before.day&&
    KNOWN_MOVEMENT.has(e.type)),...newlyBooked.filter(e=>KNOWN_MOVEMENT.has(e.type))];
  const movements=new Map<string,Set<WorldEvent["type"]>>();
  for(const event of events){
    if(!event.adventurerId)continue;
    const set=movements.get(event.adventurerId)??new Set<WorldEvent["type"]>();
    set.add(event.type);
    movements.set(event.adventurerId,set);
  }
  const hiddenRecordIds=new Set(newlyBooked.filter(e=>
    (e.type==="level6-combat"&&!!e.combatReplay)||
    (e.type==="level7-exploration"&&!!e.level7Replay))
    .map(e=>e.adventurerId).filter((id):id is string=>!!id));
  const purchases=new Map<string,{paidGold:number;units:number;goods:Map<ItemId,number>}>();
  for(const sale of sales){
    if(!sale.adventurerId||!sale.itemId||
       typeof sale.quantity!=="number"||!Number.isSafeInteger(sale.quantity)||
       sale.quantity<0||typeof sale.revenue!=="number"||
       !Number.isSafeInteger(sale.revenue)||sale.revenue<0)continue;
    const purchase=purchases.get(sale.adventurerId)??
      {paidGold:0,units:0,goods:new Map<ItemId,number>()};
    purchase.paidGold+=sale.revenue;
    purchase.units+=sale.quantity;
    purchase.goods.set(sale.itemId as ItemId,
      (purchase.goods.get(sale.itemId as ItemId)??0)+sale.quantity);
    purchases.set(sale.adventurerId,purchase);
  }
  const debts=new Map<string,number>();
  for(const credit of credits){
    if(!credit.adventurerId)continue;
    debts.set(credit.adventurerId,
      (debts.get(credit.adventurerId)??0)+(credit.debtGold??0));
  }
  const visited=new Set(before.adventurers.filter(h=>h.status==="at-shop").map(h=>h.id));
  const people=new Set([...visited,...movements.keys(),
    ...hiddenRecordIds,...purchases.keys(),...debts.keys()]);
  const lineFor=(hero:AdventurerState,kind:LedgerHeroKind,
    label:string,explanation:string):LedgerHeroLine=>{
    const bought=purchases.get(hero.id);
    return {
      id:hero.id,name:displayNames.get(hero.id)??hero.name,
      role:hero.role,level:hero.level,portrait:heroPortraitIndex(hero.id),
      kind,label,explanation,
      paidGold:bought?.paidGold??0,soldUnits:bought?.units??0,
      goods:[...(bought?.goods??new Map<ItemId,number>()).entries()]
        .map(([id,quantity])=>({id,quantity})),
      creditGold:debts.get(hero.id)??0,
    };
  };
  const rows=[...people].flatMap(id=>{
    // People already marked dead before tonight belong only in the memorial,
    // even if a historical arrival event shares the closing day.
    if(oldById.get(id)?.status==="dead")return [];
    // Newly generated heroes have no previous state, but their appearance
    // and level at creation are known from the influx event.
    const hero=oldById.get(id)??afterById.get(id);
    if(!hero)return [];
    const status=statusFor(movements.get(id)??new Set(),visited.has(id),
      purchases.has(id)||debts.has(id),hiddenRecordIds.has(id));
    return [lineFor(hero,status.kind,status.label,status.explanation)];
  });
  const importance:Record<LedgerHeroKind,number>={
    sealed:0,descended:1,departed:2,walkout:3,arrived:4,
    stayed:5,shop:6,traded:7,newcomer:8,fallen:9,
  };
  rows.sort((a,b)=>importance[a.kind]-importance[b.kind]||
    b.paidGold-a.paidGold||a.id.localeCompare(b.id,undefined,{numeric:true}));
  // The skull means KNOWN lost before tonight, never a newly revealed
  // death that would spoil sealed combat. These are memorials, not results.
  const fallen=before.adventurers.filter(h=>h.status==="dead")
    .sort((a,b)=>b.id.localeCompare(a.id,undefined,{numeric:true}));
  const remembered=fallen.slice(0,3).map(hero=>lineFor(hero,"fallen",
    "PREVIOUSLY FALLEN","Loss recorded before this night"));
  return {
    lines:rows,remembered,rememberedTotal:fallen.length,
    knownShopVisitors:visited.size,payingHeroes:purchases.size,
    sealedRecords:hiddenRecordIds.size,
    arrivals:newlyBooked.filter(e=>e.type==="shop-arrival").length,
    departures:newlyBooked.filter(e=>e.type==="shop-departure").length,
  };
}
