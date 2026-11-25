import {
  SFX_CATALOG, SFX_OWNERS, SFX_FAMILIES,passesSfxDebugFilter,
  type SfxAxis,type SfxOwner,type SfxFamily,
} from "./sfxCatalog.ts";
import type { GameSfx, SfxDebugEvent } from "./gameSfx.ts";
import {selectSfxSample} from "./gameSfxSamples.ts";

/**
 * Read-only Combat Lab audio workbench. No game simulation references.
 * Per-source and per-sound-type solos intersect; mutes are subtractive.
 */
export class CombatLabSfxDebugPanel {
  private readonly toggle:HTMLButtonElement;
  private readonly panel:HTMLElement;
  private readonly filters:HTMLElement;
  private readonly auditionList:HTMLElement;
  private readonly events:HTMLOListElement;
  private readonly ambient:HTMLElement;
  private available=false;
  private opened=false;
  private readonly groupButtons:HTMLButtonElement[]=[];

  constructor(private readonly sfx:GameSfx|undefined){
    this.toggle=document.querySelector<HTMLButtonElement>("#arena-sfx-debug-toggle")!;
    this.panel=document.querySelector<HTMLElement>("#arena-sfx-debug")!;
    this.filters=document.querySelector<HTMLElement>("#arena-sfx-debug-filters")!;
    this.auditionList=document.querySelector<HTMLElement>("#arena-sfx-debug-auditions")!;
    this.events=document.querySelector<HTMLOListElement>("#arena-sfx-debug-events")!;
    this.ambient=document.querySelector<HTMLElement>("#arena-sfx-debug-ambient")!;
    this.toggle.addEventListener("click",()=>{
      if(!this.available)return;
      if(document.pointerLockElement)void document.exitPointerLock();
      this.setOpened(!this.opened);
    });
    document.querySelector("#arena-sfx-debug-reset")!.addEventListener("click",()=>{
      if(!this.available)return;
      this.sfx?.resetPreviewMix();
      this.render();
    });
    this.buildGroups("owner","Sound source",SFX_OWNERS);
    this.buildGroups("family","Sound type",SFX_FAMILIES);
    for(const entry of SFX_CATALOG){
      const button=document.createElement("button");
      button.type="button";
      button.className="sfx-debug-audition";
      button.dataset.cue=entry.id;
      const sample=selectSfxSample(entry.id,0)?.file;
      button.textContent="▶ "+entry.label+(sample?" · "+sample.split(".").at(-1)!.toUpperCase():" · synth");
      button.title="Play this one sound (ignores category filters, respects master SFX)";
      button.addEventListener("click",()=>{
        if(!this.available)return;
        this.sfx?.audition(entry.id);
      });
      this.auditionList.append(button);
    }
    this.sfx?.onPreviewCue(event=>this.logEvent(event));
    this.setOpened(false);
    this.toggle.hidden=true;
  }

  private buildGroups<T extends SfxOwner|SfxFamily>(
    axis:SfxAxis,title:string,items:readonly {readonly id:T;readonly label:string}[],
  ):void {
    const section=document.createElement("section");
    section.className="sfx-debug-section";
    const heading=document.createElement("h3");
    heading.textContent=title;
    section.append(heading);
    const groups=document.createElement("div");
    groups.className="sfx-debug-groups";
    for(const item of items){
      const group=document.createElement("div");
      group.className="sfx-debug-group";
      const label=document.createElement("span");
      label.textContent=item.label;
      group.append(label);
      for(const mode of ["solo","mute"] as const){
        const button=document.createElement("button");
        button.type="button";
        button.dataset.axis=axis;
        button.dataset.id=item.id;
        button.dataset.mode=mode;
        button.textContent=mode==="solo"?"Solo":"Mute";
        button.setAttribute("aria-label",(mode==="solo"?"Solo ":"Mute ")+item.label);
        button.setAttribute("aria-pressed","false");
        button.addEventListener("click",()=>{
          if(!this.available)return;
          if(axis==="owner")this.sfx?.togglePreviewGroup("owner",item.id as SfxOwner,mode);
          else this.sfx?.togglePreviewGroup("family",item.id as SfxFamily,mode);
          this.render();
        });
        group.append(button);
        this.groupButtons.push(button);
      }
      groups.append(group);
    }
    section.append(groups);
    this.filters.append(section);
  }

  /** Switches off and clears all category isolation outside unsaved V training.
   * Returning from model inspection or the saved replay starts with a clean mix. */
  setAvailable(available:boolean):void {
    if(this.available===available)return;
    this.available=available;
    this.sfx?.setPreviewDebugActive(available);
    this.toggle.hidden=!available;
    if(!available){
      this.setOpened(false);
      this.events.replaceChildren();
    }
    this.render();
  }

  private setOpened(opened:boolean):void {
    this.opened=opened&&this.available;
    this.panel.hidden=!this.opened;
    this.toggle.setAttribute("aria-expanded",String(this.opened));
    this.toggle.setAttribute("aria-pressed",String(this.opened));
    this.toggle.textContent=this.opened?"Close SFX Lab":"SFX Lab";
    if(this.opened)this.render();
  }

  private render():void {
    if(!this.sfx)return;
    const state=this.sfx.previewFilters;
    for(const button of this.groupButtons){
      const axis=button.dataset.axis as SfxAxis;
      const id=button.dataset.id!;
      const mode=button.dataset.mode;
      const active=axis==="owner"
        ?(mode==="solo"?state.soloOwner===id:state.mutedOwners.has(id as SfxOwner))
        :(mode==="solo"?state.soloFamily===id:state.mutedFamilies.has(id as SfxFamily));
      button.dataset.active=String(active);
      button.setAttribute("aria-pressed",String(active));
    }
    const ambientAudible=passesSfxDebugFilter("world","environment",state);
    this.ambient.textContent="Lava ambience: "+(ambientAudible?"allowed":"filtered")+
      " (World + Environment)";
  }

  private logEvent(event:SfxDebugEvent):void {
    if(!this.available||!this.opened)return;
    const detail=SFX_CATALOG.find(item=>item.id===event.cue);
    const line=document.createElement("li");
    line.dataset.cue=event.cue;
    line.dataset.status=event.status;
    line.textContent=(event.audition?"[TEST] ":"")+
      (detail?.label??event.cue)+" · "+event.status;
    this.events.prepend(line);
    while(this.events.children.length>12)this.events.lastElementChild?.remove();
  }
}
