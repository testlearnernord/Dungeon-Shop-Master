import {goldIcon,itemIcon,uiIcon,type InterfaceIcon} from "./uiIcons.ts";
import {restoreLedgerView} from "./ledgerViewState.ts";
import {sealedExpeditionDossiers,sealedExpeditionCounts,
  type SealedExpeditionDossier} from "./ledgerSealedExpeditions.ts";
import {portraitCssFrame} from "./game/portraitAtlas.ts";
import {buildLedgerHeroChronicle,type LedgerHeroChronicle,type LedgerHeroLine,type LedgerHeroKind} from "./ledgerHeroChronicle.ts";
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
  readonly receipts: readonly SaleReceipt[];
  readonly visited: number;
  readonly arrivals: number;
  readonly departures: number;
  readonly relevantEvents: readonly WorldEvent[];
  readonly expeditions: readonly WorldEvent[];
  readonly dossiers:readonly SealedExpeditionDossier[];
  readonly safeChronicle: readonly WorldEvent[];
  readonly heroes:LedgerHeroChronicle;
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
  const expeditions = newlyBooked.filter(e =>
    (e.type === "level6-combat" && e.combatReplay) ||
    (e.type === "level7-exploration" && e.level7Replay));
  // Do not announce death, victory, loot, health or exploration outcome here.
  const safeTypes: ReadonlySet<WorldEvent["type"]> = new Set([
    "shop-arrival","shop-departure","shop-stay","influx",
    "level6-departure","level7-departure",
  ]);
  return {
    closingDay:before.day,morningDay:after.day,
    beforeGold:before.shopEconomy.balance,afterGold:after.shopEconomy.balance,
    overnightChange:after.shopEconomy.balance-before.shopEconomy.balance,
    bookedRevenue:receipts.reduce((sum,r)=>sum+r.revenue,0),
    soldUnits:receipts.reduce((sum,r)=>sum+r.quantity,0),
    newCreditGold:credits.reduce((sum,event)=>sum+(event.debtGold??0),0),
    outstandingCreditGold,credits,receipts,
    visited:before.adventurers.filter(h=>h.status==="at-shop").length,
    arrivals:newlyBooked.filter(e=>e.type==="shop-arrival").length,
    departures:newlyBooked.filter(e=>e.type==="shop-departure").length,
    relevantEvents:newlyBooked,
    expeditions,
    dossiers:sealedExpeditionDossiers(before,after,expeditions),
    safeChronicle:newlyBooked.filter(e=>safeTypes.has(e.type)),
    heroes:buildLedgerHeroChronicle(before,after,sales,credits,newlyBooked),
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
          <span id="ledger-pages" aria-live="polite">01 / 04</span>
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
        heroes:summary.heroes,
        dossiers:summary.dossiers,
      }));
    }catch{ /* Session recovery is best effort if browser storage is denied. */ }
  }
  function syncAnimationToggle():void{
    skip.textContent=animationSkipped?"Enable animations":"Skip animations";
    skip.setAttribute("aria-pressed",String(animationSkipped));
    skip.title=animationSkipped?"Restore page animations":"Disable page animations";
  }
  /** Untrusted tab storage never gets to insert markup or unbounded arrays. */
  function restoreHeroChronicle(value:unknown):LedgerHeroChronicle|null{
    if(!value||typeof value!=="object")return null;
    const v=value as Partial<LedgerHeroChronicle>;
    const acceptable=(rows:unknown):rows is LedgerHeroLine[]=>
      Array.isArray(rows)&&rows.length<=150&&rows.every(entry=>
        entry!==null&&typeof entry==="object"&&
        typeof entry.id==="string"&&entry.id.length<=60&&
        typeof entry.name==="string"&&entry.name.length<=120&&
        typeof entry.label==="string"&&entry.label.length<=100&&
        typeof entry.explanation==="string"&&entry.explanation.length<=200&&
        ["tank","DPS","healer"].includes(entry.role)&&
        Object.prototype.hasOwnProperty.call(heroKindIcon,entry.kind)&&
        Number.isSafeInteger(entry.level)&&entry.level>=1&&
        Number.isSafeInteger(entry.portrait)&&entry.portrait>=0&&entry.portrait<25&&
        Number.isSafeInteger(entry.paidGold)&&entry.paidGold>=0&&
        Number.isSafeInteger(entry.soldUnits)&&entry.soldUnits>=0&&
        Number.isSafeInteger(entry.creditGold)&&entry.creditGold>=0&&
        Array.isArray(entry.goods)&&entry.goods.length<=8&&
        entry.goods.every((good:unknown)=>!!good&&typeof good==="object"&&
          typeof (good as {id?:unknown}).id==="string"&&
          ITEMS.some(item=>item.id===(good as {id:string}).id)&&
          Number.isSafeInteger((good as {quantity?:unknown}).quantity)&&
          (good as {quantity:number}).quantity>0));
    if(!acceptable(v.lines)||!acceptable(v.remembered))return null;
    for(const key of ["rememberedTotal","knownShopVisitors","payingHeroes",
      "sealedRecords","arrivals","departures"] as const){
      const n=v[key];
      if(!Number.isSafeInteger(n)||typeof n!=="number"||n<0||n>100000)return null;
    }
    return v as LedgerHeroChronicle;
  }
  /** Use only snapshot headers matching the actual saved replay events.
   * On legacy markers, with no pre-night snapshot, hide levels rather than
   * display post-combat XP / level changes as previously known facts.
   */
  function restoreSealedDossiers(
    raw:unknown,events:readonly WorldEvent[],
  ):readonly SealedExpeditionDossier[]|null{
    if(!Array.isArray(raw)||raw.length!==events.length||raw.length>200)
      return null;
    const valid=raw.every((entry:unknown,index:number)=>{
      if(!entry||typeof entry!=="object")return false;
      const d=entry as Partial<SealedExpeditionDossier>;
      const event=events[index];
      const isCombat=event.type==="level6-combat";
      return d.recordId===event.id&&
        d.heroId===(event.adventurerId??null)&&
        d.day===event.day&&
        d.kind===(isCombat?"combat":"exploration")&&
        d.floor===(isCombat?6:7)&&
        d.title===(isCombat?"THE CAVE TROLL":"UNCHARTED DEPTHS")&&
        d.category===(isCombat?"COMBAT RECORDING":"EXPLORATION RECORDING")&&
        typeof d.heroName==="string"&&d.heroName.length<=120&&
        (d.role===null||d.role==="tank"||d.role==="DPS"||d.role==="healer")&&
        (d.knownLevel===null||
          (Number.isSafeInteger(d.knownLevel)&&typeof d.knownLevel==="number"&&
           d.knownLevel>=1&&d.knownLevel<=10000))&&
        (d.portrait===null||
          (Number.isInteger(d.portrait)&&typeof d.portrait==="number"&&
           d.portrait>=0&&d.portrait<25));
    });
    return valid?raw as SealedExpeditionDossier[]:null;
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
  const heroKindIcon:Record<LedgerHeroKind,InterfaceIcon>={
    sealed:"lock",descended:"arrow-down",arrived:"arrow-up",
    departed:"arrow-right",stayed:"shop",walkout:"arrow-right",
    shop:"shop",newcomer:"spark",traded:"receipt",fallen:"skull",
  };
  const heroKindDescription:Record<LedgerHeroKind,string>={
    sealed:"Sealed record",descended:"Descent",arrived:"Arrival",
    departed:"Departure",stayed:"Staying",walkout:"Walkout",
    shop:"Shop visitor",newcomer:"New arrival",traded:"Customer",
    fallen:"Previously fallen",
  };
  function heroCard(hero:LedgerHeroLine):HTMLElement{
    const row=node("article","ledger-hero-card ledger-hero-"+hero.kind);
    row.dataset.heroId=hero.id;
    row.dataset.kind=hero.kind;
    const portrait=node("span","ledger-hero-portrait");
    portrait.style.backgroundImage="url('"+import.meta.env.BASE_URL+"assets/hero-portraits.webp')";
    Object.assign(portrait.style,portraitCssFrame(hero.portrait));
    portrait.setAttribute("role","img");
    portrait.setAttribute("aria-label",hero.name+" portrait");
    const body=node("div","ledger-hero-details");
    const title=node("strong","ledger-hero-name",hero.name);
    const role=node("span","ledger-hero-role",hero.role.toUpperCase()+" · LV "+hero.level);
    const byline=node("span","ledger-hero-byline",hero.explanation);
    body.append(title,role,byline);
    const status=node("span","ledger-hero-status");
    status.append(uiIcon(heroKindIcon[hero.kind],"ledger-hero-status-icon"),
      node("span","",hero.label));
    status.setAttribute("aria-label",heroKindDescription[hero.kind]+": "+hero.label);
    const right=node("div","ledger-hero-right");
    right.append(status);
    if(hero.soldUnits||hero.creditGold){
      const activity=node("div","ledger-hero-trade");
      if(hero.soldUnits){
        const amount=node("span","ledger-hero-amount",
          hero.soldUnits+" SOLD · "+gold(hero.paidGold));
        amount.prepend(uiIcon("shop","ledger-hero-mini-icon"));
        activity.append(amount);
      }
      if(hero.creditGold){
        const debt=node("span","ledger-hero-amount ledger-hero-credit",
          "CREDIT "+gold(hero.creditGold));
        debt.prepend(uiIcon("receipt","ledger-hero-mini-icon"));
        activity.append(debt);
      }
      right.append(activity);
    }
    if(hero.goods.length){
      const goods=node("div","ledger-hero-goods");
      goods.setAttribute("aria-label","Purchased goods");
      for(const good of hero.goods.slice(0,4)){
        const chip=node("span","ledger-hero-item",good.quantity+"×");
        const name=ITEMS.find(entry=>entry.id===good.id)?.name??good.id;
        chip.title=name+" · "+good.quantity+" purchased";
        chip.append(itemIcon(good.id,"ledger-hero-item-icon"));
        goods.append(chip);
      }
      if(hero.goods.length>4)
        goods.append(node("span","ledger-hero-extra","+"+(hero.goods.length-4)));
      right.append(goods);
    }
    row.append(portrait,body,right);
    return row;
  }
  function renderHeroChronicle(heroes:LedgerHeroChronicle):void{
    const overview=node("div","ledger-people-overview");
    const pill=(icon:InterfaceIcon,label:string,value:number):HTMLElement=>{
      const box=node("div","ledger-people-stat");
      const iconBox=node("span","ledger-people-stat-icon");
      iconBox.append(uiIcon(icon));
      const words=node("div","ledger-people-stat-words");
      words.append(node("strong","",String(value)),node("span","",label));
      box.append(iconBox,words);
      return box;
    };
    overview.append(
      pill("shop","SHOP AT CLOSING",heroes.knownShopVisitors),
      pill("arrow-up","NEW ARRIVALS",heroes.arrivals),
      pill("receipt","BUYERS",heroes.payingHeroes),
      pill("lock","SEALED RECORDS",heroes.sealedRecords),
    );
    content.append(overview);
    content.append(node("h3","ledger-subhead","THE ADVENTURERS · KNOWN MOVEMENTS"));
    if(!heroes.lines.length)content.append(empty("No confirmed shop activity was entered in the book."));
    else{
      const list=node("div","ledger-hero-list");
      list.setAttribute("aria-label","Adventurers and verified shop activity");
      list.append(...heroes.lines.map(heroCard));
      content.append(list);
      if(heroes.lines.length>10)
        content.append(node("p","ledger-hero-scroll-hint",
          heroes.lines.length+" names in the register · Scroll to read the full account"));
    }
    if(heroes.rememberedTotal){
      const memorial=node("section","ledger-hero-memorial");
      const heading=node("div","ledger-hero-memorial-heading");
      heading.append(uiIcon("skull"),node("strong","",
        "PREVIOUSLY FALLEN · "+heroes.rememberedTotal+" ON RECORD"));
      memorial.append(heading);
      const names=node("div","ledger-hero-memorial-names");
      names.append(...heroes.remembered.map(hero=>{
        const line=node("span","ledger-hero-memorial-name");
        line.append(uiIcon("skull"),node("span","",hero.name));
        return line;
      }));
      if(heroes.rememberedTotal>heroes.remembered.length)
        names.append(node("span","ledger-hero-memorial-extra",
          "+"+(heroes.rememberedTotal-heroes.remembered.length)+" more"));
      memorial.append(names);
      content.append(memorial);
    }
    const note=node("p","ledger-footnote ledger-hero-disclosure");
    note.append(uiIcon("lock"),
      document.createTextNode("New expedition results, injuries, loot and deaths remain sealed until their recordings are watched. The skull marks only losses known before this night."));
    content.append(note);
  }
  function renderSealedExpeditions():void{
    if(!summary)return;
    const dossiers=summary.dossiers;
    const counts=sealedExpeditionCounts(dossiers);
    const overview=node("div","ledger-sealed-overview");
    overview.setAttribute("aria-label","Sealed expedition archive counts");
    const tally=(icon:InterfaceIcon,value:number,label:string):HTMLElement=>{
      const item=node("div","ledger-sealed-stat");
      item.append(uiIcon(icon,"ledger-sealed-stat-icon"),
        node("strong","ledger-sealed-stat-value",String(value)),
        node("span","ledger-sealed-stat-label",label));
      return item;
    };
    overview.append(tally("lock",counts.total,"SEALED FILES"),
      tally("swords",counts.combat,"COMBAT"),
      tally("map",counts.exploration,"EXPLORATION"));
    content.append(overview);
    if(!dossiers.length){
      const vacant=node("div","ledger-sealed-empty");
      vacant.append(uiIcon("book"),
        node("strong","","NO NEW EXPEDITION RECORDS"),
        node("p","","When a dungeon expedition is recorded, its sealed account will be filed here."));
      content.append(vacant);
    }else{
      content.append(node("h3","ledger-subhead ledger-sealed-subhead",
        "THE UNOPENED FILES"));
      const list=node("div","ledger-sealed-list");
      list.setAttribute("aria-label","Sealed expedition recordings");
      dossiers.forEach((dossier,index)=>{
        // Preserve the exact authoritative replay event object in the
        // event handler. Dossier metadata intentionally contains no results.
        const event=summary!.expeditions[index];
        if(!event||event.id!==dossier.recordId)return;
        const card=node("article","ledger-record ledger-dossier ledger-dossier-"+dossier.kind);
        card.dataset.recordId=event.id;
        card.dataset.kind=dossier.kind;
        card.dataset.floor=String(dossier.floor);
        const emblem=node("div","ledger-dossier-emblem");
        emblem.append(uiIcon(dossier.kind==="combat"?"swords":"map"));
        emblem.setAttribute("aria-hidden","true");
        const body=node("div","ledger-dossier-body");
        const eye=node("div","ledger-dossier-eyebrow");
        eye.append(
          node("span","ledger-dossier-number",
            "FILE "+String(index+1).padStart(3,"0")),
          node("span","ledger-dossier-category",dossier.category));
        const title=node("strong","ledger-record-title",dossier.title);
        const location=node("div","ledger-dossier-location");
        location.append(uiIcon("arrow-down"),
          node("span","","FLOOR "+String(dossier.floor).padStart(2,"0")),
          node("span","ledger-dossier-date","· DAY "+dossier.day));
        const person=node("div","ledger-dossier-person");
        if(dossier.portrait!==null){
          const portrait=node("span","ledger-dossier-portrait");
          portrait.style.backgroundImage="url('"+import.meta.env.BASE_URL+
            "assets/hero-portraits.webp')";
          Object.assign(portrait.style,portraitCssFrame(dossier.portrait));
          portrait.setAttribute("role","img");
          portrait.setAttribute("aria-label",dossier.heroName+" portrait");
          person.append(portrait);
        }else{
          const unknown=node("span","ledger-dossier-portrait ledger-dossier-unknown");
          unknown.append(uiIcon("users"));
          person.append(unknown);
        }
        const name=node("span","ledger-dossier-person-name",dossier.heroName);
        const identity=node("span","ledger-dossier-person-role",
          [dossier.role?.toUpperCase(),
            dossier.knownLevel===null?null:"LV "+dossier.knownLevel]
            .filter(Boolean).join(" · ")||"IDENTITY UNRECORDED");
        const personDetails=node("div","ledger-dossier-person-details");
        personDetails.append(name,identity);
        person.append(personDetails);
        body.append(eye,title,location,person);
        const side=node("div","ledger-dossier-side");
        const seal=node("div","ledger-record-seal");
        seal.append(uiIcon("lock"),node("span","","SEALED RECORD"));
        const reveal=node("p","ledger-dossier-disclosure",
          "Fate, injuries and spoils are unknown until observed.");
        const watch=document.createElement("button");
        watch.type="button";
        watch.className="ledger-watch";
        watch.append(uiIcon("play"),node("span","","WATCH RECORDING"));
        watch.setAttribute("aria-label",
          "Watch "+dossier.heroName+"'s floor "+dossier.floor+
          " "+dossier.kind+" recording");
        watch.addEventListener("click",()=>{
          dialog.close();
          suspended=true;
          if(!onWatch(event)){
            suspended=false;
            dialog.showModal();
            heading.focus({preventScroll:true});
          }
        });
        side.append(seal,reveal,watch);
        card.append(emblem,body,side);
        list.append(card);
      });
      content.append(list);
    }
    const note=node("p","ledger-footnote ledger-sealed-footnote");
    note.append(uiIcon("lock"),
      document.createTextNode(
        "WATCH replays the committed history. It cannot change combat, award items, add gold or advance the day. Outcomes remain sealed until witnessed."));
    content.append(note);
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
      if(summary.credits.length){
        content.append(node("h3","ledger-subhead","ITEMS LOANED · GALVIK'S DEBT BOOK"));
        const creditRows=node("div","ledger-receipts");
        for(const event of summary.credits.slice(-30)){
          const item=ITEMS.find(entry=>entry.id===event.itemId);
          creditRows.append(line(
            (event.message || event.adventurerId || "Unknown")+" · "+
              (item?.name??event.itemId??"Item"),
            gold(event.debtGold??0),"UNPAID"));
        }
        content.append(creditRows);
      }
    }else if(page===2){
      content.append(node("p","ledger-page-intro",
        "Every face has a price, every journey a risk. This page records what Galvik actually knows."));
      renderHeroChronicle(summary.heroes);
    }else{
      content.append(node("p","ledger-page-intro",
        "Every sealed file holds a journey below the fifth floor. Break the seal to witness its truth."));
      renderSealedExpeditions();
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
        heroes?:unknown;dossiers?:unknown;
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
      const restored=restoreHeroChronicle(pending.heroes);
      const restoredDossiers=restoreSealedDossiers(pending.dossiers,rebuilt.expeditions);
      // Historical or corrupt markers lack a pre-sleep snapshot. Do not
      // infer known casualties or earned levels from the after-state.
      const fallback:LedgerHeroChronicle={
        ...rebuilt.heroes,lines:[],remembered:[],rememberedTotal:0,
        knownShopVisitors:pending.visitorCount as number,
      };
      summary={...rebuilt,visited:pending.visitorCount as number,
        heroes:restored??fallback,
        dossiers:restoredDossiers??rebuilt.dossiers.map(dossier=>({
          ...dossier,knownLevel:null,
        }))};
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
