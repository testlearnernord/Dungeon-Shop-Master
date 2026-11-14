import type { Level5Room } from "./level5Room.ts";
import type { FurnitureDraft } from "./furnitureBlueprint.ts";
import type { ShopLayout } from "./shopLayout.ts";

export interface BlueprintPreviewCheck {
  readonly ready:boolean;
  readonly problem:string|null;
}

/** Per-editor cache for expensive entrance / shelf / checkout reachability.
 * A moving pointer only renders the ghost. Stop over a snapped location for
 * 140ms to compute its navigation graph once. Clicking bypasses the delay.
 *
 * Geometry changes invalidate all cached candidates; live NPC / player
 * occupancy intentionally stays outside the cache.
 */
export function createBlueprintPreviewValidator(
  validate:(draft:FurnitureDraft,layout:ShopLayout,room?:Level5Room)=>string|null,
  quietMs=140,
):{
  evaluate:(draft:FurnitureDraft,layout:ShopLayout,room:Level5Room|undefined,
    now:number,immediate?:boolean)=>BlueprintPreviewCheck;
}{
  let currentLayout:ShopLayout|null=null;
  let currentRoom:Level5Room|undefined;
  let activeKey="";
  let enteredAt=0;
  const cache=new Map<string,string|null>();
  const evaluate=(
    draft:FurnitureDraft,layout:ShopLayout,room:Level5Room|undefined,
    now:number,immediate=false,
  ):BlueprintPreviewCheck=>{
    if(layout!==currentLayout||room!==currentRoom){
      currentLayout=layout;
      currentRoom=room;
      cache.clear();
      activeKey="";
    }
    const key=`${draft.id}:${draft.x}:${draft.z}:${draft.rotation}`;
    if(key!==activeKey){
      activeKey=key;
      enteredAt=now;
    }
    if(cache.has(key))return {ready:true,problem:cache.get(key)??null};
    if(!immediate&&now-enteredAt<quietMs)return {ready:false,problem:null};
    const problem=validate(draft,layout,room);
    if(cache.size>=128){
      const oldest=cache.keys().next().value;
      if(oldest!==undefined)cache.delete(oldest);
    }
    cache.set(key,problem);
    return {ready:true,problem};
  };
  return {evaluate};
}
