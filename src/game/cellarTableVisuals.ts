import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import {Color3} from "@babylonjs/core/Maths/math.color";
import type {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import {CELLAR_FLOOR_Y} from "./cellarRoom.ts";
import {furnitureDefinition} from "./furnitureRegistry.ts";
import {GalviksTableDiorama} from "./galviksTableDiorama.ts";
import "@babylonjs/loaders/glTF/2.0";

/** The physical furniture and its child mini-world share the same transform.
 * The shop is still the only rendered Scene and the only FPS control owner. */
export interface CellarTableVisuals {
  updateLiveFloor(selectedFloor:number,cameraPosition:Vector3):void;
}
export function setupCellarTableVisuals(scene:Scene,store:GameStore):CellarTableVisuals{
  const def=furnitureDefinition("cellar-table");
  const root=new TransformNode("cellar-table-root",scene);
  const hull=MeshBuilder.CreateBox("cellar-table-collider",{
    width:def.width,height:def.height,depth:def.depth,
  },scene);
  hull.parent=root;hull.position.y=def.height/2;
  hull.visibility=0;hull.isPickable=false;hull.checkCollisions=true;

  // Preserve the original fallback and entire imported furniture silhouette.
  const backup=MeshBuilder.CreateBox("cellar-table-fallback",{
    width:def.width,height:.18,depth:def.depth,
  },scene);
  backup.parent=root;backup.position.y=def.height-.12;
  backup.checkCollisions=false;
  const material=new StandardMaterial("cellar-table-fallback-wood",scene);
  material.diffuseColor=new Color3(.19,.12,.07);
  backup.material=material;

  // Unlike the legacy 2D RTT, this is actual local-space 3D geometry. It
  // follows existing P movement and Q/R rotation, without another renderer.
  const diorama=new GalviksTableDiorama(scene,root);
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
    // Original Tripo model: 0.980255m wide, 0.508789m tall, 0.633514m deep.
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
    diorama.setModelReady();
  }).catch(error=>{
    console.warn("Galvik's Table GLB unavailable; keeping pickable fallback.",error);
  });

  return {
    updateLiveFloor:(selectedFloor,cameraPosition)=>{
      diorama.update(selectedFloor,store.state,cameraPosition);
    },
  };
}
