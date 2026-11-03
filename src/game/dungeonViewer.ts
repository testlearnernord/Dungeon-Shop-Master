import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { GameStore } from "./gameStore.ts";
import { createHeroVisual } from "./heroVisual.ts";
import {
  generateDungeonLayout, tileAt, type DungeonLayout,
  type DungeonFeature, type DungeonPoint,
} from "./dungeonLayout.ts";

const TILE_SIZE = 2.5;
const WALL_HEIGHT = 4.5;
const MONSTER_COLOR = "#ad5b42";
const getWorld = (map: DungeonLayout, p: DungeonPoint) => new Vector3(
  (p.x-(map.width-1)/2)*TILE_SIZE, 0, (p.z-(map.height-1)/2)*TILE_SIZE,
);

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
  private readonly musicToggle = document.querySelector<HTMLButtonElement>("#music-toggle")!;

  constructor(
    private readonly engine: Engine,
    private readonly canvas: HTMLCanvasElement,
    private readonly shopCamera: UniversalCamera,
    private readonly store: GameStore,
    private readonly sceneChanged: (active: boolean) => void,
  ) {
    document.querySelector("#open-dungeon")!.addEventListener("click", () => this.open());
    document.querySelector("#close-dungeon")!.addEventListener("click", () => this.close());
    document.querySelector("#dungeon-reset-camera")!.addEventListener("click", () => this.centerOn(0));
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
      if (event.target instanceof Element && event.target.closest("#music-panel")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "KeyG" || event.code === "Escape") this.close();
      else if (event.code === "Tab" && !event.repeat) this.centerOn(this.focus+1);
      else if (event.code === "KeyR" && !event.repeat) this.centerOn(0);
      else if (event.code === "KeyM" && !event.repeat) this.musicToggle.focus();
      else this.keys.add(event.code);
    }, true);
    window.addEventListener("keyup", event => {
      if (!this.active) return;
      if (event.target instanceof Element && event.target.closest("#music-panel")) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.keys.delete(event.code);
    }, true);
    window.addEventListener("blur", () => this.keys.clear());
    window.addEventListener("wheel", event => {
      if (!this.active || !this.camera) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.camera.position.y = Math.max(12, Math.min(100,
        this.camera.position.y + Math.sign(event.deltaY) * 4));
    }, {capture:true,passive:false});
  }

  get isActive() { return this.active; }
  get currentScene(): Scene | null { return this.active ? this.scene : null; }
  get map(): DungeonLayout | null { return this.layout; }

  open(): void {
    if (this.active || document.querySelector("dialog[open]") ||
      document.body.classList.contains("arena-active")) return;
    this.shopCamera.detachControl();
    if (document.pointerLockElement) void document.exitPointerLock();
    this.active = true;
    this.keys.clear();
    document.body.classList.add("dungeon-active");
    this.panel.hidden = false;
    this.layout = generateDungeonLayout(this.store.state.seed,7);
    this.createScene(this.layout);
    this.sceneChanged(true);
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.keys.clear();
    document.body.classList.remove("dungeon-active");
    this.panel.hidden = true;
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
    scene.clearColor = new Color4(0.035,0.038,0.043,1);
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
    const rock=makeMat("dungeon-rock","#323139");
    const floor=makeMat("dungeon-corridor-floor","#555258");
    const roomStone=makeMat("dungeon-room-floor","#67615a");
    const gold=makeMat("dungeon-gold","#d8a548",true);
    const spike=makeMat("dungeon-spikes","#b75a4b",true);
    const monster=makeMat("dungeon-monster",MONSTER_COLOR,true);
    const brazier=makeMat("dungeon-torch","#f3b257",true);
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
    let firstWall=true,firstFloor=true,firstRoom=true;
    let walls=0,corridors=0,roomTiles=0;
    for(let z=0;z<layout.height;z++)for(let x=0;x<layout.width;x++) {
      const kind=tileAt(layout,x,z);
      const pos=getWorld(layout,{x,z});
      if(kind==="wall") {
        const mesh=firstWall ? wallPrefab : wallPrefab.createInstance("dungeon-wall-"+x+"-"+z);
        firstWall=false;
        mesh.position.set(pos.x,WALL_HEIGHT/2,pos.z);
        walls++;
      } else {
        const useRoom=kind==="room";
        const prefab=useRoom?roomPrefab:floorPrefab;
        const first=useRoom?firstRoom:firstFloor;
        const mesh=first?prefab:prefab.createInstance(
          "dungeon-"+(useRoom?"room":"corridor")+"-tile-"+x+"-"+z);
        if(useRoom) {firstRoom=false;roomTiles++;}
        else {firstFloor=false;corridors++;}
        mesh.position.set(pos.x,0,pos.z);
      }
    }
    // Room torches are decoration only. No game RNG or hidden knowledge.
    layout.rooms.forEach((room,i) => {
      const pos=getWorld(layout,room);
      if(i<6) {
        const light=new PointLight("dungeon-torchlight-"+i,
          new Vector3(pos.x,3,pos.z),scene);
        light.diffuse=new Color3(1,0.6,0.3);
        light.intensity=1.7;
        light.range=14;
        const ember=MeshBuilder.CreateSphere("dungeon-torch-"+i,
          {diameter:0.45,segments:8},scene);
        ember.position.set(pos.x,1.2,pos.z);
        ember.material=brazier;
      }
    });

    for(const feature of layout.features){
      const pos=getWorld(layout,feature);
      if(feature.kind==="treasure"){
        const chest=MeshBuilder.CreateBox("dungeon-treasure-"+feature.id,
          {width:1.25,height:0.85,depth:0.9},scene);
        chest.position.set(pos.x,0.52,pos.z);
        chest.material=gold;
      } else if(feature.kind==="trap"){
        const marker=MeshBuilder.CreateCylinder("dungeon-trap-"+feature.id,
          {height:0.22,diameter:1.4,tessellation:4},scene);
        marker.position.set(pos.x,0.18,pos.z);
        marker.rotation.y=Math.PI/4;
        marker.material=spike;
      } else {
        const enemy=MeshBuilder.CreateSphere("dungeon-monster-"+feature.id,
          {diameter:0.95,segments:8},scene);
        enemy.position.set(pos.x,0.8,pos.z);
        enemy.material=monster;
        enemy.metadata={kind:"spawn-marker",subtype:feature.subtype};
      }
    }
    // A recognizable hero at the entrance is strictly a static reference model.
    // No AI walking or fake combat is started before the exploration milestone.
    const hero=this.store.state.adventurers.find(h=>h.status==="at-shop"&&h.health>0)
      ?? this.store.state.adventurers.find(h=>h.health>0);
    if(hero) {
      const model=createHeroVisual(scene,{
        id:hero.id,role:hero.role,equipment:hero.equipment,
      },"dungeon-reference-"+hero.id);
      const pos=getWorld(layout,layout.entrance);
      model.root.position.set(pos.x,0.10,pos.z);
      model.root.metadata={...model.root.metadata,previewOnly:true};
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
    this.drawMinimap(layout);
    this.centerOn(0);
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
}
