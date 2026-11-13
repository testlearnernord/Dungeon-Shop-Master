/** Shop HUD presentation only; game state remains mounted while details are collapsed. */
export function setupShopStatusToggle(): void {
  const button = document.querySelector<HTMLButtonElement>("#toggle-shop-status");
  const content = document.querySelector<HTMLElement>("#shop-status-content");
  if (!button || !content) return;
  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    content.hidden = !expanded;
    button.textContent = expanded ? "Hide shop details" : "Show shop details";
  });
}

/** The stocking bar wraps on small screens. Position the expanded controls
 * panel above the bar's actual top edge, never by guessing its height. */
export function setupControlsHotbarClearance():void {
  const hotbar=document.querySelector<HTMLElement>("#inventory");
  const legend=document.querySelector<HTMLDetailsElement>("#hud details.controls");
  if(!hotbar||!legend)return;
  const refresh=():void=>{
    const inventoryTop=hotbar.getBoundingClientRect().top;
    const controlsTop=legend.getBoundingClientRect().top;
    const clearance=Math.max(8,Math.ceil(controlsTop-inventoryTop+12));
    legend.style.setProperty("--hotbar-clearance",clearance+"px");
  };
  const observer=new ResizeObserver(refresh);
  observer.observe(hotbar);
  observer.observe(legend);
  legend.addEventListener("toggle",refresh);
  window.addEventListener("resize",refresh);
  refresh();
}
