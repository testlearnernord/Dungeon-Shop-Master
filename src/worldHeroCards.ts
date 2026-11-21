import type {GameStore} from "./game/gameStore.ts";
import type {AdventurerState} from "./game/adventurers.ts";
import {liveHeroCard,type HeroCardView} from "./game/heroCardView.ts";
import {renderHeroCard} from "./heroCard.ts";

/** The single globally mounted inspector. Full cards can be pinned; mini
 * previews never steal input. This module creates NO world clock or scene. */
let currentHeroCards:WorldHeroCards|null=null;
export function inspectHeroCard(view:HeroCardView):boolean{
  if(!currentHeroCards)return false;
  if(view.source==="live")return currentHeroCards.open(view.id);
  currentHeroCards.openSnapshot(view);return true;
}
export function inspectHeroId(heroId:string):boolean{
  return currentHeroCards?.open(heroId)??false;
}
export function hoverHeroId(heroId:string,x:number,y:number):void{
  currentHeroCards?.showMini(heroId,x,y);
}
export function hideHeroHover():void{currentHeroCards?.hideMini();}


export class WorldHeroCards {
  private readonly host=document.createElement("aside");
  private readonly mini=document.createElement("aside");
  private current:string|null=null;
  private snapshot:HeroCardView|null=null;
  private lastRoster:readonly AdventurerState[]|null=null;
  constructor(private readonly store:GameStore){
    currentHeroCards=this;
    this.host.id="world-hero-card";
    this.host.hidden=true;
    this.host.setAttribute("aria-label","Hero profile");
    this.mini.id="world-hero-card-mini";
    this.mini.hidden=true;
    this.mini.setAttribute("aria-hidden","true");
    document.body.append(this.host,this.mini);
    document.addEventListener("keydown",event=>{
      if(event.code==="Escape"&&!this.host.hidden){
        event.preventDefault();event.stopPropagation();this.close();
      }
    },true);
    store.subscribe(()=>{
      if(this.host.hidden||!this.current||this.snapshot)return;
      if(this.lastRoster===store.state.adventurers)return;
      this.lastRoster=store.state.adventurers;
      const view=liveHeroCard(store.state,this.current);
      if(view)this.paint(view);
      else this.close();
    });
  }
  open(heroId:string):boolean {
    const view=liveHeroCard(this.store.state,heroId);
    if(!view)return false;
    this.snapshot=null;this.current=heroId;
    this.lastRoster=this.store.state.adventurers;
    this.paint(view);return true;
  }
  /** For historical combat: do not borrow future character stats or gear. */
  openSnapshot(view:HeroCardView):void{
    this.current=null;this.snapshot=view;this.paint(view);
  }
  private paint(view:HeroCardView):void {
    this.hideMini();
    const card=renderHeroCard(view,"expanded");
    const close=document.createElement("button");
    close.type="button";close.id="world-hero-card-close";
    close.textContent="×";close.title="Close hero card";
    close.setAttribute("aria-label","Close hero card");
    close.addEventListener("click",()=>this.close());
    this.host.replaceChildren(card,close);this.host.hidden=false;
  }
  close():void{
    this.current=null;this.snapshot=null;this.host.hidden=true;
    this.host.replaceChildren();this.hideMini();
  }
  showMini(heroId:string,clientX:number,clientY:number):void{
    if(!this.host.hidden)return;
    const hero=liveHeroCard(this.store.state,heroId);
    if(!hero)return;
    this.mini.replaceChildren(renderHeroCard(hero,"mini"));
    this.mini.hidden=false;
    // Flip near screen edges. No DOM-measurement loops in the render thread.
    const width=278,height=195;
    this.mini.style.left=Math.max(6,Math.min(innerWidth-width-6,
      clientX+17))+"px";
    this.mini.style.top=Math.max(6,Math.min(innerHeight-height-6,
      clientY+16))+"px";
  }
  hideMini():void{
    this.mini.hidden=true;this.mini.replaceChildren();
  }
  /** Hover/focus is unified across roster, world feed and future shop hits. */
  bindHover(element:HTMLElement,heroId:string):void{
    element.addEventListener("pointerenter",e=>
      this.showMini(heroId,e.clientX,e.clientY));
    element.addEventListener("pointermove",e=>{
      if(this.mini.hidden)return;
      const width=278,height=195;
      this.mini.style.left=Math.max(6,Math.min(innerWidth-width-6,
        e.clientX+17))+"px";
      this.mini.style.top=Math.max(6,Math.min(innerHeight-height-6,
        e.clientY+16))+"px";
    });
    element.addEventListener("pointerleave",()=>this.hideMini());
    element.addEventListener("focus",()=>{
      const r=element.getBoundingClientRect();
      this.showMini(heroId,r.left,r.bottom);
    });
    element.addEventListener("blur",()=>this.hideMini());
  }
}
