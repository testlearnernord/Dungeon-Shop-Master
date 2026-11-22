import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {GameStore} from "./game/gameStore.ts";
import {archiveAvailableDays,archiveBookmarks,selectExpeditionArchive,
  type ArchiveDay,type ExpeditionHighlight} from "./game/expeditionArchive.ts";
import {MAX_SAVED_REPLAYS} from "./game/replayRetention.ts";

/** One bounded timeline. Showing history or setting a UI bookmark cannot
 * simulate a fight, alter resources or advance the world event clock.
 */
export function setupExpeditionArchiveHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,
  openDungeonRecording:(eventId:string,seconds:number)=>boolean,
  openBossRecording:(eventId:string)=>boolean,
  openPartyBossRecording:(eventId:string)=>boolean,
):()=>void {
  const dialog=document.querySelector<HTMLDialogElement>("#archive-dialog")!;
  const openButton=document.querySelector<HTMLButtonElement>("#open-archive")!;
  const boardButton=document.querySelector<HTMLButtonElement>("#open-archive-roster")!;
  const closeButton=document.querySelector<HTMLButtonElement>("#archive-close")!;
  const list=document.querySelector<HTMLElement>("#archive-entries")!;
  const summary=document.querySelector<HTMLElement>("#archive-summary")!;
  const dayFilter=document.querySelector<HTMLSelectElement>("#archive-day-filter")!;
  const heroFilter=document.querySelector<HTMLSelectElement>("#archive-hero-filter")!;
  const search=document.querySelector<HTMLInputElement>("#archive-search")!;
  let selectedDay:ArchiveDay=store.state.day;
  let lastEvents:typeof store.state.events|null=null;
  let lastPins:typeof store.state.savedReplayIds|null=null;

  function render():void {
    const state=store.state;
    const days=archiveAvailableDays(state.day);
    if(selectedDay!=="saved"&&!days.includes(selectedDay))selectedDay=state.day;
    dayFilter.replaceChildren(...days.map(day=>
      new Option(day===state.day?"Today · Day "+day:"Day "+day,String(day))),
      new Option("Saved recordings ("+state.savedReplayIds.length+
        "/"+MAX_SAVED_REPLAYS+")","saved"));
    dayFilter.value=String(selectedDay);

    const names=new Map(state.adventurers.map(h=>[h.id,h.name]));
    const id=heroFilter.value||"all";
    const entries=selectExpeditionArchive(state,selectedDay);
    const relevantIds=[...new Set(entries.map(e=>e.heroId))];
    relevantIds.sort((a,b)=>(names.get(a)??a).localeCompare(names.get(b)??b));
    heroFilter.replaceChildren(new Option("All heroes","all"),
      ...relevantIds.map(heroId=>new Option(names.get(heroId)??heroId,heroId)));
    heroFilter.value=id==="all"||relevantIds.includes(id)?id:"all";
    const query=search.value.trim().toLocaleLowerCase();
    const visible=entries.filter(entry=>
      (heroFilter.value==="all"||entry.heroId===heroFilter.value)&&
      (!query||[entry.heroName,entry.clockLabel,entry.label,entry.id]
        .some(value=>value.toLocaleLowerCase().includes(query))));
    summary.textContent=visible.length+" real highlights · "+
      visible.filter(entry=>entry.hasReplay).length+" available recordings · "+
      state.savedReplayIds.length+"/"+MAX_SAVED_REPLAYS+" permanently saved";
    // One day at a time; never materialize all recorded frames in the DOM.
    list.replaceChildren(...visible.map(makeEntry));
    if(!visible.length){
      const empty=document.createElement("p");
      empty.textContent=selectedDay==="saved"
        ?"No saved recordings. Use Save on a recent fight."
        :"No matching committed highlights on this day.";
      list.append(empty);
    }
  }

  function makeEntry(entry:ExpeditionHighlight):HTMLElement {
    const section=document.createElement("article");
    section.className="archive-entry";
    section.dataset.eventId=entry.id;
    section.dataset.heroId=entry.heroId;
    section.dataset.kind=entry.kind;
    const heading=document.createElement("h3");
    heading.textContent=entry.label+" · "+entry.heroName;
    const when=document.createElement("p");
    when.className="archive-world-time";
    when.textContent=entry.clockLabel+(entry.floor===null?"":" · F"+entry.floor)+
      (entry.partySize>=2?" · Temporary Party ("+entry.partySize+")":"");
    const note=document.createElement("p");
    note.className="archive-recording-status";
    note.textContent=entry.hasReplay
      ?"Actual recorded footage · local replay clock is separate"
      :"Committed timeline event · no fake video";
    section.append(heading,when,note);
    if(!entry.hasReplay)return section;
    const actions=document.createElement("div");
    actions.className="archive-entry-actions";
    const watch=document.createElement("button");
    watch.type="button";
    watch.textContent="Watch recording";
    watch.addEventListener("click",()=>watchFootage(entry,0));
    actions.append(watch);
    const save=document.createElement("button");
    save.type="button";
    save.textContent=entry.saved?"Unsave recording":"Save recording";
    save.setAttribute("aria-pressed",String(entry.saved));
    save.addEventListener("click",()=>{
      const result=store.toggleSavedReplay(entry.id);
      const status=document.querySelector<HTMLElement>("#status");
      if(status)status.textContent=result;
      render();
    });
    actions.append(save);
    if(entry.floor!==6&&!entry.partyBoss){
      const jumps=document.createElement("button");
      jumps.type="button";
      jumps.textContent="Highlights / Jump to…";
      jumps.setAttribute("aria-expanded","false");
      const bookmarks=document.createElement("div");
      bookmarks.className="archive-bookmarks";
      bookmarks.hidden=true;
      jumps.addEventListener("click",()=>{
        bookmarks.hidden=!bookmarks.hidden;
        jumps.setAttribute("aria-expanded",String(!bookmarks.hidden));
        if(bookmarks.hidden||bookmarks.childElementCount)return;
        // Build segment positions lazily for exactly ONE selected tape.
        for(const mark of archiveBookmarks(store.state,entry.id)){
          const button=document.createElement("button");
          button.type="button";
          button.textContent=mark.label+" · "+mark.replaySeconds.toFixed(1)+" s";
          button.addEventListener("click",()=>watchFootage(entry,mark.replaySeconds));
          bookmarks.append(button);
        }
      });
      actions.append(jumps);
      section.append(actions,bookmarks);
    }else section.append(actions);
    return section;
  }
  function watchFootage(entry:ExpeditionHighlight,seconds:number):void {
    dialog.close();
    const ok=entry.partyBoss?openPartyBossRecording(entry.id):
      entry.floor===6?openBossRecording(entry.id):
      openDungeonRecording(entry.id,seconds);
    if(!ok){
      const status=document.querySelector<HTMLElement>("#status");
      if(status)status.textContent="These recorded frames are no longer available.";
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
    if(selectedDay!=="saved")selectedDay=store.state.day;
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
  dayFilter.addEventListener("change",()=>{
    selectedDay=dayFilter.value==="saved"?"saved":Number(dayFilter.value);
    render();
  });
  heroFilter.addEventListener("change",render);
  search.addEventListener("input",render);
  store.subscribe(()=>{
    if(lastEvents===store.state.events&&lastPins===store.state.savedReplayIds)return;
    lastEvents=store.state.events;
    lastPins=store.state.savedReplayIds;
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
