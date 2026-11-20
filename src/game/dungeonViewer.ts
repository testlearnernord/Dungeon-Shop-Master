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
import type {GameState} from "./gameState.ts";
import { createHeroVisual } from "./heroVisual.ts";
import type { HeroVisual } from "./heroVisual.ts";
import { DungeonReplayScene, type DungeonTileMesh, type DungeonMarkerMesh, type DungeonRoomDecoration } from "./dungeonReplayScene.ts";
import type { Level7Replay,SpatialDungeonFloor } from "./level7Exploration.ts";
import { observeReplay } from "../replayDisclosure.ts";
import {selectLiveSpectatorFrame,type LiveSpectatorFrame} from "./liveSpectator.ts";
import {
  selectLiveFloorSpectatorFrame,LIVE_SPECTATOR_FLOORS,
  type LiveFloorSpectatorFrame,type LiveFloorFight,
} from "./liveFloorSpectator.ts";
import {LiveGroupCombatArena,type CombatArenaView} from "./liveGroupCombatArena.ts";
import { heroDisplayNames } from "./heroIdentity.ts";
import {CRYPT_FLOOR,CRYPT_STONE,CRYPT_WALL} from "./ghoulCryptPlan.ts";
import {createGhoulCryptRoom} from "./ghoulCryptArt.ts";
import {
  generateExpeditionLayout, tileAt, type DungeonLayout,
  type DungeonFeature, type DungeonPoint,
} from "./dungeonLayout.ts";

const TILE_SIZE = 2.5;
const WALL_HEIGHT = 4.5;
const MONSTER_COLOR = "#93ad7b";
const getWorld = (map: DungeonLayout, p: DungeonPoint) => new Vector3(
  (p.x-(map.width-1)/2)*TILE_SIZE, 0, (p.z-(map.height-1)/2)*TILE_SIZE,
);
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
  private readonly keys = new Set<string>();
  private readonly panel = document.querySelector<HTMLElement>("#dungeon-hud")!;
  private readonly summary = document.querySelector<HTMLElement>("#dungeon-summary")!;
  private readonly focusLabel = document.querySelector<HTMLElement>("#dungeon-focus")!;
  private readonly seedLabel = document.querySelector<HTMLElement>("#dungeon-seed")!;
  private readonly minimap = document.querySelector<HTMLCanvasElement>("#dungeon-minimap")!;
  private landmarks: { name: string; point: DungeonPoint }[] = [];
  private focus = 0;
  private replayScene: DungeonReplayScene | null = null;
  private readonly liveArena:LiveGroupCombatArena;
  private playing = false;
  private playbackTime = 0;
  private playbackSpeed = 1;
  private followActor: string | null = null;
  private liveHeroId: string | null = null;
  private liveFloor:SpatialDungeonFloor|null=null;
  private liveFloorFightId:string|null=null;
  private liveFloorProjectionCache:null|{
    readonly floor:SpatialDungeonFloor;
    readonly adventurers:GameState["adventurers"];
    readonly liveDungeon:GameState["liveDungeon"];
    readonly level7World:GameState["level7World"];
    readonly earlyDungeonWorlds:GameState["earlyDungeonWorlds"];
    readonly dungeonParties:GameState["dungeonParties"];
    readonly view:LiveFloorSpectatorFrame;
  }=null;
  private liveWorldTick=-1;
  private liveProjectionCache:null|{
    readonly heroId:string;
    readonly adventurers:GameState["adventurers"];
    readonly liveDungeon:GameState["liveDungeon"];
    readonly level7World:GameState["level7World"];
    readonly earlyDungeonWorlds:GameState["earlyDungeonWorlds"];
    readonly dungeonParties:GameState["dungeonParties"];
    readonly view:LiveSpectatorFrame;
  }=null;
  private readonly replaySelector = document.querySelector<HTMLSelectElement>("#dungeon-replay-select")!;
  private readonly floorSelector=document.querySelector<HTMLSelectElement>("#dungeon-floor-select")!;
  private readonly archiveControls=document.querySelector<HTMLElement>("#dungeon-archive-controls")!;
  private readonly archiveButton=document.querySelector<HTMLButtonElement>("#dungeon-open-archive")!;
  private readonly backLiveButton=document.querySelector<HTMLButtonElement>("#dungeon-back-live")!;
  private readonly playbackControls = document.querySelector<HTMLElement>("#dungeon-playback-controls")!;
  private readonly watchCombatButton=document.querySelector<HTMLButtonElement>("#dungeon-watch-live-combat")!;
  private readonly returnCombatButton=document.querySelector<HTMLButtonElement>("#dungeon-return-from-combat")!;
  private readonly liveCombatPanel=document.querySelector<HTMLElement>("#dungeon-live-combat-summary")!;
  private readonly liveCombatDetails=document.querySelector<HTMLElement>("#dungeon-live-combat-actors")!;
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
  ) {
    this.liveArena=new LiveGroupCombatArena(engine,canvas,this.panel);
    this.watchCombatButton.addEventListener("click",()=>{
      if(this.liveFloor!==null)this.watchFloorCombat();
      else if(this.liveHeroId)this.watchLiveCombat();
      else this.watchRecordedCombat();
    });
    this.returnCombatButton.addEventListener("click",()=>this.returnToDungeonMap());
    // Clicking the encounter beacon opts in; toolbar remains keyboard accessible.
    this.canvas.addEventListener("click",event=>{
      if(!this.active||!this.scene||this.liveArena.isActive)return;
      const rect=this.canvas.getBoundingClientRect();
      const picked=this.scene.pick(event.clientX-rect.left,
        event.clientY-rect.top,mesh=>mesh.metadata?.abstractBattle===true);
      if(!picked?.hit)return;
      if(this.liveFloor!==null)
        this.watchFloorCombat(picked.pickedMesh?.metadata?.fightId as string|undefined);
      else if(this.liveHeroId)this.watchLiveCombat();
      else this.watchRecordedCombat();
    });
    document.querySelector("#open-dungeon")!.addEventListener("click", () => this.open());
    document.querySelector("#close-dungeon")!.addEventListener("click", () => this.close());
    document.querySelector("#dungeon-reset-camera")!.addEventListener("click", () => this.resetCamera());
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
      if (!this.active) {
        if (event.code === "KeyG" && !event.repeat &&
          !document.querySelector("dialog[open]") &&
          !document.body.classList.contains("arena-active")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.open();
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
    // Use the same spectator mouse-flight contract as Level-6, but only
    // after opting into the actual 3D fight. Map picking stays untouched.
    canvas.addEventListener("pointerdown",()=>{
      if(!this.active||!this.liveArena.isActive)return;
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
      this.camera.position.y = Math.max(12, Math.min(100,
        this.camera.position.y + Math.sign(event.deltaY) * 4));
    }, {capture:true,passive:false});
  }

  get isActive() { return this.active; }
  get isWatchingLive() { return this.active&&(this.liveFloor!==null||this.liveHeroId!==null); }
  get currentScene(): Scene | null {
    return this.active?(this.liveArena.currentScene??this.scene):null;
  }
  get map(): DungeonLayout | null { return this.layout; }

  open(initialReplayId?:string): void {
    if (this.active || document.querySelector("dialog[open]") ||
      document.body.classList.contains("arena-active")) return;
    this.shopCamera.detachControl();
    if (document.pointerLockElement) void document.exitPointerLock();
    this.active = true;
    this.keys.clear();
    document.body.classList.add("dungeon-active");
    this.panel.hidden = false;
    this.layout = generateExpeditionLayout(this.store.state.seed,7);
    this.createScene(this.layout);
    this.refreshReplaySelector(initialReplayId);
    // LIVE floor overview is the default. Archive opens only intentionally.
    if (this.replayScene?.currentReplay) this.replaySelector.focus();
    else this.floorSelector.focus();
    this.sceneChanged(true);
  }

  /** Enter through an explicit Board choice. Do not make remote hero
   * vitality or location available to the ordinary shop HUD. */
  openLive(heroId:string):boolean {
    const view=selectLiveSpectatorFrame(this.store.state,heroId);
    if(!view)return false;
    if(!this.active)this.open();
    return this.active&&this.startFloor(view.floor,heroId);
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
    document.body.classList.remove("dungeon-active");
    this.panel.hidden = true;
    this.replayScene?.dispose();
    this.replayScene=null;
    this.playing=false;
    this.followActor=null;
    this.liveHeroId=null;
    this.liveFloor=null;this.liveFloorFightId=null;
    this.liveFloorProjectionCache=null;
    this.liveWorldTick=-1;
    this.liveProjectionCache=null;
    this.leaveLiveCombat();
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

  private createScene(layout: DungeonLayout): void {
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

    const ambient = new HemisphericLight("dungeon-ambient",new Vector3(0,1,0),scene);
    ambient.intensity = 0.85;
    const makeMat=(id:string,hex:string,emissive=false) => {
      const mat=new StandardMaterial(id,scene);
      mat.diffuseColor=Color3.FromHexString(hex);
      mat.specularColor=new Color3(0.055,0.055,0.065);
      if(emissive) mat.emissiveColor=Color3.FromHexString(hex).scale(0.55);
      return mat;
    };
    const rock=makeMat("dungeon-rock",CRYPT_WALL);
    const floor=makeMat("dungeon-corridor-floor",CRYPT_FLOOR);
    const roomStone=makeMat("dungeon-room-floor",CRYPT_STONE);
    const gold=makeMat("dungeon-gold","#d8a548",true);
    const spike=makeMat("dungeon-spikes","#b75a4b",true);
    const monster=makeMat("dungeon-monster",MONSTER_COLOR,true);
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

    for(const feature of layout.features){
      const pos=getWorld(layout,feature);
      if(feature.kind==="treasure"){
        const chest=MeshBuilder.CreateBox("dungeon-treasure-"+feature.id,
          {width:1.25,height:0.85,depth:0.9},scene);
        chest.position.set(pos.x,0.52,pos.z);
        chest.material=gold;
        replayMarkers.push({id:feature.id,x:feature.x,z:feature.z,
          kind:feature.kind,mesh:chest});
      } else if(feature.kind==="trap"){
        const marker=MeshBuilder.CreateCylinder("dungeon-trap-"+feature.id,
          {height:0.22,diameter:1.4,tessellation:4},scene);
        marker.position.set(pos.x,0.18,pos.z);
        marker.rotation.y=Math.PI/4;
        marker.material=spike;
        replayMarkers.push({id:feature.id,x:feature.x,z:feature.z,
          kind:feature.kind,mesh:marker});
      } else {
        // Development-map marker only; the ACTUAL encounter instantiates
        // the animated skinned Ghoul in DungeonReplayScene.
        const enemy=MeshBuilder.CreateCylinder("dungeon-monster-"+feature.id,
          {diameterTop:.4,diameterBottom:.95,height:.36,tessellation:6},scene);
        enemy.position.set(pos.x,.22,pos.z);
        enemy.material=monster;
        enemy.metadata={kind:"spawn-marker",subtype:feature.subtype,
          label:"Ghoul presence (map marker, not fighter model)"};
        replayMarkers.push({id:feature.id,x:feature.x,z:feature.z,
          kind:feature.kind,mesh:enemy});
      }
    }
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
      {name:"Entrance",point:layout.entrance},
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

  private availableReplays(): {id:string;record:Level7Replay;name:string}[] {
    // Both early floors and Floor 7 are recorded by the SAME spatial engine.
    // Outcomes remain sealed in this selection list.
    return this.store.state.events.filter(e=>
      (e.type==="level7-exploration"&&!!e.level7Replay) ||
      (e.type==="dungeon-exploration"&&!!e.dungeonReplay) ||
      (e.type==="dungeon-live"&&!!(e.dungeonReplay||e.level7Replay)))
      .reverse().map(e=>({
        id:e.id,record:(e.level7Replay??e.dungeonReplay)!,
        name:this.store.state.adventurers.find(h=>h.id===e.adventurerId)?.name ??
          e.adventurerId ?? "Unknown hero",
      }));
  }
  private refreshReplaySelector(initialReplayId?:string):void {
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
    else this.startFloor(1);
  }
  private selectReplay(id:string):void {
    this.leaveLiveCombat();
    this.liveCombatPanel.hidden=true;
    this.liveCombatDetails.textContent="";
    this.liveHeroId=null;
    this.liveFloor=null;this.liveFloorFightId=null;
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

  private startLive(heroId:string):boolean {
    const view=selectLiveSpectatorFrame(this.store.state,heroId);
    if(!view)return false;
    this.leaveLiveCombat();
    this.liveFloor=null;this.liveFloorFightId=null;
    this.liveFloorProjectionCache=null;
    this.archiveControls.hidden=true;
    this.liveHeroId=heroId;
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
      frames:encounter.combat.frames,
    }};
  }

  private watchRecordedCombat():void{
    const view=this.recordedArenaView();
    if(!view||!this.liveArena.watch(view))return;
    this.paintPlayback();
    this.returnCombatButton.focus();
  }

  private watchLiveCombat():void {
    if(!this.liveHeroId)return;
    const view=selectLiveSpectatorFrame(this.store.state,this.liveHeroId);
    if(!view?.combat||!this.liveArena.watch(view,"live"))return;
    this.watchCombatButton.hidden=true;
    this.returnCombatButton.hidden=false;
    this.returnCombatButton.focus();
    this.paintLive(view);
  }

  private leaveLiveCombat():void {
    this.liveArena.dispose();
    if(document.pointerLockElement===this.canvas)
      void document.exitPointerLock();
    this.returnCombatButton.hidden=true;
    this.watchCombatButton.hidden=true;
    this.panel.dataset.liveCombatMode="none";
  }

  private returnToDungeonMap():void{
    this.leaveLiveCombat();
    if(this.liveHeroId){
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
  private renderTemporaryParty(record:Level7Replay|null):void {
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
    if(this.liveHeroId){
      this.followActor=this.liveHeroId;
      this.replayScene?.follow(this.liveHeroId);
    }else if(this.replayScene?.currentReplay){
      this.followActor=this.replayScene.currentReplay.heroId;
      this.paintPlayback();
    }else this.centerOn(0);
  }
  private centerOn(index:number):void {
    if(!this.camera||!this.layout||!this.landmarks.length)return;
    this.focus=((index%this.landmarks.length)+this.landmarks.length)%this.landmarks.length;
    const landmark=this.landmarks[this.focus];
    const target=getWorld(this.layout,landmark.point);
    const height= Math.max(20,this.camera.position.y);
    this.camera.position.set(target.x,height,target.z-18);
    this.camera.setTarget(new Vector3(target.x,0,target.z));
    this.focusLabel.textContent="Camera focus: "+landmark.name+
      " ("+landmark.point.x+", "+landmark.point.z+")";
  }
  private drawMinimap(layout:DungeonLayout):void {
    const ctx=this.minimap.getContext("2d");
    if(!ctx)return;
    const cell=6;
    this.minimap.width=layout.width*cell;
    this.minimap.height=layout.height*cell;
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
    ctx.fillStyle="#83d4ad";
    ctx.fillRect(layout.entrance.x*cell,layout.entrance.z*cell,cell,cell);
  }
  update(deltaSeconds:number):void {
    if(!this.active||!this.camera||!this.layout)return;
    const dt=Math.min(0.1,Math.max(0,deltaSeconds));
    if(this.liveArena.isActive)this.liveArena.updateCamera(dt,this.keys);
    else {
    const speed=dt*(this.keys.has("ShiftLeft")||this.keys.has("ShiftRight")?44:15);
    const dx=(Number(this.keys.has("KeyD"))-Number(this.keys.has("KeyA")))*speed;
    const dz=(Number(this.keys.has("KeyS"))-Number(this.keys.has("KeyW")))*speed;
    const extentX=this.layout.width*TILE_SIZE/2;
    const extentZ=this.layout.height*TILE_SIZE/2;
    this.camera.position.x=Math.max(-extentX,Math.min(extentX,this.camera.position.x+dx));
    this.camera.position.z=Math.max(-extentZ-18,Math.min(extentZ+18,this.camera.position.z+dz));
    if(this.keys.has("KeyQ")) this.camera.position.y=Math.min(100,this.camera.position.y+speed);
    if(this.keys.has("KeyE")) this.camera.position.y=Math.max(12,this.camera.position.y-speed);
    }
    if(this.liveHeroId){
      const state=this.store.state;
      const cached=this.liveProjectionCache;
      // The 50ms shop/world tick is NOT a new dungeon actor pose.
      // Skip seeded layout generation, fog/mesh rebuilding and DOM work
      // until an authoritative expedition/roster/party checkpoint changes.
      if(!cached||cached.heroId!==this.liveHeroId||
         cached.adventurers!==state.adventurers||
         cached.liveDungeon!==state.liveDungeon||
         cached.level7World!==state.level7World||
         cached.earlyDungeonWorlds!==state.earlyDungeonWorlds||
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
          level7World:state.level7World,
          earlyDungeonWorlds:state.earlyDungeonWorlds,
          dungeonParties:state.dungeonParties,view,
        };
        this.paintLive(view);
      }
      // Animation is presentation-only, sampled every rendered frame from
      // the two committed tile checkpoints. No per-frame map/AI projection.
      if(!this.liveArena.isActive)
        this.replayScene?.advanceLivePresentation(dt);
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
