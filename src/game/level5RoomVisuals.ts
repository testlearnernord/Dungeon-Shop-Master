import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { createLevel5Room, isLevel5Air, type Level5Room } from "./level5Room.ts";

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
    for(const [side,wall] of [-1,1].map((side,i)=>[side,originalWalls[i]] as const)){
      const openings=[...excavated].some(key=>key.startsWith(side===-1?"-8,":"8,"));
      if(wall)wall.setEnabled(room.expansionTier===0 && !openings);
      if(room.expansionTier===0 && !openings)continue;
      // Replace the original monolithic wall with individually collidable
      // segments, preserving the unexcavated sections.
      for(let z=-6;z<=6;z++){
        if(!isLevel5Air(room,{x:side*8,z})){
          const mesh=MeshBuilder.CreateBox(`excavation-wall-${side}-${z}`,{width:1,height:4,depth:1},scene);
          mesh.position.set(side*7.5,2,z);
          mesh.material=rock;
          mesh.checkCollisions=true;
          if(room.expansionTier>0)mesh.metadata={level5MineCell:{x:side*8,z}};
          blocks.push(mesh);
        }
      }
      // Rock beyond the old boundary is still solid until explicitly mined.
      for(let x=8;x<=7+room.expansionTier*2;x++){
        for(let z=-6;z<=6;z++){
          const cell={x:side*x,z};
          if(isLevel5Air(room,cell))continue;
          // Only expose rock immediately next to an excavated cell.
          if(![ {x:cell.x-side,z}, {x:cell.x+side,z},{x:cell.x,z:z-1},{x:cell.x,z:z+1}]
            .some(neighbor=>isLevel5Air(room,neighbor)))continue;
          const mesh=MeshBuilder.CreateBox(`mineable-rock-${cell.x}-${z}`,{size:1},scene);
          mesh.position.set(cell.x,2,z);
          mesh.scaling.y=4;
          mesh.material=rock;
          mesh.checkCollisions=true;
          mesh.metadata={level5MineCell:cell};
          blocks.push(mesh);
        }
      }
    }
  }
  return {update,dispose:()=>{blocks.forEach(mesh=>mesh.dispose());rock.dispose();originalWalls.forEach(wall=>wall?.setEnabled(true));}};
}
