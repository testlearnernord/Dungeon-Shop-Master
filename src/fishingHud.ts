import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./game/gameStore.ts";
import type {GameSfx} from "./gameSfx.ts";
import {isCellarPondUncovered} from "./game/cellarPond.ts";
import {setupFishingRodVisuals} from "./game/fishingRodVisuals.ts";
import {FLICK_SAMPLE_MS,FLICK_WINDOW_MS,REQUIRED_FLICKS,MAX_MISSES,
  FISHING_FLICKS,fishingDirectionFor,fishingFlickDistanceFor,
  fishingFlickProgress,scoreFishingFlick,type FishingFlick,type FlickGrade}
  from "./game/fishingSkill.ts";
import {REEL_BAR_HALF_HEIGHT,createFishingReel,stepFishingReel,
  clickFishingReel,resumeFishingReel,nextFishBiteDelay,
  type FishingReel} from "./game/fishingReel.ts";

type Phase="ready"|"waiting"|"tracking"|"flick"|"recover";

/** One live, first-person fishing session. The persistent GameStore only
 * receives a confirmed catch. Transient reel physics and the existing
 * three-flick counter share this one interaction and the original scene. */
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
      <span class="fishing-aim-label">BRASS = COUNTER · CYAN = YOUR PULL</span>
      <span id="fishing-fish-direction" class="fishing-fish-direction"></span>
    </div>
    <div class="fishing-frame">
      <div class="fishing-titlebar">
        <span class="fishing-eyebrow">✦ GALVIK'S UNDERGROUND POND ✦</span>
        <strong>THE DEEP CATCH</strong>
      </div>
      <div class="fishing-instrument">
        <div class="fishing-reel" id="fishing-reel" aria-label="Fish-catching balance challenge">
          <div class="fishing-reel-cap">✦ TENSION ✦</div>
          <div class="fishing-reel-body">
            <div class="fishing-reel-rail" aria-label="Green catching zone and fish position">
              <span class="fishing-reel-watermark"></span>
              <span id="fishing-reel-green" class="fishing-reel-green"></span>
              <span id="fishing-reel-fish" class="fishing-reel-fish">
                <svg viewBox="0 0 36 22" width="32" height="20" aria-hidden="true">
                  <path d="M9 11 1 4v14l8-7c7-10 18-11 26 0-8 11-19 10-26 0Z" fill="currentColor"/>
                  <circle cx="29" cy="9.5" r="1.5" fill="#e1f1df"/>
                </svg>
              </span>
            </div>
            <div class="fishing-reel-progress" aria-label="Catch progress">
              <span id="fishing-reel-progress-fill"></span>
            </div>
          </div>
          <div class="fishing-reel-base">L ↔ R</div>
        </div>
        <div class="fishing-seal" aria-hidden="true">♜</div>
        <div class="fishing-reading">
          <div id="fishing-phase" role="status" aria-live="polite">Ready to cast</div>
          <div id="fishing-hint">Cast your line, then alternate left and right clicks to reel.</div>
          <div class="fishing-progress">
            <span id="fishing-count">0 / 3 counters</span>
            <span id="fishing-errors">0 / 3 misses</span>
          </div>
          <div id="fishing-click-cue" class="fishing-click-cue">ALTERNATE LEFT / RIGHT CLICK</div>
          <div class="fishing-pull-head">
            <span id="fishing-pull-stage">PULL DISTANCE · I</span>
            <strong id="fishing-pull-distance">0 / 540 px</strong>
          </div>
          <div class="fishing-pull-track" aria-label="Counter pull toward target">
            <div id="fishing-pull-fill"></div>
          </div>
          <div class="fishing-meter" aria-label="Counter time remaining">
            <div id="fishing-timer-fill"></div>
          </div>
        </div>
      </div>
      <div class="fishing-actions">
        <button id="fishing-cast" type="button">Cast line</button>
        <button id="fishing-close" type="button">Leave pond <kbd>Esc</kbd></button>
      </div>
      <small>Alternate L/R to lift the green zone · Keep the fish inside · Counter its escape with three flicks</small>
    </div>`;
  document.body.append(panel);
  const arrow=panel.querySelector<HTMLElement>("#fishing-arrow")!;
  const aim=panel.querySelector<HTMLElement>(".fishing-aim-ui")!;
  const motion=panel.querySelector<HTMLElement>("#fishing-motion-ray")!;
  const fishDirection=panel.querySelector<HTMLElement>("#fishing-fish-direction")!;
  const pullStage=panel.querySelector<HTMLElement>("#fishing-pull-stage")!;
  const pullDistance=panel.querySelector<HTMLElement>("#fishing-pull-distance")!;
  const pullFill=panel.querySelector<HTMLElement>("#fishing-pull-fill")!;
  const reelGreen=panel.querySelector<HTMLElement>("#fishing-reel-green")!;
  const reelFish=panel.querySelector<HTMLElement>("#fishing-reel-fish")!;
  const reelProgress=panel.querySelector<HTMLElement>("#fishing-reel-progress-fill")!;
  const clickCue=panel.querySelector<HTMLElement>("#fishing-click-cue")!;
  const rod=setupFishingRodVisuals(scene,camera);
  const phaseText=panel.querySelector<HTMLElement>("#fishing-phase")!;
  const hint=panel.querySelector<HTMLElement>("#fishing-hint")!;
  const timer=panel.querySelector<HTMLElement>("#fishing-timer-fill")!;
  const count=panel.querySelector<HTMLElement>("#fishing-count")!;
  const errors=panel.querySelector<HTMLElement>("#fishing-errors")!;
  const cast=panel.querySelector<HTMLButtonElement>("#fishing-cast")!;
  const leave=panel.querySelector<HTMLButtonElement>("#fishing-close")!;

  let active=false,phase:Phase="ready",reel:FishingReel|null=null;
  let correct=0,misses=0,round=0;
  let waitUntil=0,resetRodAt=0,lastFrame=0;
  let sampleStarted=0,sampleLast=0,dx=0,dy=0;
  let target:FishingFlick=fishingDirectionFor(0,0);
  let requiredDistance=fishingFlickDistanceFor(0);
  let note="Ready to cast";
  let tip="Cast your line, then alternate left and right clicks to reel.";
  const pullVisualScale=102/fishingFlickDistanceFor(REQUIRED_FLICKS-1);

  const showPull=(x:number,y:number)=>{
    aim.style.setProperty("--goal-length",
      (requiredDistance*pullVisualScale).toFixed(1)+"px");
    const progress=fishingFlickProgress(x,y,target,requiredDistance);
    motion.style.transform="rotate("+Math.atan2(y,x)*180/Math.PI+"deg)";
    motion.style.width=Math.min(119,Math.hypot(x,y)*pullVisualScale)+"px";
    pullDistance.textContent=Math.round(progress.projected)+
      " / "+requiredDistance+" px";
    pullFill.style.width=(progress.ratio*100).toFixed(1)+"%";
    pullFill.dataset.complete=String(progress.ratio>=1);
  };
  const showReel=()=>{
    if(!reel)return;
    reelGreen.style.bottom=((reel.barY-REEL_BAR_HALF_HEIGHT)*100).toFixed(2)+"%";
    reelFish.style.bottom=(reel.fishY*100).toFixed(2)+"%";
    reelProgress.style.height=(reel.progress*100).toFixed(1)+"%";
    const next=reel.lastButton===null?"LEFT OR RIGHT":
      reel.lastButton==="left"?"RIGHT CLICK":"LEFT CLICK";
    clickCue.textContent="PUMP · "+next;
    rod.trackFish(reel.fishY);
  };
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
    fishDirection.hidden=phase!=="flick";
    aim.dataset.active=String(phase==="flick");
    if(phase==="flick"){
      aim.style.setProperty("--target-angle",
        Math.atan2(target.y,target.x)*180/Math.PI+"deg");
    }
    cast.hidden=phase!=="ready";
    timer.style.width=phase==="flick"
      ?Math.max(0,(waitUntil-performance.now())/FLICK_WINDOW_MS*100)+"%":"0%";
    if(phase==="tracking")showReel();
  };

  const close=()=>{
    if(!active)return;
    active=false;panel.hidden=true;
    phase="ready";reel=null;resetRodAt=0;
    rod.setActive(false);
    if(document.pointerLockElement===canvas)void document.exitPointerLock();
    camera.attachControl(canvas,true);
  };

  /** Catches come ONLY from a completed catch-progress bar. The now-absent
   * fish shadow cannot bite again until this randomized (<=10 s) delay ends. */
  const endFish=(won:boolean,now:number)=>{
    phase="waiting";
    reel=null;
    rod.resolve(won);
    resetRodAt=now+870;
    const waitSeconds=nextFishBiteDelay(Math.random);
    waitUntil=now+waitSeconds*1000;
    if(won){
      note=store.recordCellarCatch();
      tip="The fish is landed. Another may bite within 10 seconds.";
      sfx.play("fishing-catch");
    }else{
      note="The fish got away!";
      tip="The water settles. Another fish may bite within 10 seconds.";
      sfx.play("fishing-miss");
    }
    render();
  };

  const beginTracking=()=>{
    reel=createFishingReel(Math.random);
    phase="tracking";
    correct=0;misses=0;round=0;
    note="A fish is hooked! Keep it inside the green zone.";
    tip="Alternate LEFT and RIGHT mouse clicks to lift the green bar. Let it fall to follow the fish.";
    sfx.play("fishing-bite");
    render();
  };

  const nextFlick=(now:number)=>{
    phase="flick";
    target=fishingDirectionFor(store.state.cellarFishCaught,round);
    rod.hook(target);
    const escaping=FISHING_FLICKS.find(dir=>
      dir.x===-target.x&&dir.y===-target.y);
    fishDirection.textContent="FISH PULLS "+(escaping?.glyph??"")+
      "  •  COUNTER "+target.glyph;
    requiredDistance=fishingFlickDistanceFor(correct);
    aim.dataset.grade="";
    showPull(0,0);
    waitUntil=now+FLICK_WINDOW_MS;
    dx=0;dy=0;sampleStarted=0;sampleLast=0;
    note="ESCAPE! Flick "+target.label+" · "+requiredDistance+" px!";
    tip="The fish tears "+(escaping?.label.toLowerCase()??"away")+
      ". Counter with the mouse ("+target.glyph+").";
    sfx.play("fishing-bite");
    render();
  };

  const beginBreakout=(now:number)=>{
    if(!reel)return;
    correct=0;misses=0;round=0;
    nextFlick(now);
  };
  const miss=(now:number)=>{
    misses++;
    rod.counterMiss();
    aim.dataset.grade="miss";
    sfx.play("fishing-miss");
    if(misses>=MAX_MISSES){
      endFish(false,now);return;
    }
    round++;
    phase="recover";waitUntil=now+300;
    note="Counter missed! The fish pulls harder.";
    tip="Prepare for the next directional flick.";
    render();
  };
  const hit=(grade:Extract<FlickGrade,"perfect"|"good">,now:number)=>{
    correct++;round++;
    aim.dataset.grade=grade;
    rod.counterSuccess();
    sfx.play("fishing-flick");
    if(correct>=REQUIRED_FLICKS){
      if(reel){
        reel=resumeFishingReel(reel,true,Math.random);
        phase="tracking";
        note="Breakout stopped! Keep the fish in the green zone.";
        tip="Resume alternating mouse clicks to reel it in.";
        render();
      }
      return;
    }
    phase="recover";waitUntil=now+320;
    note=grade==="perfect"?"PERFECT COUNTER!":"Good counter!";
    tip="Two more quick pulls might stop this escape.";
    render();
  };
  const move=(event:MouseEvent)=>{
    if(!active||phase!=="flick"||document.pointerLockElement!==canvas)return;
    const now=performance.now();
    if(!sampleStarted||now-sampleLast>FLICK_SAMPLE_MS){
      sampleStarted=now;dx=0;dy=0;
    }
    sampleLast=now;dx+=event.movementX;dy+=event.movementY;
    rod.flick(event.movementX,event.movementY);
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

  const reelClick=(event:MouseEvent)=>{
    if(!active||phase!=="tracking"||
      document.pointerLockElement!==canvas||
      (event.button!==0&&event.button!==2))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!reel)return;
    const result=clickFishingReel(reel,event.button===0?"left":"right");
    reel=result.state;
    if(result.accepted){
      showReel();
      // A soft, already-approved cue. No new per-click audio engine.
      if(reel.alternatingClicks%4===0)sfx.play("fishing-flick");
    }
  };

  const start=()=>{
    if(!active||phase!=="ready")return;
    if(!isCellarPondUncovered(store.state.cellarRoom)){
      note="Excavate the whole pond basin first.";render();return;
    }
    correct=0;misses=0;round=0;phase="waiting";
    reel=null;resetRodAt=0;
    rod.setCast(true);
    waitUntil=performance.now()+1100;
    lastFrame=performance.now();
    note="Line cast. Watch the water…";
    tip="The first bite is near. Alternate left/right to reel when the fish appears.";
    sfx.play("fishing-cast");
    render();
    void canvas.requestPointerLock().catch(()=>{
      if(!active)return;
      note="Click Cast again if the browser blocked pointer lock.";
      rod.setCast(false);
      phase="ready";render();
    });
  };
  cast.addEventListener("click",start);
  leave.addEventListener("click",close);
  document.addEventListener("mousemove",move);
  window.addEventListener("mousedown",reelClick,true);
  window.addEventListener("contextmenu",event=>{
    if(!active)return;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  document.addEventListener("pointerlockchange",()=>{
    if(active&&phase!=="ready"&&document.pointerLockElement!==canvas)
      close();
  });
  window.addEventListener("keydown",event=>{
    if(!active)return;
    if(event.code==="Escape"){
      event.preventDefault();event.stopImmediatePropagation();close();
    }else if(["KeyE","KeyP","KeyN","KeyU","KeyV","KeyB","KeyG","KeyR",
      "KeyM","Digit1","Digit2","Digit3","Digit4","Digit5","Digit6"].includes(event.code)){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  scene.onBeforeRenderObservable.add(()=>{
    if(!active)return;
    const now=performance.now();
    const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));
    lastFrame=now;
    if(phase==="waiting"){
      if(resetRodAt&&now>=resetRodAt){
        resetRodAt=0;
        rod.setCast(true);
      }
      if(now>=waitUntil)beginTracking();
    }else if(phase==="tracking"&&reel){
      const stepped=stepFishingReel(reel,dt,Math.random);
      reel=stepped.state;
      showReel();
      if(stepped.event==="landed")endFish(true,now);
      else if(stepped.event==="escaped")endFish(false,now);
      else if(stepped.event==="breakout")beginBreakout(now);
    }else if(phase==="recover"&&now>=waitUntil){
      nextFlick(now);
    }else if(phase==="flick"){
      if(now>=waitUntil)miss(now);
      else timer.style.width=((waitUntil-now)/FLICK_WINDOW_MS*100)
        .toFixed(1)+"%";
    }
  });

  return {
    open(){
      if(active)return false;
      if(!isCellarPondUncovered(store.state.cellarRoom))return false;
      active=true;phase="ready";reel=null;
      correct=0;misses=0;round=0;
      aim.dataset.grade="";
      requiredDistance=fishingFlickDistanceFor(0);
      target=fishingDirectionFor(store.state.cellarFishCaught,0);
      showPull(0,0);
      rod.setActive(true);
      rod.setCast(false);
      note="Ready to cast";
      tip="Cast your line, then alternate left and right clicks to reel.";
      lastFrame=performance.now();
      camera.detachControl();
      if(document.pointerLockElement)void document.exitPointerLock();
      panel.hidden=false;render();cast.focus();
      return true;
    },
    close,
    get isActive(){return active;},
  };
}
