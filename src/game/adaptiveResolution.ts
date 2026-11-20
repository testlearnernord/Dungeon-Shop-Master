/** Pure quality policy. Only the Babylon render buffer is rescaled; this
 * never advances simulation, changes movement, saves or game-world clocks.
 * 1x = native canvas resolution, 2x = half width/height (one quarter pixels).
 */
export const RENDER_SCALES=[1,1.25,1.5,1.75,2] as const;
export type RenderQualityMode="auto"|"native"|"balanced"|"performance";
export interface RenderFrameBudget{
  readonly now:number;
  readonly gapMs:number;
  readonly worldCpuMs:number;
  readonly renderCpuMs:number;
  readonly active:boolean;
}
const WINDOW_MS=1800;
const SLOW_FPS=49;
const RECOVERY_FPS=59;
const MAX_CPU_MS=16;
/** Two slow windows (~3.6s) before lowering resolution, one trial at a
 * time. A sustained fast view can cautiously reclaim clarity later.
 * Browser/GPU stalls may appear outside synchronous scene.render() time.
 */
export class AdaptiveResolutionPolicy{
  private modeValue:RenderQualityMode="native";
  private index=0;
  private firstActiveAt:number|null=null;
  private windowStart:number|null=null;
  private frames=0;
  private elapsed=0;
  private cpuTotal=0;
  private slowWindows=0;
  private lastChangedAt=-Infinity;
  get mode():RenderQualityMode{return this.modeValue;}
  get scale():number{return RENDER_SCALES[this.index];}
  private resetWindow():void{
    this.windowStart=null;this.frames=0;this.elapsed=0;this.cpuTotal=0;
  }
  setMode(mode:RenderQualityMode):number{
    if(!["auto","native","balanced","performance"].includes(mode))
      throw new RangeError("Unknown render quality mode");
    this.modeValue=mode;
    this.index=mode==="balanced"?2:mode==="performance"?4:0;
    this.slowWindows=0;
    this.firstActiveAt=null;
    this.lastChangedAt=-Infinity;
    this.resetWindow();
    return this.scale;
  }
  cycle():number{
    const order:RenderQualityMode[]=["native","balanced","performance","auto"];
    return this.setMode(order[(order.indexOf(this.modeValue)+1)%order.length]);
  }
  observe(sample:RenderFrameBudget):number|null{
    if(this.modeValue!=="auto"||!sample.active){
      this.slowWindows=0;this.resetWindow();return null;
    }
    if(!Number.isFinite(sample.now)||!Number.isFinite(sample.gapMs)||
       sample.gapMs<=0||sample.gapMs>180||
       !Number.isFinite(sample.worldCpuMs)||sample.worldCpuMs<0||
       !Number.isFinite(sample.renderCpuMs)||sample.renderCpuMs<0){
      this.slowWindows=0;this.resetWindow();return null;
    }
    if(this.firstActiveAt===null)this.firstActiveAt=sample.now;
    if(this.windowStart===null)this.windowStart=sample.now;
    this.frames++;
    this.elapsed+=sample.gapMs;
    this.cpuTotal+=sample.worldCpuMs+sample.renderCpuMs;
    if(this.elapsed<WINDOW_MS)return null;
    const fps=1000*this.frames/this.elapsed;
    const cpu=this.cpuTotal/this.frames;
    this.resetWindow();
    // Shader compilation and GLB loading at startup are transient.
    if(sample.now-this.firstActiveAt<4500)return null;
    if(cpu>MAX_CPU_MS){
      // If JS is the bottleneck, reducing GPU resolution will not help.
      this.slowWindows=0;return null;
    }
    if(fps<SLOW_FPS&&this.index<RENDER_SCALES.length-1){
      this.slowWindows++;
      if(this.slowWindows>=2&&sample.now-this.lastChangedAt>=2500){
        this.slowWindows=0;this.lastChangedAt=sample.now;
        this.index++;
        return this.scale;
      }
    }else if(fps>=RECOVERY_FPS&&this.index>0&&
      sample.now-this.lastChangedAt>20000){
      // Recover native sharpness only after a long stable interval.
      this.slowWindows=0;this.lastChangedAt=sample.now;
      this.index--;
      return this.scale;
    }else this.slowWindows=0;
    return null;
  }
}
