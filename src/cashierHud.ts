import { cartTotal } from "./game/shopCarts.ts";
import { ITEMS } from "./game/economy.ts";
import type { GameStore } from "./game/gameStore.ts";

/** UI-only timing session. Never changes GameState until a confirmed checkout. */
export function setupCashierHud(
  store:GameStore,
  readyHero:()=>string|null,
  shopActive:()=>boolean,
  pay:(heroId:string)=>string,
  report:(message:string)=>void,
):{open:()=>string;close:()=>void} {
  const root=document.createElement("section");
  root.id="cashier-overlay";
  root.hidden=true;
  root.setAttribute("aria-label","Cashier timing challenge");
  root.innerHTML='<div class="cashier-panel"><h2>CHECKOUT</h2><p class="cashier-customer"></p><div class="cashier-lines"></div><p class="cashier-total"></p><div class="cashier-meter"><div class="cashier-target"></div><div class="cashier-needle"></div></div><p class="cashier-hint">Press R twice when the marker crosses the center.</p><button type="button" class="cashier-cancel">Cancel (Esc)</button></div>';
  document.body.append(root);
  const customer=root.querySelector<HTMLElement>(".cashier-customer")!;
  const lines=root.querySelector<HTMLElement>(".cashier-lines")!;
  const total=root.querySelector<HTMLElement>(".cashier-total")!;
  const hint=root.querySelector<HTMLElement>(".cashier-hint")!;
  const needle=root.querySelector<HTMLElement>(".cashier-needle")!;
  let heroId:string|null=null;
  let hits=0;
  let lastPress=0;
  let started=0;
  let frame=0;
  const close=()=>{
    heroId=null;
    root.hidden=true;
    cancelAnimationFrame(frame);
  };
  const phase=()=>Math.abs(Math.sin((performance.now()-started)/700));
  const render=()=>{
    if(!heroId)return;
    if(!shopActive()||readyHero()!==heroId){close();report("Customer left the register.");return;}
    needle.style.left=(phase()*100)+"%";
    frame=requestAnimationFrame(render);
  };
  const open=():string=>{
    if(heroId)return "Finish or cancel the current checkout.";
    if(!shopActive())return "Return to the shop first.";
    const id=readyHero();
    const cart=store.state.shopCarts.find(entry=>entry.heroId===id);
    const hero=store.state.adventurers.find(entry=>entry.id===id);
    if(!id||!cart||!hero)return "Wait for the first customer to reach the register.";
    heroId=id;hits=0;lastPress=0;started=performance.now();
    customer.textContent=hero.name;
    lines.replaceChildren();
    for(const line of cart.lines){
      const item=ITEMS.find(entry=>entry.id===line.itemId);
      const p=document.createElement("p");
      p.textContent=line.quantity+" × "+(item?.name??line.itemId)+" — "+line.subtotal+"g";
      lines.append(p);
    }
    total.textContent="Total: "+cartTotal(cart)+"g";
    hint.textContent="Press R twice near the center. Esc cancels.";
    root.hidden=false;
    frame=requestAnimationFrame(render);
    return "Cashier challenge started. Press R twice at the center.";
  };
  root.querySelector(".cashier-cancel")!.addEventListener("click",close);
  window.addEventListener("keydown",event=>{
    if(!heroId||event.repeat)return;
    if(event.code==="Escape"){event.preventDefault();close();return;}
    if(event.code!=="KeyR")return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(performance.now()-lastPress<250)return;
    lastPress=performance.now();
    const accurate=phase()<=0.18;
    if(!accurate){
      hint.textContent="Missed! Try again at the center. "+hits+"/2";
      hits=0;
      return;
    }
    hits++;
    hint.textContent="Perfect! "+hits+"/2";
    if(hits<2)return;
    const id=heroId;
    if(readyHero()!==id||!shopActive()){close();report("Checkout canceled: customer moved.");return;}
    close();
    report(pay(id)+" Timing: 2/2 perfect.");
  },true);
  store.subscribe(()=>{
    if(heroId&&!store.state.shopCarts.some(cart=>cart.heroId===heroId))close();
  });
  return {open,close};
}
