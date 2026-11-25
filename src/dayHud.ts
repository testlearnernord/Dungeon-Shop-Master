import { GameStore } from "./game/gameStore";
import {heroProgression} from "./game/heroProgression.ts";
import { type VisitorSnapshot } from "./game/npcVisitors";
import { heroDisplayNames } from "./game/heroIdentity.ts";
import { hasObservedReplay } from "./replayDisclosure.ts";
import {reportCategory,reportIcon,reportCounts,type ReportCategory} from "./reportPresentation.ts";
import {uiIcon} from "./uiIcons.ts";
import {goldIcon} from "./uiIcons.ts";
import {liveRosterCards,rosterActivityLabel} from "./game/heroCardView.ts";

export function setupDayHud(
  canvas: HTMLCanvasElement,
  store: GameStore,
  onVisitorsChanged: (current: readonly VisitorSnapshot[], previous: readonly VisitorSnapshot[]) => void = () => {},
  onConfirmedDay: () => void = () => {},
): {endDayFromBed:()=>void} {
  const day = document.querySelector<HTMLElement>("#day");
  const events = document.querySelector<HTMLOListElement>("#world-events");
  const roster = document.querySelector<HTMLUListElement>("#adventurer-roster");
  const visitors = document.querySelector<HTMLElement>("#shop-visitors");
  const population = document.querySelector<HTMLElement>("#population-summary");
  if (!day || !events || !roster || !visitors || !population) {
    throw new Error("The day clock HUD must exist before the game starts.");
  }

  const history = document.querySelector<HTMLOListElement>("#day-history")!;
  const reportOverview=document.querySelector<HTMLElement>("#day-history-overview")!;
  const reportFilters=[...document.querySelectorAll<HTMLButtonElement>(
    "#day-history-filters [data-report-filter]")];
  let activeFilter:ReportCategory|"all"="all";
  for(const button of reportFilters){
    button.addEventListener("click",()=>{
      activeFilter=button.dataset.reportFilter as ReportCategory|"all";
      for(const choice of reportFilters)
        choice.setAttribute("aria-pressed",String(choice===button));
      render();
    });
  }
  const visibleMessage=(event:typeof store.state.events[number]):string=>
    event.type==="dungeon-live"&&!!event.dungeonReplay&&
      !hasObservedReplay(event.id)
      ?"An expedition recording has been sealed. Watch the saved footage to learn its outcome."
      :event.message;
  const eventRow=(event:typeof store.state.events[number])=>{
    const entry=document.createElement("li");
    const group=reportCategory(event);
    entry.dataset.eventId=event.id;
    entry.dataset.category=group;
    entry.className="report-event report-event-"+group;
    entry.append(uiIcon(reportIcon(event)));
    const copy=document.createElement("div");
    copy.className="report-event-copy";
    const meta=document.createElement("small");
    meta.className="report-event-meta";
    meta.textContent=group==="shop"?"SHOP":group==="dungeon"?"DUNGEON":"WORLD";
    const text=document.createElement("span");
    text.textContent=visibleMessage(event);
    copy.append(meta,text);
    entry.append(copy);
    return entry;
  };
  const snapshotVisitors = (): readonly VisitorSnapshot[] => {
    const state = store.state;
     const names = heroDisplayNames(state.adventurers);
    return state.adventurers.filter(({ status }) => status !== "dead").map(hero => ({
      id:hero.id, name:hero.name, role:hero.role, level:hero.level,
      status:hero.status, equipment:hero.equipment, gold:hero.gold, health:hero.health,
      maxHealth:heroProgression(hero).maxHealth,
      displayName: names.get(hero.id) ?? hero.name,
      // Every customer shares Galvik's one physical cursed threshold.
      entranceGate:"portal" as const,
    }));
  };
  let previousVisitors: readonly VisitorSnapshot[] = [];
  const render = (): void => {
    const state = store.state;
    day.textContent = `Day ${state.day}`;
    events.replaceChildren(...state.events.slice(-3).reverse().map(eventRow));
    const today = [];
    for (let index = state.events.length - 1; index >= 0 && today.length < 100; index -= 1) {
      const event = state.events[index];
      if (event.day !== state.day) break;
      today.push(event);
    }
    const counts=reportCounts(today);
    const summary=[
      [counts.total,"EVENTS"],
      [counts.shop,"SHOP"],
      [counts.dungeon,"DUNGEON"],
      [counts.other,"WORLD"],
    ] as const;
    reportOverview.replaceChildren(...summary.map(([count,label])=>{
      const tile=document.createElement("span");
      tile.className="report-count";
      const value=document.createElement("strong");
      value.textContent=String(count);
      const caption=document.createElement("small");
      caption.textContent=label;
      tile.append(value,caption);
      return tile;
    }));
    history.replaceChildren(...today
      .filter(event=>activeFilter==="all"||reportCategory(event)===activeFilter)
      .map(eventRow));
    if(!history.children.length){
      const empty=document.createElement("li");
      empty.className="report-empty";
      empty.textContent="No "+(activeFilter==="all"?"":activeFilter+" ")+"events yet.";
      history.append(empty);
    }
    const active=liveRosterCards(state,"active");
    const atShop=active.filter(hero=>hero.status==="at-shop"||hero.status==="departing");
    const fallen=state.adventurers.filter(h=>h.status==="dead").length;
    population.textContent="Adventurers: "+active.length+" active · "+fallen+" fallen";
    population.dataset.short=active.length+" active";
    population.setAttribute("aria-label",population.textContent);
    visitors.textContent="Shop visitors ("+atShop.length+"): "+
      (atShop.map(hero=>hero.name).join(", ")||"none");
    visitors.dataset.short=atShop.length+" in shop";
    visitors.title=visitors.textContent;
    visitors.setAttribute("aria-label",visitors.textContent);
    roster.replaceChildren(...active.map(hero=>{
      const entry=document.createElement("li");
      entry.dataset.adventurerId=hero.id;entry.dataset.status=hero.status;
      const summary=document.createElement("span");
      summary.className="hero-summary";
      summary.textContent=hero.name+" · "+hero.role+" · "+
        (hero.floor===null?"":("F"+hero.floor+" · "))+rosterActivityLabel(hero)+
        " · HP "+Math.round(hero.health??0)+"/"+hero.maxHealth;
      entry.append(summary);
      const current=state.adventurers.find(h=>h.id===hero.id);
      if(current?.status==="at-shop"){
        const cash=document.createElement("span");cash.className="hero-gold";
        cash.setAttribute("aria-label",current.gold+" gold");
        cash.append(goldIcon(),document.createTextNode(" "+current.gold+"g"));entry.append(cash);
        const permit=document.createElement("button");
        permit.type="button";permit.className="boss-pass";permit.dataset.adventurerId=hero.id;
        permit.setAttribute("aria-pressed",String(current.bossPass));
        permit.textContent=current.bossPass?"Revoke Boss Pass":"Grant Boss Pass";
        permit.title="Allow this visitor to join a real Floor-10 party.";
        permit.addEventListener("click",()=>store.setBossPass(hero.id,!current.bossPass));
        entry.append(" ",permit);
      }
      return entry;
    }));
  };

  let previousAdventurers = store.state.adventurers;
  let previousDay=store.state.day;
  let previousEvents=store.state.events;
  store.subscribe(() => {
    const state=store.state;
    if (state.adventurers !== previousAdventurers) {
      const currentVisitors = snapshotVisitors();
      onVisitorsChanged(currentVisitors, previousVisitors);
      previousVisitors = currentVisitors;
    }
    if(state.day!==previousDay||state.events!==previousEvents||
       state.adventurers!==previousAdventurers){
      previousDay=state.day;
      previousEvents=state.events;
      previousAdventurers=state.adventurers;
      render();
    }
  });
  window.addEventListener("expedition-observed",render);
  render();
  const initialVisitors = snapshotVisitors();
  onVisitorsChanged(initialVisitors, previousVisitors);
  previousVisitors = initialVisitors;
  return {
    // Only the bed controller invokes this. The modal controls navigation
    // after settlement; neither navigation nor replay can trigger another day.
    endDayFromBed(){
      store.endDay();
      onConfirmedDay();
    },
  };
}
