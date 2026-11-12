import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

export const BED_X=0.8;
export const BED_Z=-10.6;
export const BED_HOLD_MS=1500;
export const BED_REACH=2.35;

export function sleepHoldProgress(startedAt:number,now:number,holding:boolean,inReach:boolean):number {
  if(!holding||!inReach||!Number.isFinite(startedAt)||!Number.isFinite(now))return 0;
  return Math.max(0,Math.min(1,(now-startedAt)/BED_HOLD_MS));
}

/** Only the mattress, bedding and bed frame can start the hold-to-sleep.
 * Decor, wall and floor hits must occlude, not impersonate the bed. */
export function isBedInteractionMesh(name:string):boolean {
  return name==="galvik-bed" || name==="bed-frame" ||
    name==="bed-headboard" || name==="bed-footboard" ||
    name==="bed-pillow" || name==="bed-blanket" ||
    name==="bed-blanket-fold" || name.startsWith("bed-quilt-seam-") ||
    name.startsWith("bed-frame-rail-") || name.startsWith("bed-post-");
}

export interface BedtimeController {
  readonly isBlocking:boolean;
  isNearBed():boolean;
  reset():void;
}

/** In-world interaction, not a second simulation owner.
 * Releasing E, loss of focus/range, or any modal aborts the hold. */
export function setupBedtime(
  scene:Scene,canvas:HTMLCanvasElement,camera:UniversalCamera,
  isShopAvailable:()=>boolean,
  commitAndOpenLedger:()=>void,
  hasLedger:()=>boolean,
):BedtimeController {
  const prompt=document.createElement("div");
  prompt.id="sleep-bed-prompt";
  prompt.hidden=true;
  prompt.setAttribute("aria-live","off");
  prompt.innerHTML=`<strong>✦ GALVIK'S BED ✦</strong>
    <span id="sleep-hint">Hold E to close the shop and rest</span>
    <div id="sleep-progress-track" role="progressbar" aria-label="Rest interaction"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div id="sleep-progress-fill"></div>
    </div>`;
  document.body.append(prompt);
  const hint=prompt.querySelector<HTMLElement>("#sleep-hint")!;
  const progress=prompt.querySelector<HTMLElement>("#sleep-progress-track")!;
  const fill=prompt.querySelector<HTMLElement>("#sleep-progress-fill")!;
  const fade=document.createElement("div");
  fade.id="sleep-fade";
  fade.setAttribute("aria-hidden","true");
  document.body.append(fade);
  let holding=false;
  let holdStarted=0;
  let busy=false;
  let timeout:number|null=null;
  const nearBed=()=>Math.hypot(camera.position.x-BED_X,camera.position.z-BED_Z)<=BED_REACH;
  const focusedOnBed=()=>{
    if(!nearBed())return false;
    const ray=camera.getForwardRay(BED_REACH+1.4);
    const hit=scene.pickWithRay(ray,(mesh:AbstractMesh)=>mesh.isEnabled() &&
      (mesh.name==="galvik-bed"||mesh.name.startsWith("bed-")||
       mesh.name.startsWith("bedroom-")||mesh.name.startsWith("galvik-bed-")||
       mesh.name.endsWith("-wall")));
    return !!hit?.hit&&!!hit.pickedMesh&&isBedInteractionMesh(hit.pickedMesh.name);
  };
  const cancel=()=>{
    holding=false;
    holdStarted=0;
    fill.style.width="0%";
    progress.setAttribute("aria-valuenow","0");
  };
  const reset=()=>{
    cancel();
    busy=false;
    if(timeout!==null){window.clearTimeout(timeout);timeout=null;}
    prompt.hidden=true;
    fade.classList.remove("active");
  };
  const usable=()=>!busy&&!hasLedger()&&isShopAvailable()&&focusedOnBed()&&
    !document.querySelector("dialog[open]");
  const validFocus=(event:KeyboardEvent)=>!(event.target instanceof HTMLElement &&
    (event.target.isContentEditable||event.target.closest("input,textarea,select,button,[contenteditable]")));
  window.addEventListener("keydown",event=>{
    if(event.code!=="KeyE"||event.repeat||event.defaultPrevented||
       event.ctrlKey||event.altKey||event.metaKey||!validFocus(event)||!usable())return;
    if(holding)return;
    holding=true;holdStarted=performance.now();
    hint.textContent="Closing the shop…";
    event.preventDefault();
  });
  window.addEventListener("keyup",event=>{
    if(event.code==="KeyE"){
      cancel();
      if(!busy)hint.textContent="Hold E to close the shop and rest";
    }
  });
  window.addEventListener("blur",cancel);
  scene.onBeforeRenderObservable.add(()=>{
    if(busy){
      prompt.hidden=true;
      return;
    }
    const available=usable();
    prompt.hidden=!available;
    if(!available){
      if(holding)cancel();
      return;
    }
    if(!holding)return;
    const value=sleepHoldProgress(holdStarted,performance.now(),holding,available);
    fill.style.width=(value*100).toFixed(1)+"%";
    progress.setAttribute("aria-valuenow",String(Math.round(value*100)));
    if(value<1)return;
    // Latch before the fade or any async callback. Even repeated keydowns
    // cannot trigger another day tick.
    busy=true;
    cancel();
    prompt.hidden=true;
    camera.detachControl();
    if(document.pointerLockElement)void document.exitPointerLock();
    fade.classList.add("active");
    timeout=window.setTimeout(()=>{
      timeout=null;
      try{
        commitAndOpenLedger();
        fade.classList.remove("active");
        busy=false; // the open modal is now the interaction lock
      }catch(error){
        reset();
        camera.attachControl(canvas,true);
        const status=document.querySelector<HTMLElement>("#status");
        if(status)status.textContent="Day closing failed. Progress was not intentionally retried.";
        console.error("Could not finish Galvik's day:",error);
      }
    },900);
  });
  return {
    get isBlocking(){return busy||hasLedger();},
    isNearBed:focusedOnBed,
    reset,
  };
}
