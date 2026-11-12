import type { CashierCue } from "./cashierSfx.ts";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { cartTotal } from "./game/shopCarts.ts";
import { ITEMS } from "./game/economy.ts";
import { CASHIER_STAGES, CASHIER_TIMING_TOLERANCE, evaluateCashierTiming } from "./game/cashierChallenge.ts";
import type { GameStore } from "./game/gameStore.ts";

/**
 * Physical register minigame. The cart is only paid on the second accurate
 * stamp; no state, gold or stock is changed by opening, missing or cancelling.
 */
export function setupCashierHud(
  canvas:HTMLCanvasElement,
  camera:UniversalCamera,
  store:GameStore,
  readyHero:()=>string|null,
  shopActive:()=>boolean,
  pay:(heroId:string,perfectTiming:boolean)=>string,
  report:(message:string)=>void,
  sound:(cue:CashierCue)=>void,
  pulse:(cycle:number)=>void,
):{open:()=>string;close:()=>void} {
  const root=document.createElement("dialog");
  root.id="cashier-overlay";
  root.tabIndex=-1;
  root.setAttribute("aria-labelledby","cashier-title");
  root.innerHTML=`<section class="cashier-panel">
    <header class="cashier-panel-header">
      <span class="cashier-eyebrow">GALVIK'S SHOP · LEVEL 5</span>
      <span class="cashier-serial">COUNTER / 01</span>
    </header>
    <div class="cashier-heading">
      <p class="cashier-kicker">THE CUSTOMER IS WAITING</p>
      <h2 id="cashier-title">THE REGISTER</h2>
      <p class="cashier-customer"></p>
    </div>
    <section class="cashier-receipt" aria-label="Customer receipt">
      <div class="cashier-receipt-heading"><strong>RECEIPT</strong><span>Goods carried to counter</span></div>
      <div class="cashier-lines"></div>
      <p class="cashier-total"></p>
    </section>
    <section class="cashier-challenge" aria-label="Register timing challenge">
      <div class="cashier-stage-header">
        <span class="cashier-stage-count">01 / 02</span>
        <strong class="cashier-stage-name">Verify the goods</strong>
      </div>
      <p class="cashier-stage-detail"></p>
      <div class="cashier-meter" role="img" aria-label="Moving stamp marker and success zone">
        <div class="cashier-target"></div><div class="cashier-needle"></div>
      </div>
      <div class="cashier-progress" aria-label="Checkout progress">
        <span data-stage="0">01 · GOODS</span><span data-stage="1">02 · RECEIPT</span>
      </div>
      <p class="cashier-hint" aria-live="polite"></p>
      <div class="cashier-actions">
        <button type="button" class="cashier-stamp">STAMP <kbd>R</kbd></button>
        <button type="button" class="cashier-cancel">Cancel <kbd>Esc</kbd></button>
      </div>
    </section>
  </section>`;
  document.body.append(root);
  const customer=root.querySelector<HTMLElement>(".cashier-customer")!;
  const lines=root.querySelector<HTMLElement>(".cashier-lines")!;
  const total=root.querySelector<HTMLElement>(".cashier-total")!;
  const hint=root.querySelector<HTMLElement>(".cashier-hint")!;
  const needle=root.querySelector<HTMLElement>(".cashier-needle")!;
  const target=root.querySelector<HTMLElement>(".cashier-target")!;
  const stageCount=root.querySelector<HTMLElement>(".cashier-stage-count")!;
  const stageName=root.querySelector<HTMLElement>(".cashier-stage-name")!;
  const stageDetail=root.querySelector<HTMLElement>(".cashier-stage-detail")!;
  const stamps=[...root.querySelectorAll<HTMLElement>(".cashier-progress [data-stage]")];
  let heroId:string|null=null;
  let hits=0;
  let misses=0;
  let lastPress=0;
  let started=0;
  let frame=0;

  const close=()=>{
    if(!heroId&&!root.open)return;
    heroId=null;
    cancelAnimationFrame(frame);
    if(root.open)root.close();
  };
  root.addEventListener("close",()=>{
    camera.attachControl(canvas,true);
    canvas.focus();
  });
  const phase=()=>Math.abs(Math.sin((performance.now()-started)/700));
  const showStage=()=>{
    const stage=CASHIER_STAGES[hits]??CASHIER_STAGES[0];
    stageCount.textContent=String(hits+1).padStart(2,"0")+" / 02";
    stageName.textContent=stage.title;
    stageDetail.textContent=stage.detail;
    target.style.left=((stage.target-CASHIER_TIMING_TOLERANCE)*100)+"%";
    target.style.width=(CASHIER_TIMING_TOLERANCE*200)+"%";
    for(let index=0;index<stamps.length;index++){
      stamps[index].classList.toggle("is-complete",index<hits);
      stamps[index].classList.toggle("is-active",index===hits);
    }
    hint.textContent=hits===0
      ?"Press R (or STAMP) as the needle crosses the green mark."
      :"Goods verified. Seal the receipt at the new mark.";
  };
  const render=()=>{
    if(!heroId)return;
    if(!shopActive()||readyHero()!==heroId){
      close();report("Customer left the register.");return;
    }
    needle.style.left=(phase()*100)+"%";
    pulse(Math.floor((performance.now()-started)/(Math.PI*700)));
    frame=requestAnimationFrame(render);
  };
  const attemptStamp=()=>{
    if(!root.open||!heroId||!shopActive())return;
    if(performance.now()-lastPress<250)return;
    lastPress=performance.now();
    const result=evaluateCashierTiming(hits,phase());
    if(!result.accepted){
      misses++;
      hint.textContent=(result.direction==="early"?"Left of the mark. ":"Right of the mark. ")+
        "Try again. Flawless-service tip forfeited.";
      sound("miss");
      return;
    }
    hits=result.nextStep;
    sound("hit");
    if(!result.completed){
      started=performance.now();
      showStage();
      return;
    }
    const id=heroId;
    if(readyHero()!==id||!shopActive()){
      close();report("Checkout canceled: customer moved.");return;
    }
    close();
    const before=store.state;
    const outcome=pay(id,misses===0);
    if(store.state!==before)sound("coins");
    report(outcome+" Receipt verified and sealed."+
      (misses===0?" Perfect service.":" No flawless-service tip."));
  };
  const open=():string=>{
    if(heroId)return "Finish or cancel the current checkout.";
    if(document.querySelector("dialog[open]"))return "Close the open dialog first.";
    if(!shopActive())return "Return to the shop first.";
    const id=readyHero();
    const cart=store.state.shopCarts.find(entry=>entry.heroId===id);
    const hero=store.state.adventurers.find(entry=>entry.id===id);
    if(!id||!cart||!hero)return "Wait for the first customer to reach the register.";
    heroId=id;hits=0;misses=0;lastPress=Number.NEGATIVE_INFINITY;started=performance.now();
    customer.textContent=hero.name+" · Lv"+hero.level+" "+hero.role;
    lines.replaceChildren();
    for(const line of cart.lines){
      const item=ITEMS.find(entry=>entry.id===line.itemId);
      const p=document.createElement("p");
      p.className="cashier-line";
      const name=document.createElement("span");
      name.textContent=line.quantity+" × "+(item?.name??line.itemId);
      const price=document.createElement("strong");
      price.textContent=line.subtotal+"g";
      p.append(name,price);
      lines.append(p);
    }
    total.textContent="TOTAL DUE  ·  "+cartTotal(cart)+"g";
    showStage();
    if(document.pointerLockElement)void document.exitPointerLock();
    camera.detachControl();
    root.showModal();
    sound("open");
    root.focus();
    frame=requestAnimationFrame(render);
    return "Register ready. Verify the goods, then seal the receipt.";
  };
  root.querySelector(".cashier-cancel")!.addEventListener("click",close);
  root.querySelector(".cashier-stamp")!.addEventListener("click",attemptStamp);
  window.addEventListener("keydown",event=>{
    if(!root.open||!heroId||event.repeat)return;
    if(event.code==="Escape"){event.preventDefault();close();return;}
    if(event.code!=="KeyR")return;
    event.preventDefault();
    event.stopImmediatePropagation();
    attemptStamp();
  },true);
  store.subscribe(()=>{
    if(heroId&&!store.state.shopCarts.some(cart=>cart.heroId===heroId))close();
  });
  return {open,close};
}
