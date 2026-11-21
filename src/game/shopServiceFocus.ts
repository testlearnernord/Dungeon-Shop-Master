import {ITEMS,SHELF_GOODS,type ItemId,type Slot} from "./economy.ts";

/** Live visual customer requests. Never inferred from long-term forecast:
 * a real visitor must still be present with a live 60-second petition timer.
 */
export interface LiveServiceRequest {
  readonly heroId:string;
  readonly itemId:ItemId;
  readonly reason:"unavailable"|"cannot-afford";
  readonly secondsRemaining:number;
}
export interface ServicePriority {
  readonly restock:LiveServiceRequest|null;
  readonly restockCount:number;
  readonly creditCount:number;
}

/** Nearest expiration first, stable hero ID tie-break, no invented urgency. */
export function prioritizeShopService(
  requests:readonly LiveServiceRequest[],
):ServicePriority {
  const active=requests.filter(item=>Number.isFinite(item.secondsRemaining)&&
    item.secondsRemaining>0&&ITEMS.some(i=>i.id===item.itemId));
  const restocks=active.filter(item=>item.reason==="unavailable");
  const earliest=[...restocks].sort((a,b)=>
    a.secondsRemaining-b.secondsRemaining||a.heroId.localeCompare(b.heroId))[0]??null;
  return {restock:earliest,restockCount:restocks.length,
    creditCount:active.length-restocks.length};
}
export interface ShelfFocusHint {
  readonly title:string;
  readonly instruction:string;
  readonly tone:"ready"|"warning"|"blocked";
}

/** Uses the actual picked physical slot, hotbar selection and unpaid carts.
 * This hint NEVER reserves or stocks merchandise on its own.
 */
export function describeShelfFocus(
  slot:Pick<Slot,"itemId"|"quantity"|"capacity">,
  selected:ItemId,
  bag:Readonly<Record<ItemId,number>>,
  heldByCustomer:boolean,
):ShelfFocusHint {
  const selectedItem=ITEMS.find(item=>item.id===selected)!;
  const item=ITEMS.find(entry=>entry.id===slot.itemId);
  const title=item
    ?item.name+" · "+slot.quantity+"/"+slot.capacity
    :"Empty shelf slot · 0/"+slot.capacity;
  if(heldByCustomer)
    return {title,instruction:"Reserved stock · wait for checkout before changing this slot",
      tone:"blocked"};
  if(item&&item.id!==selected){
    const key=SHELF_GOODS.findIndex(entry=>entry.id===item.id)+1;
    return {title,instruction:"Press "+key+" to select "+item.name+
      " · Right-click: remove one · Shift+right-click: clear slot",tone:"warning"};
  }
  if(slot.quantity>=slot.capacity)
    return {title,instruction:"Shelf full · Right-click: remove one · Shift+right-click: clear slot",
      tone:"blocked"};
  const inBag=bag[selected]??0;
  if(inBag<=0)
    return {title,instruction:"No "+selectedItem.name+" in bag · B: Wholesale"+
      (item?" · Right-click: remove one · Shift+right-click: clear slot":""),tone:"warning"};
  return {title,instruction:"Left-click: stock "+selectedItem.name+
    " ("+inBag+" in bag) · Shift+left-click: fill slot"+
    (item?" · Right-click: remove one · Shift+right-click: clear slot":""),tone:"ready"};
}
