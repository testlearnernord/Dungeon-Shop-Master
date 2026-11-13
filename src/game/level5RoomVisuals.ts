import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { createLevel5Room, isLevel5Air, isProtectedRoomCell, type Level5Room } from "./level5Room.ts";

/** Rebuilds the excavatable side walls. The original wall meshes are hidden
 * only for segments with an actual opening; all remaining rock collides. */
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
    const excavated=new Set(room.excavatedCells);
    for(const entry of excavated){
      const [x,z]=entry.split(",").map(Number);
      const floor=MeshBuilder.CreateBox(`excavated-floor-${entry}`,{width:1,height:.4,depth:1},scene);
      floor.position.set(x,-.2,z);floor.material=rock;floor.checkCollisions=true;floor.isPickable=false;
      blocks.push(floor);
      const ceiling=MeshBuilder.CreateBox(`excavated-ceiling-${entry}`,{width:1,height:.35,depth:1},scene);
      ceiling.position.set(x,4.1,z);ceiling.material=rock;ceiling.checkCollisions=true;ceiling.isPickable=false;
      blocks.push(ceiling);
    }
    // Replace side walls with discrete cells once expansion is available.
    // Never stack a second solid cube over a wall segment: the nearest
    // ray hit must always identify the correct cell to excavate.
    for(const [side,wall] of [-1,1].map((direction,i)=>[direction,originalWalls[i]] as const)){
      wall?.setEnabled(room.expansionTier===0);
      if(room.expansionTier===0)continue;
      for(let z=-7;z<=7;z++){
        const first={x:side*8,z};
        if(!isLevel5Air(room,first)){
          const face=MeshBuilder.CreateBox(`excavation-wall-${side}-${z}`,
            {width:1,height:4,depth:1},scene);
          face.position.set(side*7.5,2,z);
          face.material=rock;face.checkCollisions=true;
          if(z>=-6&&z<=6&&!isProtectedRoomCell(first))face.metadata={level5MineCell:first};
          blocks.push(face);
        }
      }
      for(let x=9;x<=7+room.expansionTier*2;x++){
        for(let z=-6;z<=6;z++){
          const cell={x:side*x,z};
          if(isLevel5Air(room,cell))continue;
          const adjacent=[
            {x:cell.x-side,z},{x:cell.x+side,z},
            {x:cell.x,z:z-1},{x:cell.x,z:z+1},
          ];
          if(!adjacent.some(neighbor=>isLevel5Air(room,neighbor)))continue;
          const mesh=MeshBuilder.CreateBox(`mineable-rock-${cell.x}-${z}`,
            {width:1,height:4,depth:1},scene);
          mesh.position.set(cell.x,2,z);
          mesh.material=rock;mesh.checkCollisions=true;
          if(!isProtectedRoomCell(cell))mesh.metadata={level5MineCell:cell};
          blocks.push(mesh);
        }
      }
      // Keep the excavation bounded at the unlocked tier. Without these
      // caps the outermost mined cell opens straight into the scene void.
      const limit=7+room.expansionTier*2;
      for(let z=-7;z<=7;z++){
        if(!isLevel5Air(room,{x:side*limit,z}))continue;
        const cap=MeshBuilder.CreateBox(`excavation-limit-${side}-${z}`,
          {width:.4,height:4,depth:1},scene);
        cap.position.set(side*(limit+.5),2,z);
        cap.material=rock;cap.checkCollisions=true;
        blocks.push(cap);
      }
      // Seal the two ends of side tunnels, including partially mined rows.
      for(const entry of excavated){
        const [x,z]=entry.split(",").map(Number);
        if(Math.sign(x)!==side)continue;
        for(const dz of [-1,1]){
          const next={x,z:z+dz};
          if(Math.abs(next.z)<=6||isLevel5Air(room,next))continue;
          const end=MeshBuilder.CreateBox(`excavation-end-${x}-${next.z}`,
            {width:1,height:4,depth:.4},scene);
          end.position.set(x,2,z+dz*.5);
          end.material=rock;end.checkCollisions=true;
          blocks.push(end);
        }
      }
    }
  }
  return {update,dispose:()=>{blocks.forEach(mesh=>mesh.dispose());rock.dispose();originalWalls.forEach(wall=>wall?.setEnabled(true));}};
}
