import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Scene} from "@babylonjs/core/scene";
import {paintCaveTrollFloor} from "./caveTrollArenaArt.ts";
import type {CombatStageBounds} from "./combatSpectatorStage.ts";

/**
 * The Crypt is an ART VARIANT of the Cave-Troll spectator stage, not a second
 * arena or fight simulation. No visual mesh changes physics, hit detection,
 * the committed 60Hz replay, pathfinding or loot.
 *
 * All geometry is stable and owned by one opt-in Babylon scene. This preserves
 * the authored boss style: stone floor, sculpted backdrop, practical lights,
 * volumetric side dressing. One or several heroes use the SAME stage.
 */
export function buildCryptCombatArenaArt(
  scene:Scene,bounds:CombatStageBounds,
):void {
  const {cx,cz,width,depth}=bounds;
  const halfW=width/2,halfD=depth/2;
  const mat=(name:string,hex:string,emissive=false):StandardMaterial=>{
    const m=new StandardMaterial("crypt-arena-"+name,scene);
    m.diffuseColor=Color3.FromHexString(hex);
    m.specularColor=Color3.FromHexString("#20282b");
    if(emissive)m.emissiveColor=Color3.FromHexString(hex).scale(.75);
    return m;
  };
  const floorMat=mat("chipped-floor","#616a69");
  paintCaveTrollFloor(scene,floorMat); // Level-6 authored procedural stone.
  floorMat.diffuseColor=Color3.FromHexString("#adbcb4");
  const walls=mat("aged-rock","#363d3c");
  const shale=mat("shale","#4c5350");
  const joints=mat("joints","#252c2b");
  const relic=mat("stone-relic","#666961");
  const iron=mat("rusted-iron","#55483c");
  const spectral=mat("witchflame","#7bdaa6",true);
  const mark=(m:Mesh,material:StandardMaterial)=>{
    m.material=material;m.isPickable=false;m.checkCollisions=false;
    return m;
  };
  const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,
    material:StandardMaterial)=>{
    const m=mark(MeshBuilder.CreateBox("crypt-"+name,
      {width:w,height:h,depth:d},scene),material);
    m.position.set(x,y,z);
    return m;
  };
  // The real actors remain at their recorded x/z. Art is always laid out
  // around their bounds, so larger Temporary Parties don't collide visually.
  const floor=mark(MeshBuilder.CreateGround("crypt-arena-floor",
    {width:width+9,height:depth+9,subdivisions:2},scene),floorMat);
  floor.position.set(cx,-.06,cz);
  box("rear-foundation",cx,1.6,cz+halfD+3,width+10,3.2,1.3,walls);
  box("rear-ledge",cx,3.25,cz+halfD+3,width+11,.35,1.7,shale);
  for(const sign of [-1,1]){
    const x=cx+sign*(halfW+3.3);
    box("side-wall-"+sign,x,1.75,cz,1.15,3.5,depth+7,walls);
    box("side-crown-"+sign,x,3.6,cz,1.46,.35,depth+7,shale);
    // Pillars are physically outside the combat movement bounds.
    for(const zSign of [-1,1]){
      const z=cz+zSign*(halfD+2.5);
      const base=mark(MeshBuilder.CreateCylinder(
        "crypt-column-"+sign+"-"+zSign,
        {diameterTop:.65,diameterBottom:1.25,height:5.4,tessellation:8},scene),relic);
      base.position.set(x-sign*.8,2.65,z);
      box("column-cap-"+sign+"-"+zSign,x-sign*.8,5.28,z,1.5,.38,1.5,shale);
    }
    const coffin=box("coffin-"+sign,cx+sign*(halfW+1.6),.37,cz+halfD+1.5,
      1.5,.72,3.3,relic);
    coffin.rotation.y=sign*.20;
    const lid=box("coffin-lid-"+sign,coffin.position.x,.80,coffin.position.z,
      1.68,.21,3.46,shale);
    lid.rotation.y=coffin.rotation.y;
    box("coffin-cross-"+sign,coffin.position.x,.94,coffin.position.z,
      .18,.08,1.9,iron).rotation.y=sign*.2;
  }
  // A substantial rear portal is visible in the default spectator view.
  const portalZ=cz+halfD+2.0;
  for(const sign of [-1,1]){
    box("portal-pillar-"+sign,cx+sign*3.1,3.3,portalZ,1.18,6.6,1.15,shale);
    box("portal-brace-"+sign,cx+sign*3.0,5.6,portalZ,1.35,.38,1.4,iron);
  }
  box("portal-lintel",cx,6.4,portalZ,8.1,1.1,1.6,shale);
  box("portal-void",cx,2.4,portalZ+.18,5.1,4.7,.1,joints);
  const rune=mark(MeshBuilder.CreateTorus("crypt-portal-rune",
    {diameter:3.7,thickness:.11,tessellation:48},scene),spectral);
  rune.position.set(cx,3.5,portalZ-.06);
  rune.rotation.x=Math.PI/2;
  // Unlit graves and broken stone at the edges provide depth and scale.
  for(let i=0;i<18;i++){
    const sign=i%2===0?-1:1;
    const z=cz-halfD+((i*17)%19)/19*depth;
    const x=cx+sign*(halfW+1.65+(i%3)*.45);
    const slab=box("gravestone-"+i,x,.63,z,.85,1.15,.33,i%3?relic:shale);
    slab.rotation.z=sign*(i%3)*.11;
  }
  for(const sign of [-1,1]){
    const x=cx+sign*(halfW+1.0),z=cz-halfD+1.5;
    const brazier=mark(MeshBuilder.CreateCylinder(
      "crypt-brazier-"+sign,
      {diameterTop:1.0,diameterBottom:.55,height:.58,tessellation:10},scene),iron);
    brazier.position.set(x,1.4,z);
    box("brazier-pole-"+sign,x,.75,z,.24,1.45,.24,iron);
    const flame=mark(MeshBuilder.CreateCylinder(
      "crypt-witchflame-"+sign,
      {diameterTop:0,diameterBottom:.45,height:.9,tessellation:7},scene),spectral);
    flame.position.set(x,2.12,z);
    const light=new PointLight("crypt-brazier-light-"+sign,
      new Vector3(x,2.2,z),scene);
    light.diffuse=Color3.FromHexString("#71d49e");
    light.intensity=.65;light.range=12;
  }
  // The marked edge is decorative only, unlike the Level-6 lethal lava.
  const edge=mark(MeshBuilder.CreateTorus("crypt-boundary-sigil",
    {diameter:Math.max(width,depth)+2,thickness:.08,tessellation:64},scene),spectral);
  edge.position.set(cx,.025,cz);
  edge.visibility=.42;
}
