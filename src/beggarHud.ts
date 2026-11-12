import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { GameStore } from "./game/gameStore.ts";
import type { NpcVisualSystem } from "./game/npcVisualSystem.ts";

/** A small merchant decision, not a free automatic item transfer.
 * Hero and stock are revalidated at the exact click/commit point.
 */
export function setupBeggarHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,
  visitors:NpcVisualSystem,isShopActive:()=>boolean,
  onMessage:(message:string)=>void,
):{openNearest:()=>boolean;close:()=>void} {
  const dialog=document.createElement("dialog");
  dialog.id="beggar-dialog";
  dialog.setAttribute("aria-labelledby","beggar-heading");
  dialog.innerHTML=`<section class="beggar-sheet">
    <header><small>GALVIK'S PRIVATE ACCOUNTS · CREDIT REQUEST</small>
      <h2 id="beggar-heading">A desperate adventurer</h2></header>
    <div class="beggar-item">
      <svg viewBox="0 0 48 48" aria-hidden="true"><use id="beggar-item-symbol"></use></svg>
      <div><strong id="beggar-item-name"></strong>
        <p id="beggar-request"></p></div>
    </div>
    <p id="beggar-balance"></p>
    <p id="beggar-stock"></p>
    <p id="beggar-response" role="status"></p>
    <footer>
      <button type="button" id="beggar-refuse">Refuse</button>
      <button type="button" id="beggar-close">Not now</button>
      <button type="button" id="beggar-credit">Write debt & give item</button>
    </footer></section>`;
  document.body.append(dialog);

  const el=<T extends HTMLElement>(id:string)=>dialog.querySelector<T>("#"+id)!;
  const heading=el<HTMLElement>("beggar-heading");
  const itemName=el<HTMLElement>("beggar-item-name");
  const request=el<HTMLElement>("beggar-request");
  const balance=el<HTMLElement>("beggar-balance");
  const stock=el<HTMLElement>("beggar-stock");
  const response=el<HTMLElement>("beggar-response");
  const credit=el<HTMLButtonElement>("beggar-credit");
  const symbol=dialog.querySelector<SVGUseElement>("#beggar-item-symbol")!;
  let selectedHeroId:string|null=null;
  const close=():void=>{if(dialog.open)dialog.close();selectedHeroId=null;};

  const render=():void=>{
    if(!dialog.open||!selectedHeroId)return;
    const offer=store.quoteBeggingRequest(selectedHeroId);
    if(!offer){
      credit.disabled=true;
      response.textContent="This request is no longer available.";
      return;
    }
    heading.textContent=offer.heroName+" asks for help";
    itemName.textContent=offer.itemName+" · "+offer.price+"g";
    symbol.setAttribute("href",import.meta.env.BASE_URL+"assets/ui-item-icons.svg#"+offer.itemId);
    request.textContent="\"I have "+offer.gold+" gold. Please, I need this to survive.\"";
    balance.textContent="Already owed to Galvik: "+offer.previousDebt+"g · After this favor: "+
      (offer.previousDebt+offer.price)+"g";
    stock.textContent=offer.available
      ?"Stock available. The item will be given now, and no cash will be earned."
      :"Out of stock. Restock the shelf or Galvik's bag before offering credit.";
    credit.disabled=!offer.available;
  };

  const openNearest=():boolean=>{
    if(!isShopActive()||dialog.open||document.querySelector("dialog[open]"))return false;
    const heroId=visitors.nearbyBeggarId(camera.position,camera.getForwardRay(1).direction);
    if(!heroId||!store.quoteBeggingRequest(heroId))return false;
    selectedHeroId=heroId;
    response.textContent="";
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    camera.detachControl();
    dialog.showModal();
    render();
    return true;
  };

  credit.addEventListener("click",()=>{
    if(!selectedHeroId)return;
    const heroId=selectedHeroId;
    const before=store.state;
    const message=store.issueShopCredit(heroId);
    if(store.state!==before){
      visitors.departWithCredit(heroId);
      onMessage(message);
      close();
    }else {
      response.textContent=message;
      render();
    }
  });
  el<HTMLButtonElement>("beggar-refuse").addEventListener("click",()=>{
    if(selectedHeroId){
      visitors.dismissBeggar(selectedHeroId);
      onMessage("Galvik refused the request. The adventurer leaves empty-handed.");
    }
    close();
  });
  el<HTMLButtonElement>("beggar-close").addEventListener("click",close);
  dialog.addEventListener("close",()=>{
    selectedHeroId=null;
    if(isShopActive())camera.attachControl(canvas,true);
    canvas.focus();
  });
  store.subscribe(render);
  return {openNearest,close};
}
