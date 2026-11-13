import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";

export type MerchantAction="stock"|"destock"|"mine"|"checkout";

/** Lightweight first-person hands and contextual tools. No external models or sound files. */
export function createMerchantActions(scene:Scene,camera:Camera,enabled:()=>boolean,volume:()=>number){
  const skin=new StandardMaterial("galvik-hand-skin",scene);
  skin.diffuseColor=new Color3(.48,.36,.29);
  const cloth=new StandardMaterial("galvik-sleeve",scene);
  cloth.diffuseColor=new Color3(.19,.16,.13);
  const metal=new StandardMaterial("galvik-pickaxe",scene);
  metal.diffuseColor=new Color3(.42,.44,.43);
  const wood=new StandardMaterial("galvik-tool-wood",scene);
  wood.diffuseColor=new Color3(.28,.17,.10);
  const hands=[-1,1].map(side=>{
    const sleeve=MeshBuilder.CreateCylinder(`galvik-sleeve-${side}`,{height:.4,diameterTop:.14,diameterBottom:.23},scene);
    sleeve.parent=camera;sleeve.position=new Vector3(side*.43,-.48,1.05);
    sleeve.rotation.x=Math.PI/2.8;sleeve.rotation.z=side*.22;
    sleeve.material=cloth;sleeve.isPickable=false;sleeve.checkCollisions=false;
    const hand=MeshBuilder.CreateSphere(`galvik-hand-${side}`,{diameter:.19},scene);
    hand.parent=sleeve;hand.position.y=.25;hand.scaling.set(.85,1.25,.7);
    hand.material=skin;hand.isPickable=false;hand.checkCollisions=false;
    return sleeve;
  });
  const handle=MeshBuilder.CreateCylinder("galvik-pick-handle",{height:.65,diameter:.055},scene);
  handle.parent=hands[1];handle.position.y=.52;handle.material=wood;
  const head=MeshBuilder.CreateBox("galvik-pick-head",{width:.52,height:.075,depth:.085},scene);
  head.parent=handle;head.position.y=.32;head.material=metal;
  for(const mesh of [handle,head]){mesh.isPickable=false;mesh.checkCollisions=false;}
  handle.setEnabled(false);
  let context:AudioContext|null=null;
  const sound=(action:MerchantAction)=>{
    if(!enabled()||volume()<=0)return;
    try{
      context??=new AudioContext();
      if(context.state==="suspended")void context.resume().catch(()=>{});
      const at=context.currentTime;
      const notes=action==="checkout"?[880,1320,1760]:action==="mine"?[95,73]:action==="stock"?[180,235]:[245,160];
      notes.forEach((frequency,index)=>{
        const osc=context!.createOscillator(),gain=context!.createGain();
        osc.type=action==="checkout"?"sine":action==="mine"?"sawtooth":"triangle";
        osc.frequency.setValueAtTime(frequency,at+index*.065);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40,frequency*.7),at+index*.065+.12);
        gain.gain.setValueAtTime(.0001,at+index*.065);
        gain.gain.exponentialRampToValueAtTime(Math.min(.11,volume()*.09),at+index*.065+.009);
        gain.gain.exponentialRampToValueAtTime(.0001,at+index*.065+.16);
        osc.connect(gain);gain.connect(context!.destination);
        osc.start(at+index*.065);osc.stop(at+index*.065+.17);
      });
    }catch{/* Sound is optional. */}
  };
  let action:MerchantAction|null=null,started=0;
  const duration:Record<MerchantAction,number>={stock:360,destock:390,mine:620,checkout:440};
  const observer=scene.onBeforeRenderObservable.add(()=>{
    const t=action?Math.min(1,(performance.now()-started)/duration[action]):0;
    const swing=Math.sin(t*Math.PI);
    hands[0].rotation.x=Math.PI/2.8+(action==="stock"?-.65:action==="destock"?.45:action==="checkout"?-.35:0)*swing;
    hands[1].rotation.x=Math.PI/2.8+(action==="mine"?-1.4:action==="stock"?-.8:action==="destock"?.65:-.4)*swing;
    handle.setEnabled(action==="mine");
    if(action&&t>=1){action=null;handle.setEnabled(false);}
  });
  return {
    play(next:MerchantAction){action=next;started=performance.now();sound(next);},
    dispose(){scene.onBeforeRenderObservable.remove(observer);hands.forEach(mesh=>mesh.dispose(false,true));handle.dispose(false,true);head.dispose(false,true);skin.dispose();cloth.dispose();metal.dispose();wood.dispose();context?.close().catch(()=>{});}
  };
}
