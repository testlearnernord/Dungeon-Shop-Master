import {setIconButtonLabel} from "./uiIcons.ts";
import {ITEMS,type ItemId} from "./game/economy.ts";
import {prioritizeShopService} from "./game/shopServiceFocus.ts";
import type {GameStore} from "./game/gameStore.ts";
import type {NpcVisualSystem} from "./game/npcVisualSystem.ts";
import type {Scene} from "@babylonjs/core/scene";
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

/** Small, live service cue in the EXISTING compact HUD. Request bubbles
 * remain on NPCs. This is just a glanceable summary and a shortcut into the
 * existing hotbar, never a second customer or stocking system.
 */
export function setupShopServiceBrief(
  scene:Scene,store:GameStore,visitors:NpcVisualSystem,
  isShopActive:()=>boolean,selectRequested:(itemId:ItemId)=>void,
):void{
  const panel=document.querySelector<HTMLElement>("#shop-service-brief");
  const register=document.querySelector<HTMLElement>("#service-ready-checkout");
  const restock=document.querySelector<HTMLButtonElement>("#service-restock");
  const credit=document.querySelector<HTMLElement>("#service-credit");
  const label=document.querySelector<HTMLElement>("#service-restock-label");
  const icon=document.querySelector<SVGUseElement>("#service-restock-icon");
  if(!panel||!register||!restock||!credit||!label||!icon)return;
  let urgentItem:ItemId|null=null;
  let lastText="";
  const update=()=>{
    const active=isShopActive()&&!document.querySelector("dialog[open]")&&
      !document.body.classList.contains("blueprint-active");
    if(!active){
      urgentItem=null;
      panel.hidden=true;
      return;
    }
    const summary=prioritizeShopService(visitors.activeServiceRequests());
    const ready=visitors.readyCheckoutHeroId()!==null;
    urgentItem=summary.restock?.itemId??null;
    register.hidden=!ready;
    credit.hidden=summary.creditCount===0;
    restock.hidden=!summary.restock;
    if(summary.creditCount)
      credit.textContent="CREDIT "+summary.creditCount+" · E near customer";
    if(summary.restock){
      const wanted=ITEMS.find(item=>item.id===summary.restock!.itemId)!;
      const count=store.state.shopEconomy.bag[wanted.id];
      const seconds=Math.ceil(summary.restock.secondsRemaining);
      const text="RESTOCK "+summary.restockCount+" · "+wanted.name+
        " · "+seconds+"s · "+count+" in bag";
      if(text!==lastText){
        label.textContent=text;
        lastText=text;
      }
      restock.dataset.itemId=wanted.id;
      restock.dataset.urgent=String(seconds<=15);
      restock.title=count>0
        ?"F (when not aiming at a hero) or click: select "+wanted.name+" in the hotbar; then stock a shelf"
        :"No "+wanted.name+" in bag. B opens wholesale.";
      icon.setAttribute("href",import.meta.env.BASE_URL+
        "assets/ui-item-icons.svg#"+wanted.id);
    }
    panel.hidden=!ready&&!summary.restock&&!summary.creditCount;
  };
  restock.addEventListener("click",()=>{
    if(urgentItem&&isShopActive()&&
       !document.querySelector("dialog[open]"))
      selectRequested(urgentItem);
  });
  window.addEventListener("keydown",event=>{
    if(event.code!=="KeyF"||event.repeat||event.defaultPrevented||
      event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||
      !urgentItem||!isShopActive()||document.querySelector("dialog[open]")||
      document.body.classList.contains("blueprint-active")||
      (event.target instanceof HTMLElement&&(
        event.target.isContentEditable||
        ["INPUT","TEXTAREA","SELECT"].includes(event.target.tagName))))return;
    event.preventDefault();
    selectRequested(urgentItem);
  });
  // Query the live NPC visuals four times per second, never every render
  // frame. No pathfinding, store mutation or repeated DOM tree replacement.
  let nextUpdate=0;
  scene.onBeforeRenderObservable.add(()=>{
    const now=performance.now();
    if(now<nextUpdate)return;
    nextUpdate=now+250;
    update();
  });
  update();
}
