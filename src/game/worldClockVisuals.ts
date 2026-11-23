import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {VertexData} from "@babylonjs/core/Meshes/mesh.vertexData";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import {furnitureDefinition} from "./furnitureRegistry.ts";
import {worldClockFace} from "./worldClockFace.ts";
import {worldClockHandMount} from "./worldClockHandDesign.ts";
import "@babylonjs/loaders/glTF/2.0";

/** A thin, faceted metal plate made from cross-sections rather than a tall
 * cylinder. Each segment has real front/back faces and edge thickness. */
function createClockBlade(
  scene:Scene,name:string,profile:readonly (readonly [number,number])[],
  zCenter:number,thickness:number,material:StandardMaterial,
):Mesh{
  const mesh=new Mesh(name,scene);
  const positions:number[]=[];
  const indices:number[]=[];
  for(const [y,halfWidth] of profile)
    positions.push(
      -halfWidth,y,zCenter-thickness/2,halfWidth,y,zCenter-thickness/2,
      -halfWidth,y,zCenter+thickness/2,halfWidth,y,zCenter+thickness/2,
    );
  for(let i=0;i<profile.length-1;i++){
    const a=4*i,b=a+4;
    // Front, back, both beveled silhouette edges
    indices.push(a+2,a+3,b+3,a+2,b+3,b+2);
    indices.push(a,b+1,a+1,a,b,b+1);
    indices.push(a,b,b+2,a,b+2,a+2);
    indices.push(a+1,a+3,b+3,a+1,b+3,b+1);
  }
  const top=4*(profile.length-1);
  indices.push(0,1,3,0,3,2,top,top+2,top+3,top,top+3,top+1);
  const normals:number[]=[];
  VertexData.ComputeNormals(positions,indices,normals);
  const data=new VertexData();
  data.positions=positions;
  data.indices=indices;
  data.normals=normals;
  data.applyToMesh(mesh);
  mesh.material=material;
  mesh.checkCollisions=false;
  mesh.isPickable=true;
  return mesh;
}

/** Build a baroque pointer inspired by the GLB's forged bronze, eye sigils
 * and faceted violet stones. All parts use the SAME rotating pivot, except
 * its small decorative centre boss. No additional asset or animation clock. */
function buildClockHand(scene:Scene,mount:TransformNode,center:Vector3){
  const pivot=new TransformNode("world-clock-pointer-pivot",scene);
  pivot.parent=mount;
  pivot.position.copyFrom(center);

  const blackenedBronze=new StandardMaterial("world-clock-hand-blackened-bronze",scene);
  blackenedBronze.diffuseColor=new Color3(.20,.115,.061);
  blackenedBronze.specularColor=new Color3(.30,.22,.12);
  const antiqueGold=new StandardMaterial("world-clock-hand-antique-gold",scene);
  antiqueGold.diffuseColor=new Color3(.47,.285,.105);
  antiqueGold.specularColor=new Color3(.63,.43,.20);
  const brightEngraving=new StandardMaterial("world-clock-hand-gilded-engraving",scene);
  brightEngraving.diffuseColor=new Color3(.68,.46,.21);
  brightEngraving.specularColor=new Color3(.72,.57,.35);
  const amethyst=new StandardMaterial("world-clock-hand-amethyst",scene);
  amethyst.diffuseColor=new Color3(.31,.075,.53);
  amethyst.emissiveColor=new Color3(.22,.025,.39);
  amethyst.specularColor=new Color3(.55,.32,.67);
  const gemHighlight=new StandardMaterial("world-clock-hand-gem-facet",scene);
  gemHighlight.diffuseColor=new Color3(.56,.19,.74);
  gemHighlight.emissiveColor=new Color3(.13,.025,.19);

  const base=createClockBlade(scene,"world-clock-hand-forged-blade",[
    [-.17,.018],[-.13,.062],[-.06,.053],[.05,.041],
    [.29,.032],[.44,.042],[.54,.058],[.66,.036],[.755,.004],
  ],0,.025,blackenedBronze);
  base.parent=pivot;

  const plate=createClockBlade(scene,"world-clock-hand-embossed-gold",[
    [-.115,.016],[-.04,.036],[.10,.028],[.34,.022],
    [.49,.030],[.55,.025],[.625,.009],
  ],.016,.012,antiqueGold);
  plate.parent=pivot;

  // Narrow raised ridge prevents a cheap flat sticker appearance.
  const ridge=createClockBlade(scene,"world-clock-hand-raised-spine",[
    [-.055,.005],[.20,.010],[.40,.008],[.57,.003],
  ],.026,.009,brightEngraving);
  ridge.parent=pivot;

  // Fine mirrored cast-gold scrollwork and runic clasps.
  for(const side of [-1,1]){
    const path=[
      [.025,.08],[.065,.11],[.086,.16],[.071,.22],
      [.043,.25],[.054,.31],[.071,.36],[.047,.40],
    ].map(([x,y])=>new Vector3(side*x,y,.034));
    const filigree=MeshBuilder.CreateTube(
      "world-clock-hand-filigree-"+side,
      {path,radius:.007,tessellation:6},scene,
    );
    filigree.parent=pivot;
    filigree.material=brightEngraving;
    filigree.isPickable=true;
    filigree.checkCollisions=false;
  }

  // A real inset crystal: faceted rather than a single giant purple cone.
  const gem=createClockBlade(scene,"world-clock-hand-embedded-crystal",[
    [.55,.006],[.585,.045],[.635,.041],[.71,.017],[.742,.003],
  ],.034,.020,amethyst);
  gem.parent=pivot;
  const facet=createClockBlade(scene,"world-clock-hand-crystal-highlight",[
    [.588,.003],[.622,.015],[.696,.004],
  ],.051,.006,gemHighlight);
  facet.parent=pivot;

  for(const y of [.08,.29,.47]){
    const setting=MeshBuilder.CreateCylinder(
      "world-clock-hand-runic-rivet-"+y,
      {height:.014,diameter:.031,tessellation:4},scene,
    );
    setting.parent=pivot;
    setting.position.set(0,y,.041);
    setting.rotation.x=Math.PI/2;
    setting.rotation.y=Math.PI/4;
    setting.material=brightEngraving;
    setting.isPickable=true;
    setting.checkCollisions=false;
  }

  // Smaller centre ornament, not the original oversized brown sphere.
  const setting=MeshBuilder.CreateTorus("world-clock-hand-hub-bezel",{
    diameter:.133,thickness:.016,tessellation:32,
  },scene);
  setting.parent=mount;
  setting.position.set(center.x,center.y,center.z+.050);
  setting.rotation.x=Math.PI/2;
  setting.material=antiqueGold;
  setting.isPickable=true;
  setting.checkCollisions=false;
  const cap=MeshBuilder.CreateSphere("world-clock-hand-hub-amethyst",{
    diameter:.087,segments:12,
  },scene);
  cap.parent=mount;
  cap.position.set(center.x,center.y,center.z+.059);
  cap.scaling.z=.35;
  cap.material=amethyst;
  cap.isPickable=true;
  cap.checkCollisions=false;
  return {pivot,amethyst,gemHighlight};
}

/** The physical clock is purely a read-only observer of worldClock.tick.
 * The imported GLB stays static; a single independent ornamental hand moves.
 * No new ticker, no extra save state, no changes to sleep/day scheduling. */
export function setupWorldClockVisuals(scene:Scene,store:GameStore):void{
  const def=furnitureDefinition("world-clock");
  const mount=new TransformNode("world-clock-mount",scene);
  let lastPlacement:typeof store.state.wallClock|null=null;
  const align=()=>{
    const pose=store.state.wallClock;
    if(pose===lastPlacement)return;
    lastPlacement=pose;
    mount.position.set(pose.x,0,pose.z);
    // The 180-degree Y turn reverses local X on the visible wall side.
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
  const dial=MeshBuilder.CreateCylinder("world-clock-fallback-dial",{
    diameter:2.22,height:.14,tessellation:64,
  },scene);
  dial.parent=backupRoot;
  dial.position.set(0,1.99,0);
  dial.rotation.x=Math.PI/2;
  dial.material=darkDial;
  dial.isPickable=true;
  dial.checkCollisions=false;
  const outer=MeshBuilder.CreateTorus("world-clock-fallback-rim",{
    diameter:2.29,thickness:.10,tessellation:64,
  },scene);
  outer.parent=backupRoot;
  outer.position.set(0,1.99,.10);
  outer.rotation.x=Math.PI/2;
  outer.material=agedBronze;
  outer.isPickable=true;
  outer.checkCollisions=false;
  for(let index=0;index<24;index++){
    const angle=index*Math.PI/12;
    const mark=MeshBuilder.CreateBox("world-clock-fallback-rune-"+index,{
      width:index%6===0?.11:.05,
      height:index%6===0?.18:.12,depth:.025,
    },scene);
    mark.parent=backupRoot;
    mark.position.set(Math.sin(angle)*.92,1.99+Math.cos(angle)*.92,.17);
    mark.rotation.z=-angle;
    mark.material=violet;
    mark.isPickable=true;
    mark.checkCollisions=false;
  }

  const calibration=worldClockHandMount(def.height);
  const center=new Vector3(0,calibration.y,calibration.z);
  const hand=buildClockHand(scene,mount,center);

  let observedDay=0,observedTick=-1;
  const synchronizeTime=()=>{
    const {day,worldClock}=store.state;
    if(day===observedDay&&worldClock.tick===observedTick)return;
    observedDay=day;
    observedTick=worldClock.tick;
    const face=worldClockFace(day,worldClock.tick);
    hand.pivot.rotation.z=face.angleRadians;
    // The 180° wall orientation makes positive local rotation clockwise
    // for Galvik. On final tick the hand parks at 00 and gemstone warns red.
    hand.amethyst.diffuseColor=face.stopped
      ?new Color3(.77,.09,.12):new Color3(.31,.075,.53);
    hand.amethyst.emissiveColor=face.stopped
      ?new Color3(.77,.035,.055):new Color3(.22,.025,.39);
    hand.gemHighlight.emissiveColor=face.stopped
      ?new Color3(.45,.025,.04):new Color3(.13,.025,.19);
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
    modelRoot.scaling.setAll(calibration.scale);
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
