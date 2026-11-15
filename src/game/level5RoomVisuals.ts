import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { getDungeonSurfaces } from "./dungeonSurfaces.ts";
import type { Scene } from "@babylonjs/core/scene";
import { createLevel5Room, type Level5Room } from "./level5Room.ts";
import { level5RockFaces } from "./level5WallFaces.ts";

/** One-metre slices on the original side walls must sample the SAME portion
 * of the original 14m wall UVs. Otherwise every slice stretches the entire
 * stone texture across 1m, giving the false "vertical wood panelling" look. */
function inheritSideWallUV(slice:Mesh,original:Mesh):void {
  const originalPositions=original.getVerticesData(VertexBuffer.PositionKind);
  const originalNormals=original.getVerticesData(VertexBuffer.NormalKind);
  const originalUVs=original.getVerticesData(VertexBuffer.UVKind);
  const positions=slice.getVerticesData(VertexBuffer.PositionKind);
  const normals=slice.getVerticesData(VertexBuffer.NormalKind);
  const uvs=slice.getVerticesData(VertexBuffer.UVKind);
  if(!originalPositions||!originalNormals||!originalUVs||!positions||!normals||!uvs)return;
  for(let i=0;i<positions.length/3;i++){
    const nx=normals[i*3];
    if(Math.abs(nx)<.9)continue;
    const ref:number[]=[];
    for(let j=0;j<originalPositions.length/3;j++){
      if(Math.sign(originalNormals[j*3])===Math.sign(nx)&&
        Math.abs(originalNormals[j*3])>.9)ref.push(j);
    }
    if(ref.length<2)continue;
    ref.sort((a,b)=>originalPositions[a*3+2]-originalPositions[b*3+2]);
    const lo=ref[0],hi=ref[ref.length-1];
    const z0=originalPositions[lo*3+2],z1=originalPositions[hi*3+2];
    if(z1===z0)continue;
    const zWorld=slice.position.z+positions[i*3+2]-original.position.z;
    const t=(zWorld-z0)/(z1-z0);
    uvs[i*2]=originalUVs[lo*2]+
      t*(originalUVs[hi*2]-originalUVs[lo*2]);
  }
  slice.setVerticesData(VertexBuffer.UVKind,uvs,false);
}

/** Rebuild just the opened side from authoritative topology. Before ANY rock
 * is removed, the original unmodified side wall remains visible and solid;
 * transparent pick-only targets provide mining without a visual swap on U.
 * After mining, the uncut side retains its original mesh and the cut side's
 * new slices inherit continuous stone UV coordinates from that same mesh.
 */
export function createLevel5RoomVisuals(scene:Scene) {
  const surfaces=getDungeonSurfaces(scene);
  const blocks:Mesh[]=[];
  let previous="";
  const originalWalls=[
    scene.getMeshByName("left-wall") as Mesh|null,
    scene.getMeshByName("right-wall") as Mesh|null,
  ];
  function update(room:Level5Room=createLevel5Room()):void {
    const signature=JSON.stringify(room);
    if(signature===previous)return;
    previous=signature;
    blocks.forEach(mesh=>mesh.dispose());
    blocks.length=0;
    const minedLeft=room.excavatedCells.some(key=>Number(key.split(",")[0])<0);
    const minedRight=room.excavatedCells.some(key=>Number(key.split(",")[0])>0);
    originalWalls[0]?.setEnabled(!minedLeft);
    originalWalls[1]?.setEnabled(!minedRight);
    if(room.expansionTier===0)return;
    for(const entry of room.excavatedCells){
      const [x,z]=entry.split(",").map(Number);
      const floor=MeshBuilder.CreateBox(`excavated-floor-${entry}`,
        {width:1,height:.4,depth:1},scene);
      floor.position.set(x,-.2,z);
      floor.material=surfaces.floor;floor.checkCollisions=true;floor.isPickable=true;
      blocks.push(floor);
      const ceiling=MeshBuilder.CreateBox(`excavated-ceiling-${entry}`,
        {width:1,height:.35,depth:1},scene);
      ceiling.position.set(x,4.1,z);
      ceiling.material=surfaces.stone;ceiling.checkCollisions=true;ceiling.isPickable=false;
      blocks.push(ceiling);
    }
    for(const [index,face] of level5RockFaces(room).entries()){
      const originalSide=face.width===.4&&face.depth===1&&
        Math.abs(face.x)===7.5;
      const side=face.x<0?0:1;
      const untouched=originalSide&&(side===0?!minedLeft:!minedRight);
      // Only the mining interaction needs a target; a still-intact wall
      // must never have its visible mesh, collision or UVs replaced.
      if(untouched&&!face.mineCell)continue;
      const wall=MeshBuilder.CreateBox(`excavation-rock-face-${index}`,
        {width:face.width,height:4,depth:face.depth},scene);
      wall.position.set(untouched?(side===0?-7.24:7.24):face.x,2,face.z);
      wall.material=surfaces.stone;
      wall.checkCollisions=!untouched;
      if(untouched){
        wall.scaling.x=.1; // Invisible pick-only skin in front of the old wall.
        wall.visibility=0.000001;
      }else if(originalSide){
        const original=originalWalls[side];
        if(original)inheritSideWallUV(wall,original);
      }
      if(face.mineCell)wall.metadata={level5MineCell:face.mineCell};
      blocks.push(wall);
    }
  }
  return {update,dispose:()=>{
    blocks.forEach(mesh=>mesh.dispose());
    originalWalls.forEach(wall=>wall?.setEnabled(true));
  }};
}
