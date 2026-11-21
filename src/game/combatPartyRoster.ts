import type {CombatantSpec,GroupReplayFrame} from "./groupCombat.ts";
import type {AdventurerState} from "./adventurers.ts";
import {combatHeroCard,type HeroCardView} from "./heroCardView.ts";
import {renderHeroCard} from "../heroCard.ts";
import {inspectHeroCard} from "../worldHeroCards.ts";

interface Slot {
  readonly root:HTMLElement;
  readonly phase:HTMLElement;
  readonly status:HTMLElement;
  readonly damage:HTMLElement|null;
  readonly armor:HTMLElement|null;
  readonly stamina:HTMLElement|null;
}
/** Exactly one tactical party strip per opt-in arena. Existing Babylon
 * world-space HP plates remain the ONLY visual health bars in 3D.
 * Frame updates touch text nodes, not rebuilt card trees at 60 Hz. */
export class CombatPartyRoster {
  private readonly root=document.createElement("aside");
  private readonly slots=new Map<string,Slot>();
  private lastTime=-1;
  private intro=false;
  constructor(host:HTMLElement,
    private readonly specs:readonly CombatantSpec[],
    private readonly getName:(id:string)=>string,
    private readonly getLive:(id:string)=>AdventurerState|null,
    private readonly focus:(id:string)=>void,
    private readonly historical:boolean,
    private readonly training=false,
  ){
    this.root.className="hero-combat-roster";
    this.root.id=host.id==="arena-hud"?"arena-hero-party-roster":
      "dungeon-hero-party-roster";
    this.root.setAttribute("aria-label","Heroes participating in combat");
    const heroes=specs.filter(spec=>spec.team==="heroes");
    const header=document.createElement("strong");
    header.className="hero-combat-roster-heading";
    header.textContent="PARTY · "+heroes.length+
      (heroes.length===1?" HERO":" HEROES");
    this.root.append(header);
    const first:GroupReplayFrame={t:0,
      actors:heroes.map(spec=>({
        id:spec.id,x:spec.x,z:spec.z,hp:spec.hp,stamina:100,
        heading:0,phase:"move" as const,
      })),projectiles:[]};
    for(const spec of heroes){
      const view=this.view(spec,first);
      const card=renderHeroCard(view,"combat");
      card.tabIndex=0;card.setAttribute("role","button");
      card.setAttribute("aria-label","Focus fighter "+view.name);
      card.addEventListener("click",event=>{
        if((event.target as HTMLElement).closest(".hero-card-inspect"))return;
        this.focus(spec.id);this.markFocus(spec.id);
      });
      card.addEventListener("keydown",event=>{
        if(event.code==="Enter"||event.code==="Space"){
          event.preventDefault();this.focus(spec.id);this.markFocus(spec.id);
        }
      });
      const inspect=document.createElement("button");
      inspect.className="hero-card-inspect";
      inspect.type="button";inspect.title="Inspect "+view.name;
      inspect.setAttribute("aria-label","Inspect "+view.name);
      inspect.textContent="⊞";
      inspect.addEventListener("click",event=>{
        event.stopPropagation();
        inspectHeroCard(this.view(spec,this.currentFrame??first));
      });
      card.append(inspect);
      this.root.append(card);
      this.slots.set(spec.id,{
        root:card,
        phase:card.querySelector<HTMLElement>(".hero-card-phase-value")!,
        status:card.querySelector<HTMLElement>(".hero-card-status")!,
        damage:card.querySelector<HTMLElement>(".hero-card-combat-info .hero-card-metric:nth-child(1) .hero-card-metric-value"),
        armor:card.querySelector<HTMLElement>(".hero-card-combat-info .hero-card-metric:nth-child(2) .hero-card-metric-value"),
        stamina:card.querySelector<HTMLElement>(".hero-card-combat-info .hero-card-metric:last-child .hero-card-metric-value"),
      });
    }
    host.append(this.root);
  }
  private currentFrame:GroupReplayFrame|null=null;
  private view(spec:CombatantSpec,frame:GroupReplayFrame):HeroCardView{
    return combatHeroCard(spec,frame,{
      name:this.getName(spec.id),
      liveHero:this.historical?null:this.getLive(spec.id),
      training:this.training,
    });
  }
  setIntroActive(active:boolean):void{
    this.intro=active;this.root.hidden=active;
  }
  markFocus(heroId:string|null):void{
    for(const [id,slot] of this.slots)
      slot.root.dataset.focused=String(heroId===id);
  }
  show(frame:GroupReplayFrame):void{
    this.currentFrame=frame;
    if(this.intro||this.lastTime===frame.t)return;
    this.lastTime=frame.t;
    const actors=new Map(frame.actors.map(actor=>[actor.id,actor]));
    for(const [id,slot] of this.slots){
      const actor=actors.get(id);
      if(!actor){slot.root.hidden=true;continue;}
      slot.root.hidden=false;
      const phase=actor.hp<=0?"dead":actor.phase;
      slot.phase.textContent=phase.toUpperCase();
      slot.phase.parentElement!.dataset.phase=phase;
      slot.status.textContent=(this.historical?"RECORDED":"LIVE")+
        " · "+Math.round(actor.hp)+" HP";
      if(slot.stamina)slot.stamina.textContent=String(Math.round(actor.stamina));
      // The actual HP bar remains world anchored, not repeated here.
    }
  }
  dispose():void{this.root.remove();this.slots.clear();}
}
