import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { furnitureFacing } from "./game/furnitureFacing.ts";
import { classifyFurnitureMesh, type LookedAtFurniture } from "./game/furnitureSelection.ts";
import { shopServiceReachabilityProblem } from "./game/shopServiceReachability.ts";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { GameStore } from "./game/gameStore.ts";
import {
  counterOverlapsActor,getCounterPlacement,replaceCounterPlacement,
  replaceShelfPlacement,rotateShelfOffset,shelfOverlapsActor,
} from "./game/shopLayout.ts";
import {
  blueprintAtSurface,FURNITURE_CATALOG,surfaceFromMesh,
  type FurnitureId,type FurnitureDraft,
} from "./game/furnitureBlueprint.ts";

/** FPS-compatible interactive furniture editor.
 *
 * Ray targets come from actual world geometry, not typed X/Z coordinates.
 * Ghosts are independent meshes: they never move real furniture, collide,
 * block NPC navigation, or mutate a game save until the left-click commit.
 */
export function setupBlueprintHud(
  canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,
  canEdit:()=>boolean=()=>true,
):{close:()=>void;open:()=>void}{
  const scene=camera.getScene();
  const openButton=document.querySelector<HTMLButtonElement>("#open-blueprint")!;
  const panel=document.createElement("aside");
  panel.id="blueprint-panel";
  panel.hidden=true;
  panel.setAttribute("aria-label","Furniture blueprint placement");
  const title=document.createElement("h2");
  title.textContent="MOVE FURNITURE";
  const hint=document.createElement("p");
  hint.textContent="Aim at a new floor or wall position. Left click places the object; right click cancels.";
  const status=document.createElement("p");
  status.className="blueprint-status";
  status.setAttribute("role","status");
  const facingReadout=document.createElement("p");
  facingReadout.id="blueprint-facing";
  facingReadout.setAttribute("aria-live","polite");
  const controls=document.createElement("p");
  controls.className="blueprint-controls";
  controls.textContent="Mouse Look 360° · R Rotate 90° · LMB Place · RMB / Esc Cancel";
  const cancel=document.createElement("button");
  cancel.type="button";
  cancel.textContent="Exit placement";
  panel.append(title,hint,facingReadout,status,controls,cancel);
  document.body.append(panel);

  const validMaterial=new StandardMaterial("blueprint-valid",scene);
  validMaterial.diffuseColor=new Color3(0.23,0.91,0.56);
  validMaterial.emissiveColor=new Color3(0.1,0.35,0.19);
  validMaterial.alpha=0.4;
  validMaterial.wireframe=true;
  validMaterial.disableLighting=true;
  const invalidMaterial=new StandardMaterial("blueprint-invalid",scene);
  invalidMaterial.diffuseColor=new Color3(0.99,0.25,0.22);
  invalidMaterial.emissiveColor=new Color3(0.4,0.1,0.1);
  invalidMaterial.alpha=0.4;
  invalidMaterial.wireframe=true;
  invalidMaterial.disableLighting=true;
  // Move a recognizable mesh silhouette, not a symmetric anonymous cuboid.
  // The golden arrow ALWAYS indicates the customer-facing side. All pieces
  // are visual-only; the saved footprint remains the authoritative geometry.
  const ghost=new TransformNode("blueprint-preview-root",scene);
  const parts:{mesh:import("@babylonjs/core/Meshes/mesh").Mesh;
    type:"shelf"|"counter";direction?:boolean}[]=[];
  const previewBox=(
    name:string,width:number,height:number,depth:number,
    x:number,y:number,z:number,type:"shelf"|"counter",direction=false,
  )=>{
    const mesh=MeshBuilder.CreateBox(name,{width,height,depth},scene);
    mesh.parent=ghost;
    mesh.position.set(x,y,z);
    mesh.isPickable=false;mesh.checkCollisions=false;
    mesh.renderingGroupId=2;
    parts.push({mesh,type,direction});
    return mesh;
  };
  // Shelf: back, plank and five distinct cubbies expose the usable +X side.
  previewBox("blueprint-shelf-back",0.18,2,5.8,0,1.35,0,"shelf");
  previewBox("blueprint-shelf-plank",1.2,0.18,5.8,0.48,0.65,0,"shelf");
  for(let idx=0;idx<5;idx++){
    previewBox("blueprint-slot-"+idx,0.76,0.14,0.78,
      0.48,0.82,idx-2,"shelf");
  }
  // Counter: visible top and raised register establish the back of the till.
  previewBox("blueprint-counter-body",1.75,1.15,1.15,0,0.68,0,"counter");
  previewBox("blueprint-counter-top",2,0.14,1.35,0,1.32,0,"counter");
  previewBox("blueprint-counter-register",0.62,0.30,0.5,0.35,1.55,0,"counter");
  // Asymmetric directional shafts and tips survive every quarter turn.
  previewBox("blueprint-shelf-front-shaft",0.55,0.12,0.12,
    1.22,1.8,0,"shelf",true);
  const shelfTip=MeshBuilder.CreateCylinder("blueprint-shelf-front-arrow",
    {height:0.56,diameterTop:0,diameterBottom:0.4,tessellation:4},scene);
  shelfTip.parent=ghost;shelfTip.position.set(1.62,1.8,0);
  shelfTip.rotation.z=-Math.PI/2;
  shelfTip.isPickable=false;shelfTip.checkCollisions=false;
  shelfTip.renderingGroupId=2;parts.push({mesh:shelfTip,type:"shelf",direction:true});
  previewBox("blueprint-counter-front-shaft",0.12,0.12,0.53,
    0,1.76,-1.05,"counter",true);
  const counterTip=MeshBuilder.CreateCylinder("blueprint-counter-front-arrow",
    {height:0.56,diameterTop:0,diameterBottom:0.4,tessellation:4},scene);
  counterTip.parent=ghost;counterTip.position.set(0,1.76,-1.43);
  counterTip.rotation.x=-Math.PI/2;
  counterTip.isPickable=false;counterTip.checkCollisions=false;
  counterTip.renderingGroupId=2;parts.push({mesh:counterTip,type:"counter",direction:true});
  const facingMaterial=new StandardMaterial("blueprint-facing-arrow",scene);
  facingMaterial.diffuseColor=new Color3(1,0.74,0.17);
  facingMaterial.emissiveColor=new Color3(0.7,0.42,0.05);
  facingMaterial.alpha=0.95;
  facingMaterial.disableLighting=true;
  ghost.setEnabled(false);

  // A distinct outline highlights an object under the crosshair before P.
  // It is only a visual overlay: no collision or authoritative position change.
  const focusMaterial=new StandardMaterial("furniture-focus",scene);
  focusMaterial.diffuseColor=new Color3(0.9,0.69,0.3);
  focusMaterial.emissiveColor=new Color3(0.65,0.42,0.17);
  focusMaterial.alpha=0.5;
  focusMaterial.wireframe=true;
  focusMaterial.disableLighting=true;
  const focusMesh=MeshBuilder.CreateBox("furniture-focus-outline",{size:1},scene);
  focusMesh.material=focusMaterial;
  focusMesh.isPickable=false;
  focusMesh.checkCollisions=false;
  focusMesh.setEnabled(false);
  const focusHint=document.createElement("div");
  focusHint.id="furniture-look-prompt";
  focusHint.hidden=true;
  document.body.append(focusHint);
  let lookedAt:LookedAtFurniture|null=null;

  let enabled=false;
  let activeId:FurnitureId="shelf-1";
  let rotation:0|1|2|3=0;
  let draft:FurnitureDraft|null=null;
  let placeable=false;
  let reason="Aim at a floor or wall to place the blueprint.";


  const updateStatus=(message:string,valid:boolean):void=>{
    if(status.textContent!==message)status.textContent=message;
    status.dataset.valid=String(valid);
  };
  const getSaved=(id:FurnitureId):FurnitureDraft=>{
    if(id==="counter")return {id,...getCounterPlacement(store.state.shopLayout)};
    return store.state.shopLayout.shelves.find(item=>item.id===id)!;
  };
  const choose=(id:FurnitureId):void=>{
    activeId=id;
    rotation=getSaved(id).rotation;
    title.textContent="MOVE · "+
      (FURNITURE_CATALOG.find(def=>def.id===id)?.label??"Furniture");
    draft=null;
    updateStatus("Aim at a "+(id==="counter"?"floor":"floor or wall")+".",false);
  };
  /** Only raycast-pick existing furniture. The nearest ordinary hit must
   * not be substantially closer: characters and walls occlude objects. */
  const lookAtFurniture=():LookedAtFurniture|null=>{
    const ray=camera.getForwardRay(5);
    const target=scene.pickWithRay(ray,mesh=>
      mesh.isPickable && classifyFurnitureMesh(mesh.name)!==null);
    if(!target?.hit||!target.pickedMesh)return null;
    const nearest=scene.pickWithRay(ray,mesh=>mesh.isPickable &&
      mesh.name!=="furniture-focus-outline"&&mesh.name!=="blueprint-preview");
    if(nearest?.hit&&nearest.distance<target.distance-0.1)return null;
    return classifyFurnitureMesh(target.pickedMesh.name);
  };
  const updateHover=():void=>{
    if(enabled||!canEdit()||document.querySelector("dialog[open]")){
      focusMesh.setEnabled(false);focusHint.hidden=true;lookedAt=null;return;
    }
    const found=lookAtFurniture();
    lookedAt=found;
    if(!found){focusMesh.setEnabled(false);focusHint.hidden=true;return;}
    const dimensions=found.bounds;
    let x=found.position.x,y=found.position.y,z=found.position.z;
    let turns=0;
    if(found.movableId){
      const saved=getSaved(found.movableId);
      x=saved.x;z=saved.z;turns=saved.rotation;
      if(found.movableId!=="counter"){
        const offset=rotateShelfOffset(0.48,0,saved.rotation);
        x+=offset.x;z+=offset.z;
      }
    }
    focusMesh.position.set(x,y,z);
    focusMesh.scaling.set(dimensions.width,dimensions.height,dimensions.depth);
    focusMesh.rotation.y=turns*Math.PI/2;
    focusMesh.setEnabled(true);
    focusHint.textContent=found.movableId
      ?found.label+" · P to move"
      :found.label+" · Fixed until modular furniture is enabled";
    focusHint.hidden=false;
  };

  const occupiedBy=(p:FurnitureDraft):string|null=>{
    const hits=(x:number,z:number,radius:number)=>p.id==="counter"
      ?counterOverlapsActor(p,{x,z,radius})
      :shelfOverlapsActor(p,{x,z,radius});
    if(hits(camera.position.x,camera.position.z,0.45))
      return "Player is standing inside the furniture footprint.";
    const occupied=scene.transformNodes.some(node=>
      node.name.startsWith("npc-adventurer-")&&node.metadata?.adventurerId&&
      hits(node.position.x,node.position.z,0.45));
    return occupied?"A visitor is standing in the placement area.":null;
  };
  const placementError=(p:FurnitureDraft):string|null=>{
    const check=p.id==="counter"
      ?replaceCounterPlacement(store.state.shopLayout,p)
      :replaceShelfPlacement(store.state.shopLayout,p);
    const good=p.id==="counter"?"Counter placement saved.":"Shelf placement saved.";
    if(check.layout===store.state.shopLayout&&check.message!==good)return check.message;
    if(check.layout!==store.state.shopLayout){
      const reachability=shopServiceReachabilityProblem(check.layout);
      if(reachability)return reachability;
    }
    return occupiedBy(p);
  };

  const updateGhost=():void=>{
    if(!enabled)return;
    if(document.querySelector("dialog[open]")){close();return;}
    // FPS targeting stays on the crosshair even when the camera turns.
    // No screen-coordinate cursor state or detaching the Babylon camera.
    const hit=scene.pickWithRay(camera.getForwardRay(16),
      mesh=>surfaceFromMesh(mesh.name)!==null);
    const surface=hit?.pickedMesh?surfaceFromMesh(hit.pickedMesh.name):null;
    if(!surface||!hit?.pickedPoint){
      draft=null;placeable=false;ghost.setEnabled(false);
      facingReadout.textContent="Facing: not positioned";
      updateStatus("Aim at the "+(activeId==="counter"?"floor":"floor or a wall")+".",false);
      return;
    }
    const p=blueprintAtSurface(activeId,surface,hit.pickedPoint,rotation);
    if(!p){
      draft=null;placeable=false;ghost.setEnabled(false);
      facingReadout.textContent="Facing: unsupported mount";
      updateStatus("This furniture cannot be mounted on that surface.",false);
      return;
    }
    draft=p;
    ghost.position.set(p.x,0,p.z);
    ghost.rotation.y=p.rotation*Math.PI/2;
    const type=p.id==="counter"?"counter":"shelf";
    for(const part of parts){
      part.mesh.setEnabled(part.type===type);
      part.mesh.material=part.direction?facingMaterial:
        (placementError(p)?invalidMaterial:validMaterial);
    }
    const front=furnitureFacing(p.id,p.rotation);
    facingReadout.textContent="FRONT → "+front.label.toUpperCase()+
      "  ·  "+(p.rotation*90)+"°"+
      (surface==="floor"?" · R rotates 90°":" · wall-aligned");
    reason=placementError(p)??"Valid placement. Left click to confirm.";
    placeable=reason==="Valid placement. Left click to confirm.";
    for(const part of parts){
      if(!part.direction)part.mesh.material=placeable?validMaterial:invalidMaterial;
    }
    ghost.setEnabled(true);
    updateStatus(reason,placeable);
  };

  const close=():void=>{
    if(!enabled)return;
    enabled=false;panel.hidden=true;draft=null;placeable=false;
    ghost.setEnabled(false);
  };
  const open=():void=>{
    if(enabled){close();return;}
    if(!canEdit()||document.querySelector("dialog[open]"))return;
    const found=lookAtFurniture();
    if(!found){
      focusHint.textContent="Look directly at a piece of furniture, then press P.";
      focusHint.hidden=false;
      return;
    }
    if(!found.movableId){
      focusHint.textContent=found.label+
        " is registered. Its support/collisions must become modular before it can be moved.";
      focusHint.hidden=false;
      return;
    }
    enabled=true;panel.hidden=false;
    focusMesh.setEnabled(false);focusHint.hidden=true;
    // Retain pointer lock and the attached FPS camera while positioning.
    // P comes from a key gesture and can acquire lock if first-person mode
    // was not active; RMB/Esc cancels without sacrificing camera controls.
    choose(found.movableId);
    if(document.pointerLockElement!==canvas)void canvas.requestPointerLock()
      .catch(()=>{updateStatus("Click the game to enable free camera look.",false);});
    updateGhost();
  };
  const commit=():void=>{
    updateGhost();
    if(!draft||!placeable)return;
    // Revalidate on the same input event that changes the authoritative state.
    const validation=placementError(draft);
    if(validation){updateStatus(validation,false);return;}
    const result=draft.id==="counter"?store.placeCounter(draft):store.placeShelf(draft);
    if(result==="Counter placement saved."||result==="Shelf placement saved."){
      close();
    }else updateStatus(result,false);
  };

  openButton.addEventListener("click",open);
  cancel.addEventListener("click",close);
  // Capture before ordinary shelf stocking and register interaction handlers.
  canvas.addEventListener("pointerdown",event=>{
    if(!enabled)return;
    if(event.button!==0&&event.button!==2)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(event.button===2)close();
    else commit();
  },true);
  canvas.addEventListener("contextmenu",event=>{
    if(enabled){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  window.addEventListener("keydown",event=>{
    if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.code==="KeyP"&&!event.shiftKey){
      event.preventDefault();event.stopImmediatePropagation();open();
      return;
    }
    if(!enabled)return;
    if(event.code==="KeyR"){
      event.preventDefault();event.stopImmediatePropagation();
      rotation=((rotation+1)%4) as 0|1|2|3;
      updateGhost();return;
    }
    if(event.code==="Escape"){
      event.preventDefault();event.stopImmediatePropagation();
      close();
    }
  },true);
  scene.onBeforeRenderObservable.add(()=>{updateHover();updateGhost();});
  return {open,close};
}
