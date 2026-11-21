import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {LinesMesh} from "@babylonjs/core/Meshes/linesMesh";
import type {Scene} from "@babylonjs/core/scene";
import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import {CELLAR_FLOOR_Y} from "./cellarRoom.ts";
import {POND_CENTER} from "./cellarPond.ts";

/** Camera-held rod, one real 3D line leading into the already excavated pond,
 * and a water-space bobber. Pure presentation; never mutates the world clock
 * or creates a second physics, collision or fishing-state subsystem. */
export function setupFishingRodVisuals(scene:Scene,camera:UniversalCamera){
  const rig=new TransformNode("fishing-first-person-rod-rig",scene);
  rig.parent=camera;
  rig.position.set(.36,-.32,.58);

  const wood=new StandardMaterial("fishing-rod-polished-wood",scene);
  wood.diffuseColor=new Color3(.30,.19,.10);
  wood.emissiveColor=new Color3(.10,.055,.025);
  const handle=new StandardMaterial("fishing-rod-leather-grip",scene);
  handle.diffuseColor=new Color3(.18,.13,.09);
  handle.emissiveColor=new Color3(.045,.028,.016);
  const metal=new StandardMaterial("fishing-rod-brass-ferrules",scene);
  metal.diffuseColor=new Color3(.73,.53,.27);
  metal.emissiveColor=new Color3(.17,.10,.04);
  const lineColor=new Color3(.77,.84,.79);

  const points=[
    new Vector3(.18,-.16,.02),new Vector3(.12,-.10,.39),
    new Vector3(.025,-.015,.92),new Vector3(-.09,.10,1.62),
    new Vector3(-.16,.19,2.12),
  ];
  const shaft=MeshBuilder.CreateTube("fishing-rod-visible-shaft",{
    path:points,radius:.016,tessellation:8,cap:1,
  },scene);
  shaft.parent=rig;shaft.material=wood;shaft.isPickable=false;
  shaft.checkCollisions=false;
  const grip=MeshBuilder.CreateTube("fishing-rod-visible-grip",{
    path:points.slice(0,2),radius:.034,tessellation:10,cap:1,
  },scene);
  grip.parent=rig;grip.material=handle;grip.isPickable=false;
  grip.checkCollisions=false;
  const reel=MeshBuilder.CreateCylinder("fishing-rod-reel",{
    height:.095,diameter:.115,tessellation:12,
  },scene);
  reel.parent=rig;
  reel.position.set(.12,-.20,.38);
  reel.rotation.z=Math.PI/2;
  reel.material=metal;reel.isPickable=false;reel.checkCollisions=false;
  const eye=MeshBuilder.CreateTorus("fishing-rod-tip-eye",{
    diameter:.055,thickness:.009,tessellation:12,
  },scene);
  eye.parent=rig;eye.position.copyFrom(points[points.length-1]);
  eye.rotation.x=Math.PI/2;eye.material=metal;
  eye.isPickable=false;eye.checkCollisions=false;
  const tip=new TransformNode("fishing-rod-physical-tip",scene);
  tip.parent=rig;tip.position.copyFrom(points[points.length-1]);

  const water=new Vector3(POND_CENTER.x,CELLAR_FLOOR_Y+.17,POND_CENTER.z);
  let line:LinesMesh=MeshBuilder.CreateLines("fishing-rod-visible-line",{
    points:[new Vector3(0,0,0),water.clone()],updatable:true,
  },scene);
  line.color=lineColor;
  line.alpha=.9;
  line.isPickable=false;line.checkCollisions=false;
  const bobber=MeshBuilder.CreateSphere("fishing-water-bobber",{
    diameter:.13,segments:10,
  },scene);
  const bobberMat=new StandardMaterial("fishing-bobber-coral",scene);
  bobberMat.diffuseColor=new Color3(.94,.34,.22);
  bobberMat.emissiveColor=new Color3(.32,.08,.035);
  bobber.material=bobberMat;
  bobber.position.copyFrom(water);
  bobber.checkCollisions=false;bobber.isPickable=false;
  const ring=MeshBuilder.CreateTorus("fishing-bobber-water-ripple",{
    diameter:.39,thickness:.015,tessellation:24,
  },scene);
  ring.position.copyFrom(water);
  ring.position.y=CELLAR_FLOOR_Y+.105;
  const rippleMat=new StandardMaterial("fishing-bobber-ripple-mat",scene);
  rippleMat.diffuseColor=new Color3(.42,.79,.79);
  rippleMat.emissiveColor=new Color3(.11,.20,.20);
  rippleMat.alpha=.75;
  ring.material=rippleMat;
  ring.isPickable=false;ring.checkCollisions=false;

  let active=false,cast=false,impact=0;
  let originalYaw=0,originalPitch=0;
  let elapsed=0;
  rig.setEnabled(false);line.setEnabled(false);
  bobber.setEnabled(false);ring.setEnabled(false);
  scene.onBeforeRenderObservable.add(()=>{
    if(!active)return;
    const dt=Math.min(.05,scene.getEngine().getDeltaTime()/1000);
    elapsed+=dt;impact=Math.max(0,impact-dt*3.2);
    const sway=Math.sin(elapsed*3)*.012;
    rig.rotation.x=-.035+impact*.25+sway;
    rig.rotation.z=impact*.20;
    if(!cast)return;
    bobber.position.y=water.y+Math.sin(elapsed*4.5)*.035;
    ring.scaling.setAll(1+.18*Math.sin(elapsed*3.8));
    tip.computeWorldMatrix(true);
    // Endpoints follow the held rod and the bobber every rendered frame. They
    // never obstruct scene picks or modify actual gameplay physics.
    line=MeshBuilder.CreateLines("fishing-rod-visible-line",{
      points:[tip.getAbsolutePosition().clone(),bobber.position.clone()],
      instance:line,
    },scene);
  });
  return {
    setActive(enabled:boolean){
      active=enabled;
      if(enabled){
        originalYaw=camera.rotation.y;originalPitch=camera.rotation.x;
        elapsed=0;impact=0;
      }else{
        camera.rotation.y=originalYaw;camera.rotation.x=originalPitch;
      }
      rig.setEnabled(enabled);
      line.setEnabled(enabled&&cast);
      bobber.setEnabled(enabled&&cast);
      ring.setEnabled(enabled&&cast);
      if(!enabled)cast=false;
    },
    setCast(value:boolean){
      cast=value;
      line.setEnabled(active&&cast);
      bobber.setEnabled(active&&cast);
      ring.setEnabled(active&&cast);
    },
    tug(){
      impact=.8;
    },
    flick(dx:number,dy:number){
      if(!active)return;
      // Hybrid mode: mouse deltas primarily drive the physical rod;
      // a tightly bounded camera response keeps the pond in view.
      impact=Math.min(1,impact+Math.hypot(dx,dy)*.0025);
      camera.rotation.y=Math.max(originalYaw-.075,Math.min(originalYaw+.075,
        camera.rotation.y+dx*.000035));
      camera.rotation.x=Math.max(originalPitch-.045,Math.min(originalPitch+.045,
        camera.rotation.x+dy*.000025));
    },
    get isVisible(){return rig.isEnabled()&&active;},
  };
}
