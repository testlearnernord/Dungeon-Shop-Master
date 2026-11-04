import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { createHeroVisual, type HeroVisual } from "./heroVisual.ts";
import type { DungeonLayout, DungeonPoint } from "./dungeonLayout.ts";
import { tileAt } from "./dungeonLayout.ts";
import type { Level7Replay } from "./level7Exploration.ts";
import {
  dungeonVisibleTiles, dungeonPlaybackAt, buildDungeonPlayback,
  type DungeonPlaybackTimeline, type DungeonPlaybackSnapshot,
} from "./dungeonReplayPlayback.ts";

const SPACING=2.5;
const toWorld=(layout:DungeonLayout,p:DungeonPoint)=>
  new Vector3((p.x-(layout.width-1)/2)*SPACING,0,
    (p.z-(layout.height-1)/2)*SPACING);

export interface DungeonTileMesh {
  readonly x:number;readonly z:number;readonly mesh:AbstractMesh;
}
export interface DungeonMarkerMesh {
  readonly x:number;readonly z:number;readonly id:string;
  readonly kind:string;readonly mesh:AbstractMesh;
}

/**
 * One-way renderer for persisted movement/fight frames and one hero's vision.
 * Never imports GameStore, SeededRandom, advanceDay, or any combat simulator.
 */
export class DungeonReplayScene {
  private replay:Level7Replay|null=null;
  private timeline:DungeonPlaybackTimeline|null=null;
  private hero:HeroVisual|null=null;
  private enemy:Mesh|null=null;
  private projectiles:Mesh[]=[];
  private lastVisibility="";
  private lastSnapshot:DungeonPlaybackSnapshot|null=null;
  private readonly indicator:HTMLCanvasElement;
  private readonly heroPreview:HeroVisual|null;

  constructor(
    private readonly scene:Scene,
    private readonly camera:UniversalCamera,
    private readonly layout:DungeonLayout,
    private readonly tiles:readonly DungeonTileMesh[],
    private readonly markers:readonly DungeonMarkerMesh[],
    heroPreview:HeroVisual|null,
    minimap:HTMLCanvasElement,
  ){
    this.heroPreview=heroPreview;
    this.indicator=minimap;
  }
  get currentReplay(){return this.replay;}
  get duration(){return this.timeline?.duration??0;}
  get snapshot(){return this.lastSnapshot;}

  setReplay(record:Level7Replay|null):void {
    this.replay=record;
    this.timeline=record?buildDungeonPlayback(record):null;
    this.lastSnapshot=null;
    this.lastVisibility="";
    this.hero?.root.dispose(false,true);
    this.hero=null;
    this.enemy?.dispose();
    this.enemy=null;
    for(const p of this.projectiles)p.dispose();
    this.projectiles=[];
    if(this.heroPreview)this.heroPreview.root.setEnabled(!record);
    if(record){
      this.hero=createHeroVisual(this.scene,{
        id:record.heroId,role:record.appearance.role,
        equipment:record.appearance.equipment,
      },"dungeon-replay-"+record.heroId);
      this.hero.root.metadata={
        ...this.hero.root.metadata,replayOnly:true,combatPhase:"move",
      };
      this.enemy=MeshBuilder.CreateSphere("dungeon-combat-creature",{
        diameter:1.35,segments:10,
      },this.scene);
      const enemyMaterial=new StandardMaterial("dungeon-replay-enemy-material",this.scene);
      enemyMaterial.diffuseColor=Color3.FromHexString("#ad5b42");
      enemyMaterial.emissiveColor=Color3.FromHexString("#58231d");
      this.enemy.material=enemyMaterial;
      this.enemy.setEnabled(false);
      for(let i=0;i<8;i++){
        const ball=MeshBuilder.CreateSphere("dungeon-combat-projectile-"+i,{
          diameter:0.28,segments:6,
        },this.scene);
        ball.material=enemyMaterial;
        ball.setEnabled(false);
        this.projectiles.push(ball);
      }
      this.show(0);
    }else{
      for(const tile of this.tiles)tile.mesh.isVisible=true;
      for(const marker of this.markers)marker.mesh.setEnabled(true);
      this.drawDevelopmentMap();
    }
  }

  show(elapsed:number):DungeonPlaybackSnapshot|null {
    if(!this.replay||!this.timeline||!this.hero)return null;
    const snapshot=dungeonPlaybackAt(this.replay,this.timeline,this.layout,elapsed);
    this.lastSnapshot=snapshot;
    const heroWorld=toWorld(this.layout,{x:snapshot.x,z:snapshot.z});
    this.hero.root.position.set(heroWorld.x,0.1,heroWorld.z);
    const frame=snapshot.frame;
    const actor=frame?.actors.find(a=>a.id===this.replay!.heroId);
    const pose=actor?.phase??(snapshot.action==="walk"?"move":"recover");
    if(actor)this.hero.root.rotation.y=actor.heading;
    this.hero.root.metadata.combatPhase=pose;
    const t=snapshot.time;
    const stride=pose==="move"&&snapshot.action==="walk"?Math.sin(t*13)*0.55:0;
    this.hero.legs[0].rotation.x=stride;
    this.hero.legs[1].rotation.x=-stride;
    const swing=pose==="strike"||pose==="windup"?-0.8:
      pose==="parry"?-0.45:pose==="hurt"?0.3:stride*0.4;
    this.hero.arms[0].rotation.x=swing;
    this.hero.arms[1].rotation.x=-swing;
    this.hero.weaponPivot.rotation.x=pose==="strike"?-1.1:0;

    if(this.enemy)this.enemy.setEnabled(!!snapshot.encounter&&!!frame);
    if(snapshot.encounter&&frame&&this.enemy){
      const monster=frame.actors.find(a=>a.id!==this.replay!.heroId);
      if(monster){
        const origin=toWorld(this.layout,snapshot.encounter);
        this.enemy.position.set(origin.x+monster.x,0.90,origin.z+monster.z);
        this.enemy.rotation.y=monster.heading;
        this.enemy.scaling.setAll(monster.hp>0?1:0.45);
        this.enemy.metadata={combatPhase:monster.phase,hp:monster.hp};
      }
      for(let i=0;i<this.projectiles.length;i++){
        const projectile=frame.projectiles[i],mesh=this.projectiles[i];
        mesh.setEnabled(!!projectile);
        if(projectile)mesh.position.set(
          origin.x+projectile.x,1.2,origin.z+projectile.z);
      }
    }else{
      for(const mesh of this.projectiles)mesh.setEnabled(false);
    }
    this.updateVisibility(snapshot);
    return snapshot;
  }

  private updateVisibility(snapshot:DungeonPlaybackSnapshot):void {
    const visible=dungeonVisibleTiles(this.layout,snapshot.known);
    const key=[...snapshot.known].sort((a,b)=>a-b).join(",")+
      "|"+[...snapshot.resolved].sort().join(",")+"|"+(snapshot.encounter?.featureId??"");
    if(key===this.lastVisibility)return;
    this.lastVisibility=key;
    for(const tile of this.tiles) {
      tile.mesh.isVisible=visible.has(tile.z*this.layout.width+tile.x);
    }
    for(const marker of this.markers){
      const id=marker.z*this.layout.width+marker.x;
      marker.mesh.setEnabled(visible.has(id)&&!snapshot.resolved.has(marker.id)&&
        snapshot.encounter?.featureId!==marker.id);
    }
    this.drawFogMap(snapshot,visible);
  }

  drawDevelopmentMap():void {
    const ctx=this.indicator.getContext("2d");
    if(!ctx)return;
    const cell=6;
    this.indicator.width=this.layout.width*cell;
    this.indicator.height=this.layout.height*cell;
    for(let z=0;z<this.layout.height;z++)for(let x=0;x<this.layout.width;x++){
      const kind=tileAt(this.layout,x,z);
      ctx.fillStyle=kind==="wall"?"#171b20":kind==="room"?"#81786d":"#565960";
      ctx.fillRect(x*cell,z*cell,cell,cell);
    }
    for(const marker of this.markers){
      ctx.fillStyle=marker.kind==="treasure"?"#e6b845":
        marker.kind==="trap"?"#c94c42":"#e27c62";
      ctx.fillRect(marker.x*cell+1,marker.z*cell+1,cell-2,cell-2);
    }
    ctx.fillStyle="#83d4ad";
    ctx.fillRect(this.layout.entrance.x*cell,this.layout.entrance.z*cell,cell,cell);
  }
  private drawFogMap(
    snapshot:DungeonPlaybackSnapshot,visible:ReadonlySet<number>,
  ):void {
    const ctx=this.indicator.getContext("2d");
    if(!ctx)return;
    const cell=6;
    this.indicator.width=this.layout.width*cell;
    this.indicator.height=this.layout.height*cell;
    ctx.fillStyle="#06090e";
    ctx.fillRect(0,0,this.indicator.width,this.indicator.height);
    for(const index of visible){
      const x=index%this.layout.width,z=Math.floor(index/this.layout.width);
      const tile=tileAt(this.layout,x,z);
      ctx.fillStyle=tile==="wall"?"#21242c":tile==="room"?"#847b70":"#5d666c";
      ctx.fillRect(x*cell,z*cell,cell,cell);
    }
    for(const marker of this.markers){
      const idx=marker.z*this.layout.width+marker.x;
      if(!visible.has(idx)||snapshot.resolved.has(marker.id))continue;
      ctx.fillStyle=marker.kind==="treasure"?"#e6b845":
        marker.kind==="trap"?"#c94c42":"#e27c62";
      ctx.fillRect(marker.x*cell+1,marker.z*cell+1,cell-2,cell-2);
    }
    ctx.fillStyle="#a5ebc7";
    ctx.fillRect(Math.round(snapshot.x*cell)+1,Math.round(snapshot.z*cell)+1,cell-2,cell-2);
  }
  /** The camera follows only when selected. Manual WASD always stays independent. */
  follow(target:"hero"|"monster"="hero"):void {
    if(!this.lastSnapshot)return;
    let p=toWorld(this.layout,this.lastSnapshot);
    const frame=this.lastSnapshot.frame;
    const encounter=this.lastSnapshot.encounter;
    if(target==="monster"&&frame&&encounter){
      const monster=frame.actors.find(a=>a.id!==this.replay?.heroId);
      if(monster){
        const origin=toWorld(this.layout,encounter);
        p=new Vector3(origin.x+monster.x,0,origin.z+monster.z);
      }
    }
    this.camera.position.set(p.x,Math.max(22,this.camera.position.y),p.z-15);
    this.camera.setTarget(new Vector3(p.x,0,p.z));
  }
  dispose():void {
    this.hero?.root.dispose(false,true);
    this.enemy?.dispose();
    for(const p of this.projectiles)p.dispose();
    this.hero=null;this.enemy=null;this.projectiles=[];
    this.replay=null;this.timeline=null;this.lastSnapshot=null;
  }
}
