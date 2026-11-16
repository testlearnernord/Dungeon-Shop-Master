import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import type { BossPhase } from "./arenaCombatMotion.ts";

/** A real, articulated 3D boss. Its visual pose is *derived* from the existing
 * deterministic combat phases. It never makes combat, AI or save decisions.
 *
 * Character art direction: approved Ashen Tunnel Mauler (Cave Troll), pale
 * scarred cave-hide, long gorilla arms, leather/iron mining rig, twin vented
 * red canisters, red mining apron and the huge two-handed stone maul.
 * This is source-authored Babylon geometry, not a flat portrait/billboard.
 */
export interface CaveTrollVisual {
  readonly root: TransformNode;
  /** Scene-owned 3D parts. The handle/torso/limbs all have real volume. */
  readonly geometryCount: number;
  animate(input: CaveTrollAnimation): void;
}
export interface CaveTrollAnimation {
  phase: BossPhase;
  phaseAge: number;
  slam: boolean;
  time: number;
  moved: number;
  delta: number;
  hp: number;
  maxHp: number;
}

const ease = (v: number) => { const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t); };
const lerp = (a:number,b:number,t:number)=>a+(b-a)*t;
const V=(x:number,y:number,z:number)=>new Vector3(x,y,z);
const QUP=Vector3.Up();

function along(mesh:Mesh,from:Vector3,to:Vector3,thicknessX:number,thicknessZ:number):void {
  const vector=to.subtract(from);
  const length=vector.length();
  if(length<.01)return;
  const unit=vector.scale(1/length);
  const axis=Vector3.Cross(QUP,unit);
  const cos=Math.max(-1,Math.min(1,Vector3.Dot(QUP,unit)));
  mesh.rotationQuaternion = axis.lengthSquared()<1e-8
    ? Quaternion.RotationAxis(Vector3.Right(), cos<0?Math.PI:0)
    : Quaternion.RotationAxis(axis.normalize(),Math.acos(cos));
  mesh.position.copyFrom(from.add(to).scale(.5));
  mesh.scaling.set(thicknessX,length,thicknessZ);
}
function elbowFor(shoulder:Vector3,wrist:Vector3,side:number):Vector3 {
  const diff=wrist.subtract(shoulder);
  const distance=Math.max(.05,Math.min(3.82,diff.length()));
  const towards=diff.normalize();
  const reach=1.95;
  const forward=distance/2;
  const out=Math.sqrt(Math.max(0,reach*reach-forward*forward));
  const hint=V(side,0,-.64);
  const bend=hint.subtract(towards.scale(Vector3.Dot(hint,towards))).normalize();
  return shoulder.add(towards.scale(forward)).add(bend.scale(out));
}

export function createCaveTrollVisual(scene:Scene):CaveTrollVisual {
  const root=new TransformNode("arena-boss-troll",scene);
  root.metadata={kind:"boss",role:"boss",visualId:"ashen-tunnel-mauler",visualVersion:1};
  const pose=new TransformNode("troll-rig-pose",scene);
  pose.parent=root;
  const spine=new TransformNode("troll-rig-spine",scene);
  spine.parent=pose;
  spine.position.set(0,2.62,0);
  const head=new TransformNode("troll-rig-head",scene);
  head.parent=spine;
  head.position.set(0,3.05,.69);
  const weapon=new TransformNode("troll-rig-hammer",scene);
  weapon.parent=spine;
  weapon.position.set(0,-.05,1.66);
  let geometryCount=0;

  const makeMaterial=(name:string,color:string,rough=true,glow=false):StandardMaterial=>{
    const mat=new StandardMaterial("mauler-"+name,scene);
    mat.diffuseColor=Color3.FromHexString(color);
    mat.specularColor=rough?new Color3(.06,.06,.055):new Color3(.25,.19,.11);
    if(glow)mat.emissiveColor=Color3.FromHexString(color).scale(.85);
    mat.backFaceCulling=true;
    return mat;
  };
  const skin=makeMaterial("ashen-scarred-skin","#a5978c");
  const shadowSkin=makeMaterial("shadow-skin","#867b73");
  const scar=makeMaterial("scars","#69534d");
  const nose=makeMaterial("nose","#765a51");
  const leather=makeMaterial("leather","#50382c");
  const darkLeather=makeMaterial("stitch-leather","#312522");
  const plated=makeMaterial("plated-iron","#6f6460",false);
  const iron=makeMaterial("iron-edge","#89817a",false);
  const copper=makeMaterial("rust","#a45338",false);
  const rust=makeMaterial("red-canisters","#803a2e");
  const apron=makeMaterial("mining-apron","#704038");
  const rope=makeMaterial("rope","#a4865f");
  const bone=makeMaterial("teeth","#d2c4a0");
  const mouth=makeMaterial("mouth","#231b1b");
  const ember=makeMaterial("molten-eyes","#ff8b28",false,true);
  const pupil=makeMaterial("hot-pupils","#fff0a6",false,true);
  const rock=makeMaterial("hammer-stone","#696764");
  const wood=makeMaterial("hammer-haft","#624536");
  // Stable procedural hand-painted texture for skin. Real UV shading keeps
  // veins, dirt and pigment variation visible across the 3D model instead
  // of returning to uniformly coloured Blender-style spheres.
  const skinTexture=new DynamicTexture("mauler-skin-pigment",
    {width:256,height:256},scene,false);
  const ctx=skinTexture.getContext() as CanvasRenderingContext2D;
  const pixels=ctx.createImageData(256,256);
  let seed=9321;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const broad=Math.sin(x*.105+Math.cos(y*.031)*3.2)*5+
      Math.sin(y*.071+x*.039)*7;
    const grain=(random()-.5)*26;
    const v=Math.max(145,Math.min(230,207+broad+grain));
    const at=(y*256+x)*4;
    pixels.data[at]=v; pixels.data[at+1]=v-5;
    pixels.data[at+2]=v-13; pixels.data[at+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  for(let n=0;n<150;n++){
    const x=random()*256,y=random()*256;
    ctx.strokeStyle=n%4===0?"rgba(85,62,52,.23)":"rgba(111,87,72,.15)";
    ctx.lineWidth=n%5===0?1.7:.65;
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.quadraticCurveTo(x+(random()-.5)*18,y+8,
      x+(random()-.5)*29,y+16+random()*24);
    ctx.stroke();
  }
  skinTexture.update();
  skin.diffuseTexture=skinTexture;
  shadowSkin.diffuseTexture=skinTexture;
  const materials=[skin,shadowSkin,scar,nose,leather,darkLeather,plated,iron,
    copper,rust,apron,rope,bone,mouth,ember,pupil,rock,wood];
  const mount=(m:Mesh,parent:TransformNode,p:[number,number,number],mat:StandardMaterial):Mesh=>{
    m.parent=parent;m.position.set(...p);m.material=mat;
    m.isPickable=false;m.checkCollisions=false;
    geometryCount++;
    return m;
  };
  const sphere=(name:string,parent:TransformNode,p:[number,number,number],
    size:[number,number,number],mat:StandardMaterial,segments=16):Mesh=>{
    const m=MeshBuilder.CreateSphere("troll-"+name,{diameter:1,segments},scene);
    m.scaling.set(...size);
    return mount(m,parent,p,mat);
  };
  const block=(name:string,parent:TransformNode,p:[number,number,number],
    size:[number,number,number],mat:StandardMaterial):Mesh=>mount(
      MeshBuilder.CreateBox("troll-"+name,{width:size[0],height:size[1],depth:size[2]},scene),parent,p,mat);
  const cylinder=(name:string,parent:TransformNode,p:[number,number,number],
    radius:number,height:number,mat:StandardMaterial,tessellation=11):Mesh=>mount(
      MeshBuilder.CreateCylinder("troll-"+name,{diameter:radius*2,height,tessellation},scene),parent,p,mat);
  const cone=(name:string,parent:TransformNode,p:[number,number,number],
    radius:number,height:number,mat:StandardMaterial):Mesh=>mount(
      MeshBuilder.CreateCylinder("troll-"+name,{diameterTop:0,diameterBottom:radius*2,height,tessellation:8},scene),parent,p,mat);
  const torus=(name:string,parent:TransformNode,p:[number,number,number],
    diameter:number,thickness:number,mat:StandardMaterial):Mesh=>mount(
      MeshBuilder.CreateTorus("troll-"+name,{diameter,thickness,tessellation:14},scene),parent,p,mat);
  /** Deterministic sculpted vertex waviness and local skin-tone noise. */
  const sculpt=(m:Mesh,seed:number,amount=.045):void=>{
    const data=m.getVerticesData(VertexBuffer.PositionKind);
    const indexes=m.getIndices();
    if(!data||!indexes)return;
    const p=[...data], tint:number[]=[];
    for(let i=0;i<p.length;i+=3){
      const [x,y,z]=p.slice(i,i+3);
      const f=Math.sin((x+seed)*23.3+y*11.7+z*7.9)*
        Math.sin(x*14.2-z*29.1+seed*.31)+
        Math.sin(x*7.4+y*19.7+z*11.3+seed)*.55;
      const deform=1+f*amount;
      p[i]*=deform;p[i+1]*=deform;p[i+2]*=deform;
      const shade=Math.min(1.24,Math.max(.67,.93+f*.13));
      tint.push(shade,shade*.98,shade*.94,1);
    }
    const normals:number[]=[];
    VertexData.ComputeNormals(p,indexes,normals);
    m.setVerticesData(VertexBuffer.PositionKind,p);
    m.setVerticesData(VertexBuffer.NormalKind,normals);
    m.setVerticesData(VertexBuffer.ColorKind,tint);
  };
  // The body is broad and deeply hunched, with three overlapping sculpted
  // masses rather than the former orange ball. Its material is ash-grey.
  sculpt(sphere("barrel-torso",spine,[0,1.16,-.28],[4.15,3.48,2.62],skin,28),5,.028);
  sculpt(sphere("bent-upper-back",spine,[0,1.84,-.54],[3.88,2.45,2.54],shadowSkin,22),12,.055);
  sculpt(sphere("belly",spine,[0,.51,.36],[2.62,1.72,2.07],skin,20),19,.034);
  sculpt(sphere("neck",spine,[0,2.70,.30],[2.17,1.23,1.60],shadowSkin),8);
  // Underbelly leather belt and three torn cloth plates, all dimensional.
  cylinder("waist-belt",spine,[0,-.12,0],1.42,.23,darkLeather,15).scaling.z=.81;
  for(const x of [-.65,0,.65]){
    const flap=block("apron-panel-"+x,spine,[x,-1.08,.94],[.64,1.66,.09],apron);
    flap.rotation.z=x*.22;
    cone("apron-torn-edge-"+x,spine,[x,-1.94,.93],.32,.43,apron).rotation.z=Math.PI;
  }
  for(let j=0;j<5;j++){
    const rivet=sphere("belt-stud-"+j,spine,[-1.02+j*.52,-.08,1.06],[.09,.09,.08],iron,8);
    rivet.rotation.y=j*.25;
  }
  // Miner icon and battle damage are *geometry*, never UI planes.
  const cross1=block("apron-crossed-pick-a",spine,[-.07,-1.13,1.02],[.11,.67,.045],rope);
  cross1.rotation.z=.72;
  const cross2=block("apron-crossed-pick-b",spine,[.07,-1.13,1.03],[.11,.67,.045],rope);
  cross2.rotation.z=-.72;
  // Layered neck/chest harness, supported by shoulders and crossing belt.
  for(const sign of [-1,1]){
    const strap=block("chest-harness-"+sign,spine,[sign*.9,1.5,.93],[.29,2.75,.11],leather);
    strap.rotation.z=sign*.38;
    for(let i=0;i<4;i++){
      sphere("harness-rivet-"+sign+"-"+i,spine,
        [sign*(.55+i*.16),.47+i*.67,1.02-i*.055],
        [.085,.075,.065],iron,8);
    }
  }
  torus("harness-ring",spine,[0,.88,1.29],.38,.09,copper).rotation.x=Math.PI/2;
  // Strong face silhouette. Front is +Z, matching the combat motor's +Z yaw.
  sculpt(sphere("head",head,[0,.18,.20],[1.89,1.80,1.60],skin,24),24,.043);
  sphere("heavy-brow",head,[0,.53,.84],[1.70,.34,.53],shadowSkin);
  for(const side of [-1,1]){
    sphere("cheek-"+side,head,[side*.58,-.10,.65],[.67,.62,.55],skin,15);
    sphere("eye-socket-"+side,head,[side*.47,.38,.89],[.35,.21,.15],mouth,16);
    sphere("eye-glow-"+side,head,[side*.47,.38,.985],[.12,.09,.065],ember,15);
    sphere("eye-pupil-"+side,head,[side*.47,.38,1.03],[.043,.048,.022],pupil,10);
    const eyebrow=sphere("furrow-"+side,head,[side*.49,.59,.90],[.67,.27,.34],skin,12);
    eyebrow.rotation.z=side*.23;
    const ear=cone("pointed-ear-"+side,head,[side*1.00,.20,.01],.30,.68,shadowSkin);
    ear.rotation.z=side*Math.PI/2.8;
    // Obvious fangs give the open mouth a readable threatening expression.
    const tusk=cone("tusk-"+side,head,[side*.52,-.56,1.02],.11,.32,bone);
    tusk.rotation.z=-side*.16;
  }
  sphere("nose",head,[0,.00,1.13],[.55,.36,.47],nose,20);
  sphere("gaping-mouth",head,[0,-.54,.94],[.89,.38,.15],mouth,16);
  for(let t=-2;t<=2;t++){
    const tooth=cone("tooth-"+t,head,[t*.135,-.43,1.055],.054,.14,bone);
    tooth.rotation.z=Math.PI;
  }
  sphere("lower-jaw",head,[0,-.78,.84],[1.17,.32,.47],skin);
  // Roughly 1 in 5 scars read clearly even when the camera is far away.
  for(let i=0;i<9;i++){
    const x=Math.sin(i*2.17)*.71;
    const m=block("face-scar-"+i,head,[x*.88,.20-i*.072,.97+Math.cos(i)*.09],
      [.035,.22+(i%3)*.045,.032],scar);
    m.rotation.z=.35+i*.13;
  }
  // Broken stone growth around brow and neck prevents a symmetrical toy face:
  // angular jagged plates form a hostile cave-dweller silhouette.
  for(const side of [-1,1]){
    const browRidge=block("brow-stone-ridge-"+side,head,
      [side*.57,.60,.96],[.59,.14,.24],shadowSkin);
    browRidge.rotation.z=side*.26;
    const jawTendon=sphere("cheek-tendon-"+side,head,
      [side*.65,-.48,.50],[.28,.53,.42],shadowSkin,12);
    jawTendon.rotation.z=side*.35;
    const horn=cone("temple-bone-spur-"+side,head,
      [side*.88,.61,.25],.17,.48,bone);
    horn.rotation.z=side*.85;
  }
  for(let i=0;i<11;i++){
    const x=(i%4-1.5)*.41;
    const y=(Math.floor(i/4)-1)*.28;
    const p=block("brow-skin-fissure-"+i,head,
      [x,y+.53,.95],[.023,.17+i%3*.07,.029],scar);
    p.rotation.z=(i%5-2)*.24;
  }
  // Twin red vented mine canisters, the signature silhouette chosen in art.
  // These are physical cylinders with armoured rims and recessed black ends.
  for(const side of [-1,1]){
    const mountCan=new TransformNode("troll-canister-rig-"+side,scene);
    mountCan.parent=spine;
    mountCan.position.set(side*1.20,4.08,-.46);
    mountCan.rotation.z=side*.32;
    mountCan.rotation.x=1.0;
    cylinder("canister-body-"+side,mountCan,[0,0,0],.40,1.72,rust,14);
    for(const y of [-.7,.7]){
      cylinder("canister-banded-"+side+"-"+y,mountCan,[0,y,0],.43,.16,plated,14);
    }
    cylinder("canister-vent-dark-"+side,mountCan,[0,.84,0],.35,.03,mouth,14);
    for(let a=0;a<7;a++){
      const angle=(a/7)*Math.PI*2;
      sphere("canister-hot-perforation-"+side+"-"+a,mountCan,
        [Math.cos(angle)*.215,.868,Math.sin(angle)*.215],
        [.063,.016,.063],ember,8);
    }
    cylinder("canister-center-hole-"+side,mountCan,[0,.87,0],.08,.03,ember);
    const anchor=block("canister-buckle-"+side,spine,
      [side*1.20,3.32,-.56],[.54,.19,.72],leather);
    anchor.rotation.z=side*.19;
  }
  // Three-dimensional overlapping rust plates on shoulders/back.
  for(const sign of [-1,1]){
    for(let i=0;i<3;i++){
      const plate=block("shoulder-plate-"+sign+"-"+i,spine,
        [sign*(1.45+i*.13),2.35-i*.13,-.36-i*.16],
        [.85,.25,.98],i===1?iron:plated);
      plate.rotation.z=sign*(.1+i*.11);
      for(const k of [-1,1])sphere("shoulder-rivet-"+sign+"-"+i+"-"+k,
        spine,[sign*(1.45+i*.13)+k*.26,2.52-i*.13,-.1-i*.16],
        [.11,.09,.11],copper,8);
    }
  }

  // Upper arms have real elbow joints. Hand positions are IK-driven toward
  // two distinct hammer grips, so the weapon never floats away in a swing.
  const arms=([-1,1] as const).map(side=>{
    const shoulder=V(side*1.82,2.24,.31);
    const upper=sphere("upper-arm-"+side,spine,[0,0,0],[1,1,1],skin,20);sculpt(upper,side+31,.03);
    const lower=sphere("forearm-"+side,spine,[0,0,0],[1,1,1],skin,20);sculpt(lower,side+45,.035);
    const elbow=sphere("elbow-"+side,spine,[0,0,0],[.71,.65,.66],skin,14);
    const bracer=sphere("bracer-"+side,spine,[0,0,0],[1,1,1],plated,17);
    const hand=sphere("giant-hand-"+side,spine,[0,0,0],[.59,.47,.60],skin,16);
    const wristBand=sphere("wrist-band-"+side,spine,[0,0,0],[1,1,1],leather,13);
    for(let f=0;f<4;f++){
      // Fingers are curled directly around the long timber shaft.
      const digit=sphere("hammer-grip-finger-"+side+"-"+f,hand,
        [-.24+f*.17,-.22,.17],[.16,.26,.22],skin,9);
      digit.rotation.x=.4;
    }
    return {side,shoulder,upper,lower,elbow,bracer,hand,wristBand};
  });
  // Arm and leg meshes are collision-free; the actual strike arc remains
  // in arenaCombatMotion.ts, independent of these visual proportions.
  const legs=([-1,1] as const).map(side=>{
    const hip=V(side*.96,2.62,-.30);
    const thigh=sphere("thigh-"+side,pose,[0,0,0],[1,1,1],skin,20);sculpt(thigh,side+67,.04);
    const shin=sphere("shin-"+side,pose,[0,0,0],[1,1,1],shadowSkin,18);sculpt(shin,side+71,.04);
    const kneecap=sphere("kneecap-"+side,pose,[0,0,0],[.85,.76,.85],skin,14);
    const foot=sphere("boulder-foot-"+side,pose,[side*1.06,.31,.55],[1.45,.60,1.47],skin,18);
    for(let t=0;t<4;t++){
      sphere("foot-claw-"+side+"-"+t,foot,[-.32+t*.21,-.15,.43],[.12,.16,.24],bone,9);
    }
    const strap=block("ankle-leather-"+side,pose,[side*1.06,.7,.23],[.79,.17,.87],leather);
    return {side,hip,thigh,shin,kneecap,foot,strap};
  });
  // The hammer is *not* a cylinder head: irregular stone and iron cladding,
  // rivets, a squared-off asymmetric face, bound wooden grip and worn crest.
  const shaft=cylinder("long-maul-haft",weapon,[-.20,0,0],.17,4.8,wood,12);
  shaft.rotation.z=Math.PI/2;
  for(const x of [-1.25,-.35,.65,1.35]){
    cylinder("maul-haft-ring-"+x,weapon,[x,0,0],.20,.105,iron,13).rotation.z=Math.PI/2;
  }
  for(let i=0;i<9;i++){
    const x=.5+i*.125;
    const grip=cylinder("maul-haft-wrap-"+i,weapon,[x,0,0],.185,.07,leather,11);
    grip.rotation.z=Math.PI/2;
  }
  sculpt(block("maul-stone-core",weapon,[-2.44,-.03,.01],[1.50,1.68,1.55],rock),97,.055);
  for(const x of [-3.03,-1.84]){
    const band=block("maul-riveted-iron-ring-"+x,weapon,[x,-.02,.01],[.20,1.80,1.70],plated);
    band.rotation.z=x< -2.4?-.045:.04;
    for(const y of [-.65,.65])for(const z of [-.66,.66]){
      sphere("maul-rivet-"+x+"-"+y+"-"+z,weapon,[x,y,z],[.115,.115,.08],iron,8);
    }
  }
  // Two scored mining marks carved into the hammer's forward face.
  for(const angle of [-.63,.63]){
    const mark=block("maul-mark-"+angle,weapon,[-2.45,-.08,.808],
      [.10,.72,.055],rope);
    mark.rotation.z=angle;
  }
  // Hammer head damage catches torchlight with exposed 3D splinters.
  // These are fixed to the weapon socket, so attack and death poses keep
  // their shards properly attached to the real swinging maul.
  for(let i=0;i<14;i++){
    const x=-2.9+(i%4)*.34;
    const y=(i%5-2)*.19;
    const z=(i%2?1:-1)*.80;
    const crack=block("maul-stone-fissure-"+i,weapon,[x,y,z],
      [.028,.20+i%3*.11,.035],i%3===0?darkLeather:plated);
    crack.rotation.z=(i%5-2)*.25;
  }
  for(const side of [-1,1]){
    const wedge=cone("maul-iron-burr-"+side,weapon,
      [-2.67,side*.75,.58],.18,.49,iron);
    wedge.rotation.z=side*.85;
  }
  const chipped=block("maul-chipped-corner",weapon,[-2.98,.62,.57],[.42,.36,.45],iron);
  chipped.rotation.z=.38;
  for(const i of [-1,1]){
    cone("maul-striker-"+i,weapon,[-3.10,i*.50,0],.32,.38,rock).rotation.z=Math.PI/2;
  }

  let elapsed=0,deathTime=0,wasDead=false,activePhase:BossPhase="chase";
  let hammerPitch=0,hammerYaw=0,hammerRoll=0,bodyPitch=0,bodyRoll=0;
  let lastStep=0;
  const updateHandIK=():void=>{
    const inv=spine.getWorldMatrix().clone().invert();
    weapon.computeWorldMatrix(true);
    for(const arm of arms){
      const gripX=arm.side<0?-.72:.74;
      const grip=Vector3.TransformCoordinates(
        Vector3.TransformCoordinates(V(gripX,0,0),weapon.getWorldMatrix()),inv);
      const wrist=grip.add(V(0,-.065,.04));
      const elbow=elbowFor(arm.shoulder,wrist,arm.side);
      along(arm.upper,arm.shoulder,elbow,.89,.82);
      along(arm.lower,elbow,wrist,.95,.94);
      along(arm.bracer,elbow.add(wrist.subtract(elbow).scale(.45)),wrist,.98,1.05);
      along(arm.wristBand,elbow.add(wrist.subtract(elbow).scale(.80)),wrist,1.0,1.05);
      arm.elbow.position.copyFrom(elbow);
      arm.hand.position.copyFrom(wrist);
    }
  };
  const moveLegs=(time:number,moving:number,death:number):void=>{
    const amplitude=Math.min(1,moving*4.2)*(1-death);
    for(const leg of legs){
      const stride=Math.sin(time*5.9+(leg.side===1?0:Math.PI))*amplitude;
      const knee=V(leg.side*(1.00+.10*stride),1.37-.12*Math.abs(stride),
        -.14+.53*stride+death*.45);
      const ankle=V(leg.side*1.04,.47+Math.max(0,stride)*.16,.22+stride*.72+death*.28);
      const hip=leg.hip.add(V(0,-death*.35,0));
      along(leg.thigh,hip,knee,1.06,1.02);
      along(leg.shin,knee,ankle,.73,.72);
      leg.kneecap.position.copyFrom(knee);
      leg.foot.position.set(ankle.x,.34+Math.max(0,stride)*.13,ankle.z+.40);
      leg.foot.rotation.x=-stride*.14;
      leg.strap.position.set(ankle.x,.78,ankle.z);
    }
  };
  const animation=(a:CaveTrollAnimation):void=>{
    const dt=Math.max(0,Math.min(.10,a.delta));
    elapsed+=dt;
    const dead=a.phase==="dead" || a.hp<=0;
    if(dead){deathTime+=dt;wasDead=true;}
    else if(wasDead){deathTime=0;wasDead=false;}
    const fall=ease(deathTime/1.65);
    const breath=Math.sin(a.time*1.65)*.026;
    const step=Math.sin(a.time*5.9);
    const walk=a.phase==="chase"?Math.min(1,a.moved*4.5):0;
    let pitch=-.05,twist=0,roll=0,hammerZ=.0,hammerY=0,hammerX=.0;
    switch(a.phase){
      case "chase":
        pitch=-.13+breath+Math.abs(step)*walk*.045;
        twist=step*walk*.045;
        hammerZ=.035+Math.sin(a.time*2.2)*.045;
        break;
      case "windup":{
        const t=ease(a.phaseAge/(a.slam?1.05:.85));
        pitch=lerp(-.12,-.42,t);
        twist=(a.slam?-.18:-.35)*t;
        hammerZ=-.10-.68*t;
        hammerY=(a.slam?-.12:-.3)*t;
        hammerX=-.18*t;
        head.rotation.x=.06-.25*t;
        break;
      }
      case "strike":{
        // Head crosses the ground near the real 140 ms hit tick.
        const strike=ease(a.phaseAge/.205);
        pitch=lerp(-.42,.27,strike);
        twist=lerp(-.3,.35,strike);
        hammerZ=lerp(-.78,.90,strike);
        hammerY=lerp(-.25,.18,strike);
        hammerX=lerp(-.18,.16,strike);
        break;
      }
      case "recover":{
        const t=ease(a.phaseAge/.72);
        pitch=lerp(.27,-.12,t);
        twist=lerp(.35,0,t);
        hammerZ=lerp(.90,.04,t);
        hammerY=lerp(.18,0,t);
        break;
      }
      case "stagger":{
        const t=ease(a.phaseAge/1.60);
        pitch=-.35*Math.sin(Math.PI*t);
        roll=-.22*Math.sin(Math.PI*t);
        hammerZ=-.34*(1-t);
        break;
      }
      case "dead":
        pitch=.50*fall;
        roll=.18*fall;
        hammerZ=1.20*fall;
        hammerY=.32*fall;
        break;
    }
    const easing=1-Math.exp(-dt*(a.phase==="strike"?30:11));
    bodyPitch=lerp(bodyPitch,pitch,easing);
    bodyRoll=lerp(bodyRoll,roll,easing);
    hammerPitch=lerp(hammerPitch,hammerZ,easing);
    hammerYaw=lerp(hammerYaw,hammerY,easing);
    hammerRoll=lerp(hammerRoll,hammerX,easing);
    spine.rotation.x=bodyPitch;
    spine.rotation.z=bodyRoll;
    spine.rotation.y=twist;
    pose.rotation.x=fall*1.22;
    pose.rotation.z=fall*.13;
    pose.position.y=-fall*.79+Math.abs(step)*walk*.06;
    weapon.rotation.z=hammerPitch;
    weapon.rotation.y=hammerYaw;
    weapon.rotation.x=hammerRoll;
    head.rotation.x=(a.phase==="windup"?-.14:0)+breath;
    head.rotation.y=twist*.26;
    if(a.phase==="dead")head.rotation.x=fall*.37;
    const life=dead?1-fall:1;
    ember.emissiveColor=Color3.FromHexString("#ff7625").scale(.85*life);
    pupil.emissiveColor=Color3.FromHexString("#ffe0a0").scale(.85*life);
    pose.computeWorldMatrix(true);
    spine.computeWorldMatrix(true);
    weapon.computeWorldMatrix(true);
    updateHandIK();
    moveLegs(a.time,a.moved,fall);
    activePhase=a.phase;
    lastStep=a.moved;
    root.metadata.animationPhase=activePhase;
    root.metadata.deathProgress=fall;
    root.metadata.hammerSwing=hammerPitch;
    root.metadata.walkMotion=lastStep;
    root.metadata.animationClock=elapsed;
  };
  // Export one root whose children cleanly dispose with the arena's scene.
  root.metadata.geometryCount=geometryCount;
  root.metadata.hasAnimatedArms=true;
  root.metadata.hasAnimatedLegs=true;
  root.metadata.hasHammer=true;
  root.metadata.hasDeathSequence=true;
  void materials;
  return {root,geometryCount,animate:animation};
}