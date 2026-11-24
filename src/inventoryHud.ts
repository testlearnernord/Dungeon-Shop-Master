import {ECONOMY,SHELF_GOODS,MATERIAL_ITEMS,isShelfGood,type ItemId} from "./game/economy.ts";
import {Quickbar,QUICKBAR_SIZE,QUICKBAR_STORAGE_KEY} from "./game/quickbar.ts";
import type {GameStore} from "./game/gameStore.ts";
import {uiIcon} from "./uiIcons.ts";
export function loadQuickbar():unknown{
  try{return JSON.parse(localStorage.getItem(QUICKBAR_STORAGE_KEY)??"[]");}
  catch{return [];}
}
function persist(bar:Quickbar):void{
  try{localStorage.setItem(QUICKBAR_STORAGE_KEY,JSON.stringify(bar.slots));}
  catch{/* Optional local preference; bag remains authoritative. */}
}
function art(id:ItemId):SVGSVGElement{
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.classList.add("item-pictogram");svg.setAttribute("viewBox","0 0 64 64");
  svg.setAttribute("aria-hidden","true");
  const use=document.createElementNS("http://www.w3.org/2000/svg","use");
  use.setAttribute("href",import.meta.env.BASE_URL+"assets/ui-item-icons.svg#"+id);
  svg.append(use);return svg;
}
const itemName=(id:ItemId)=>SHELF_GOODS.find(item=>item.id===id)!.name;
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,text?:string)=>{
  const el=document.createElement(tag);el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
};
const button=(cls:string,text:string)=>{
  const node=element("button",cls,text);node.type="button";return node;
};
type Drag={kind:"bag";item:ItemId}|{kind:"slot";index:number};
interface InventoryOptions {
  isShopActive:()=>boolean;
  onMenuChanged:(open:boolean)=>void;
  onSelection:(index:number)=>void;
  onBindingsChanged:()=>void;
}
/** Two views of one bar; native modal releases FPS mouse capture. */
export function setupInventoryHud(dock:HTMLElement,canvas:HTMLCanvasElement,
  store:GameStore,bar:Quickbar,options:InventoryOptions){
  const dialog=document.createElement("dialog");
  dialog.id="inventory-dialog";dialog.setAttribute("aria-labelledby","inventory-title");
  const header=element("header","bag-header");
  const title=element("h2","","Inventory");title.id="inventory-title";
  const close=button("bag-close","Close (TAB / Esc)");
  header.append(title,close);
  const summary=element("p","bag-capacity");
  const grid=element("div","bag-grid");
  const reserve=element("section","bag-reserve");
  const editor=element("div","bag-quickbar");
  const help=element("p","bag-help","Drag an owned item onto a slot. Drag slots to swap; right-click a slot or drag it back to the bag to unbind. You can also select an item and click a slot.");
  const message=element("p","bag-message");message.setAttribute("role","status");
  dialog.append(header,summary,grid,reserve,element("h3","","Quickbar"),editor,help,message);
  document.body.append(dialog);
  let picked:ItemId|null=null,drag:Drag|null=null,discardSequence=0;
  let previousEconomy=store.state.shopEconomy;
  const changed=()=>{
    persist(bar);picked=null;render();options.onBindingsChanged();
  };
  const bind=(index:number,id:ItemId)=>{
    if(store.state.shopEconomy.bag[id]<=0&&bar.indexOf(id)<0){
      message.textContent="That item is not in your bag.";return;
    }
    if(bar.bind(index,id)){message.textContent=itemName(id)+" assigned to slot "+(index+1)+".";changed();}
  };
  const drop=(index:number)=>{
    const source=drag;drag=null;
    if(source?.kind==="bag")bind(index,source.item);
    else if(source?.kind==="slot"&&bar.swap(source.index,index))changed();
  };
  const dragStart=(event:DragEvent,source:Drag)=>{
    drag=source;
    if(event.dataTransfer){
      event.dataTransfer.effectAllowed=source.kind==="bag"?"copyMove":"move";
      event.dataTransfer.setData("text/plain",source.kind==="bag"?source.item:String(source.index));
    }
  };
  function slot(index:number,edit:boolean){
    const id=bar.slots[index];
    const count=id?store.state.shopEconomy.bag[id]:0;
    const node=button(edit?"bag-bind-slot":"inventory-row","");
    node.dataset[edit?"bindSlot":"quickbarSlot"]=String(index+1);
    if(id)node.dataset.itemId=id;
    node.classList.toggle("empty",!id||count===0);
    node.classList.toggle("selected",index===bar.selectedIndex);
    node.setAttribute("aria-pressed",String(index===bar.selectedIndex));
    node.setAttribute("aria-label",id?"Select "+itemName(id)+", "+count+" available":"Empty quickbar slot "+(index+1));
    node.title=id?String(index+1)+": "+itemName(id):"Slot "+(index+1)+" · TAB to assign";
    node.append(element("kbd","hotbar-key",String(index+1)));
    if(id)node.append(art(id),element("span","item-name",itemName(id)),element("strong","",String(count)));
    else node.append(element("span","empty-slot-mark","+"));
    node.addEventListener("click",()=>{
      if(edit&&picked){bind(index,picked);return;}
      options.onSelection(index);
    });
    if(edit){
      node.draggable=!!id;
      node.addEventListener("dragstart",event=>{if(id)dragStart(event,{kind:"slot",index});else event.preventDefault();});
      node.addEventListener("dragend",()=>{drag=null;});
      node.addEventListener("dragover",event=>{if(drag){event.preventDefault();node.classList.add("drop-target");}});
      node.addEventListener("dragleave",()=>node.classList.remove("drop-target"));
      node.addEventListener("drop",event=>{event.preventDefault();node.classList.remove("drop-target");drop(index);});
      node.addEventListener("contextmenu",event=>{event.preventDefault();bar.clear(index);changed();});
      node.addEventListener("keydown",event=>{if(event.key==="Delete"||event.key==="Backspace"){
        event.preventDefault();bar.clear(index);changed();
      }});
    }
    return node;
  }
  function render(){
    const economy=store.state.shopEconomy;
    const used=Object.values(economy.bag).reduce((sum,count)=>sum+count,0);
    const focus=document.activeElement instanceof HTMLElement&&dock.contains(document.activeElement)
      ?document.activeElement.dataset.quickbarSlot:undefined;
    dock.replaceChildren(...Array.from({length:QUICKBAR_SIZE},(_,i)=>slot(i,false)));
    const capacity=button("capacity","");capacity.setAttribute("aria-label","Open inventory, "+used+" of "+ECONOMY.bagCapacity+" bag slots used");
    capacity.append(uiIcon("bag"),element("span","",used+"/"+ECONOMY.bagCapacity),element("kbd","","TAB"));
    capacity.addEventListener("click",()=>open());dock.append(capacity);
    const selected=bar.selected;
    const selectedStatus=element("div","hotbar-selected",selected?itemName(selected)+" · "+economy.bag[selected]+" in bag":"Empty slot · TAB inventory");
    selectedStatus.dataset.empty=String(!selected||economy.bag[selected]===0);dock.append(selectedStatus);
    if(focus&&!dialog.open)dock.querySelector<HTMLElement>('[data-quickbar-slot="'+focus+'"]')?.focus({preventScroll:true});
    if(!dialog.open)return;
    summary.textContent=used+" / "+ECONOMY.bagCapacity+" bag spaces used";
    grid.replaceChildren();
    for(const item of SHELF_GOODS.filter(item=>economy.bag[item.id]>0)){
      const card=element("article","bag-item");card.dataset.bagItem=item.id;
      const choose=button("bag-item-pick","");choose.draggable=true;
      choose.setAttribute("aria-pressed",String(picked===item.id));
      choose.append(art(item.id),element("span","",item.name),element("strong","",String(economy.bag[item.id])));
      choose.addEventListener("dragstart",event=>dragStart(event,{kind:"bag",item:item.id}));
      choose.addEventListener("dragend",()=>{drag=null;});
      choose.addEventListener("click",()=>{
        picked=picked===item.id?null:item.id;
        message.textContent=picked?"Choose a quickbar slot for "+item.name+".":"";
        render();
      });
      const discard=button("bag-discard","Discard 1");
      discard.setAttribute("aria-label","Discard 1 "+item.name);
      discard.title="Permanently discard one item, no refund";
      discard.addEventListener("click",event=>{
        if(event.detail>1)return;
        // Negative request IDs are disjoint from supplier order IDs.
        message.textContent=store.discard(item.id,--discardSequence);
      });
      card.append(choose,discard);grid.append(card);
    }
    if(!grid.childElementCount)grid.append(element("p","bag-empty","Your bag is empty."));
    reserve.replaceChildren(element("h3","","Workshop reserve"),
      ...MATERIAL_ITEMS.map(item=>element("span","",item.name+" "+economy.materialStorage[item.id])));
    editor.replaceChildren(...Array.from({length:QUICKBAR_SIZE},(_,i)=>slot(i,true)));
  }
  grid.addEventListener("dragover",event=>{if(drag?.kind==="slot")event.preventDefault();});
  grid.addEventListener("drop",event=>{
    if(drag?.kind!=="slot")return;
    event.preventDefault();bar.clear(drag.index);drag=null;changed();
  });
  function open(requested?:ItemId):boolean{
    if(dialog.open)return true;
    if(!options.isShopActive()||document.querySelector("dialog[open]")||
      document.body.classList.contains("blueprint-active"))return false;
    if(document.pointerLockElement)void document.exitPointerLock();
    options.onMenuChanged(true);picked=null;drag=null;
    message.textContent="";
    if(requested&&isShelfGood(requested)){
      if(store.state.shopEconomy.bag[requested]>0){
        picked=requested;message.textContent="Choose a quickbar slot for "+itemName(requested)+".";
      }else message.textContent=itemName(requested)+" is not in your bag.";
    }
    dialog.showModal();render();close.focus();return true;
  }
  close.addEventListener("click",()=>dialog.close());
  dialog.addEventListener("close",()=>{picked=null;drag=null;options.onMenuChanged(false);canvas.focus();});
  window.addEventListener("keydown",event=>{
    if(event.code!=="Tab"||event.defaultPrevented||event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(dialog.open){event.preventDefault();dialog.close();}
    else if(open())event.preventDefault();
  });
  store.subscribe(()=>{
    if(store.state.shopEconomy===previousEconomy)return;
    const old=previousEconomy;previousEconomy=store.state.shopEconomy;
    if(old.bag!==previousEconomy.bag||dialog.open&&old.materialStorage!==previousEconomy.materialStorage)render();
  });
  render();
  return {open,close:()=>{if(dialog.open)dialog.close();},refreshSelection:render};
}
