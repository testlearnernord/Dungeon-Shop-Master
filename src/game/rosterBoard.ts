import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { DEFAULT_ROSTER_BOARD } from "./rosterBoardPlacement.ts";
import type { GameStore } from "./gameStore.ts";
import {portraitIndex} from "./rosterView.ts";
import {liveRosterCards,rosterActivityLabel} from "./heroCardView.ts";
import {gearFromName} from "./gearCatalog.ts";
import {portraitSourceRect} from "./portraitAtlas.ts";

/** Read-only projection of the authoritative heroes onto the shop's front wall. */
export function createRosterBoard(scene: Scene, store: GameStore): { mesh: Mesh } {
  const board = MeshBuilder.CreatePlane("adventurer-roster-board", { width: 3.25, height: 2.02 }, scene);
  // The bedroom side wall reaches forward to z=-6.655. Keep the entire
  // board, including its frame, outside that wall and inside the front-wall
  // span [-7.5,-2.5]. The former 4.55m board was partly buried in masonry.
  const boardX = -5.55;
  const boardY = 2.17;
  const boardZ = -6.45;
  board.position = new Vector3(boardX, boardY, boardZ);
  board.rotation.y = Math.PI;
  board.checkCollisions = false;
  board.isPickable = true;
  board.metadata = { kind: "roster-board" };
  const texture = new DynamicTexture("roster-board-texture", { width: 1536, height: 960 }, scene, false);
  const paint = new StandardMaterial("roster-board-paint", scene);
  paint.diffuseTexture = texture;
  paint.emissiveColor = new Color3(0.85, 0.76, 0.65);
  paint.disableLighting = true;
  paint.backFaceCulling = false;
  board.material = paint;
  const portraits = new Image();
  portraits.src = import.meta.env.BASE_URL + "assets/hero-portraits.webp";
  portraits.addEventListener("load", () => draw());
  const wood = new StandardMaterial("roster-board-wood", scene);
  wood.diffuseColor = new Color3(0.38, 0.23, 0.11);
  const frames:Mesh[]=[];
  for (const [name, w, h, x, y] of [
    ["top", 3.37, 0.12, 0, 3.22], ["bottom", 3.37, 0.12, 0, 1.12],
    ["left", 0.12, 2.09, -1.69, boardY], ["right", 0.12, 2.09, 1.69, boardY],
  ] as const) {
    const frame = MeshBuilder.CreateBox("roster-frame-" + name, { width: w, height: h, depth: 0.11 }, scene);
    frame.position.set(boardX + x, y, boardZ + 0.04);
    frame.material = wood;
    frame.isPickable = false;
    frame.checkCollisions = false;
    frames.push(frame);
  }
  const root=new TransformNode("adventurer-board-module",scene);
  root.position.set(DEFAULT_ROSTER_BOARD.x,0,DEFAULT_ROSTER_BOARD.z);
  for(const mesh of [board,...frames]){
    mesh.computeWorldMatrix(true);
    mesh.setParent(root);
  }
  let lastPlacement:typeof store.state.rosterBoard|null=null;
  const syncPlacement=()=>{
    const p=store.state.rosterBoard;
    if(p===lastPlacement)return;
    lastPlacement=p;
    root.position.set(p.x,0,p.z);
    // The original plane faces into the shop at rotation PI (turn 2).
    root.rotation.y=(p.rotation-2)*Math.PI/2;
  };
  store.subscribe(syncPlacement);
  syncPlacement();
  function draw(): void {
    const state=store.state,ctx=texture.getContext();
    const active=[...liveRosterCards(state,"active")];
    const fallen=state.adventurers.filter(h=>h.status==="dead").length;
    const critical=(h:typeof active[number])=>h.health!==null&&h.maxHealth!==null&&h.health/h.maxHealth<=.3;
    const priority=(h:typeof active[number])=>h.status==="at-shop"?0:critical(h)?1:h.status==="combat"?2:3;
    active.sort((a,b)=>priority(a)-priority(b)||(b.floor??0)-(a.floor??0)||a.id.localeCompare(b.id,undefined,{numeric:true}));
    const background=ctx.createLinearGradient(0,0,1536,960);
    background.addColorStop(0,"#182b2a");background.addColorStop(1,"#101c1e");
    ctx.fillStyle=background;ctx.fillRect(0,0,1536,960);
    const text=(value:string,x:number,y:number,size:number,color="#e9e1cc",bold=false,max?:number)=>{
      ctx.fillStyle=color;ctx.font=(bold?"bold ":"")+size+"px sans-serif";
      if(max===undefined)ctx.fillText(value,x,y);else ctx.fillText(value,x,y,max);
    };
    text("ADVENTURERS",44,66,54,"#f5d6a0",true);
    text("LIVE  ·  DAY "+state.day,1115,62,30,"#9dc9b6",true);
    const stats=[
      [active.length+" ACTIVE","#dfd7bc"],
      [active.filter(h=>h.status==="at-shop").length+" IN SHOP","#a8d9ad"],
      [active.filter(h=>h.status==="combat").length+" FIGHTING","#ebbb81"],
      [fallen+" FALLEN","#e8a496"],
    ];
    stats.forEach(([label,color],i)=>{
      ctx.fillStyle="#233737";ctx.fillRect(44+i*365,91,343,55);
      text(label,62+i*365,128,27,color,true,305);
    });
    ctx.fillStyle="#a48758";ctx.fillRect(44,164,1448,3);
    const cardW=714,cardH=133;
    active.slice(0,10).forEach((hero,i)=>{
      const x=44+(i%2)*734,y=186+Math.floor(i/2)*141;
      const hp=hero.health??0,max=hero.maxHealth??1,ratio=Math.max(0,Math.min(1,hp/max));
      const accent=hero.role==="tank"?"#a8c6e8":hero.role==="healer"?"#9bd4b2":"#ecc98e";
      ctx.fillStyle="#253535";ctx.fillRect(x,y,cardW,cardH);
      ctx.fillStyle=critical(hero)?"#de7762":accent;ctx.fillRect(x,y,5,cardH);
      if(portraits.complete&&portraits.naturalWidth>0){
        const rect=portraitSourceRect(portraits,portraitIndex(hero.id));
        ctx.save();ctx.beginPath();ctx.rect(x+14,y+14,84,84);ctx.clip();
        ctx.drawImage(portraits,rect.sx,rect.sy,rect.sw,rect.sh,x+14,y+14,84,84);ctx.restore();
        ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.strokeRect(x+14,y+14,84,84);
      }
      text(hero.name,x+112,y+31,29,"#f4e7ca",true,375);
      text("Lv "+hero.level+" · "+hero.role.toUpperCase(),x+112,y+60,23,accent,true,310);
      text((hero.floor===null?"":("F"+hero.floor+" · "))+rosterActivityLabel(hero),x+424,y+30,22,
        hero.status==="combat"?"#eac089":"#d5e0d4",true,274);
      if(hero.party.length>1)text("PARTY · "+hero.party.length,x+424,y+59,21,"#c4bb9a",false,260);
      const weapon=gearFromName(hero.equipment.weapon),armor=gearFromName(hero.equipment.armor);
      const weaponLabel=weapon?.label??"Unarmed";
      const armorLabel=armor?"T"+armor.tier+" vest":"No armor";
      text(weaponLabel+"  /  "+armorLabel,x+112,y+90,22,
        weapon?.tier===2||armor?.tier===2?"#d2b27d":"#b8c7bf",false,428);
      text(Math.round(hp)+"/"+max+" HP",x+543,y+90,22,critical(hero)?"#ffad99":"#e0e8d6",true,155);
      ctx.fillStyle="#111b1b";ctx.fillRect(x+112,y+109,580,11);
      ctx.fillStyle=ratio<=.3?"#df7562":ratio<=.6?"#d0af64":"#83c6a2";
      ctx.fillRect(x+112,y+109,580*ratio,11);
    });
    text(active.length>10?"+"+(active.length-10)+" more in roster":"All active heroes shown",44,926,24,"#bac9be");
    text("E / R  ·  OPEN ROSTER",1050,926,24,"#f0d4a1",true);
    texture.update();
  }
  // No full texture repaint per combat tick. Checkpoint revisions are
  // sampled at most once per game second, with immediate roster changes.
  let previousDay=-1,previousTick=-1;
  let previousHeroes:typeof store.state.adventurers|null=null;
  const redrawOnContentChange=()=>{
    const state=store.state;
    if(state.day===previousDay&&state.adventurers===previousHeroes&&
      state.worldClock.tick>=previousTick&&state.worldClock.tick-previousTick<20)return;
    previousDay=state.day;previousTick=state.worldClock.tick;previousHeroes=state.adventurers;
    draw();
  };
  store.subscribe(redrawOnContentChange);
  redrawOnContentChange();
  return { mesh: board };
}
