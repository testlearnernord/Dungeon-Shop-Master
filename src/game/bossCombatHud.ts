import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {CombatDamageNumbers,combatHudProjector,paintCombatHealthPlate} from "./combatHudProjection.ts";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import type { CombatPreviewState, ArenaCue } from "./arenaCombatMotion.ts";
import { BOSS_MAX_HP } from "./arenaCombatMotion.ts";
import { combatPopupForCue } from "./bossHudPresentation.ts";

/** Noninteractive HUD projected from the same world positions as the motor.
 * It reads only confirmed cues and current/replayed HP; no parallel combat.
 */
export class BossCombatHud {
  private readonly world:HTMLElement;
  private readonly heroPlate:HTMLElement;
  private readonly bossPlate:HTMLElement;
  private readonly heroFill:HTMLElement;
  private readonly bossFill:HTMLElement;
  private readonly heroText:HTMLElement;
  private readonly bossText:HTMLElement;
  private readonly numbers:HTMLElement;
  private readonly floaters:CombatDamageNumbers;

  constructor(
    private readonly panel:HTMLElement,
    private readonly canvas:HTMLCanvasElement,
    private readonly engine:Engine,
  ){
    const find=(id:string):HTMLElement=>{
      const element=panel.querySelector<HTMLElement>("#"+id);
      if(!element)throw Error("Missing boss spectator HUD: "+id);
      return element;
    };
    this.world=find("arena-world-hud");
    this.heroPlate=find("arena-hero-plate");
    this.bossPlate=find("arena-boss-plate");
    this.heroFill=find("arena-hero-bar-fill");
    this.bossFill=find("arena-boss-bar-fill");
    this.heroText=find("arena-hero-bar-label");
    this.bossText=find("arena-boss-bar-label");
    this.numbers=find("arena-damage-numbers");
    this.floaters=new CombatDamageNumbers(this.numbers);
  }

  reset():void{
    this.floaters.reset();
    this.heroPlate.hidden=true;
    this.bossPlate.hidden=true;
  }

  pushCue(cue:ArenaCue,state:CombatPreviewState):void{
    const popup=combatPopupForCue(cue);
    if(!popup||this.panel.dataset.intro==="true")return;
    const origin=popup.target==="hero"?state.hero:state.boss;
    this.floaters.push(popup.text,popup.tone,new Vector3(
      origin.x,popup.target==="hero"?2.5:5.9,origin.z));
  }

  render(scene:Scene,state:CombatPreviewState,dt:number,bossMax:number,
    visibleHeroRoot?:Vector3):void{
    const visible=!this.panel.hidden&&this.panel.dataset.intro!=="true";
    this.world.hidden=!visible;
    if(!visible)return;
    const project=combatHudProjector(scene,this.engine,this.canvas);
    // Health plate follows the actually animated and airborne hero model;
    // the numeric HP still comes ONLY from the authoritative motor/replay.
    paintCombatHealthPlate(this.heroPlate,this.heroFill,this.heroText,
      project(visibleHeroRoot ? visibleHeroRoot.add(new Vector3(0,3.25,0))
        : new Vector3(state.hero.x,3.25,state.hero.z)),
      state.heroHp,state.options.maxHealth,"HERO");
    paintCombatHealthPlate(this.bossPlate,this.bossFill,this.bossText,
      project(new Vector3(state.boss.x,7.4,state.boss.z)),
      state.bossHp,bossMax>0?bossMax:BOSS_MAX_HP,"CAVE TROLL");
    this.floaters.render(project,dt);
  }
}
