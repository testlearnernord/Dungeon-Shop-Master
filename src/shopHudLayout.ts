import {setIconButtonLabel} from "./uiIcons.ts";
/** A compact default HUD. Live day and gold remain visible outside the
 * disclosure. Save failures are NEVER concealed behind its closed state. */
export function setupShopStatusToggle():void {
  const button=document.querySelector<HTMLButtonElement>("#toggle-shop-status");
  const content=document.querySelector<HTMLElement>("#shop-status-content");
  const save=document.querySelector<HTMLElement>("#save-status");
  const panel=document.querySelector<HTMLElement>(".day-panel");
  if(!button||!content||!save||!panel)return;
  const refresh=()=>{
    const message=save.textContent??"";
    const error=/\b(error|failed|invalid|corrupt|unavailable)\b/i.test(message);
    save.dataset.error=String(error);
    panel.classList.toggle("has-save-error",error);
  };
  new MutationObserver(refresh).observe(save,{childList:true,characterData:true,subtree:true});
  refresh();
  const show=(open:boolean)=>{
    button.setAttribute("aria-expanded",String(open));
    content.hidden=!open;
    if(open){
      const management=content.querySelector<HTMLDetailsElement>(".shop-management-details");
      if(management)management.open=true;
    }
    setIconButtonLabel(button,open?"Hide shop details":"Show shop details");
  };
  show(false);
  button.addEventListener("click",()=>show(button.getAttribute("aria-expanded")!=="true"));
}
/** Measure the dock's actual upper edge. This is kept for the compact
 * controls disclosure and retains correct placement after viewport changes. */
export function setupControlsHotbarClearance():void{
  const inventory=document.querySelector<HTMLElement>("#inventory");
  const legend=document.querySelector<HTMLDetailsElement>("#hud details.controls");
  if(!inventory||!legend)return;
  const refresh=()=>{
    const dock=inventory.getBoundingClientRect();
    const controls=legend.getBoundingClientRect();
    const clearance=Math.max(8,Math.ceil(controls.top-dock.top+12));
    legend.style.setProperty("--hotbar-clearance",clearance+"px");
  };
  const observer=new ResizeObserver(refresh);
  observer.observe(inventory);
  observer.observe(legend);
  legend.addEventListener("toggle",refresh);
  window.addEventListener("resize",refresh);
  refresh();
}

/** World interaction prompts have a short lifetime. The full message remains
 * in the DOM for assistive tech and existing action status assertions. */
export function setupTransientStatus(status:HTMLElement):void{
  let timeout:number|undefined;
  const schedule=()=>{
    window.clearTimeout(timeout);
    status.classList.remove("is-stale");
    const message=status.textContent??"";
    const sticky=/error|invalid save|failed/i.test(message);
    timeout=window.setTimeout(()=>status.classList.add("is-stale"),
      sticky?11000:3500);
  };
  new MutationObserver(schedule).observe(status,{
    childList:true,characterData:true,subtree:true,
  });
  schedule();
}
