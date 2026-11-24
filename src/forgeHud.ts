import type {GameStore} from "./game/gameStore.ts";
import {ECONOMY,ITEMS} from "./game/economy.ts";
import {FORGE_OUTPUTS,FORGE_RECIPES} from "./game/cellarForge.ts";

/** Physical interaction opens the forge; all decisions/consumption happen
 * in one existing GameStore. A visual DOM panel cannot grant inventory. */
export function setupCellarForgeHud(store:GameStore){
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
    const title=document.createElement("strong");
    title.textContent=ITEMS.find(item=>item.id===id)!.name;
    const materials=document.createElement("span");
    materials.textContent=Object.entries(FORGE_RECIPES[id])
      .filter(([,count])=>count>0)
      .map(([mat,count])=>count+"× "+ITEMS.find(item=>item.id===mat)!.name)
      .join(" + ");
    const button=document.createElement("button");
    button.type="button";
    button.textContent="Forge 1";
    button.addEventListener("click",()=>{
      message.textContent=store.craftAtForge(id);
      render();
    });
    row.append(title,materials,button);
    rows.append(row);
    return {id,button};
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
    for(const {id,button} of buttons){
      const recipe=FORGE_RECIPES[id];
      button.disabled=used>=ECONOMY.bagCapacity||
        Object.entries(recipe).some(([mat,n])=>
          r[mat as keyof typeof r]<n);
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
