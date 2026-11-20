import {Engine} from "@babylonjs/core/Engines/engine";
import type {Scene} from "@babylonjs/core/scene";

export type RenderAblation="baseline"|"skip-scene-render"|"half-resolution"|
  "disable-point-lights"|"hide-world-meshes"|"hide-stock-and-furniture";
let restoreActive:()=>void=()=>{};
const scene=():Scene=>{
  const result=Engine.LastCreatedScene;
  if(!result)throw Error("No active Babylon test scene");
  return result;
};
export function applyRenderAblation(mode:RenderAblation){
  restoreActive();
  const shop=scene();
  const engine=shop.getEngine();
  const oldScaling=engine.getHardwareScalingLevel();
  const restores:(()=>void)[]=[];
  if(mode==="skip-scene-render"){
    const oldRender=shop.render;
    shop.render=function(_updateCameras?:boolean,_ignoreAnimations?:boolean):void{};
    restores.push(()=>{shop.render=oldRender;});
  }
  if(mode==="half-resolution"){
    engine.setHardwareScalingLevel(2);
    engine.resize();
    restores.push(()=>{engine.setHardwareScalingLevel(oldScaling);engine.resize();});
  }
  if(mode==="disable-point-lights"){
    const pointLights=shop.lights.filter(light=>light.getClassName()==="PointLight");
    const wasOn=pointLights.map(light=>light.isEnabled());
    pointLights.forEach(light=>light.setEnabled(false));
    restores.push(()=>pointLights.forEach((light,index)=>light.setEnabled(wasOn[index])));
  }
  if(mode==="hide-world-meshes"){
    const meshes=shop.meshes.filter(mesh=>!mesh.name.startsWith("npc-"));
    const wasVisible=meshes.map(mesh=>mesh.isVisible);
    meshes.forEach(mesh=>{mesh.isVisible=false;});
    restores.push(()=>meshes.forEach((mesh,index)=>{mesh.isVisible=wasVisible[index];}));
  }
  if(mode==="hide-stock-and-furniture"){
    const meshes=shop.meshes.filter(mesh=>/^(?:shop-stock-|shelf-|bedroom-|cavern-|torch-)/.test(mesh.name));
    const wasVisible=meshes.map(mesh=>mesh.isVisible);
    meshes.forEach(mesh=>{mesh.isVisible=false;});
    restores.push(()=>meshes.forEach((mesh,index)=>{mesh.isVisible=wasVisible[index];}));
  }
  restoreActive=()=>{for(const reset of restores.reverse())reset();};
  const metaEngine=engine as unknown as {getGlInfo?:()=>unknown};
  return {
    mode,
    frameBuffer:{w:engine.getRenderWidth(),h:engine.getRenderHeight()},
    scaling:engine.getHardwareScalingLevel(),
    sceneMeshes:shop.meshes.length,
    activeMeshes:shop.getActiveMeshes().length,
    materials:shop.materials.length,
    textures:shop.textures.length,
    lights:shop.lights.length,
    lit:shop.lights.filter(light=>light.isEnabled()).length,
    triangles:Math.round(shop.getActiveIndices()/3),
    totalVertices:shop.getTotalVertices(),
    glInfo:metaEngine.getGlInfo?.()??null,
  };
}
export function restoreRenderAblation():void{
  restoreActive();
  restoreActive=()=>{};
}
