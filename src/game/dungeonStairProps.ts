import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Scene} from "@babylonjs/core/scene";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import type {DungeonStairway} from "./dungeonStairways.ts";

const material=(scene:Scene,name:string,hex:string,glow=0)=>{
  const m=new StandardMaterial(name,scene);
  m.diffuseColor=Color3.FromHexString(hex);
  if(glow)m.emissiveColor=m.diffuseColor.scale(glow);
  return m;
};
export function createDungeonStairwayProp(
  scene:Scene,way:DungeonStairway,world:Vector3,
):Mesh{
  const prefix="dungeon-"+way.kind+"-stair-"+way.id;
  const root=MeshBuilder.CreateBox(prefix,
    {width:1.84,depth:1.65,height:.2},scene);
  root.position.set(world.x,.16,world.z);
  root.material=material(scene,prefix+"-slate","#393e3d");
  root.metadata={dungeonStairwayId:way.id,visualKind:"3d-stairway",
    destinationFloor:way.destinationFloor,kind:way.kind,
    label:way.label,gridX:way.x,gridZ:way.z};
  root.checkCollisions=false;
  const make=(id:string,w:number,h:number,d:number,
    x:number,y:number,z:number,mat:StandardMaterial)=>{
    const p=MeshBuilder.CreateBox(prefix+"-"+id,{width:w,height:h,depth:d},scene);
    p.parent=root;p.position.set(x,y,z);p.material=mat;
    p.metadata=root.metadata;p.checkCollisions=false;
    p.isPickable=true;
  };
  const stone=material(scene,prefix+"-stone","#71685a");
  const trim=material(scene,prefix+"-trim",
    way.kind==="sealed"?"#ac5349":way.kind==="descend"?"#c19a55":"#65ad9d",.29);
  for(let i=0;i<4;i++){
    const height=way.kind==="descend"?.10+.05*i:.28+.10*i;
    make("step-"+i,1.35,height,.39,0,height/2+.08,-.57+i*.39,stone);
  }
  // Arch and illuminated lintel identify the connection at default
  // bird's-eye zoom. No fake door collision/teleport physics is created.
  make("post-left",.21,1.25,.27,-.75,.67,.53,stone);
  make("post-right",.21,1.25,.27,.75,.67,.53,stone);
  make("lintel",1.7,.22,.34,0,1.34,.53,trim);
  if(way.kind==="sealed"){
    make("sealed-gate",1.36,.98,.11,0,.55,.54,trim);
  }else{
    make("threshold",1.48,.10,.25,0,.16,.72,trim);
  }
  return root;
}
