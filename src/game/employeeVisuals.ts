import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import {EMPLOYEE_DEFINITIONS,type EmployeeState} from "./employees.ts";
import {createDungeonGhoulVisual} from "./dungeonGhoulVisual.ts";
import {employeeFloorY} from "./employeeNavigation.ts";
import {interpolateSavedShopPose} from "./shopVisualInterpolation.ts";
import {WORLD_TICK_SECONDS} from "./worldClock.ts";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {DynamicTexture} from "@babylonjs/core/Materials/Textures/dynamicTexture";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Mesh} from "@babylonjs/core/Meshes/mesh";

export function setupEmployeeVisuals(scene:Scene,store:GameStore){
  const models=EMPLOYEE_DEFINITIONS.map(def=>{
    const visual=createDungeonGhoulVisual(scene,def.id,"employee");
    const label=MeshBuilder.CreatePlane("employee-label-"+def.id,{width:1.4,height:.3},scene);
    label.parent=visual.root;label.position.y=2.16;label.billboardMode=Mesh.BILLBOARDMODE_ALL;
    label.isPickable=false;
    const texture=new DynamicTexture("employee-label-texture-"+def.id,{width:512,height:112},scene,true);
    texture.hasAlpha=true;
    texture.drawText(def.name,null,77,"bold 68px Georgia","#f2d294","transparent",true);
    const mat=new StandardMaterial("employee-label-material-"+def.id,scene);
    mat.diffuseTexture=texture;mat.opacityTexture=texture;mat.emissiveColor=Color3.White();
    mat.disableLighting=true;mat.backFaceCulling=false;label.material=mat;
    void visual.ready.then(ready=>{if(ready&&!visual.root.isDisposed())visual.root.setEnabled(true);});
    return {def,visual};
  });
  let prior=store.state.employees,current=prior;
  const unsubscribe=store.subscribe(()=>{
    const next=store.state.employees;
    if(next===current)return;
    prior=current;current=next;
  });
  const reset=()=>{prior=store.state.employees;current=prior;};
  const render=(alpha:number)=>{
    for(const {def,visual} of models){
      const e=current.find(v=>v.id===def.id);
      if(!e)continue;
      const old=prior.find(v=>v.id===def.id)??e;
      const pose=interpolateSavedShopPose(old,e,alpha);
      visual.root.position.set(pose.x,employeeFloorY(pose.z),pose.z);
      visual.root.rotation.y=pose.yaw;
      const walking=e.status==="walking"&&Math.hypot(e.x-old.x,e.z-old.z)>.001;
      visual.animate(walking?"move":"idle",e.lastStepTick*WORLD_TICK_SECONDS);
      Object.assign(visual.root.metadata,{employeeStatus:e.status,employeeTask:e.job?.task??null});
    }
  };
  render(1);
  scene.onDisposeObservable.addOnce(unsubscribe);
  return {render,reset};
}
