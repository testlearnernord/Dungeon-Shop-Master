import type {GameState} from "./gameState.ts";
import {ECONOMY,ITEMS,type ItemId,type MaterialItemId} from "./economy.ts";

/** Minimal physical cellar forge: exactly one REAL workshop transaction per
 * explicit player press. Recipes are static and have no timer, RNG, dungeon
 * AI, passive resource generation or hidden Gold source. */
export const FORGE_RECIPES={
  "forged-sword-shield":{"iron-ore":1,coal:1,"ghoul-leather":0},
  "forged-spear":{"iron-ore":1,coal:1,"ghoul-leather":0},
  "forged-staff":{"iron-ore":1,coal:1,"ghoul-leather":0},
  "ghoul-leather-vest":{"iron-ore":0,coal:0,"ghoul-leather":2},
} as const satisfies Record<string,Readonly<Record<MaterialItemId,number>>>;
export type ForgeOutput=keyof typeof FORGE_RECIPES;
export const FORGE_OUTPUTS=Object.keys(FORGE_RECIPES) as ForgeOutput[];
export const isForgeOutput=(id:string):id is ForgeOutput=>
  Object.hasOwn(FORGE_RECIPES,id);

export function craftAtCellarForge(
  state:GameState,output:ForgeOutput,
):{state:GameState;message:string}{
  if(!isForgeOutput(output))
    return {state,message:"That recipe is not available at the cellar forge."};
  const item=ITEMS.find(value=>value.id===output);
  if(!item||item.kind==="material"||item.wholesaleCost!==0)
    return {state,message:"Unknown forge product."};
  const reserve=state.shopEconomy.materialStorage;
  const recipe=FORGE_RECIPES[output];
  for(const key of Object.keys(recipe) as MaterialItemId[]){
    if(!Number.isSafeInteger(reserve[key])||reserve[key]<recipe[key])
      return {state,message:"Not enough "+ITEMS.find(i=>i.id===key)?.name+" for "+item.name+"."};
  }
  const held=Object.values(state.shopEconomy.bag).reduce((a,b)=>a+b,0);
  if(held>=ECONOMY.bagCapacity)
    return {state,message:"Galvik's bag is full. Clear a slot before forging."};
  if((state.shopEconomy.bag[output]??0)>=Number.MAX_SAFE_INTEGER)
    return {state,message:"The crafted stack has reached its numeric limit."};
  const nextStorage={...reserve};
  for(const key of Object.keys(recipe) as MaterialItemId[])
    nextStorage[key]-=recipe[key];
  return {state:{...state,shopEconomy:{...state.shopEconomy,
    materialStorage:nextStorage,
    bag:{...state.shopEconomy.bag,[output]:
      state.shopEconomy.bag[output]+1} as Record<ItemId,number>}},
    message:"Forged 1 "+item.name+". Materials consumed; stock it on a real shelf."};
}
