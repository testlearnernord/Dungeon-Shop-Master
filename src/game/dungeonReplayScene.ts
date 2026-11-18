import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Light } from "@babylonjs/core/Lights/light";
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
import {
  dungeonReplayCast, dungeonReplayFocusIds, visibleDungeonCombatActors,
  recordedTemporaryPartyVisuals,
} from "./dungeonReplayCast.ts";
import {
  recordedTemporaryPartyFormation, recordedPartyMemberAlive,
} from "./dungeonPartyFormation.ts";
import {createDungeonGhoulVisual,type GhoulVisual} from "./dungeonGhoulVisual.ts";
import {ghoulRecordedPhaseAge} from "./ghoulMotion.ts";
import type { GroupPhase } from "./groupCombat.ts";

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
export interface DungeonRoomDecoration {
  readonly x:number;readonly z:number;
  readonly mesh:AbstractMesh;readonly light:Light;
}

/**
 * One-way renderer for persisted movement/fight frames and one hero's vision.
 * Never imports GameStore, SeededRandom, advanceDay, or any combat simulator.
 */
export class DungeonReplayScene {
  private replay:Level7Replay|null=null;
  private timeline:DungeonPlaybackTimeline|null=null;
  private hero:HeroVisual|null=null;
  private readonly companionHeroes=new Map<string,HeroVisual>();
  private readonly enemies=new Map<string,Mesh>();
  private readonly ghouls=new Map<string,GhoulVisual>();
  private readonly combatMaterials:StandardMaterial[]=[];
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
    private readonly decorations:readonly DungeonRoomDecoration[],
    heroPreview:HeroVisual|null,
    minimap:HTMLCanvasElement,
  ){
    this.heroPreview=heroPreview;
    this.indicator=minimap;
  }
  get currentReplay(){return this.replay;}
  get duration(){return this.timeline?.duration??0;}
  get snapshot(){return this.lastSnapshot;}
  get visibleFocusIds():readonly string[] {
    return this.replay?dungeonReplayFocusIds(this.replay,this.lastSnapshot):[];
  }

  private clearCombatModels():void {
    this.hero?.root.dispose(false,true);
    this.hero=null;
    for(const model of this.companionHeroes.values())model.root.dispose(false,true);
    this.companionHeroes.clear();
    for(const mesh of this.enemies.values())mesh.dispose();
    this.enemies.clear();
    for(const visual of this.ghouls.values())visual.dispose();
    this.ghouls.clear();
    for(const mesh of this.projectiles)mesh.dispose();
    this.projectiles=[];
    for(const material of this.combatMaterials)material.dispose();
    this.combatMaterials.length=0;
  }

  setReplay(record:Level7Replay|null):void {
    this.replay=record;
    this.timeline=record?buildDungeonPlayback(record):null;
    this.lastSnapshot=null;
    this.lastVisibility="";
    this.clearCombatModels();
    if(this.heroPreview)this.heroPreview.root.setEnabled(!record);
    if(record){
      this.hero=createHeroVisual(this.scene,{
        id:record.heroId,role:record.appearance.role,
        equipment:record.appearance.equipment,
      },"dungeon-replay-"+record.heroId);
      this.hero.root.metadata={
        ...this.hero.root.metadata,replayOnly:true,combatPhase:"move",
      };
      const ordinary=new StandardMaterial("dungeon-replay-monster-material",this.scene);
      ordinary.diffuseColor=Color3.FromHexString("#ad5b42");
      ordinary.emissiveColor=Color3.FromHexString("#58231d");
      const elite=new StandardMaterial("dungeon-replay-elite-material",this.scene);
      elite.diffuseColor=Color3.FromHexString("#75362e");
      elite.emissiveColor=Color3.FromHexString("#31100c");
      this.combatMaterials.push(ordinary,elite);
      // Real companions are part of the expedition BEFORE the first
      // fight. New tapes snapshot their role and purchased gear at the
      // start, so a peaceful run still displays the full party.
      for(const member of recordedTemporaryPartyVisuals(record)){
        if(member.id===record.heroId)continue;
        const model=createHeroVisual(this.scene,{
          id:member.id,role:member.role,equipment:member.equipment,
        },"dungeon-companion-"+member.id);
        model.root.metadata={...model.root.metadata,replayOnly:true,
          recordedEquipmentUnknown:record.partyAppearances===undefined &&
            !dungeonReplayCast(record).find(actor=>actor.id===member.id)?.equipment};
        model.root.setEnabled(false);
        this.companionHeroes.set(member.id,model);
      }
      const partyMembers=recordedTemporaryPartyVisuals(record);
      if(partyMembers.length>1){
        const gold=new StandardMaterial("dungeon-tp-ring-material",this.scene);
        gold.diffuseColor=Color3.FromHexString("#d5af68");
        gold.emissiveColor=Color3.FromHexString("#6b542d");
        this.combatMaterials.push(gold);
        if(this.hero)this.addPartyRing(this.hero,gold);
        for(const member of partyMembers)if(member.id!==record.heroId){
          const model=this.companionHeroes.get(member.id);
          if(model)this.addPartyRing(model,gold);
        }
      }
      for(const actor of dungeonReplayCast(record)){
        if(actor.id===record.heroId)continue;
        if(actor.team==="heroes" && actor.role!=="monster"){
          if(this.companionHeroes.has(actor.id))continue;
          // Read equipment from committed historical actor metadata, not
          // the current roster (the player may have sold gear since then).
          // Old v1 records without this optional field stay visually neutral.
          const model=createHeroVisual(this.scene,{
            id:actor.id,role:actor.role,
            equipment:actor.equipment??{weapon:null,armor:null},
          },"dungeon-companion-"+actor.id);
          model.root.metadata={...model.root.metadata,replayOnly:true,
            recordedEquipmentUnknown:actor.equipment===undefined};
          model.root.setEnabled(false);
          this.companionHeroes.set(actor.id,model);
        }else if(actor.team==="monsters"){
          const boss=actor.specialAbility==="grapple-throw";
          const enemy=MeshBuilder.CreateSphere("dungeon-enemy-"+actor.id,{
            diameter:1.35,segments:12,
          },this.scene);
          // The primitive is a loading/error FALLBACK, never the shipped
          // ordinary monster visual when a valid Tripo model is available.
          enemy.material=boss?elite:ordinary;
          enemy.isPickable=false;
          enemy.metadata={replayOnly:true,recordedActorId:actor.id,
            fallbackOnly:true,
            ...(boss?{specialAbility:actor.specialAbility}:{})};
          enemy.setEnabled(false);
          this.enemies.set(actor.id,enemy);
          const feature=this.layout.features.find(f=>f.id===actor.id);
          if(feature?.kind==="monster"&&feature.subtype==="ghoul"){
            const ghoul=createDungeonGhoulVisual(this.scene,actor.id);
            this.ghouls.set(actor.id,ghoul);
            void ghoul.ready.then(()=>{
              // If paused on a saved fight, replace the fallback as soon
              // as the asset loads; no new simulation step is needed.
              if(this.replay===record&&this.lastSnapshot)
                this.show(this.lastSnapshot.time);
            });
          }
        }
      }
      const maxProjectiles=Math.min(30,Math.max(0,...record.encounters.flatMap(
        e=>e.combat.frames.map(f=>f.projectiles.length))));
      for(let i=0;i<maxProjectiles;i++){
        const ball=MeshBuilder.CreateSphere("dungeon-combat-projectile-"+i,{
          diameter:0.28,segments:6,
        },this.scene);
        ball.material=ordinary;
        ball.isPickable=false;
        ball.setEnabled(false);
        this.projectiles.push(ball);
      }
      this.show(0);
    }else{
      for(const tile of this.tiles)tile.mesh.isVisible=true;
      for(const marker of this.markers)marker.mesh.setEnabled(true);
      for(const decoration of this.decorations){
        decoration.light.setEnabled(true);
        decoration.mesh.setEnabled(true);
      }
      this.drawDevelopmentMap();
    }
  }

  private addPartyRing(model:HeroVisual,material:StandardMaterial):void {
    const ring=MeshBuilder.CreateTorus(
      "dungeon-tp-ring-"+model.root.metadata.adventurerId,
      {diameter:0.92,thickness:0.06,tessellation:20},this.scene);
    ring.parent=model.root;
    ring.position.y=0.08;
    ring.material=material;
    ring.isPickable=false;
    ring.checkCollisions=false;
    ring.metadata={replayOnly:true,temporaryParty:true,
      recordedActorId:model.root.metadata.adventurerId};
    model.root.metadata.temporaryParty=true;
  }

  private animateHero(model:HeroVisual,pose:GroupPhase|"move",time:number):void {
    model.root.metadata.combatPhase=pose;
    const stride=pose==="move"?Math.sin(time*13)*0.55:0;
    model.legs[0].rotation.x=stride;
    model.legs[1].rotation.x=-stride;
    const swing=pose==="strike"||pose==="windup"?-0.8:
      pose==="grabbed"?-0.9:pose==="parry"?-0.45:
      pose==="hurt"||pose==="thrown"?0.3:stride*0.4;
    model.arms[0].rotation.x=swing;
    model.arms[1].rotation.x=-swing;
    model.weaponPivot.rotation.x=pose==="strike"?-1.1:0;
    model.root.rotation.z=pose==="dead"?0.78:pose==="thrown"?0.25:0;
  }

  show(elapsed:number):DungeonPlaybackSnapshot|null {
    if(!this.replay||!this.timeline||!this.hero)return null;
    const snapshot=dungeonPlaybackAt(this.replay,this.timeline,this.layout,elapsed);
    this.lastSnapshot=snapshot;
    const heroWorld=toWorld(this.layout,{x:snapshot.x,z:snapshot.z});
    const formation=recordedTemporaryPartyFormation(
      this.replay,this.timeline,snapshot);
    const leadOffset=formation.find(member=>member.id===this.replay!.heroId);
    this.hero.root.position.set(heroWorld.x+(leadOffset?.offsetX??0),
      0.1,heroWorld.z+(leadOffset?.offsetZ??0));
    if(leadOffset)this.hero.root.rotation.y=leadOffset.heading;
    const actors=visibleDungeonCombatActors(snapshot);
    const lead=actors.find(actor=>actor.id===this.replay!.heroId);
    if(lead){
      this.hero.root.rotation.y=lead.heading;
      this.hero.root.metadata.hp=lead.hp;
    }
    this.animateHero(this.hero,lead?.phase??
      (snapshot.action==="walk"?"move":
        snapshot.action==="death"?"dead":"recover"),snapshot.time);

    for(const model of this.companionHeroes.values())model.root.setEnabled(false);
    for(const member of formation){
      if(member.id===this.replay.heroId ||
        !recordedPartyMemberAlive(this.timeline,snapshot,member.id))continue;
      const model=this.companionHeroes.get(member.id);
      if(!model)continue;
      model.root.setEnabled(true);
      model.root.position.set(heroWorld.x+member.offsetX,0.1,
        heroWorld.z+member.offsetZ);
      model.root.rotation.y=member.heading;
      this.animateHero(model,member.walking?"move":"recover",
        snapshot.time);
    }
    for(const enemy of this.enemies.values())enemy.setEnabled(false);
    for(const visual of this.ghouls.values())visual.root.setEnabled(false);
    for(const mesh of this.projectiles)mesh.setEnabled(false);
    if(snapshot.encounter&&snapshot.frame){
      const origin=toWorld(this.layout,snapshot.encounter);
      for(const actor of actors){
        if(actor.id===this.replay.heroId)continue;
        const model=this.companionHeroes.get(actor.id);
        if(model){
          model.root.setEnabled(true);
          model.root.position.set(origin.x+actor.x,0.1,origin.z+actor.z);
          model.root.rotation.y=actor.heading;
          model.root.metadata.hp=actor.hp;
          this.animateHero(model,actor.phase,snapshot.time);
        }
        const enemy=this.enemies.get(actor.id);
        if(enemy){
          const ghoul=this.ghouls.get(actor.id);
          const skinned=ghoul?.root.metadata?.tripoStatus==="ready";
          if(skinned&&ghoul){
            ghoul.root.setEnabled(true);
            ghoul.root.position.set(origin.x+actor.x,.08,origin.z+actor.z);
            ghoul.root.rotation.y=actor.heading;
            ghoul.root.metadata.hp=actor.hp;
            ghoul.animate(actor.phase,ghoulRecordedPhaseAge(
              snapshot.encounter.combat.frames,actor.id,snapshot.frame.t));
          }else{
            enemy.setEnabled(true);
            const boss=actor.specialAbility==="grapple-throw";
            enemy.position.set(origin.x+actor.x,
              (boss?1.25:0.90),origin.z+actor.z);
            enemy.rotation.y=actor.heading;
            const size=Math.max(.75,actor.radius*1.7);
            enemy.scaling.set(
              size*(actor.hp>0?1:.65),
              size*(boss?1.5:1)*(actor.hp>0?1:.42),
              size*(actor.hp>0?1:.65),
            );
            enemy.metadata={...enemy.metadata,combatPhase:actor.phase,hp:actor.hp};
          }
        }
      }
      for(let i=0;i<this.projectiles.length;i++){
        const projectile=snapshot.frame.projectiles[i],mesh=this.projectiles[i];
        mesh.setEnabled(!!projectile);
        if(projectile)mesh.position.set(
          origin.x+projectile.x,1.2,origin.z+projectile.z);
      }
    }
    this.updateVisibility(snapshot);
    return snapshot;
  }

  private updateVisibility(snapshot:DungeonPlaybackSnapshot):void {
    const visible=dungeonVisibleTiles(this.layout,snapshot.known);
    const key=[...snapshot.known].sort((a,b)=>a-b).join(",")+
      "|"+[...snapshot.resolved].sort().join(",")+"|"+(snapshot.encounter?.featureId??"");
    if(key===this.lastVisibility){
      this.drawFogMap(snapshot,visible);
      return;
    }
    this.lastVisibility=key;
    for(const tile of this.tiles) {
      tile.mesh.isVisible=visible.has(tile.z*this.layout.width+tile.x);
    }
    for(const marker of this.markers){
      const id=marker.z*this.layout.width+marker.x;
      marker.mesh.setEnabled(visible.has(id)&&!snapshot.resolved.has(marker.id)&&
        snapshot.encounter?.featureId!==marker.id);
    }
    for(const decoration of this.decorations){
      const lit=visible.has(decoration.z*this.layout.width+decoration.x);
      decoration.light.setEnabled(lit);
      decoration.mesh.setEnabled(lit);
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
  /** Only explicitly selected visible recorded actors can steer the camera. */
  follow(actorId:string):void {
    if(!this.lastSnapshot||!this.replay)return;
    let p=toWorld(this.layout,this.lastSnapshot);
    const encounter=this.lastSnapshot.encounter;
    const visible=visibleDungeonCombatActors(this.lastSnapshot);
    const actor=visible.find(candidate=>candidate.id===actorId);
    if(actor&&encounter){
      const origin=toWorld(this.layout,encounter);
      p=new Vector3(origin.x+actor.x,0,origin.z+actor.z);
    }else{
      const model=actorId===this.replay.heroId?this.hero:
        this.companionHeroes.get(actorId);
      if(model?.root.isEnabled())
        p=new Vector3(model.root.position.x,0,model.root.position.z);
    }
    this.camera.position.set(p.x,Math.max(22,this.camera.position.y),p.z-15);
    this.camera.setTarget(new Vector3(p.x,0,p.z));
  }
  dispose():void {
    this.clearCombatModels();
    this.replay=null;this.timeline=null;this.lastSnapshot=null;
  }
}
