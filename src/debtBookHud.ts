import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { GameStore } from "./game/gameStore.ts";
import { ITEMS } from "./game/economy.ts";
import {itemIcon,uiIcon,goldIcon} from "./uiIcons.ts";
import { heroDisplayNames } from "./game/heroIdentity.ts";

/** The bedroom account book is the only merchant-facing credit register.
 * It reads, but never changes, the authoritative debt and credit events.
 * Transactions remain tied to hero IDs and persist on dead heroes.
 */
export function setupDebtBookHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,
):{open:()=>void;close:()=>void;readonly isOpen:boolean}{
  const dialog=document.createElement("dialog");
  dialog.id="debt-book-dialog";
  dialog.setAttribute("aria-labelledby","debt-book-title");
  dialog.innerHTML=`<div class="debt-book-pages">
    <header class="debt-book-heading">
      <div><small>GALVIK'S PRIVATE ACCOUNTS</small>
        <h2 id="debt-book-title">Book of Debts</h2>
        <p>Every favor has a price. Some debtors no longer have a pulse.</p>
      </div>
      <button type="button" id="debt-book-close" aria-label="Close the book">✕</button>
    </header>
    <div class="debt-book-totals" id="debt-book-totals"></div>
    <div class="debt-book-tools"><label for="debt-book-filter">Accounts</label>
      <select id="debt-book-filter">
        <option value="all">All outstanding</option>
        <option value="living">Living debtors</option>
        <option value="dead">Fallen debtors</option>
      </select></div>
    <div id="debt-book-entries" class="debt-book-entries"></div>
    <p class="debt-book-footnote">Credit is not payment. Gold enters the till only when a debt is actually settled. Repayments are not available yet.</p>
  </div>`;
  document.body.append(dialog);
  const totals=dialog.querySelector<HTMLElement>("#debt-book-totals")!;
  const entries=dialog.querySelector<HTMLElement>("#debt-book-entries")!;
  const filter=dialog.querySelector<HTMLSelectElement>("#debt-book-filter")!;
  const close=():void=>{if(dialog.open)dialog.close();};
  const money=(value:number)=>new Intl.NumberFormat("en-US").format(value)+"g";
  const render=():void=>{
    if(!dialog.open)return;
    const state=store.state;
    const heroes=new Map(state.adventurers.map(hero=>[hero.id,hero]));
    const displayNames=heroDisplayNames(state.adventurers);
    const total=state.shopDebts.reduce((sum,debt)=>sum+debt.outstandingGold,0);
    const dead=state.shopDebts.filter(debt=>heroes.get(debt.heroId)?.status==="dead");
    const badDebt=dead.reduce((sum,debt)=>sum+debt.outstandingGold,0);
    const summary=(name:string,value:string,caption:string)=>{
      const block=document.createElement("div");
      const label=document.createElement("span");label.textContent=name;
      const amount=document.createElement("strong");amount.textContent=value;if(value.endsWith("g"))amount.prepend(goldIcon());
      const detail=document.createElement("small");detail.textContent=caption;
      block.append(label,amount,detail);return block;
    };
    totals.replaceChildren(
      summary("Outstanding",money(total),"Recorded obligations, not gold"),
      summary("Debtors",String(state.shopDebts.length),"Unique heroes"),
      summary("Fallen",money(badDebt),dead.length+" uncollectable for now"),
    );
    const filtered=state.shopDebts
      .filter(debt=>filter.value==="all"||
        (filter.value==="dead")===(heroes.get(debt.heroId)?.status==="dead"))
      .slice().sort((a,b)=>b.outstandingGold-a.outstandingGold||a.heroId.localeCompare(b.heroId));
    entries.replaceChildren();
    if(!filtered.length){
      const blank=document.createElement("p");
      blank.className="debt-book-empty";
      blank.textContent=state.shopDebts.length===0
        ?"No debts entered. Galvik is either rich or insufficiently gullible."
        :"No debtors match this page.";
      entries.append(blank);return;
    }
    for(const debt of filtered){
      const hero=heroes.get(debt.heroId);
      const section=document.createElement("details");
      section.className="debt-book-account";
      const heading=document.createElement("summary");
      const identity=document.createElement("span");
      const display=document.createElement("strong");
      display.textContent=displayNames.get(debt.heroId)??hero?.name??debt.heroId;
      const condition=document.createElement("small");
      const isDead=hero?.status==="dead";
      condition.textContent=isDead?"FALLEN · DEBT UNPAID":"ACTIVE · DEBT UNPAID";
      condition.className=isDead?"debt-book-dead":"";
      identity.append(display,condition);
      const balance=document.createElement("b");balance.textContent=money(debt.outstandingGold);balance.prepend(goldIcon());
      heading.append(identity,balance);
      section.append(heading);
      const history=document.createElement("ol");
      const creditEvents=state.events.filter(event=>
        event.type==="shop-credit"&&event.adventurerId===debt.heroId);
      for(const event of creditEvents){
        const item=ITEMS.find(product=>product.id===event.itemId);
        const line=document.createElement("li");
        const detail=document.createElement("span");
        detail.textContent="Day "+event.day+" · "+(item?.name??event.itemId??"Supplies")+
          " ×"+(event.quantity??1);
        const cost=document.createElement("strong");cost.textContent=money(event.debtGold??0);cost.prepend(goldIcon());
        line.append(item?itemIcon(item.id,"ui-item-icon"):uiIcon("receipt"),detail,cost);
        history.append(line);
      }
      if(!creditEvents.length){
        const note=document.createElement("li");note.textContent="Balance carried from an earlier record.";
        history.append(note);
      }
      section.append(history);entries.append(section);
    }
  };
  const open=():void=>{
    if(dialog.open||document.querySelector("dialog[open]"))return;
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    camera.detachControl();
    dialog.showModal();render();
  };
  filter.addEventListener("change",render);
  dialog.querySelector<HTMLButtonElement>("#debt-book-close")!.addEventListener("click",close);
  dialog.addEventListener("close",()=>{camera.attachControl(canvas,true);canvas.focus();});
  store.subscribe(render);
  return {open,close,get isOpen(){return dialog.open;}};
}
