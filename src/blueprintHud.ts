import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import {uiIcon,setIconButton} from "./uiIcons.ts";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { furnitureFacing } from "./game/furnitureFacing.ts";
import { createBlueprintPreviewValidator } from "./game/blueprintPreviewValidator.ts";
import {getBedroomFurniture,isBedroomFurnitureId,
  type BedroomFurnitureId} from "./game/bedroomFurniture.ts";
import {furnitureTouchesActor,SHELF_SLOT_COUNT,shelfSlotLocalZ} from "./game/furnitureRegistry.ts";
import { classifyFurnitureMesh, type LookedAtFurniture } from "./game/furnitureSelection.ts";

import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { GameStore } from "./game/gameStore.ts";
import {getCounterPlacement,isShelfId,nextShelfId} from "./game/shopLayout.ts";
import {turnShopOffset} from "./game/furnitureRegistry.ts";
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
  const buildShelfButton=document.querySelector<HTMLButtonElement>("#build-shelf");
  const buildPortraitButton=document.querySelector<HTMLButtonElement>("#build-portrait");
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
  controls.textContent="Mouse Look 360° · Q / R Rotate · LMB Place · RMB / Esc Cancel";
  controls.prepend(uiIcon("rotate"));
  const cancel=document.createElement("button");
  cancel.type="button";
  cancel.textContent="Exit placement";
  setIconButton(cancel,"close");
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
  // Route checks are deliberately delayed while the crosshair is moving.
  // Amber means the draft is not yet verified, never "safe to place".
  const checkingMaterial=new StandardMaterial("blueprint-checking",scene);
  checkingMaterial.diffuseColor=new Color3(0.91,0.69,0.21);
  checkingMaterial.emissiveColor=new Color3(0.4,0.26,0.05);
  checkingMaterial.alpha=0.4;
  checkingMaterial.wireframe=true;
  checkingMaterial.disableLighting=true;
  // Move a recognizable mesh silhouette, not a symmetric anonymous cuboid.
  // The golden arrow ALWAYS indicates the customer-facing side. All pieces
  // are visual-only; the saved footprint remains the authoritative geometry.
  const ghost=new TransformNode("blueprint-preview-root",scene);
  type GhostType="shelf"|"counter"|BedroomFurnitureId|"adventurer-board"|"galvik-portrait";
  const parts:{mesh:import("@babylonjs/core/Meshes/mesh").Mesh;
    type:GhostType;direction?:boolean}[]=[];
  const previewBox=(
    name:string,width:number,height:number,depth:number,
    x:number,y:number,z:number,type:GhostType,direction=false,
  )=>{
    const mesh=MeshBuilder.CreateBox(name,{width,height,depth},scene);
    mesh.parent=ghost;
    mesh.position.set(x,y,z);
    mesh.isPickable=false;mesh.checkCollisions=false;
    mesh.renderingGroupId=2;
    parts.push({mesh,type,direction});
    return mesh;
  };
  // All newly built shelves share the same four-position compact silhouette.
  previewBox("blueprint-shelf-back",0.15,1.5,3.0,0,0.85,0,"shelf");
  previewBox("blueprint-shelf-plank",1.0,0.14,3.0,0.42,0.52,0,"shelf");
  for(let idx=0;idx<SHELF_SLOT_COUNT;idx++){
    previewBox("blueprint-slot-"+idx,0.65,0.12,0.61,
      0.44,0.66,shelfSlotLocalZ(idx),"shelf");
  }
  // Counter: visible top and raised register establish the back of the till.
  previewBox("blueprint-counter-body",1.35,0.84,0.75,0,0.42,0,"counter");
  previewBox("blueprint-counter-top",1.55,0.12,0.93,0,0.90,0,"counter");
  previewBox("blueprint-counter-register",0.49,0.17,0.39,0.28,1.05,0.04,"counter");
  // Bedroom modules include visible silhouettes, not generic wire cubes.
  previewBox("blueprint-desk-top",1.18,0.12,0.76,0,0.95,0,"desk");
  for(const x of [-0.45,0.45])for(const z of [-0.27,0.27])
    previewBox("blueprint-desk-leg",0.1,0.8,0.1,x,0.45,z,"desk");
  previewBox("blueprint-desk-book",0.65,0.09,0.42,-0.01,1.09,-0.06,"desk");
  previewBox("blueprint-chest-body",1.0,0.72,0.62,0,0.36,0,"chest");
  previewBox("blueprint-chest-lid",1.04,0.12,0.72,0,0.77,0,"chest");
  previewBox("blueprint-chest-clasp",0.15,0.17,0.05,0,0.48,0.35,"chest");
  previewBox("blueprint-stool",0.58,0.6,0.58,0,0.30,0,"candle");
  previewBox("blueprint-candle",0.14,0.28,0.14,0,0.84,0,"candle");
  previewBox("blueprint-candle-flame",0.12,0.16,0.12,0,1.04,0,"candle");
  // The mattress includes headboard and footboard so rotation is obvious.
  previewBox("blueprint-bed-frame",1.74,0.4,2.4,0,0.35,0,"bed");
  previewBox("blueprint-bed-mattress",1.5,0.24,2.05,0,0.62,0,"bed");
  previewBox("blueprint-bed-headboard",1.74,1.1,0.2,0,0.8,-1.18,"bed");
  previewBox("blueprint-bed-pillow",1.05,0.15,0.4,0,0.82,-0.85,"bed");
  previewBox("blueprint-bed-foot",1.74,0.55,0.15,0,0.5,1.17,"bed");
  // A vertical wall-mounted roster with an obvious front, not a floor cube.
  previewBox("blueprint-roster-board-face",3.25,2.02,0.09,0,2.17,0,"adventurer-board");
  previewBox("blueprint-roster-board-frame-top",3.4,0.12,0.15,0,3.22,0,"adventurer-board");
  previewBox("blueprint-roster-board-frame-bottom",3.4,0.12,0.15,0,1.12,0,"adventurer-board");
  for(const side of [-1,1])
    previewBox("blueprint-roster-board-frame-side",0.12,2.09,0.15,
      side*1.69,2.17,0,"adventurer-board");
  // The same 1.08m framed portrait silhouette appears while wall targeting.
  previewBox("blueprint-portrait-canvas",.98,1.16,.045,
    0,2.15,0,"galvik-portrait");
  for(const side of [-1,1]){
    previewBox("blueprint-portrait-frame-side",.08,1.3,.12,
      side*.52,2.15,0,"galvik-portrait");
    previewBox("blueprint-portrait-frame-edge",1.08,.08,.12,
      0,2.15+side*.63,0,"galvik-portrait");
  }
  // Asymmetric directional shafts and tips survive every quarter turn.
  previewBox("blueprint-shelf-front-shaft",0.40,0.12,0.12,
    1.05,1.42,0,"shelf",true);
  const shelfTip=MeshBuilder.CreateCylinder("blueprint-shelf-front-arrow",
    {height:0.56,diameterTop:0,diameterBottom:0.4,tessellation:4},scene);
  shelfTip.parent=ghost;shelfTip.position.set(1.42,1.42,0);
  shelfTip.rotation.z=-Math.PI/2;
  shelfTip.isPickable=false;shelfTip.checkCollisions=false;
  shelfTip.renderingGroupId=2;parts.push({mesh:shelfTip,type:"shelf",direction:true});
  previewBox("blueprint-counter-front-shaft",0.12,0.12,0.39,
    0,1.32,-0.75,"counter",true);
  const counterTip=MeshBuilder.CreateCylinder("blueprint-counter-front-arrow",
    {height:0.56,diameterTop:0,diameterBottom:0.4,tessellation:4},scene);
  counterTip.parent=ghost;counterTip.position.set(0,1.32,-1.08);
  counterTip.rotation.x=-Math.PI/2;
  counterTip.isPickable=false;counterTip.checkCollisions=false;
  counterTip.renderingGroupId=2;parts.push({mesh:counterTip,type:"counter",direction:true});
  for(const kind of ["desk","chest","candle","bed"] as const){
    previewBox("blueprint-"+kind+"-front",0.16,0.12,0.35,
      0,1.3,0.55,kind,true);
  }
  previewBox("blueprint-board-facing",0.15,0.15,0.55,
    0,2.16,-0.48,"adventurer-board",true);
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
  let activeId:FurnitureId="counter";
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
    if(id==="adventurer-board")return {id,...store.state.rosterBoard};
    if(id==="galvik-portrait")return {id,...store.state.wallPortrait!};
    if(isBedroomFurnitureId(id))return getBedroomFurniture(store.state.bedroomFurniture,id);
    return store.state.shopLayout.shelves.find(item=>item.id===id)!;
  };
  const choose=(id:FurnitureId):void=>{
    activeId=id;
    rotation=getSaved(id).rotation;
    title.textContent="MOVE · "+
      (isShelfId(id)?`Shelf ${id.slice(6)}`:
        FURNITURE_CATALOG.find(def=>def.id===id)?.label??"Furniture");
    draft=null;
    updateStatus(id==="adventurer-board"||id==="galvik-portrait"?"Aim at a free shop wall.":
      "Aim at a "+(id==="counter"||isBedroomFurnitureId(id)?"floor":"floor or wall")+".",false);
  };
  /** Only raycast-pick existing furniture. The nearest ordinary hit must
   * not be substantially closer: characters and walls occlude objects. */
  const lookAtFurniture=():LookedAtFurniture|null=>{
    const ray=camera.getForwardRay(5);
    const target=scene.pickWithRay(ray,mesh=>
      mesh.isEnabled()&&mesh.isPickable &&
        classifyFurnitureMesh(mesh.name)!==null);
    if(!target?.hit||!target.pickedMesh)return null;
    const nearest=scene.pickWithRay(ray,mesh=>mesh.isPickable &&
      mesh.isEnabled()&&mesh.name!=="furniture-focus-outline"&&
        mesh.name!=="blueprint-preview");
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
    const saved=getSaved(found.movableId);
    let x=saved.x,z=saved.z;
    if(isShelfId(found.movableId)){
      const offset=turnShopOffset(0.48,0,saved.rotation);
      x+=offset.x;z+=offset.z;
    }
    focusMesh.position.set(x,found.focusY,z);
    focusMesh.scaling.set(dimensions.width,dimensions.height,dimensions.depth);
    focusMesh.rotation.y=saved.rotation*Math.PI/2;
    focusMesh.setEnabled(true);
    focusHint.textContent=found.label+" · P to move";
    focusHint.hidden=false;
  };

  const occupiedBy=(p:FurnitureDraft):string|null=>{
    const hits=(x:number,z:number,radius:number)=>
      furnitureTouchesActor(p,{x,z,radius});
    if(hits(camera.position.x,camera.position.z,0.45))
      return "Player is standing inside the furniture footprint.";
    const occupied=scene.transformNodes.some(node=>
      node.name.startsWith("npc-adventurer-")&&node.metadata?.adventurerId&&
      hits(node.position.x,node.position.z,0.45));
    return occupied?"A visitor is standing in the placement area.":null;
  };
  // The expensive service reachability check runs at most once per snapped
  // draft after the camera settles, not once per ghost mesh every frame.
  // The cache is invalidated whenever the committed furniture or mined room
  // changes; live player/NPC occupancy is checked independently each frame.
  const validator=createBlueprintPreviewValidator(p=>
    store.previewFurniturePlacement(p));

  const updateGhost=(immediate=false):void=>{
    if(!enabled)return;
    if(document.querySelector("dialog[open]")){close();return;}
    const facing=furnitureFacing(activeId,rotation);
    const facingLabel="FRONT → "+facing.label.toUpperCase()+
      "  ·  "+(rotation*90)+"°";
    facingReadout.textContent=facingLabel;
    // FPS targeting stays on the crosshair even when the camera turns.
    // No screen-coordinate cursor state or detaching the Babylon camera.
    // Mining creates real pickable floor beyond the initial ±7.5m cave.
    // A short ray (formerly 16m) made the ghost stop at the old boundary
    // until Galvik physically walked into the expansion. Target any visible
    // surface across the enlarged room; actual support and routes still
    // decide whether placement is allowed.
    const hit=scene.pickWithRay(camera.getForwardRay(48),
      // Babylon still passes disabled legacy side walls to the picking
      // predicate. Those hidden walls were stealing the ray at x=±7.3
      // even after mining exposed the floor behind them.
      mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.isPickable&&
        surfaceFromMesh(mesh.name)!==null);
    const surface=hit?.pickedMesh?surfaceFromMesh(hit.pickedMesh.name):null;
    if(!surface||!hit?.pickedPoint){
      draft=null;placeable=false;ghost.setEnabled(false);
      facingReadout.textContent=facingLabel+" · aim at a surface";
      updateStatus(activeId==="adventurer-board"||activeId==="galvik-portrait"?"Aim at a shop wall.":
        "Aim at the "+(activeId==="counter"||isBedroomFurnitureId(activeId)?"floor":"floor or a wall")+".",false);
      return;
    }
    const p=blueprintAtSurface(activeId,surface,hit.pickedPoint,
      rotation,store.state.level5Room);
    if(!p){
      draft=null;placeable=false;ghost.setEnabled(false);
      facingReadout.textContent=facingLabel+" · unsupported mount";
      updateStatus("This furniture cannot be mounted on that surface.",false);
      return;
    }
    draft=p;
    ghost.position.set(p.x,0,p.z);
    ghost.rotation.y=p.rotation*Math.PI/2;
    const type:GhostType=p.id==="counter"?"counter":
      p.id==="adventurer-board"?"adventurer-board":
      p.id==="galvik-portrait"?"galvik-portrait":
      isBedroomFurnitureId(p.id)?p.id:"shelf";
    const state=store.state;
    const staticCheck=validator.evaluate(p,state.shopLayout,state.level5Room,
      performance.now(),immediate,
      p.id==="adventurer-board"||p.id==="galvik-portrait"?
        state.rosterBoard:state.bedroomFurniture);
    const occupied=occupiedBy(p);
    const isChecking=!staticCheck.ready&&!occupied;
    reason=occupied??(staticCheck.ready
      ?staticCheck.problem??"Valid placement. Left click to confirm."
      :"Checking customer routes…");
    placeable=staticCheck.ready&&!occupied&&!staticCheck.problem;
    const bodyMaterial=isChecking?checkingMaterial:
      placeable?validMaterial:invalidMaterial;
    for(const part of parts){
      part.mesh.setEnabled(part.type===type);
      part.mesh.material=part.direction?facingMaterial:bodyMaterial;
    }
    const front=furnitureFacing(p.id,p.rotation);
    facingReadout.textContent="FRONT → "+front.label.toUpperCase()+
      "  ·  "+(p.rotation*90)+"°"+
      " · X "+p.x.toFixed(2)+" · Z "+p.z.toFixed(2)+
      (surface==="floor"?" · R rotates 90°":" · wall-aligned");
    ghost.setEnabled(true);
    updateStatus(reason,placeable);
  };

  const close=():void=>{
    if(!enabled)return;
    enabled=false;panel.hidden=true;draft=null;placeable=false;
    document.body.classList.remove("blueprint-active");
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
    document.body.classList.add("blueprint-active");
    focusMesh.setEnabled(false);focusHint.hidden=true;
    // Retain pointer lock and the attached FPS camera while positioning.
    // P comes from a key gesture and can acquire lock if first-person mode
    // was not active; RMB/Esc cancels without sacrificing camera controls.
    choose(found.movableId);
    if(document.pointerLockElement!==canvas)void canvas.requestPointerLock()
      .catch(()=>{updateStatus("Click the game to enable free camera look.",false);});
    updateGhost();
  };
  /** Building a shelf uses the *same* ghost, floor raycast and authoritative
   * preview/commit as moving one. Only its stable ID is new.
   */
  const buildShelf=():void=>{
    if(enabled){close();return;}
    if(!canEdit()||document.querySelector("dialog[open]"))return;
    const id=nextShelfId(store.state.shopLayout);
    if(!id){
      focusHint.textContent="The shop cannot support more shelf instances.";
      focusHint.hidden=false;
      return;
    }
    enabled=true;panel.hidden=false;activeId=id;rotation=0;draft=null;
    title.textContent="BUILD · SHELF "+id.slice(6);
    updateStatus("Aim at supported floor, clear space for buyers, then click.",false);
    document.body.classList.add("blueprint-active");
    focusMesh.setEnabled(false);focusHint.hidden=true;
    if(document.pointerLockElement!==canvas)void canvas.requestPointerLock()
      .catch(()=>updateStatus("Click the game to enable free camera look.",false));
    updateGhost();
  };
  /** Unique picture: build via the shared wall ghost, move later with P. */
  const buildPortrait=():void=>{
    if(enabled){close();return;}
    if(!canEdit()||document.querySelector("dialog[open]"))return;
    if(store.state.wallPortrait){
      focusHint.textContent="The portrait already hangs in the shop. Aim at it and press P to move.";
      focusHint.hidden=false;
      return;
    }
    enabled=true;panel.hidden=false;activeId="galvik-portrait";rotation=2;draft=null;
    title.textContent="HANG · GALVIK'S LOST BELOVED";
    updateStatus("Aim at a solid shop wall, then click to hang the portrait.",false);
    document.body.classList.add("blueprint-active");
    focusMesh.setEnabled(false);focusHint.hidden=true;
    if(document.pointerLockElement!==canvas)void canvas.requestPointerLock()
      .catch(()=>updateStatus("Click the game to enable free camera look.",false));
    updateGhost();
  };
  const commit=():void=>{
    // The first click always completes validation synchronously, even when
    // hovering began less than 140 ms ago. GameStore repeats authoritative
    // geometry/reachability validation before it changes the saved layout.
    updateGhost(true);
    if(!draft||!placeable)return;
    const occupied=occupiedBy(draft);
    if(occupied){updateStatus(occupied,false);return;}
    const result=store.placeFurniture(draft);
    if(result==="Counter placement saved."||result==="Shelf placement saved."||
       result==="Bedroom furniture placed."||result==="Adventurer board placed."||
       result==="Portrait hung."){
      close();
    }else updateStatus(result,false);
  };

  openButton.addEventListener("click",open);
  buildShelfButton?.addEventListener("click",buildShelf);
  buildPortraitButton?.addEventListener("click",buildPortrait);
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
    if(event.code==="KeyN"){
      event.preventDefault();event.stopImmediatePropagation();
      if(event.shiftKey)buildPortrait();else buildShelf();
      return;
    }
    if(event.code==="KeyP"&&!event.shiftKey){
      event.preventDefault();event.stopImmediatePropagation();open();
      return;
    }
    if(!enabled)return;
    if(event.code==="KeyR"||event.code==="KeyQ"){
      event.preventDefault();event.stopImmediatePropagation();
      if(activeId==="adventurer-board"||activeId==="galvik-portrait")return; // Wall attachment determines facing.
      rotation=((rotation+(event.code==="KeyR"?1:3))%4) as 0|1|2|3;
      updateGhost();return;
    }
    if(event.code==="Escape"){
      event.preventDefault();event.stopImmediatePropagation();
      close();
    }
  },true);
  // Esc can be consumed by the browser to release pointer lock, without a
  // JS keydown event. In that case exit the blueprint as well.
  document.addEventListener("pointerlockchange",()=>{
    if(enabled && document.pointerLockElement!==canvas)close();
  });
  scene.onBeforeRenderObservable.add(()=>{updateHover();updateGhost();});
  return {open,close};
}
