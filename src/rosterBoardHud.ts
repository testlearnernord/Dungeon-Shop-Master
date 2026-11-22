import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {GameStore} from "./game/gameStore.ts";
import {selectLiveBoardHeroes} from "./game/liveBoardProjection.ts";
import {liveHeroCard} from "./game/heroCardView.ts";
import {renderHeroCard} from "./heroCard.ts";
import type {WorldHeroCards} from "./worldHeroCards.ts";
import {WORLD_TICKS_PER_DAY,WORLD_TICKS_PER_GAME_MINUTE} from "./game/worldClock.ts";

/** World Wide Hero Cards replace the former handwritten roster data
 * rows. Existing Board filters, permit authority, actions and keyboard
 * navigation are retained. The World Feed opens the same expanded card. */
export function setupRosterBoardHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,
  watchLive:(heroId:string)=>boolean,heroCards?:WorldHeroCards,
):(heroId?:string)=>void {
  const dialog=document.querySelector<HTMLDialogElement>("#roster-dialog")!;
  const list=document.querySelector<HTMLElement>("#roster-detail-list")!;
  const totals=document.querySelector<HTMLElement>("#roster-totals")!;
  const filter=document.querySelector<HTMLSelectElement>("#roster-filter")!;
  const close=document.querySelector<HTMLButtonElement>("#close-roster")!;
  const openButton=document.querySelector<HTMLButtonElement>("#open-roster")!;
  let filterValue:"active"|"fallen"="active";
  const timeLabel=(tick:number)=>{
    const day=Math.floor(tick/WORLD_TICKS_PER_DAY)+1;
    const minute=Math.floor(tick%WORLD_TICKS_PER_DAY/WORLD_TICKS_PER_GAME_MINUTE);
    return "Day "+day+" · "+String(Math.floor(minute/60)).padStart(2,"0")+
      ":"+String(minute%60).padStart(2,"0");
  };
  function render():void {
    const state=store.state,known=selectLiveBoardHeroes(state);
    const fallen=state.adventurers.filter(h=>h.status==="dead").length;
    totals.textContent=(known.length-fallen)+" active · "+fallen+
      " fallen · Day "+state.day;
    const expanded=new Set([...list.querySelectorAll<HTMLDetailsElement>(
      "details[open][data-hero-id]")].map(n=>n.dataset.heroId));
    const all=new Map(state.adventurers.map(hero=>[hero.id,hero]));
    const heroes=known.filter(hero=>filterValue==="fallen"?
      all.get(hero.id)?.status==="dead":all.get(hero.id)?.status!=="dead");
    list.replaceChildren(...heroes.map(hero=>{
      const current=all.get(hero.id);
      const view=liveHeroCard(state,hero.id);
      if(!current||!view)throw new Error("Roster projection lost a saved hero");
      const card=document.createElement("details");
      card.className="roster-card";card.dataset.heroId=hero.id;
      card.dataset.status=current.status==="dead"?"lost":current.status;
      card.open=expanded.has(hero.id);
      const summary=document.createElement("summary");
      summary.append(renderHeroCard(view,"mini"));
      // The summary ALREADY renders our Mini card. A second floating
      // copy on hover was redundant (and obscured by the native dialog).
      const extended=document.createElement("div");
      extended.className="roster-card-extended";
      extended.append(renderHeroCard(view,"expanded"));
      const report=document.createElement("p");
      report.className="roster-known-report";
      report.textContent=hero.report?
        "Last contact · "+hero.report.text+" · "+timeLabel(hero.report.reportedAtTick):
        "No previous contact report.";
      extended.append(report);
      if(current.status==="at-shop"||current.status==="departing"){
        const permit=document.createElement("button");
        permit.type="button";permit.className="roster-permit";
        permit.setAttribute("aria-pressed",String(current.level6Permit));
        permit.textContent=current.level6Permit?
          "Revoke Boss Pass":"Grant Boss Pass";
        permit.addEventListener("click",()=>{
          store.setLevel6Permit(hero.id,!current.level6Permit);
          list.querySelector<HTMLButtonElement>(
            'details[data-hero-id="'+hero.id+'"] .roster-permit')?.focus();
        });
        extended.append(permit);
      }
      if(current.status!=="dead"&&current.status!=="at-shop"){
        const watch=document.createElement("button");
        watch.type="button";watch.className="roster-watch-live";
        watch.textContent="Watch LIVE (opt in)";
        watch.setAttribute("aria-label","Watch "+hero.name+" in real time");
        watch.addEventListener("click",()=>{
          closeRoster();
          if(watchLive(hero.id))return;
          openRoster();
          const restored=list.querySelector<HTMLDetailsElement>(
            'details[data-hero-id="'+hero.id+'"]');
          if(!restored)return;
          restored.open=true;
          const warning=document.createElement("p");
          warning.className="roster-watch-unavailable";
          warning.setAttribute("role","status");
          warning.textContent="LIVE observation unavailable: no current dungeon "+
            "position or fight checkpoint for this adventurer. Traveling and "+
            "off-duty heroes cannot be watched on a dungeon floor.";
          restored.querySelector(".roster-card-extended")?.append(warning);
        });
        extended.append(watch);
      }
      card.append(summary,extended);
      return card;
    }));
    if(!heroes.length){
      const empty=document.createElement("p");
      empty.textContent=filterValue==="fallen"?
        "No confirmed extinguished life-signatures.":"No tracked signatures.";
      list.append(empty);
    }
  }
  function openRoster(heroId?:string):void {
    if(dialog.open||document.querySelector("dialog[open]"))return;
    const focused=heroId?store.state.adventurers.find(h=>h.id===heroId):null;
    if(focused){
      filterValue=focused.status==="dead"?"fallen":"active";
      filter.value=filterValue;
    }
    heroCards?.hideMini();
    if(document.pointerLockElement===canvas)void document.exitPointerLock();
    camera.detachControl();render();dialog.showModal();
    if(focused){
      const entry=list.querySelector<HTMLDetailsElement>(
        'details[data-hero-id="'+focused.id+'"]');
      if(entry){entry.open=true;entry.scrollIntoView({block:"nearest"});}
    }
  }
  function closeRoster():void{if(dialog.open)dialog.close();}
  dialog.addEventListener("close",()=>{
    if(!dialog.open&&!document.body.classList.contains("dungeon-active"))
      camera.attachControl(canvas,true);
  });
  close.addEventListener("click",closeRoster);
  openButton.addEventListener("click",()=>openRoster());
  filter.addEventListener("change",()=>{
    filterValue=filter.value==="fallen"?"fallen":"active";render();
  });
  window.addEventListener("keydown",event=>{
    if(event.code!=="KeyR"||event.repeat||
       event.ctrlKey||event.altKey||event.metaKey)return;
    if(document.body.classList.contains("blueprint-active"))return;
    if(event.target instanceof HTMLElement&&event.target.closest(
       "input, textarea, select, [contenteditable]"))return;
    if(dialog.open)closeRoster();
    else if(!document.querySelector("dialog[open]"))openRoster();
  });
  let priorDay=0,priorHeroes:typeof store.state.adventurers|null=null,
    priorEvents:typeof store.state.events|null=null;
  store.subscribe(()=>{
    const state=store.state;
    if(state.day===priorDay&&state.adventurers===priorHeroes&&
       state.events===priorEvents)return;
    priorDay=state.day;priorHeroes=state.adventurers;
    priorEvents=state.events;
    if(dialog.open)render();
  });
  render();return openRoster;
}
