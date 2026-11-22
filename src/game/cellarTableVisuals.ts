import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import {CELLAR_FLOOR_Y} from "./cellarRoom.ts";
import {furnitureDefinition} from "./furnitureRegistry.ts";
import "@babylonjs/loaders/glTF/2.0";

/** Presentation only: movement and save identity come from the shared GameStore.
 * The imported Tripo prop has one predictable physical collision hull. */
export function setupCellarTableVisuals(scene:Scene,store:GameStore):void{
  const def=furnitureDefinition("cellar-table");
  const root=new TransformNode("cellar-table-root",scene);
  const hull=MeshBuilder.CreateBox("cellar-table-collider",{
    width:def.width,height:def.height,depth:def.depth,
  },scene);
  hull.parent=root;hull.position.y=def.height/2;
  hull.visibility=0;hull.isPickable=false;hull.checkCollisions=true;

  // A pickable silhouette remains available if the GLB takes time to load.
  const backup=MeshBuilder.CreateBox("cellar-table-fallback",{
    width:def.width,height:.18,depth:def.depth,
  },scene);
  backup.parent=root;backup.position.y=def.height-.12;
  backup.checkCollisions=false;
  const material=new StandardMaterial("cellar-table-fallback-wood",scene);
  material.diffuseColor=new Color3(.19,.12,.07);
  backup.material=material;

  let previous:typeof store.state.cellarTable|null=null;
  const sync=()=>{
    const placement=store.state.cellarTable;
    if(placement===previous)return;
    previous=placement;
    root.position.set(placement.x,CELLAR_FLOOR_Y,placement.z);
    root.rotation.y=placement.rotation*Math.PI/2;
  };
  store.subscribe(sync);sync();

  const url=`${import.meta.env.BASE_URL}assets/models/galviks-table.glb`;
  void loadAssetContainerAsync(url,scene).then(container=>{
    const meshes=container.meshes.filter(
      (mesh):mesh is Mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0,
    );
    if(!meshes.length){
      container.dispose();
      throw new Error("Galvik's Table GLB has no renderable geometry");
    }
    const modelRoot=new TransformNode("cellar-table-model-root",scene);
    modelRoot.parent=root;
    // Tripo's original: 0.980255m wide, 0.508789m tall, 0.633514m deep.
    // Uniform scale matches the one authoritative furniture footprint.
    modelRoot.scaling.setAll(def.width/0.9802550673484802);
    container.addAllToScene();
    for(const node of [...container.meshes,...container.transformNodes])
      if(node.parent===null)node.parent=modelRoot;
    for(const [index,mesh] of meshes.entries()){
      mesh.name="cellar-table-model-"+index;
      mesh.isPickable=true;
      mesh.checkCollisions=false;
    }
    backup.dispose();
  }).catch(error=>{
    console.warn("Galvik's Table GLB unavailable; keeping pickable fallback.",error);
  });
}
