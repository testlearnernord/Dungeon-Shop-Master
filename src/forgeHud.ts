import type {GameStore} from "./game/gameStore.ts";
import {ECONOMY,ITEMS,MATERIAL_ITEMS} from "./game/economy.ts";
import {dungeonBuybackPrice} from "./game/dungeonBuyback.ts";
import {FORGE_OUTPUTS,FORGE_RECIPES,type ForgeOutput} from "./game/cellarForge.ts";

/** Physical interaction opens the forge; all decisions/consumption happen
 * in one existing GameStore. A visual DOM panel cannot grant inventory. */
export function setupCellarForgeHud(store:GameStore,onCrafted:(id:ForgeOutput)=>void=()=>{}){
  const dialog=document.createElement("dialog");
  dialog.id="cellar-forge-dialog";
  dialog.className="cellar-forge-dialog";
  dialog.setAttribute("aria-label","Galvik's cellar forge");
  const heading=document.createElement("h2");
  heading.textContent="GALVIK'S FORGE";
  const desc=document.createElement("p");
  desc.textContent="Your bought dungeon salvage is stored in the workshop reserve. Forge actual T2 gear, then stock the usual shelves.";
  const stock=document.createElement("p");
  stock.className="forge-reserve";
  const rows=document.createElement("div");
  rows.className="forge-recipes";
  const message=document.createElement("p");
  message.className="forge-result";
  message.setAttribute("role","status");
  const close=document.createElement("button");
  close.type="button";
  close.textContent="Close (Esc)";
  close.addEventListener("click",()=>dialog.close());
  const buttons=FORGE_OUTPUTS.map(id=>{
    const row=document.createElement("div");
    row.className="forge-recipe";
    row.dataset.itemId=id;
    const title=document.createElement("strong");
    const icon=document.createElementNS("http://www.w3.org/2000/svg","svg");
    icon.classList.add("forge-item-icon");icon.setAttribute("viewBox","0 0 48 48");
    icon.setAttribute("aria-hidden","true");
    const use=document.createElementNS("http://www.w3.org/2000/svg","use");
    use.setAttribute("href",import.meta.env.BASE_URL+"assets/ui-item-icons.svg#"+id);
    icon.append(use);title.append(icon,ITEMS.find(item=>item.id===id)!.name);
    const materials=document.createElement("span");
    materials.textContent=Object.entries(FORGE_RECIPES[id])
      .filter(([,count])=>count>0)
      .map(([mat,count])=>count+"× "+ITEMS.find(item=>item.id===mat)!.name)
      .join(" + ");
    const button=document.createElement("button");
    button.type="button";
    button.textContent="Forge 1";
    button.addEventListener("click",()=>{
      const before=store.state;
      message.textContent=store.craftAtForge(id);
      if(store.state!==before)onCrafted(id);
      render();
    });
    const item=ITEMS.find(item=>item.id===id)!;
    const cost=MATERIAL_ITEMS.reduce((sum,mat)=>sum+
      FORGE_RECIPES[id][mat.id]*dungeonBuybackPrice(mat.id),0);
    const value=document.createElement("small");
    value.className="forge-recipe-value";
    value.textContent=cost+"g materials · "+item.salePrice+"g sell · +"+(item.salePrice-cost)+"g margin";
    row.append(title,materials,value,button);
    rows.append(row);
    return {id,button,row,materials};
  });
  dialog.append(heading,desc,stock,rows,message,close);
  document.body.append(dialog);
  function render(){
    const economy=store.state.shopEconomy;
    const used=Object.values(economy.bag).reduce((total,n)=>total+n,0);
    const r=economy.materialStorage;
    stock.textContent="Workshop: Iron Ore "+r["iron-ore"]+
      " · Coal "+r.coal+" · Ghoul Leather "+r["ghoul-leather"]+
      "    |    Bag "+used+"/"+ECONOMY.bagCapacity;
    for(const {id,button,row,materials} of buttons){
      const recipe=FORGE_RECIPES[id];
      const enough=Object.entries(recipe).every(([mat,n])=>
        r[mat as keyof typeof r]>=n);
      button.disabled=used>=ECONOMY.bagCapacity||!enough;
      row.dataset.ready=String(!button.disabled);
      materials.textContent=Object.entries(recipe).filter(([,n])=>n>0)
        .map(([mat,n])=>ITEMS.find(item=>item.id===mat)!.name+
          " "+r[mat as keyof typeof r]+"/"+n).join(" · ");
      button.title=used>=ECONOMY.bagCapacity?"Clear one bag slot first":
        enough?"Consume materials and forge one item":"Acquire the required materials";
    }
  }
  store.subscribe(()=>{if(dialog.open)render();});
  return {
    open():boolean{
      if(dialog.open)return true;
      if(document.querySelector("dialog[open]"))return false;
      if(document.pointerLockElement)document.exitPointerLock();
      message.textContent="";
      render();dialog.showModal();
      return true;
    },
    close():void{if(dialog.open)dialog.close();},
  };
}
