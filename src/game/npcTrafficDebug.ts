import type { NpcVisualSystem } from "./npcVisualSystem.ts";

/** Developer-only, opt-in F9 display. Hidden by default and refreshed only
 * while visible, so ordinary gameplay has no extra HUD or polling cost. */
export function setupNpcTrafficDebug(visuals: NpcVisualSystem): void {
  const panel=document.createElement("aside");
  panel.id="npc-traffic-debug";
  panel.hidden=true;
  panel.setAttribute("aria-label","NPC navigation diagnostics");
  const title=document.createElement("strong");
  title.textContent="NPC TRAFFIC · F9 TO HIDE";
  const legend=document.createElement("p");
  legend.textContent="Name | state | reason | target | route | stalled | position";
  const contents=document.createElement("pre");
  contents.className="npc-traffic-debug-lines";
  panel.append(title,legend,contents);
  document.body.append(panel);
  let visible=false;
  let frame=0;
  let lastRender=0;
  const refresh=(time:number)=>{
    if(!visible)return;
    if(time-lastRender>=250){
      lastRender=time;
      const rows=visuals.inspectTraffic();
      contents.textContent=rows.length?
        rows.map(npc=>[
          npc.id,
          npc.status||npc.phase,
          npc.reason||"-",
          npc.target||npc.goal||"-",
          npc.waypoint,
          npc.blockedSeconds.toFixed(1)+"s",
          npc.x.toFixed(1)+"/"+npc.z.toFixed(1),
          npc.cartUnits?"cart "+npc.cartUnits:"",
        ].filter(Boolean).join(" | ")).join("\n"):
        "No visiting NPCs are currently rendered.";
    }
    frame=requestAnimationFrame(refresh);
  };
  window.addEventListener("keydown",event=>{
    if(event.code!=="F9"||event.repeat)return;
    event.preventDefault();
    visible=!visible;
    panel.hidden=!visible;
    if(visible){
      lastRender=-Infinity;
      frame=requestAnimationFrame(refresh);
    }else cancelAnimationFrame(frame);
  });
}
