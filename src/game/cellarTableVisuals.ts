import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import type {BaseTexture} from "@babylonjs/core/Materials/Textures/baseTexture";
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
export interface CellarTableVisuals {
  /** A read-only texture from the existing spectator renderer, not a UI. */
  setDungeonTexture(texture:BaseTexture|null):void;
}
export function setupCellarTableVisuals(scene:Scene,store:GameStore):CellarTableVisuals{
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

  // The inset is a real 3D plane INSIDE the dark recessed panel of the
  // movable GLB, never a fullscreen HUD or a second copy of the tabletop.
  // Coordinates are local to the shared furniture root, so P repositioning
  // and Q/R rotation carry the image along with the entire table.
  // Raycast sampling of the loaded GLB measured the recessed surface at
  // y=.795-.815m above the cellar floor (center x=±.4m,z=-.32..+.28m).
  // Previous hard-coded .83*1.4m was ~35cm ABOVE the well! Keep the plane
  // above its inset floor but BELOW the raised metal/wood rim at ~.9m.
  const inset=MeshBuilder.CreatePlane("cellar-table-live-inset",{
    width:1.215,height:.70,
  },scene);
  inset.parent=root;
  inset.position.set(0,.827,-.095);
  inset.rotation.x=-Math.PI/2; // face the ceiling, parallel to the recess
  inset.isPickable=false;
  inset.checkCollisions=false;
  inset.isVisible=false;
  const screenMat=new StandardMaterial("cellar-table-live-inset-mat",scene);
  // The very dark RTT should remain readable in the unlit cellar, rather
  // than receiving another diffuse/light attenuation on the GLB.
  screenMat.diffuseColor=Color3.Black();
  screenMat.emissiveColor=Color3.White();
  screenMat.specularColor=Color3.Black();
  screenMat.disableLighting=true;
  screenMat.backFaceCulling=false;
  inset.material=screenMat;
  let modelReady=false;
  let dungeonTexture:BaseTexture|null=null;
  const setDungeonTexture=(texture:BaseTexture|null)=>{
    if(dungeonTexture===texture)return;
    dungeonTexture=texture;
    screenMat.emissiveTexture=texture;
    inset.isVisible=modelReady&&texture!==null;
  };

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
    modelReady=true;
    inset.isVisible=dungeonTexture!==null;
  }).catch(error=>{
    console.warn("Galvik's Table GLB unavailable; keeping pickable fallback.",error);
  });
  return {setDungeonTexture};
}
