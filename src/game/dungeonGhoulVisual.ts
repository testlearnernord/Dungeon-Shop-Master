import {AnimationGroup} from "@babylonjs/core/Animations/animationGroup";
import {Material} from "@babylonjs/core/Materials/material";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import {Scene} from "@babylonjs/core/scene";
import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import type {AssetContainer} from "@babylonjs/core/assetContainer";
import type {GroupPhase} from "./groupCombat.ts";
import "@babylonjs/loaders/glTF/2.0";

import {
  GHOUL_MODEL,GHOUL_CLIP_INDICES,ghoulMotionForPhase,ghoulClipProgress,
} from "./ghoulMotion.ts";

export interface GhoulVisual {
  readonly root:TransformNode;
  readonly ready:Promise<boolean>;
  animate(phase:GroupPhase,time:number):void;
  dispose():void;
}

/** One skinned, textured model per actual recorded enemy, not a second
 * monster or combat simulator. Failures are visible in metadata and log.
 * The standalone spawn markers are labels in development preview only. */
export function createDungeonGhoulVisual(scene:Scene,id:string):GhoulVisual{
  const root=new TransformNode("dungeon-ghoul-"+id,scene);
  root.metadata={replayOnly:true,recordedActorId:id,
    visualId:"tripo-ghoul",tripoStatus:"loading",animationClip:null};
  root.setEnabled(false);
  let container:AssetContainer|null=null;
  let clips:AnimationGroup[]=[];
  let active:AnimationGroup|null=null;
  let disposed=false;
  let latest:{phase:GroupPhase;time:number}|null=null;
  scene.onDisposeObservable.addOnce(()=>{disposed=true;});

  const animate=(phase:GroupPhase,time:number)=>{
    latest={phase,time};
    if(disposed||!clips.length)return;
    const motion=ghoulMotionForPhase(phase);
    const next=clips[GHOUL_CLIP_INDICES[motion.clip]];
    if(!next)return;
    if(active!==next){
      active?.stop();
      active=next;
      next.start(false);
      next.pause();
    }
    const progress=ghoulClipProgress(time,motion);
    next.goToFrame(next.from+(next.to-next.from)*progress);
    root.metadata.animationClip=motion.clip;
    root.metadata.animationPhase=phase;
    root.metadata.animationProgress=progress;
  };

  const ready=(async():Promise<boolean>=>{
    let staged:AssetContainer|null=null;
    try{
      const url=import.meta.env.BASE_URL+GHOUL_MODEL;
      staged=await loadAssetContainerAsync(url,scene);
      if(disposed||root.isDisposed()){staged.dispose();return false;}
      const geometry=staged.meshes.filter(mesh=>mesh.getTotalVertices()>0);
      if(geometry.length!==1||staged.skeletons[0]?.bones.length!==65||
        staged.animationGroups.length!==15||
        staged.animationGroups[14]?.name!=="idle_combat")
        throw Error("Ghoul runtime GLB is missing its mesh, 65-joint rig or 15 clips");
      staged.addAllToScene();
      const pivot=new TransformNode("ghoul-model-pivot-"+id,scene);
      pivot.parent=root;
      const bounds=geometry[0].getBoundingInfo().boundingBox;
      const authoredHeight=bounds.maximum.y-bounds.minimum.y;
      const scale=Number.isFinite(authoredHeight)&&authoredHeight>0.05
        ?Math.min(12,Math.max(.25,1.95/authoredHeight)):1;
      pivot.scaling.setAll(scale);
      pivot.position.y=-bounds.minimum.y*scale;
      for(const node of staged.transformNodes)
        if(!node.parent)node.parent=pivot;
      for(const mesh of staged.meshes){
        if(!mesh.parent)mesh.parent=pivot;
        mesh.isPickable=false;mesh.checkCollisions=false;
        if(mesh.material){
          mesh.material.alpha=1;
          mesh.material.transparencyMode=Material.MATERIAL_OPAQUE;
          mesh.material.forceDepthWrite=true;
        }
      }
      clips=staged.animationGroups;
      for(const group of clips)group.stop();
      container=staged;
      root.metadata.tripoStatus="ready";
      root.metadata.tripoUrl=url;
      root.metadata.geometryCount=geometry.length;
      root.metadata.tripoClipCount=clips.length;
      root.metadata.tripoBoneCount=65;
      root.metadata.visualHeight=1.95;
      if(latest)animate(latest.phase,latest.time);
      return true;
    }catch(error){
      if(staged&&staged!==container)staged.dispose();
      if(!disposed&&!root.isDisposed()){
        root.metadata.tripoStatus="error";
        root.metadata.tripoError=String(error);
      }
      return false;
    }
  })();
  return {
    root,ready,animate,
    dispose(){
      disposed=true;
      active?.stop();
      container?.dispose();
      root.dispose(false,true);
    },
  };
}
