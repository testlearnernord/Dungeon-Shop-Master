export type VisitorStatus = "exploring" | "traveling" | "at-shop" | "returning" | "expedition" | "dead";
export type VisitorRole = "tank" | "DPS" | "healer";
export type GateSide = "level4" | "level6";

/** Derive cosmetic return routes from the authoritative daily event history. */
export function level6ReturnIds(
  events: readonly { readonly type: string; readonly day: number; readonly adventurerId?: string }[],
  currentDay: number,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.day < currentDay - 1) break;
    if (event.day === currentDay - 1 && event.type === "level6-return" && event.adventurerId) {
      ids.add(event.adventurerId);
    }
  }
  return ids;
}

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
  const oldVisitors = new Map(previous.filter(({ status }) => status === "at-shop").map((hero) => [hero.id, hero]));
  const newVisitors = new Map(current.filter(({ status }) => status === "at-shop").map((hero) => [hero.id, hero]));

  return {
    entering: [...newVisitors.values()].filter(({ id }) => !oldVisitors.has(id)),
    staying: [...newVisitors.values()].filter(({ id }) => oldVisitors.has(id)),
    leaving: [...oldVisitors.values()].filter(({ id }) => !newVisitors.has(id)),
  };
}

/** Paid shoppers physically leave immediately, although their expedition
 * simulation remains governed by the next Day Tick. Only a real, committed
 * manual sale is enough: an empty or cancelled cart is NOT a payment. */
export function manuallyPaidVisitors(
  events:readonly {readonly day:number;readonly type:string;
    readonly adventurerId?:string;readonly saleChannel?:string}[],
  day:number,
):ReadonlySet<string> {
  const paid=new Set<string>();
  for(let i=events.length-1;i>=0;i--){
    const event=events[i];
    if(event.day<day)break;
    if(event.day===day&&event.type==="sale"&&
       event.saleChannel==="manual"&&event.adventurerId)
      paid.add(event.adventurerId);
  }
  return paid;
}

/** Cart contents are cosmetic until the authoritative visitor status changes.
 * Emptying a basket must not turn an at-shop NPC into a departing NPC.
 */
export function shouldLeaveShopVisual(status:VisitorStatus):boolean {
  return status!=="at-shop";
}
