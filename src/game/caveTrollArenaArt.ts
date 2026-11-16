import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Non-pickable, deterministic mine dressing. Kept separate from the duel motor
 * so the walkable radius, impact arcs and saved combat outcome never change.
 * All pieces are visual-only; no collisions, triggers or rewards.
 */
export function buildCaveTrollArenaArt(scene:Scene):void {
  const material=(name:string,hex:string,glow=false):StandardMaterial=>{
    const m=new StandardMaterial("troll-set-"+name,scene);
    m.diffuseColor=Color3.FromHexString(hex);
    m.specularColor=new Color3(.09,.08,.06);
    if(glow)m.emissiveColor=Color3.FromHexString(hex).scale(.8);
    return m;
  };
  const rock=material("cavern-rock","#292725");
  const shale=material("shale","#34312e");
  const deep=material("cave-inner-darkness","#161819");
  const lumber=material("mine-beams","#483124");
  const band=material("rusted-braces","#6a4e3b");
  const red=material("torn-banner","#65312c");
  const symbol=material("miner-crest","#a89375");
  const embers=material("brazier","#dc6128",true);
  const soot=material("smoke-metal","#302c29");
  const all=(mesh:ReturnType<typeof MeshBuilder.CreateBox>,mat:StandardMaterial)=>{
    mesh.material=mat;
    mesh.isPickable=false;
    mesh.checkCollisions=false;
    return mesh;
  };
  const cuboid=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat:StandardMaterial)=>{
    const m=all(MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene),mat);
    m.position.set(x,y,z);return m;
  };
  // Tall rough rock backdrop: the fight no longer takes place in black space.
  // Leave the front wide enough for a spectator camera to fly through.
  for(let i=0;i<46;i++){
    const theta=i*Math.PI*2/46;
    const radius=22.5+(i%4)*.47;
    const high=7.4+(i*7%9)*.82;
    const b=all(MeshBuilder.CreatePolyhedron("troll-cavern-wall-"+i,
      {type:2,size:1},scene),i%3===0?shale:rock);
    b.scaling.set(3.9,high,3.1);
    b.position.set(Math.cos(theta)*radius,high/2-1.0,Math.sin(theta)*radius);
    b.rotation.y=theta*.53;
  }
  // A rear mineshaft silhouette and giant timber scaffolds are visible behind
  // the boss even with the default training-preview camera.
  for(const side of [-1,1]){
    cuboid("troll-shaft-pillar-"+side,side*8.7,4.4,14,1.2,8.8,1.3,lumber);
    cuboid("troll-shaft-brace-"+side,side*8.2,7.1,14.2,.23,4.4,.36,band)
      .rotation.z=side*.48;
    for(let h=1;h<8;h+=2.3){
      cuboid("troll-shaft-iron-"+side+"-"+h,side*8.7,h,14,.17,.21,1.6,band);
    }
  }
  cuboid("troll-shaft-lintel",0,8.25,14,18.6,1.0,1.25,lumber);
  cuboid("troll-shaft-arch",0,10.0,14,.75,3.4,.7,deep);
  for(const x of [-5,5]){
    cuboid("troll-shaft-rail-"+x,x,2.8,15.2,.55,5.1,.65,lumber);
  }
  // Mining camp banner with intentionally frayed staggered hems.
  for(let i=0;i<5;i++){
    const strip=cuboid("troll-red-miner-banner-"+i,-9.8+i*.37,4.3-i%3*.17,13.7,
      .38,3.0-(i%3)*.32,.15,red);
    strip.rotation.z=(i-2)*.026;
  }
  const pick1=cuboid("troll-miner-crest-a",-9.07,4.5,13.52,.16,1.75,.09,symbol);
  pick1.rotation.z=.68;
  const pick2=cuboid("troll-miner-crest-b",-9.07,4.5,13.51,.16,1.75,.09,symbol);
  pick2.rotation.z=-.68;
  // Uneven rock rubble at the edge, far away from the scripted hit geometry.
  for(let i=0;i<34;i++){
    const theta=i*2.399963229728653;
    const radius=14.6+((i*13)%9)*.25;
    const b=all(MeshBuilder.CreatePolyhedron("troll-rubble-"+i,{type:0,size:1},scene),
      i%2?rock:shale);
    const s=.32+((i*7)%5)*.14;
    b.scaling.set(s*1.7,s*.65,s);
    b.rotation.set(i*.1,theta,i*.14);
    b.position.set(Math.sin(theta)*radius,.06,Math.cos(theta)*radius);
  }
  // 3 iron cages, each with real local fire illumination and no fake UI sprite.
  for(const [i,x,z] of [[0,-12.1,10.8],[1,12.4,11.4],[2,-14.5,-6.9]] as const){
    cuboid("troll-brazier-pole-"+i,x,1.45,z,.26,2.8,.26,soot);
    const cradle=all(MeshBuilder.CreateCylinder("troll-brazier-bowl-"+i,
      {diameterTop:1.05,diameterBottom:.6,height:.45,tessellation:12},scene),soot);
    cradle.position.set(x,2.92,z);
    for(let k=0;k<5;k++){
      const a=k*Math.PI*2/5;
      cuboid("troll-brazier-prong-"+i+"-"+k,
        x+Math.sin(a)*.43,3.13,z+Math.cos(a)*.43,.08,.54,.08,band);
    }
    const flame=all(MeshBuilder.CreateCylinder("troll-brazier-flame-"+i,
      {diameterTop:0,diameterBottom:.53,height:1.28,tessellation:7},scene),embers);
    flame.position.set(x,3.69,z);
    const light=new PointLight("troll-brazier-light-"+i,new Vector3(x,3.2,z),scene);
    light.diffuse=Color3.FromHexString("#e17d41");
    light.intensity=.74;
    light.range=13;
  }
}