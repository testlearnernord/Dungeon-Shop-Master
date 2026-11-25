import type {GameStore} from "./game/gameStore.ts";
/** Read-only receipts; the physical chest is the only player-facing intake. */
export function setupHeroBuybackHud(store:GameStore):void{
  const trigger=document.querySelector<HTMLButtonElement>("#open-buyback-log")!;
  trigger.textContent="Buyback log";
  const modal=document.createElement("dialog");modal.id="hero-buyback-hud";
  modal.setAttribute("aria-label","Recovered goods receipts");
  const header=document.createElement("header"),title=document.createElement("div"),h=document.createElement("h2"),note=document.createElement("p"),close=document.createElement("button");
  h.textContent="Recovered Goods";note.textContent="Adventurers sell workshop materials at the physical chest before shopping.";
  title.append(h,note);close.textContent="Close";close.onclick=()=>modal.close();header.append(title,close);
  const budget=document.createElement("div");budget.className="hero-buyback-budget";
  const receipts=document.createElement("div");receipts.className="buyback-receipts";
  modal.append(header,budget,receipts);document.body.append(modal);
  let previousEvents:typeof store.state.events|null=null;
  const render=(force=false)=>{
    const s=store.state,r=s.shopEconomy.materialStorage;
    if(force||previousEvents!==s.events){
      previousEvents=s.events;trigger.dataset.receipts=String(s.events.filter(e=>e.type==="hero-buyback").length);
    }
    if(!modal.open)return;
    budget.textContent=(s.buybackChestOpen?"Open":"Closed")+" · Galvik: "+s.shopEconomy.balance+"g · Workshop reserve: Iron Ore "+r["iron-ore"]+" · Coal "+r.coal+" · Ghoul Leather "+r["ghoul-leather"];
    receipts.replaceChildren();
    for(const e of s.events.filter(e=>e.type==="hero-buyback").slice(-30).reverse()){
      const row=document.createElement("article");row.className="buyback-receipt";row.textContent=e.message;receipts.append(row);
    }
    if(!receipts.children.length){const empty=document.createElement("p");empty.className="hero-buyback-empty";empty.textContent="No purchases recorded yet.";receipts.append(empty);}
  };
  trigger.onclick=()=>{if(modal.open)return;if(document.pointerLockElement)void document.exitPointerLock();modal.showModal();render(true);close.focus();};
  store.subscribe(()=>render());render(true);
}
