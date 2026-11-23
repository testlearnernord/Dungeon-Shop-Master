import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import {furnitureDefinition} from "./furnitureRegistry.ts";
import {worldClockFace} from "./worldClockFace.ts";
import "@babylonjs/loaders/glTF/2.0";

/** A visual read-only observer of GameState.worldClock.
 * The Tripo body is static. A separate spear-shaped pointer is controlled
 * directly by the one saved tick; no animation loop or clock is spawned.
 */
export function setupWorldClockVisuals(scene:Scene,store:GameStore):void{
  const def=furnitureDefinition("world-clock");
  const mount=new TransformNode("world-clock-mount",scene);
  let lastPlacement:typeof store.state.wallClock|null=null;
  const align=()=>{
    const pose=store.state.wallClock;
    if(pose===lastPlacement)return;
    lastPlacement=pose;
    mount.position.set(pose.x,0,pose.z);
    // Existing wall placement rotations describe a -Z-facing plane.
    // Tripo's asset faces +Z, so add a half-turn once on the shared root.
    mount.rotation.y=(pose.rotation+2)*Math.PI/2;
  };
  store.subscribe(align);
  align();

  const backupRoot=new TransformNode("world-clock-fallback-root",scene);
  backupRoot.parent=mount;
  const agedBronze=new StandardMaterial("world-clock-bronze",scene);
  agedBronze.diffuseColor=new Color3(.49,.27,.105);
  agedBronze.specularColor=new Color3(.45,.30,.14);
  const darkDial=new StandardMaterial("world-clock-fallback-slate",scene);
  darkDial.diffuseColor=new Color3(.11,.08,.14);
  darkDial.emissiveColor=new Color3(.035,.015,.075);
  const violet=new StandardMaterial("world-clock-violet-runes",scene);
  violet.diffuseColor=new Color3(.50,.16,.72);
  violet.emissiveColor=new Color3(.24,.05,.40);

  // Self-contained wall-prop fallback while GLB is loading. Its body is
  // intentionally non-physical, just like the existing Adventurer Board.
  const dial=MeshBuilder.CreateCylinder("world-clock-fallback-dial",{
    diameter:2.22,height:.14,tessellation:64,
  },scene);
  dial.parent=backupRoot;dial.position.set(0,1.99,0);
  dial.rotation.x=Math.PI/2;dial.material=darkDial;
  dial.isPickable=true;dial.checkCollisions=false;
  const outer=MeshBuilder.CreateTorus("world-clock-fallback-rim",{
    diameter:2.29,thickness:.10,tessellation:64,
  },scene);
  outer.parent=backupRoot;outer.position.set(0,1.99,.10);
  outer.rotation.x=Math.PI/2;outer.material=agedBronze;
  outer.isPickable=true;outer.checkCollisions=false;
  for(let index=0;index<24;index++){
    const angle=index*Math.PI/12;
    const mark=MeshBuilder.CreateBox("world-clock-fallback-rune-"+index,{
      width:index%6===0?.11:.05,
      height:index%6===0?.18:.12,depth:.025,
    },scene);
    mark.parent=backupRoot;
    mark.position.set(Math.sin(angle)*.92,1.99+Math.cos(angle)*.92,.17);
    mark.rotation.z=-angle;
    mark.material=violet;mark.isPickable=true;mark.checkCollisions=false;
  }

  // Clock dial in original Tripo GLB: X +/-0.493, Y 0..0.919, Z +/-0.103.
  // A single uniform scale gives 2.35 metres overall height; the clock
  // face centre sits around Y=.49. The spear sits in front of the maximum Z.
  const assetScale=def.height/.91888427734375;
  const pivot=new TransformNode("world-clock-pointer-pivot",scene);
  pivot.parent=mount;
  pivot.position.set(0,.75+.49*assetScale,.103*assetScale+.09);
  const spearMetal=new StandardMaterial("world-clock-pointer-aged-gold",scene);
  spearMetal.diffuseColor=new Color3(.55,.31,.105);
  spearMetal.specularColor=new Color3(.72,.52,.23);
  const spearCrystal=new StandardMaterial("world-clock-pointer-amethyst",scene);
  spearCrystal.diffuseColor=new Color3(.48,.14,.78);
  spearCrystal.emissiveColor=new Color3(.32,.06,.53);
  const shaft=MeshBuilder.CreateCylinder("world-clock-pointer-shaft",{
    diameterBottom:.12,diameterTop:.04,height:.66,tessellation:8,
  },scene);
  shaft.parent=pivot;shaft.position.y=.31;
  shaft.material=spearMetal;shaft.checkCollisions=false;
  const spearhead=MeshBuilder.CreateCylinder("world-clock-pointer-spearhead",{
    diameterBottom:.18,diameterTop:0,height:.30,tessellation:4,
  },scene);
  spearhead.parent=pivot;spearhead.position.y=.79;
  spearhead.material=spearCrystal;spearhead.checkCollisions=false;
  const gemstone=MeshBuilder.CreateSphere("world-clock-pointer-gem",{
    diameter:.18,segments:8,
  },scene);
  gemstone.parent=pivot;gemstone.position.y=.20;
  gemstone.scaling.set(.70,1.35,.52);
  gemstone.material=spearCrystal;gemstone.checkCollisions=false;
  const pivotCap=MeshBuilder.CreateSphere("world-clock-pointer-cap",{
    diameter:.24,segments:12,
  },scene);
  pivotCap.parent=mount;
  pivotCap.position.copyFrom(pivot.position);
  pivotCap.position.z+=.04;
  pivotCap.material=spearMetal;pivotCap.checkCollisions=false;
  for(const mesh of [shaft,spearhead,gemstone,pivotCap])
    mesh.isPickable=true;

  let observedDay=0,observedTick=-1;
  const synchronizeTime=()=>{
    const {day,worldClock}=store.state;
    if(day===observedDay&&worldClock.tick===observedTick)return;
    observedDay=day;observedTick=worldClock.tick;
    const face=worldClockFace(day,worldClock.tick);
    pivot.rotation.z=face.angleRadians;
    spearCrystal.diffuseColor=face.stopped
      ?new Color3(.86,.12,.17):new Color3(.48,.14,.78);
    spearCrystal.emissiveColor=face.stopped
      ?new Color3(.83,.03,.07):new Color3(.32,.06,.53);
  };
  store.subscribe(synchronizeTime);
  synchronizeTime();

  const url=import.meta.env.BASE_URL+"assets/models/galviks-world-clock.glb";
  void loadAssetContainerAsync(url,scene).then(container=>{
    const physicalMeshes=container.meshes.filter(
      (mesh):mesh is Mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0);
    if(!physicalMeshes.length){
      container.dispose();
      throw new Error("World clock GLB has no geometry.");
    }
    const modelRoot=new TransformNode("world-clock-model-root",scene);
    modelRoot.parent=mount;
    modelRoot.position.y=.75;
    modelRoot.scaling.setAll(assetScale);
    container.addAllToScene();
    for(const node of [...container.meshes,...container.transformNodes]){
      if(node.parent===null)node.parent=modelRoot;
    }
    for(const [index,mesh] of physicalMeshes.entries()){
      mesh.name="world-clock-model-"+index;
      mesh.isPickable=true;
      mesh.checkCollisions=false;
    }
    backupRoot.setEnabled(false);
  }).catch(error=>{
    console.warn("World Clock GLB unavailable. Keeping functional face.",error);
  });
}
