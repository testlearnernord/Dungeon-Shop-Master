/** Canvas twin of public/assets/ui-interface-icons.svg#coin. */
type CoinCanvas={
  save():void;restore():void;beginPath():void;
  arc(x:number,y:number,r:number,start:number,end:number):void;
  moveTo(x:number,y:number):void;lineTo(x:number,y:number):void;
  closePath():void;fill():void;stroke():void;
  fillStyle:string|CanvasGradient|CanvasPattern;
  strokeStyle:string|CanvasGradient|CanvasPattern;lineWidth:number;
};
export function drawGoldCoin(ctx:CoinCanvas,x:number,y:number,r:number):void{
  ctx.save();
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle="#dba952";ctx.fill();ctx.lineWidth=r*.14;
  ctx.strokeStyle="#5b3e21";ctx.stroke();
  ctx.beginPath();ctx.arc(x,y,r*.75,0,Math.PI*2);
  ctx.lineWidth=r*.115;ctx.strokeStyle="#fff0be";ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x,y-r*.51);ctx.lineTo(x+r*.41,y);
  ctx.lineTo(x,y+r*.51);ctx.lineTo(x-r*.41,y);ctx.closePath();
  ctx.fillStyle="#754820";ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x,y-r*.26);ctx.lineTo(x+r*.2,y);
  ctx.lineTo(x,y+r*.26);ctx.lineTo(x-r*.2,y);ctx.closePath();
  ctx.fillStyle="#ffebad";ctx.fill();ctx.restore();
}
