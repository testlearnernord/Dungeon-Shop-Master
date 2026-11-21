import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import {CELLAR_FLOOR_Y} from "./cellarRoom.ts";
import {POND_CENTER} from "./cellarPond.ts";
import {fishPullAgainst,fishPullOnWater,keepFishInsidePond,
  type ScreenPull,type WorldPull} from "./fishingPullPresentation.ts";

const WATER_Y=CELLAR_FLOOR_Y+.09;
const follow=(current:number,target:number,dt:number,speed:number)=>
  current+(target-current)*(1-Math.exp(-dt*speed));
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));

/** Diegetic hooked fish. This ONLY animates committed fishing target directions
 * from the existing HUD. No extra fish rolls, input scoring, time or rewards. */
export function setupFishingFishVisuals(scene:Scene,camera:UniversalCamera){
  const fish=new TransformNode("fishing-hooked-shadow-root",scene);
  fish.position.set(POND_CENTER.x,WATER_Y+.026,POND_CENTER.z);
  const ink=new StandardMaterial("fishing-fish-ink",scene);
  ink.disableLighting=true;
  ink.diffuseColor=new Color3(.018,.050,.055);
  ink.emissiveColor=new Color3(.026,.084,.086);
  ink.alpha=.78;
  ink.backFaceCulling=false;
  const haloMat=new StandardMaterial("fishing-fish-halo",scene);
  haloMat.disableLighting=true;
  haloMat.diffuseColor=new Color3(.04,.18,.20);
  haloMat.emissiveColor=new Color3(.022,.095,.105);
  haloMat.alpha=.20;
  const fishPart=(name:string,x:number,z:number,
    width:number,length:number,material=ink)=>{
    const part=MeshBuilder.CreateSphere(name,{diameter:1,segments:14},scene);
    part.parent=fish;part.position.set(x,0,z);
    part.scaling.set(width,.014,length);
    part.material=material;part.isPickable=false;part.checkCollisions=false;
    return part;
  };
  fishPart("fishing-hooked-shadow-halo",0,0,.37,.65,haloMat);
  fishPart("fishing-hooked-shadow-body",0,0,.235,.44);
  fishPart("fishing-hooked-shadow-head",0,.26,.19,.22);
  const finL=fishPart("fishing-hooked-shadow-fin-left",-.22,-.02,.11,.26);
  finL.rotation.y=-.50;
  const finR=fishPart("fishing-hooked-shadow-fin-right",.22,-.02,.11,.26);
  finR.rotation.y=.50;
  const tail=new TransformNode("fishing-hooked-shadow-tail",scene);
  tail.parent=fish;tail.position.z=-.41;
  for(const side of [-1,1]){
    const lobe=MeshBuilder.CreateSphere(
      "fishing-hooked-shadow-tail-"+side,{diameter:1,segments:10},scene);
    lobe.parent=tail;lobe.position.set(side*.13,0,-.19);
    lobe.scaling.set(.12,.013,.29);
    lobe.rotation.y=side*.45;lobe.material=ink;
    lobe.isPickable=false;lobe.checkCollisions=false;
  }

  const waterGlint=new StandardMaterial("fishing-fish-wake-material",scene);
  waterGlint.disableLighting=true;
  waterGlint.emissiveColor=new Color3(.24,.60,.63);
  waterGlint.diffuseColor=new Color3(.28,.68,.69);
  waterGlint.alpha=.50;
  const wake=MeshBuilder.CreateTorus("fishing-hooked-wake",{
    diameter:.44,thickness:.023,tessellation:28,
  },scene);
  wake.position.set(POND_CENTER.x,WATER_Y+.061,POND_CENTER.z);
  wake.material=waterGlint;wake.isPickable=false;
  wake.checkCollisions=false;

  let visible=false,cast=false,pulling=false,time=0;
  let travel:WorldPull={x:0,z:0},destination:WorldPull={x:0,z:0};
  let pull:ScreenPull={x:0,y:0};
  let tension=0,splash=0,fishHeading=0,tailPhase=0;
  // Apply an additive spring, so existing pointer-lock mouse input is never
  // overwritten by cinematic camera movement. Remove only our last offset.
  let yawOffset=0,pitchOffset=0,appliedYaw=0,appliedPitch=0;
  let yawSpeed=0,pitchSpeed=0;

  const setVisible=(value:boolean)=>{
    visible=value;fish.setEnabled(value);wake.setEnabled(value);
  };
  const impulse=(strength:number)=>{
    yawSpeed+=pull.x*strength;
    pitchSpeed+=pull.y*strength*.60;
    splash=clamp(splash+.75,0,1.8);
  };
  const setTarget=(target:ScreenPull)=>{
    pull=fishPullAgainst(target);
    const world=fishPullOnWater(camera.rotation.y-appliedYaw,pull);
    // The fish darts across the pool in the OPPOSITE screen direction to
    // the gold flick target. All visible tug cues share this exact vector.
    destination=keepFishInsidePond(world.x*.78,world.z*.78);
    fishHeading=Math.atan2(world.x,world.z);
    fish.metadata={fishPullX:pull.x,fishPullY:pull.y,
      worldPullX:world.x,worldPullZ:world.z};
  };

  const update=(dt:number)=>{
    if(!visible&&!cast&&Math.abs(appliedYaw)+Math.abs(appliedPitch)<1e-6)
      return;
    time+=dt;splash=Math.max(0,splash-dt*1.65);
    if(visible){
      const speed=pulling?9:4.5;
      travel={x:follow(travel.x,destination.x,dt,speed),
        z:follow(travel.z,destination.z,dt,speed)};
      const wobble=pulling?Math.sin(time*19)*.055:Math.sin(time*7)*.015;
      const x=clamp(travel.x+Math.cos(fishHeading)*wobble,-.66,.66);
      const z=clamp(travel.z-Math.sin(fishHeading)*wobble,-1.06,1.06);
      fish.position.set(POND_CENTER.x+x,WATER_Y+.026,
        POND_CENTER.z+z);
      fish.rotation.y=follow(fish.rotation.y,fishHeading,dt,10);
      tailPhase+=dt*(pulling?24:13);
      tail.rotation.y=Math.sin(tailPhase)*(.22+Math.min(1,tension)*.28);
      wake.position.set(fish.position.x,WATER_Y+.059,fish.position.z);
      const wave=1+((Math.sin(time*10)+1)*.24)+splash*.38;
      wake.scaling.setAll(wave);
      waterGlint.alpha=.12+.17*Math.min(1,tension)+splash*.25;
      ink.alpha=.64+.18*Math.min(1,tension);
      haloMat.alpha=.16+.08*Math.min(1,tension);
    }
    tension=follow(tension,pulling?1:0,dt,pulling?9:6);
    // A fish dragging left makes the view drift left; the indicated player
    // counter therefore points right. These are small damped impulses.
    const goalYaw=pulling?pull.x*.038:0;
    const goalPitch=pulling?pull.y*.027:0;
    yawSpeed+=(goalYaw-yawOffset)*62*dt;
    pitchSpeed+=(goalPitch-pitchOffset)*62*dt;
    yawSpeed*=Math.exp(-12*dt);
    pitchSpeed*=Math.exp(-12*dt);
    yawOffset=clamp(yawOffset+yawSpeed*dt,-.090,.090);
    pitchOffset=clamp(pitchOffset+pitchSpeed*dt,-.065,.065);
    const baseYaw=camera.rotation.y-appliedYaw;
    const basePitch=camera.rotation.x-appliedPitch;
    camera.rotation.y=baseYaw+yawOffset;
    camera.rotation.x=basePitch+pitchOffset;
    appliedYaw=yawOffset;appliedPitch=pitchOffset;
    if(fish.metadata){
      fish.metadata.cameraYawTug=yawOffset;
      fish.metadata.cameraPitchTug=pitchOffset;
      fish.metadata.lineTension=tension;
    }
  };

  return {
    setActive(value:boolean){
      cast=false;pulling=false;
      if(!value){
        // Detach our spring before the existing rod controller restores the
        // original camera view. Never leave an accumulated camera drift.
        camera.rotation.y-=appliedYaw;
        camera.rotation.x-=appliedPitch;
        appliedYaw=0;appliedPitch=0;yawOffset=0;pitchOffset=0;
        yawSpeed=0;pitchSpeed=0;
        travel={x:0,z:0};destination={x:0,z:0};
        tension=0;splash=0;
      }
      setVisible(false);
    },
    setCast(value:boolean){
      cast=value;
      if(value){
        pulling=false;tension=0;travel={x:0,z:0};
        destination={x:0,z:0};setVisible(false);
      }else{
        pulling=false;setVisible(false);
      }
    },
    track(height:number){
      if(!cast)return;
      // The submerged silhouette is the SAME fish tracked by the vertical
      // reel gauge. It moves along the pond's long axis while the player reels.
      pulling=false;
      pull={x:0,y:0};
      destination=keepFishInsidePond(
        .08*Math.sin(time*1.5),(Math.max(0,Math.min(1,height))-.5)*1.78);
      fishHeading=destination.z>=travel.z?0:Math.PI;
      fish.metadata={...fish.metadata,
        reelHeight:height,fishPullX:0,fishPullY:0,
        worldPullX:0,worldPullZ:0};
      setVisible(true);
    },
    hook(target:ScreenPull){
      if(!cast)return;
      setTarget(target);
      pulling=true;setVisible(true);impulse(1.7);
    },
    countered(){
      pulling=false;
      destination={x:travel.x*.20,z:travel.z*.20};
      impulse(-.36);
      splash=.75;
    },
    missed(){
      pulling=false;
      destination=keepFishInsidePond(destination.x*1.18,
        destination.z*1.18);
      impulse(.95);
      splash=1.7;
    },
    resolved(won:boolean){
      pulling=false;
      destination=won?{x:0,z:0}:keepFishInsidePond(
        destination.x*1.18,destination.z*1.18);
      splash=won?2:1.4;
    },
    update,
    get bobberOffset():WorldPull{
      return {x:visible?travel.x*.67:0,z:visible?travel.z*.67:0};
    },
    get lineTension(){return tension;},
    get isHooked(){return visible;},
    get pullDirection(){return pull;},
    get cameraTug(){return {yaw:yawOffset,pitch:pitchOffset};},
  };
}
