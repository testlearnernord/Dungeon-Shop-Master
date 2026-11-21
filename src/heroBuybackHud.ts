import type {GameStore} from "./game/gameStore.ts";
import {availableDungeonOffers} from "./game/dungeonBuyback.ts";
import {ECONOMY,ITEMS,isMaterial} from "./game/economy.ts";

/** The Dungeon Shop Master's own staffed counter offer book. All contents
 * come from actual living visitors' individual dungeon finds. Clicking
 * "Buy" commits exactly one goods-and-gold exchange through GameStore. */
export function setupHeroBuybackHud(store:GameStore):void{
  const trigger=document.querySelector<HTMLButtonElement>("#open-hero-offers")!;
  const modal=document.createElement("dialog");
  modal.id="hero-buyback-hud";
  modal.setAttribute("aria-label","Adventurer loot buyback offers");
  const heading=document.createElement("header");
  const title=document.createElement("div");
  const eyebrow=document.createElement("small");
  eyebrow.textContent="GALVIK'S COUNTER · BUYBACK";
  const name=document.createElement("h2");
  name.textContent="Trophies of the Deep";
  const note=document.createElement("p");
  note.textContent="Adventurers offer goods they actually recovered. Buy an item or leave it with its owner.";
  title.append(eyebrow,name,note);
  const close=document.createElement("button");
  close.type="button";close.textContent="✕ Close";
  close.addEventListener("click",()=>modal.close());
  heading.append(title,close);
  const budget=document.createElement("div");
  budget.className="hero-buyback-budget";
  const offers=document.createElement("div");
  offers.className="hero-buyback-offers";
  const feedback=document.createElement("p");
  feedback.className="hero-buyback-feedback";
  feedback.setAttribute("role","status");
  modal.append(heading,budget,offers,feedback);
  document.body.append(modal);
  let previousCount=-1;
  let previousRoster:typeof store.state.adventurers|null=null;
  let previousEconomy:typeof store.state.shopEconomy|null=null;
  // World-clock notifications may arrive every 50ms. Rebuild only when
  // actual offers or treasury can change, not merely when time advances.
  const render=(force=false)=>{
    const state=store.state;
    if(!force&&state.adventurers===previousRoster&&
      state.shopEconomy===previousEconomy)return;
    previousRoster=state.adventurers;
    previousEconomy=state.shopEconomy;
    const entries=availableDungeonOffers(state);
    if(entries.length!==previousCount){
      previousCount=entries.length;
      trigger.textContent=entries.length?"Hero loot ("+entries.length+")":"Hero loot offers";
    }
    if(!modal.open)return;
    budget.textContent="Galvik: "+state.shopEconomy.balance+
      " gold · Bag "+Object.values(state.shopEconomy.bag).reduce(
        (sum,value)=>sum+value,0)+"/"+ECONOMY.bagCapacity+
      " · Workshop reserve: Iron Ore "+state.shopEconomy.materialStorage["iron-ore"]+
      " · Coal "+state.shopEconomy.materialStorage.coal;
    offers.replaceChildren();
    if(!entries.length){
      const empty=document.createElement("p");
      empty.className="hero-buyback-empty";
      empty.textContent="No returning adventurer currently offers recovered goods.";
      offers.append(empty);return;
    }
    const bagFull=Object.values(state.shopEconomy.bag).reduce(
      (sum,value)=>sum+value,0)>=ECONOMY.bagCapacity;
    for(const offer of entries){
      const item=ITEMS.find(entry=>entry.id===offer.itemId)!;
      const row=document.createElement("article");
      row.className="hero-buyback-offer";
      const swatch=document.createElement("span");
      swatch.className="hero-buyback-item-swatch";
      swatch.style.background=item.color;
      const summary=document.createElement("div");
      const good=document.createElement("strong");
      good.textContent=item.name+" ×"+offer.count;
      const seller=document.createElement("small");
      seller.textContent=offer.heroName+" · Found in dungeon"+
        (isMaterial(offer.itemId)?" · To workshop reserve":" · To shop bag");
      summary.append(good,seller);
      const action=document.createElement("button");
      action.type="button";action.textContent="Buy · "+offer.price+"g";
      action.disabled=(!isMaterial(offer.itemId)&&bagFull)||
        state.shopEconomy.balance<offer.price||
        (isMaterial(offer.itemId)&&
         state.shopEconomy.materialStorage[offer.itemId]>=Number.MAX_SAFE_INTEGER);
      action.setAttribute("aria-label","Buy one "+item.name+" from "+offer.heroName);
      action.addEventListener("click",()=>{
        feedback.textContent=store.buyDungeonFind(offer.heroId,offer.itemId);
      });
      row.append(swatch,summary,action);
      offers.append(row);
    }
  };
  trigger.addEventListener("click",()=>{
    if(modal.open)return;
    if(document.pointerLockElement)void document.exitPointerLock();
    modal.showModal();
    feedback.textContent="Only confirmed visitor stock can be purchased.";
    render(true);
    close.focus();
  });
  store.subscribe(()=>render());
  render(true);
}
