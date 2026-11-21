import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {Scene} from "@babylonjs/core/scene";
import {CELLAR_ENTRY_X} from "./cellarRoom.ts";

/** Babylon's normal per-frame downward gravity is stronger than the vertical
 * component of walking UP the ~29° cellar ramp. Descending works; climbing
 * is cancelled by repeated downward collision projections. Only while the
 * player deliberately walks UP through the real open stair corridor do we
 * reduce gravity so the existing collision-enabled ramp can carry them.
 * Never teleport, suppress wall collisions or modify a stored game state. */
export const NORMAL_SHOP_GRAVITY=-.22;
export const ASCENDING_CELLAR_GRAVITY=-.035;
export function cellarGravityForPlayer(
  x:number,z:number,heading:number,
  forward:number,right:number,doorOpen:boolean,
):number{
  const ascending=forward*Math.cos(heading)+right*Math.sin(heading);
  const inStairs=x>CELLAR_ENTRY_X-1.03&&x<CELLAR_ENTRY_X+1.03&&
    z>=-20.45&&z<=-11.75;
  return doorOpen&&inStairs&&ascending>.20
    ?ASCENDING_CELLAR_GRAVITY:NORMAL_SHOP_GRAVITY;
}

export function installCellarStairTraversal(camera:UniversalCamera,scene:Scene){
  const held=new Set<string>();
  const keys=["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown",
    "ArrowLeft","ArrowRight"];
  const down=(event:KeyboardEvent)=>{
    if(keys.includes(event.code))held.add(event.code);
  };
  const up=(event:KeyboardEvent)=>held.delete(event.code);
  const blur=()=>held.clear();
  window.addEventListener("keydown",down);
  window.addEventListener("keyup",up);
  window.addEventListener("blur",blur);
  scene.onBeforeRenderObservable.add(()=>{
    const pressed=(...codes:string[])=>codes.some(code=>held.has(code))?1:0;
    const forward=pressed("KeyW","ArrowUp")-pressed("KeyS","ArrowDown");
    const right=pressed("KeyD","ArrowRight")-pressed("KeyA","ArrowLeft");
    const doorOpen=scene.getMeshByName("cellar-portrait-barrier")
      ?.checkCollisions===false;
    // Idle gravity stays entirely unchanged. No virtual stairs, no jump
    // action, no change in exit/door access rules.
    scene.gravity.y=cellarGravityForPlayer(camera.position.x,
      camera.position.z,camera.rotation.y,forward,right,doorOpen);
  });
  scene.onDisposeObservable.addOnce(()=>{
    window.removeEventListener("keydown",down);
    window.removeEventListener("keyup",up);
    window.removeEventListener("blur",blur);
  });
}
