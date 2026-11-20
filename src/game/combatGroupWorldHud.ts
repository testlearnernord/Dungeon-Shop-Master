import {Vector3} from "@babylonjs/core/Maths/math.vector";
import type {Engine} from "@babylonjs/core/Engines/engine";
import type {Scene} from "@babylonjs/core/scene";
import {CombatDamageNumbers,combatHudProjector,paintCombatHealthPlate}
  from "./combatHudProjection.ts";
import type {CombatantSpec,GroupReplayFrame} from "./groupCombat.ts";

type HealthPlate={root:HTMLElement;fill:HTMLElement;label:HTMLElement};

/**
 * Exactly the same world-anchored Level-6 health-bar and damage presentation,
 * extended to a list of actors. Multi-hero groups only change cardinality.
 * Neither HP differences nor floating numbers are written to GameState.
 */
export class CombatGroupWorldHud{
  private readonly root=document.createElement("div");
  private readonly plates=new Map<string,HealthPlate>();
  private readonly damageHost=document.createElement("div");
  private readonly numbers:CombatDamageNumbers;
  private current:GroupReplayFrame|null=null;
  private previous:GroupReplayFrame|null=null;
  constructor(
    private readonly engine:Engine,
    private readonly canvas:HTMLCanvasElement,
    host:HTMLElement,
    private readonly specs:readonly CombatantSpec[],
  ){
    this.root.id="group-combat-world-hud";
    this.root.className="arena-world-hud";
    this.root.setAttribute("aria-hidden","true");
    for(const spec of specs){
      const root=document.createElement("div");
      root.className="arena-actor-plate";
      root.dataset.actor=spec.team==="monsters"?"boss":"hero";
      root.dataset.actorId=spec.id;
      const label=document.createElement("span");
      label.className="arena-actor-label";
      const track=document.createElement("span");
      track.className="arena-health-track";
      const fill=document.createElement("span");
      fill.className="arena-health-fill";
      track.append(fill);root.append(label,track);
      this.root.append(root);
      this.plates.set(spec.id,{root,fill,label});
    }
    this.damageHost.className="arena-damage-numbers";
    this.root.append(this.damageHost);
    this.numbers=new CombatDamageNumbers(this.damageHost);
    host.append(this.root);
  }

  show(frame:GroupReplayFrame):void{
    if(this.current?.t===frame.t)return;
    this.previous=this.current;
    this.current=frame;
    // Cues for archived group combats may be outside frame payload. The
    // *recorded* HP delta is authoritative; suppress popups on replay seeks,
    // reloads, reverse scrubs or frame gaps instead of inventing hits.
    const previous=this.previous;
    if(!previous||frame.t<=previous.t||frame.t-previous.t>.25){
      this.numbers.reset();
      return;
    }
    const old=new Map(previous.actors.map(actor=>[actor.id,actor]));
    for(const actor of frame.actors){
      const prior=old.get(actor.id);
      const diff=prior?actor.hp-prior.hp:0;
      if(Math.abs(diff)<.5)continue;
      const spec=this.specs.find(s=>s.id===actor.id);
      this.numbers.push((diff>0?"+":"")+Math.round(diff),
        diff>0?"heal":spec?.team==="heroes"?"troll":"hero",
        new Vector3(actor.x,spec?.specialAbility==="grapple-throw"?7.2:2.5,actor.z));
    }
  }

  render(scene:Scene,frameDt:number):void{
    const frame=this.current;
    if(!frame)return;
    const project=combatHudProjector(scene,this.engine,this.canvas);
    const actors=new Map(frame.actors.map(actor=>[actor.id,actor]));
    for(const spec of this.specs){
      const slot=this.plates.get(spec.id)!;
      const actor=actors.get(spec.id);
      if(!actor){slot.root.hidden=true;continue;}
      const isBoss=spec.specialAbility==="grapple-throw";
      const name=isBoss?"CAVE TROLL":
        spec.team==="monsters"?"GHOUL":
          "HERO · "+spec.role.toUpperCase();
      paintCombatHealthPlate(slot.root,slot.fill,slot.label,
        project(new Vector3(actor.x,isBoss?7.4:
          spec.team==="monsters"?2.85:3.25,actor.z)),
        actor.hp,spec.maxHp,name);
    }
    this.numbers.render(project,frameDt);
  }
  dispose():void{
    this.numbers.reset();
    this.root.remove();
    this.plates.clear();
    this.current=null;this.previous=null;
  }
}
