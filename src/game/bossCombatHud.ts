import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import type { CombatPreviewState, ArenaCue } from "./arenaCombatMotion.ts";
import { BOSS_MAX_HP } from "./arenaCombatMotion.ts";
import { combatPopupForCue } from "./bossHudPresentation.ts";

type Floating = { element:HTMLElement; pos:Vector3; age:number; spread:number };

/** Noninteractive HUD projected from the same world positions as the motor.
 * It reads only confirmed cues and current/replayed HP; no parallel combat.
 */
export class BossCombatHud {
  private readonly identity=Matrix.Identity();
  private readonly world:HTMLElement;
  private readonly heroPlate:HTMLElement;
  private readonly bossPlate:HTMLElement;
  private readonly heroFill:HTMLElement;
  private readonly bossFill:HTMLElement;
  private readonly heroText:HTMLElement;
  private readonly bossText:HTMLElement;
  private readonly numbers:HTMLElement;
  private readonly floats:Floating[]=[];

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
  }

  reset():void{
    for(const entry of this.floats)entry.element.remove();
    this.floats.length=0;
    this.heroPlate.hidden=true;
    this.bossPlate.hidden=true;
    this.numbers.replaceChildren();
  }

  pushCue(cue:ArenaCue,state:CombatPreviewState):void{
    const popup=combatPopupForCue(cue);
    if(!popup||this.panel.dataset.intro==="true")return;
    const origin=popup.target==="hero"?state.hero:state.boss;
    const element=document.createElement("span");
    element.className="arena-damage-number";
    element.dataset.tone=popup.tone;
    element.textContent=popup.text;
    element.setAttribute("aria-hidden","true");
    this.numbers.append(element);
    this.floats.push({
      element,
      pos:new Vector3(origin.x,popup.target==="hero"?2.5:5.9,origin.z),
      age:0,
      spread:(this.floats.length%5-2)*18,
    });
    while(this.floats.length>14)this.floats.shift()!.element.remove();
  }

  render(scene:Scene,state:CombatPreviewState,dt:number,bossMax:number,
    visibleHeroRoot?:Vector3):void{
    const visible=!this.panel.hidden&&this.panel.dataset.intro!=="true";
    this.world.hidden=!visible;
    if(!visible)return;
    const camera=scene.activeCamera;
    if(!camera)return;
    const renderWidth=this.engine.getRenderWidth();
    const renderHeight=this.engine.getRenderHeight();
    const viewport=camera.viewport.toGlobal(renderWidth,renderHeight);
    const transform=scene.getTransformMatrix();
    const canvasRect=this.canvas.getBoundingClientRect();
    const project=(pos:Vector3):{x:number;y:number}|null=>{
      const p=Vector3.Project(pos,this.identity,transform,viewport);
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||
        p.z<0||p.z>1)return null;
      const x=canvasRect.left+p.x/renderWidth*canvasRect.width;
      const y=canvasRect.top+p.y/renderHeight*canvasRect.height;
      if(x<canvasRect.left-40||x>canvasRect.right+40||
        y<canvasRect.top+45||y>canvasRect.bottom-80)return null;
      return {x,y};
    };
    const showPlate=(plate:HTMLElement,fill:HTMLElement,label:HTMLElement,
      pos:Vector3,hp:number,max:number,name:string):void=>{
      const point=project(pos);
      plate.hidden=!point;
      const safeMax=Math.max(1,max);
      const health=Math.max(0,Math.min(safeMax,hp));
      fill.style.width=(100*health/safeMax).toFixed(1)+"%";
      label.textContent=name+"  "+Math.round(health)+"/"+Math.round(safeMax);
      plate.dataset.hp=String(Math.round(health));
      plate.dataset.maxHp=String(Math.round(safeMax));
      if(point){
        plate.style.left=point.x+"px";
        plate.style.top=point.y+"px";
      }
    };
    // Health plate follows the actually animated and airborne hero model;
    // the numeric HP still comes ONLY from the authoritative motor/replay.
    showPlate(this.heroPlate,this.heroFill,this.heroText,
      visibleHeroRoot ? visibleHeroRoot.add(new Vector3(0,3.25,0))
        : new Vector3(state.hero.x,3.25,state.hero.z),
      state.heroHp,state.options.maxHealth,"HERO");
    showPlate(this.bossPlate,this.bossFill,this.bossText,
      new Vector3(state.boss.x,7.4,state.boss.z),
      state.bossHp,bossMax>0?bossMax:BOSS_MAX_HP,"CAVE TROLL");
    for(let i=this.floats.length-1;i>=0;i--){
      const item=this.floats[i]!;
      item.age+=Math.max(0,dt);
      const point=project(item.pos);
      if(item.age>1.6){
        item.element.remove();this.floats.splice(i,1);continue;
      }
      item.element.hidden=!point;
      if(point){
        item.element.style.left=(point.x+item.spread)+"px";
        item.element.style.top=(point.y-Math.min(50,item.age*42))+"px";
        item.element.style.opacity=String(Math.min(1,(1.6-item.age)/.52));
      }
    }
  }
}
