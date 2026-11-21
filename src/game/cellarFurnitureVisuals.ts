import {Color3} from "@babylonjs/core/Maths/math.color";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import {getDungeonSurfaces} from "./dungeonSurfaces.ts";
import {CELLAR_FLOOR_Y} from "./cellarRoom.ts";

/** One ordinary saved fixture through the shared furniture registry and P
 * editor. No second placement controller or parallel inventory. */
export function setupCellarFurnitureVisuals(scene:Scene,store:GameStore):void{
  const surfaces=getDungeonSurfaces(scene);
  const root=new TransformNode("cellar-chest-root",scene);
  const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number)=>{
    const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
    mesh.parent=root;mesh.position.set(x,y,z);
    mesh.material=surfaces.wood;mesh.isPickable=true;mesh.checkCollisions=false;
    return mesh;
  };
  box("cellar-chest-body",1.04,.64,.72,0,.34,0);
  const lid=box("cellar-chest-lid",1.10,.14,.76,0,.73,0);
  lid.material=surfaces.woodEdge;
  const metal=new StandardMaterial("cellar-chest-iron",scene);
  metal.diffuseColor=new Color3(.18,.20,.21);
  box("cellar-chest-clasp",.13,.22,.05,0,.48,.385).material=metal;
  for(const x of [-.32,.32])
    box("cellar-chest-strap-"+x,.09,.13,.8,x,.63,0).material=metal;
  const hull=box("cellar-chest-collider",1.04,.9,.72,0,.45,0);
  hull.checkCollisions=true;hull.isPickable=false;hull.visibility=0;
  let previous:typeof store.state.cellarChest|null=null;
  const sync=()=>{
    if(store.state.cellarChest===previous)return;
    previous=store.state.cellarChest;
    root.position.set(previous.x,CELLAR_FLOOR_Y,previous.z);
    root.rotation.y=previous.rotation*Math.PI/2;
  };
  store.subscribe(sync);sync();
}
