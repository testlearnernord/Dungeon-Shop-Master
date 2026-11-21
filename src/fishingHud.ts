import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./game/gameStore.ts";
import type {GameSfx} from "./gameSfx.ts";
import {isCellarPondUncovered} from "./game/cellarPond.ts";
import {setupFishingRodVisuals} from "./game/fishingRodVisuals.ts";
import {FLICK_SAMPLE_MS,FLICK_WINDOW_MS,REQUIRED_FLICKS,MAX_MISSES,
  fishingDirectionFor,fishingFlickDistanceFor,fishingFlickProgress,scoreFishingFlick,
  type FishingFlick,type FlickGrade} from "./game/fishingSkill.ts";

type Phase="ready"|"waiting"|"flick"|"recover"|"result";

/** A transient action overlay in the same Babylon shop. It does not own a
 * second world clock, canvas or RNG. Relative pointer motion is scored by a
 * pure function and the existing SFX service provides all feedback. */
export function setupFishingHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,scene:Scene,
  store:GameStore,sfx:GameSfx,
):{open:()=>boolean;close:()=>void;readonly isActive:boolean}{
  const panel=document.createElement("aside");
  panel.id="fishing-hud";
  panel.hidden=true;
  panel.setAttribute("aria-label","Underground pond fishing");
  panel.innerHTML=`
    <div class="fishing-aim-ui" aria-hidden="true">
      <div class="fishing-aim-ornament"></div>
      <div class="fishing-aim-crosshair"></div>
      <span id="fishing-arrow" class="fishing-aim-target">➶</span>
      <span class="fishing-aim-goal"></span>
      <span id="fishing-motion-ray" class="fishing-aim-motion"></span>
      <span class="fishing-aim-label">BRASS = TARGET · CYAN = YOUR PULL</span>
    </div>
    <div class="fishing-frame">
      <div class="fishing-titlebar">
        <span class="fishing-eyebrow">✦ GALVIK'S UNDERGROUND POND ✦</span>
        <strong>THE DEEP CATCH</strong>
      </div>
      <div class="fishing-instrument">
        <div class="fishing-seal" aria-hidden="true">♜</div>
        <div class="fishing-reading">
          <div id="fishing-phase" role="status" aria-live="polite">Ready to cast</div>
          <div id="fishing-hint">Cast your line, then flick the mouse in the shown direction.</div>
          <div class="fishing-progress">
            <span id="fishing-count">0 / 3 counters</span>
            <span id="fishing-errors">0 / 3 misses</span>
          </div>
          <div class="fishing-pull-head">
            <span id="fishing-pull-stage">PULL DISTANCE · I</span>
            <strong id="fishing-pull-distance">0 / 120 px</strong>
          </div>
          <div class="fishing-pull-track" aria-label="Mouse pull toward the target">
            <div id="fishing-pull-fill"></div>
          </div>
          <div class="fishing-meter" aria-label="Flick time remaining">
            <div id="fishing-timer-fill"></div>
          </div>
        </div>
      </div>
      <div class="fishing-actions">
        <button id="fishing-cast" type="button">Cast line</button>
        <button id="fishing-close" type="button">Leave pond <kbd>Esc</kbd></button>
      </div>
      <small>Make one long, quick directional sweep · The next counter needs more distance</small>
    </div>`;
  document.body.append(panel);
  const arrow=panel.querySelector<HTMLElement>("#fishing-arrow")!;
  const aim=panel.querySelector<HTMLElement>(".fishing-aim-ui")!;
  const motion=panel.querySelector<HTMLElement>("#fishing-motion-ray")!;
  const pullStage=panel.querySelector<HTMLElement>("#fishing-pull-stage")!;
  const pullDistance=panel.querySelector<HTMLElement>("#fishing-pull-distance")!;
  const pullFill=panel.querySelector<HTMLElement>("#fishing-pull-fill")!;
  const rod=setupFishingRodVisuals(scene,camera);
  const phaseText=panel.querySelector<HTMLElement>("#fishing-phase")!;
  const hint=panel.querySelector<HTMLElement>("#fishing-hint")!;
  const timer=panel.querySelector<HTMLElement>("#fishing-timer-fill")!;
  const count=panel.querySelector<HTMLElement>("#fishing-count")!;
  const errors=panel.querySelector<HTMLElement>("#fishing-errors")!;
  const cast=panel.querySelector<HTMLButtonElement>("#fishing-cast")!;
  const leave=panel.querySelector<HTMLButtonElement>("#fishing-close")!;
  let active=false,phase:Phase="ready";
  let correct=0,misses=0,round=0;
  let waitUntil=0,deadline=0;
  let sampleStarted=0,sampleLast=0,dx=0,dy=0;
  let target:FishingFlick=fishingDirectionFor(0,0);
  let requiredDistance=fishingFlickDistanceFor(0);
  // Stable screen scale: each later counter moves the GOLD end marker
  // farther away, and the cyan mouse attempt uses that same px-to-UI ratio.
  const pullVisualScale=102/fishingFlickDistanceFor(REQUIRED_FLICKS-1);
  const showPull=(x:number,y:number)=>{
    aim.style.setProperty("--goal-length",
      (requiredDistance*pullVisualScale).toFixed(1)+"px");
    const progress=fishingFlickProgress(x,y,target,requiredDistance);
    const travelled=Math.hypot(x,y);
    // Reverse or sideways pulls still draw visibly in the wrong direction,
    // but they cannot fill the projected forward-progress bar.
    const angle=Math.atan2(y,x)*180/Math.PI;
    motion.style.transform="rotate("+angle+"deg)";
    motion.style.width=Math.min(119,travelled*pullVisualScale)+"px";
    pullDistance.textContent=Math.round(progress.projected)+" / "+requiredDistance+" px";
    pullFill.style.width=(progress.ratio*100).toFixed(1)+"%";
    pullFill.dataset.complete=String(progress.ratio>=1);
  };
  let note="Ready to cast";
  let tip="Cast your line, then flick the mouse in the shown direction.";

  const render=()=>{
    if(!active)return;
    panel.dataset.phase=phase;
    phaseText.textContent=note;
    hint.textContent=tip;
    count.textContent=correct+" / "+REQUIRED_FLICKS+" counters";
    errors.textContent=misses+" / "+MAX_MISSES+" misses";
    pullStage.textContent="PULL DISTANCE · "+
      ["I","II","III"][Math.min(correct,REQUIRED_FLICKS-1)];
    arrow.textContent=phase==="flick"?target.glyph:"➶";
    arrow.dataset.active=String(phase==="flick");
    aim.dataset.active=String(phase==="flick");
    if(phase==="flick"){
      const degrees=Math.atan2(target.y,target.x)*180/Math.PI;
      aim.style.setProperty("--target-angle",degrees+"deg");
    }
    cast.hidden=phase!=="ready"&&phase!=="result";
    cast.textContent=phase==="result"?"Cast again":"Cast line";
    timer.style.width=phase==="flick"
      ?Math.max(0,(deadline-performance.now())/FLICK_WINDOW_MS*100)+"%":"0%";
  };

  const close=()=>{
    if(!active)return;
    active=false;panel.hidden=true;
    phase="ready";
    rod.setActive(false);
    if(document.pointerLockElement===canvas)void document.exitPointerLock();
    camera.attachControl(canvas,true);
  };
  const finish=(won:boolean)=>{
    phase="result";
    rod.setCast(false);
    if(document.pointerLockElement===canvas)void document.exitPointerLock();
    if(won){
      note=store.recordCellarCatch();
      tip="Three accurate counters. The first catch is a trophy record, not a sellable item yet.";
      sfx.play("fishing-catch");
    }else{
      note="The fish slipped away.";
      tip="Missed pulls or an expired window let it escape. Try again.";
      sfx.play("fishing-miss");
    }
    render();
  };
  const nextFlick=(now:number)=>{
    phase="flick";
    rod.tug();
    target=fishingDirectionFor(store.state.cellarFishCaught,round);
    requiredDistance=fishingFlickDistanceFor(correct);
    aim.dataset.grade="";
    showPull(0,0);
    deadline=now+FLICK_WINDOW_MS;
    dx=0;dy=0;sampleStarted=0;sampleLast=0;
    note="Flick "+target.label+" · "+requiredDistance+" px!";
    tip="Reach the gold marker with one fast pull ("+target.glyph+"). Turquoise shows your actual movement.";
    sfx.play("fishing-bite");
    render();
  };
  const miss=(now:number)=>{
    misses++;
    aim.dataset.grade="miss";
    sfx.play("fishing-miss");
    if(misses>=MAX_MISSES){finish(false);return;}
    round++;
    phase="recover";waitUntil=now+300;
    note="Missed counter!";
    tip="Reset your mouse and prepare for the next pull.";
    render();
  };
  const hit=(grade:Extract<FlickGrade,"perfect"|"good">,now:number)=>{
    correct++;round++;
    aim.dataset.grade=grade;
    rod.tug();
    sfx.play("fishing-flick");
    if(correct>=REQUIRED_FLICKS){finish(true);return;}
    phase="recover";waitUntil=now+320;
    note=grade==="perfect"?"PERFECT COUNTER!":"Good counter!";
    tip="Nice pull. Get ready for the next direction.";
    render();
  };
  const move=(event:MouseEvent)=>{
    if(!active||phase!=="flick")return;
    // Pointer lock enables real CS-like relative mouse deltas without
    // the cursor hitting a screen edge. Do not synthesize fake cursor clicks.
    if(document.pointerLockElement!==canvas)return;
    const now=performance.now();
    if(!sampleStarted||now-sampleLast>FLICK_SAMPLE_MS){
      sampleStarted=now;dx=0;dy=0;
    }
    sampleLast=now;dx+=event.movementX;dy+=event.movementY;
    rod.flick(event.movementX,event.movementY);
    // One shared rule drives both the feedback meter and actual grading:
    // unaligned travel is visible but does not count toward the target.
    showPull(dx,dy);
    const grade=scoreFishingFlick(dx,dy,now-sampleStarted,target,
      requiredDistance);
    if(grade==="too-small")return;
    if(grade==="perfect"||grade==="good"){hit(grade,now);return;}
    if(grade==="too-slow"){
      sampleStarted=now;dx=0;dy=0;return;
    }
    miss(now);
  };
  const start=()=>{
    if(!active||!(phase==="ready"||phase==="result"))return;
    if(!isCellarPondUncovered(store.state.cellarRoom)){
      note="Excavate the whole pond basin first.";render();return;
    }
    correct=0;misses=0;round=0;phase="waiting";
    rod.setCast(true);
    waitUntil=performance.now()+1100;
    note="Line cast. Watch the water…";
    tip="Wait for the fish to bite. Then flick in the arrow's direction.";
    sfx.play("fishing-cast");
    render();
    // The Cast button is a real user gesture. Keep the first-person camera
    // detached while pointer lock feeds only the fishing action.
    void canvas.requestPointerLock().catch(()=>{
      note="Click Cast again if the browser blocked pointer lock.";
      rod.setCast(false);
      phase="ready";render();
    });
  };
  cast.addEventListener("click",start);
  leave.addEventListener("click",close);
  document.addEventListener("mousemove",move);
  document.addEventListener("pointerlockchange",()=>{
    if(active&&phase!=="ready"&&phase!=="result"&&
       document.pointerLockElement!==canvas)close();
  });
  window.addEventListener("keydown",event=>{
    if(!active)return;
    if(event.code==="Escape"){
      event.preventDefault();event.stopImmediatePropagation();close();
    }else if(["KeyE","KeyP","KeyN","KeyU","KeyV","KeyB","KeyG","KeyR",
      "Digit1","Digit2","Digit3","Digit4","Digit5","Digit6"].includes(event.code)){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  scene.onBeforeRenderObservable.add(()=>{
    if(!active)return;
    const now=performance.now();
    if(phase==="waiting"&&now>=waitUntil)nextFlick(now);
    else if(phase==="recover"&&now>=waitUntil)nextFlick(now);
    else if(phase==="flick"){
      if(now>=deadline)miss(now);
      else timer.style.width=((deadline-now)/FLICK_WINDOW_MS*100).toFixed(1)+"%";
    }
  });

  return {
    open(){
      if(active)return false;
      if(!isCellarPondUncovered(store.state.cellarRoom))return false;
      active=true;phase="ready";correct=0;misses=0;round=0;
      aim.dataset.grade="";
      requiredDistance=fishingFlickDistanceFor(0);
      target=fishingDirectionFor(store.state.cellarFishCaught,0);
      showPull(0,0);
      rod.setActive(true);
      rod.setCast(false);
      note="Ready to cast";
      tip="Cast your line, then flick the mouse in the shown direction.";
      camera.detachControl();
      if(document.pointerLockElement)void document.exitPointerLock();
      panel.hidden=false;render();cast.focus();
      return true;
    },
    close,
    get isActive(){return active;},
  };
}
