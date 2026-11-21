import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {GameStore} from "./game/gameStore.ts";
import {liveBoardHeroesForFilter,selectLiveBoardHeroes} from "./game/liveBoardProjection.ts";
import {portraitIndex} from "./game/rosterView.ts";
import {heroDisplayNames} from "./game/heroIdentity.ts";
import {itemIcon,goldIcon} from "./uiIcons.ts";
import {portraitCssFrame} from "./game/portraitAtlas.ts";
import {WORLD_TICKS_PER_DAY,WORLD_TICKS_PER_GAME_MINUTE} from "./game/worldClock.ts";

/** The explicit player-opened Adventurer Board now displays the LIVE
 * authoritative registered hero state, by design. The passive shop
 * status/last-contact feed still uses the knowledge-limited projection;
 * opening the board never modifies the game or sealed combat recordings.
 */
export function setupRosterBoardHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,
  watchLive:(heroId:string)=>boolean,
):()=>void {
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

  function render():void{
    const state=store.state;
    const known=selectLiveBoardHeroes(state);
    const fallen=known.filter(h=>h.status==="lost").length;
    totals.textContent=(known.length-fallen)+" active · "+fallen+
      " fallen · Day "+state.day+
      (filterValue==="fallen"&&fallen>40?" · Showing last 40":"");
    const expanded=new Set([...list.querySelectorAll<HTMLDetailsElement>(
      "details[open][data-hero-id]")].map(node=>node.dataset.heroId));
    const heroes=liveBoardHeroesForFilter(state,filterValue);
    const names=heroDisplayNames(state.adventurers);
    const actualHeroes=new Map(state.adventurers.map(actor=>[actor.id,actor]));
    list.replaceChildren(...heroes.map(hero=>{
      const current=actualHeroes.get(hero.id)!;
      const card=document.createElement("details");
      card.className="roster-card";
      card.dataset.heroId=hero.id;
      card.dataset.status=hero.status;
      card.open=expanded.has(hero.id);
      const summary=document.createElement("summary");
      const portrait=document.createElement("span");
      portrait.className="roster-portrait roster-role-"+hero.role.toLowerCase();
      const index=portraitIndex(hero.id);
      portrait.dataset.portraitId=String(index);
      portrait.style.backgroundImage="url('"+import.meta.env.BASE_URL+
        "assets/hero-portraits.webp')";
      Object.assign(portrait.style,portraitCssFrame(index));
      portrait.setAttribute("aria-hidden","true");
      const primary=document.createElement("span");
      primary.className="roster-card-primary";
      const name=document.createElement("strong");
      name.textContent=(names.get(hero.id)??hero.name)+" · Lv "+
        current.level+" "+hero.role;
      const location=document.createElement("small");
      location.textContent=(current.status==="at-shop"?"Galvik's shop":
        current.status==="off-duty"?"Off duty":
        current.status==="dead"?"Fallen · last floor "+current.floor:
        "Floor "+current.floor+" · "+current.status)+
        (hero.temporaryPartySignal?" · Party contact":"")+
        (hero.report?" · last signal "+timeLabel(hero.report.reportedAtTick):"");
      const bar=document.createElement("span");
      bar.className="roster-hp";
      bar.setAttribute("role","meter");
      bar.setAttribute("aria-label",hero.name+" current saved hit points");
      bar.setAttribute("aria-valuemin","0");
      bar.setAttribute("aria-valuemax",String(current.stats.maxHealth));
      bar.setAttribute("aria-valuenow",String(current.health));
      const fill=document.createElement("span");
      fill.style.width=(100*current.health/current.stats.maxHealth)+"%";
      bar.append(fill);
      const overview=document.createElement("span");
      overview.className="roster-overview";
      overview.append(
        goldIcon(),document.createTextNode(" "+current.gold+"g  ·  "),
        itemIcon("bread","ui-item-icon"),
        document.createTextNode(" "+current.inventory.bread+
          " Waybread · "+current.inventory.healing+" Herbs · "+
          current.status));
      primary.append(name,location,bar,overview);
      const health=document.createElement("span");
      health.className="roster-hp-value";
      health.textContent=current.health+"/"+current.stats.maxHealth;
      summary.append(portrait,primary,health);
      const extended=document.createElement("div");
      extended.className="roster-card-extended";
      const report=document.createElement("p");
      report.className="roster-known-report";
      report.textContent=hero.report
        ?"Last magical/physical report: "+hero.report.text+" · "+
          hero.report.source+" · "+timeLabel(hero.report.reportedAtTick)
        :"No historical contact report. LIVE statistics below are current saved world state.";
      extended.append(report);
      {
        const actual=current;
        const stats=document.createElement("p");
        stats.textContent="LIVE · "+actual.status+" · Floor "+actual.floor+
          " · HP "+actual.health+"/"+actual.stats.maxHealth+" · XP "+actual.xp+
          " · Gold "+actual.gold+"g · STR "+actual.stats.strength+
          " / AGI "+actual.stats.agility+" / INT "+actual.stats.intellect;
        const traits=document.createElement("p");
        traits.textContent="Traits: "+actual.traits.positive+" / "+
          actual.traits.neutral+" / "+actual.traits.negative;
        const items=document.createElement("p");
        items.className="roster-items";
        const chip=(id:string,text:string):HTMLElement=>{
          const element=document.createElement("span");
          element.className="roster-item-chip";
          element.title=text;
          element.append(itemIcon(id,"roster-item-icon"),
            document.createTextNode(text));
          return element;
        };
        items.append(
          chip("iron-sword",actual.equipment.weapon??"No weapon"),
          chip("leather-vest",actual.equipment.armor??"No armor"),
          chip("bread","Waybread "+actual.inventory.bread),
          chip("healing-herb","Healing "+actual.inventory.healing),
          chip("iron-ore","Loot "+actual.inventory.loot),
        );
        const recovered=document.createElement("p");
        const finds=Object.entries(actual.inventory.finds??{})
          .filter(([,count])=>typeof count==="number"&&count>0);
        recovered.textContent="Recovered goods: "+
          (finds.length?finds.map(([id,count])=>id+" ×"+count).join(" · "):
            "None");
        extended.append(stats,traits,items,recovered);
        if(actual.status==="at-shop"||actual.status==="departing"){
        const permit=document.createElement("button");
        permit.type="button";
        permit.className="roster-permit";
        permit.setAttribute("aria-pressed",String(actual.level6Permit));
        permit.textContent=actual.level6Permit?"Revoke Level 6 permit":"Grant Level 6 permit";
        permit.addEventListener("click",()=>{
          store.setLevel6Permit(hero.id,!actual.level6Permit);
          [...list.querySelectorAll<HTMLDetailsElement>(
            "details[data-hero-id]")].find(node=>node.dataset.heroId===hero.id)
              ?.querySelector<HTMLButtonElement>(".roster-permit")?.focus();
        });
        extended.append(permit);
        }
      }
      // Opt-in LIVE camera is offered for registered remote adventurers.
      // The explicit Board now shows the real current status and statistics.
      if(hero.status!=="lost"&&hero.status!=="at-shop"){
        const watch=document.createElement("button");
        watch.type="button";
        watch.className="roster-watch-live";
        watch.textContent="Watch LIVE (opt in)";
        watch.setAttribute("aria-label","Watch "+hero.name+" in real time");
        watch.addEventListener("click",()=>{
          // A spectator view requires a real committed position or fight.
          // Never invent an encounter just because the Board has stats.
          closeRoster();
          if(watchLive(hero.id))return;
          openRoster();
          const current=[...list.querySelectorAll<HTMLDetailsElement>(
            "details[data-hero-id]")].find(node=>node.dataset.heroId===hero.id);
          if(!current)return;
          current.open=true;
          const warning=document.createElement("p");
          warning.className="roster-watch-unavailable";
          warning.setAttribute("role","status");
          warning.textContent="LIVE observation unavailable: no current dungeon "+
            "position or fight checkpoint for this adventurer. Active dungeon "+
            "explorers receive a real checkpoint at their next 10-second step; "+
            "traveling and off-duty adventurers cannot be watched in a dungeon.";
          current.querySelector(".roster-card-extended")?.append(warning);
          current.querySelector<HTMLButtonElement>(".roster-watch-live")?.focus();
        });
        extended.append(watch);
      }
      card.append(summary,extended);
      return card;
    }));
    if(!heroes.length){
      const empty=document.createElement("p");
      empty.textContent=filterValue==="fallen"
        ?"No confirmed extinguished life-signatures.":"No tracked signatures.";
      list.append(empty);
    }
  }
  function openRoster():void{
    if(dialog.open||document.querySelector("dialog[open]"))return;
    if(document.pointerLockElement===canvas)void document.exitPointerLock();
    camera.detachControl();render();dialog.showModal();
  }
  function closeRoster():void{if(dialog.open)dialog.close();}
  dialog.addEventListener("close",()=>{
    if(!dialog.open&&!document.body.classList.contains("dungeon-active"))
      camera.attachControl(canvas,true);
  });
  close.addEventListener("click",closeRoster);
  openButton.addEventListener("click",openRoster);
  filter.addEventListener("change",()=>{
    filterValue=filter.value==="fallen"?"fallen":"active";render();
  });
  window.addEventListener("keydown",event=>{
    if(event.code!=="KeyR"||event.repeat||
      event.ctrlKey||event.altKey||event.metaKey)return;
    if(document.body.classList.contains("blueprint-active"))return;
    if(event.target instanceof HTMLElement&&
      event.target.closest("input, textarea, select, [contenteditable]"))return;
    if(dialog.open)closeRoster();
    else if(!document.querySelector("dialog[open]"))openRoster();
  });
  let priorDay=0,priorHeroes:typeof store.state.adventurers|null=null,
    priorEvents:typeof store.state.events|null=null;
  const update=()=>{
    const state=store.state;
    if(state.day===priorDay&&state.adventurers===priorHeroes&&
      state.events===priorEvents)return;
    priorDay=state.day;priorHeroes=state.adventurers;priorEvents=state.events;
    if(dialog.open)render();
  };
  store.subscribe(update);
  render();
  return openRoster;
}
