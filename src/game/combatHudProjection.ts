import {Matrix,Vector3} from "@babylonjs/core/Maths/math.vector";
import type {Engine} from "@babylonjs/core/Engines/engine";
import type {Scene} from "@babylonjs/core/scene";

export type CombatHudPoint={readonly x:number;readonly y:number};
export type CombatHudProjector=(position:Vector3)=>CombatHudPoint|null;

/** Level-6 spectator HP/damage projection, now used by every arena variant.
 * Only Babylon's committed/rendered camera matrices are inspected. */
export function combatHudProjector(
  scene:Scene,engine:Engine,canvas:HTMLCanvasElement,
):CombatHudProjector{
  const camera=scene.activeCamera;
  if(!camera)return ()=>null;
  const width=engine.getRenderWidth(),height=engine.getRenderHeight();
  const viewport=camera.viewport.toGlobal(width,height);
  const transform=scene.getTransformMatrix();
  const rect=canvas.getBoundingClientRect();
  const identity=Matrix.Identity();
  return (pos:Vector3)=>{
    const p=Vector3.Project(pos,identity,transform,viewport);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.z<0||p.z>1)return null;
    const x=rect.left+p.x/width*rect.width;
    const y=rect.top+p.y/height*rect.height;
    if(x<rect.left-40||x>rect.right+40||
       y<rect.top+45||y>rect.bottom-80)return null;
    return {x,y};
  };
}

export function paintCombatHealthPlate(
  plate:HTMLElement,fill:HTMLElement,label:HTMLElement,
  point:CombatHudPoint|null,hp:number,maxHp:number,name:string,
):void{
  plate.hidden=!point;
  const maximum=Math.max(1,maxHp);
  const health=Math.max(0,Math.min(maximum,hp));
  fill.style.width=(100*health/maximum).toFixed(1)+"%";
  label.textContent=name+"  "+Math.round(health)+"/"+Math.round(maximum);
  plate.dataset.hp=String(Math.round(health));
  plate.dataset.maxHp=String(Math.round(maximum));
  if(point){
    plate.style.left=point.x+"px";
    plate.style.top=point.y+"px";
  }
}

type Floating={element:HTMLElement;pos:Vector3;age:number;spread:number};
export class CombatDamageNumbers{
  private readonly floats:Floating[]=[];
  constructor(private readonly host:HTMLElement){}
  reset():void{
    for(const entry of this.floats)entry.element.remove();
    this.floats.length=0;
    this.host.replaceChildren();
  }
  push(text:string,tone:"hero"|"troll"|"lava"|"heal",
    origin:Vector3):void {
    const element=document.createElement("span");
    element.className="arena-damage-number";
    element.dataset.tone=tone;
    element.textContent=text;
    element.setAttribute("aria-hidden","true");
    this.host.append(element);
    this.floats.push({element,pos:origin.clone(),age:0,
      spread:(this.floats.length%5-2)*18});
    while(this.floats.length>14)this.floats.shift()!.element.remove();
  }
  render(project:CombatHudProjector,dt:number):void {
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
