/** Lightweight, opt-in, in-game frame attribution.
 * F3 does not pause, step or modify the authoritative world scheduler.
 * Browser frame gaps include GPU waits and OS scheduling; scene.render()
 * measures only synchronous JS time, NEVER GPU execution time.
 */
export interface RuntimeFrameTiming {
  readonly now:number;
  readonly worldMs:number;
  readonly renderMs:number;
  readonly ticks:number;
}

const WINDOW_FRAMES=120;
const percentile=(values:readonly number[],fraction:number):number=>{
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,
    Math.floor((sorted.length-1)*fraction))];
};
const average=(items:readonly number[]):number=>
  items.length?items.reduce((sum,n)=>sum+n,0)/items.length:0;
const ms=(value:number)=>value.toFixed(1);
export interface RuntimePerformanceOptions{
  readonly details?:()=>readonly string[];
  readonly cycleQuality?:()=>void;
}
export function setupPerformanceHud(options:RuntimePerformanceOptions={}):{
  recordFrame:(frame:RuntimeFrameTiming)=>void;
  recordSave:(syncMs:number)=>void;
}{
  const panel=document.createElement("aside");
  panel.id="runtime-performance";
  panel.setAttribute("aria-label","Live runtime performance diagnostics");
  panel.setAttribute("aria-live","off");
  panel.style.cssText=[
    "position:fixed","right:12px","bottom:12px","z-index:1700",
    "background:rgba(10,16,23,.94)","color:#e9efee",
    "border:1px solid rgba(160,185,177,.55)","border-radius:7px",
    "font:12px/1.45 ui-monospace,SFMono-Regular,monospace",
    "padding:10px 13px","pointer-events:none",
    "white-space:pre-wrap","overflow-wrap:anywhere",
    "max-width:min(430px,90vw)",
    "box-shadow:0 8px 24px rgba(0,0,0,.35)",
  ].join(";");
  panel.hidden=true;
  document.body.append(panel);
  let showing=false;
  let lastFrame=0,lastUpdate=0;
  let lastSaveMs:number|null=null;
  let tickTotal=0;
  const intervals:number[]=[];
  const worldWork:number[]=[];
  const renderWork:number[]=[];
  const reset=()=>{
    lastFrame=0;lastUpdate=0;tickTotal=0;
    intervals.length=0;worldWork.length=0;renderWork.length=0;
  };
  window.addEventListener("keydown",event=>{
    if((event.key!=="F3"&&event.key!=="F4")||event.repeat||
       event.ctrlKey||event.altKey||event.metaKey||
       event.target instanceof HTMLElement&&
       event.target.closest("input,textarea,select,[contenteditable]"))return;
    event.preventDefault();
    if(event.key==="F4"){
      options.cycleQuality?.();
      lastUpdate=0;
      return;
    }
    showing=!showing;
    panel.hidden=!showing;
    reset();
    if(showing)panel.textContent="PERFORMANCE · collecting frames…\nF3: hide";
  });
  const push=(array:number[],value:number)=>{
    array.push(value);
    if(array.length>WINDOW_FRAMES)array.shift();
  };
  return {
    recordFrame(frame:RuntimeFrameTiming){
      if(!showing)return;
      if(lastFrame>0&&frame.now>=lastFrame&&frame.now-lastFrame<5000)
        push(intervals,frame.now-lastFrame);
      lastFrame=frame.now;
      push(worldWork,frame.worldMs);
      push(renderWork,frame.renderMs);
      tickTotal+=frame.ticks;
      if(frame.now-lastUpdate<1000||intervals.length<10)return;
      const elapsed=lastUpdate===0?1000:frame.now-lastUpdate;
      lastUpdate=frame.now;
      const mean=average(intervals);
      panel.textContent=[
        "F3 · LIVE PERFORMANCE",
        "FPS (frame gap):      "+(mean>0?(1000/mean).toFixed(1):"0"),
        "Frame interval p95:  "+ms(percentile(intervals,.95))+" ms",
        "World CPU / frame:   "+ms(average(worldWork))+" ms",
        "Render CPU / frame:  "+ms(average(renderWork))+" ms",
        "World ticks / sec:   "+(tickTotal*1000/elapsed).toFixed(1),
        "Last autosave sync:  "+(lastSaveMs===null?"none":ms(lastSaveMs)+" ms"),
        ...(options.details?.()??[]),
        "Frame gap includes GPU/browser scheduling.",
        "Render CPU is NOT GPU render time.",
      ].join("\n");
      tickTotal=0;
    },
    recordSave(syncMs:number){
      if(showing&&Number.isFinite(syncMs))lastSaveMs=syncMs;
    },
  };
}
