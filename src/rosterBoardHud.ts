import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {GameStore} from "./game/gameStore.ts";
import {liveBoardHeroesForFilter,selectLiveBoardHeroes} from "./game/liveBoardProjection.ts";
import {portraitIndex} from "./game/rosterView.ts";
import {heroDisplayNames} from "./game/heroIdentity.ts";
import {itemIcon,uiIcon,goldIcon} from "./uiIcons.ts";
import {portraitCssFrame} from "./game/portraitAtlas.ts";
import {WORLD_TICKS_PER_DAY,WORLD_TICKS_PER_GAME_MINUTE} from "./game/worldClock.ts";

/** The R roster and the physical board read the EXACT SAME world-knowledge
 * selector. Hidden dungeon HP, inventory, gear, gold, position and survival
 * are never queried from today's actual remote adventurer state.
 */
export function setupRosterBoardHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,
  watchLive:(heroId:string)=>void,
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
    totals.textContent=(known.length-fallen)+" signatures tracked · "+fallen+
      " extinguished · Day "+state.day+
      (filterValue==="fallen"&&fallen>40?" · Showing last 40":"");
    const expanded=new Set([...list.querySelectorAll<HTMLDetailsElement>(
      "details[open][data-hero-id]")].map(node=>node.dataset.heroId));
    const heroes=liveBoardHeroesForFilter(state,filterValue);
    const names=heroDisplayNames(state.adventurers);
    list.replaceChildren(...heroes.map(hero=>{
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
        (hero.visible?.level??"?")+" "+hero.role;
      const location=document.createElement("small");
      location.textContent=hero.location+
        (hero.temporaryPartySignal?" · TP contact":"")+
        (hero.report?" · "+timeLabel(hero.report.reportedAtTick):" · no report");
      const bar=document.createElement("span");
      bar.className="roster-hp";
      if(hero.visible){
        bar.setAttribute("role","meter");
        bar.setAttribute("aria-label",hero.name+" observed hit points");
        bar.setAttribute("aria-valuemin","0");
        bar.setAttribute("aria-valuemax",String(hero.visible.stats.maxHealth));
        bar.setAttribute("aria-valuenow",String(hero.visible.health));
        const fill=document.createElement("span");
        fill.style.width=(100*hero.visible.health/hero.visible.stats.maxHealth)+"%";
        bar.append(fill);
      }else{
        bar.classList.add("roster-hp-unknown");
        bar.setAttribute("aria-label","No confirmed health report");
      }
      const overview=document.createElement("span");
      overview.className="roster-overview";
      if(hero.visible)overview.append(
        goldIcon(),document.createTextNode(" "+hero.visible.gold+"g  ·  "),
        itemIcon("bread","ui-item-icon"),
        document.createTextNode(" "+hero.visible.inventory.bread+
          " Waybread · "+hero.visible.inventory.healing+" Herbs"));
      else overview.append(uiIcon(hero.status==="lost"?"skull":"info"),
        document.createTextNode(hero.status==="lost"
          ?"Confirmed magic life-signal loss"
          :"No verified remote health, gear, gold or inventory"));
      primary.append(name,location,bar,overview);
      const health=document.createElement("span");
      health.className="roster-hp-value";
      health.textContent=hero.visible
        ?hero.visible.health+"/"+hero.visible.stats.maxHealth:"HP ?";
      summary.append(portrait,primary,health);
      const extended=document.createElement("div");
      extended.className="roster-card-extended";
      const report=document.createElement("p");
      report.className="roster-known-report";
      report.textContent=hero.report
        ?hero.report.text+" · "+hero.report.source+
          " · occurred "+timeLabel(hero.report.occurredAtTick)+
          " · reported "+timeLabel(hero.report.reportedAtTick)
        :"No confirmed contact has been received.";
      extended.append(report);
      if(hero.visible){
        const actual=hero.visible;
        const stats=document.createElement("p");
        stats.textContent="Seen in shop · XP "+actual.xp+
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
        extended.append(stats,traits,items);
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
      }else{
        const note=document.createElement("p");
        note.textContent="Remote details remain unverified. Watching a saved recording "+
          "cannot retroactively change a past magical report.";
        extended.append(note);
      }
      // Every remote non-lost signature gets the SAME explicit opt-in.
      // Whether a view exists is not itself leaked onto the board.
      if(hero.status!=="lost"&&hero.status!=="at-shop"){
        const watch=document.createElement("button");
        watch.type="button";
        watch.className="roster-watch-live";
        watch.textContent="Watch LIVE (opt in)";
        watch.setAttribute("aria-label","Watch "+hero.name+" in real time");
        watch.addEventListener("click",()=>{closeRoster();watchLive(hero.id);});
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
    if(!document.body.classList.contains("dungeon-active"))
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
