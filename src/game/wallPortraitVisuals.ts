import {Color3} from "@babylonjs/core/Maths/math.color";
import {Texture} from "@babylonjs/core/Materials/Textures/texture";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";

/** One saved wall portrait: both canvas and frame can be targeted with P. */
export function setupWallPortraitVisuals(scene:Scene,store:GameStore):void{
  const root=new TransformNode("galvik-portrait-root",scene);
  const canvas=MeshBuilder.CreatePlane("galvik-portrait-canvas",
    {width:.98,height:1.16},scene);
  canvas.parent=root;
  canvas.position.set(0,2.15,.065);
  canvas.rotation.y=Math.PI;
  canvas.isPickable=true;
  canvas.checkCollisions=false;
  const paint=new StandardMaterial("galvik-portrait-paint",scene);
  paint.diffuseTexture=new Texture(
    import.meta.env.BASE_URL+"assets/galvik-lost-fiancee.jpg",scene);
  paint.emissiveColor=new Color3(.34,.26,.19);
  paint.backFaceCulling=false;
  canvas.material=paint;
  const wood=new StandardMaterial("galvik-portrait-frame-wood",scene);
  wood.diffuseColor=new Color3(.27,.14,.065);
  wood.specularColor=new Color3(.30,.18,.07);
  const add=(name:string,w:number,h:number,d:number,x:number,y:number,z:number)=>{
    const mesh=MeshBuilder.CreateBox("galvik-portrait-"+name,
      {width:w,height:h,depth:d},scene);
    mesh.parent=root;
    mesh.position.set(x,y,z);
    mesh.material=wood;
    mesh.isPickable=true;
    mesh.checkCollisions=false;
  };
  add("back",1.08,1.3,.055,0,2.15,-.01);
  for(const side of [-1,1]){
    add("side-"+side,.08,1.3,.12,side*.52,2.15,.05);
    add("edge-"+side,1.08,.08,.12,0,2.15+side*.63,.05);
  }
  const sync=()=>{
    const pose=store.state.wallPortrait;
    root.setEnabled(!!pose);
    if(!pose)return;
    root.position.set(pose.x,0,pose.z);
    root.rotation.y=(pose.rotation-2)*Math.PI/2;
  };
  store.subscribe(sync);
  sync();
}
