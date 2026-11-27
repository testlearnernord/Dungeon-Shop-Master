import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import {EMPLOYEE_DEFINITIONS} from "./employees.ts";
import {createDungeonGhoulVisual} from "./dungeonGhoulVisual.ts";
import {employeeFloorY} from "./employeeNavigation.ts";
import {interpolateSavedShopPose} from "./shopVisualInterpolation.ts";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {DynamicTexture} from "@babylonjs/core/Materials/Textures/dynamicTexture";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {getShopStockTemplates,cloneShopStockModel} from "./shopStockAssets.ts";
import type {ItemId} from "./economy.ts";

export function setupEmployeeVisuals(scene:Scene,store:GameStore){
  let templates:ReadonlyMap<ItemId,Mesh>|null=null;
  void getShopStockTemplates(scene).then(value=>{templates=value;}).catch(error=>console.error("Employee stock visuals",error));
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
    return {def,visual,cargo:null as Mesh|null,cargoId:null as ItemId|null,
      phase:"idle" as "idle"|"move",phaseTime:0,lastX:null as number|null,lastZ:null as number|null,walkGrace:0};
  });
  let prior=store.state.employees,current=prior;
  const unsubscribe=store.subscribe(()=>{
    const next=store.state.employees;
    if(next===current)return;
    prior=next.some(e=>e.lastStepTick<(current.find(p=>p.id===e.id)?.lastStepTick??0))?next:current;
    current=next;
  });
  const reset=()=>{prior=store.state.employees;current=prior;
    for(const model of models){model.phase="idle";model.phaseTime=0;model.lastX=null;model.lastZ=null;model.walkGrace=0;}
  };
  const render=(alpha:number)=>{
    const dt=Math.min(.1,Math.max(0,scene.getEngine().getDeltaTime()/1000));
    for(const model of models){
      const {def,visual}=model;
      const e=current.find(v=>v.id===def.id);
      if(!e)continue;
      const old=prior.find(v=>v.id===def.id)??e;
      const pose=interpolateSavedShopPose(old,e,alpha);
      visual.root.position.set(pose.x,employeeFloorY(pose.z),pose.z);
      visual.root.rotation.y=pose.yaw;
      // The committed employee clock freezes when all jobs are disabled.
      // Animation is a read-only presentation clock, never a work timer.
      const moving=model.lastX!==null&&model.lastZ!==null&&
        Math.hypot(pose.x-model.lastX,pose.z-model.lastZ)>.0001;
      model.lastX=pose.x;model.lastZ=pose.z;
      model.walkGrace=moving?.12:Math.max(0,model.walkGrace-dt);
      const phase=e.status==="walking"&&model.walkGrace>0?"move":"idle";
      if(model.phase!==phase){model.phase=phase;model.phaseTime=0;}
      else model.phaseTime+=dt;
      visual.animate(phase,model.phaseTime);
      const cargo=e.restock&&e.restock.stage!=="collect"?e.restock:null;
      const cargoId=cargo?.itemId??null;
      if(cargoId!==model.cargoId||cargoId&&templates&&!model.cargo){
        model.cargo?.dispose();model.cargo=null;model.cargoId=cargoId;
        const template=cargoId?templates?.get(cargoId):null;
        if(template){
          const mesh=cloneShopStockModel(template,"employee-cargo-"+e.id);
          mesh.parent=visual.root;mesh.position.set(0,1.10,.47);
          mesh.scaling.setAll(.85);mesh.isPickable=false;mesh.checkCollisions=false;
          model.cargo=mesh;
        }
      }
      Object.assign(visual.root.metadata,{employeeStatus:e.status,employeeTask:e.job?.task??null,
        cargoItem:cargoId,cargoUnits:cargo?.units??0});
    }
  };
  render(1);
  scene.onDisposeObservable.addOnce(unsubscribe);
  return {render,reset};
}
