import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {GameStore} from "./game/gameStore.ts";
import {selectExpeditionArchive,archiveForHero,type ExpeditionArchiveEntry}
  from "./game/expeditionArchive.ts";
import {hasObservedReplay} from "./replayDisclosure.ts";

/** A continuously accessible, read-only library over authentic committed
 * records. No GameStore action, RNG, fight engine or archive clock exists here.
 */
export function setupExpeditionArchiveHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,
  openDungeonRecording:(eventId:string,seconds:number)=>boolean,
  openBossRecording:(eventId:string)=>boolean,
):()=>void {
  const dialog=document.querySelector<HTMLDialogElement>("#archive-dialog")!;
  const openButton=document.querySelector<HTMLButtonElement>("#open-archive")!;
  const boardButton=document.querySelector<HTMLButtonElement>("#open-archive-roster")!;
  const closeButton=document.querySelector<HTMLButtonElement>("#archive-close")!;
  const list=document.querySelector<HTMLElement>("#archive-entries")!;
  const summary=document.querySelector<HTMLElement>("#archive-summary")!;
  const heroFilter=document.querySelector<HTMLSelectElement>("#archive-hero-filter")!;
  const groupFilter=document.querySelector<HTMLSelectElement>("#archive-party-filter")!;
  const search=document.querySelector<HTMLInputElement>("#archive-search")!;
  const names=()=>new Map(store.state.adventurers.map(h=>[h.id,h.name]));
  let lastEvents:typeof store.state.events|null=null;

  function render():void {
    const entries=selectExpeditionArchive(store.state);
    const selectedHero=heroFilter.value;
    const heroes=new Set(entries.map(e=>e.heroId));
    const heroNames=names();
    heroFilter.replaceChildren(new Option("All heroes","all"),
      ...[...heroes].sort((a,b)=>
        (heroNames.get(a)??a).localeCompare(heroNames.get(b)??b))
        .map(id=>new Option(heroNames.get(id)??id,id)));
    heroFilter.value=selectedHero!=="all"&&heroes.has(selectedHero)
      ?selectedHero:"all";

    const query=search.value.trim().toLocaleLowerCase();
    const source=heroFilter.value==="all"?entries:
      archiveForHero(entries,heroFilter.value,true).filter(entry=>
        entry.heroId===heroFilter.value||hasObservedReplay(entry.id));
    const filtered=source.filter(entry=>{
      if(groupFilter.value==="party"&&entry.partySize<2)return false;
      if(groupFilter.value==="solo"&&entry.partySize>=2)return false;
      if(!query)return true;
      return [entry.heroName,entry.id,entry.clockLabel,entry.label]
        .some(value=>value.toLocaleLowerCase().includes(query));
    });
    summary.textContent=filtered.length+" committed entries · "+
      filtered.filter(entry=>entry.hasReplay).length+" surviving recordings · "+
      "newest first · world clock and playback time are separate";
    const visible=filtered.slice().reverse();
    list.replaceChildren(...visible.map(entry=>makeEntry(entry,heroNames)));
    if(!visible.length){
      const empty=document.createElement("p");
      empty.textContent="No committed events match these filters.";
      list.append(empty);
    }
  }

  function makeEntry(entry:ExpeditionArchiveEntry,heroNames:Map<string,string>):
    HTMLElement {
    const section=document.createElement("article");
    section.className="archive-entry";
    section.dataset.eventId=entry.id;
    section.dataset.heroId=entry.heroId;
    section.dataset.kind=entry.kind;
    const heading=document.createElement("h3");
    heading.textContent=entry.heroName+" · "+entry.label;
    const when=document.createElement("p");
    when.className="archive-world-time";
    when.textContent=entry.clockLabel+
      (entry.floor!==null?" · F"+entry.floor:"")+
      (entry.partySize>=2?" · Party recording ("+entry.partySize+")":"");
    const detail=document.createElement("p");
    detail.className="archive-recording-status";
    detail.textContent=entry.hasReplay
      ?"Recorded playback: "+(entry.replaySeconds?.toFixed(1)??"?")+
        " s · independent of the in-world clock"
      :"Committed event only · no invented replay frames";
    section.append(heading,when,detail);
    // Archive metadata cannot infer a murder weapon, remote health, or
    // who won an unseen encounter from the saved finished replay.
    if(entry.hasReplay){
      const actions=document.createElement("div");
      actions.className="archive-entry-actions";
      const button=(label:string,time:number)=>{
        const control=document.createElement("button");
        control.type="button";
        control.textContent=label;
        control.addEventListener("click",()=>openFootage(entry,time));
        return control;
      };
      actions.append(button("Watch recording",0));
      if(entry.floor!==6)for(const mark of entry.bookmarks.slice(1)){
        actions.append(button(mark.label+" @ "+mark.replaySeconds.toFixed(1)+" s",
          mark.replaySeconds));
      }
      section.append(actions);
      if(entry.partySize>=2&&hasObservedReplay(entry.id)){
        const names=entry.partyMemberIds.map(id=>heroNames.get(id)??id);
        const actors=document.createElement("p");
        actors.textContent="Observed party: "+names.join(", ");
        section.append(actors);
      }
    }
    return section;
  }

  function openFootage(entry:ExpeditionArchiveEntry,seconds:number):void{
    dialog.close();
    const opened=entry.floor===6
      ?openBossRecording(entry.id)
      :openDungeonRecording(entry.id,seconds);
    if(!opened){
      // Recording metadata may be durable while its large replay frames
      // are intentionally pruned. Never fake those missing frames.
      const status=document.querySelector<HTMLElement>("#status");
      if(status)status.textContent="This recording is no longer available.";
    }
  }

  function open():void {
    const roster=document.querySelector<HTMLDialogElement>("#roster-dialog");
    if(roster?.open)roster.close();
    if(dialog.open||document.querySelector("dialog[open]")||
      document.body.classList.contains("dungeon-active")||
      document.body.classList.contains("arena-active"))return;
    if(document.pointerLockElement===canvas)void document.exitPointerLock();
    camera.detachControl();
    render();
    dialog.showModal();
  }
  function close():void {if(dialog.open)dialog.close();}
  dialog.addEventListener("close",()=>{
    if(!document.body.classList.contains("dungeon-active")&&
       !document.body.classList.contains("arena-active"))
      camera.attachControl(canvas,true);
  });
  openButton.addEventListener("click",open);
  boardButton.addEventListener("click",open);
  closeButton.addEventListener("click",close);
  heroFilter.addEventListener("change",render);
  groupFilter.addEventListener("change",render);
  search.addEventListener("input",render);
  store.subscribe(()=>{
    if(lastEvents===store.state.events)return;
    lastEvents=store.state.events;
    if(dialog.open)render();
  });
  window.addEventListener("keydown",event=>{
    if(event.code!=="KeyH"||event.repeat||event.ctrlKey||event.altKey||
      event.metaKey||event.target instanceof HTMLElement&&
      event.target.closest("input,textarea,select,[contenteditable]"))return;
    if(dialog.open){event.preventDefault();close();}
    else if(!document.querySelector("dialog[open]")&&
      !document.body.classList.contains("dungeon-active")&&
      !document.body.classList.contains("arena-active")){
      event.preventDefault();open();
    }
  });
  return open;
}
