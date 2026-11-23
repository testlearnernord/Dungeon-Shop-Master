import {Vector3} from "@babylonjs/core/Maths/math.vector";
import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import type {DungeonViewer} from "./dungeonViewer.ts";
import type {CellarTableVisuals} from "./cellarTableVisuals.ts";
import {generateExpeditionLayout} from "./dungeonLayout.ts";
import {TABLE_DIORAMA_WELL} from "./tableDioramaGeometry.ts";
import {observationMatchPose,observationEase,observationVeil,
  OBSERVATION_SHOP_FLIGHT_SECONDS,OBSERVATION_LIVE_SETTLE_SECONDS,
  type ObservationMatchPose} from "./observationMatchPose.ts";
import type {SpatialDungeonFloor} from "./spatialDungeonExploration.ts";

type Phase="idle"|"shop"|"live";
type SavedShopCamera={
  position:Vector3;target:Vector3;fov:number;
  gravity:boolean;collisions:boolean;
};

/**
 * One continuous, read-only *presentation* across two existing Babylon
 * scenes. No offscreen renderer, new simulation, duplicated dungeon, or
 * world-clock owner. Runs from the existing main engine render loop.
 *
 * Table entry is opt-in at the real furniture. Everywhere else the normal
 * G/toolbar viewer remains immediate. ESC cancels safely at either side.
 */
export class ObservationTransitionDirector{
  private phase:Phase="idle";
  private elapsed=0;
  private profile:ObservationMatchPose|null=null;
  private floor:SpatialDungeonFloor=1;
  private saved:SavedShopCamera|null=null;
  private shopEye:Vector3|null=null;
  private shopTarget:Vector3|null=null;
  private readonly veil:HTMLDivElement;
  private readonly hint:HTMLDivElement;
  private nextHintAt=0;

  constructor(
    private readonly scene:Scene,
    private readonly camera:UniversalCamera,
    private readonly canvas:HTMLCanvasElement,
    private readonly table:CellarTableVisuals,
    private readonly dungeon:DungeonViewer,
    private readonly store:GameStore,
    private readonly canUseShop:()=>boolean,
  ){
    this.veil=document.createElement("div");
    this.veil.id="observation-transition-veil";
    this.veil.setAttribute("aria-hidden","true");
    this.veil.style.opacity="0";
    document.body.append(this.veil);
    this.hint=document.createElement("div");
    this.hint.id="observation-table-hint";
    this.hint.setAttribute("aria-live","off");
    this.hint.hidden=true;
    document.body.append(this.hint);

    // Capture so the shop E-action and dungeon G/Escape handlers never
    // react to a half-completed handoff. The transition has one input owner.
    window.addEventListener("keydown",event=>{
      if(this.phase==="idle")return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(event.code==="Escape")this.cancel();
      else if(event.code==="Space")this.skip();
    },true);
    window.addEventListener("pointerdown",event=>{
      if(this.phase==="idle")return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
    window.addEventListener("wheel",event=>{
      if(this.phase==="idle")return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },{capture:true,passive:false});
    window.addEventListener("blur",()=>{
      if(this.phase!=="idle")this.cancel();
    });
  }

  get isTransitioning():boolean{return this.phase!=="idle";}

  /** The same physical pick used by Galvik's eye-level FPS camera.
   * Ignore the decorative miniature props when looking for the TABLE.
   * No remote cinematic should start from the upper shop or across a wall.
   */
  private tableInSight():boolean{
    if(!this.canUseShop()||this.dungeon.isActive||
       document.querySelector("dialog[open]")||
       document.body.classList.contains("blueprint-active"))return false;
    const root=this.scene.getTransformNodeByName("cellar-table-root");
    const diorama=this.scene.getTransformNodeByName("cellar-table-diorama-root");
    if(!root||!diorama?.isEnabled())return false;
    const tablePos=root.getAbsolutePosition();
    if(Math.hypot(this.camera.position.x-tablePos.x,
      this.camera.position.z-tablePos.z)>4||
      Math.abs(this.camera.position.y-tablePos.y)>4)return false;
    const ray=this.camera.getForwardRay(4);
    const hit=this.scene.pickWithRay(ray,
      mesh=>mesh.name==="cellar-table-fallback"||
        mesh.name.startsWith("cellar-table-model-"));
    if(hit?.hit&&hit.distance<=4)return true;
    // The real table is a recessed frame. A ray through its OPEN central
    // well won't intersect the furniture GLB, although the player's gaze
    // is correctly fixed on the dungeon. Test the tabletop observation
    // plane in parent-local coordinates instead of making it a solid mesh.
    const dy=ray.direction.y;
    if(Math.abs(dy)<.04)return false;
    const distance=(tablePos.y+TABLE_DIORAMA_WELL.floorY-ray.origin.y)/dy;
    if(distance<=0||distance>4)return false;
    root.computeWorldMatrix(true);
    const point=ray.origin.add(ray.direction.scale(distance));
    const local=Vector3.TransformCoordinates(point,
      root.getWorldMatrix().clone().invert());
    return Math.abs(local.x)<=TABLE_DIORAMA_WELL.width/2+.12&&
      Math.abs(local.z-TABLE_DIORAMA_WELL.centerZ)<=
        TABLE_DIORAMA_WELL.depth/2+.12;
  }

  /** Only E at the real physical table starts the cinematic. */
  enter():boolean{
    if(this.phase!=="idle"||!this.tableInSight())return false;
    const floor=this.dungeon.selectedLiveFloor;
    this.table.updateLiveFloor(floor,this.camera.position);
    const diorama=this.scene.getTransformNodeByName("cellar-table-diorama-root");
    const root=this.scene.getTransformNodeByName("cellar-table-root");
    // If the imported model/layout isn't ready, preserve ordinary G. An
    // E tap does not send the player into a blank miniature.
    if(!root||!diorama?.isEnabled()||diorama.metadata?.floor!==floor)
      return false;
    const profile=observationMatchPose(
      generateExpeditionLayout(this.store.state.seed,floor));
    root.computeWorldMatrix(true);
    const world=root.getWorldMatrix();
    const eye=profile.tableEye,target=profile.tableTarget;
    this.shopEye=Vector3.TransformCoordinates(
      new Vector3(eye.x,eye.y,eye.z),world);
    this.shopTarget=Vector3.TransformCoordinates(
      new Vector3(target.x,target.y,target.z),world);
    this.floor=floor;
    this.profile=profile;
    this.saved={
      position:this.camera.position.clone(),target:this.camera.getTarget().clone(),
      fov:this.camera.fov,gravity:this.camera.applyGravity,
      collisions:this.camera.checkCollisions,
    };
    this.camera.detachControl();
    if(document.pointerLockElement===this.canvas)
      void document.exitPointerLock();
    this.camera.cameraDirection.setAll(0);
    this.camera.cameraRotation.setAll(0);
    this.camera.applyGravity=false;
    this.camera.checkCollisions=false;
    this.phase="shop";
    this.elapsed=0;
    this.hint.hidden=true;
    this.veil.style.opacity="0";
    document.body.classList.add("observation-transitioning");
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      this.skip();
    return true;
  }

  /** Called once, before the single active scene renders each frame. */
  update(dt:number):void{
    if(this.phase==="idle"){
      const now=performance.now();
      if(now<this.nextHintAt)return;
      this.nextHintAt=now+180;
      const eligible=this.tableInSight();
      this.hint.hidden=!eligible;
      if(eligible)this.hint.textContent="E · OBSERVE LIVE FLOOR "+
        String(this.dungeon.selectedLiveFloor).padStart(2,"0");
      return;
    }
    if(!Number.isFinite(dt)||dt<0)return;
    this.elapsed+=Math.min(dt,.10);
    if(this.phase==="shop"){
      if(!this.profile||!this.saved||!this.shopEye||!this.shopTarget){
        this.cancel();return;
      }
      const t=Math.min(1,this.elapsed/OBSERVATION_SHOP_FLIGHT_SECONDS);
      const p=observationEase(t);
      this.camera.position.copyFrom(Vector3.Lerp(this.saved.position,
        this.shopEye,p));
      this.camera.setTarget(Vector3.Lerp(this.saved.target,this.shopTarget,p));
      this.camera.fov=this.saved.fov+
        (this.profile.fov-this.saved.fov)*p;
      this.veil.style.opacity=String(observationVeil("shop",t));
      if(t>=1)this.handoff();
      return;
    }
    if(!this.dungeon.isActive){
      this.finish();return;
    }
    const profile=this.profile;
    if(!profile){this.cancel();return;}
    const t=Math.min(1,this.elapsed/OBSERVATION_LIVE_SETTLE_SECONDS);
    this.dungeon.setTableObservationPose({...profile.live,
      distance:profile.live.distance*(1-.055*observationEase(t))});
    this.veil.style.opacity=String(observationVeil("live",t));
    if(t>=1)this.finish();
  }

  private restoreShopCamera():void{
    if(!this.saved)return;
    this.camera.position.copyFrom(this.saved.position);
    this.camera.setTarget(this.saved.target);
    this.camera.fov=this.saved.fov;
    this.camera.applyGravity=this.saved.gravity;
    this.camera.checkCollisions=this.saved.collisions;
    this.camera.cameraDirection.setAll(0);
    this.camera.cameraRotation.setAll(0);
  }

  private handoff():void{
    if(this.phase!=="shop"||!this.profile)return;
    // The body class and single shadow layer remain across the scene swap.
    // Viewer scene creation and the shared camera pose are synchronous,
    // before the next frame renders. There is no frame at a default pose.
    const success=this.dungeon.openTableObservation(
      this.floor,this.profile.live);
    this.restoreShopCamera();
    if(!success){this.cancel();return;}
    this.phase="live";
    this.elapsed=0;
    this.veil.style.opacity=String(observationVeil("live",0));
  }

  private skip():void{
    if(this.phase==="shop"){
      this.handoff();
      if(this.dungeon.isActive)this.finish();
    }
    else if(this.phase==="live"){
      if(this.profile)this.dungeon.setTableObservationPose({
        ...this.profile.live,distance:this.profile.live.distance*.945});
      this.finish();
    }
  }

  /** ESC/blur restores the original physical player position and controls.
   * It does not teleport Galvik or move any LIVE dungeon actor. */
  private cancel():void{
    if(this.phase==="idle")return;
    if(this.dungeon.isActive)this.dungeon.close();
    this.restoreShopCamera();
    this.finish();
    this.camera.attachControl(this.canvas,true);
  }

  private finish():void{
    this.phase="idle";
    this.elapsed=0;
    this.profile=null;
    this.saved=null;
    this.shopEye=null;
    this.shopTarget=null;
    this.veil.style.opacity="0";
    document.body.classList.remove("observation-transitioning");
    this.hint.hidden=true;
    this.nextHintAt=performance.now()+250;
    this.canvas.focus();
  }
}
