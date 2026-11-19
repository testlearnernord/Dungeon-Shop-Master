/** One physical shop step per successfully committed world tick.
 * Batched frame catch-up must NEVER process all world events before all
 * shopper movements: that would change request expiry and pickup ordering
 * depending on FPS/frame grouping. No independent timer exists here.
 */
export function advancePhysicalShopWorldTicks(
  ticks:number,readTick:()=>number,commitOneWorldTick:()=>void,
  advanceOneShopTick:()=>void,
):number{
  if(!Number.isSafeInteger(ticks)||ticks<0||ticks>8)
    throw new RangeError("Invalid bounded shop tick batch.");
  let processed=0;
  for(let index=0;index<ticks;index++){
    const before=readTick();
    commitOneWorldTick();
    const after=readTick();
    if(after===before)continue; // Shop day capped: only bed can open tomorrow.
    if(after!==before+1)
      throw new Error("Shop movement requires exactly one committed world tick.");
    advanceOneShopTick();
    processed++;
  }
  return processed;
}
