import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import type {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {Scene} from "@babylonjs/core/scene";
import type {DungeonSurfaces} from "./dungeonSurfaces.ts";
import {CELLAR_ORIGIN_Z,CELLAR_FLOOR_Y,CELLAR_ENTRY_X} from "./cellarRoom.ts";

/** Existing cave world, not a second scene or simulation. All world coordinates
 * stay physical, allowing the first-person camera to walk down the ramp.
 * Room mining and furniture are handled by their existing registries. */
const ROCK_SPAN=15;
export function buildCellarGeometry(scene:Scene,surfaces:DungeonSurfaces):void{
  const cube=(name:string,width:number,height:number,depth:number,
    x:number,y:number,z:number,solid=true):Mesh=>{
    const mesh=MeshBuilder.CreateBox(name,{width,height,depth},scene);
    mesh.position.set(x,y,z);
    mesh.material=surfaces.stone;
    mesh.checkCollisions=solid;
    mesh.isPickable=!name.includes("ceiling")&&!name.includes("barrier");
    return mesh;
  };
  // A proper walkable floor below the original shop, so neither the shop's
  // paths nor the customer navigation graph can wander into the cellar.
  const floor=cube("cellar-floor",ROCK_SPAN,.4,ROCK_SPAN,0,
    CELLAR_FLOOR_Y-.2,CELLAR_ORIGIN_Z);
  floor.material=surfaces.floor;
  cube("cellar-ceiling",ROCK_SPAN,.35,ROCK_SPAN,0,
    CELLAR_FLOOR_Y+4.1,CELLAR_ORIGIN_Z);
  cube("cellar-left-wall",.4,4,14,-7.5,CELLAR_FLOOR_Y+2,CELLAR_ORIGIN_Z);
  cube("cellar-right-wall",.4,4,14,7.5,CELLAR_FLOOR_Y+2,CELLAR_ORIGIN_Z);
  cube("cellar-rear-wall",ROCK_SPAN,4,.4,0,CELLAR_FLOOR_Y+2,
    CELLAR_ORIGIN_Z-7.5);
  // The cellar front wall joins a protected ramp landing.
  cube("cellar-front-left",5.60,4,.4,-4.70,CELLAR_FLOOR_Y+2,-19.5);
  cube("cellar-front-right",7.30,4,.4,3.85,CELLAR_FLOOR_Y+2,-19.5);
  // Real sloping collision surface, with non-colliding visible individual
  // treads. Thin disconnected step colliders would stop Babylon's walking
  // camera from ever climbing the staircase.
  // Both ends of the collider overlap their flat floors. The old ramp
  // began at z=-12.7 while the bedroom floor ended at -12.5, leaving an
  // unwalkable threshold seam. Submerge its top surface a few centimetres
  // so that the ramp never creates a vertical lip under the FPS ellipsoid.
  const run=8.0,drop=-CELLAR_FLOOR_Y;
  const upperZ=-12.1,midZ=upperZ-run/2;
  const ramp=cube("cellar-stair-walkable-ramp",1.92,.18,
    Math.hypot(run,drop),CELLAR_ENTRY_X,CELLAR_FLOOR_Y/2-.10,midZ);
  ramp.rotation.x=-Math.atan2(drop,run);
  ramp.isPickable=false;
  for(let i=0;i<23;i++){
    const t=(i+.5)/23;
    const tread=cube("cellar-stair-tread-"+i,1.88,.055,.29,
      CELLAR_ENTRY_X,-drop*t-.16,upperZ-run*t,false);
    tread.material=surfaces.floor;
    tread.isPickable=false;
  }
  // Preserve the same enlarged clearance through the full corridor,
  // including the opening in the cellar's front wall at the bottom.
  for(const side of [-1,1]){
    cube("cellar-stair-wall-"+side,.35,8.2,7.3,
      CELLAR_ENTRY_X+side*1.16,-1.7,-16.1);
    const wood=MeshBuilder.CreateBox("cellar-stair-rail-"+side,
      {width:.09,height:.12,depth:Math.hypot(run,drop)},scene);
    wood.position.set(CELLAR_ENTRY_X+side*.95,
      CELLAR_FLOOR_Y/2+.92,midZ);
    wood.rotation.x=ramp.rotation.x;
    wood.material=surfaces.woodEdge;
    wood.isPickable=false;
  }
  const arch=cube("cellar-stair-arch",2.12,.28,.55,CELLAR_ENTRY_X,
    3.07,-12.75);
  arch.isPickable=false;
  // Secret door covers the structural opening. The portrait mesh is the
  // interaction target; this invisible collider is never ray-pickable.
  const barrier=cube("cellar-portrait-barrier",1.98,2.75,.22,
    CELLAR_ENTRY_X,1.38,-12.35);
  barrier.visibility=0;
  barrier.isPickable=false;
  // Just enough local light to read the winding passage and the empty cellar.
  for(const [index,z,y] of [[0,-15,-1],[1,-22,CELLAR_FLOOR_Y+2.8],
    [2,-31,CELLAR_FLOOR_Y+2.8]] as const){
    const lamp=new PointLight("cellar-torch-"+index,
      new Vector3(index===0?CELLAR_ENTRY_X:6.5,y,z),scene);
    lamp.diffuse=new Color3(1,.53,.22);
    lamp.intensity=index===0?1.35:1.7;
    lamp.range=11;
    const flame=MeshBuilder.CreateSphere("cellar-flame-"+index,
      {diameter:.18,segments:8},scene);
    flame.position.copyFrom(lamp.position);
    const material=new StandardMaterial("cellar-flame-mat-"+index,scene);
    material.diffuseColor=new Color3(1,.56,.14);
    material.emissiveColor=new Color3(.8,.38,.08);
    flame.material=material;flame.isPickable=false;
  }
}
