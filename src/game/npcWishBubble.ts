import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import type { Scene } from "@babylonjs/core/scene";
import type { ItemId } from "./economy.ts";
import { ITEMS } from "./economy.ts";

export interface NpcWishBubble {
  readonly root:HTMLDivElement;
  readonly icon:SVGUseElement;
  readonly timer:HTMLElement;
  readonly detail:HTMLElement;
}

/** Uses the SAME SVG item symbols as the stocking hotbar, not Emoji or
 * separate generated pictures. Lives in the DOM so it stays crisp at 1080p. */
export function createNpcWishBubble(itemId:ItemId):NpcWishBubble {
  const root=document.createElement("div");
  root.className="npc-wish-bubble";
  root.setAttribute("role","img");
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 48 48");
  svg.classList.add("npc-wish-icon");
  const icon=document.createElementNS("http://www.w3.org/2000/svg","use");
  svg.append(icon);
  const detail=document.createElement("span");
  detail.className="npc-wish-detail";
  const timer=document.createElement("span");
  timer.className="npc-wish-timer";
  root.append(svg,detail,timer);
  document.body.append(root);
  const bubble={root,icon,timer,detail};
  setNpcWishItem(bubble,itemId);
  return bubble;
}
export function setNpcWishItem(bubble:NpcWishBubble,itemId:ItemId,begging=false):void {
  const name=ITEMS.find(item=>item.id===itemId)?.name??itemId;
  bubble.icon.setAttribute("href",import.meta.env.BASE_URL+"assets/ui-item-icons.svg#"+itemId);
  bubble.root.setAttribute("aria-label",(begging?"Begging for ":"Looking for ")+name);
  bubble.root.title=begging?"Approach and press E to hear a credit plea for "+name:"Looking for "+name;
  bubble.root.classList.toggle("is-begging",begging);
  bubble.detail.textContent=(begging?"PLEASE: ":"NEED: ")+name;
}
export function updateNpcWishBubble(
  bubble:NpcWishBubble,scene:Scene,position:Vector3,
  seconds:number,angry=false,
):void {
  const camera=scene.activeCamera;
  const canvas=scene.getEngine().getRenderingCanvas();
  if(!camera||!canvas){
    bubble.root.hidden=true;
    return;
  }
  const rect=canvas.getBoundingClientRect();
  const clip=Vector3.Project(
    new Vector3(position.x,position.y+3.05,position.z),
    Matrix.Identity(),scene.getTransformMatrix(),
    new Viewport(0,0,rect.width,rect.height),
  );
  if(clip.z<=0||clip.z>=1||clip.x<0||clip.y<0||
    clip.x>rect.width||clip.y>rect.height){
    bubble.root.hidden=true;
    return;
  }
  bubble.root.hidden=false;
  bubble.root.classList.toggle("is-angry",angry);
  bubble.timer.textContent=angry?"NO SALE!":Math.ceil(seconds)+"s";
  bubble.root.style.transform=`translate(${Math.round(rect.left+clip.x)}px,
    ${Math.round(rect.top+clip.y)}px) translate(-50%,-100%)`;
}
