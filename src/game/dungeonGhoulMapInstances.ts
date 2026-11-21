import {Scene} from "@babylonjs/core/scene";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/loaders/glTF/2.0";
import {GHOUL_MODEL} from "./ghoulMotion.ts";

export interface GhoulMapSite {
  readonly id:string;
  readonly root:Mesh;
  readonly fallback:Mesh;
}

/** Load exactly ONE authored Tripo Ghoul mesh per Babylon floor scene, then
 * instance its render geometry at authentic saved monster-spawn coordinates.
 * The 65-bone/15-clip combat rig is never animated in the map overview:
 * only the opt-in 3D combat scene samples actor poses and attacks.
 *
 * If the asset is unavailable, leave the existing illustrated fallback
 * visible and mark the error for the real browser test to diagnose. */
export async function installGhoulMapInstances(
  scene:Scene,sites:readonly GhoulMapSite[],
):Promise<boolean>{
  if(!sites.length)return true;
  let disposed=false;
  scene.onDisposeObservable.addOnce(()=>{disposed=true;});
  try{
    const staged=await loadAssetContainerAsync(
      import.meta.env.BASE_URL+GHOUL_MODEL,scene);
    if(disposed){staged.dispose();return false;}
    const geometry=staged.meshes.filter(
      (mesh):mesh is Mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0);
    if(geometry.length!==1)
      throw new Error("Expected exactly one authentic Tripo Ghoul render mesh");
    const source=geometry[0];
    staged.addAllToScene();
    for(const clip of staged.animationGroups)clip.stop();
    source.isPickable=false;
    source.checkCollisions=false;
    // Keep the source mesh enabled for Babylon hardware instancing, but
    // stage the source far below the map so it is never a phantom monster.
    source.position.y=-900;
    const bounds=source.getBoundingInfo().boundingBox;
    const height=bounds.maximum.y-bounds.minimum.y;
    if(!Number.isFinite(height)||height<=.01)
      throw Error("Authored Ghoul GLB has invalid mesh bounds");
    const scale=Math.min(12,Math.max(.01,1.75/height));
    for(const site of sites){
      if(site.root.isDisposed())continue;
      const model=source.createInstance("overview-ghoul-3d-"+site.id);
      model.parent=site.root;
      model.position.set(0,-bounds.minimum.y*scale+.04,0);
      model.scaling.setAll(scale);
      model.rotation.y=Math.PI;
      model.isPickable=false;
      model.checkCollisions=false;
      model.metadata={worldFloorGhoul:true,modelSource:GHOUL_MODEL,
        markerId:site.id,static:true,combatSimulated:false};
      site.root.metadata={...site.root.metadata,
        visualKind:"authored-static-ghoul",assetUrl:GHOUL_MODEL};
      site.fallback.setEnabled(false);
    }
    return true;
  }catch(error){
    if(!disposed){
      for(const site of sites)if(!site.root.isDisposed())
        site.root.metadata={...site.root.metadata,
          assetError:String(error),visualKind:"illustrated-fallback"};
      console.warn("The authored LIVE floor Ghoul could not be rendered",error);
    }
    return false;
  }
}
