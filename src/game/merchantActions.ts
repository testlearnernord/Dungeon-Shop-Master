import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ITEMS, type ItemId } from "./inventory.ts";
import { merchantActionPose, merchantGaitPose, type MerchantAction } from "./merchantMotion.ts";

export type {MerchantAction} from "./merchantMotion.ts";

/** First-person hands + a grounded lower body. Body geometry follows the
 * camera's world position/yaw but NOT its pitch, so looking down reveals
 * actual legs and boots instead of feet glued to the screen. */
export function createMerchantActions(
  scene:Scene,camera:Camera,enabled:()=>boolean,volume:()=>number,
  isShopView:()=>boolean=()=>true,
  selectedItem:()=>ItemId=()=>ITEMS[0].id,
){
  const skin=new StandardMaterial("galvik-skin",scene);
  skin.diffuseColor=new Color3(.65,.49,.39);
  const sleeve=new StandardMaterial("galvik-sleeve-cloth",scene);
  sleeve.diffuseColor=new Color3(.20,.16,.13);
  const cuff=new StandardMaterial("galvik-worn-cuff",scene);
  cuff.diffuseColor=new Color3(.28,.22,.17);
  const trousers=new StandardMaterial("galvik-trousers",scene);
  trousers.diffuseColor=new Color3(.22,.21,.19);
  const boots=new StandardMaterial("galvik-leather-boots",scene);
  boots.diffuseColor=new Color3(.15,.11,.09);
  const wood=new StandardMaterial("galvik-pickaxe-wood",scene);
  wood.diffuseColor=new Color3(.30,.19,.12);
  const iron=new StandardMaterial("galvik-pickaxe-iron",scene);
  iron.diffuseColor=new Color3(.48,.48,.46);
  const goods=new StandardMaterial("galvik-carried-goods",scene);
  goods.diffuseColor=new Color3(.65,.42,.20);
  const coins=new StandardMaterial("galvik-coins",scene);
  coins.diffuseColor=new Color3(.86,.65,.20);
  coins.specularColor=new Color3(.5,.4,.2);
  const materials=[skin,sleeve,cuff,trousers,boots,wood,iron,goods,coins];
  const meshes:Mesh[]=[];
  const viewRoot=new TransformNode("galvik-viewmodel",scene);
  viewRoot.parent=camera;
  const bodyRoot=new TransformNode("galvik-grounded-body",scene);

  const box=(name:string,size:{width:number;height:number;depth:number},
    parent:TransformNode,at:[number,number,number],mat:StandardMaterial):Mesh=>{
    const mesh=MeshBuilder.CreateBox(name,size,scene);
    mesh.parent=parent;mesh.position=new Vector3(...at);
    mesh.material=mat;mesh.isPickable=false;mesh.checkCollisions=false;
    meshes.push(mesh);return mesh;
  };
  const cylinder=(name:string,height:number,diameter:number,parent:TransformNode,
    at:[number,number,number],mat:StandardMaterial):Mesh=>{
    const mesh=MeshBuilder.CreateCylinder(name,{height,diameter},scene);
    mesh.parent=parent;mesh.position=new Vector3(...at);
    mesh.material=mat;mesh.isPickable=false;mesh.checkCollisions=false;
    meshes.push(mesh);return mesh;
  };
  const sphere=(name:string,diameter:number,parent:TransformNode,
    at:[number,number,number],mat:StandardMaterial):Mesh=>{
    const mesh=MeshBuilder.CreateSphere(name,{diameter,segments:8},scene);
    mesh.parent=parent;mesh.position=new Vector3(...at);
    mesh.material=mat;mesh.isPickable=false;mesh.checkCollisions=false;
    meshes.push(mesh);return mesh;
  };
  const arms=[-1,1].map(side=>{
    const shoulder=new TransformNode(`galvik-arm-pivot-${side}`,scene);
    shoulder.parent=viewRoot;
    shoulder.position.set(side*.38,-.35,.83);
    const forearm=cylinder(`galvik-forearm-${side}`,.48,.19,shoulder,
      [0,-.22,0],sleeve);
    forearm.rotation.z=side*.10;
    cylinder(`galvik-wrist-cuff-${side}`,.12,.21,shoulder,
      [0,-.44,0],cuff);
    const palm=sphere(`galvik-hand-${side}`,.19,shoulder,
      [0,-.54,.025],skin);
    palm.scaling.set(.9,1.2,.7);
    // Four recognizable fingers, not one floating ball at the sleeve.
    for(let finger=0;finger<4;finger++){
      const tip=cylinder(`galvik-finger-${side}-${finger}`,.12,.043,shoulder,
        [(finger-1.5)*.041,-.67,.045],skin);
      tip.rotation.x=.18;
    }
    sphere(`galvik-thumb-${side}`,.075,shoulder,
      [side*.11,-.56,.06],skin);
    return shoulder;
  });
  const pickHandle=cylinder("galvik-pick-handle",.7,.064,arms[1],
    [0,-.91,.04],wood);
  pickHandle.rotation.z=-.12;
  const pickHead=box("galvik-pick-head",{width:.56,height:.075,depth:.10},
    arms[1],[0,-1.23,.04],iron);
  // The taper and central rivet distinguish a pick from a plain T-shaped rod.
  box("galvik-pick-tooth-left",{width:.16,height:.055,depth:.055},
    arms[1],[-.33,-1.25,.04],iron).rotation.z=-.35;
  box("galvik-pick-tooth-right",{width:.16,height:.055,depth:.055},
    arms[1],[.33,-1.25,.04],iron).rotation.z=.35;
  const pickParts=meshes.filter(m=>m.name.startsWith("galvik-pick-"));
  const itemBox=box("galvik-held-package",{width:.22,height:.27,depth:.25},
    arms[1],[0,-.8,.17],goods);
  const itemBottle=cylinder("galvik-held-bottle",.31,.16,arms[1],
    [0,-.78,.16],goods);
  const itemHerb=sphere("galvik-held-herb",.23,arms[1],
    [0,-.78,.16],goods);
  const coin=sphere("galvik-held-coin",.14,arms[0],
    [0,-.79,.12],coins);
  coin.scaling.set(1,.25,1);
  box("galvik-torso",{width:.55,height:.67,depth:.35},
    bodyRoot,[0,-.52,-.16],sleeve);
  box("galvik-belt",{width:.57,height:.13,depth:.39},
    bodyRoot,[0,-.89,-.16],boots);
  const legs=[-1,1].map(side=>{
    const hip=new TransformNode(`galvik-leg-pivot-${side}`,scene);
    hip.parent=bodyRoot;hip.position.set(side*.16,-.94,-.09);
    cylinder(`galvik-thigh-${side}`,.38,.18,hip,[0,-.19,0],trousers);
    cylinder(`galvik-shin-${side}`,.42,.15,hip,[0,-.57,.01],trousers);
    box(`galvik-boot-${side}`,{width:.20,height:.18,depth:.32},
      hip,[0,-.72,.095],boots);
    return hip;
  });
  const setItems=(visible:boolean,itemId:ItemId)=>{
    itemBox.setEnabled(visible&&itemId!=="mana-potion"&&itemId!=="healing-herb");
    itemBottle.setEnabled(visible&&itemId==="mana-potion");
    itemHerb.setEnabled(visible&&itemId==="healing-herb");
  };

  let context:AudioContext|null=null;
  const tone=(frequency:number,time:number,duration:number,level:number,
    wave:OscillatorType="triangle")=>{
    if(!context)return;
    const osc=context.createOscillator(),gain=context.createGain();
    osc.type=wave;
    osc.frequency.setValueAtTime(Math.max(40,frequency),time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40,frequency*.55),time+duration);
    gain.gain.setValueAtTime(.0001,time);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level),time+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    osc.connect(gain);gain.connect(context.destination);
    osc.start(time);osc.stop(time+duration+.015);
  };
  const sound=(kind:MerchantAction|"step")=>{
    // Checkout already has a dedicated QTE + coin SFX system: one cash
    // transaction must not trigger two different audio chimes.
    if(kind==="checkout"||!enabled()||volume()<=0)return;
    try{
      context??=new AudioContext();
      if(context.state==="suspended")void context.resume().catch(()=>{});
      const at=context.currentTime;
      const level=Math.min(.11,volume()*.09);
      if(kind==="mine"){
        tone(115,at,.15,level,"sawtooth");
        tone(77,at+.055,.22,level*.7,"triangle");
      }else if(kind==="stock"){
        tone(180,at,.09,level*.48);
        tone(240,at+.09,.12,level*.30);
      }else if(kind==="destock"){
        tone(245,at,.09,level*.38);
        tone(150,at+.09,.12,level*.35);
      }else{
        tone(88,at,.07,level*.16);
        tone(130,at+.026,.06,level*.09);
      }
    }catch{/* Optional synthesized sound cannot break inventory actions. */}
  };

  let action:MerchantAction|null=null,started=0;
  const durations:Record<MerchantAction,number>={
    stock:480,destock:480,mine:650,checkout:520,
  };
  let distanceWalked=0,lastFootstep=0,lastX=camera.position.x,lastZ=camera.position.z;
  let lastShow=false;
  const observer=scene.onBeforeRenderObservable.add(()=>{
    const show=isShopView()&&!document.querySelector("dialog[open]");
    if(lastShow!==show){
      viewRoot.setEnabled(show);bodyRoot.setEnabled(show);lastShow=show;
    }
    if(!show){
      lastX=camera.position.x;lastZ=camera.position.z;return;
    }
    const now=performance.now();
    const moved=Math.hypot(camera.position.x-lastX,camera.position.z-lastZ);
    lastX=camera.position.x;lastZ=camera.position.z;
    const walking=moved>.001&&moved<.5;
    if(walking)distanceWalked+=moved;
    const gait=merchantGaitPose(distanceWalked,walking);
    bodyRoot.position.copyFrom(camera.position);
    bodyRoot.rotation.y=camera.rotation.y;
    bodyRoot.position.y+=gait.sway;
    legs[0].rotation.x=gait.leftSwing;
    legs[1].rotation.x=gait.rightSwing;
    legs[0].position.y=-.94+gait.leftFootLift;
    legs[1].position.y=-.94+gait.rightFootLift;
    if(walking&&distanceWalked-lastFootstep>=.53){
      lastFootstep=distanceWalked;sound("step");
    }
    let elapsed=action?(now-started)/durations[action]:1;
    if(action&&elapsed>=1){action=null;elapsed=1;}
    const pose=merchantActionPose(action,elapsed);
    const breathing=Math.sin(now*.002)*.012;
    arms[0].rotation.x=pose.leftPitch+breathing;
    arms[1].rotation.x=pose.rightPitch-breathing;
    arms[1].rotation.z=pose.rightRoll;
    pickParts.forEach(mesh=>mesh.setEnabled(pose.toolVisible));
    setItems(pose.itemVisible,selectedItem());
    coin.setEnabled(pose.coinVisible);
  });
  // No pickable/collidable body meshes: looking down, moving furniture and
  // mining cannot accidentally raycast Galvik's own limbs.
  pickParts.forEach(mesh=>mesh.setEnabled(false));
  setItems(false,selectedItem());coin.setEnabled(false);
  return {
    play(next:MerchantAction){
      if(!isShopView())return;
      action=next;started=performance.now();
      const entry=ITEMS.find(item=>item.id===selectedItem());
      if(entry)goods.diffuseColor=Color3.FromHexString(entry.color);
      sound(next);
    },
    dispose(){
      scene.onBeforeRenderObservable.remove(observer);
      meshes.forEach(mesh=>mesh.dispose());
      arms.forEach(node=>node.dispose());legs.forEach(node=>node.dispose());
      viewRoot.dispose();bodyRoot.dispose();
      materials.forEach(material=>material.dispose());
      if(context)void context.close().catch(()=>{});
    },
  };
}
