import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import {PointLight} from "@babylonjs/core/Lights/pointLight";
import type { GameStore } from "./gameStore.ts";
import { BEDROOM_DEFAULTS, getBedroomFurniture,
  type BedroomFurnitureId } from "./bedroomFurniture.ts";

/** A module is the existing visible geometry, its invisible player collision
 * hull, and any dependent interaction mesh or light. Reparenting preserves the
 * world-space position and mesh identity (including E/click on the debt book).
 */
export function setupBedroomFurnitureVisuals(scene:Scene,store:GameStore):void {
  const groups=new Map<BedroomFurnitureId,TransformNode>();
  const belongs:Record<BedroomFurnitureId,(name:string)=>boolean>={
    desk:name=>name==="bedroom-desk"||name.startsWith("bedroom-desk-leg-")||
      name.startsWith("bedroom-account-")||name==="bedroom-inkwell"||
      name==="bedroom-quill"||name==="bedroom-furniture-collider-desk",
    chest:name=>name==="galvik-bed-chest"||name.startsWith("bed-chest-")||
      name==="bedroom-furniture-collider-chest",
    candle:name=>name==="bed-side-stool"||name==="bed-side-stool-top"||
      name.startsWith("bed-candle")||
      name==="bedroom-furniture-collider-candle-stool",
    bed:name=>name==="galvik-bed"||(name.startsWith("bed-")&&
      !name.startsWith("bed-candle")&&!name.startsWith("bed-chest")&&
      !name.startsWith("bed-side-")),
  };
  for(const base of BEDROOM_DEFAULTS){
    const root=new TransformNode("bedroom-module-"+base.id,scene);
    root.position.set(base.x,0,base.z);
    for(const mesh of scene.meshes){
      if(!belongs[base.id](mesh.name))continue;
      mesh.computeWorldMatrix(true);
      mesh.setParent(root);
    }
    if(base.id==="candle"){
      const light=scene.getLightByName("galvik-bed-candle") as PointLight|null;
      if(light){
        light.parent=root;
        const location=light.position;
        location.set(0,1.15,0);
      }
    }
    groups.set(base.id,root);
  }
  const sync=()=>{
    const placements=store.state.bedroomFurniture;
    for(const base of BEDROOM_DEFAULTS){
      const root=groups.get(base.id)!;
      const p=getBedroomFurniture(placements,base.id);
      root.position.set(p.x,0,p.z);
      root.rotation.y=p.rotation*Math.PI/2;
    }
  };
  store.subscribe(sync);
  sync();
}
