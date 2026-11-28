import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import type {HeroVisual} from "./heroVisual.ts";

const bars=new WeakMap<HeroVisual,{background:Mesh;fill:Mesh}>();
/** Shared read-only miniature/fullscreen pose. Progress is supplied only
 * by the saved world-clock search, never by a presentation timer. */
export function presentRemainsSearch(model:HeroVisual,progress:number|null):void{
  let bar=bars.get(model);
  if(progress===null){
    bar?.background.setEnabled(false);
    return;
  }
  if(!bar){
    const scene=model.root.getScene();
    const background=MeshBuilder.CreatePlane(model.root.name+"-search-bar",
      {width:1.45,height:.16},scene);
    background.parent=model.root;
    background.position.y=2.8;
    background.billboardMode=Mesh.BILLBOARDMODE_ALL;
    const dark=new StandardMaterial(background.name+"-track",scene);
    dark.disableLighting=true;dark.backFaceCulling=false;
    dark.emissiveColor=Color3.FromHexString("#242721");
    background.material=dark;
    const fill=MeshBuilder.CreatePlane(background.name+"-fill",{width:1.35,height:.10},scene);
    fill.parent=background;fill.position.z=-.015;
    const light=new StandardMaterial(fill.name+"-material",scene);
    light.disableLighting=true;light.backFaceCulling=false;
    light.emissiveColor=Color3.FromHexString("#dfbb78");
    fill.material=light;
    for(const mesh of [background,fill]){mesh.isPickable=false;mesh.checkCollisions=false;}
    bar={background,fill};bars.set(model,bar);
  }
  const fraction=Math.min(1,Math.max(0,progress));
  bar.background.setEnabled(true);
  bar.fill.scaling.x=Math.max(.001,fraction);
  bar.fill.position.x=-.675+.675*fraction;
  const phase=fraction*Math.PI*8;
  model.root.position.y-=.17;
  model.legs[0].rotation.x=-.8;model.legs[1].rotation.x=.6;
  model.arms[0].rotation.x=-.7+Math.sin(phase)*.22;
  model.arms[1].rotation.x=-.7-Math.sin(phase)*.22;
  model.weaponPivot.rotation.x=0;
  model.root.metadata.combatPhase="looting";
}
