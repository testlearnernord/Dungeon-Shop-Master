import {Color3} from "@babylonjs/core/Maths/math.color";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {DynamicTexture} from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import {BUYBACK_CHEST as C} from "./buybackChestPlacement.ts";
import {ITEMS} from "./economy.ts";
import {SURVEYOR_PLAN_NAME} from "./dungeonDiscovery.ts";

export function createBuybackChest(scene:Scene,store:GameStore){
  const root=new TransformNode("recovered-goods-root",scene);
  root.position.set(C.x,0,C.z);
  const mat=(name:string,color:string,shine=0)=>{
    const m=new StandardMaterial("buyback-"+name,scene);
    m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(shine,shine,shine);return m;
  };
  const woods=["#533322","#68422b","#795137","#5d3926"].map((c,i)=>mat("wood-"+i,c,.12));
  const iron=mat("iron","#38383c",.35),brass=mat("brass","#a77b3e",.45),inside=mat("inside","#2b211c");
  const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,m:StandardMaterial,parent=root)=>{
    const b=MeshBuilder.CreateBox("buyback-"+name,{width:w,height:h,depth:d},scene);
    b.parent=parent;b.position.set(x,y,z);b.material=m;b.isPickable=false;return b;
  };
  const W=C.width,D=C.depth,H=C.height;
  box("bottom",W,.12,D,0,.15,0,inside);
  for(let i=0;i<5;i++){
    const y=.29+i*.135;
    box("front-plank-"+i,W,.132,.095,0,y,D/2-.048,woods[i%4]);
    box("rear-plank-"+i,W,.132,.095,0,y,-D/2+.048,woods[(i+1)%4]);
    for(const x of [-W/2+.05,W/2-.05])box("side-"+i+"-"+x,.1,.132,D-.18,x,y,0,woods[(i+2)%4]);
  }
  for(const x of [-W/2+.09,W/2-.09])for(const z of [-D/2+.09,D/2-.09]){
    box("foot-"+x+z,.2,.2,.2,x,.1,z,iron);
    box("corner-"+x+z,.16,.76,.16,x,.52,z,iron);
  }
  for(const y of [.24,.83])box("front-band-"+y,W,.075,.035,0,y,D/2+.008,iron);
  const hinge=new TransformNode("buyback-lid-hinge",scene);
  hinge.parent=root;hinge.position.set(0,H,-D/2);
  for(let i=0;i<5;i++)box("lid-board-"+i,W+.04,.115,D/5-.003,0,.03,(i+.5)*D/5,woods[i%4],hinge);
  for(const x of [-.59,.59]){
    box("lid-band-"+x,.12,.15,D+.04,x,.055,D/2,iron,hinge);
    box("hinge-"+x,.18,.12,.19,x,H-.06,-D/2,brass);
    for(const z of [.15,.5,.85])box("lid-stud-"+x+z,.055,.035,.055,x,.15,z,brass,hinge);
  }
  box("latch",.16,.2,.055,0,.82,D/2+.045,brass);
  box("sign-frame",1.25,.30,.055,0,.54,D/2+.055,brass);
  const plate=MeshBuilder.CreatePlane("buyback-sign",{width:1.17,height:.25},scene);
  plate.parent=root;plate.position.set(0,.54,D/2+.088);plate.rotation.y=Math.PI;plate.isPickable=false;
  const tex=new DynamicTexture("buyback-sign-text",{width:1024,height:220},scene,false);
  const sm=mat("sign","#ffffff");sm.diffuseTexture=tex;sm.emissiveColor=new Color3(.55,.47,.34);sm.disableLighting=true;plate.material=sm;
  const paint=()=>{
    const ctx=tex.getContext() as unknown as CanvasRenderingContext2D;ctx.fillStyle="#30231a";ctx.fillRect(0,0,1024,220);
    ctx.strokeStyle="#bd9458";ctx.lineWidth=8;ctx.strokeRect(8,8,1008,204);
    ctx.textAlign="center";ctx.fillStyle="#f5d7a2";ctx.font="bold 86px Georgia";ctx.fillText("SELL LOOT HERE",512,110,970);
    ctx.font="bold 38px sans-serif";ctx.fillStyle=store.state.buybackChestOpen?"#a1d3ab":"#e0a099";
    ctx.fillText(store.state.buybackChestOpen?"OPEN · RECOVERED GOODS":"CLOSED",512,174);tex.update();
  };
  // One picking/collision hull; decorative mesh parts are not service targets.
  const mesh=MeshBuilder.CreateBox("recovered-goods-chest",{width:W,height:H,depth:D},scene);
  mesh.parent=root;mesh.position.y=H/2;mesh.visibility=0;mesh.isPickable=true;mesh.checkCollisions=true;
  mesh.metadata={kind:"buyback-chest"};
  let prior=store.state.buybackChestOpen,seen=store.state.events;
  hinge.rotation.x=prior?-Math.PI*.57:0;paint();
  const bubble=MeshBuilder.CreatePlane("buyback-receipt",{width:2.55,height:.72},scene);
  bubble.position.set(C.x,1.8,C.z+.25);bubble.billboardMode=Mesh.BILLBOARDMODE_ALL;bubble.isPickable=false;bubble.setEnabled(false);
  const bt=new DynamicTexture("buyback-receipt-text",{width:1024,height:288},scene,false);
  bt.hasAlpha=true;const bm=mat("receipt","#ffffff");bm.diffuseTexture=bt;bm.useAlphaFromDiffuseTexture=true;bm.disableLighting=true;bm.emissiveColor=Color3.White();bubble.material=bm;
  let remaining=0;
  store.subscribe(()=>{
    const state=store.state;
    if(prior!==state.buybackChestOpen){prior=state.buybackChestOpen;paint();}
    if(state.events===seen)return;
    const old=seen;seen=state.events;
    if(state.events.length<=old.length||state.events[old.length-1]?.id!==old.at(-1)?.id)return;
    const sales=state.events.slice(old.length).filter(e=>e.type==="hero-buyback"||e.type==="discovery-buyback");
    if(!sales.length)return;
    const counts=new Map<string,number>();
    for(const e of sales)if(e.itemId)counts.set(e.itemId,(counts.get(e.itemId)??0)+(e.quantity??1));
    const ctx=bt.getContext() as unknown as CanvasRenderingContext2D;ctx.clearRect(0,0,1024,288);ctx.fillStyle="#16201f";ctx.fillRect(0,0,1024,288);
    ctx.textAlign="center";ctx.font="bold 43px sans-serif";ctx.fillStyle="#e8c687";
    ctx.fillText("−"+sales.reduce((v,e)=>v+(e.cost??0),0)+"g  ·  RECOVERED GOODS",512,55);
    ctx.fillStyle="#b4e0b8";ctx.font="bold 43px sans-serif";let y=116;
    if(sales.some(e=>e.type==="discovery-buyback")){ctx.fillText("+"+SURVEYOR_PLAN_NAME,512,y);y+=57;}
    for(const [id,count] of counts){ctx.fillText("+"+count+" "+ITEMS.find(i=>i.id===id)?.name,512,y);y+=57;}
    bt.update();remaining=4;bubble.setEnabled(true);
  });
  return {mesh,update(dt:number){
    const target=prior?-Math.PI*.57:0;
    hinge.rotation.x+=(target-hinge.rotation.x)*Math.min(1,dt*9);
    if(remaining>0){remaining-=dt;bubble.position.y=1.8+(4-remaining)*.13;if(remaining<=0)bubble.setEnabled(false);}
  }};
}
