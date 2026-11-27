import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {Scene} from "@babylonjs/core/scene";
import type {DungeonRoomArtPlan,DungeonRoomTheme} from "./dungeonRoomArtPlan.ts";
import type {DungeonRoomDecoration} from "./dungeonReplayScene.ts";

const palette:Readonly<Record<DungeonRoomTheme,{stone:string;trim:string;glow:string}>>={
  hall:{stone:"#777269",trim:"#a29a85",glow:"#ffc78b"},
  crypt:{stone:"#454f46",trim:"#697467",glow:"#a6cc91"},
  vault:{stone:"#686359",trim:"#b69b54",glow:"#ffd78b"},
  guardroom:{stone:"#675349",trim:"#947052",glow:"#ff9d59"},
};

/** Shared lightweight art for table, LIVE and historical map. Empty parent
 * retains the existing room-centre fog gate; no physics or combat obstacles. */
export function createDungeonRoomArt(scene:Scene,plan:DungeonRoomArtPlan,world:Vector3):DungeonRoomDecoration{
  const {room,theme,anchors}=plan;
  const id="dungeon-room-art-"+room.id;
  const root=new Mesh(id,scene);
  root.position.copyFrom(world);
  root.isPickable=false;root.checkCollisions=false;
  root.metadata={dungeonRoomArt:true,roomId:room.id,roomTheme:theme};
  const paint=palette[theme];
  const material=(suffix:string,hex:string,glow=false)=>{
    const mat=new StandardMaterial(id+"-"+suffix,scene);
    mat.diffuseColor=Color3.FromHexString(hex);
    mat.specularColor=new Color3(.04,.04,.04);
    if(glow)mat.emissiveColor=mat.diffuseColor.scale(.65);
    return mat;
  };
  const stone=material("stone",paint.stone),trim=material("trim",paint.trim),
    glow=material("glow",paint.glow,true);
  function mount(mesh:Mesh,x:number,y:number,z:number,mat:StandardMaterial){
    mesh.parent=root;mesh.position.set(x,y,z);
    mesh.material=mat;mesh.isPickable=false;mesh.checkCollisions=false;
    return mesh;
  }
  function box(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=stone){
    return mount(MeshBuilder.CreateBox(id+"-"+name,{width:w,height:h,depth:d},scene),x,y,z,mat);
  }
  function column(name:string,x:number,z:number,height:number,diameter:number,mat=stone,y=height/2+.055){
    return mount(MeshBuilder.CreateCylinder(id+"-"+name,{
      diameter,height,tessellation:8,
    },scene),x,y,z,mat);
  }
  for(const [i,p] of anchors.entries()){
    const n=String(p.corner),{x,z}=p;
    if(theme==="hall"){
      box("plinth-"+n,x,.16,z,1.04,.21,1.04,trim);
      const h=i%3===2?1.30:2.35;
      column("pillar-"+n,x,z,h,.67,stone,h/2+.26);
      box("capital-"+n,x,h+.34,z,.91,.16,.91,trim);
    }else if(theme==="crypt"){
      if(i%2===0){
        box("tomb-"+n,x,.28,z,.82,.44,1.08);
        box("tomb-lid-"+n,x,.58,z,.94,.16,1.16,trim);
        box("grave-rune-"+n,x,.67,z,.14,.035,.68,glow);
      }else{
        column("broken-pillar-"+n,x,z,1.05,.78);
        box("rune-cap-"+n,x,1.20,z,.55,.13,.55,trim);
      }
    }else if(theme==="vault"){
      // Decorative strongbox, distinct from the existing interactive chest.
      box("vault-pedestal-"+n,x,.18,z,1.08,.24,1.08);
      box("sealed-coffer-"+n,x,.52,z,.9,.44,.84);
      box("coffer-band-"+n,x,.77,z,.96,.08,.28,trim);
      box("coffer-seal-"+n,x,.55,z-.43,.22,.21,.08,glow);
    }else{
      column("barrel-"+n,x,z,.92,.79,stone);
      column("barrel-band-"+n,x,z,.10,.85,trim,.31);
      column("barrel-band-top-"+n,x,z,.10,.85,trim,.81);
      box("crate-lid-"+n,x,1.04,z,.77,.14,.77,trim);
    }
  }
  const lamp=anchors[0];
  if(lamp){
    box("lantern-"+lamp.corner,lamp.x,1.44,lamp.z,.23,.30,.23,glow);
  }
  const light=new PointLight("dungeon-torchlight-"+room.id,
    new Vector3(world.x+(lamp?.x??0),2.6,world.z+(lamp?.z??0)),scene);
  light.diffuse=Color3.FromHexString(paint.glow);
  light.intensity=1.15;light.range=10;
  return {x:room.x,z:room.z,mesh:root,light};
}
