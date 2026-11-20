import type {Engine} from "@babylonjs/core/Engines/engine";
import type {Scene} from "@babylonjs/core/scene";
import {AdaptiveResolutionPolicy,type RenderQualityMode,
  type RenderFrameBudget} from "./adaptiveResolution.ts";

/** Device-specific, local 3D render resolution. CSS HUD elements never
 * participate and remain at native browser pixel density. No new
 * simulation/event authority is introduced. */
export class RenderQualityController{
  private readonly policy=new AdaptiveResolutionPolicy();
  private readonly rendererName:string;
  constructor(private readonly engine:Engine){
    const gl=engine as unknown as {getGlInfo?:()=>{renderer?:string}};
    this.rendererName=gl.getGlInfo?.()?.renderer??"unknown";
  }
  setMode(mode:RenderQualityMode):void{
    this.apply(this.policy.setMode(mode));
  }
  cycle():void{this.apply(this.policy.cycle());}
  observe(frame:RenderFrameBudget):void{
    // E2E FPS comparisons deliberately hold EXACT native resolution.
    // Integration tests can still explicitly set modes via test hooks;
    // they also test the pure autoscaler in node unit tests.
    if(import.meta.env.VITE_E2E==="1")return;
    const scale=this.policy.observe(frame);
    if(scale!==null)this.apply(scale);
  }
  private apply(scale:number):void{
    if(this.engine.getHardwareScalingLevel()===scale)return;
    this.engine.setHardwareScalingLevel(scale);
    this.engine.resize();
  }
  info():{mode:RenderQualityMode;scale:number;width:number;height:number;
    renderer:string}{
    return {mode:this.policy.mode,scale:this.engine.getHardwareScalingLevel(),
      width:this.engine.getRenderWidth(),height:this.engine.getRenderHeight(),
      renderer:this.rendererName};
  }
  diagnostics(scene:Scene):readonly string[]{
    const info=this.info();
    return [
      "Quality: "+info.mode+" / "+(100/info.scale).toFixed(0)+"% linear resolution",
      "Render buffer: "+info.width+" x "+info.height,
      "Active meshes: "+scene.getActiveMeshes().length+"/"+scene.meshes.length+
        " | Lights: "+scene.lights.filter(l=>l.isEnabled()).length,
      "GL: "+info.renderer.slice(0,83),
      "F4: auto / native / balanced / performance",
    ];
  }
}
