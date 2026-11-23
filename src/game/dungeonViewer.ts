import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/instancedMesh"; // Registers createInstance for Babylon ES modules.
import { Scene } from "@babylonjs/core/scene";
import type { GameStore } from "./gameStore.ts";
import type {GameSfx} from "../gameSfx.ts";
import type {GameState} from "./gameState.ts";
import { createHeroVisual } from "./heroVisual.ts";
import type { HeroVisual } from "./heroVisual.ts";
import { DungeonReplayScene, type DungeonTileMesh, type DungeonMarkerMesh, type DungeonRoomDecoration } from "./dungeonReplayScene.ts";
import {buildDungeonPlayback} from "./dungeonReplayPlayback.ts";
import type { SpatialDungeonReplay,SpatialDungeonFloor } from "./spatialDungeonExploration.ts";
import { observeReplay } from "../replayDisclosure.ts";
import {selectLiveSpectatorFrame,type LiveSpectatorFrame} from "./liveSpectator.ts";
import {
  selectLiveFloorSpectatorFrame,LIVE_SPECTATOR_FLOORS,
  type LiveFloorSpectatorFrame,type LiveFloorFight,
} from "./liveFloorSpectator.ts";
import {LiveGroupCombatArena,type CombatArenaView} from "./liveGroupCombatArena.ts";
import { heroDisplayNames } from "./heroIdentity.ts";
import {selectHeroFloorPerception} from "./heroPerception.ts";
import {getDungeonSurfaces} from "./dungeonSurfaces.ts";
import {createGhoulCryptRoom} from "./ghoulCryptArt.ts";
import {createGhoulMapIconMaterial} from "./dungeonGhoulMapIcon.ts";
import {dungeonFloorStairways} from "./dungeonStairways.ts";
import {createDungeonStairwayProp} from "./dungeonStairProps.ts";
import {createDungeonFeaturePalette,createReadableDungeonChest,
  createReadableDungeonTrap} from "./dungeonFeatureProps.ts";
import {installGhoulMapInstances,type GhoulMapSite}
  from "./dungeonGhoulMapInstances.ts";
import {dungeonPreviewExplanation} from "./dungeonIntentPreview.ts";
import {liveHeroCard,recordedHeroCard} from "./heroCardView.ts";
import {renderHeroCard} from "../heroCard.ts";
import {hoverHeroId,hideHeroHover} from "../worldHeroCards.ts";
import {minimapPointFromClient,isKnownMinimapCell}
  from "./dungeonMinimapNavigation.ts";
import {DUNGEON_WORLD_TILE_SIZE,DUNGEON_DEFAULT_PITCH,
  DUNGEON_DEFAULT_DISTANCE,dungeonTileWorldCenter,orientNorthUpMinimap}
  from "./dungeonObservationOrientation.ts";
import {floorHeroLocatorOptions,floorFightLocatorOptions}
  from "./liveDungeonInspector.ts";
import {mapPoseFromCamera,mapCameraPosition,mapCameraTarget,
  orbitDungeonMap,panDungeonMap,zoomDungeonMap,DUNGEON_NORTH_YAW,
  dungeonNorthNeedleDegrees,
  type DungeonMapPose} from "./dungeonMapCamera.ts";
import {
  generateExpeditionLayout, tileAt, type DungeonLayout,
  type DungeonFeature, type DungeonPoint,
} from "./dungeonLayout.ts";

const TILE_SIZE = DUNGEON_WORLD_TILE_SIZE;
const WALL_HEIGHT = 4.5;
const getWorld = (map: DungeonLayout, p: DungeonPoint) => {
  const at=dungeonTileWorldCenter(map,p);
  return new Vector3(at.x,0,at.z);
};
const isInteractiveTarget=(target:EventTarget|null):boolean=>
  target instanceof Element&&(!!target.closest("#music-panel, #dungeon-hud")||
    target.matches("button,input,select,textarea,a[href],[contenteditable='true']"));

/**
 * A strictly read-only map inspection scene. No fake AI/replay, no merchant
 * state mutations. A later milestone will populate the same geometry with
 * authoritative hero routes and group encounters.
 */
export class DungeonViewer {
  private scene: Scene | null = null;
  private camera: UniversalCamera | null = null;
  private layout: DungeonLayout | null = null;
  private active = false;
  // Only ordinary shop G / toolbar entry delegates to the physical table.
  // Worldwide hero inspection, recordings and event jumps stay immediate.
  private onShopOpenRequest:()=>void=()=>this.open();
  private readonly keys = new Set<string>();
  private orbitPointer:null|{
    button:0|2;lastX:number;lastY:number;startX:number;startY:number;moved:boolean;
  }=null;
  private suppressNextMapClick=false;
  private readonly hoverTooltip=document.querySelector<HTMLElement>(
    "#dungeon-hover-tooltip")!;
  private readonly mapStatus=document.querySelector<HTMLElement>(
    "#dungeon-map-status")!;
  private readonly mapCounts=document.querySelector<HTMLElement>(
    "#dungeon-map-counts")!;
  private readonly panel = document.querySelector<HTMLElement>("#dungeon-hud")!;
  private readonly toolbar = this.panel.querySelector<HTMLElement>(".dungeon-toolbar")!;
  private readonly summary = document.querySelector<HTMLElement>("#dungeon-summary")!;
  private readonly focusLabel = document.querySelector<HTMLElement>("#dungeon-focus")!;
  private readonly seedLabel = document.querySelector<HTMLElement>("#dungeon-seed")!;
  private readonly minimap = document.querySelector<HTMLCanvasElement>("#dungeon-minimap")!;
  private readonly compassNeedle=document.querySelector<HTMLElement>("#dungeon-compass-needle")!;
  private readonly compassButton=document.querySelector<HTMLButtonElement>("#dungeon-compass-reset")!;
  private landmarks: { name: string; point: DungeonPoint }[] = [];
  private focus = 0;
  private replayScene: DungeonReplayScene | null = null;
  private readonly liveArena:LiveGroupCombatArena;
  private playing = false;
  private playbackTime = 0;
  private playbackSpeed = 1;
  private archivePlayingBeforeIntro=false;
  /** Read-only Level-10 party tape. It has no live GameStore combat owner. */
  private archivedPartyBoss:{view:CombatArenaView;time:number}|null=null;
  private followActor: string | null = null;
  private liveHeroId: string | null = null;
  private liveFloor:SpatialDungeonFloor|null=null;
  private liveFloorFightId:string|null=null;
  private selectedFloorHeroId:string|null=null;
  private liveFloorProjectionCache:null|{
    readonly floor:SpatialDungeonFloor;
    readonly adventurers:GameState["adventurers"];
    readonly liveDungeon:GameState["liveDungeon"];
    readonly dungeonWorlds:GameState["dungeonWorlds"];
    readonly dungeonParties:GameState["dungeonParties"];
    readonly view:LiveFloorSpectatorFrame;
  }=null;
  private liveWorldTick=-1;
  private liveProjectionCache:null|{
    readonly heroId:string;
    readonly adventurers:GameState["adventurers"];
    readonly liveDungeon:GameState["liveDungeon"];
    readonly dungeonWorlds:GameState["dungeonWorlds"];
    readonly dungeonParties:GameState["dungeonParties"];
    readonly view:LiveSpectatorFrame;
  }=null;
  private readonly replaySelector = document.querySelector<HTMLSelectElement>("#dungeon-replay-select")!;
  private readonly floorSelector=document.querySelector<HTMLSelectElement>("#dungeon-floor-select")!;
  private readonly heroLocatorLabel=document.querySelector<HTMLElement>("#dungeon-hero-locator-label")!;
  private readonly heroLocator=document.querySelector<HTMLSelectElement>("#dungeon-hero-locator")!;
  private heroLocatorSignature="";
  private readonly fightLocatorLabel=document.querySelector<HTMLElement>("#dungeon-fight-locator-label")!;
  private readonly fightLocator=document.querySelector<HTMLSelectElement>("#dungeon-fight-locator")!;
  private fightLocatorSignature="";
  private readonly archiveControls=document.querySelector<HTMLElement>("#dungeon-archive-controls")!;
  private readonly archiveButton=document.querySelector<HTMLButtonElement>("#dungeon-open-archive")!;
  private readonly heroDetailPanel=document.querySelector<HTMLElement>("#dungeon-hero-detail")!;
  private recordedCardSignature="";
  private readonly heroDetailTitle=document.querySelector<HTMLElement>("#dungeon-hero-detail-title")!;
  private readonly heroDetailValues=document.querySelector<HTMLElement>("#dungeon-hero-detail-values")!;
  private readonly clearHeroButton=document.querySelector<HTMLButtonElement>("#dungeon-clear-hero")!;
  private readonly backLiveButton=document.querySelector<HTMLButtonElement>("#dungeon-back-live")!;
  private readonly playbackControls = document.querySelector<HTMLElement>("#dungeon-playback-controls")!;
  private readonly watchCombatButton=document.querySelector<HTMLButtonElement>("#dungeon-watch-live-combat")!;
  private readonly returnCombatButton=document.querySelector<HTMLButtonElement>("#dungeon-return-from-combat")!;
  private readonly liveCombatPanel=document.querySelector<HTMLElement>("#dungeon-live-combat-summary")!;
  private readonly liveCombatDetails=document.querySelector<HTMLElement>("#dungeon-live-combat-actors")!;
  private readonly fightIntroPanel=document.querySelector<HTMLElement>("#dungeon-fight-cinematic")!;
  private readonly fightIntroCaption=document.querySelector<HTMLElement>("#dungeon-fight-intro-caption")!;
  private readonly fightIntroProgress=document.querySelector<HTMLElement>("#dungeon-fight-intro-progress")!;
  private readonly fightIntroSkipButton=document.querySelector<HTMLButtonElement>("#dungeon-skip-intro")!;
  private readonly playbackButton = document.querySelector<HTMLButtonElement>("#dungeon-play")!;
  private readonly timeSlider = document.querySelector<HTMLInputElement>("#dungeon-timeline")!;
  private readonly timeLabel = document.querySelector<HTMLElement>("#dungeon-clock")!;
  private readonly playbackStatus = document.querySelector<HTMLElement>("#dungeon-playback-status")!;
  private readonly modeDescription = document.querySelector<HTMLElement>("#dungeon-mode-description")!;
  private readonly minimapTitle = document.querySelector<HTMLElement>("#dungeon-minimap-heading")!;
  private readonly minimapNote = document.querySelector<HTMLElement>("#dungeon-minimap-note")!;
  private readonly musicToggle = document.querySelector<HTMLButtonElement>("#music-toggle")!;
  private readonly temporaryPartyPanel = document.querySelector<HTMLElement>("#dungeon-temporary-party")!;
  private readonly temporaryPartyHeading = document.querySelector<HTMLElement>("#dungeon-temporary-party-heading")!;
  private readonly temporaryPartyMembers = document.querySelector<HTMLUListElement>("#dungeon-temporary-party-members")!;

  constructor(
    private readonly engine: Engine,
    private readonly canvas: HTMLCanvasElement,
    private readonly shopCamera: UniversalCamera,
    private readonly store: GameStore,
    private readonly sceneChanged: (active: boolean) => void,
    private readonly fightSoundtrackChanged:
      (active:boolean,boss:boolean)=>void=()=>{},
    private readonly skipCombatScoreTo:(seconds:number)=>void=()=>{},
    private readonly sfx?:GameSfx,
  ) {
    // The hero/fight locators can add rows after LIVE data arrives.
    // Observe the real header height instead of stacking the overview at
    // a hard-coded offset that overlaps an interactive select.
    new ResizeObserver(()=>this.alignHudPanels()).observe(this.toolbar);
    window.addEventListener("resize",()=>this.alignHudPanels());
    this.liveArena=new LiveGroupCombatArena(engine,canvas,this.panel,this.sfx,store);
    this.watchCombatButton.addEventListener("click",()=>{
      if(this.liveFloor!==null)this.watchFloorCombat();
      else if(this.liveHeroId)this.watchLiveCombat();
      else this.watchRecordedCombat();
    });
    this.returnCombatButton.addEventListener("click",()=>this.returnToDungeonMap());
    this.fightIntroSkipButton.addEventListener("click",()=>
      this.skipFightIntro());
    this.clearHeroButton.addEventListener("click",()=>{
      this.selectFloorHero(null);
      this.canvas.focus();
    });
    // Clicking the encounter beacon opts in; toolbar remains keyboard accessible.
    this.canvas.addEventListener("click",event=>{
      if(!this.active||!this.scene||this.liveArena.isActive)return;
      if(this.suppressNextMapClick){
        this.suppressNextMapClick=false;
        return; // A drag must never also select an unrelated hero.
      }
      const rect=this.canvas.getBoundingClientRect();
      const picked=this.scene.pick(event.clientX-rect.left,
        event.clientY-rect.top,mesh=>mesh.metadata?.abstractBattle===true);
      if(picked?.hit){
        if(this.liveFloor!==null)
          this.watchFloorCombat(picked.pickedMesh?.metadata?.fightId as string|undefined);
        else if(this.liveHeroId)this.watchLiveCombat();
        else this.watchRecordedCombat();
        return;
      }
      // Hero picking is a read-only map interaction. A clear floor click
      // deselects; combat beacons above always take priority.
      if(this.liveFloor!==null){
        const heroPick=this.scene.pick(event.clientX-rect.left,
          event.clientY-rect.top,mesh=>typeof mesh.metadata?.floorHeroId==="string");
        this.selectFloorHero(heroPick?.hit
          ?heroPick.pickedMesh?.metadata?.floorHeroId as string:null);
      }
    });
    document.querySelector("#open-dungeon")!.addEventListener("click", () => this.onShopOpenRequest());
    document.querySelector("#close-dungeon")!.addEventListener("click", () => this.close());
    document.querySelector("#dungeon-reset-camera")!.addEventListener("click", () => this.resetCamera());
    this.compassButton.addEventListener("click",()=>{
      if(!this.active||this.liveArena.isActive)return;
      const pose=this.mapPose();
      if(pose)this.setMapPose({...pose,yaw:DUNGEON_NORTH_YAW});
      this.canvas.focus();
    });
    this.replaySelector.addEventListener("change",()=>{
      const id=this.replaySelector.value;
      if(id.startsWith("live:"))this.startLive(id.slice(5));
      else this.selectReplay(id);
    });
    this.floorSelector.addEventListener("change",()=>{
      const floor=Number(this.floorSelector.value);
      if(LIVE_SPECTATOR_FLOORS.some(candidate=>candidate===floor))
        this.startFloor(floor as SpatialDungeonFloor);
    });
    this.minimap.addEventListener("click",event=>{
      if(!this.active||this.liveFloor===null||this.liveArena.isActive||
         !this.layout)return;
      const rect=this.minimap.getBoundingClientRect();
      const known=this.minimapKnownTiles();
      if(known===null)return;
      const cell=minimapPointFromClient(event.clientX,event.clientY,rect,
        this.layout.width,this.layout.height,known);
      if(cell)this.focusMinimapTile(cell,known);
    });
    this.minimap.addEventListener("keydown",event=>{
      if(!this.active||this.liveFloor===null||this.liveArena.isActive||
         !this.layout)return;
      const offset=event.code==="ArrowLeft"?{x:-1,z:0}:
        event.code==="ArrowRight"?{x:1,z:0}:
        event.code==="ArrowUp"?{x:0,z:1}:
        event.code==="ArrowDown"?{x:0,z:-1}:null;
      if(!offset)return;
      event.preventDefault();event.stopPropagation();
      const pose=this.mapPose();
      if(!pose)return;
      const cell={x:Math.round(pose.x/TILE_SIZE+(this.layout.width-1)/2)+offset.x,
        z:Math.round(pose.z/TILE_SIZE+(this.layout.height-1)/2)+offset.z};
      this.focusMinimapTile(cell,this.minimapKnownTiles());
    });
    this.heroLocator.addEventListener("change",()=>{
      if(!this.active||this.liveFloor===null||this.liveArena.isActive)return;
      this.selectFloorHero(this.heroLocator.value||null);
      this.canvas.focus();
    });
    this.fightLocator.addEventListener("change",()=>{
      if(!this.active||this.liveFloor===null||this.liveArena.isActive||
        !this.layout)return;
      const view=selectLiveFloorSpectatorFrame(this.store.state,this.liveFloor);
      const fight=view?.fights.find(item=>item.id===this.fightLocator.value);
      if(!fight)return;
      // Focusing a fight switches back to the spectator's full-floor
      // overview. Do not project one hero's private vision onto the map.
      this.selectFloorHero(null);
      this.liveFloorFightId=fight.id;
      const target=getWorld(this.layout,fight),pose=this.mapPose();
      if(pose)this.setMapPose({...pose,x:target.x,z:target.z});
      this.focusLabel.textContent="Focused LIVE encounter · ("+
        fight.x+", "+fight.z+")";
      this.canvas.focus();
    });
    this.archiveButton.addEventListener("click",()=>{
      const first=this.availableReplays()[0]?.id??"preview";
      this.selectReplay(first);
      this.replaySelector.focus();
    });
    this.backLiveButton.addEventListener("click",()=>{
      const floor=Number(this.floorSelector.value);
      this.startFloor(LIVE_SPECTATOR_FLOORS.some(f=>f===floor)
        ?floor as SpatialDungeonFloor:1);
      this.floorSelector.focus();
    });
    this.playbackButton.addEventListener("click",()=>this.togglePlayback());
    document.querySelector("#dungeon-restart")!.addEventListener("click",()=>this.restartReplay());
    document.querySelector<HTMLSelectElement>("#dungeon-speed")!.addEventListener("change",event=>{
      const speed=Number((event.target as HTMLSelectElement).value);
      this.playbackSpeed=[0.5,1,2,4].includes(speed)?speed:1;
    });
    this.timeSlider.addEventListener("input",()=>{
      if(!this.replayScene?.currentReplay)return;
      this.playbackTime=this.replayScene.duration*Number(this.timeSlider.value)/1000;
      this.paintPlayback();
    });
    window.addEventListener("keydown", event => {
      // Give the shared hero inspector first refusal on Escape; do not
      // accidentally close the entire spectator arena behind its card.
      if(!document.querySelector<HTMLElement>("#world-hero-card")?.hidden)
        return;
      if (!this.active) {
        if (event.code === "KeyG" && !event.repeat &&
          !document.querySelector("dialog[open]") &&
          !document.body.classList.contains("arena-active")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.onShopOpenRequest();
        }
        return;
      }
      // Esc must leave the opted-in arena even when its Return button has
      // keyboard focus; the normal dungeon toolbar remains interactive.
      if(event.code==="Escape"&&this.liveArena.isActive){
        event.preventDefault();event.stopImmediatePropagation();
        this.returnToDungeonMap();
        return;
      }
      if(this.liveArena.isIntroActive &&
         (event.code==="Space"||event.code==="Enter")&&!event.repeat){
        event.preventDefault();event.stopImmediatePropagation();
        this.skipFightIntro();
        return;
      }
      if(event.code==="Tab"&&this.liveArena.isIntroActive&&!event.repeat){
        event.preventDefault();event.stopImmediatePropagation();
        this.fightIntroSkipButton.focus();
        return;
      }
      if(event.code==="Tab"&&this.liveArena.isActive&&!event.repeat){
        event.preventDefault();event.stopImmediatePropagation();
        const actorId=this.liveArena.nextFocus();
        this.focusLabel.textContent="TAB focus: "+(actorId??"free camera");
        return;
      }
      if(isInteractiveTarget(event.target))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(event.code==="Escape"&&this.liveArena.isActive)this.returnToDungeonMap();
      else if (event.code === "KeyG" || event.code === "Escape") this.close();
      else if (event.code === "Tab" && !event.repeat) {
        if(this.replayScene&&(this.replayScene.currentReplay||this.liveHeroId||
           this.liveFloor!==null)){
          const order=[...this.replayScene.visibleFocusIds,null];
          const previous=order.indexOf(this.followActor);
          this.followActor=order[(previous+1)%order.length]??null;
          if(this.liveFloor!==null){
            this.selectedFloorHeroId=this.followActor;
            const view=selectLiveFloorSpectatorFrame(this.store.state,this.liveFloor);
            if(view)this.paintFloor(view);
          }else if(this.liveHeroId){
            const view=selectLiveSpectatorFrame(this.store.state,this.liveHeroId);
            if(view)this.paintLive(view);
          }else this.paintPlayback();
        }else this.centerOn(this.focus+1);
      }
      else if (event.code === "KeyR" && !event.repeat) this.resetCamera();
      else if (event.code === "Space" && !event.repeat) this.togglePlayback();
      else if (event.code === "KeyM" && !event.repeat) this.musicToggle.focus();
      else {
        this.keys.add(event.code);
        if(["KeyW","KeyA","KeyS","KeyD","KeyQ","KeyE"].includes(event.code))
          this.followActor=null;
      }
    }, true);
    window.addEventListener("keyup", event => {
      if (!this.active) return;
      if(isInteractiveTarget(event.target))return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.keys.delete(event.code);
    }, true);
    window.addEventListener("blur", () => this.keys.clear());
    // Both mouse buttons can orbit and tilt the floor map by dragging.
    // A stationary left click still picks a hero/combat marker as before.
    canvas.addEventListener("pointerdown",event=>{
      if(!this.active||!this.camera||this.liveArena.isActive||
        (event.button!==0&&event.button!==2))return;
      this.orbitPointer={button:event.button as 0|2,
        startX:event.clientX,startY:event.clientY,
        lastX:event.clientX,lastY:event.clientY,moved:false};
      if(event.button===2)event.preventDefault();
    },true);
    window.addEventListener("pointermove",event=>{
      if(!this.active||!this.scene||!this.camera||this.liveArena.isActive)
        return;
      const drag=this.orbitPointer;
      if(drag&&(event.buttons&(drag.button===0?1:2))){
        const dx=event.clientX-drag.lastX,dy=event.clientY-drag.lastY;
        drag.lastX=event.clientX;drag.lastY=event.clientY;
        if(Math.hypot(event.clientX-drag.startX,
          event.clientY-drag.startY)>4)drag.moved=true;
        if(drag.moved){
          event.preventDefault();
          const pose=this.mapPose();
          if(pose&&this.layout){
            // Mouse orbit is unrestricted; the compass preserves bearing.
            this.setMapPose(orbitDungeonMap(pose,dx,dy));
          }
          this.followActor=null;
          this.hoverTooltip.hidden=true;
        }
        return;
      }
      this.showMapHover(event.clientX,event.clientY);
    },true);
    window.addEventListener("pointerup",event=>{
      const drag=this.orbitPointer;
      if(drag&&event.button===drag.button){
        if(drag.moved&&drag.button===0)this.suppressNextMapClick=true;
        this.orbitPointer=null;
      }
    },true);
    window.addEventListener("blur",()=>{this.orbitPointer=null;});
    canvas.addEventListener("contextmenu",event=>{
      if(this.active&&!this.liveArena.isActive)event.preventDefault();
    },true);
    canvas.addEventListener("pointerleave",()=>{
      this.hoverTooltip.hidden=true;hideHeroHover();
    });
    // Use the same spectator mouse-flight contract as Level-6, but only
    // after opting into the actual 3D fight. Map picking stays untouched.
    canvas.addEventListener("pointerdown",()=>{
      if(!this.active||!this.liveArena.isActive||
         this.liveArena.isIntroActive)return;
      if(document.pointerLockElement!==canvas)void canvas.requestPointerLock();
    },true);
    document.addEventListener("mousemove",event=>{
      if(!this.active||!this.liveArena.isActive||
         document.pointerLockElement!==canvas)return;
      this.liveArena.turnCamera(event.movementX,event.movementY);
    },true);
    window.addEventListener("wheel", event => {
      if (!this.active || !this.camera || this.liveArena.isActive) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pose=this.mapPose();
      if(pose)this.setMapPose(zoomDungeonMap(pose,event.deltaY));
      this.followActor=null;
    }, {capture:true,passive:false});
  }

  setShopOpenRequest(request:()=>void):void{
    this.onShopOpenRequest=request;
  }

  get isActive() { return this.active; }
  get isWatchingLive() { return this.active&&(this.liveFloor!==null||this.liveHeroId!==null); }
  get currentScene(): Scene | null {
    return this.active?(this.liveArena.currentScene??this.scene):null;
  }
  get map(): DungeonLayout | null { return this.layout; }

  /** Authoritative UI floor selection shared with Galvik's physical
   * table. The diorama consumes the same LIVE projection contract, but owns
   * neither spectator cameras nor gameplay state. */
  get selectedLiveFloor():SpatialDungeonFloor{
    const selected=Number(this.floorSelector.value);
    return LIVE_SPECTATOR_FLOORS.find(floor=>floor===selected)??1;
  }

  /** Position the read-only floor rail/minimap below the actual toolbar,
   * including when the hero locator wraps, fonts change or the window resizes.
   * This is presentation only; no game-world simulation work is scheduled. */
  private alignHudPanels():void {
    if(this.panel.hidden)return;
    const bottom=this.toolbar.getBoundingClientRect().bottom;
    if(bottom>0)this.panel.style.setProperty(
      "--dungeon-panels-top",Math.ceil(bottom+12)+"px");
  }

  open(initialReplayId?:string,entryFloor:SpatialDungeonFloor=1): void {
    if (this.active || document.querySelector("dialog[open]") ||
      document.body.classList.contains("arena-active")) return;
    this.shopCamera.detachControl();
    if (document.pointerLockElement) void document.exitPointerLock();
    this.active = true;
    this.keys.clear();
    document.body.classList.add("dungeon-active");
    this.panel.hidden = false;
    this.alignHudPanels();
    // Build the final floor immediately. Creating a throwaway Floor 7
    // scene here would stall the single cinematic handoff for no reason.
    this.layout = generateExpeditionLayout(this.store.state.seed,
      initialReplayId?7:entryFloor);
    this.createScene(this.layout);
    this.refreshReplaySelector(initialReplayId,entryFloor);
    // LIVE floor overview is the default. Archive opens only intentionally.
    if (this.replayScene?.currentReplay) this.replaySelector.focus();
    else this.floorSelector.focus();
    this.sceneChanged(true);
  }

  /** Exact match-frame entry: no default-floor frame is ever rendered.
   * Keep this distinct from replay, hero and world-event navigation. */
  openTableObservation(
    floor:SpatialDungeonFloor,pose:DungeonMapPose,
  ):boolean{
    if(this.active||!LIVE_SPECTATOR_FLOORS.includes(floor))return false;
    this.open(undefined,floor);
    if(!this.active||this.liveFloor!==floor)return false;
    this.followActor=null;
    this.setMapPose(pose);
    this.focusLabel.textContent="GALVIK'S TABLE · LIVE Floor "+floor;
    return true;
  }

  /** During the short scene handoff only the read-only map camera moves.
   * All world actor positions, floor selections and game state stay fixed. */
  setTableObservationPose(pose:DungeonMapPose):void{
    if(this.active&&this.liveFloor!==null&&!this.liveArena.isActive)
      this.setMapPose(pose);
  }

  /** Enter through an explicit Board choice. Do not make remote hero
   * vitality or location available to the ordinary shop HUD. */
  openLive(heroId:string):boolean {
    const view=selectLiveSpectatorFrame(this.store.state,heroId);
    if(!view)return false;
    if(!this.active)this.open();
    return this.active&&this.startFloor(view.floor,heroId);
  }

  /** World Echoes jumps to the ACTUAL event tile, not wherever that
   * adventurer may have wandered by the time the toast is clicked. */
  openFloorSite(floor:number,x:number,z:number):boolean{
    if(!LIVE_SPECTATOR_FLOORS.some(value=>value===floor))return false;
    const layout=generateExpeditionLayout(this.store.state.seed,floor);
    if(!Number.isInteger(x)||!Number.isInteger(z)||
       x<0||z<0||x>=layout.width||z>=layout.height||
       tileAt(layout,x,z)==="wall")return false;
    if(!this.active)this.open();
    if(!this.active||!this.startFloor(floor as SpatialDungeonFloor))return false;
    const pose=this.mapPose();
    if(!pose)return false;
    const target=getWorld(layout,{x,z});
    this.setMapPose({...pose,x:target.x,z:target.z});
    this.followActor=null;
    this.focusLabel.textContent="WORLD ECHO · Floor "+floor+
      " · tile ("+x+", "+z+")";
    return true;
  }

  /** A global feed click opens precisely the active recorded combat
   * authority. It never spawns a new Ghoul or re-simulates a completed fight. */
  openLiveEncounter(fightId:string):boolean {
    const encounter=this.store.state.liveDungeon.combats.find(f=>f.id===fightId);
    const boss=this.store.state.liveDungeon.partyBossCombat;
    const floor=encounter?.encounter.floor??(boss?.id===fightId?10:null);
    if(floor===null)return false;
    if(!this.active)this.open();
    if(!this.active||!this.startFloor(floor))return false;
    this.watchFloorCombat(fightId);
    return this.liveArena.isActive&&this.liveArena.observedFightId===fightId;
  }

  /** Reopen the actual committed multi-hero Cave Troll fight. No reroll,
   * no invented survivor or present-day party equipment leakage.
   * Playback samples saved 60Hz frames in the existing 3D group arena.
   */
  openRecordedPartyBoss(eventId:string):boolean{
    const event=this.store.state.events.find(e=>e.id===eventId);
    const tape=event?.partyBossReplay;
    if(!tape?.frames.length)return false;
    if(!this.active)this.open();
    if(!this.active||!this.startFloor(10))return false;
    const view:CombatArenaView={
      heroes:tape.actors.filter(actor=>actor.team==="heroes").map(actor=>({
        id:actor.id,
        role:actor.role==="monster"?"DPS":actor.role,
        equipment:actor.equipment??{weapon:null,armor:null},
        health:actor.hp,
      })),
      combat:{
        id:"archived-party-boss:"+eventId,
        featureId:"cave-troll",x:0,z:0,
        actors:tape.actors,frame:tape.frames[0],
        frames:tape.frames,cues:tape.cues,
      },
    };
    if(!this.liveArena.watch(view,"recorded"))return false;
    // A completed recording is not affected by the changing LIVE floor.
    this.liveFloor=null;this.liveHeroId=null;
    this.liveFloorFightId=null;this.liveFloorProjectionCache=null;
    this.archivedPartyBoss={view,time:0};
    this.playing=true;
    this.enterFightSoundtrack(tape.actors);
    this.paintCombatIntro();
    this.watchCombatButton.hidden=true;
    this.returnCombatButton.hidden=false;
    this.panel.dataset.liveCombatMode="arena";
    this.modeDescription.textContent="ARCHIVED FLOOR 10 · CAVE TROLL PARTY · "+
      "true committed combat footage (read-only)";
    this.returnCombatButton.focus();
    return true;
  }

  /** A won fight in World Echoes opens the actual, immutable saved
   * encounter at its FIRST recorded frame. Do not simulate it a second time
   * or open a now-unrelated live fight at the same dungeon location. */
  openRecordedCombat(eventId:string,featureId:string,siteCycle=0):boolean{
    const tape=this.availableReplays().find(entry=>entry.id===eventId)?.record;
    if(!tape)return false;
    const timeline=buildDungeonPlayback(tape);
    const segment=timeline.segments.find(item=>item.kind==="combat"&&
      item.encounter?.featureId===featureId&&
      (item.encounter.siteCycle??0)===siteCycle&&
      item.encounter.combat.outcome==="heroes"&&
      item.encounter.combat.frames.length>0);
    if(!segment)return false;
    const start=segment.start+Math.min(.001,(segment.end-segment.start)/2);
    if(!this.openReplayAt(eventId,start))return false;
    this.playing=true;
    this.watchRecordedCombat();
    return this.liveArena.isActive;
  }

  /** An explicit death notice opens the REAL fatal battle from its first
   * saved frame. Trap-only deaths show the real recorded expedition instead.
   * No dungeon clock, fight state, RNG or hero is ever replay-simulated. */
  openDeathReplay(eventId:string,heroId:string):boolean{
    const tape=this.availableReplays().find(entry=>entry.id===eventId)?.record;
    if(!tape||tape.heroId!==heroId)return false;
    const timeline=buildDungeonPlayback(tape);
    const fatal=timeline.segments.find(segment=>segment.kind==="combat"&&
      segment.encounter?.combat.frames.some(frame=>
        frame.actors.some(actor=>actor.id===heroId&&actor.hp<=0)));
    const start=fatal?Math.min(fatal.end-.001,fatal.start+.001):0;
    if(!this.openReplayAt(eventId,start))return false;
    this.playing=true;
    if(fatal){
      this.watchRecordedCombat();
      return this.liveArena.isActive;
    }
    this.paintPlayback();
    return true;
  }

  /** Open exactly one already committed tape and seek solely its LOCAL
   * playback clock. This is deliberately independent of shared world time. */
  openReplayAt(id:string,seconds=0):boolean {
    if(!this.availableReplays().some(entry=>entry.id===id))return false;
    if(!this.active)this.open(id);
    else this.selectReplay(id);
    if(!this.active||this.replaySelector.value!==id||
       !this.replayScene?.currentReplay)return false;
    this.playbackTime=Math.max(0,Math.min(this.replayScene.duration,seconds));
    this.playing=false;
    this.paintPlayback();
    return true;
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.keys.clear();
    this.orbitPointer=null;
    this.hoverTooltip.hidden=true;
    this.mapStatus.hidden=true;
    document.body.classList.remove("dungeon-active");
    this.panel.hidden = true;
    this.replayScene?.dispose();
    this.replayScene=null;
    this.playing=false;
    this.archivePlayingBeforeIntro=false;
    this.archivedPartyBoss=null;
    this.followActor=null;
    this.liveHeroId=null;
    this.liveFloor=null;this.liveFloorFightId=null;
    this.mapStatus.hidden=true;
    this.selectedFloorHeroId=null;this.heroDetailPanel.hidden=true;
    this.heroLocatorLabel.hidden=true;
    this.heroLocator.value="";
    this.heroLocatorSignature="";
    this.minimap.tabIndex=-1;
    this.fightLocatorLabel.hidden=true;
    this.fightLocator.value="";
    this.fightLocatorSignature="";
    this.liveFloorProjectionCache=null;
    this.liveWorldTick=-1;
    this.liveProjectionCache=null;
    this.leaveLiveCombat(false);
    this.liveCombatPanel.hidden=true;
    this.scene?.dispose();
    this.scene = null;
    this.camera = null;
    this.layout = null;
    this.landmarks = [];
    this.sceneChanged(false);
    this.shopCamera.attachControl(this.canvas,true);
    this.canvas.focus();
  }

  private mapPose():DungeonMapPose|null {
    return this.camera?mapPoseFromCamera(this.camera.position,
      this.camera.getTarget()):null;
  }
  private setMapPose(pose:DungeonMapPose):void{
    if(!this.camera)return;
    const p=mapCameraPosition(pose),t=mapCameraTarget(pose);
    this.camera.position.set(p.x,p.y,p.z);
    this.camera.setTarget(new Vector3(t.x,t.y,t.z));
    this.updateCompass();
  }
  private updateCompass():void {
    const pose=this.mapPose();
    if(!pose)return;
    this.compassNeedle.style.transform=
      "rotate("+dungeonNorthNeedleDegrees(pose.yaw)+"deg)";
    const heading=((pose.yaw*180/Math.PI)%360+360)%360;
    this.compassButton.title="North bearing · camera "+Math.round(heading)+
      "° · Click to face north · R resets full view";
  }
  /** Minimap controls are spectator camera actions only. Personal fog
   * cannot be bypassed by moving the camera to an unseen cell. */
  private minimapKnownTiles():ReadonlySet<number>|undefined|null{
    if(!this.layout||this.liveFloor===null)return null;
    if(!this.selectedFloorHeroId)return undefined;
    const view=selectLiveFloorSpectatorFrame(this.store.state,this.liveFloor);
    if(!view||!view.heroes.some(h=>h.id===this.selectedFloorHeroId))
      return null;
    return selectHeroFloorPerception(this.layout,view,
      this.selectedFloorHeroId)?.explored??null;
  }

  private focusMinimapTile(
    cell:DungeonPoint,known:ReadonlySet<number>|undefined|null,
  ):void{
    if(!this.active||this.liveFloor===null||this.liveArena.isActive||
       !this.layout||known===null||
       !isKnownMinimapCell(cell,this.layout.width,this.layout.height,known))
      return;
    const pose=this.mapPose();
    if(!pose)return;
    const target=getWorld(this.layout,cell);
    this.setMapPose({...pose,x:target.x,z:target.z});
    this.followActor=null;
    this.focusLabel.textContent="Minimap camera · Floor "+this.liveFloor+
      " · tile ("+cell.x+", "+cell.z+")";
  }

  private showMapHover(clientX:number,clientY:number):void{
    if(!this.scene||this.liveFloor===null){
      this.hoverTooltip.hidden=true;return;
    }
    const rect=this.canvas.getBoundingClientRect();
    const hit=this.scene.pick(clientX-rect.left,clientY-rect.top,mesh=>
      typeof mesh.metadata?.floorHeroId==="string"||
      typeof mesh.metadata?.spectatorFeatureId==="string"||
      typeof mesh.metadata?.dungeonStairwayId==="string"||
      mesh.metadata?.abstractBattle===true);
    const meta=hit?.pickedMesh?.metadata;
    const view=this.liveFloorProjectionCache?.view;
    let label="";
    if(typeof meta?.floorHeroId==="string"){
      const hero=view?.heroes.find(h=>h.id===meta.floorHeroId);
      if(hero)hoverHeroId(hero.id,clientX,clientY);
      this.hoverTooltip.hidden=true;
      return;
    }else if(typeof meta?.dungeonStairwayId==="string"){
      label=String(meta.label)+" · Tile "+meta.gridX+", "+meta.gridZ;
    }else if(typeof meta?.spectatorFeatureId==="string"&&this.layout){
      const feature=this.layout.features.find(f=>f.id===meta.spectatorFeatureId);
      if(feature&&!view?.resolved.includes(feature.id))
        label=(feature.kind==="treasure"?"CHEST · Unlooted":feature.kind==="trap"?
          "TRAP · Armed":"GHOUL · Spawn Site")+" · Tile "+feature.x+", "+feature.z;
    }else if(meta?.abstractBattle===true){
      label="LIVE FIGHT · Click to watch the actual arena";
    }
    hideHeroHover();
    this.hoverTooltip.hidden=!label;
    if(!label)return;
    this.hoverTooltip.textContent=label;
    this.hoverTooltip.style.left=Math.max(8,
      Math.min(window.innerWidth-260,clientX+15))+"px";
    this.hoverTooltip.style.top=Math.max(95,
      Math.min(window.innerHeight-92,clientY+15))+"px";
  }

  private createScene(layout: DungeonLayout): void {
    this.replayScene?.dispose();
    this.replayScene=null;
    this.scene?.dispose();
    const scene = new Scene(this.engine);
    this.scene = scene;
    scene.clearColor = new Color4(0.025,0.033,0.030,1);
    const camera = new UniversalCamera("dungeon-camera",
      new Vector3(0,66,-22), scene);
    this.camera = camera;
    camera.minZ = 0.1;
    camera.maxZ = 500;
    camera.fov = 0.92;
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;
    this.updateCompass();

    const ambient = new HemisphericLight("dungeon-ambient",new Vector3(0,1,0),scene);
    ambient.intensity = 0.85;
    const makeMat=(id:string,hex:string,emissive=false) => {
      const mat=new StandardMaterial(id,scene);
      mat.diffuseColor=Color3.FromHexString(hex);
      mat.specularColor=new Color3(0.055,0.055,0.065);
      if(emissive) mat.emissiveColor=Color3.FromHexString(hex).scale(0.55);
      return mat;
    };
    // Spectator geometry uses the SAME authored stone/flagstone textures as
    // Galvik's main cave, cellar and excavated passages. Room tint preserves
    // the existing room/corridor readability without an alternate stone art.
    const cave=getDungeonSurfaces(scene);
    const rock=cave.stone;
    const floor=cave.floor;
    const roomStone=cave.floor.clone("dungeon-room-flagstone") as StandardMaterial;
    roomStone.diffuseColor=new Color3(1.12,1.04,0.91);
    const featurePaint=createDungeonFeaturePalette(scene);
    const ghoulIcon=createGhoulMapIconMaterial(scene);
    const ghoulMarkerMat=makeMat("dungeon-3d-ghoul-site-hitbox","#442d26");
    ghoulMarkerMat.alpha=0;
    const underlay=MeshBuilder.CreateBox("dungeon-foundation",{
      width:layout.width*TILE_SIZE,height:0.35,depth:layout.height*TILE_SIZE,
    },scene);
    underlay.position.y=-0.25;
    underlay.material=makeMat("dungeon-underlay","#171b20");

    // Instances share GPU buffers. Each layout cell is an actual rendered tile,
    // while the exact same tile map can later drive physical navigation.
    const wallPrefab=MeshBuilder.CreateBox("dungeon-wall-template",{
      width:TILE_SIZE-0.025,height:WALL_HEIGHT,depth:TILE_SIZE-0.025,
    },scene);
    wallPrefab.material=rock;
    wallPrefab.isPickable=false;
    const floorPrefab=MeshBuilder.CreateBox("dungeon-floor-template",{
      width:TILE_SIZE,height:0.09,depth:TILE_SIZE,
    },scene);
    floorPrefab.material=floor;
    const roomPrefab=MeshBuilder.CreateBox("dungeon-room-template",{
      width:TILE_SIZE,height:0.10,depth:TILE_SIZE,
    },scene);
    roomPrefab.material=roomStone;
    const replayTiles:DungeonTileMesh[]=[];
    const replayMarkers:DungeonMarkerMesh[]=[];
    const replayDecorations:DungeonRoomDecoration[]=[];
    // Keep source geometry enabled off-map: Babylon instances depend on
    // their source mesh remaining visible even when individual tiles are fogged.
    wallPrefab.position.y=-900;
    floorPrefab.position.y=-900;
    roomPrefab.position.y=-900;
    let walls=0,corridors=0,roomTiles=0;
    for(let z=0;z<layout.height;z++)for(let x=0;x<layout.width;x++) {
      const kind=tileAt(layout,x,z);
      const pos=getWorld(layout,{x,z});
      if(kind==="wall") {
        const mesh=wallPrefab.createInstance("dungeon-wall-"+x+"-"+z);
        mesh.position.set(pos.x,WALL_HEIGHT/2,pos.z);
        replayTiles.push({x,z,mesh});
        walls++;
      } else {
        const useRoom=kind==="room";
        const prefab=useRoom?roomPrefab:floorPrefab;
        const mesh=prefab.createInstance(
          "dungeon-"+(useRoom?"room":"corridor")+"-tile-"+x+"-"+z);
        if(useRoom)roomTiles++;
        else corridors++;
        mesh.position.set(pos.x,0,pos.z);
        replayTiles.push({x,z,mesh});
      }
    }
    // Burial crypt props are pure spectacle on the SAME saved dungeon
    // tiles. No new arena teleport, obstacles, loot or simulation RNG.
    layout.rooms.forEach((room,i)=>{
      replayDecorations.push(createGhoulCryptRoom(
        scene,room,getWorld(layout,room),i));
    });

    const ghoulSites:GhoulMapSite[]=[];
    for(const feature of layout.features){
      const pos=getWorld(layout,feature);
      if(feature.kind==="treasure"){
        const chest=createReadableDungeonChest(
          scene,feature,pos,featurePaint);
        replayMarkers.push({id:feature.id,x:feature.x,z:feature.z,
          kind:feature.kind,mesh:chest});
      } else if(feature.kind==="trap"){
        const plate=createReadableDungeonTrap(
          scene,feature,pos,featurePaint);
        replayMarkers.push({id:feature.id,x:feature.x,z:feature.z,
          kind:feature.kind,mesh:plate});
      } else {
        // A genuinely three-dimensional Tripo Ghoul replaces the illustrated
        // fallback when the single shared scene GLB is ready. The root keeps
        // the SAME saved feature ID, picks and subjective fog semantics.
        const root=MeshBuilder.CreateBox("dungeon-monster-"+feature.id,
          {width:1.65,height:.07,depth:1.65},scene);
        root.position.set(pos.x,.33,pos.z);
        root.material=ghoulMarkerMat;
        root.isPickable=true;root.checkCollisions=false;
        root.metadata={spectatorFeatureId:feature.id,
          spectatorFeatureKind:"monster",subtype:feature.subtype,
          visualKind:"loading-authored-ghoul",
          label:"Ghoul spawn · shared authored 3D model"};
        const fallback=MeshBuilder.CreatePlane("ghoul-fallback-"+feature.id,
          {width:1.75,height:1.75},scene);
        fallback.parent=root;
        fallback.rotation.x=-Math.PI/2;
        fallback.position.y=.025;
        fallback.material=ghoulIcon;
        fallback.isPickable=false;
        fallback.checkCollisions=false;
        replayMarkers.push({id:feature.id,x:feature.x,z:feature.z,
          kind:feature.kind,mesh:root});
        ghoulSites.push({id:feature.id,root,fallback});
      }
    }
    // Real entrance and staircase sites share the EXISTING dungeon tile
    // coordinates and the replay scene's personal fog-of-war handling.
    const stairs=dungeonFloorStairways(layout);
    for(const stair of stairs){
      const mesh=createDungeonStairwayProp(scene,stair,getWorld(layout,stair));
      replayMarkers.push({id:stair.id,x:stair.x,z:stair.z,
        kind:"stair-"+stair.kind,mesh});
    }
    // This is purely presentation. No GLB load advances world time or
    // instantiates a second combat AI; the existing marker roots still own
    // LIVE visibility, saved site resolution and player tooltips.
    void installGhoulMapInstances(scene,ghoulSites);
    // A recognizable hero at the entrance is strictly a static reference model.
    // No AI walking or fake combat is started before the exploration milestone.
    const hero=this.store.state.adventurers.find(h=>h.status==="at-shop"&&h.health>0)
      ?? this.store.state.adventurers.find(h=>h.health>0);
    let reference:HeroVisual|null=null;
    if(hero) {
      const model=createHeroVisual(scene,{
        id:hero.id,role:hero.role,equipment:hero.equipment,
      },"dungeon-reference-"+hero.id);
      const pos=getWorld(layout,layout.entrance);
      model.root.position.set(pos.x,0.10,pos.z);
      model.root.metadata={...model.root.metadata,previewOnly:true};
      reference=model;
    }
    this.landmarks=[
      ...stairs.map(stair=>({name:stair.label,point:stair})),
      ...layout.rooms.map(room=>({name:"Room "+(Number(room.id.slice(5))+1),point:room})),
      ...layout.features.map(f=>({name:f.kind+" ("+f.subtype+")",point:f})),
    ];
    this.focus=0;
    this.seedLabel.textContent="Layout seed: "+layout.seed.toString(16).padStart(8,"0");
    this.summary.textContent=layout.rooms.length+" rooms · "+walls+" walls · "+
      corridors+" corridors · "+roomTiles+" room tiles · "+
      layout.features.filter(f=>f.kind==="monster").length+" monster spawns · "+
      layout.features.filter(f=>f.kind==="treasure").length+" treasures · "+
      layout.features.filter(f=>f.kind==="trap").length+" traps";
    this.replayScene=new DungeonReplayScene(scene,camera,layout,
      replayTiles,replayMarkers,replayDecorations,reference,this.minimap);
    this.drawMinimap(layout);
    this.centerOn(0);
  }

  private availableReplays(): {id:string;record:SpatialDungeonReplay;name:string}[] {
    // Both early floors and Floor 7 are recorded by the SAME spatial engine.
    // Outcomes remain sealed in this selection list.
    return this.store.state.events.filter(e=>
      e.type==="dungeon-live"&&!!e.dungeonReplay)
      .reverse().map(e=>({
        id:e.id,record:e.dungeonReplay!,
        name:this.store.state.adventurers.find(h=>h.id===e.adventurerId)?.name ??
          e.adventurerId ?? "Unknown hero",
      }));
  }
  private refreshReplaySelector(
    initialReplayId?:string,entryFloor:SpatialDungeonFloor=1,
  ):void {
    const replays=this.availableReplays();
    this.replaySelector.replaceChildren();
    const preview=new Option("Layout preview (full development map)","preview");
    this.replaySelector.add(preview);
 // LIVE actor choices belong to the floor map, not the archive selector.
    for(const entry of replays){
      this.replaySelector.add(new Option(
        "Day "+entry.record.day+" · F"+entry.record.floor+" · "+entry.name+
        (entry.record.partyMemberIds?.length
          ?" · Temporary Party ("+entry.record.partyMemberIds.length+")":"")+
        " · expedition footage",entry.id));
    }
    // Opening the dungeon never silently opens yesterday's tapes.
    if(initialReplayId&&replays.some(entry=>entry.id===initialReplayId))
      this.selectReplay(initialReplayId);
    else this.startFloor(entryFloor);
  }
  private selectReplay(id:string):void {
    this.leaveLiveCombat();
    this.liveCombatPanel.hidden=true;
    this.liveCombatDetails.textContent="";
    this.liveHeroId=null;
    this.liveFloor=null;this.liveFloorFightId=null;
    this.selectedFloorHeroId=null;this.heroDetailPanel.hidden=true;
    this.recordedCardSignature="";
    this.heroLocatorLabel.hidden=true;
    this.heroLocator.value="";
    this.minimap.tabIndex=-1;
    this.fightLocatorLabel.hidden=true;
    this.fightLocator.value="";
    this.liveFloorProjectionCache=null;
    this.archiveControls.hidden=false;
    this.liveWorldTick=-1;
    this.liveProjectionCache=null;
    const record=this.availableReplays().find(e=>e.id===id)?.record??null;
    this.replaySelector.value=record?id:"preview";
    if(record)observeReplay(id);
    // A historical early-floor recording needs its own saved floor geometry,
    // never the Level 7 layout that the original viewer previewed.
    const requestedFloor=record?.floor??7;
    if(this.layout?.floor!==requestedFloor){
      this.replayScene?.dispose();
      this.layout=generateExpeditionLayout(this.store.state.seed,requestedFloor);
      this.createScene(this.layout);
    }
    this.replayScene?.setReplay(record);
    this.playbackTime=0;
    this.playing=!!record;
    this.followActor=record?record.heroId:null;
    this.playbackControls.hidden=!record;
    this.renderTemporaryParty(record);
    this.modeDescription.textContent=record
      ?"Recorded Floor "+record.floor+" expedition · abstract map; combat arena only on request."
      :"Full development map preview · no replay selected.";
    this.minimapTitle.textContent=record?"Hero knowledge · Fog of War":
      "Dungeon layout · development preview";
    this.minimapNote.textContent=record
      ?"Only this hero's discovered locations are visible. Rewind to inspect earlier knowledge."
      :"Green: entrance · Orange: monsters · Gold: chests · Red: traps";
    if(record){
      this.paintPlayback();
      this.replayScene?.follow(record.heroId);
    }else{
      this.playbackStatus.textContent="No expedition replay selected.";
      this.centerOn(0);
    }
  }

  /** The default view: one real physical floor, every committed hero and party. */
  private startFloor(floor:SpatialDungeonFloor,focusHeroId:string|null=null):boolean {
    const view=selectLiveFloorSpectatorFrame(this.store.state,floor);
    if(!view)return false;
    this.leaveLiveCombat();
    this.liveFloor=floor;
    this.mapStatus.hidden=false;
    this.liveFloorFightId=null;
    this.archivedPartyBoss=null;
    this.selectedFloorHeroId=focusHeroId;
    this.liveFloorProjectionCache=null;
    this.liveHeroId=null;this.liveProjectionCache=null;
    this.liveWorldTick=-1;
    this.archiveControls.hidden=true;
    this.floorSelector.value=String(floor);
    this.playing=false;
    this.playbackControls.hidden=true;
    this.followActor=focusHeroId;
    if(this.layout?.floor!==floor){
      this.replayScene?.dispose();
      this.layout=generateExpeditionLayout(this.store.state.seed,floor);
      this.createScene(this.layout);
    }
    this.minimapTitle.textContent="LIVE · Full Floor "+floor+" Overview";
    this.minimapNote.textContent=
      "All confirmed adventurers on this floor. Hero-specific fog is separate.";
    this.paintFloor(view);
    return true;
  }

  /** Read-only combat payload, never reroll from the spectator. */
  private floorCombatView(fight:LiveFloorFight):CombatArenaView {
    return {
      heroes:fight.actors.filter(actor=>actor.team==="heroes").map(actor=>{
        const saved=this.store.state.adventurers.find(h=>h.id===actor.id);
        return {id:actor.id,
          role:saved?.role??(actor.role==="monster"?"DPS":actor.role),
          equipment:saved?.equipment??actor.equipment??{weapon:null,armor:null},
          health:fight.frame.actors.find(frame=>frame.id===actor.id)?.hp??
            saved?.health??actor.hp};
      }),
      combat:fight,
    };
  }

  private watchFloorCombat(id?:string):void {
    if(this.liveFloor===null)return;
    const view=selectLiveFloorSpectatorFrame(this.store.state,this.liveFloor);
    const fight=view?.fights.find(entry=>entry.id===(id??this.liveFloorFightId))
      ??view?.fights[0];
    if(!fight)return;
    this.liveFloorFightId=fight.id;
    if(!this.liveArena.watch(this.floorCombatView(fight),"live"))return;
    this.enterFightSoundtrack(fight.actors);
    this.paintFloor(view!);
    this.paintCombatIntro();
    this.returnCombatButton.focus();
  }

  /** Entire floor stays observable while the *same* autonomous game runs. */
  /** Explicit selection never issues hero orders or world-clock events. */
  private selectFloorHero(heroId:string|null):void {
    if(this.liveFloor===null)return;
    const view=selectLiveFloorSpectatorFrame(this.store.state,this.liveFloor);
    if(!view)return;
    const confirmed=heroId&&view.heroes.some(h=>h.id===heroId)?heroId:null;
    this.selectedFloorHeroId=confirmed;
    this.heroLocator.value=confirmed??"";
    this.followActor=confirmed;
    this.replayScene?.setSelectedFloorHero(confirmed);
    this.renderFloorHeroDetail(view);
    this.paintFloorVisionLabel(view);
    if(confirmed)this.replayScene?.follow(confirmed);
    this.focusLabel.textContent="TAB focus: "+
      (confirmed??"all adventurers")+" · Floor "+view.floor;
    this.updateTemporaryPartyFocus();
  }

  private paintFloorVisionLabel(view:LiveFloorSpectatorFrame):void {
    const hero=view.heroes.find(h=>h.id===this.selectedFloorHeroId);
    this.minimap.tabIndex=this.liveArena.isActive?-1:0;
    this.minimapTitle.textContent=hero
      ?"LIVE · "+hero.name+" · Personal Fog of War"
      :"LIVE · Full Floor "+view.floor+" Overview";
    this.minimapNote.textContent=(hero
      ?"Bright: visible · Dim: explored · Black: unknown. Unexplored tiles cannot be focused."
      :"All confirmed adventurers visible. Select a hero for personal fog.")
      +" Click a tile or use arrow keys to focus the camera.";
  }

  private renderFloorHeroDetail(view:LiveFloorSpectatorFrame):void {
    const hero=view.heroes.find(h=>h.id===this.selectedFloorHeroId);
    this.heroDetailPanel.hidden=!hero||this.liveArena.isActive;
    if(!hero){this.heroDetailValues.replaceChildren();return;}
    // The same worldwide card used by Shop, World Echoes, Roster and
    // combat. Dungeon-specific observations are read-only and depend on
    // this hero's actual visible geometry; never reveal other explorers'
    // unseen treasure or private routes.
    const perception=this.layout?
      selectHeroFloorPerception(this.layout,view,hero.id):null;
    const ongoing=hero.inCombat?"LIVE combat":
      hero.activity==="backtracking"?"Walking to portal":
      hero.activity==="portal"?"Portal transit":"Exploring";
    const source=liveHeroCard(this.store.state,hero.id,{
      health:hero.health,activity:ongoing,goal:hero.goal,
      action:hero.plannedAction,
    });
    if(!source)return;
    const observations:NonNullable<typeof source.observations>=[
      {icon:"map",text:"Tile ("+hero.x+", "+hero.z+")"},
      {icon:"map",text:"Next two steps · "+
        (this.layout?dungeonPreviewExplanation(this.layout,hero,view.resolved):
          "No dungeon geometry")},
      ...(perception?[{icon:"search" as const,
        text:perception.visible.size+" visible · "+
          perception.explored.size+" explored tiles"},
        {icon:"swords" as const,
          text:perception.visibleMonsterIds.length+
            " visible monsters"},
        {icon:"users" as const,
          text:perception.visibleHeroIds.length+" heroes seen"},
      ]:[]),
    ];
    const card=renderHeroCard({...source,observations},"expanded");
    this.heroDetailTitle.textContent="HERO PROFILE";
    this.heroDetailValues.replaceChildren(card);
  }

  /** Options are based only on this saved floor projection. Changes to
   * the clock without roster changes never rebuild the selector. */
  private syncHeroLocator(view:LiveFloorSpectatorFrame):void {
    this.heroLocatorLabel.hidden=this.liveFloor===null||this.liveArena.isActive;
    const options=floorHeroLocatorOptions(view.heroes);
    const signature=options.map(option=>option.id+"="+option.label).join("|");
    if(signature!==this.heroLocatorSignature){
      this.heroLocator.replaceChildren(new Option("Whole floor · no hero selected",""),
        ...options.map(option=>new Option(option.label,option.id)));
      this.heroLocatorSignature=signature;
    }
    this.heroLocator.value=this.selectedFloorHeroId??"";
  }

  /** The fight picker and camera only read committed 60Hz encounters.
   * An encounter that ends disappears on the next projection update. */
  private syncFightLocator(view:LiveFloorSpectatorFrame):void {
    const options=floorFightLocatorOptions(view.fights);
    this.fightLocatorLabel.hidden=this.liveFloor===null||
      this.liveArena.isActive||options.length===0;
    const signature=options.map(option=>option.id+"="+option.label).join("|");
    if(signature!==this.fightLocatorSignature){
      this.fightLocator.replaceChildren(new Option("No active encounters",""),
        ...options.map(option=>new Option(option.label,option.id)));
      this.fightLocatorSignature=signature;
    }
    this.fightLocator.value=this.liveFloorFightId??"";
  }

  private paintFloor(view:LiveFloorSpectatorFrame):void {
    if(this.layout){
      const unresolved=this.layout.features.filter(feature=>
        !view.resolved.includes(feature.id));
      const count=(kind:DungeonFeature["kind"])=>
        unresolved.filter(feature=>feature.kind===kind).length;
      const parties=new Set(view.heroes.map(hero=>hero.partyId).filter(Boolean));
      this.mapCounts.textContent=view.heroes.length+" heroes · "+
        parties.size+" parties · "+count("monster")+" Ghoul sites · "+
        count("treasure")+" chests · "+count("trap")+" traps";
    }
    const selected=view.fights.find(f=>f.id===this.liveFloorFightId)??view.fights[0];
    this.liveFloorFightId=selected?.id??null;
    if(this.liveArena.isActive){
      if(!selected||selected.id!==this.liveArena.observedFightId)
        this.leaveLiveCombat();
      else this.liveArena.show(this.floorCombatView(selected));
    }
    this.replayScene?.showLiveFloor(view);
    if(this.selectedFloorHeroId&&!view.heroes.some(hero=>
       hero.id===this.selectedFloorHeroId)){
      this.selectedFloorHeroId=null;this.followActor=null;
    }
    this.replayScene?.setSelectedFloorHero(this.selectedFloorHeroId);
    this.syncHeroLocator(view);
    this.syncFightLocator(view);
    this.renderFloorHeroDetail(view);
    this.paintFloorVisionLabel(view);
    this.liveCombatPanel.hidden=view.fights.length===0;
    this.watchCombatButton.textContent=view.fights.length>1
      ?"⚔ Watch selected LIVE fight ("+view.fights.length+" running)"
      :"⚔ Watch LIVE fight in arena";
    this.watchCombatButton.hidden=!selected||this.liveArena.isActive;
    this.returnCombatButton.hidden=!this.liveArena.isActive;
    this.panel.dataset.liveCombatMode=this.liveArena.isActive?"arena":
      selected?"abstract":"none";
    document.querySelector<HTMLElement>("#dungeon-combat-heading")!.textContent=
      "⚔ "+view.fights.length+" LIVE ENGAGEMENT(S) · ABSTRACT FLOOR";
    this.liveCombatDetails.textContent=view.fights.map(fight=>{
      const cast=new Map(fight.actors.map(actor=>[actor.id,actor]));
      return fight.featureId+" · "+fight.frame.actors.map(actor=>{
        const spec=cast.get(actor.id);
        const hero=this.store.state.adventurers.find(h=>h.id===actor.id);
        const name=hero?.name??(spec?.team==="monsters"?"Monster":"Adventurer");
        return name+" "+Math.max(0,Math.round(actor.hp))+"/"+
          Math.round(spec?.maxHp??actor.hp)+" HP";
      }).join(" · ");
    }).join(" | ");
    this.modeDescription.textContent="LIVE · "+(this.liveArena.isActive
      ?"3D combat arena (read-only)":"whole-floor dungeon overview")+
      " · Day "+view.day+" · Floor "+view.floor+
      " · shop and world clock continue";
    const partyIds=new Set(view.heroes.map(h=>h.partyId).filter((id):id is string=>!!id));
    this.temporaryPartyPanel.hidden=partyIds.size===0;
    this.temporaryPartyHeading.textContent="LIVE · "+partyIds.size+
      " Temporary Parties on Floor "+view.floor;
    this.temporaryPartyMembers.replaceChildren(...view.heroes
      .filter(hero=>hero.partyId!==null).map(hero=>{
        const li=document.createElement("li");
        li.dataset.heroId=hero.id;
        li.textContent=hero.name+" · "+hero.partyMemberIds.length+" members";
        return li;
      }));
    this.updateTemporaryPartyFocus();
    this.liveWorldTick=view.worldTick;
    const minute=Math.floor((view.worldTick%28800)/20);
    this.playbackStatus.textContent="LIVE · "+view.heroes.length+
      " adventurers · "+view.fights.length+" battles · "+String(
      Math.floor(minute/60)).padStart(2,"0")+":"+
      String(minute%60).padStart(2,"0");
    this.focusLabel.textContent="TAB focus: "+
      (this.followActor??"all adventurers")+" · Floor "+view.floor;
    if(this.followActor)this.replayScene?.follow(this.followActor);
  }

  private startLive(heroId:string):boolean {
    const view=selectLiveSpectatorFrame(this.store.state,heroId);
    if(!view)return false;
    this.leaveLiveCombat();
    this.liveFloor=null;this.liveFloorFightId=null;
    this.liveFloorProjectionCache=null;
    this.archiveControls.hidden=true;
    this.liveHeroId=heroId;
    this.heroLocatorLabel.hidden=true;
    this.fightLocatorLabel.hidden=true;
    this.minimap.tabIndex=-1;
    this.liveWorldTick=-1;
    this.liveProjectionCache=null;
    this.playing=false;
    this.followActor=heroId;
    if(this.layout?.floor!==view.floor){
      this.replayScene?.dispose();
      this.layout=generateExpeditionLayout(this.store.state.seed,view.floor);
      this.createScene(this.layout);
    }
    if(![...this.replaySelector.options].some(o=>o.value==="live:"+heroId)){
      const name=this.store.state.adventurers.find(h=>h.id===heroId)?.name??heroId;
      this.replaySelector.add(new Option("LIVE · "+name,"live:"+heroId));
    }
    this.replaySelector.value="live:"+heroId;
    this.playbackControls.hidden=true;
    this.modeDescription.textContent="LIVE · authoritative dungeon world · Day "+view.day+
      " · Floor "+view.floor+" · shop and world clock continue";
    this.minimapTitle.textContent="LIVE · Hero knowledge";
    this.minimapNote.textContent="Only the watched hero's visited tiles and currently observed battle.";
    this.paintLive(view);
    this.replaySelector.focus();
    return true;
  }

  /** Archive view reads saved 60Hz combat frames, never replays combat AI. */
  private recordedArenaView():CombatArenaView|null{
    const scene=this.replayScene;
    const record=scene?.currentReplay;
    const frame=scene?.snapshot;
    if(!record||!frame?.encounter||!frame.frame)return null;
    const encounter=frame.encounter;
    const savedAppearances=new Map([
      ...(record.partyAppearances??[]),
      {id:record.heroId,role:record.appearance.role,
        equipment:record.appearance.equipment},
    ].map(hero=>[hero.id,hero] as const));
    return {heroes:encounter.combat.actors
      .filter(actor=>actor.team==="heroes")
      .map(actor=>({
        id:actor.id,
        role:savedAppearances.get(actor.id)?.role??
          (actor.role==="monster"?"DPS":actor.role),
        equipment:savedAppearances.get(actor.id)?.equipment??
          actor.equipment??{weapon:null,armor:null},
        health:actor.hp,
      })),
      combat:{
      id:"record:"+this.replaySelector.value+":"+encounter.featureId+
        ":"+(encounter.siteCycle??0),
      featureId:encounter.featureId,x:encounter.x,z:encounter.z,
      actors:encounter.combat.actors,frame:frame.frame,
      frames:encounter.combat.frames,cues:encounter.combat.cues,
    }};
  }

  private watchRecordedCombat():void{
    const view=this.recordedArenaView();
    if(!view||!this.liveArena.watch(view))return;
    this.enterFightSoundtrack(view.combat!.actors);
    // Historical tape time is LOCAL playback. Hold its chosen real frame for
    // the introduction so a short archived fight cannot vanish halfway
    // through the film. LIVE world/shop time is never paused by this.
    this.archivePlayingBeforeIntro=this.playing;
    this.playing=false;
    this.paintPlayback();
    this.paintCombatIntro();
    this.returnCombatButton.focus();
  }

  private watchLiveCombat():void {
    if(!this.liveHeroId)return;
    const view=selectLiveSpectatorFrame(this.store.state,this.liveHeroId);
    if(!view?.combat||!this.liveArena.watch(view,"live"))return;
    this.enterFightSoundtrack(view.combat.actors);
    this.paintCombatIntro();
    this.watchCombatButton.hidden=true;
    this.returnCombatButton.hidden=false;
    this.returnCombatButton.focus();
    this.paintLive(view);
  }

  private skipFightIntro():void {
    if(!this.liveArena.isIntroActive)return;
    const duration=this.liveArena.introDurationSeconds;
    this.liveArena.skipIntro();
    this.skipCombatScoreTo(duration);
    this.paintCombatIntro();
    this.canvas.focus();
  }

  private paintCombatIntro():void {
    const film=this.liveArena.introFrame;
    if(!film&&this.archivePlayingBeforeIntro){
      this.playing=true;
      this.archivePlayingBeforeIntro=false;
    }
    this.fightIntroPanel.hidden=!film;
    this.panel.dataset.fightIntro=String(!!film);
    if(film){
      this.fightIntroCaption.textContent=film.caption;
      this.fightIntroProgress.style.width=
        Math.round(film.progress*100)+"%";
    }
  }

  private enterFightSoundtrack(
    actors:readonly {specialAbility?:string}[],
  ):void {
    // Only explicit opt-in premium fights switch to combat music. The
    // abstract dungeon map keeps Beneath the Surface and no 3D stage.
    this.fightSoundtrackChanged(true,actors.some(actor=>
      actor.specialAbility==="grapple-throw"));
  }

  private leaveLiveCombat(backToDungeon=true):void {
    if(backToDungeon&&this.liveArena.isActive)
      this.fightSoundtrackChanged(false,false);
    this.liveArena.dispose();
    this.paintCombatIntro();
    if(document.pointerLockElement===this.canvas)
      void document.exitPointerLock();
    this.returnCombatButton.hidden=true;
    this.watchCombatButton.hidden=true;
    this.panel.dataset.liveCombatMode="none";
  }

  private returnToDungeonMap():void{
    if(this.archivedPartyBoss){this.close();return;}
    this.leaveLiveCombat();
    if(this.liveFloor!==null){
      const view=selectLiveFloorSpectatorFrame(this.store.state,this.liveFloor);
      if(view)this.paintFloor(view);
    }else if(this.liveHeroId){
      const view=selectLiveSpectatorFrame(this.store.state,this.liveHeroId);
      if(view)this.paintLive(view);
    }else this.paintPlayback();
    if(!this.watchCombatButton.hidden)this.watchCombatButton.focus();
    else this.canvas.focus();
  }

  private paintLive(view:LiveSpectatorFrame):void {
    if(this.liveArena.isActive){
      if(!view.combat||view.combat.id!==this.liveArena.observedFightId)
        this.leaveLiveCombat(); // Fight ended or was replaced. Never replay it.
      else this.liveArena.show(view);
    }
    this.replayScene?.showLive(view);
    this.liveCombatPanel.hidden=!view.combat;
    this.watchCombatButton.textContent="⚔ Watch LIVE fight in arena";
    document.querySelector<HTMLElement>("#dungeon-combat-heading")!.textContent=
      "⚔ LIVE ENGAGEMENT · ABSTRACT MAP";
    this.watchCombatButton.hidden=!view.combat||this.liveArena.isActive;
    this.returnCombatButton.hidden=!this.liveArena.isActive;
    this.panel.dataset.liveCombatMode=this.liveArena.isActive?"arena":
      view.combat?"abstract":"none";
    if(view.combat){
      const fight=view.combat;
      const maxHp=new Map(fight.actors.map(actor=>[actor.id,actor.maxHp]));
      const roles=new Map(fight.actors.map(actor=>[actor.id,actor.team]));
      this.liveCombatDetails.textContent=fight.frame.actors.map(actor=>{
        const hero=this.store.state.adventurers.find(entry=>entry.id===actor.id);
        const name=hero?.name??(roles.get(actor.id)==="monsters"?"Monster":"Adventurer");
        return name+" "+Math.max(0,Math.round(actor.hp))+"/"+Math.round(maxHp.get(actor.id)??actor.hp)+" HP";
      }).join(" · ");
    }
    this.modeDescription.textContent="LIVE · "+(this.liveArena.isActive?
      "3D combat arena (read-only)":"abstract dungeon map")+
      " · Day "+view.day+" · Floor "+view.floor+
      " · shop and world clock continue";
    this.liveWorldTick=view.worldTick;
    const clock=view.worldTick;
    const minute=Math.floor((clock%28800)/20);
    this.playbackStatus.textContent="LIVE · Day "+view.day+" · "+
      String(Math.floor(minute/60)).padStart(2,"0")+":"+
      String(minute%60).padStart(2,"0")+
      (view.combat?" · "+view.combat.frame.actors.length+
        " real combatants · "+(this.liveArena.isActive?"3D ARENA":"abstract battle"):" · exploring");
    this.focusLabel.textContent="TAB focus: "+(this.followActor??"free camera")+
      " · "+view.heroId;
    this.temporaryPartyPanel.hidden=view.heroes.length<2;
    this.temporaryPartyHeading.textContent="LIVE Temporary Party · "+
      view.heroes.length+" adventurers";
    this.temporaryPartyMembers.replaceChildren(...view.heroes.map(hero=>{
      const li=document.createElement("li");
      li.dataset.heroId=hero.id;
      li.textContent=this.store.state.adventurers.find(h=>h.id===hero.id)?.name??hero.id;
      return li;
    }));
    this.updateTemporaryPartyFocus();
    if(this.followActor)this.replayScene?.follow(this.followActor);
  }
  /** Identity is taken from THIS saved tape, never a later party. */
  private renderTemporaryParty(record:SpatialDungeonReplay|null):void {
    const ids=record?.partyMemberIds??[];
    this.temporaryPartyPanel.hidden=ids.length<2;
    this.temporaryPartyMembers.replaceChildren();
    if(ids.length<2)return;
    this.temporaryPartyHeading.textContent=
      "Temporary Party · "+ids.length+" adventurers · Day "+record!.day;
    const names=heroDisplayNames(this.store.state.adventurers);
    for(const id of ids){
      const item=document.createElement("li");
      item.dataset.heroId=id;
      item.textContent=names.get(id)??id;
      this.temporaryPartyMembers.append(item);
    }
    this.updateTemporaryPartyFocus();
  }

  private updateTemporaryPartyFocus():void {
    for(const item of this.temporaryPartyMembers.children){
      if(!(item instanceof HTMLElement))continue;
      const isFocus=item.dataset.heroId===this.followActor;
      item.dataset.focused=String(isFocus);
      if(isFocus)item.setAttribute("aria-current","true");
      else item.removeAttribute("aria-current");
    }
  }

  private togglePlayback():void {
    if(this.liveHeroId||!this.replayScene?.currentReplay)return;
    if(this.playbackTime>=this.replayScene.duration)this.playbackTime=0;
    this.playing=!this.playing;
    this.paintPlayback();
  }
  private restartReplay():void {
    if(!this.replayScene?.currentReplay)return;
    this.playbackTime=0;
    this.playing=true;
    this.followActor=this.replayScene.currentReplay.heroId;
    this.paintPlayback();
  }
  private paintPlayback():void {
    const scene=this.replayScene;
    if(!scene?.currentReplay)return;
    const frame=scene.show(this.playbackTime);
    if(!frame)return;
    const fight=this.recordedArenaView();
    if(this.liveArena.isActive){
      if(!fight||fight.combat?.id!==this.liveArena.observedFightId)
        this.leaveLiveCombat();
      else this.liveArena.show(fight);
    }
    this.liveCombatPanel.hidden=!fight;
    document.querySelector<HTMLElement>("#dungeon-combat-heading")!.textContent=
      "⚔ RECORDED ENGAGEMENT · ABSTRACT MAP";
    this.watchCombatButton.textContent="⚔ Watch recorded fight in arena";
    this.watchCombatButton.hidden=!fight||this.liveArena.isActive;
    this.returnCombatButton.hidden=!this.liveArena.isActive;
    this.panel.dataset.liveCombatMode=this.liveArena.isActive?"arena":
      fight?"abstract":"none";
    if(fight?.combat){
      const roles=new Map(fight.combat.actors.map(actor=>[actor.id,actor]));
      this.liveCombatDetails.textContent=fight.combat.frame.actors.map(actor=>{
        const spec=roles.get(actor.id);
        const hero=this.store.state.adventurers.find(h=>h.id===actor.id);
        return (hero?.name??(spec?.team==="monsters"?"Monster":"Adventurer"))+
          " "+Math.max(0,Math.round(actor.hp))+"/"+Math.round(spec?.maxHp??actor.hp)+" HP";
      }).join(" · ");
    }
    this.modeDescription.textContent="Recorded expedition · "+
      (this.liveArena.isActive?"3D fight arena (read-only)":"abstract dungeon map")+
      " · original committed results";
    this.timeSlider.value=String(Math.round(frame.percent*1000));
    this.timeLabel.textContent=frame.time.toFixed(1)+" / "+frame.duration.toFixed(1)+" s";
    this.playbackButton.textContent=this.playing?"Pause (Space)":"Play (Space)";
    const record=scene.currentReplay;
    if(this.liveArena.isActive)this.heroDetailPanel.hidden=true;
    else{
      // The historical Hero Card reads the saved tape, never present-day
      // attributes. Rebuild only after HP/action/tile actually changes.
      const x=Math.round(frame.x),z=Math.round(frame.z);
      const key=this.replaySelector.value+"|"+Math.round(frame.hp)+
        "|"+frame.action+"|"+x+"|"+z;
      if(this.recordedCardSignature!==key){
        this.recordedCardSignature=key;
        const name=this.store.state.adventurers.find(h=>h.id===record.heroId)
          ?.name??record.heroId;
        const step={...record.steps[0]!,x,z,hp:Math.round(frame.hp)};
        const card=recordedHeroCard(record,name,step);
        this.heroDetailTitle.textContent="RECORDED HERO";
        this.heroDetailValues.replaceChildren(renderHeroCard(
          {...card,activity:frame.action},"expanded"));
      }
      this.heroDetailPanel.hidden=false;
    }
    const ending=frame.finished?" · Expedition ended: "+record.outcome:"";
    this.playbackStatus.textContent="Recorded "+frame.action+
      " · HP "+Math.round(frame.hp)+
      (frame.frame?" · "+frame.frame.actors.length+" recorded fighters":"")+
      ending;
    this.focusLabel.textContent="TAB focus: "+(this.followActor??"free camera")+
      " · "+(record.heroId);
    this.updateTemporaryPartyFocus();
    if(this.followActor)scene.follow(this.followActor);
  }
  private resetCamera():void {
    if(this.liveArena.isActive){this.liveArena.resetCamera();return;}
    const restore=()=>{
      const pose=this.mapPose();
      if(pose)this.setMapPose({...pose,yaw:DUNGEON_NORTH_YAW,
        pitch:DUNGEON_DEFAULT_PITCH,distance:DUNGEON_DEFAULT_DISTANCE});
    };
    if(this.liveFloor!==null){
      if(this.followActor)this.replayScene?.follow(this.followActor);
      else this.centerOn(0);
    }else if(this.liveHeroId){
      this.followActor=this.liveHeroId;
      this.replayScene?.follow(this.liveHeroId);
    }else if(this.replayScene?.currentReplay){
      this.followActor=this.replayScene.currentReplay.heroId;
      this.paintPlayback();
    }else this.centerOn(0);
    restore();
  }
  private centerOn(index:number):void {
    if(!this.camera||!this.layout||!this.landmarks.length)return;
    this.focus=((index%this.landmarks.length)+this.landmarks.length)%this.landmarks.length;
    const landmark=this.landmarks[this.focus];
    const target=getWorld(this.layout,landmark.point);
    const pose=this.mapPose();
    if(pose)this.setMapPose({...pose,x:target.x,z:target.z,
      yaw:DUNGEON_NORTH_YAW,pitch:DUNGEON_DEFAULT_PITCH,
      distance:DUNGEON_DEFAULT_DISTANCE});
    this.focusLabel.textContent="Camera focus: "+landmark.name+
      " ("+landmark.point.x+", "+landmark.point.z+")";
  }
  private drawMinimap(layout:DungeonLayout):void {
    const ctx=this.minimap.getContext("2d");
    if(!ctx)return;
    const cell=6;
    this.minimap.width=layout.width*cell;
    this.minimap.height=layout.height*cell;
    orientNorthUpMinimap(ctx,this.minimap.height);
    for(let z=0;z<layout.height;z++)for(let x=0;x<layout.width;x++) {
      const kind=tileAt(layout,x,z);
      ctx.fillStyle=kind==="wall"?"#171b20":kind==="room"?"#81786d":"#565960";
      ctx.fillRect(x*cell,z*cell,cell,cell);
    }
    for(const f of layout.features){
      ctx.fillStyle=f.kind==="treasure"?"#e6b845":
        f.kind==="trap"?"#c94c42":"#e27c62";
      ctx.fillRect(f.x*cell+1,f.z*cell+1,cell-2,cell-2);
    }
    for(const stair of dungeonFloorStairways(layout)){
      ctx.fillStyle=stair.kind==="descend"?"#e7bf75":
        stair.kind==="sealed"?"#a35e5e":"#70d2b4";
      ctx.fillRect(stair.x*cell,stair.z*cell,cell,cell);
      ctx.fillStyle="#0b191c";
      ctx.fillRect(stair.x*cell+2,stair.z*cell+2,Math.max(1,cell-4),Math.max(1,cell-4));
    }
  }
  update(deltaSeconds:number):void {
    if(!this.active||!this.camera||!this.layout)return;
    const dt=Math.min(0.1,Math.max(0,deltaSeconds));
    if(this.liveArena.isActive){
      this.liveArena.updateCamera(dt,this.keys);
      this.paintCombatIntro();
    }else {
    const speed=dt*(this.keys.has("ShiftLeft")||this.keys.has("ShiftRight")?44:15);
    const right=Number(this.keys.has("KeyD"))-Number(this.keys.has("KeyA"));
    const forward=Number(this.keys.has("KeyW"))-Number(this.keys.has("KeyS"));
    const pose=this.mapPose();
    if(pose&&(right||forward)){
      this.setMapPose(panDungeonMap(pose,right,forward,speed,
        {halfX:this.layout.width*TILE_SIZE/2,
          halfZ:this.layout.height*TILE_SIZE/2}));
      this.followActor=null;
    }
    if(pose&&(this.keys.has("KeyQ")||this.keys.has("KeyE"))){
      this.setMapPose(zoomDungeonMap(this.mapPose()!,
        (Number(this.keys.has("KeyQ"))-Number(this.keys.has("KeyE")))*dt*380));
      this.followActor=null;
    }
    }
    if(this.liveFloor!==null){
      const state=this.store.state;
      const cached=this.liveFloorProjectionCache;
      if(!cached||cached.floor!==this.liveFloor||
         cached.adventurers!==state.adventurers||
         cached.liveDungeon!==state.liveDungeon||
         cached.dungeonWorlds!==state.dungeonWorlds||
         cached.dungeonParties!==state.dungeonParties){
        const view=selectLiveFloorSpectatorFrame(state,this.liveFloor);
        if(!view){this.close();return;}
        this.liveFloorProjectionCache={
          floor:this.liveFloor,adventurers:state.adventurers,
          liveDungeon:state.liveDungeon,dungeonWorlds:state.dungeonWorlds,
          dungeonParties:state.dungeonParties,view,
        };
        this.paintFloor(view);
      }
      if(!this.liveArena.isActive)
        this.replayScene?.advanceLiveFloorPresentation(dt);
    }else if(this.liveHeroId){
      const state=this.store.state;
      const cached=this.liveProjectionCache;
      // The 50ms shop/world tick is NOT a new dungeon actor pose.
      // Skip seeded layout generation, fog/mesh rebuilding and DOM work
      // until an authoritative expedition/roster/party checkpoint changes.
      if(!cached||cached.heroId!==this.liveHeroId||
         cached.adventurers!==state.adventurers||
         cached.liveDungeon!==state.liveDungeon||
         cached.dungeonWorlds!==state.dungeonWorlds||
         cached.dungeonParties!==state.dungeonParties){
        const view=selectLiveSpectatorFrame(state,this.liveHeroId);
        if(!view){this.close();return;}
        if(this.layout.floor!==view.floor){
          this.leaveLiveCombat();
          this.replayScene?.dispose();
          this.layout=generateExpeditionLayout(state.seed,view.floor);
          this.createScene(this.layout);
          this.liveWorldTick=-1;
        }
        this.liveProjectionCache={
          heroId:this.liveHeroId,
          adventurers:state.adventurers,liveDungeon:state.liveDungeon,
          dungeonWorlds:state.dungeonWorlds,
          dungeonParties:state.dungeonParties,view,
        };
        this.paintLive(view);
      }
      // Animation is presentation-only, sampled every rendered frame from
      // the two committed tile checkpoints. No per-frame map/AI projection.
      if(!this.liveArena.isActive)
        this.replayScene?.advanceLivePresentation(dt);
    }else if(this.archivedPartyBoss){
      // The campaign keeps running; replay time is LOCAL and samples
      // original fixed-step frames, not a replacement combat simulation.
      if(this.liveArena.isActive&&!this.liveArena.isIntroActive){
        const archive=this.archivedPartyBoss;
        const duration=archive.view.combat?.frames.at(-1)?.t??0;
        if(this.playing){
          archive.time=Math.min(duration,archive.time+dt*this.playbackSpeed);
          if(archive.time>=duration)this.playing=false;
        }
        this.liveArena.show(archive.view,archive.time);
      }
    }else if(this.replayScene?.currentReplay){
      if(this.playing){
        this.playbackTime=Math.min(this.replayScene.duration,
          this.playbackTime+dt*this.playbackSpeed);
        if(this.playbackTime>=this.replayScene.duration)this.playing=false;
      }
      this.paintPlayback();
    }
  }
}
