import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { createLevel5Room, type Level5Room } from "./level5Room.ts";
import { level5RockFaces } from "./level5WallFaces.ts";

/** Rebuilds collision and visible rock from the same room topology used
 * by the NPC navigation and furniture-placement validation. */
export function createLevel5RoomVisuals(scene:Scene) {
  const rock = new StandardMaterial("excavation-rock-material",scene);
  rock.diffuseColor = new Color3(0.2,0.18,0.16);
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
      floor.material=rock;floor.checkCollisions=true;floor.isPickable=false;
      blocks.push(floor);
      const ceiling=MeshBuilder.CreateBox(`excavated-ceiling-${entry}`,
        {width:1,height:.35,depth:1},scene);
      ceiling.position.set(x,4.1,z);
      ceiling.material=rock;ceiling.checkCollisions=true;ceiling.isPickable=false;
      blocks.push(ceiling);
    }
    for(const [index,face] of level5RockFaces(room).entries()){
      const wall=MeshBuilder.CreateBox(`excavation-rock-face-${index}`,
        {width:face.width,height:4,depth:face.depth},scene);
      wall.position.set(face.x,2,face.z);
      wall.material=rock;wall.checkCollisions=true;
      if(face.mineCell)wall.metadata={level5MineCell:face.mineCell};
      blocks.push(wall);
    }
  }
  return {update,dispose:()=>{
    blocks.forEach(mesh=>mesh.dispose());
    originalWalls.forEach(wall=>wall?.setEnabled(true));
    rock.dispose();
  }};
}
