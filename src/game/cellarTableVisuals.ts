import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {RenderTargetTexture} from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import {RawTexture} from "@babylonjs/core/Materials/Textures/rawTexture";
import {Texture} from "@babylonjs/core/Materials/Textures/texture";
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
  setDungeonTexture(texture:RenderTargetTexture|null):void;
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
  // StandardMaterial adds a constant emissiveColor to its shader output:
  // White() made the entire inset pure white regardless of the valid RTT.
  // An unlit diffuse texture displays the already-lit spectator pixels as-is.
  screenMat.diffuseColor=Color3.White();
  screenMat.emissiveColor=Color3.Black();
  screenMat.specularColor=Color3.Black();
  screenMat.disableLighting=true;
  screenMat.backFaceCulling=false;
  inset.material=screenMat;
  let modelReady=false;
  // A Babylon RTT owned by the spectator Scene is not directly reliable as
  // a texture sampled from the separate physical shop Scene. The screenshot
  // revealed black/white panes despite healthy RTT readback. Bridge only its
  // already-rendered RGBA pixels into a small texture owned by this shop.
  // This copies presentation pixels, NEVER a simulation or dungeon state.
  let source:RenderTargetTexture|null=null;
  let localTexture:RawTexture|null=null;
  let generation=0;
  let reading=false;
  let lastReadAt=-Infinity;
  const setDungeonTexture=(texture:RenderTargetTexture|null)=>{
    if(texture!==source){
      source=texture;
      generation++;
      localTexture?.dispose();
      localTexture=null;
      screenMat.diffuseTexture=null;
      inset.isVisible=false;
      lastReadAt=-Infinity;
    }
    if(!source||!modelReady||reading)return;
    const now=performance.now();
    if(now-lastReadAt<220)return; // near-table cap ~4.5 presentation FPS
    lastReadAt=now;
    reading=true;
    const requested=source!;
    const token=generation;
    void Promise.resolve(requested.readPixels()).then(pixels=>{
      if(!pixels||source!==requested||token!==generation)return;
      const size=requested.getSize();
      const bytes=new Uint8Array(pixels.buffer,pixels.byteOffset,
        pixels.byteLength);
      if(bytes.length!==size.width*size.height*4)return;
      if(!localTexture){
        localTexture=RawTexture.CreateRGBATexture(bytes,size.width,size.height,
          scene,false,true,Texture.BILINEAR_SAMPLINGMODE);
        localTexture.name=requested.name;
        screenMat.diffuseTexture=localTexture;
      }else localTexture.update(bytes);
      inset.isVisible=true;
    }).catch(error=>{
      // A floor change may dispose a pending RTT; never crash the shop.
      if(source===requested)console.warn("Galvik table frame unavailable",error);
    }).finally(()=>{reading=false;});
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
    inset.isVisible=localTexture!==null;
  }).catch(error=>{
    console.warn("Galvik's Table GLB unavailable; keeping pickable fallback.",error);
  });
  return {setDungeonTexture};
}
