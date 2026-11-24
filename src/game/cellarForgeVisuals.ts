import {Color3} from "@babylonjs/core/Maths/math.color";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import type {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {Scene} from "@babylonjs/core/scene";
import {CELLAR_FLOOR_Y} from "./cellarRoom.ts";

/** V0.1: physically present, colliding and ray-pickable cellar forge. The
 * single anvil is a visible player interaction, not a remote menu shortcut.
 * Art is intentionally inexpensive until the functional loop is accepted. */
export const CELLAR_FORGE_POSITION={x:-4,z:-28.5} as const;
export function setupCellarForgeVisuals(scene:Scene):Mesh {
  const steel=new StandardMaterial("cellar-forge-steel",scene);
  steel.diffuseColor=new Color3(.29,.32,.35);
  steel.specularColor=new Color3(.52,.5,.43);
  const stone=new StandardMaterial("cellar-forge-stone",scene);
  stone.diffuseColor=new Color3(.28,.25,.23);
  const coal=new StandardMaterial("cellar-forge-coals",scene);
  coal.diffuseColor=new Color3(.14,.1,.08);
  coal.emissiveColor=new Color3(.31,.095,.025);
  const p=CELLAR_FORGE_POSITION;
  const box=(id:string,w:number,h:number,d:number,x:number,y:number,z:number,
    material:StandardMaterial)=>{
    const mesh=MeshBuilder.CreateBox("cellar-forge-"+id,{
      width:w,height:h,depth:d},scene);
    mesh.position.set(p.x+x,CELLAR_FLOOR_Y+y,p.z+z);
    mesh.material=material;
    mesh.checkCollisions=true;
    mesh.isPickable=false;
    return mesh;
  };
  box("base",1.25,.66,1.05,0,.33,0,stone);
  const anvil=box("anvil",1.03,.28,.49,0,1.12,.19,steel);
  anvil.isPickable=true;
  box("anvil-foot",.39,.62,.4,0,.8,.19,steel);
  box("anvil-horn",.42,.15,.23,-.65,1.14,.19,steel);
  box("firepit",.95,.16,.64,0,.75,-.38,coal);
  // Only the visible anvil accepts E/click; the base is a solid obstacle.
  anvil.metadata={cellarForge:true};
  return anvil;
}
