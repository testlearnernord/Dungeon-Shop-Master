import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { getDungeonSurfaces } from "./dungeonSurfaces.ts";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { createLevel5Room, type Level5Room } from "./level5Room.ts";
import { level5RockFaces } from "./level5WallFaces.ts";

/** Rebuilds collision and visible rock from the same room topology used
 * by the NPC navigation and furniture-placement validation. */
export function createLevel5RoomVisuals(scene:Scene) {
  // Keep the same textured cavern surfaces while opening the side tunnels.
  const surfaces=getDungeonSurfaces(scene);
  const blocks:AbstractMesh[]=[];
  let previous="";
  const originalWalls=["left-wall","right-wall"].map(name=>scene.getMeshByName(name));
  function update(room:Level5Room=createLevel5Room()):void {
    const signature=JSON.stringify(room);
    if(signature===previous)return;
    previous=signature;
    blocks.forEach(mesh=>mesh.dispose());
    blocks.length=0;
    originalWalls.forEach(wall=>wall?.setEnabled(room.expansionTier===0));
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
      const wall=MeshBuilder.CreateBox(`excavation-rock-face-${index}`,
        {width:face.width,height:4,depth:face.depth},scene);
      wall.position.set(face.x,2,face.z);
      wall.material=surfaces.stone;wall.checkCollisions=true;
      if(face.mineCell)wall.metadata={level5MineCell:face.mineCell};
      blocks.push(wall);
    }
  }
  return {update,dispose:()=>{
    blocks.forEach(mesh=>mesh.dispose());
    originalWalls.forEach(wall=>wall?.setEnabled(true));
    // Shared surface materials are scene-owned, never disposed by room updates.
  }};
}
