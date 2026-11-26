import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {GameStore} from "./game/gameStore.ts";
import {SHELF_GOODS,isShelfGood,type ItemId} from "./game/economy.ts";
import "./shelfAssignmentHud.css";

export function setupShelfAssignmentHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,shopActive:()=>boolean,
){
  const dialog=document.createElement("dialog");
  dialog.id="shelf-assignment-dialog";
  dialog.setAttribute("aria-labelledby","shelf-assignment-title");
  dialog.innerHTML='<h2 id="shelf-assignment-title">Shelf assignment</h2><p id="shelf-assignment-stock"></p><label for="shelf-assignment-item">Assigned product</label><select id="shelf-assignment-item"></select><p id="shelf-assignment-status" role="status"></p><div class="shelf-assignment-actions"><button type="button" id="shelf-assignment-apply">Apply assignment</button><button type="button" id="shelf-assignment-close">Close</button></div>';
  document.body.append(dialog);
  const title=dialog.querySelector<HTMLElement>("#shelf-assignment-title")!;
  const stock=dialog.querySelector<HTMLElement>("#shelf-assignment-stock")!;
  const select=dialog.querySelector<HTMLSelectElement>("#shelf-assignment-item")!;
  const status=dialog.querySelector<HTMLElement>("#shelf-assignment-status")!;
  const apply=dialog.querySelector<HTMLButtonElement>("#shelf-assignment-apply")!;
  select.add(new Option("Unassigned / clear assignment",""));
  for(const item of SHELF_GOODS)select.add(new Option(item.name,item.id));
  let activeSlot:string|null=null;
  const current=()=>store.state.shopEconomy.slots.find(s=>s.id===activeSlot);
  const refresh=()=>{
    const slot=current();
    if(!slot){dialog.close();return;}
    const held=store.state.shopCarts.some(cart=>cart.lines.some(line=>line.slotId===slot.id));
    stock.textContent="Stock: "+slot.quantity+"/"+slot.capacity+
      (held?" · Customer reservation":"");
    select.disabled=apply.disabled=slot.quantity>0||held;
    if(select.disabled)status.textContent="Empty the slot and wait for customer reservations before changing its assignment.";
    else status.textContent="Assignments persist even when stock reaches zero.";
  };
  apply.addEventListener("click",()=>{
    const slot=current();
    if(!slot)return;
    const id=select.value as ItemId;
    if(id&&!isShelfGood(id))return;
    const result=store.assignShelfItem(slot.id,id||null);
    refresh();
    status.textContent=result;
  });
  dialog.querySelector("#shelf-assignment-close")!.addEventListener("click",()=>dialog.close());
  dialog.addEventListener("close",()=>{
    activeSlot=null;
    if(shopActive()&&!document.querySelector("dialog[open]"))camera.attachControl(canvas,true);
  });
  let previousSlots=store.state.shopEconomy.slots,previousCarts=store.state.shopCarts;
  store.subscribe(()=>{
    const {shopEconomy,shopCarts}=store.state;
    if(previousSlots===shopEconomy.slots&&previousCarts===shopCarts)return;
    previousSlots=shopEconomy.slots;previousCarts=shopCarts;
    if(dialog.open)refresh();
  });
  return (slotId:string):boolean=>{
    if(!shopActive()||document.querySelector("dialog[open]")||
      document.body.classList.contains("blueprint-active"))return false;
    activeSlot=slotId;
    const slot=current();
    if(!slot){activeSlot=null;return false;}
    title.textContent="Shelf "+slot.shelfId.slice(6)+" · Slot "+(slot.index+1);
    select.value=slot.itemId??"";
    if(document.pointerLockElement===canvas)void document.exitPointerLock();
    camera.detachControl();dialog.showModal();refresh();
    return true;
  };
}
