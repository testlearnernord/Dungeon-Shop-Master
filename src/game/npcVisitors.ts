export type VisitorStatus = "exploring" | "traveling" | "at-shop" | "returning" | "expedition" | "departing" | "off-duty" | "dead";
export type VisitorRole = "tank" | "DPS" | "healer";
import type {ShopPortalGate} from "./shopPortal.ts";
/** One physical doorway. Never encode dungeon floor numbers in NPC routes. */
export type GateSide=ShopPortalGate;

export interface VisitorSnapshot {
  readonly id: string;
  readonly name: string;
  /** Unique, UI-only name derived from full persistent history. */
  readonly displayName?: string;
  readonly level?: number;
  /** UI-only vitals for world nameplates, never the authoritative RPG save. */
  readonly health?:number;
  readonly maxHealth?:number;
  readonly role: VisitorRole;
  readonly gold?: number;
  readonly equipment?: { readonly weapon: string | null; readonly armor: string | null };
  readonly status: VisitorStatus;
  /** Read-only, visual-only route hint. The RPG status remains in GameState. */
  readonly entranceGate?: GateSide;
}

export interface VisitorChanges {
  readonly entering: readonly VisitorSnapshot[];
  readonly staying: readonly VisitorSnapshot[];
  readonly leaving: readonly VisitorSnapshot[];
}

export function reconcileVisitors(
  previous: readonly VisitorSnapshot[],
  current: readonly VisitorSnapshot[],
): VisitorChanges {
  const oldVisitors = new Map(previous.filter(({ status }) => status === "at-shop" || status === "departing").map((hero) => [hero.id, hero]));
  const newVisitors = new Map(current.filter(({ status }) => status === "at-shop" || status === "departing").map((hero) => [hero.id, hero]));

  return {
    entering: [...newVisitors.values()].filter(({ id }) => !oldVisitors.has(id)),
    staying: [...newVisitors.values()].filter(({ id }) => oldVisitors.has(id)),
    leaving: [...oldVisitors.values()].filter(({ id }) => !newVisitors.has(id)),
  };
}

/** Visit boundaries are the actual saved arrivals and departures.
 * A visit may span midnight; daily uncompleted shopper decisions retain
 * their existing day semantics. Repeated arrivals reset the current receipt. */
type VisitEvent={readonly day:number;readonly type:string;
  readonly adventurerId?:string;readonly saleChannel?:string;readonly worldTick?:number};
export function currentShopVisitEvents<T extends VisitEvent>(
  events:readonly T[],day:number,heroId:string,
):readonly T[]{
  const visit:T[]=[];
  for(let i=events.length-1;i>=0;i--){
    const e=events[i];
    if(e.day<day)break;
    if(e.day!==day||e.adventurerId!==heroId)continue;
    if(e.type==="shop-departure")break;
    visit.push(e);
    if(e.type==="shop-arrival")break;
  }
  return visit;
}
export function shopVisitSuffix(events:readonly VisitEvent[],day:number,heroId:string):string{
  const arrival=currentShopVisitEvents(events,day,heroId).find(e=>e.type==="shop-arrival");
  return arrival?.worldTick===undefined?"":":visit:"+arrival.worldTick;
}
export function manuallyPaidVisitors(events:readonly VisitEvent[],day:number):ReadonlySet<string>{
  const paid=new Set<string>(),closed=new Set<string>();
  for(let i=events.length-1;i>=0;i--){
    const e=events[i],id=e.adventurerId;
    if(e.day<day)break;
    if(e.day!==day||!id||closed.has(id))continue;
    if(e.type==="shop-arrival"||e.type==="shop-departure")closed.add(id);
    else if(e.type==="sale"&&e.saleChannel==="manual")paid.add(id);
  }
  return paid;
}

/** Cart contents are cosmetic until the authoritative visitor status changes.
 * Emptying a basket must not turn an at-shop NPC into a departing NPC.
 */
export function shouldLeaveShopVisual(status:VisitorStatus):boolean {
  return status!=="at-shop";
}
