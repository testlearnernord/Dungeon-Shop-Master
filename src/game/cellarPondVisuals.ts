import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {GameStore} from "./gameStore.ts";
import {CELLAR_FLOOR_Y} from "./cellarRoom.ts";
import {POND_CENTER,POND_WIDTH,POND_LENGTH,isCellarPondUncovered} from "./cellarPond.ts";

/** The pool is a visible reward for mining its actual stone basin. It is
 * attached to the original shop scene and never has a separate clock. */
export function setupCellarPondVisuals(scene:Scene,store:GameStore):Mesh{
  const root=new TransformNode("cellar-pond-root",scene);
  root.position.set(POND_CENTER.x,CELLAR_FLOOR_Y,POND_CENTER.z);
  const water=MeshBuilder.CreateGround("cellar-pond-water",
    {width:POND_WIDTH,height:POND_LENGTH,subdivisions:4},scene);
  water.parent=root;water.position.y=.09;
  water.isPickable=true;water.checkCollisions=false;
  const surface=new StandardMaterial("cellar-pond-surface",scene);
  surface.diffuseColor=new Color3(.035,.23,.29);
  surface.emissiveColor=new Color3(.025,.11,.15);
  surface.specularColor=new Color3(.38,.64,.68);
  surface.alpha=.94;water.material=surface;
  const rim=new StandardMaterial("cellar-pond-stone-rim",scene);
  rim.diffuseColor=new Color3(.29,.27,.23);
  for(const [x,z,w,d] of [
    [-1.06,0,.17,3.25],[1.06,0,.17,3.25],
    [0,-1.57,2.25,.17],[0,1.57,2.25,.17],
  ] as const){
    const rock=MeshBuilder.CreateBox("cellar-pond-rim-"+x+"-"+z,
      {width:w,height:.20,depth:d},scene);
    rock.parent=root;rock.position.set(x,.10,z);
    rock.isPickable=false;rock.checkCollisions=false;rock.material=rim;
  }
  const rippleMat=new StandardMaterial("cellar-pond-ripple",scene);
  rippleMat.diffuseColor=new Color3(.30,.79,.82);
  rippleMat.emissiveColor=new Color3(.16,.42,.46);
  rippleMat.alpha=.47;
  const ripple=MeshBuilder.CreateTorus("cellar-pond-ripple-ring",
    {diameter:1.1,thickness:.022,tessellation:32},scene);
  ripple.parent=root;
  ripple.position.set(-.1,.13,.2);
  ripple.material=rippleMat;ripple.isPickable=false;
  ripple.checkCollisions=false;
  let shown:boolean|null=null;
  const sync=()=>{
    const active=isCellarPondUncovered(store.state.cellarRoom);
    if(active===shown)return;
    shown=active;root.setEnabled(active);
  };
  store.subscribe(sync);sync();
  scene.onBeforeRenderObservable.add(()=>{
    if(!shown)return;
    const t=performance.now()*.00055;
    const wave=(Math.sin(t)+1)/2;
    ripple.scaling.setAll(.60+wave*.75);
    rippleMat.alpha=.30+(1-wave)*.19;
  });
  return water;
}
