import {DynamicTexture} from "@babylonjs/core/Materials/Textures/dynamicTexture";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import type {Scene} from "@babylonjs/core/scene";

/** One shared illustrated map sigil, NOT an additional skinned Ghoul.
 * No model loading, animation/combat motor or per-frame canvas costs. */
export function createGhoulMapIconMaterial(scene:Scene):StandardMaterial {
  const tex=new DynamicTexture("dungeon-ghoul-map-portrait-texture",
    {width:128,height:128},scene,false);
  const ctx=tex.getContext();
  ctx.clearRect(0,0,128,128);
  ctx.fillStyle="#0c171a";
  ctx.beginPath();ctx.arc(64,62,57,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#ba7559";ctx.lineWidth=5;
  ctx.beginPath();ctx.arc(64,62,55,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle="#243e37";
  ctx.beginPath();ctx.arc(64,62,45,0,Math.PI*2);ctx.fill();
  // An immediately recognisable hunched Ghoul bust with elongated claws.
  ctx.fillStyle="#536b57";
  ctx.beginPath();ctx.moveTo(18,105);ctx.lineTo(38,72);
  ctx.lineTo(43,62);ctx.lineTo(86,62);ctx.lineTo(93,76);
  ctx.lineTo(112,105);ctx.lineTo(88,112);ctx.lineTo(70,100);
  ctx.lineTo(49,99);ctx.lineTo(32,112);ctx.closePath();ctx.fill();
  ctx.fillStyle="#7b9477";
  ctx.beginPath();ctx.moveTo(42,39);ctx.lineTo(46,24);
  ctx.lineTo(57,33);ctx.lineTo(72,31);ctx.lineTo(85,23);
  ctx.lineTo(89,42);ctx.lineTo(84,65);ctx.lineTo(73,77);
  ctx.lineTo(57,77);ctx.lineTo(42,65);ctx.closePath();ctx.fill();
  ctx.fillStyle="#132a27";
  ctx.beginPath();ctx.moveTo(34,47);ctx.lineTo(45,43);ctx.lineTo(48,56);
  ctx.lineTo(34,55);ctx.fill();
  ctx.beginPath();ctx.moveTo(81,43);ctx.lineTo(94,47);
  ctx.lineTo(94,56);ctx.lineTo(80,57);ctx.fill();
  ctx.fillStyle="#f4ad64";
  ctx.beginPath();ctx.moveTo(47,51);ctx.lineTo(59,55);
  ctx.lineTo(57,59);ctx.lineTo(48,57);ctx.fill();
  ctx.beginPath();ctx.moveTo(81,51);ctx.lineTo(69,55);
  ctx.lineTo(71,59);ctx.lineTo(80,57);ctx.fill();
  ctx.fillStyle="#26342d";
  ctx.fillRect(59,66,13,4);
  ctx.fillStyle="#d4a78b";
  for(const x of [57,63,69]){
    ctx.beginPath();ctx.moveTo(x,69);ctx.lineTo(x+3,75);
    ctx.lineTo(x+5,69);ctx.fill();
  }
  // Long, crooked fingers establish silhouette even at small map zoom.
  ctx.strokeStyle="#bbbd83";ctx.lineWidth=3;
  for(const side of [-1,1]){
    const x=side<0?26:102;
    for(let index=0;index<3;index++){
      ctx.beginPath();ctx.moveTo(x,95);
      ctx.lineTo(x+side*(9+index*3),80-index*6);ctx.stroke();
    }
  }
  tex.update();
  tex.hasAlpha=true;
  const mat=new StandardMaterial("dungeon-ghoul-icon-material",scene);
  mat.diffuseTexture=tex;
  mat.emissiveColor=new Color3(.35,.37,.31);
  mat.backFaceCulling=false;
  mat.useAlphaFromDiffuseTexture=true;
  mat.disableLighting=true;
  return mat;
}
