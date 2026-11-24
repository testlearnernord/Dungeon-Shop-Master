import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import type {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {Scene} from "@babylonjs/core/scene";
import {CELLAR_FLOOR_Y,CELLAR_FORGE_POSITION} from "./cellarRoom.ts";
import {getDungeonSurfaces} from "./dungeonSurfaces.ts";

export {CELLAR_FORGE_POSITION} from "./cellarRoom.ts";

/** One fixed physical workbench. Detailed stone, hot coals and tools sit
 * inside the original collider footprint; only the anvil accepts E/click.
 * Fire and craft sparks are bounded presentation, never a crafting timer. */
export function setupCellarForgeVisuals(scene:Scene){
  const surfaces=getDungeonSurfaces(scene),p=CELLAR_FORGE_POSITION;
  const mat=(name:string,color:Color3,glow?:Color3)=>{
    const value=new StandardMaterial("cellar-forge-"+name,scene);
    value.diffuseColor=color;
    value.specularColor=new Color3(.18,.16,.13);
    if(glow)value.emissiveColor=glow;
    return value;
  };
  const steel=mat("steel",new Color3(.29,.32,.35));
  steel.specularColor=new Color3(.52,.5,.43);
  const edge=mat("worn-edge",new Color3(.43,.45,.46));
  const soot=mat("soot",new Color3(.095,.075,.065));
  const coal=mat("coals",new Color3(.14,.10,.08),new Color3(.31,.095,.025));
  const ember=mat("ember",new Color3(.45,.17,.035),new Color3(.78,.24,.025));
  const flame=mat("flame",new Color3(.84,.32,.06),new Color3(1,.36,.035));
  const spark=mat("spark",new Color3(.94,.66,.18),new Color3(1,.73,.12));
  const lit:Mesh[]=[];
  const part=(mesh:Mesh,x:number,y:number,z:number,material:StandardMaterial,solid=false)=>{
    mesh.position.set(p.x+x,CELLAR_FLOOR_Y+y,p.z+z);
    mesh.material=material;mesh.checkCollisions=solid;mesh.isPickable=false;
    lit.push(mesh);
    return mesh;
  };
  const box=(id:string,w:number,h:number,d:number,x:number,y:number,z:number,
    material:StandardMaterial,solid=false)=>part(MeshBuilder.CreateBox("cellar-forge-"+id,{
      width:w,height:h,depth:d},scene),x,y,z,material,solid);
  const cylinder=(id:string,h:number,bottom:number,top:number,x:number,y:number,z:number,
    material:StandardMaterial,solid=false)=>part(MeshBuilder.CreateCylinder("cellar-forge-"+id,{
      height:h,diameterBottom:bottom,diameterTop:top,tessellation:8},scene),x,y,z,material,solid);

  // Retain all existing interaction coordinates and major collision bodies.
  box("base",1.25,.66,1.05,0,.33,0,surfaces.stone,true);
  box("plinth",1.25,.09,1.05,0,.62,0,surfaces.stoneAccent);
  const anvil=box("anvil",1.03,.28,.49,0,1.12,.19,steel,true);
  anvil.isPickable=true;anvil.metadata={cellarForge:true};
  box("anvil-foot",.39,.62,.4,0,.8,.19,steel,true);
  box("anvil-foot-plate",.52,.07,.47,0,.69,.19,edge);
  box("anvil-face",1.03,.025,.48,0,1.264,.19,edge);
  const horn=cylinder("anvil-horn",.42,.24,.025,-.65,1.14,.19,steel,true);
  horn.rotation.z=Math.PI/2;

  // A recessed iron firepot and three visible refractory-brick courses.
  box("firepit",.95,.16,.64,0,.75,-.38,soot,true);
  for(const [id,w,d,x,z] of [
    ["rear",.95,.08,0,-.66],["front",.95,.08,0,-.10],
    ["left",.09,.48,-.43,-.38],["right",.09,.48,.43,-.38],
  ] as const)box("hearth-rim-"+id,w,.13,d,x,.855,z,surfaces.stoneAccent);
  box("coal-bed",.76,.055,.43,0,.84,-.38,coal);
  for(let i=0;i<7;i++){
    const x=-.29+(i%4)*.17,z=-.47+Math.floor(i/4)*.19;
    const piece=box("ember-"+i,.105,.068,.10,x,.888,z,i%2===0?ember:coal);
    piece.rotation.y=i*.77;
  }
  const flames=Array.from({length:3},(_,i)=>
    cylinder("flame-"+i,.18+i*.035,.11,.012,-.22+i*.21,.98,-.37,flame));
  // Resting tools are visual-only and do not block the anvil ray.
  const handle=cylinder("hammer-handle",.29,.035,.035,.40,.765,.35,surfaces.wood);
  handle.rotation.z=Math.PI/2;
  box("hammer-head",.10,.087,.13,.52,.79,.35,steel);
  for(const [i,z] of [.01,.075].entries()){
    const tong=cylinder("tongs-"+i,.24,.025,.025,-.28,.76,z,steel);
    tong.rotation.z=Math.PI/2;tong.rotation.y=i===0?.12:-.12;
  }
  const sparks=Array.from({length:6},(_,i)=>{
    const m=cylinder("spark-"+i,.035,.018,.008,0,1.3,.19,spark);
    m.setEnabled(false);return m;
  });
  // A single short-range light only illuminates the forge assembly.
  const light=new PointLight("cellar-forge-hearth-light",
    new Vector3(p.x,CELLAR_FLOOR_Y+1.12,p.z-.38),scene);
  light.diffuse=new Color3(1,.40,.13);light.range=1.75;
  light.intensity=.65;light.includedOnlyMeshes=lit;
  let flashed=-Infinity;
  scene.onBeforeRenderObservable.add(()=>{
    const camera=scene.activeCamera;
    if(!camera)return;
    const now=performance.now(),elapsed=now-flashed;
    const nearby=camera.position.y<CELLAR_FLOOR_Y+3&&
      Math.hypot(camera.position.x-p.x,camera.position.z-p.z)<10;
    if(nearby){
      for(let i=0;i<flames.length;i++)
        flames[i].scaling.y=.8+.26*Math.sin(now*.008+i*2.1);
    }
    const active=nearby&&elapsed>=0&&elapsed<450;
    for(let i=0;i<sparks.length;i++){
      const m=sparks[i];
      if(m.isEnabled()!==active)m.setEnabled(active);
      if(!active)continue;
      const t=elapsed/450,angle=i*Math.PI/3;
      m.position.set(p.x+Math.cos(angle)*t*.42,
        CELLAR_FLOOR_Y+1.28+Math.sin(Math.PI*t)*.32,
        p.z+.19+Math.sin(angle)*t*.42);
      m.scaling.setAll(1-t*.7);
    }
  });
  return {anvil,flash(){flashed=performance.now();}};
}
