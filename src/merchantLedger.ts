import {goldIcon,itemIcon,uiIcon,setIconButtonLabel} from "./uiIcons.ts";
import {restoreLedgerView} from "./ledgerViewState.ts";
import type { GameState, WorldEvent } from "./game/gameState.ts";
import { ITEMS } from "./game/economy.ts";
import type { SaleReceipt } from "./game/saleView.ts";

/**
 * The merchant's book is a read-only projection of authoritative events.
 * The transition from day N to N+1 happens outside this module, exactly once.
 */
export interface LedgerSummary {
  readonly closingDay: number;
  readonly morningDay: number;
  readonly beforeGold: number;
  readonly afterGold: number;
  readonly overnightChange: number;
  readonly bookedRevenue: number;
  readonly soldUnits: number;
  /** Loaned goods are a receivable, NOT sales revenue or gold in the till. */
  readonly newCreditGold: number;
  readonly outstandingCreditGold: number;
  readonly credits: readonly WorldEvent[];
  /** Physical goods Galvik purchased from returning adventurers. */
  readonly buybacks: readonly WorldEvent[];
  readonly buybackCost: number;
  readonly receipts: readonly SaleReceipt[];
  readonly visited: number;
  readonly arrivals: number;
  readonly departures: number;
  readonly relevantEvents: readonly WorldEvent[];
  readonly safeChronicle: readonly WorldEvent[];
}

export function summarizeLedger(before: GameState, after: GameState): LedgerSummary {
  if (after.day !== before.day + 1) throw new RangeError("A ledger requires one settled day transition.");
  const priorIds = new Set(before.events.map(event => event.id));
  const newlyBooked = after.events.filter(event => !priorIds.has(event.id));
  // Manual purchases are booked on the closing day. Automatic cart settlement
  // is committed on the *new* day. Both belong to the same closing ledger.
  const sales = [...before.events.filter(e => e.day === before.day && e.type === "sale"),
    ...newlyBooked.filter(e => e.type === "sale")];
  const credits = [
    ...before.events.filter(e=>e.day===before.day&&e.type==="shop-credit"),
    ...newlyBooked.filter(e=>e.type==="shop-credit"),
  ];
  const buybacks = [
    ...before.events.filter(e=>e.day===before.day&&e.type==="hero-buyback"),
    ...newlyBooked.filter(e=>e.type==="hero-buyback"),
  ];
  const outstandingCreditGold=after.shopDebts.reduce(
    (sum,debt)=>sum+debt.outstandingGold,0);
  const names = new Map(after.adventurers.map(h => [h.id,h.name]));
  const receipts = sales.flatMap((event): SaleReceipt[] => {
    if (!event.itemId || !event.adventurerId || event.quantity === undefined ||
        event.revenue === undefined) return [];
    const item = ITEMS.find(i => i.id === event.itemId);
    if (!item) return [];
    return [{
      id:event.id,day:event.day,heroId:event.adventurerId,
      heroName:names.get(event.adventurerId) ?? event.adventurerId,
      itemId:item.id,itemName:item.name,
      quantity:event.quantity,revenue:event.revenue,
    }];
  });
  // Do not announce death, victory, loot, health or exploration outcome here.
  const safeTypes: ReadonlySet<WorldEvent["type"]> = new Set([
    "shop-arrival","shop-departure","shop-stay","influx",
  ]);
  return {
    closingDay:before.day,morningDay:after.day,
    beforeGold:before.shopEconomy.balance,afterGold:after.shopEconomy.balance,
    overnightChange:after.shopEconomy.balance-before.shopEconomy.balance,
    bookedRevenue:receipts.reduce((sum,r)=>sum+r.revenue,0),
    soldUnits:receipts.reduce((sum,r)=>sum+r.quantity,0),
    newCreditGold:credits.reduce((sum,event)=>sum+(event.debtGold??0),0),
    outstandingCreditGold,credits,buybacks,
    buybackCost:buybacks.reduce((sum,event)=>sum+(event.cost??0),0),receipts,
    visited:before.adventurers.filter(h=>h.status==="at-shop").length,
    arrivals:newlyBooked.filter(e=>e.type==="shop-arrival").length,
    departures:newlyBooked.filter(e=>e.type==="shop-departure").length,
    relevantEvents:newlyBooked,
    safeChronicle:newlyBooked.filter(e=>safeTypes.has(e.type)),
  };
}

export interface MerchantLedger {
  open(before: GameState, after: GameState): void;
  close(): void;
  get isOpen(): boolean;
  /** True while a spectator recording is active and the ledger is suspended. */
  get isSuspended(): boolean;
  resumeIfReady(): void;
  /** Restore an unfinished book after reload, without another day tick. */
  resumePending(current:GameState):boolean;
}

const LEDGER_SESSION_KEY="dungeon-shop:pending-merchant-ledger";
const labels=["The Reckoning","Goods & Receipts"] as const;
const motifs=["✧","◈"] as const;

export function setupMerchantLedger(
  onNextMorning:()=>void,
  _onWatch:(event:WorldEvent)=>boolean,
  soundEnabled:()=>boolean=()=>false,
  soundVolume:()=>number=()=>0,
):MerchantLedger {
  const dialog=document.createElement("dialog");
  dialog.id="merchant-ledger";
  dialog.setAttribute("aria-labelledby","ledger-heading");
  dialog.innerHTML=`
    <div class="ledger-shell">
      <header class="ledger-top">
        <span class="ledger-brand"><span class="ledger-brand-mark">✦</span> GALVIK'S PRIVATE ACCOUNTS <small>THE FIFTH DESCENT</small></span>
        <span class="ledger-volume" id="ledger-volume"></span>
        <button type="button" class="ledger-skip" id="ledger-skip"
          aria-pressed="false" title="Turn ledger page animations on or off">Skip animations</button>
      </header>
      <div class="ledger-interior">
        <nav class="ledger-index" aria-label="Ledger chapters">
          <div class="ledger-stamp">G<br>V</div>
          <div class="ledger-index-label">THE BOOK OF DEBTS</div>
          <div class="ledger-chapters" id="ledger-chapters"></div>
          <span class="ledger-index-foot">ALL DEBTS ARE REMEMBERED.</span>
        </nav>
        <div class="ledger-paper">
          <div class="ledger-paper-inner">
            <div class="ledger-page-overline" id="ledger-overline"></div>
            <h2 id="ledger-heading" tabindex="-1"></h2>
            <div class="ledger-ornament">✦ <span>❧</span> ✦</div>
            <div id="ledger-page-content" class="ledger-page-content" role="region" aria-labelledby="ledger-heading"></div>
            <div class="ledger-paper-foot"><span>GALVIK'S LEDGER</span><span id="ledger-folio"></span></div>
          </div>
        </div>
      </div>
      <footer class="ledger-bottom">
        <div class="ledger-navigation">
          <button type="button" id="ledger-previous">← Previous page</button>
          <span id="ledger-pages" aria-live="polite">01 / 02</span>
          <button type="button" id="ledger-next">Next page →</button>
        </div>
        <button type="button" id="ledger-begin" class="ledger-begin">☀ Begin Next Day <span>→</span></button>
      </footer>
    </div>`;
  document.body.append(dialog);
  const find=<T extends HTMLElement>(selector:string):T=>{
    const result=dialog.querySelector<T>(selector);
    if(!result)throw Error("Missing merchant ledger control: "+selector);
    return result;
  };
  const content=find<HTMLDivElement>("#ledger-page-content");
  const chapters=find<HTMLDivElement>("#ledger-chapters");
  const heading=find<HTMLElement>("#ledger-heading");
  const overline=find<HTMLElement>("#ledger-overline");
  const folio=find<HTMLElement>("#ledger-folio");
  const pages=find<HTMLElement>("#ledger-pages");
  const next=find<HTMLButtonElement>("#ledger-next");
  const previous=find<HTMLButtonElement>("#ledger-previous");
  const begin=find<HTMLButtonElement>("#ledger-begin");
  const skip=find<HTMLButtonElement>("#ledger-skip");
  let summary:LedgerSummary|null=null;
  let page=0;
  let suspended=false;
  let restoreFocus:HTMLElement|null=null;
  let animationSkipped=false;
  let soundContext:AudioContext|null=null;
  /** Snapshot the accounting boundary once; navigating the book must not
   * require rerunning a day or inventing a pre-sleep GameState. */
  let pendingBoundary:{
    seed:number;day:number;beforeGold:number;visitorCount:number;
  }|null=null;
  function persistPending():void {
    if(!pendingBoundary||!summary)return;
    try{
      sessionStorage.setItem(LEDGER_SESSION_KEY,JSON.stringify({
        ...pendingBoundary,
        page,animationSkipped,
      }));
    }catch{ /* Session recovery is best effort if browser storage is denied. */ }
  }
  function syncAnimationToggle():void{
    setIconButtonLabel(skip,animationSkipped?"Enable animations":"Skip animations");
    skip.setAttribute("aria-pressed",String(animationSkipped));
    skip.title=animationSkipped?"Restore page animations":"Disable page animations";
  }
  function clearPending():void {
    try{sessionStorage.removeItem(LEDGER_SESSION_KEY);}catch{ /* storage unavailable */ }
  }

  function sound(kind:"page"|"coin"):void {
    if(!soundEnabled())return;
    try{
      soundContext??=new AudioContext();
      if(soundContext.state==="suspended")void soundContext.resume();
      const oscillator=soundContext.createOscillator();
      const gain=soundContext.createGain();
      const start=soundContext.currentTime;
      oscillator.type=kind==="coin"?"sine":"triangle";
      oscillator.frequency.setValueAtTime(kind==="coin"?740:170,start);
      oscillator.frequency.exponentialRampToValueAtTime(kind==="coin"?1080:95,start+0.13);
      gain.gain.setValueAtTime(Math.max(0.001,Math.min(0.045,soundVolume()*0.07)),start);
      gain.gain.exponentialRampToValueAtTime(0.001,start+0.16);
      oscillator.connect(gain).connect(soundContext.destination);
      oscillator.start(start);
      oscillator.stop(start+0.17);
    }catch{ /* SFX are optional where WebAudio is unavailable. */ }
  }
  const node=(tag:string,className="",value=""):HTMLElement=>{
    const e=document.createElement(tag);
    if(className)e.className=className;
    e.textContent=value;
    return e;
  };
  const gold=(value:number):string=>new Intl.NumberFormat("en-US").format(value)+"g";
  function empty(message:string):HTMLElement {
    return node("p","ledger-empty",message);
  }
  function metric(label:string,value:string,sub:string):HTMLElement {
    const tile=node("div","ledger-metric");
    const valueNode=node("strong","ledger-metric-value",value);
    if(/g$/.test(value))valueNode.prepend(goldIcon());
    tile.append(node("span","ledger-metric-label",label),
      valueNode,node("small","ledger-metric-sub",sub));
    return tile;
  }
  function line(label:string,value:string,tag=""):HTMLElement{
    const row=node("div","ledger-line");
    const money=node("strong","ledger-line-value",value);
    if(/g$/.test(value))money.prepend(goldIcon());
    row.append(node("span","ledger-line-label",label),node("span","ledger-line-dots"),
      money);
    if(tag)row.append(node("small","ledger-line-tag",tag));
    return row;
  }
  function itemLedgerLine(itemId:string,label:string,value:string,tag=""):HTMLElement{
    const row=line(label,value,tag);
    const caption=row.querySelector<HTMLElement>(".ledger-line-label");
    if(caption){
      caption.classList.add("ledger-item-label");
      caption.prepend(itemIcon(itemId,"ledger-receipt-item-icon"));
    }
    return row;
  }
  function renderPage():void{
    if(!summary)return;
    pages.textContent=String(page+1).padStart(2,"0")+" / "+String(labels.length).padStart(2,"0");
    previous.disabled=page===0;
    next.disabled=page===labels.length-1;
    heading.textContent=labels[page];
    syncAnimationToggle();
    overline.textContent=`NIGHT ${summary.closingDay}  /  LEAVING DAY ${summary.morningDay}`;
    folio.textContent="FOLIO "+String(page+1).padStart(3,"0");
    chapters.replaceChildren(...labels.map((label,index)=>{
      const button=document.createElement("button");
      button.type="button";
      button.className="ledger-chapter"+(index===page?" active":"");
      button.setAttribute("aria-current",index===page?"page":"false");
      button.textContent=`${motifs[index]}  ${String(index+1).padStart(2,"0")}   ${label}`;
      button.addEventListener("click",()=>changePage(index));
      return button;
    }));
    content.replaceChildren();
    if(page===0){
      content.append(node("p","ledger-page-intro",
        "The candles burn low. Every coin has a story. Most have an owner who will never return."));
      const metrics=node("div","ledger-metrics");
      metrics.append(
        metric("GOLD AT CLOSING",gold(summary.beforeGold),"Before overnight settlement"),
        metric("GOLD AT DAWN",gold(summary.afterGold),"Authoritative treasury"),
        metric("OVERNIGHT CHANGE",(summary.overnightChange>=0?"+":"")+gold(summary.overnightChange),
          "Excludes sales paid earlier in the day"));
      content.append(metrics);
      content.append(node("h3","ledger-subhead","THE FINAL TALLY"));
      content.append(line("Receipts entered",String(summary.receipts.length)));
      content.append(line("Goods sold",String(summary.soldUnits)+" units"));
      content.append(line("Recorded sales",gold(summary.bookedRevenue),"Includes daytime manual sales"));
      content.append(line("Dungeon goods bought",gold(summary.buybackCost),"Gold paid to returning adventurers"));
      content.append(line("New goods issued on credit",gold(summary.newCreditGold),"No gold received"));
      content.append(line("Total outstanding hero debt",gold(summary.outstandingCreditGold),"Unpaid receivables"));
      content.append(line("Visitors at closing",String(summary.visited)));
      content.append(node("p","ledger-footnote",
        "Gold at dawn includes only transactions posted during the night. Daytime cashier payments were already in the closing balance. No coin is counted twice."));
      sound("coin");
    }else if(page===1){
      content.append(node("p","ledger-page-intro","What was taken, what was paid. The ledger remembers."));
      if(!summary.receipts.length)content.append(empty("No receipts were posted during this closing cycle."));
      else{
        const grouped=new Map<string,{name:string;units:number;revenue:number}>();
        for(const receipt of summary.receipts){
          const entry=grouped.get(receipt.itemId)??{
            name:receipt.itemName,units:0,revenue:0};
          entry.units+=receipt.quantity;entry.revenue+=receipt.revenue;
          grouped.set(receipt.itemId,entry);
        }
        content.append(node("h3","ledger-subhead","SALES BY GOOD"));
        for(const [id,value] of grouped)
          content.append(itemLedgerLine(id,value.name,
            `${value.units} ×   ${gold(value.revenue)}`));
        content.append(node("h3","ledger-subhead","CUSTOMER RECEIPTS"));
        const scroll=node("div","ledger-receipts");
        for(const receipt of summary.receipts.slice(-40))
          scroll.append(itemLedgerLine(receipt.itemId,
            `${receipt.heroName} · ${receipt.itemName} ×${receipt.quantity}`,
            "+"+gold(receipt.revenue)));
        content.append(scroll);
        if(summary.receipts.length>40)
          content.append(node("small","ledger-footnote","Showing the latest 40 receipts."));
      }
      if(summary.buybacks.length){
        content.append(node("h3","ledger-subhead","ADVENTURER BUYBACK · PAID GOODS"));
        const purchaseRows=node("div","ledger-receipts");
        for(const event of summary.buybacks.slice(-30)){
          const item=ITEMS.find(entry=>entry.id===event.itemId);
          const description=event.adventurerId??"Unknown adventurer";
          purchaseRows.append(item&&event.itemId?itemLedgerLine(
            event.itemId,description+" · "+item.name,
            "-"+gold(event.cost??0),"PURCHASED"):line(
            description,"-"+gold(event.cost??0),"PURCHASED"));
        }
        content.append(purchaseRows);
      }
      if(summary.credits.length){
        content.append(node("h3","ledger-subhead","ITEMS LOANED · GALVIK'S DEBT BOOK"));
        const creditRows=node("div","ledger-receipts");
        for(const event of summary.credits.slice(-30)){
          const item=ITEMS.find(entry=>entry.id===event.itemId);
          creditRows.append(item&&event.itemId?itemLedgerLine(
            event.itemId,
            (event.message || event.adventurerId || "Unknown")+" · "+item.name,
            gold(event.debtGold??0),"UNPAID"):line(
            event.message || event.adventurerId || "Unknown",
            gold(event.debtGold??0),"UNPAID"));
        }
        content.append(creditRows);
      }
    }
    if(animationSkipped){
      content.classList.add("ledger-no-animation");
      content.classList.remove("ledger-page-enter");
    }else{
      content.classList.remove("ledger-no-animation","ledger-page-enter");
      void content.offsetWidth; // restart the parchment reveal on each new page
      content.classList.add("ledger-page-enter");
    }
  }
  function changePage(to:number):void{
    if(!summary||to<0||to>=labels.length||page===to)return;
    page=to;
    renderPage();
    // A long register can scroll the whole modal; the next folio should
    // open at its heading, not halfway down the previous one.
    dialog.scrollTop=0;
    persistPending();
    sound("page");
    heading.focus({preventScroll:true});
  }
  next.addEventListener("click",()=>changePage(page+1));
  previous.addEventListener("click",()=>changePage(page-1));
  skip.addEventListener("click",()=>{
    animationSkipped=!animationSkipped;
    syncAnimationToggle();
    // Do not destroy and recreate the current page: scroll position,
    // selected text, and replay buttons should all remain in place.
    content.classList.toggle("ledger-no-animation",animationSkipped);
    if(animationSkipped)content.classList.remove("ledger-page-enter");
    persistPending();
  });
  begin.addEventListener("click",()=>{
    if(!summary||suspended)return;
    dialog.close();
    summary=null;
    pendingBoundary=null;
    clearPending();
    onNextMorning();
    restoreFocus?.focus({preventScroll:true});
    restoreFocus=null;
  });
  dialog.addEventListener("cancel",event=>event.preventDefault());
  dialog.addEventListener("keydown",event=>{
    if(event.code==="Escape"){event.preventDefault();return;}
    if(event.code==="ArrowRight"){event.preventDefault();changePage(page+1);}
    if(event.code==="ArrowLeft"){event.preventDefault();changePage(page-1);}
    if(event.code==="Home"){event.preventDefault();changePage(0);}
    if(event.code==="End"){event.preventDefault();changePage(labels.length-1);}
  });
  return {
    open(before,after){
      summary=summarizeLedger(before,after);
      pendingBoundary={
        seed:after.seed,day:after.day,
        beforeGold:before.shopEconomy.balance,
        visitorCount:summary.visited,
      };
      page=0;
      suspended=false;
      restoreFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
      find<HTMLElement>("#ledger-volume").textContent=`DAY ${summary.closingDay} · ACCOUNTS CLOSED`;
      persistPending();
      renderPage();
      if(!dialog.open)dialog.showModal();
      heading.focus({preventScroll:true});
    },
    close(){
      suspended=false;summary=null;
      pendingBoundary=null;
      clearPending();
      if(dialog.open)dialog.close();
    },
    get isOpen(){return dialog.open;},
    get isSuspended(){return suspended;},
    resumeIfReady(){
      if(!suspended||!summary)return;
      suspended=false;
      if(!dialog.open)dialog.showModal();
      heading.focus({preventScroll:true});
    },
    resumePending(current){
      let data:unknown;
      try{
        const raw=sessionStorage.getItem(LEDGER_SESSION_KEY);
        if(!raw)return false;
        data=JSON.parse(raw);
      }catch{return false;}
      if(!data||typeof data!=="object")return false;
      const pending=data as {
        seed?:unknown;day?:unknown;beforeGold?:unknown;visitorCount?:unknown;
        page?:unknown;animationSkipped?:unknown;
      };
      if(pending.seed!==current.seed||pending.day!==current.day||
         !Number.isSafeInteger(pending.beforeGold)||!Number.isSafeInteger(pending.visitorCount)||
         current.day<2){
        clearPending();
        return false;
      }
      // Reconstruct the transaction boundary using the saved events. The
      // treasury and visitor count before sleeping are in a tiny tab-scoped
      // marker; nothing here mutates persistent GameState.
      const prior:GameState={
        ...current,day:current.day-1,
        events:current.events.filter(e=>e.day<current.day),
        shopEconomy:{...current.shopEconomy,balance:pending.beforeGold as number},
      };
      // Construct the verified folio BEFORE rendering it. The old code
      // called open() here, briefly painting post-night hero information
      // from a reconstructed state before restoring the safe snapshot.
      const rebuilt=summarizeLedger(prior,current);
      summary={...rebuilt,visited:pending.visitorCount as number};
      pendingBoundary={
        seed:current.seed,day:current.day,
        beforeGold:pending.beforeGold as number,
        visitorCount:pending.visitorCount as number,
      };
      const view=restoreLedgerView(pending.page,pending.animationSkipped,labels.length);
      page=view.page;
      animationSkipped=view.animationSkipped;
      suspended=false;
      restoreFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
      find<HTMLElement>("#ledger-volume").textContent=`DAY ${summary.closingDay} · ACCOUNTS CLOSED`;
      persistPending();
      renderPage();
      if(!dialog.open)dialog.showModal();
      heading.focus({preventScroll:true});
      return true;
    },
  };
}
