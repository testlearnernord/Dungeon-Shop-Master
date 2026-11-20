import {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import {Engine} from "@babylonjs/core/Engines/engine";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Color3,Color4} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {Scene} from "@babylonjs/core/scene";

/**
 * The spectator camera/lighting comes from the Level-6 Cave Troll stage.
 * A monster/arena variant chooses art and palette, NEVER combat rules.
 */
export type CombatStageTheme="cave-troll"|"crypt";
export interface CombatStageBounds{
  readonly cx:number;readonly cz:number;
  readonly width:number;readonly depth:number;
}
export interface CombatSpectatorStage{
  readonly scene:Scene;
  readonly camera:UniversalCamera;
}
export function createCombatSpectatorStage(
  engine:Engine,theme:CombatStageTheme,
  bounds:CombatStageBounds={cx:0,cz:0,width:34,depth:34},
):CombatSpectatorStage{
  const troll=theme==="cave-troll";
  const scene=new Scene(engine);
  scene.clearColor=troll?new Color4(.045,.035,.043,1):
    new Color4(.022,.029,.033,1);
  const camera=new UniversalCamera(troll?"boss-spectator-camera":"crypt-spectator-camera",
    troll?new Vector3(0,12,-22):
      new Vector3(bounds.cx,Math.max(9,bounds.width*.63),
        bounds.cz-Math.max(14,bounds.depth*1.25)),scene);
  camera.minZ=.2;
  camera.maxZ=160;
  camera.fov=.86;
  camera.inertia=0;
  scene.activeCamera=camera;
  const ambient=new HemisphericLight(troll?"arena-ambient":"crypt-ambient",
    new Vector3(0,1,0),scene);
  ambient.intensity=troll?.53:.60;
  ambient.groundColor=Color3.FromHexString(troll?"#423e3b":"#2c3839");

  // Keep the Troll's authored light values exactly. Crypts only switch art
  // and light palette; both remain a scene with one camera and three key lights.
  const pos=(x:number,y:number,z:number):Vector3=>
    troll?new Vector3(x,y,z):new Vector3(bounds.cx+x,y,bounds.cz+z);
  const lights=troll?[
    {name:"lava-glow",pos:pos(0,2,0),hex:"#da7152",power:.9,range:38},
    {name:"troll-ember-rim",pos:pos(-7,10,7),hex:"#f08b54",power:1.10,range:26},
    {name:"troll-face-fill",pos:pos(5,8,-10),hex:"#c9d7e7",power:1.27,range:31},
  ]:[
    {name:"crypt-witchlight",pos:pos(-5,5,2),hex:"#8cbda5",power:1.05,range:26},
    {name:"crypt-rim",pos:pos(6,8,6),hex:"#aec1ca",power:1.02,range:26},
    {name:"crypt-face-fill",pos:pos(2,7,-8),hex:"#c8d8d7",power:1.17,range:31},
  ];
  for(const entry of lights){
    const light=new PointLight(entry.name,entry.pos,scene);
    light.diffuse=Color3.FromHexString(entry.hex);
    light.intensity=entry.power;
    light.range=entry.range;
  }
  return {scene,camera};
}

/** Exact Level-6 free-fly controls for boss and optional group spectator. */
export function flyCombatSpectatorCamera(
  camera:UniversalCamera,pressed:ReadonlySet<string>,frameDt:number,
):void {
  const dt=Math.min(.1,Math.max(0,frameDt));
  const speed=(pressed.has("ShiftLeft")||pressed.has("ShiftRight")?21:7)*dt;
  const yaw=camera.rotation.y;
  const forward=new Vector3(Math.sin(yaw),0,Math.cos(yaw));
  const right=new Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  if(pressed.has("KeyW"))camera.position.addInPlace(forward.scale(speed));
  if(pressed.has("KeyS"))camera.position.subtractInPlace(forward.scale(speed));
  if(pressed.has("KeyD"))camera.position.addInPlace(right.scale(speed));
  if(pressed.has("KeyA"))camera.position.subtractInPlace(right.scale(speed));
  if(pressed.has("KeyQ"))camera.position.y+=speed;
  if(pressed.has("KeyE"))camera.position.y-=speed;
  camera.position.y=Math.max(1.2,Math.min(65,camera.position.y));
}

export function turnCombatSpectatorCamera(
  camera:UniversalCamera,deltaX:number,deltaY:number,
):void {
  camera.rotation.y+=deltaX/2700;
  camera.rotation.x=Math.max(-1.45,Math.min(1.45,
    camera.rotation.x+deltaY/2700));
}

/** Authored Level-6 focus from a fighter position and spectator vantage. */
export function focusCombatSpectatorCamera(
  camera:UniversalCamera,origin:Vector3,vantage:Vector3,lookAt:Vector3,
):void{
  camera.position.copyFrom(origin.add(vantage));
  camera.setTarget(lookAt);
}
