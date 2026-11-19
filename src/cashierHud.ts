import type { CashierCue } from "./cashierSfx.ts";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { cartTotal } from "./game/shopCarts.ts";
import { ITEMS } from "./game/economy.ts";
import {itemIcon,goldIcon} from "./uiIcons.ts";
import {counterDockPoint,isAtCounterStaffDock} from "./game/shopLayout.ts";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import { CASHIER_STAGES, CASHIER_TIMING_TOLERANCE, evaluateCashierTiming, cashierNeedlePosition, CASHIER_NEEDLE_PERIOD_MS } from "./game/cashierChallenge.ts";
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
):{open:()=>string;close:()=>void;readonly isOpen:boolean} {
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
      <p class="cashier-tip-note"></p>
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
    <section class="cashier-settlement" aria-label="Completed checkout" hidden>
      <span class="cashier-settlement-eyebrow">PAYMENT RECORDED</span>
      <strong class="cashier-settlement-amount"></strong>
      <p class="cashier-settlement-detail"></p>
      <p class="cashier-next-hint">Next customer approaching the counter.</p>
      <div class="cashier-actions">
        <button type="button" class="cashier-next" disabled>Next customer <kbd>E</kbd></button>
        <button type="button" class="cashier-finish">Leave register <kbd>Esc</kbd></button>
      </div>
    </section>
  </section>`;
  document.body.append(root);
  const customer=root.querySelector<HTMLElement>(".cashier-customer")!;
  const lines=root.querySelector<HTMLElement>(".cashier-lines")!;
  const total=root.querySelector<HTMLElement>(".cashier-total")!;
  const tipNote=root.querySelector<HTMLElement>(".cashier-tip-note")!;
  const challenge=root.querySelector<HTMLElement>(".cashier-challenge")!;
  const settlement=root.querySelector<HTMLElement>(".cashier-settlement")!;
  const settlementAmount=root.querySelector<HTMLElement>(".cashier-settlement-amount")!;
  const settlementDetail=root.querySelector<HTMLElement>(".cashier-settlement-detail")!;
  const nextHint=root.querySelector<HTMLElement>(".cashier-next-hint")!;
  const nextButton=root.querySelector<HTMLButtonElement>(".cashier-next")!;
  const finishButton=root.querySelector<HTMLButtonElement>(".cashier-finish")!;
  const hint=root.querySelector<HTMLElement>(".cashier-hint")!;
  const needle=root.querySelector<HTMLElement>(".cashier-needle")!;
  const target=root.querySelector<HTMLElement>(".cashier-target")!;
  const stageCount=root.querySelector<HTMLElement>(".cashier-stage-count")!;
  const stageName=root.querySelector<HTMLElement>(".cashier-stage-name")!;
  const stageDetail=root.querySelector<HTMLElement>(".cashier-stage-detail")!;
  const stamps=[...root.querySelectorAll<HTMLElement>(".cashier-progress [data-stage]")];
  let heroId:string|null=null;
  let settled=false;
  let lastNextCheck=0;
  let hits=0;
  let misses=0;
  let lastPress=0;
  let started=0;
  let frame=0;
  // The input is graded against what the LAST rendered frame displayed,
  // not against unseen wall-clock advancement during a browser stall.
  let paintedPosition=0;

  const close=()=>{
    if(!root.open&&!heroId)return;
    heroId=null;
    settled=false;
    cancelAnimationFrame(frame);
    if(root.open)root.close();
  };
  root.addEventListener("cancel",event=>{event.preventDefault();close();});
  root.addEventListener("close",()=>{
    camera.attachControl(canvas,true);
    canvas.focus();
  });
  const phase=()=>cashierNeedlePosition(performance.now()-started);
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
  // Only the physically admitted front customer, with a saved real
  // unpaid cart, can enter a new checkout. No hypothetical queue shortcut.
  const payableAtRegister=()=>{
    if(!shopActive()||
       !isAtCounterStaffDock(store.state.shopLayout,camera.position))return null;
    const id=readyHero();
    if(!id)return null;
    const cart=store.state.shopCarts.find(entry=>entry.heroId===id);
    const hero=store.state.adventurers.find(entry=>entry.id===id);
    return cart&&hero?{id,cart,hero}:null;
  };
  const syncNext=()=>{
    const next=payableAtRegister();
    nextButton.disabled=!next;
    nextHint.textContent=next
      ?next.hero.name+" is ready with "+cartTotal(next.cart)+"g of goods."
      :"Waiting for the next customer to reach the counter.";
  };
  const beginCustomer=(buyer:NonNullable<ReturnType<typeof payableAtRegister>>)=>{
    heroId=buyer.id;
    settled=false;
    hits=0;
    misses=0;
    lastPress=Number.NEGATIVE_INFINITY;
    started=performance.now();
    paintedPosition=0;
    needle.style.left="0%";
    challenge.hidden=false;
    settlement.hidden=true;
    customer.textContent=buyer.hero.name+" · Lv"+buyer.hero.level+" "+buyer.hero.role;
    lines.replaceChildren();
    for(const line of buyer.cart.lines){
      const item=ITEMS.find(entry=>entry.id===line.itemId);
      const p=document.createElement("p");
      p.className="cashier-line";
      const name=document.createElement("span");
      name.className="cashier-item-name";
      name.append(itemIcon(line.itemId,"cashier-item-icon"),
        document.createTextNode(line.quantity+" × "+(item?.name??line.itemId)));
      const price=document.createElement("strong");
      price.textContent=line.subtotal+"g";
      p.append(name,price);
      lines.append(p);
    }
    const basket=cartTotal(buyer.cart);
    total.replaceChildren(document.createTextNode("TOTAL DUE  ·  "),
      goldIcon("cashier-gold-icon"),
      document.createTextNode(basket+"g"));
    const possibleTip=Math.floor(basket/10);
    tipNote.textContent=possibleTip>0&&buyer.hero.gold>=basket+possibleTip
      ?"Flawless stamps may earn "+possibleTip+"g extra from this customer."
      :"No extra tip available for this basket.";
    showStage();
    root.dataset.phase="stamping";
  };
  const render=()=>{
    if(!root.open)return;
    if(heroId){
      if(!shopActive()||readyHero()!==heroId){
        close();report("Customer left the register.");return;
      }
      paintedPosition=phase();
      needle.style.left=(paintedPosition*100)+"%";
      pulse(Math.floor((performance.now()-started)/(Math.PI*CASHIER_NEEDLE_PERIOD_MS)));
    }else if(settled){
      if(!shopActive()){close();return;}
      if(performance.now()-lastNextCheck>=200){
        lastNextCheck=performance.now();
        syncNext();
      }
    }
    frame=requestAnimationFrame(render);
  };
  const serveNext=()=>{
    if(!root.open||!settled)return;
    const next=payableAtRegister();
    if(!next){syncNext();return;}
    beginCustomer(next);
    sound("open");
    root.querySelector<HTMLButtonElement>(".cashier-stamp")!.focus();
  };
  const attemptStamp=()=>{
    if(!root.open||!heroId||!shopActive())return;
    if(performance.now()-lastPress<250)return;
    lastPress=performance.now();
    const result=evaluateCashierTiming(hits,paintedPosition);
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
      paintedPosition=0;
      needle.style.left="0%";
      showStage();
      return;
    }
    const id=heroId;
    if(readyHero()!==id||!shopActive()){
      close();report("Checkout canceled: customer moved.");return;
    }
    // Clear the active customer BEFORE GameStore notifies subscribers, or
    // its cart-removal listener would close the entire register session.
    heroId=null;
    const before=store.state;
    const outcome=pay(id,misses===0);
    if(store.state===before){
      close();
      report(outcome);
      return;
    }
    const cashReceived=store.state.shopEconomy.balance-
      before.shopEconomy.balance;
    const bought=before.shopCarts.find(entry=>entry.heroId===id);
    const subtotal=bought?cartTotal(bought):0;
    const tip=Math.max(0,cashReceived-subtotal);
    sound("coins");
    report(outcome+" Receipt verified and sealed."+
      (misses===0?" Perfect service.":" No flawless-service tip."));
    // The player explicitly decides to serve each subsequent customer.
    // Keeping the register open eliminates repeated modal/pointer-lock
    // roundtrips; it never charges an unconfirmed second cart.
    settled=true;
    root.dataset.phase="settled";
    challenge.hidden=true;
    settlement.hidden=false;
    settlementAmount.replaceChildren(goldIcon("cashier-gold-icon"),
      document.createTextNode(cashReceived+"g collected"));
    settlementDetail.textContent=tip>0
      ?subtotal+"g sale + "+tip+"g customer-funded tip"
      :subtotal+"g sale · "+(misses>0
        ?"no flawless-service tip":"no additional tip on this basket");
    lastNextCheck=0;
    syncNext();
    (nextButton.disabled?finishButton:nextButton).focus();
  };
  const open=():string=>{
    if(root.open||heroId)return "Finish or leave the current checkout.";
    if(document.querySelector("dialog[open]"))
      return "Close the open dialog first.";
    if(!shopActive())return "Return to the shop first.";
    if(!isAtCounterStaffDock(store.state.shopLayout,camera.position))
      return "Stand behind the counter at the cashier's station to serve.";
    const buyer=payableAtRegister();
    if(!buyer)return "Wait for the first customer to reach the register.";
    // Initial service snaps only to the staff-side socket. Subsequent
    // customers are admitted without moving the player/camera again.
    const dock=counterDockPoint(store.state.shopLayout,"staff");
    camera.position.x=dock.x;
    camera.position.z=dock.z;
    const counter=store.state.shopLayout.counter;
    if(counter)
      camera.setTarget(new Vector3(counter.x,camera.position.y+.10,counter.z));
    beginCustomer(buyer);
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
  nextButton.addEventListener("click",serveNext);
  finishButton.addEventListener("click",close);
  window.addEventListener("keydown",event=>{
    if(!root.open||event.repeat)return;
    if(event.code==="Escape"){
      event.preventDefault();
      event.stopImmediatePropagation();
      close();return;
    }
    if(settled&&(event.code==="KeyE"||event.code==="Enter")){
      event.preventDefault();
      event.stopImmediatePropagation();
      serveNext();return;
    }
    if(event.code!=="KeyR"||!heroId)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    attemptStamp();
  },true);
  store.subscribe(()=>{
    if(heroId&&!store.state.shopCarts.some(cart=>cart.heroId===heroId))
      close();
  });
  return {open,close,get isOpen(){return root.open;}};
}
