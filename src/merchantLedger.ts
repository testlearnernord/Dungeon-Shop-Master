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
  readonly receipts: readonly SaleReceipt[];
  readonly visited: number;
  readonly arrivals: number;
  readonly departures: number;
  readonly relevantEvents: readonly WorldEvent[];
  readonly expeditions: readonly WorldEvent[];
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
  const expeditions = newlyBooked.filter(e =>
    (e.type === "level6-combat" && e.combatReplay) ||
    (e.type === "level7-exploration" && e.level7Replay));
  // Do not announce death, victory, loot, health or exploration outcome here.
  const safeTypes: ReadonlySet<WorldEvent["type"]> = new Set([
    "shop-arrival","shop-departure","shop-stay","influx",
    "level6-departure","level7-departure","food-shortage",
  ]);
  return {
    closingDay:before.day,morningDay:after.day,
    beforeGold:before.shopEconomy.balance,afterGold:after.shopEconomy.balance,
    overnightChange:after.shopEconomy.balance-before.shopEconomy.balance,
    bookedRevenue:receipts.reduce((sum,r)=>sum+r.revenue,0),
    soldUnits:receipts.reduce((sum,r)=>sum+r.quantity,0),
    receipts,
    visited:before.adventurers.filter(h=>h.status==="at-shop").length,
    arrivals:newlyBooked.filter(e=>e.type==="shop-arrival").length,
    departures:newlyBooked.filter(e=>e.type==="shop-departure").length,
    relevantEvents:newlyBooked,
    expeditions,
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
}

const labels=["The Reckoning","Goods & Receipts","The Living","Sealed Expeditions"] as const;
const motifs=["✧","◈","♜","⚔"] as const;

export function setupMerchantLedger(
  onNextMorning:()=>void,
  onWatch:(event:WorldEvent)=>boolean,
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
        <button type="button" class="ledger-skip" id="ledger-skip">Skip animations ↷</button>
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
            <div id="ledger-page-content" class="ledger-page-content"></div>
            <div class="ledger-paper-foot"><span>GALVIK'S LEDGER</span><span id="ledger-folio"></span></div>
          </div>
        </div>
      </div>
      <footer class="ledger-bottom">
        <div class="ledger-navigation">
          <button type="button" id="ledger-previous">← Previous page</button>
          <span id="ledger-pages">01 / 04</span>
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
    tile.append(node("span","ledger-metric-label",label),
      node("strong","ledger-metric-value",value),
      node("small","ledger-metric-sub",sub));
    return tile;
  }
  function line(label:string,value:string,tag=""):HTMLElement{
    const row=node("div","ledger-line");
    row.append(node("span","ledger-line-label",label),node("span","ledger-line-dots"),
      node("strong","ledger-line-value",value));
    if(tag)row.append(node("small","ledger-line-tag",tag));
    return row;
  }
  function renderPage():void{
    if(!summary)return;
    pages.textContent=String(page+1).padStart(2,"0")+" / 04";
    previous.disabled=page===0;
    next.disabled=page===3;
    heading.textContent=labels[page];
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
      content.append(line("Visitors at closing",String(summary.visited)));
      content.append(node("p","ledger-footnote",
        "Gold at dawn includes only transactions posted during the night. Daytime cashier payments were already in the closing balance. No coin is counted twice."));
      sound("coin");
    }else if(page===1){
      content.append(node("p","ledger-page-intro","What was taken, what was paid. The ledger remembers."));
      if(!summary.receipts.length)content.append(empty("No receipts were posted during this closing cycle."));
      else{
        const grouped=new Map<string,{units:number,revenue:number}>();
        for(const receipt of summary.receipts){
          const entry=grouped.get(receipt.itemName)??{units:0,revenue:0};
          entry.units+=receipt.quantity;entry.revenue+=receipt.revenue;
          grouped.set(receipt.itemName,entry);
        }
        content.append(node("h3","ledger-subhead","SALES BY GOOD"));
        for(const [item,value] of grouped)
          content.append(line(item,`${value.units} ×   ${gold(value.revenue)}`));
        content.append(node("h3","ledger-subhead","CUSTOMER RECEIPTS"));
        const scroll=node("div","ledger-receipts");
        for(const receipt of summary.receipts.slice(-40))
          scroll.append(line(`${receipt.heroName} · ${receipt.itemName} ×${receipt.quantity}`,
            "+"+gold(receipt.revenue)));
        content.append(scroll);
        if(summary.receipts.length>40)
          content.append(node("small","ledger-footnote","Showing the latest 40 receipts."));
      }
    }else if(page===2){
      content.append(node("p","ledger-page-intro",
        "They come with dreams of gold. Those who leave the door do not always return."));
      const metrics=node("div","ledger-metrics ledger-metrics-small");
      metrics.append(metric("AT THE SHOP",String(summary.visited),"Before closing"),
        metric("ARRIVALS",String(summary.arrivals),"Overnight"),
        metric("DEPARTURES",String(summary.departures),"Overnight"));
      content.append(metrics);
      content.append(node("h3","ledger-subhead","MOVEMENT THROUGH THE DEPTHS"));
      if(!summary.safeChronicle.length)content.append(empty("The corridors were quiet tonight."));
      else{
        const entries=node("div","ledger-chronicle");
        for(const event of summary.safeChronicle.slice(-35))
          entries.append(node("p","ledger-event",event.message));
        content.append(entries);
      }
      content.append(node("p","ledger-footnote",
        "Expedition results and the fate of the fighters stay sealed until you watch their records."));
    }else{
      content.append(node("p","ledger-page-intro",
        "Below the shop, steel meets stone. These records are sealed. Open one to witness its truth."));
      if(!summary.expeditions.length)
        content.append(empty("No new combat or exploration recordings were filed tonight."));
      else{
        for(const event of summary.expeditions){
          const card=node("article","ledger-record");
          card.append(node("span","ledger-record-seal","SEALED RECORD"),
            node("strong","ledger-record-title",
              (event.type==="level6-combat"?"LEVEL 6 · THE TROLL":"LEVEL 7 · THE DEPTHS")),
            node("span","ledger-record-meta",
              `Day ${event.day} · ${event.adventurerId??"Unnamed adventurer"}`));
          const watch=document.createElement("button");
          watch.type="button";
          watch.className="ledger-watch";
          watch.textContent="▶ WATCH EXPEDITION";
          watch.addEventListener("click",()=>{
            dialog.close();
            suspended=true;
            if(!onWatch(event)){
              suspended=false;
              dialog.showModal();
              heading.focus({preventScroll:true});
            }
          });
          card.append(watch);
          content.append(card);
        }
      }
      content.append(node("p","ledger-footnote",
        "WATCH opens a historical recording. It never re-rolls combat, grants loot, changes the merchant's gold or advances time."));
    }
    if(animationSkipped)content.classList.add("ledger-no-animation");
    else{
      content.classList.remove("ledger-no-animation","ledger-page-enter");
      void content.offsetWidth; // restart the parchment reveal on each new page
      content.classList.add("ledger-page-enter");
    }
  }
  function changePage(to:number):void{
    if(!summary||to<0||to>=labels.length||page===to)return;
    page=to;sound("page");renderPage();
  }
  next.addEventListener("click",()=>changePage(page+1));
  previous.addEventListener("click",()=>changePage(page-1));
  skip.addEventListener("click",()=>{
    animationSkipped=!animationSkipped;
    skip.textContent=animationSkipped?"Animations enabled? Click to restore":"Skip animations ↷";
    renderPage();
  });
  begin.addEventListener("click",()=>{
    if(!summary||suspended)return;
    dialog.close();
    summary=null;
    onNextMorning();
    restoreFocus?.focus({preventScroll:true});
    restoreFocus=null;
  });
  dialog.addEventListener("cancel",event=>event.preventDefault());
  dialog.addEventListener("keydown",event=>{
    if(event.code==="Escape"){event.preventDefault();return;}
    if(event.code==="ArrowRight"){event.preventDefault();changePage(page+1);}
    if(event.code==="ArrowLeft"){event.preventDefault();changePage(page-1);}
  });
  return {
    open(before,after){
      summary=summarizeLedger(before,after);
      page=0;
      suspended=false;
      restoreFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
      find<HTMLElement>("#ledger-volume").textContent=`DAY ${summary.closingDay} · ACCOUNTS CLOSED`;
      renderPage();
      if(!dialog.open)dialog.showModal();
      heading.focus({preventScroll:true});
    },
    close(){
      suspended=false;summary=null;
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
  };
}
