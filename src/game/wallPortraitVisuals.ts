import {Color3} from "@babylonjs/core/Maths/math.color";
import {Texture} from "@babylonjs/core/Materials/Textures/texture";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";

/** Galvik's lost beloved is a FIXED architectural interaction at the private
 * bedroom's hidden opening. This deliberately does not use movable furniture.
 * A save records only whether the door is open, not its camera animation. */
export function setupWallPortraitVisuals(scene:Scene,store:GameStore):Mesh[]{
  const hinge=new TransformNode("galvik-portrait-secret-hinge",scene);
  hinge.position.set(-1.985,0,-12.02);
  const panel=new TransformNode("galvik-portrait-secret-panel",scene);
  panel.parent=hinge;
  panel.position.x=1.135;
  const canvas=MeshBuilder.CreatePlane("galvik-portrait-canvas",
    {width:1.98,height:2.48},scene);
  canvas.parent=panel;
  canvas.position.set(0,1.50,.065);
  canvas.rotation.y=Math.PI;
  canvas.isPickable=true;
  canvas.checkCollisions=false;
  const paint=new StandardMaterial("galvik-portrait-paint",scene);
  paint.diffuseTexture=new Texture(import.meta.env.BASE_URL+
    "assets/galvik-lost-fiancee.jpg",scene);
  paint.emissiveColor=new Color3(.34,.26,.19);
  paint.backFaceCulling=false;
  canvas.material=paint;
  const wood=new StandardMaterial("galvik-portrait-frame-wood",scene);
  wood.diffuseColor=new Color3(.27,.14,.065);
  wood.specularColor=new Color3(.30,.18,.07);
  const interactables:Mesh[]=[canvas];
  const add=(name:string,w:number,h:number,d:number,x:number,y:number,z:number)=>{
    const mesh=MeshBuilder.CreateBox("galvik-portrait-"+name,
      {width:w,height:h,depth:d},scene);
    mesh.parent=panel;mesh.position.set(x,y,z);
    mesh.material=wood;mesh.isPickable=true;mesh.checkCollisions=false;
    interactables.push(mesh);
  };
  // The full-size beloved portrait conceals the entire enlarged passage,
  // rather than leaving a visible empty gap around a tiny floating picture.
  add("back",2.18,2.68,.055,0,1.50,-.01);
  for(const side of [-1,1]){
    add("side-"+side,.08,2.68,.12,side*1.05,1.50,.05);
    add("edge-"+side,2.18,.08,.12,0,1.50+side*1.30,.05);
  }
  const blocker=scene.getMeshByName("cellar-portrait-barrier");
  let angle=store.state.cellarDoorOpen?-1.64:0;
  hinge.rotation.y=angle;
  const sync=()=>{
    if(blocker){
      blocker.checkCollisions=!store.state.cellarDoorOpen;
    }
  };
  store.subscribe(sync);
  sync();
  scene.onBeforeRenderObservable.add(()=>{
    const desired=store.state.cellarDoorOpen?-1.64:0;
    if(Math.abs(desired-angle)<.003)return;
    const dt=Math.min(.06,scene.getEngine().getDeltaTime()/1000);
    angle+=(desired-angle)*Math.min(1,dt*7);
    hinge.rotation.y=angle;
  });
  return interactables;
}
