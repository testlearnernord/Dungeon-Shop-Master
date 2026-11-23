import {Scene} from "@babylonjs/core/scene";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {AnimationGroup} from "@babylonjs/core/Animations/animationGroup";
import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import type {AssetContainer,InstantiatedEntries} from "@babylonjs/core/assetContainer";
import type {InstancedMesh} from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/loaders/glTF/2.0";
import {GHOUL_MODEL} from "./ghoulMotion.ts";

export interface GhoulMapSite {
  readonly id:string;
  readonly root:Mesh;
  readonly fallback:Mesh;
}
type VisualSite={
  readonly site:GhoulMapSite;
  readonly idle:InstancedMesh;
  readonly walk:InstancedMesh;
};
type Pose={walking:boolean;heading:number;progress:number};
export interface GhoulOverviewOptions {
  readonly visualHeight?:number;
  readonly instancePrefix?:string;
  readonly onReady?:()=>void;
}

/** Two real authored skinned POSES per Babylon scene, not one fight rig for
 * every map spawn: an idle skeleton and a walk skeleton. Their instances
 * share the corresponding pose and materials. Only walking packs display
 * the latter, eliminating the formerly static/legless sliding animation.
 *
 * A skinned Babylon InstancedMesh cannot select its own bone animation;
 * two independent rig sources are the minimal valid solution. No actor,
 * path, clock or combat system is created here. */
export class GhoulMapInstances {
  private asset:AssetContainer|null=null;
  private walker:InstantiatedEntries|null=null;
  private idleSource:Mesh|null=null;
  private walkSource:Mesh|null=null;
  private idleClip:AnimationGroup|null=null;
  private walkClip:AnimationGroup|null=null;
  private siteList:readonly GhoulMapSite[]=[];
  private readonly rendered=new Map<string,VisualSite>();
  private readonly poses=new Map<string,Pose>();
  private heightScale=1;
  private disposed=false;
  readonly ready:Promise<boolean>;

  constructor(
    private readonly scene:Scene,
    sites:readonly GhoulMapSite[],
    private readonly options:GhoulOverviewOptions={},
  ){
    this.siteList=sites;
    scene.onDisposeObservable.addOnce(()=>this.dispose());
    this.ready=this.load();
  }

  get authoredCount():number{return this.rendered.size;}
  get rigCount():number{return this.idleSource&&this.walkSource?2:0;}

  private async load():Promise<boolean>{
    let staged:AssetContainer|null=null;
    let duplicate:InstantiatedEntries|null=null;
    try{
      staged=await loadAssetContainerAsync(
        import.meta.env.BASE_URL+GHOUL_MODEL,this.scene);
      if(this.disposed){staged.dispose();return false;}
      const geometry=staged.meshes.filter(
        (mesh):mesh is Mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0);
      if(geometry.length!==1||staged.skeletons[0]?.bones.length!==65||
         staged.animationGroups.length!==15)
        throw Error("Expected the canonical 65-bone, 15-clip Ghoul GLB");
      staged.addAllToScene();
      // Clone the rig ONCE. This keeps walking and idle skeletons independent
      // while avoiding a 65-bone skeleton per visible monster site.
      duplicate=staged.instantiateModelsToScene(
        name=>"overview-walking-"+name,false,{doNotInstantiate:true});
      const walkGeometry=duplicate.rootNodes.flatMap(root=>[
        ...(root instanceof Mesh?[root]:[]),
        ...root.getDescendants(false).filter(
          (node):node is Mesh=>node instanceof Mesh),
      ]).find(mesh=>mesh.getTotalVertices()>0);
      if(!walkGeometry||duplicate.skeletons[0]?.bones.length!==65)
        throw Error("Missing separate authored walking skeleton");
      const idle=staged.animationGroups.find(c=>c.name==="idle_combat");
      const walk=duplicate.animationGroups.find(c=>
        c.name==="walk_feral"||c.name.endsWith("walk_feral"));
      if(!idle||!walk)throw Error("Ghoul walk/idle animation clips absent");
      const source=geometry[0];
      const bounds=source.getBoundingInfo().boundingBox;
      const height=bounds.maximum.y-bounds.minimum.y;
      if(!Number.isFinite(height)||height<=.01)
        throw Error("Authored Ghoul GLB has invalid mesh bounds");
      this.heightScale=Math.min(12,Math.max(.01,
        (this.options.visualHeight??1.75)/height));
      for(const clip of [...staged.animationGroups,
        ...duplicate.animationGroups])clip.stop();
      idle.start(false);idle.pause();
      walk.start(false);walk.pause();
      idle.goToFrame(idle.from+(idle.to-idle.from)*.18);
      walk.goToFrame(walk.from+(walk.to-walk.from)*.08);
      source.isPickable=false;source.checkCollisions=false;
      walkGeometry.isPickable=false;walkGeometry.checkCollisions=false;
      source.position.y=-900;walkGeometry.position.y=-900;
      this.idleSource=source;
      this.walkSource=walkGeometry;
      this.idleClip=idle;this.walkClip=walk;
      this.asset=staged;this.walker=duplicate;
      this.rebuild();
      this.options.onReady?.();
      return true;
    }catch(error){
      duplicate?.dispose();
      staged?.dispose();
      if(!this.disposed){
        this.idleSource=null;this.walkSource=null;
        for(const site of this.siteList)if(!site.root.isDisposed()){
          site.fallback.setEnabled(true);
          site.root.metadata={...site.root.metadata,
            assetError:String(error),visualKind:"illustrated-fallback"};
        }
        console.warn("The authored map Ghoul rig could not be rendered",error);
      }
      return false;
    }
  }

  /** Floor changes only rebuild the few instance bindings, never the GLB
   * source or any gameplay entities. Call with newly authored marker roots. */
  setSites(sites:readonly GhoulMapSite[]):void{
    for(const visual of this.rendered.values()){
      visual.idle.dispose();visual.walk.dispose();
    }
    this.rendered.clear();
    this.siteList=sites;
    this.poses.clear();
    if(this.idleSource&&this.walkSource)this.rebuild();
  }

  private rebuild():void{
    if(this.disposed||!this.idleSource||!this.walkSource)return;
    const bounds=this.idleSource.getBoundingInfo().boundingBox;
    const y=-bounds.minimum.y*this.heightScale+.04;
    for(const site of this.siteList){
      if(site.root.isDisposed())continue;
      const instanceName=this.options.instancePrefix??"overview-ghoul-3d-";
      const idle=this.idleSource.createInstance(instanceName+site.id);
      const walk=this.walkSource.createInstance("overview-ghoul-walk-"+site.id);
      for(const mesh of [idle,walk]){
        mesh.parent=site.root;
        mesh.position.set(0,y,0);
        mesh.scaling.setAll(this.heightScale);
        mesh.rotation.y=Math.PI;
        mesh.isPickable=false;mesh.checkCollisions=false;
      }
      idle.metadata={worldFloorGhoul:true,modelSource:GHOUL_MODEL,
        markerId:site.id,combatSimulated:false};
      walk.metadata={worldFloorGhoulWalk:true,modelSource:GHOUL_MODEL,
        markerId:site.id,combatSimulated:false};
      walk.setEnabled(false);
      site.fallback.setEnabled(false);
      site.root.metadata={...site.root.metadata,
        visualKind:"authored-animated-ghoul",assetUrl:GHOUL_MODEL,
        animationClip:"idle_combat",animationPhase:"idle",
        overviewRigCount:2};
      this.rendered.set(site.id,{site,idle,walk});
      this.poses.set(site.id,{walking:false,heading:0,progress:0});
    }
  }

  /** Only a renderer calls pose, from an actual SAVED one-tile transition.
   * Null heading keeps a pack facing the direction of its last real move. */
  pose(id:string,walking:boolean,heading:number|null,progress:number):void{
    const visual=this.rendered.get(id);
    if(!visual||this.disposed)return;
    const previous=this.poses.get(id);
    const yaw=heading===null?(previous?.heading??0):heading;
    const phase=walking?"walk_feral":"idle_combat";
    const old=this.poses.get(id);
    const amount=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:1));
    if(old?.walking!==walking){
      visual.idle.setEnabled(!walking);
      visual.walk.setEnabled(walking);
    }
    if(old?.heading!==yaw){
      visual.idle.rotation.y=Math.PI+yaw;
      visual.walk.rotation.y=Math.PI+yaw;
    }
    visual.site.root.metadata={...visual.site.root.metadata,
      animationClip:phase,animationPhase:walking?"walk":"idle",
      animationProgress:amount,heading:yaw};
    this.poses.set(id,{walking,heading:yaw,progress:amount});
  }

  /** One idle + one walk skeleton, no matter how many Ghouls are on the
   * selected floor. Sample the authored clips only while observed. */
  tick(nowSeconds:number):void{
    if(this.disposed||!this.rendered.size)return;
    if(this.idleClip){
      const phase=((nowSeconds%1.958)+1.958)%1.958/1.958;
      this.idleClip.goToFrame(this.idleClip.from+
        (this.idleClip.to-this.idleClip.from)*phase);
    }
    const walking=[...this.poses.values()].filter(p=>p.walking);
    if(walking.length&&this.walkClip){
      const fraction=Math.max(0,Math.min(1,
        Math.max(...walking.map(p=>p.progress))*.24));
      this.walkClip.goToFrame(this.walkClip.from+
        (this.walkClip.to-this.walkClip.from)*fraction);
    }
  }

  reset():void{
    for(const id of this.rendered.keys())this.pose(id,false,null,1);
  }

  dispose():void{
    if(this.disposed)return;
    this.disposed=true;
    for(const visual of this.rendered.values()){
      visual.idle.dispose();visual.walk.dispose();
    }
    this.rendered.clear();this.poses.clear();
    this.idleClip?.stop();this.walkClip?.stop();
    this.walker?.dispose();
    this.asset?.dispose();
    this.siteList=[];
    this.idleSource=null;this.walkSource=null;
  }
}
