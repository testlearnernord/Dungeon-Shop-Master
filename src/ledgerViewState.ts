/** Presentation-only, tab-scoped ledger state. Old markers did not include
 * navigation settings; malformed storage must never select an invalid chapter.
 * This helper deliberately knows nothing about combat, sales or GameState. */
export interface LedgerViewState {
  readonly page:number;
  readonly animationSkipped:boolean;
}

export function restoreLedgerView(
  rawPage:unknown,rawSkip:unknown,chapterCount:number,
):LedgerViewState{
  if(!Number.isSafeInteger(chapterCount)||chapterCount<1)
    throw new RangeError("Ledger needs at least one chapter");
  const page=typeof rawPage==="number"&&Number.isSafeInteger(rawPage)&&
    rawPage>=0&&rawPage<chapterCount?rawPage:0;
  return {page,animationSkipped:rawSkip===true};
}
