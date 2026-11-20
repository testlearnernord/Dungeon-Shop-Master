import {expect,test} from "@playwright/test";
type Stats={p50:number;p95:number;mean:number;frames:number;slow:number;};
async function sample(page:import("@playwright/test").Page,n=55):Promise<Stats>{
 return page.evaluate((count)=>new Promise<Stats>(resolve=>{
   const gaps:number[]=[];
   let before=0;
   function tick(now:number){
     if(before>0)gaps.push(now-before);
     before=now;
     if(gaps.length>=count){
       const ordered=[...gaps].sort((a,b)=>a-b);
       const pct=(n:number)=>ordered[Math.min(ordered.length-1,Math.floor((ordered.length-1)*n))];
       resolve({p50:pct(.5),p95:pct(.95),mean:gaps.reduce((a,b)=>a+b,0)/gaps.length,
         frames:gaps.length,slow:gaps.filter(x=>x>50).length});
     }else requestAnimationFrame(tick);
   }
   requestAnimationFrame(tick);
 }),n);
}
/** A/B same browser + scene, no new gameplay paths. The Xvfb CI WebGL
 * renderer may be CPU/SwiftShader: these are diagnostic relative readings,
 * NEVER published PC-FPS claims.
 */
test("diagnose shop render pressure with controlled same-scene ablations @ci-smoke",async({page})=>{
 test.setTimeout(150000);
 await page.goto("./");
 await expect(page.locator("#day")).toHaveText("Day 1");
 const errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.evaluate(()=>(
   window as Window&{__shopTestPauseWorld?:(paused:boolean)=>void})
   .__shopTestPauseWorld?.(true));
 const variants=["baseline","skip-scene-render","baseline","half-resolution",
   "disable-point-lights","hide-stock-and-furniture","hide-world-meshes","baseline"];
 const results=[];
 for(const variant of variants){
   const info=await page.evaluate(async(name)=>{
     const {applyRenderAblation}=await import("/Dungeon-Shop-Master/tests/renderAblationHarness.ts");
     return applyRenderAblation(name as import("./renderAblationHarness.ts").RenderAblation);
   },variant);
   await page.waitForTimeout(300);
   const timing=await sample(page,55);
   const cpu=await page.evaluate(()=>{
     const hook=(window as Window&{__shopTestReadProfile?:()=>unknown})
       .__shopTestReadProfile;
     return hook?.()??{};
   });
   results.push({info,timing,cpu});
 }
 await page.evaluate(async()=>{
   const {restoreRenderAblation}=await import("/Dungeon-Shop-Master/tests/renderAblationHarness.ts");
   restoreRenderAblation();
   (window as Window&{__shopTestPauseWorld?:(paused:boolean)=>void})
     .__shopTestPauseWorld?.(false);
 });
 console.log("[PR216 RENDER ROOT CAUSE / software CI / controlled ablation]",JSON.stringify(results));
 expect(results.length).toBe(variants.length);
 expect(results.every(x=>x.timing.frames===55)).toBe(true);
 expect(results[0].info.sceneMeshes).toBeGreaterThan(80);
 expect(results[1].info.frameBuffer.w).toBeGreaterThan(0);
 expect(results[3].info.frameBuffer.w).toBeLessThan(results[2].info.frameBuffer.w);
 expect(errors).toEqual([]);
});
