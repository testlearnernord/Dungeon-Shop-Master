import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {Scene} from "@babylonjs/core/scene";
import {getDungeonSurfaces} from "./dungeonSurfaces.ts";
import type {DungeonPassageArtPlan,DungeonRoomArtPlan,DungeonRoomTheme} from "./dungeonRoomArtPlan.ts";
import type {DungeonRoomDecoration} from "./dungeonReplayScene.ts";

const palette:Readonly<Record<DungeonRoomTheme,{stone:string;trim:string;glow:string}>>={
  hall:{stone:"#777269",trim:"#a29a85",glow:"#ffc78b"},
  crypt:{stone:"#454f46",trim:"#697467",glow:"#a6cc91"},
  vault:{stone:"#686359",trim:"#b69b54",glow:"#ffd78b"},
  guardroom:{stone:"#675349",trim:"#947052",glow:"#ff9d59"},
  workshop:{stone:"#514f50",trim:"#9b6849",glow:"#efaa73"},
};

/** Shared lightweight art for table, LIVE and historical map. Empty parent
 * retains the existing room-centre fog gate; no physics or combat obstacles. */
export function createDungeonRoomArt(scene:Scene,plan:DungeonRoomArtPlan,world:Vector3):DungeonRoomDecoration{
  const {room,theme,anchors,wallDetails,floorAccent}=plan;
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
  const surfaces=getDungeonSurfaces(scene);
  stone.diffuseTexture=surfaces.stone.diffuseTexture;
  stone.diffuseColor.scaleInPlace(1.7);
  const wood=material("wood","#b5926d");
  wood.diffuseTexture=surfaces.wood.diffuseTexture;
  const metal=material("metal","#89847b");
  metal.specularColor=new Color3(.23,.20,.16);
  const shadow=material("shadow","#2e3430");
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
        box("tomb-head-"+n,x,.65,z+.45,.82,.22,.21,stone);
        box("grave-rune-"+n,x,.67,z,.14,.035,.68,glow);
      }else{
        column("broken-pillar-"+n,x,z,1.05,.78);
        box("rune-cap-"+n,x,1.20,z,.55,.13,.55,trim);
      }
    }else if(theme==="vault"){
      // Decorative strongbox, distinct from the existing interactive chest.
      box("vault-pedestal-"+n,x,.18,z,1.08,.24,1.08);
      box("sealed-coffer-"+n,x,.52,z,.9,.44,.84,wood);
      box("coffer-band-"+n,x,.77,z,.96,.08,.28,trim);
      box("coffer-seal-"+n,x,.55,z-.43,.22,.21,.08,glow);
    }else if(theme==="workshop"){
      box("workbench-base-"+n,x,.36,z,.75,.60,.78,wood);
      box("workbench-top-"+n,x,.71,z,1.05,.14,1.02,wood);
      box("anvil-foot-"+n,x,.91,z,.42,.28,.40);
      box("anvil-head-"+n,x,1.10,z,.88,.14,.42,metal);
    }else{
      column("barrel-"+n,x,z,.92,.79,wood);
      column("barrel-band-"+n,x,z,.10,.85,metal,.31);
      column("barrel-band-top-"+n,x,z,.10,.85,metal,.81);
      box("crate-lid-"+n,x,1.04,z,.77,.14,.77,trim);
    }
  }
  // Flush inlaid floor motifs are readable from the high observation angle.
  // They never imply a blocking object or add a new interactable.
  if(floorAccent){
    const {x,z}=floorAccent;
    const base=box("floor-inlay",x,.056,z,1.64,.012,1.64,shadow);
    base.rotation.y=Math.PI/4;
    const diamond=box("floor-inlay-brass",x,.066,z,1.22,.012,1.22,trim);
    diamond.rotation.y=Math.PI/4;
    const inset=box("floor-inlay-centre",x,.076,z,.91,.012,.91,stone);
    inset.rotation.y=Math.PI/4;
    box("floor-inlay-rune-x",x,.088,z,.65,.012,.09,glow);
    box("floor-inlay-rune-z",x,.088,z,.09,.012,.65,glow);
  }
  for(const [index,p] of wallDetails.entries()){
    const n=String(index),{x,z,dx}=p;
    const panel=(name:string,y:number,w:number,h:number,d:number,mat:StandardMaterial)=>{
      const part=box(name+"-"+n,x,y,z,w,h,d,mat);
      part.rotation.y=dx!==0?Math.PI/2:0;
      return part;
    };
    panel("wall-frame",1.20,.94,2.24,.22,stone);
    panel("wall-cornice",2.37,1.06,.20,.30,trim);
    if(theme==="crypt"){
      panel("grave-plaque",1.42,.51,.88,.28,trim);
      panel("plaque-rune",1.44,.085,.59,.30,glow);
    }else if(theme==="hall"||theme==="vault"){
      panel("weathered-banner",1.55,.56,1.05,.29,trim);
      panel("banner-emblem",1.63,.16,.29,.31,glow);
    }else{
      panel("tool-rack",1.60,.69,.14,.28,wood);
      panel("old-tool",1.20,.12,.59,.30,metal);
    }
    panel("wall-sconce",2.02,.23,.27,.39,metal);
    panel("wall-ember",2.26,.17,.22,.39,glow);
  }
  const lamp=anchors[0];
  if(lamp){
    const height=theme==="hall"?2.96:theme==="crypt"?.86:theme==="vault"?.98:theme==="workshop"?1.43:1.26;
    box("lantern-"+lamp.corner,lamp.x,height,lamp.z,.23,.30,.23,glow);
  }
  const light=new PointLight("dungeon-torchlight-"+room.id,
    new Vector3(world.x+(lamp?.x??0),2.6,world.z+(lamp?.z??0)),scene);
  light.diffuse=Color3.FromHexString(paint.glow);
  light.intensity=1.45;light.range=11;
  return {x:room.x,z:room.z,mesh:root,light};
}

/** A small set of stone jambs and lanterns attached to existing corridor
 * walls. There is intentionally no cross-passage lintel/collider/light pool. */
export function createDungeonPassageArt(scene:Scene,plan:DungeonPassageArtPlan,world:Vector3):DungeonRoomDecoration{
  const {cell,dx,dz,doorway}=plan;
  const id="dungeon-passage-art-"+cell.x+"-"+cell.z;
  const root=new Mesh(id,scene);
  root.position.copyFrom(world);root.isPickable=false;root.checkCollisions=false;
  root.metadata={dungeonPassageArt:true,roomId:id,roomTheme:doorway?"threshold":"passage"};
  const surface=getDungeonSurfaces(scene);
  const stone=new StandardMaterial(id+"-stone",scene);
  stone.diffuseTexture=surface.stone.diffuseTexture;
  stone.diffuseColor=new Color3(1.5,1.38,1.17);
  stone.specularColor=new Color3(.035,.035,.035);
  const iron=new StandardMaterial(id+"-iron",scene);
  iron.diffuseColor=Color3.FromHexString("#54493c");
  const ember=new StandardMaterial(id+"-ember",scene);
  ember.diffuseColor=Color3.FromHexString("#ffba68");
  ember.emissiveColor=ember.diffuseColor.scale(.8);
  const box=(name:string,y:number,w:number,h:number,d:number,mat:StandardMaterial)=>{
    const mesh=MeshBuilder.CreateBox(id+"-"+name,{width:w,height:h,depth:d},scene);
    mesh.parent=root;mesh.position.set(dx*1.04,y,dz*1.04);
    mesh.rotation.y=dx!==0?Math.PI/2:0;
    mesh.material=mat;mesh.isPickable=false;mesh.checkCollisions=false;
  };
  if(doorway){
    box("jamb",1.20,.78,2.30,.26,stone);
    box("capital",2.40,.98,.18,.36,stone);
  }else{
    box("weathered-wall-plate",1.48,.63,1.10,.19,stone);
  }
  box("sconce",1.70,.30,.32,.39,iron);
  box("ember",1.99,.18,.24,.39,ember);
  return {x:cell.x,z:cell.z,mesh:root};
}
