import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { getDungeonSurfaces } from "./dungeonSurfaces.ts";
import type { Scene } from "@babylonjs/core/scene";
import {CELLAR_ORIGIN_Z,CELLAR_FLOOR_Y} from "./cellarGeometry.ts";
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

/** Apply only topology deltas. Mining one cell must not dispose and rebuild
 * every existing floor, ceiling and wall slice. That generated large Babylon
 * mesh/geometry spikes during repeated swings, especially in big excavations.
 * Stable mesh names, UV inheritance and original-wall behaviour are retained.
 */
export function createLevel5RoomVisuals(scene:Scene,scope:"shop"|"cellar"="shop") {
  const cellar=scope==="cellar";
  const prefix=cellar?"cellar-":"";
  const originZ=cellar?CELLAR_ORIGIN_Z:0;
  const floorY=cellar?CELLAR_FLOOR_Y:0;
  const surfaces=getDungeonSurfaces(scene);
  const blocks=new Map<string,Mesh>();
  let previous="";
  const originalWalls=[
    scene.getMeshByName(prefix+"left-wall") as Mesh|null,
    scene.getMeshByName(prefix+"right-wall") as Mesh|null,
  ];
  function update(room:Level5Room=createLevel5Room()):void {
    const signature=JSON.stringify(room);
    if(signature===previous)return;
    previous=signature;
    const keep=new Set<string>();
    const ensure=(key:string,create:()=>Mesh):void=>{
      keep.add(key);
      if(!blocks.has(key))blocks.set(key,create());
    };
    const minedLeft=room.excavatedCells.some(key=>Number(key.split(",")[0])<0);
    const minedRight=room.excavatedCells.some(key=>Number(key.split(",")[0])>0);
    originalWalls[0]?.setEnabled(!minedLeft);
    originalWalls[1]?.setEnabled(!minedRight);
    if(room.expansionTier>0){
      for(const entry of room.excavatedCells){
        const [x,z]=entry.split(",").map(Number);
        ensure("floor:"+entry,()=>{
          const floor=MeshBuilder.CreateBox(`${prefix}excavated-floor-${entry}`,
            {width:1,height:.4,depth:1},scene);
          floor.position.set(x,floorY-.2,z+originZ);
          floor.material=surfaces.floor;
          floor.checkCollisions=true;
          floor.isPickable=true;
          return floor;
        });
        ensure("ceiling:"+entry,()=>{
          const ceiling=MeshBuilder.CreateBox(`${prefix}excavated-ceiling-${entry}`,
            {width:1,height:.35,depth:1},scene);
          ceiling.position.set(x,floorY+4.1,z+originZ);
          ceiling.material=surfaces.stone;
          ceiling.checkCollisions=true;
          ceiling.isPickable=false;
          return ceiling;
        });
      }
      for(const face of level5RockFaces(room)){
        const originalSide=face.width===.4&&face.depth===1&&
          Math.abs(face.x)===7.5;
        const side=face.x<0?0:1;
        const untouched=originalSide&&(side===0?!minedLeft:!minedRight);
        if(untouched&&!face.mineCell)continue;
        const key="rock:"+[face.x,face.z,face.width,face.depth,
          face.mineCell?.x??"",face.mineCell?.z??"",untouched].join(":");
        ensure(key,()=>{
          // Stable topology-based names replace old index-based identities.
          // A neighbour's index used to change whenever a cell was mined.
          const wall=MeshBuilder.CreateBox(prefix+"excavation-rock-face-"+key.slice(5),
            {width:face.width,height:4,depth:face.depth},scene);
          wall.position.set(untouched?(side===0?-7.24:7.24):face.x,
            floorY+2,face.z+originZ);
          wall.material=surfaces.stone;
          wall.checkCollisions=!untouched;
          if(untouched){
            wall.scaling.x=.1;
            wall.visibility=0.000001;
          }else if(originalSide){
            const original=originalWalls[side];
            if(original)inheritSideWallUV(wall,original);
          }
          if(face.mineCell)wall.metadata=cellar
            ?{cellarMineCell:face.mineCell}:{level5MineCell:face.mineCell};
          return wall;
        });
      }
    }
    // Meshes still representing rock or floor are retained verbatim. Only
    // disappeared faces are disposed, never the complete excavated cave.
    for(const [key,mesh] of blocks){
      if(keep.has(key))continue;
      mesh.dispose();
      blocks.delete(key);
    }
  }
  return {update,dispose:()=>{
    blocks.forEach(mesh=>mesh.dispose());
    blocks.clear();
    originalWalls.forEach(wall=>wall?.setEnabled(true));
  }};
}
