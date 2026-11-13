/** Shared 5×5 portrait source crop for HTML and Babylon canvas. */
export const PORTRAIT_GRID=5;
export const PORTRAIT_INSET=.08;
function slot(index:number):number{
  return ((Math.floor(index)%25)+25)%25;
}
export function portraitSourceRect(
  image:{readonly naturalWidth:number;readonly naturalHeight:number},
  index:number,
){
  const i=slot(index),col=i%5,row=Math.floor(i/5);
  const w=image.naturalWidth/PORTRAIT_GRID,h=image.naturalHeight/PORTRAIT_GRID;
  return {sx:(col+PORTRAIT_INSET)*w,sy:(row+PORTRAIT_INSET)*h,
    sw:(1-2*PORTRAIT_INSET)*w,sh:(1-2*PORTRAIT_INSET)*h};
}
export function portraitCssFrame(index:number){
  const i=slot(index),col=i%5,row=Math.floor(i/5);
  const zoom=PORTRAIT_GRID/(1-2*PORTRAIT_INSET)*100;
  const denom=PORTRAIT_GRID-1+2*PORTRAIT_INSET;
  return {
    backgroundSize:zoom+"% "+zoom+"%",
    backgroundPosition:(col+PORTRAIT_INSET)/denom*100+"% "+
      (row+PORTRAIT_INSET)/denom*100+"%",
  };
}
