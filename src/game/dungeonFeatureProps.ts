import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Scene} from "@babylonjs/core/scene";
import type {DungeonFeature} from "./dungeonLayout.ts";

/** Readable real Babylon geometry; only visual meshes, never collision,
 * inventory or trap damage. Every feature root owns all of its child art so
 * the existing saved fog controls visibility. Site resolution changes pose,
 * never geometry authority or resource settlement. */
function matte(scene:Scene,name:string,color:string,glow=0):StandardMaterial{
  const m=new StandardMaterial(name,scene);
  m.diffuseColor=Color3.FromHexString(color);
  m.specularColor=new Color3(.09,.08,.06);
  if(glow)m.emissiveColor=m.diffuseColor.scale(glow);
  return m;
}
export interface DungeonFeaturePalette {
  readonly chestWood:StandardMaterial;
  readonly chestLid:StandardMaterial;
  readonly brass:StandardMaterial;
  readonly trapIron:StandardMaterial;
  readonly trapRust:StandardMaterial;
  readonly trapSignal:StandardMaterial;
}
export function createDungeonFeaturePalette(scene:Scene):DungeonFeaturePalette{
  return {
    chestWood:matte(scene,"overview-chest-wood","#603a27"),
    chestLid:matte(scene,"overview-chest-lid","#89532d"),
    brass:matte(scene,"overview-chest-brass","#d9b362",.28),
    trapIron:matte(scene,"overview-trap-iron","#4d4b47"),
    trapRust:matte(scene,"overview-trap-rust","#9b4a38"),
    trapSignal:matte(scene,"overview-trap-warning","#d47959",.32),
  };
}

function piece(
  scene:Scene,root:Mesh,name:string,
  size:{width:number;height:number;depth:number},
  xyz:readonly [number,number,number],material:StandardMaterial,
):Mesh{
  const mesh=MeshBuilder.CreateBox(name,size,scene);
  mesh.parent=root;mesh.position.set(...xyz);
  mesh.material=material;mesh.isPickable=false;mesh.checkCollisions=false;
  return mesh;
}

export function createReadableDungeonChest(
  scene:Scene,feature:DungeonFeature,world:Vector3,
  paint:DungeonFeaturePalette,
):Mesh{
  const root=MeshBuilder.CreateBox("dungeon-treasure-"+feature.id,
    {width:1.28,height:.16,depth:.98},scene);
  root.position.set(world.x,.19,world.z);
  root.material=paint.chestWood;
  root.metadata={spectatorFeatureId:feature.id,
    spectatorFeatureKind:"treasure",visualKind:"3d-wooden-chest",siteSpent:false};
  root.checkCollisions=false;
  // Actual hollow chest: opening the lid exposes the empty interior.
  for(const z of [-.435,.435])
    piece(scene,root,"chest-long-wall-"+feature.id+"-"+z,
      {width:1.28,height:.58,depth:.11},[0,.34,z],paint.chestWood);
  for(const x of [-.585,.585])
    piece(scene,root,"chest-end-wall-"+feature.id+"-"+x,
      {width:.11,height:.58,depth:.76},[x,.34,0],paint.chestWood);
  // One hinge at the rear edge; band meshes rotate with the actual lid.
  const hinge=new Mesh("chest-hinge-"+feature.id,scene);
  hinge.parent=root;hinge.position.set(0,.66,.49);
  hinge.isPickable=false;hinge.checkCollisions=false;
  piece(scene,hinge,"chest-lid-"+feature.id,
    {width:1.36,height:.22,depth:1.06},[0,.11,-.49],paint.chestLid);
  for(const x of [-.39,.39]){
    piece(scene,hinge,"chest-lid-band-"+feature.id+"-"+x,
      {width:.12,height:.245,depth:1.075},[x,.12,-.49],paint.brass);
    piece(scene,root,"chest-front-band-"+feature.id+"-"+x,
      {width:.12,height:.59,depth:.075},[x,.34,-.52],paint.brass);
  }
  piece(scene,root,"chest-lock-"+feature.id,
    {width:.25,height:.28,depth:.09},[0,.49,-.54],paint.brass);
  piece(scene,root,"chest-lock-core-"+feature.id,
    {width:.075,height:.12,depth:.095},[0,.46,-.60],paint.trapIron);
  return root;
}

/** Idempotent presentation of an actual site generation. No animation
 * timer, loot roll or reset here: rewinds and renewals use their own state. */
export function setDungeonSiteSpent(root:import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh,spent:boolean):void{
  const kind=root.metadata?.spectatorFeatureKind;
  if(kind!=="treasure"&&kind!=="trap")return;
  if(root.metadata.siteSpent===spent)return;
  root.metadata.siteSpent=spent;
  const id=root.metadata.spectatorFeatureId;
  if(kind==="treasure"){
    const hinge=root.getChildMeshes().find(m=>m.name==="chest-hinge-"+id);
    if(hinge)hinge.rotation.x=spent?1.95:0;
  }else{
    for(const child of root.getChildMeshes())
      if(child.name.startsWith("trap-spike-"+id+"-"))
        child.setEnabled(!spent);
  }
}

export function createReadableDungeonTrap(
  scene:Scene,feature:DungeonFeature,world:Vector3,
  paint:DungeonFeaturePalette,
):Mesh{
  const root=MeshBuilder.CreateBox("dungeon-trap-"+feature.id,
    {width:1.63,height:.14,depth:1.63},scene);
  root.position.set(world.x,.13,world.z);
  root.material=paint.trapIron;
  root.metadata={spectatorFeatureId:feature.id,
    spectatorFeatureKind:"trap",visualKind:"3d-spike-pressure-plate",siteSpent:false};
  root.checkCollisions=false;
  // A recognisable pressure-plate rim and five actual vertical spikes.
  for(const x of [-.71,.71]){
    piece(scene,root,"trap-side-rim-"+feature.id+"-"+x,
      {width:.10,height:.13,depth:1.6},[x,.09,0],paint.trapRust);
  }
  for(const z of [-.71,.71]){
    piece(scene,root,"trap-end-rim-"+feature.id+"-"+z,
      {width:1.6,height:.13,depth:.10},[0,.09,z],paint.trapRust);
  }
  for(const [i,x,z] of [
    [0,0,0],[1,-.42,-.42],[2,.42,-.42],[3,-.42,.42],[4,.42,.42],
  ]){
    const spike=MeshBuilder.CreateCylinder(
      "trap-spike-"+feature.id+"-"+i,
      {height:.43,diameterTop:0,diameterBottom:.27,tessellation:5},scene);
    spike.parent=root;spike.position.set(x,.30,z);
    spike.material=paint.trapSignal;
    spike.isPickable=false;spike.checkCollisions=false;
  }
  return root;
}

/** Shared low-poly remains. No death logic, collisions or loot authority. */
export function createDungeonRemains(scene:Scene,id:string,world:Vector3):Mesh{
  const root=new Mesh("fallen-remains-"+id,scene);
  root.position.set(world.x,.18,world.z);
  root.isPickable=false;
  root.checkCollisions=false;
  root.metadata={fallenHeroId:id,visualKind:"fallen-remains"};
  const paint=(scene.getMaterialByName("fallen-bone") as StandardMaterial|null)??
    matte(scene,"fallen-bone","#c9bd9e",.22);
  const skull=MeshBuilder.CreateSphere("fallen-skull-"+id,{diameter:.36,segments:6},scene);
  skull.parent=root;skull.position.set(0,.14,-.67);skull.material=paint;
  skull.isPickable=false;skull.checkCollisions=false;
  piece(scene,root,"fallen-spine-"+id,{width:.13,height:.13,depth:.65},[0,.05,-.16],paint);
  for(const z of [-.36,-.18,0])
    piece(scene,root,"fallen-rib-"+id+"-"+z,{width:.52,height:.1,depth:.08},[0,.1,z],paint);
  for(const x of [-.34,.34]){
    piece(scene,root,"fallen-arm-"+id+"-"+x,{width:.09,height:.09,depth:.56},[x,.03,-.12],paint);
    piece(scene,root,"fallen-leg-"+id+"-"+x,{width:.13,height:.1,depth:.64},[x*.55,.03,.58],paint);
  }
  return root;
}
