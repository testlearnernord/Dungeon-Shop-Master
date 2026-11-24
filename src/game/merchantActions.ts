import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SHELF_GOODS, type ItemId } from "./economy.ts";
import {getShopStockTemplates,cloneShopStockModel} from "./shopStockAssets.ts";
import { merchantActionPose, merchantGaitPose, type MerchantAction } from "./merchantMotion.ts";

export type {MerchantAction} from "./merchantMotion.ts";

/** First-person hands + a grounded lower body. Body geometry follows the
 * camera's world position/yaw but NOT its pitch, so looking down reveals
 * actual legs and boots instead of feet glued to the screen. */
export function createMerchantActions(
  scene:Scene,camera:UniversalCamera,enabled:()=>boolean,volume:()=>number,
  isShopView:()=>boolean=()=>true,
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
  const coins=new StandardMaterial("galvik-coins",scene);
  coins.diffuseColor=new Color3(.86,.65,.20);
  coins.specularColor=new Color3(.5,.4,.2);
  const materials=[skin,sleeve,cuff,trousers,boots,wood,iron,coins];
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
  // The grip is at the wrist and the wooden shaft extends UP, past the
  // hand, to a distinct iron crosshead. The old mesh extended mostly below
  // the hand, leaving only a thin metallic bar visible during its upswing.
  const pickGrip=new TransformNode("galvik-pick-grip",scene);
  pickGrip.parent=arms[1];
  pickGrip.position.set(0,-.55,.10);
  const pickHandle=cylinder("galvik-pick-handle",.98,.075,pickGrip,
    [0,.43,0],wood);
  pickHandle.rotation.z=-.08;
  box("galvik-pick-head",{width:.72,height:.12,depth:.14},
    pickGrip,[0,.88,0],iron);
  for(const side of [-1,1]){
    const tooth=MeshBuilder.CreateCylinder("galvik-pick-tooth-"+side,{
      height:.40,diameterTop:0,diameterBottom:.14,tessellation:8,
    },scene);
    tooth.parent=pickGrip;
    tooth.position.set(side*.54,.87,0);
    // The tapered point faces away from the center of the iron head.
    tooth.rotation.z=side===-1?Math.PI/2:-Math.PI/2;
    tooth.material=iron;
    tooth.isPickable=false;
    tooth.checkCollisions=false;
    meshes.push(tooth);
  }
  const pickParts=meshes.filter(m=>m.name.startsWith("galvik-pick-"));
  // Use the same item-specific GLB templates as the shelf and the customers.
  // Hold only one cosmetic instance, and latch the successfully transferred
  // item at the action boundary, not the next inventory selection.
  let held:Mesh|null=null,heldId:ItemId|null=null;
  let templates:ReadonlyMap<ItemId,Mesh>|null=null,disposed=false;
  void getShopStockTemplates(scene).then(stock=>{
    if(!disposed&&!scene.isDisposed)templates=stock;
  }).catch(error=>console.error("Galvik stock GLB loading failed",error));
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
  const setItems=(visible:boolean)=>{
    if(!held&&heldId&&templates){
      const item=SHELF_GOODS.find(entry=>entry.id===heldId);
      const template=templates.get(heldId);
      if(item&&template){
        held=cloneShopStockModel(template,"galvik-held-stock");
        held.parent=arms[1];
        const weapon=item.kind==="weapon",armor=item.kind==="armor";
        const scale=weapon?.72:armor?.68:.78;
        held.scaling.setAll(scale);
        // Assets sit on their local shelf origin; bring their centre towards
        // the palm instead of anchoring the bottom of a tall vest to it.
        const center=template.getBoundingInfo().boundingBox.center;
        held.position.set(.04-center.x*scale,-.70-center.y*scale,.16-center.z*scale);
        held.rotation.set(weapon?-.12:0,0,weapon?.32:0);
        held.metadata={...held.metadata,heldItemId:heldId};
      }
    }
    if(held)held.setEnabled(visible);
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
        // Impact follows the visible overhead strike instead of playing
        // as soon as the mouse button begins the wind-up.
        tone(115,at+.30,.14,level,"sawtooth");
        tone(77,at+.35,.19,level*.7,"triangle");
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
    setItems(pose.itemVisible);
    coin.setEnabled(pose.coinVisible);
  });
  // No pickable/collidable body meshes: looking down, moving furniture and
  // mining cannot accidentally raycast Galvik's own limbs.
  pickParts.forEach(mesh=>mesh.setEnabled(false));
  setItems(false);coin.setEnabled(false);
  return {
    play(next:MerchantAction,itemId?:ItemId){
      if(!isShopView())return;
      const product=next==="stock"||next==="destock"?itemId??null:null;
      if(product!==heldId){
        held?.dispose();held=null;heldId=product;
      }
      action=next;started=performance.now();
      setItems(false);
      sound(next);
    },
    dispose(){
      disposed=true;held?.dispose();held=null;
      scene.onBeforeRenderObservable.remove(observer);
      meshes.forEach(mesh=>mesh.dispose());
      pickGrip.dispose();
      arms.forEach(node=>node.dispose());legs.forEach(node=>node.dispose());
      viewRoot.dispose();bodyRoot.dispose();
      materials.forEach(material=>material.dispose());
      if(context)void context.close().catch(()=>{});
    },
  };
}
