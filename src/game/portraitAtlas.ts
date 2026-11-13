/** One face-safe crop across five-by-five portrait atlas usages.
 * Coordinates are shared by Canvas textures, the adventurer board and CSS. */
export const PORTRAIT_GRID=5;
export const PORTRAIT_CROP=.86;
export const PORTRAIT_TOP_OFFSET=.04;
const normalized=(index:number)=>((index%25)+25)%25;
export function heroPortraitRegion(index:number,width:number,height:number){
  const normalizedIndex=normalized(index);
  const col=normalizedIndex%PORTRAIT_GRID;
  const row=Math.floor(normalizedIndex/PORTRAIT_GRID);
  const dx=(1-PORTRAIT_CROP)/2,dy=dx-PORTRAIT_TOP_OFFSET;
  return {sx:(col+dx)*width/PORTRAIT_GRID,
    sy:(row+dy)*height/PORTRAIT_GRID,
    sw:PORTRAIT_CROP*width/PORTRAIT_GRID,
    sh:PORTRAIT_CROP*height/PORTRAIT_GRID};
}
export function heroPortraitBackground(index:number){
  const normalizedIndex=normalized(index);
  const col=normalizedIndex%PORTRAIT_GRID;
  const row=Math.floor(normalizedIndex/PORTRAIT_GRID);
  const dx=(1-PORTRAIT_CROP)/2,dy=dx-PORTRAIT_TOP_OFFSET;
  const percent=(value:number)=>100*value/(PORTRAIT_GRID-PORTRAIT_CROP);
  const size=100*PORTRAIT_GRID/PORTRAIT_CROP;
  return {size:size+"% "+size+"%",
    position:percent(col+dx)+"% "+percent(row+dy)+"%"};
}
