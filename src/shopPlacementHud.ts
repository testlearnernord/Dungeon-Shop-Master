import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { GameStore } from "./game/gameStore.ts";
import type { Shop } from "./game/shop.ts";
import {
  replaceShelfPlacement, type ShelfId, type ShelfPlacement,
} from "./game/shopLayout.ts";

/** A bounded, undoable visual editor. Drafts never mutate the saved game state. */
export function setupShopPlacementHud(
  canvas:HTMLCanvasElement,
  camera:UniversalCamera,
  store:GameStore,
  shop:Shop,
):()=>void {
  const dialog=document.querySelector<HTMLDialogElement>("#shelf-placement")!;
  const selector=document.querySelector<HTMLSelectElement>("#placement-shelf")!;
  const info=document.querySelector<HTMLElement>("#placement-coordinates")!;
  const status=document.querySelector<HTMLElement>("#placement-status")!;
  const save=document.querySelector<HTMLButtonElement>("#placement-save")!;
  const cancel=document.querySelector<HTMLButtonElement>("#placement-cancel")!;
  const openButton=document.querySelector<HTMLButtonElement>("#open-placement")!;
  const rotate=document.querySelector<HTMLButtonElement>("#placement-rotate")!;
  let draft:ShelfPlacement|null=null;

  const update=(p:ShelfPlacement):void=>{
    draft=p;
    shop.previewPlacement(p);
    const check=replaceShelfPlacement(store.state.shopLayout,p);
    const invalid=check.layout===store.state.shopLayout &&
      check.message!=="Shelf placement saved.";
    // A valid placement might be equal to its saved origin and still be legal.
    const problem=invalid?check.message:null;
    save.disabled=!!problem;
    info.textContent=p.id+" · X "+p.x.toFixed(2)+
      " · Z "+p.z.toFixed(2)+" · Rotation "+(p.rotation*90)+"°";
    status.textContent=problem??"Valid placement. Save to commit, or cancel to restore.";
    status.dataset.valid=String(!problem);
  };
  const choose=(id:ShelfId):void=>{
    const placement=store.state.shopLayout.shelves.find(p=>p.id===id)!;
    selector.value=id;
    update({...placement});
  };
  const nudge=(dx:number,dz:number):void=>{
    if(!draft)return;
    update({...draft,x:Math.round((draft.x+dx)*4)/4,
      z:Math.round((draft.z+dz)*4)/4});
  };
  const turn=():void=>{
    if(!draft)return;
    update({...draft,rotation:((draft.rotation+1)%4) as ShelfPlacement["rotation"]});
  };
  const close=():void=>{
    if(!dialog.open)return;
    dialog.close();
  };
  const commit=():void=>{
    if(!draft||save.disabled)return;
    const message=store.placeShelf(draft);
    if(message==="Shelf placement saved."){
      close();
    }else{
      status.textContent=message;
    }
  };
  const open=():void=>{
    if(dialog.open||document.querySelector("dialog[open]")||
      document.body.classList.contains("arena-active")||
      document.body.classList.contains("dungeon-active"))return;
    if(document.pointerLockElement)void document.exitPointerLock();
    camera.detachControl();
    dialog.showModal();
    choose(selector.value==="shelf-2"?"shelf-2":"shelf-1");
    // Focus the dialog itself: arrow keys immediately control the preview.
    // Tab moves into native selector/buttons without hijacking their activation.
    dialog.focus();
  };

  openButton.addEventListener("click",open);
  save.addEventListener("click",commit);
  cancel.addEventListener("click",close);
  rotate.addEventListener("click",turn);
  selector.addEventListener("change",()=>choose(
    selector.value==="shelf-2"?"shelf-2":"shelf-1"));
  dialog.querySelectorAll<HTMLButtonElement>("[data-placement-dx]").forEach(button=>{
    button.addEventListener("click",()=>nudge(
      Number(button.dataset.placementDx),
      Number(button.dataset.placementDz),
    ));
  });
  dialog.addEventListener("keydown",event=>{
    if(event.code==="Escape"){event.preventDefault();close();return;}
    if(event.repeat)return;
    if(event.code==="KeyQ"){event.preventDefault();turn();return;}
    if(event.code==="Enter"&&!(event.target instanceof HTMLButtonElement)){
      event.preventDefault();commit();return;
    }
    if(event.target instanceof HTMLSelectElement)return;
    const offset:{[key:string]:readonly [number,number]}={
      ArrowLeft:[-0.25,0],ArrowRight:[0.25,0],
      ArrowUp:[0,-0.25],ArrowDown:[0,0.25],
    };
    const shift=offset[event.code];
    if(shift){event.preventDefault();nudge(shift[0],shift[1]);}
  });
  dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
  dialog.addEventListener("close",()=>{
    draft=null;
    shop.previewPlacement(null);
    camera.attachControl(canvas,true);
    canvas.focus();
  });
  window.addEventListener("keydown",event=>{
    if(event.code!=="KeyP"||event.repeat||event.ctrlKey||
      event.altKey||event.metaKey)return;
    if(dialog.open){event.preventDefault();close();return;}
    if(event.target instanceof HTMLElement &&
      event.target.closest("input,select,textarea,[contenteditable]"))return;
    if(document.querySelector("dialog[open]"))return;
    event.preventDefault();
    open();
  });
  return open;
}
