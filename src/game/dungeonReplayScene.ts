import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Light } from "@babylonjs/core/Lights/light";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
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
  dungeonReplayCast, dungeonReplayFocusIds,
  recordedTemporaryPartyVisuals,
} from "./dungeonReplayCast.ts";
import {
  recordedTemporaryPartyFormation, recordedPartyMemberAlive,
} from "./dungeonPartyFormation.ts";
import type { GroupPhase } from "./groupCombat.ts";
import type {LiveSpectatorFrame} from "./liveSpectator.ts";
import type {LiveFloorSpectatorFrame,LiveFloorHero} from "./liveFloorSpectator.ts";
import {predictDungeonHeroSteps} from "./dungeonIntentPreview.ts";
import {sameLiveFloorMap} from "./liveFloorSceneDiff.ts";
import {mapPoseFromCamera,mapCameraPosition,mapCameraTarget}
  from "./dungeonMapCamera.ts";
import {selectHeroFloorPerception,type HeroFloorPerception}
  from "./heroPerception.ts";
import {
  committedLivePartyStep, sampleLivePartyStep, livePartyVisualOffset,
  LIVE_PARTY_STEP_SECONDS, type CommittedPartyStep,
} from "./livePartyPresentation.ts";

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
  private liveFrame:LiveSpectatorFrame|null=null;
  private floorFrame:LiveFloorSpectatorFrame|null=null;
  private readonly floorModels=new Map<string,HeroVisual>();
  private readonly floorMarkers=new Map<string,Mesh>();
  private readonly floorRouteHints=new Map<string,{mesh:LinesMesh;pips:Mesh[];signature:string}>();
  private readonly floorTravel=new Map<string,{step:CommittedPartyStep;seconds:number;gait:number}>();
  private readonly floorHeadings=new Map<string,number>();
  private selectedFloorHero:string|null=null;
  private floorPerspectiveDirty=true;
  private liveHeroId:string|null=null;
  private liveFightId:string|null=null;
  private liveTransit:CommittedPartyStep|null=null;
  private liveTransitSeconds=0;
  private liveGaitSeconds=0;
  private liveHeading=0;
  /** One clickable abstract encounter beacon for both LIVE and recorded maps. */
  private battleMarker:Mesh|null=null;
  private timeline:DungeonPlaybackTimeline|null=null;
  private hero:HeroVisual|null=null;
  private readonly companionHeroes=new Map<string,HeroVisual>();
  private readonly combatMaterials:StandardMaterial[]=[];
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
  get isLive(){return this.liveFrame!==null;}
  get duration(){return this.timeline?.duration??0;}
  get snapshot(){return this.lastSnapshot;}
  get visibleFocusIds():readonly string[] {
    if(this.floorFrame)return this.floorFrame.heroes.map(h=>h.id);
    return this.liveFrame?
      [this.liveFrame.heroId,...this.liveFrame.heroes.filter(h=>
        h.id!==this.liveFrame!.heroId).map(h=>h.id)]:
      this.replay?dungeonReplayFocusIds(this.replay,this.lastSnapshot):[];
  }

  private clearCombatModels():void {
    this.battleMarker?.dispose(false,true);
    this.battleMarker=null;
    for(const model of this.floorModels.values())model.root.dispose(false,true);
    this.floorModels.clear();
    for(const marker of this.floorMarkers.values())marker.dispose(false,true);
    this.floorMarkers.clear();
    for(const hint of this.floorRouteHints.values()){
      hint.mesh.dispose();
      hint.pips.forEach(pip=>pip.dispose());
    }
    this.floorRouteHints.clear();
    this.floorTravel.clear();this.floorHeadings.clear();
    this.selectedFloorHero=null;
    this.floorPerspectiveDirty=true;
    this.hero?.root.dispose(false,true);
    this.hero=null;
    for(const model of this.companionHeroes.values())model.root.dispose(false,true);
    this.companionHeroes.clear();
    for(const material of this.combatMaterials)material.dispose();
    this.combatMaterials.length=0;
  }

  setReplay(record:Level7Replay|null):void {
    this.floorFrame=null;
    this.liveTransit=null;
    this.liveTransitSeconds=0;
    this.liveGaitSeconds=0;
    this.liveHeading=0;
    this.liveFrame=null;
    this.liveHeroId=null;
    this.liveFightId=null;
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
      // Walking actors remain on the map; all combat cast is arena-only.
      for(const actor of dungeonReplayCast(record)){
        if(actor.id===record.heroId||actor.team!=="heroes"||
           actor.role==="monster"||this.companionHeroes.has(actor.id))continue;
        const model=createHeroVisual(this.scene,{
          id:actor.id,role:actor.role,
          equipment:actor.equipment??{weapon:null,armor:null},
        },"dungeon-companion-"+actor.id);
        model.root.metadata={...model.root.metadata,replayOnly:true,
          recordedEquipmentUnknown:actor.equipment===undefined};
        model.root.setEnabled(false);
        this.companionHeroes.set(actor.id,model);
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

  /** Clickable encounter marker; no skinned fighters, weapons or projectiles. */
  private showBattleMarker(point:DungeonPoint|null):void{
    if(!point){this.battleMarker?.setEnabled(false);return;}
    if(!this.battleMarker){
      const marker=MeshBuilder.CreateCylinder("dungeon-combat-marker",
        {height:.24,diameter:2.05,tessellation:8},this.scene);
      const material=new StandardMaterial("dungeon-combat-marker-mat",this.scene);
      material.diffuseColor=Color3.FromHexString("#df694c");
      material.emissiveColor=Color3.FromHexString("#7a2c20");
      marker.material=material;
      marker.isPickable=true;
      marker.checkCollisions=false;
      marker.metadata={abstractBattle:true};
      this.battleMarker=marker;
    }
    const pos=toWorld(this.layout,point);
    this.battleMarker.position.set(pos.x,.38,pos.z);
    this.battleMarker.setEnabled(true);
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
    const lead=snapshot.frame?.actors.find(actor=>actor.id===this.replay!.heroId);
    if(lead)this.hero.root.metadata.hp=lead.hp;
    // Replay camera is an expedition map, not a second combat stage.
    this.hero.root.setEnabled(!snapshot.encounter);
    this.animateHero(this.hero,
      snapshot.action==="walk"?"move":snapshot.action==="death"?"dead":"recover",
      snapshot.time);

    for(const model of this.companionHeroes.values())model.root.setEnabled(false);
    if(!snapshot.encounter)for(const member of formation){
      if(member.id===this.replay.heroId ||
        !recordedPartyMemberAlive(this.timeline,snapshot,member.id))continue;
      const model=this.companionHeroes.get(member.id);
      if(!model)continue;
      model.root.setEnabled(true);
      model.root.position.set(heroWorld.x+member.offsetX,0.1,
        heroWorld.z+member.offsetZ);
      model.root.rotation.y=member.heading;
      this.animateHero(model,member.walking?"move":"recover",snapshot.time);
    }
    this.showBattleMarker(snapshot.encounter);
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

  /** Full-floor read-only rendering. Every hero has its own saved grid tile;
   * co-located party members get only a local cosmetic formation offset.
   * No individual fog, AI or combat is allocated in this overview. */
  showLiveFloor(view:LiveFloorSpectatorFrame):void {
    const previous=this.floorFrame;
    if(previous&&sameLiveFloorMap(previous,view)){
      // Fight checkpoints still carry fresh HP/frames. Keep the latest saved
      // projection, but don't rebuild a single map tile, hero model, light,
      // route arrow or fog texture when no spatial fact has changed.
      this.floorFrame=view;
      for(const hero of view.heroes){
        const model=this.floorModels.get(hero.id);
        if(model)model.root.metadata.hp=hero.health;
      }
      return;
    }
    this.floorPerspectiveDirty=true;
    if(!previous||previous.floor!==view.floor){
      this.clearCombatModels();
      this.replay=null;this.timeline=null;this.lastSnapshot=null;
      this.liveFrame=null;this.liveHeroId=null;this.liveFightId=null;
      this.liveTransit=null;
      if(this.heroPreview)this.heroPreview.root.setEnabled(false);
      this.lastVisibility="";
    }
    for(const hero of view.heroes){
      const old=previous?.heroes.find(member=>member.id===hero.id);
      const ids=(h:LiveFloorHero)=>h.partyMemberIds.length?
        h.partyMemberIds.map(id=>({id})):[{id:h.id}];
      const movement=old?committedLivePartyStep({
        heroId:hero.id,floor:previous!.floor,
        worldTick:previous!.worldTick,x:old.x,z:old.z,
        combat:old.inCombat?{}:null,heroes:ids(old),
      },{
        heroId:hero.id,floor:view.floor,
        worldTick:view.worldTick,x:hero.x,z:hero.z,
        combat:hero.inCombat?{}:null,heroes:ids(hero),
      }):null;
      if(movement){
        this.floorTravel.set(hero.id,{step:movement,seconds:0,gait:0});
        this.floorHeadings.set(hero.id,movement.heading);
      }else if(!old||old.x!==hero.x||old.z!==hero.z||
               old.partyId!==hero.partyId||old.inCombat||hero.inCombat){
        this.floorTravel.delete(hero.id);
      }
    }
    this.floorFrame=view;
    const present=new Set(view.heroes.map(hero=>hero.id));
    for(const [id,model] of this.floorModels){
      if(!present.has(id)||model.root.metadata.floorPartyId!==
          (view.heroes.find(hero=>hero.id===id)?.partyId??null)){
        model.root.dispose(false,true);
        this.floorModels.delete(id);
        this.floorTravel.delete(id);
        this.floorHeadings.delete(id);
      }
    }
    let partyMaterial=this.combatMaterials.find(material=>
      material.name==="dungeon-floor-party-ring");
    for(const hero of view.heroes){
      let model=this.floorModels.get(hero.id);
      if(!model){
        model=createHeroVisual(this.scene,{
          id:hero.id,role:hero.role,equipment:hero.equipment,
        },"dungeon-floor-"+hero.id);
        model.root.metadata={...model.root.metadata,liveFloorOnly:true,
          floorPartyId:hero.partyId};
        // Explicitly selectable character geometry. The ground token
        // avoids having to click a three-pixel helmet in the floor view.
        model.torso.isPickable=true;
        model.torso.metadata={...model.torso.metadata,floorHeroId:hero.id};
        const token=MeshBuilder.CreateCylinder(
          "dungeon-floor-token-"+hero.id,
          {height:.12,diameter:1.5,tessellation:12},this.scene);
        token.parent=model.root;
        token.position.y=.07;
        token.isPickable=true;
        token.checkCollisions=false;
        token.metadata={floorHeroId:hero.id};
        const tokenMaterial=new StandardMaterial(
          "dungeon-floor-token-material-"+hero.id,this.scene);
        tokenMaterial.diffuseColor=Color3.FromHexString("#90cbae");
        tokenMaterial.emissiveColor=Color3.FromHexString("#294f44");
        tokenMaterial.alpha=.38;
        token.material=tokenMaterial;
        if(hero.partyId){
          if(!partyMaterial){
            partyMaterial=new StandardMaterial("dungeon-floor-party-ring",this.scene);
            partyMaterial.diffuseColor=Color3.FromHexString("#d5af68");
            partyMaterial.emissiveColor=Color3.FromHexString("#6b542d");
            this.combatMaterials.push(partyMaterial);
          }
          this.addPartyRing(model,partyMaterial);
        }
        this.floorModels.set(hero.id,model);
      }
      model.root.metadata.hp=hero.health;
      model.root.metadata.floorPartyId=hero.partyId;
      model.root.setEnabled(!hero.inCombat);
    }
    // Two short PREVIEW segments follow the existing autonomous navigator.
    // These arrows are visual forecasts, not persisted plans or invented
    // movement checkpoints. They stop at any unresolved site interaction.
    for(const [id,hint] of this.floorRouteHints){
      if(!present.has(id)){
        hint.mesh.dispose();hint.pips.forEach(pip=>pip.dispose());
        this.floorRouteHints.delete(id);
      }
    }
    for(const hero of view.heroes){
      const points=predictDungeonHeroSteps(this.layout,hero,view.resolved);
      const signature=[hero.x,hero.z,...points.flatMap(p=>[p.x,p.z])]
        .join(",")+"|"+hero.activity+"|"+hero.plannedAction;
      const old=this.floorRouteHints.get(hero.id);
      if(old?.signature===signature)continue;
      old?.mesh.dispose();old?.pips.forEach(pip=>pip.dispose());
      this.floorRouteHints.delete(hero.id);
      if(!points.length)continue;
      const positions=[
        toWorld(this.layout,hero),
        ...points.map(point=>toWorld(this.layout,point)),
      ];
      for(const position of positions)position.y=.32;
      const tip=positions.at(-1)!;
      const prior=positions[positions.length-2]!;
      const vx=tip.x-prior.x,vz=tip.z-prior.z;
      const magnitude=Math.hypot(vx,vz)||1;
      const fx=vx/magnitude,fz=vz/magnitude;
      const left=new Vector3(tip.x-fx*.47-fz*.30,.32,
        tip.z-fz*.47+fx*.30);
      const right=new Vector3(tip.x-fx*.47+fz*.30,.32,
        tip.z-fz*.47-fx*.30);
      const line=MeshBuilder.CreateLines("dungeon-floor-intent-"+hero.id,{
        points:[...positions,left,tip,right],
      },this.scene);
      line.color=Color3.FromHexString(hero.partyId?"#f4d58f":"#9de5d2");
      line.alpha=.98;
      line.renderingGroupId=2; // Above floor geometry, not a hidden AI path.
      line.isPickable=false;line.checkCollisions=false;
      line.metadata={previewOnly:true,floorHeroId:hero.id,
        label:"Two-step route forecast, not an actual saved route"};
      const pips=points.map((point,index)=>{
        const pip=MeshBuilder.CreateCylinder(
          "dungeon-floor-intent-pip-"+hero.id+"-"+(index+1),
          {height:.075,diameter:index===0?.40:.51,tessellation:10},
          this.scene);
        const p=toWorld(this.layout,point);
        pip.position.set(p.x,.41,p.z);
        const color=hero.partyId?"#f4d58f":"#9de5d2";
        const paint=this.scene.getMaterialByName("route-pip-"+color) as
          StandardMaterial|null??new StandardMaterial("route-pip-"+color,this.scene);
        paint.diffuseColor=Color3.FromHexString(color);
        paint.emissiveColor=Color3.FromHexString(color).scale(.42);
        pip.material=paint;
        pip.renderingGroupId=2;pip.isPickable=false;
        pip.checkCollisions=false;
        pip.metadata={previewOnly:true,floorHeroId:hero.id,
          step:index+1};
        return pip;
      });
      this.floorRouteHints.set(hero.id,{mesh:line,pips,signature});
    }
    for(const [id,marker] of this.floorMarkers){
      if(!view.fights.some(f=>f.id===id)){
        marker.dispose(false,true);this.floorMarkers.delete(id);
      }
    }
    for(const fight of view.fights){
      let marker=this.floorMarkers.get(fight.id);
      if(!marker){
        marker=MeshBuilder.CreateCylinder("dungeon-combat-marker",
          {height:.24,diameter:2.05,tessellation:8},this.scene);
        const material=new StandardMaterial(
          "dungeon-floor-combat-marker-"+fight.id,this.scene);
        material.diffuseColor=Color3.FromHexString("#df694c");
        material.emissiveColor=Color3.FromHexString("#7a2c20");
        marker.material=material;
        marker.isPickable=true;marker.checkCollisions=false;
        marker.metadata={abstractBattle:true,fightId:fight.id};
        this.floorMarkers.set(fight.id,marker);
      }
      const pos=toWorld(this.layout,fight);
      marker.position.set(pos.x,.38,pos.z);
      marker.setEnabled(true);
    }
    // Full overview is the Dungeon Shop Master's explicit omniscient camera,
    // NOT any hero's subjective discovered map.
    for(const tile of this.tiles)tile.mesh.isVisible=true;
    const resolved=new Set(view.resolved);
    for(const marker of this.markers)
      marker.mesh.setEnabled(!resolved.has(marker.id));
    for(const deco of this.decorations){
      deco.light.setEnabled(true);deco.mesh.setEnabled(true);
    }
    this.poseLiveFloor(0);
    // The DungeonViewer applies current selection exactly once after
    // this geometry update, including a hero who has just left the floor.
  }

  /** Only view-layer fog. The player's neutral overview retains all tiles,
   * while a selected hero sees their OWN past travel and current LOS only. */
  private paintFloorPerspective():void {
    const frame=this.floorFrame;
    if(!frame)return;
    const perspective=this.selectedFloorHero
      ?selectHeroFloorPerception(this.layout,frame,this.selectedFloorHero)
      :null;
    const visible=perspective?.visible;
    const explored=perspective?.explored;
    const resolved=new Set(frame.resolved);
    for(const tile of this.tiles){
      const cell=tile.z*this.layout.width+tile.x;
      tile.mesh.isVisible=!explored||explored.has(cell);
      tile.mesh.visibility=!visible||visible.has(cell)?1:.33;
    }
    for(const marker of this.markers){
      const cell=marker.z*this.layout.width+marker.x;
      // Dynamic encounters, treasure and traps may change without this
      // hero witnessing it. Never announce a distant resolution.
      marker.mesh.setEnabled((!visible||visible.has(cell))&&
        !resolved.has(marker.id));
    }
    for(const decoration of this.decorations){
      const cell=decoration.z*this.layout.width+decoration.x;
      decoration.mesh.setEnabled(!explored||explored.has(cell));
      decoration.light.setEnabled(!visible||visible.has(cell));
    }
    const seenHeroes=new Set(perspective?.visibleHeroIds??[]);
    for(const [id,model] of this.floorModels){
      const member=frame.heroes.find(hero=>hero.id===id);
      model.root.setEnabled(!!member&&!member.inCombat&&(
        !perspective||id===perspective.heroId||seenHeroes.has(id)));
    }
    for(const [id,marker] of this.floorMarkers){
      const fight=frame.fights.find(entry=>entry.id===id);
      marker.setEnabled(!!fight&&(!visible||
        visible.has(fight.z*this.layout.width+fight.x)));
    }
    for(const [id,hint] of this.floorRouteHints){
      const hero=frame.heroes.find(entry=>entry.id===id);
      const seen=!perspective||id===perspective.heroId||
        perspective.visibleHeroIds.includes(id);
      const visible=!!hero&&!hero.inCombat&&seen&&
        (!this.selectedFloorHero||this.selectedFloorHero===id);
      hint.mesh.setEnabled(visible);
      hint.pips.forEach(pip=>pip.setEnabled(visible));
    }
    if(!perspective){
      this.drawDevelopmentMap();
      const ctx=this.indicator.getContext("2d");
      if(ctx)for(const hero of frame.heroes){
        if(hero.inCombat)continue;
        ctx.fillStyle=hero.partyId?"#e5ca82":"#85d9b2";
        ctx.fillRect(hero.x*6+1,hero.z*6+1,4,4);
      }
      return;
    }
    this.drawLiveHeroMap(frame,perspective);
  }

  private drawLiveHeroMap(
    frame:LiveFloorSpectatorFrame,perception:HeroFloorPerception,
  ):void {
    const ctx=this.indicator.getContext("2d");
    if(!ctx)return;
    const cell=6;
    this.indicator.width=this.layout.width*cell;
    this.indicator.height=this.layout.height*cell;
    for(let z=0;z<this.layout.height;z++)for(let x=0;x<this.layout.width;x++){
      const key=z*this.layout.width+x;
      const kind=tileAt(this.layout,x,z);
      if(!perception.explored.has(key))ctx.fillStyle="#04060b";
      else if(!perception.visible.has(key))
        ctx.fillStyle=kind==="wall"?"#12161b":kind==="room"?"#3c3937":"#2c3236";
      else ctx.fillStyle=kind==="wall"?"#252a31":
        kind==="room"?"#81786d":"#565960";
      ctx.fillRect(x*cell,z*cell,cell,cell);
    }
    const resolved=new Set(frame.resolved);
    for(const marker of this.markers){
      if(!perception.visible.has(marker.z*this.layout.width+marker.x)||
         resolved.has(marker.id))continue;
      ctx.fillStyle=marker.kind==="treasure"?"#e6b845":
        marker.kind==="trap"?"#c94c42":"#e27c62";
      ctx.fillRect(marker.x*cell+1,marker.z*cell+1,cell-2,cell-2);
    }
    for(const hero of frame.heroes){
      if(hero.inCombat||hero.id!==perception.heroId&&
         !perception.visibleHeroIds.includes(hero.id))continue;
      ctx.fillStyle=hero.id===perception.heroId?"#a5ebc7":"#e5ca82";
      ctx.fillRect(hero.x*cell+1,hero.z*cell+1,cell-2,cell-2);
    }
  }

  /** Selection outlines only; never feed presentation choices to the AI. */
  setSelectedFloorHero(heroId:string|null):void {
    if(this.selectedFloorHero===heroId&&!this.floorPerspectiveDirty)return;
    this.selectedFloorHero=heroId;
    this.floorPerspectiveDirty=false;
    for(const [id,model] of this.floorModels){
      const active=id===heroId;
      const token=model.root.getChildMeshes().find(mesh=>
        mesh.name==="dungeon-floor-token-"+id);
      if(token?.material instanceof StandardMaterial){
        token.material.alpha=active?.85:.38;
        token.material.emissiveColor=Color3.FromHexString(
          active?"#d5b366":"#294f44");
      }
      model.torso.renderOutline=active;
      model.torso.outlineColor=Color3.FromHexString("#e9cf82");
      model.torso.outlineWidth=.045;
    }
    this.paintFloorPerspective();
  }

  private poseLiveFloor(dt:number):void {
    const view=this.floorFrame;
    if(!view)return;
    const bounded=Math.min(.1,Math.max(0,dt));
    for(const hero of view.heroes){
      const model=this.floorModels.get(hero.id);
      if(!model||hero.inCombat)continue;
      const transit=this.floorTravel.get(hero.id);
      if(transit){
        transit.seconds=Math.min(LIVE_PARTY_STEP_SECONDS,transit.seconds+bounded);
        transit.gait+=bounded;
      }
      const position=sampleLivePartyStep(transit?.step??null,
        transit?.seconds??0,hero);
      const center=toWorld(this.layout,position);
      const heading=this.floorHeadings.get(hero.id)??0;
      const offset=livePartyVisualOffset(hero.partyMemberIds.length?
        hero.partyMemberIds:[hero.id],hero.id,heading);
      model.root.position.set(center.x+offset.x,.1,center.z+offset.z);
      model.root.rotation.y=heading;
      this.animateHero(model,position.walking?"move":"recover",
        transit?.gait??0);
      if(transit&&transit.seconds>=LIVE_PARTY_STEP_SECONDS)
        this.floorTravel.delete(hero.id);
    }
  }

  advanceLiveFloorPresentation(dt:number):void {
    if(this.floorTravel.size)this.poseLiveFloor(dt);
  }

  /**
   * Between committed dungeon steps, animate only models already on the map.
   * Every sampled path has TWO saved endpoints; otherwise heroes stand still.
   * Both the lead and companions use exactly the same travel pose and gait.
   * This never reads or advances gameplay, generates fog or creates a battle.
   */
  private poseLiveParty():void {
    const view=this.liveFrame;
    if(!view||!this.hero||view.combat)return;
    const location=sampleLivePartyStep(this.liveTransit,
      this.liveTransitSeconds,view);
    const center=toWorld(this.layout,location);
    const ids=view.heroes.map(hero=>hero.id);
    for(const member of view.heroes){
      const model=member.id===view.heroId?this.hero:
        this.companionHeroes.get(member.id);
      if(!model||!model.root.isEnabled())continue;
      const offset=livePartyVisualOffset(ids,member.id,this.liveHeading);
      model.root.position.set(center.x+offset.x,.1,center.z+offset.z);
      model.root.rotation.y=this.liveHeading;
      this.animateHero(model,location.walking?"move":"recover",
        this.liveGaitSeconds);
    }
  }

  /** Cheap cosmetic RAF work only during one already committed tile step. */
  advanceLivePresentation(deltaSeconds:number):void {
    if(!this.liveTransit||!this.liveFrame||this.liveFrame.combat)return;
    const dt=Math.min(.1,Math.max(0,deltaSeconds));
    this.liveTransitSeconds=Math.min(LIVE_PARTY_STEP_SECONDS,
      this.liveTransitSeconds+dt);
    this.liveGaitSeconds+=dt;
    this.poseLiveParty();
    if(this.liveTransitSeconds>=LIVE_PARTY_STEP_SECONDS)
      this.liveTransit=null;
  }

  /** Real-time projection of the committed world, using the SAME Babylon
   * actors, fog, minimap and camera as historical footage. Never advances
   * a battle, calls RNG, creates a replay outcome, or mutates GameStore.
   */
  showLive(view:LiveSpectatorFrame):void {
    if(this.floorFrame){
      this.floorFrame=null;this.clearCombatModels();
    }
    const previous=this.liveFrame;
    const step=committedLivePartyStep(previous,view);
    if(step){
      this.liveTransit=step;
      this.liveTransitSeconds=0;
      this.liveGaitSeconds=0;
      this.liveHeading=step.heading;
    }else if(!previous||previous.heroId!==view.heroId||
             previous.floor!==view.floor||previous.combat!==null||
             view.combat!==null||previous.x!==view.x||previous.z!==view.z){
      this.liveTransit=null;
      this.liveTransitSeconds=0;
      this.liveGaitSeconds=0;
      this.liveHeading=0;
    }
    if(this.replay||this.liveHeroId!==view.heroId){
      this.clearCombatModels();
      this.replay=null;this.timeline=null;this.lastSnapshot=null;
      this.liveHeroId=view.heroId;
      this.liveFightId=null;
      this.lastVisibility="";
      if(this.heroPreview)this.heroPreview.root.setEnabled(false);
      const lead=view.heroes.find(h=>h.id===view.heroId);
      if(!lead)throw new RangeError("LIVE hero must be a current participant");
      this.hero=createHeroVisual(this.scene,{
        id:lead.id,role:lead.role,equipment:lead.equipment,
      },"dungeon-live-"+lead.id);
      this.hero.root.metadata={...this.hero.root.metadata,liveOnly:true};
    }
    this.liveFrame=view;
    if(!this.hero)return;
    const lead=view.heroes.find(h=>h.id===view.heroId)!;
    const observed={
      time:0,duration:0,x:view.x,z:view.z,hp:lead.health,
      action:view.combat?"combat":"walk",
      known:new Set(view.visited),resolved:new Set(view.resolved),
      encounter:null,frame:null,finished:false,percent:0,
    } satisfies DungeonPlaybackSnapshot;
    this.lastSnapshot=observed;
    this.hero.root.metadata.hp=lead.health;
    // An actual fight gets ONLY the map beacon. All animated combat cast
    // belongs in the separately requested LIVE Group Arena.
    this.hero.root.setEnabled(!view.combat);
    const present=new Set(view.heroes.map(h=>h.id));
    for(const [id,model] of this.companionHeroes){
      if(!present.has(id)){model.root.dispose(false,true);
        this.companionHeroes.delete(id);}
      else model.root.setEnabled(false);
    }
    for(const h of view.heroes){
      if(h.id===view.heroId)continue;
      if(!this.companionHeroes.has(h.id)){
        const model=createHeroVisual(this.scene,{
          id:h.id,role:h.role,equipment:h.equipment,
        },"dungeon-live-companion-"+h.id);
        model.root.metadata={...model.root.metadata,liveOnly:true};
        this.companionHeroes.set(h.id,model);
      }
      const model=this.companionHeroes.get(h.id)!;
      model.root.setEnabled(!view.combat);
      model.root.metadata.hp=h.health;
    }
    // All party members now share one actual saved travel step and one
    // animation update, not an isolated pose sampled at world event time.
    this.poseLiveParty();
    // The map never allocates combat actors or steps an animation for a fight.
    const combat=view.combat;
    this.showBattleMarker(combat);
    this.liveFightId=combat?.id??null;
    this.updateVisibility(observed);
  }
  /** Only explicitly selected visible recorded actors can steer the camera. */
  follow(actorId:string):void {
    if(this.floorFrame){
      const hero=this.floorFrame.heroes.find(member=>member.id===actorId);
      if(!hero)return;
      // Center on the hero's committed tile, including an abstract active
      // fight where their presentation model is intentionally hidden.
      // Never destroy the orbit angle or zoom selected by the player.
      const target=toWorld(this.layout,hero);
      const current=mapPoseFromCamera(this.camera.position,
        this.camera.getTarget());
      const pose={...current,x:target.x,z:target.z};
      const position=mapCameraPosition(pose);
      const focus=mapCameraTarget(pose);
      this.camera.position.set(position.x,position.y,position.z);
      this.camera.setTarget(new Vector3(focus.x,focus.y,focus.z));
      return;
    }
    if(!this.lastSnapshot||(!this.replay&&!this.liveFrame))return;
    let p=toWorld(this.layout,this.lastSnapshot);
    const encounter=this.lastSnapshot.encounter;
    if(this.liveFrame){
      // Map camera follows a fight site, never an individual animated
      // combat actor. Detailed actor positions are for the opt-in arena.
      const combat=this.liveFrame.combat;
      if(combat)p=toWorld(this.layout,{x:combat.x,z:combat.z});
      else{
        const model=actorId===this.liveFrame.heroId?this.hero:
          this.companionHeroes.get(actorId);
        if(model?.root.isEnabled())
          p=new Vector3(model.root.position.x,0,model.root.position.z);
      }
      this.camera.position.set(p.x,Math.max(22,this.camera.position.y),p.z-15);
      this.camera.setTarget(new Vector3(p.x,0,p.z));
      return;
    }
    if(encounter){
      p=toWorld(this.layout,encounter);
    }else{
      const model=actorId===this.replay?.heroId?this.hero:
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
    this.liveFrame=null;this.liveHeroId=null;this.liveFightId=null;
    this.floorFrame=null;
    this.liveTransit=null;this.liveTransitSeconds=0;
  }
}
