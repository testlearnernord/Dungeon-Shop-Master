import {Engine} from "@babylonjs/core/Engines/engine";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Matrix,Quaternion,Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Scene} from "@babylonjs/core/scene";
import {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import {createCombatSpectatorStage,flyCombatSpectatorCamera,
  type CombatStageTheme,
  focusCombatSpectatorCamera,turnCombatSpectatorCamera} from "./combatSpectatorStage.ts";
import {buildCryptCombatArenaArt} from "./cryptCombatArenaArt.ts";
import {buildCaveTrollArenaArt,paintCaveTrollFloor} from "./caveTrollArenaArt.ts";
import {createTripoCaveTrollVisual} from "./tripoCaveTrollVisual.ts";
import {createCaveTrollImpactVisual,type CaveTrollImpactVisual}
  from "./caveTrollImpactVisual.ts";
import type {CaveTrollVisual} from "./caveTrollVisual.ts";
import type {BossPhase} from "./arenaCombatMotion.ts";
import {GRAPPLE_TIMING} from "./combatGrapple.ts";
import {airborneRootFromGrip} from "./tripoGripPresentation.ts";
import {CombatGroupWorldHud} from "./combatGroupWorldHud.ts";
import {createHeroVisual,type HeroVisual} from "./heroVisual.ts";
import {createDungeonGhoulVisual,type GhoulVisual} from "./dungeonGhoulVisual.ts";
import type {CombatantSpec,GroupPhase,GroupReplayFrame} from "./groupCombat.ts";
import {sampleGroupReplayPresentation} from "./groupReplayPresentation.ts";
import {ghoulRecordedPhaseAge,ghoulRecordedStrikeOrdinal} from "./ghoulMotion.ts";
import {GroupCombatSoundCursor} from "./groupCombatSfx.ts";
import type {GameSfx,SoundListener} from "../gameSfx.ts";
import type {LiveSpectatorFrame} from "./liveSpectator.ts";
import {createGroupCombatIntro,sampleGroupCombatIntro,
  type GroupIntroTrack} from "./groupCombatIntro.ts";
import type {CinematicFrame} from "./combatCinematic.ts";

/** Shared presentation contract for committed LIVE and archived fight frames. */
export type CombatArenaView=Pick<LiveSpectatorFrame,"combat"|"heroes">;

interface VisualActor {
  readonly spec:CombatantSpec;
  readonly hero:HeroVisual|null;
  readonly ghoul:GhoulVisual|null;
  readonly troll:CaveTrollVisual|null;
}

/** Visual-only interpolation state; no grapple authority or damage here. */
interface ObservedGrip {
  handStart:Quaternion|null;
  heroOrientation:Quaternion|null;
  approach:Vector3|null;
  heldRoot:Vector3|null;
  launchRoot:Vector3|null;
  launchMotor:Vector3|null;
}

/**
 * Optional, read-only 3D witness to an ALREADY RUNNING 60Hz world-clock fight.
 * Creating the scene, drawing models and animation poses is opt-in and never
 * steps the group engine, decides an outcome, or mutates saved GameState.
 * Other dungeon parties and physical shop customers keep advancing.
 *
 * The LIVE dungeon MAP itself owns NO monster GLBs, projectiles or fighting
 * animation. Only this dedicated arena loads that presentation work.
 */
export class LiveGroupCombatArena{
  private scene:Scene|null=null;
  private camera:UniversalCamera|null=null;
  private fightId:string|null=null;
  private readonly actors=new Map<string,VisualActor>();
  private projectiles:Mesh[]=[];
  private projectileMaterial:StandardMaterial|null=null;
  private hud:CombatGroupWorldHud|null=null;
  private focusIds:string[]=[];
  private focusedId:string|null=null;
  private lastPoseTime=-1;
  private liveBuffered=false;
  private presentationTime=0;
  private lastCommittedView:CombatArenaView|null=null;
  /** Optional render-only time for the V lab. Never used for LIVE authority. */
  private localPresentationTime:number|null=null;
  private readonly observedPositions=new Map<string,Vector3>();
  private readonly actorPhases=new Map<string,GroupPhase>();
  private readonly stepDistances=new Map<string,number>();
  private readonly observedGrips=new Map<string,ObservedGrip>();
  private readonly bossImpactVisuals=new Map<string,CaveTrollImpactVisual>();
  private intro:GroupIntroTrack|null=null;
  private introElapsed=0;
  private developerStage:CombatStageTheme|null=null;
  private audioCursor:GroupCombatSoundCursor|null=null;
  private introSfxIndex=0;
  private bossStage=false;

  /** V-mode presentation override ONLY. Never changes contact/hazard rules. */
  setDeveloperTheme(theme:CombatStageTheme|null):void{
    if(this.scene)throw new Error("Change test stage before creating the arena");
    this.developerStage=theme;
  }

  constructor(private readonly engine:Engine,
    private readonly canvas:HTMLCanvasElement,
    private readonly panel:HTMLElement,
    private readonly sfx?:GameSfx) {}

  get isActive():boolean{return this.scene!==null;}
  get currentScene():Scene|null{return this.scene;}
  get observedFightId():string|null{return this.fightId;}
  get isIntroActive():boolean{return this.intro!==null;}
  get introFrame():CinematicFrame|null{
    return this.intro?sampleGroupCombatIntro(this.intro,this.introElapsed):null;
  }
  /** Skips *only* the spectator film, never steps or rewinds the fight. */
  skipIntro():void{
    if(!this.intro)return;
    this.intro=null;
    this.introSfxIndex=3;
    this.resetCamera();
  }

  /** Explicit viewer gesture is the ONLY construction entry point. */
  watch(view:CombatArenaView,mode:"live"|"recorded"="recorded"):boolean{
    if(!view.combat)return false;
    if(this.fightId!==view.combat.id){
      this.dispose();
      this.create(view);
      // Join at the current committed time: do not retroactively play
      // archived strikes, even when opening the viewer halfway through.
      this.audioCursor=new GroupCombatSoundCursor(
        view.combat.actors,view.combat.frame.t);
      if(this.bossStage)this.sfx?.beginArena();
      else this.sfx?.prepareCombatSamples();
      this.introSfxIndex=0;
      // The LIVE world commits 0.5s batches. Present the most recent half
      // second of ALREADY committed frames at screen refresh rate, rather
      // than jumping between 0.5-second poses. This is a read-only buffer,
      // NOT future prediction or a second 60Hz combat engine.
      this.liveBuffered=mode==="live";
      this.presentationTime=Math.max(0,view.combat.frame.t-.5);
      // The actual recorded cast and first available committed pose define
      // the entire opt-in film; never predict future combat state.
      this.intro=createGroupCombatIntro(view.combat.id,view.combat.actors,
        view.combat.frame);
      this.introElapsed=0;
    }
    this.show(view);
    return true;
  }

  /** Show a different immutable committed pose without executing combat AI.
   * The optional timestamp is exclusively the local V-lab render clock:
   * interpolate committed 10Hz snapshots at the actual screen refresh rate.
   * LIVE and archived fight consumers retain their existing presentation.
   */
  show(view:CombatArenaView,localTime?:number):void {
    const fight=view.combat;
    if(!fight||!this.scene||fight.id!==this.fightId)return;
    this.lastCommittedView=view;
    this.localPresentationTime=localTime??null;
    const frame=localTime!==undefined
      ?sampleGroupReplayPresentation(fight.frames,localTime)
      :this.liveBuffered
        ?sampleGroupReplayPresentation(fight.frames,this.presentationTime)
        :fight.frame;
    this.paintSavedFrame(view,frame,localTime!==undefined);
  }

  private paintSavedFrame(
    view:CombatArenaView,frame:GroupReplayFrame,deferHud=false,
  ):void{
    const fight=view.combat;
    if(!fight||!this.scene)return;
    this.hud?.show(frame);
    this.hud?.showCues(fight.cues??[],frame);
    this.playRecordedCues(view,frame);
    const fromTime=this.lastPoseTime;
    const timeDelta=fromTime>=0&&frame.t>=fromTime
      ?Math.min(.1,frame.t-fromTime):0;
    // A seek/reopen never creates sounds or a catch-up burst of footsteps.
    const continuous=fromTime>=0&&frame.t>fromTime&&frame.t-fromTime<=.25;
    this.lastPoseTime=frame.t;
    for(const [id,model] of this.actors){
      const actor=frame.actors.find(candidate=>candidate.id===id);
      if(!actor){
        model.hero?.root.setEnabled(false);
        model.ghoul?.root.setEnabled(false);
        model.troll?.root.setEnabled(false);
        continue;
      }
      const pos=new Vector3(actor.x,0.10,actor.z);
      const previous=this.observedPositions.get(id);
      const moved=previous?.subtract(pos).length()??0;
      this.observedPositions.set(id,pos.clone());
      const priorPhase=this.actorPhases.get(id);
      this.actorPhases.set(id,actor.phase);
      if(continuous && moved>.004 && moved<.65 &&
          (model.troll||model.hero) && actor.phase==="move"){
        const stride=model.troll?1.45:.88;
        const distance=(this.stepDistances.get(id)??0)+moved;
        if(distance>=stride){
          this.sfx?.play(model.troll?"troll-step":"hero-step",
            {x:actor.x,z:actor.z},this.soundListener());
        }
        this.stepDistances.set(id,distance%stride);
      }else if(actor.phase!=="move"||!continuous){
        this.stepDistances.delete(id);
      }
      if(model.troll){
        model.troll.root.setEnabled(true);
        model.troll.root.position.set(pos.x,0,pos.z);
        model.troll.root.rotation.y=actor.heading;
        model.troll.root.metadata={...model.troll.root.metadata,
          hp:actor.hp,combatPhase:actor.phase,liveArenaOnly:true};
        if(continuous&&actor.phase==="strike"&&priorPhase!==undefined&&
            priorPhase!=="strike"){
          this.sfx?.play("troll-swing",{x:actor.x,z:actor.z},
            this.soundListener());
        }
        const phase:BossPhase=actor.phase==="move"?"chase":
          actor.phase==="hurt"?"stagger":
          actor.phase==="dead"?"dead":
          actor.phase==="grabMiss"?"grabMiss":
          actor.phase==="grab"?"grab":
          actor.phase==="throw"?"throw":
          actor.phase==="windup"?"windup":
          actor.phase==="strike"?"strike":"recover";
        const phaseAge=ghoulRecordedPhaseAge(fight.frames,id,frame.t);
        const slam=actor.ability==="troll-slam";
        const attackType=actor.ability==="grapple"||
          phase==="grab"||phase==="throw"||phase==="grabMiss"
            ?"grab":slam?"slam":"smash";
        model.troll.animate({
          phase,phaseAge,slam,attackType,
          time:frame.t,
          moved,delta:timeDelta,hp:actor.hp,maxHp:model.spec.maxHp,
          ...(this.intro?{introTime:this.introElapsed}:{}),
        });
        // One visual pool per real Troll. The saved motor's phase/ability
        // owns every glow, arc and impact, never a scene-owned damage roll.
        this.bossImpactVisuals.get(id)?.paint({
          phase,phaseAge,slam,attackType,
          lockedHeading:actor.heading,x:actor.x,z:actor.z,
        });
      }
      if(model.hero){
        model.hero.root.setEnabled(true);
        model.hero.root.position.copyFrom(pos);
        model.hero.root.rotation.y=actor.heading;
        model.hero.root.metadata={...model.hero.root.metadata,
          hp:actor.hp,combatPhase:actor.phase,liveArenaOnly:true};
        animateHero(model.hero,actor.phase,frame.t,
          ghoulRecordedPhaseAge(fight.frames,id,frame.t));
      }
      if(model.ghoul){
        // Never display the superseded anonymous monster sphere. The actual
        // skinned owner-authored Ghoul is rendered only after its GLB loads.
        // The saved actor, HP and replay remain valid during loading/failure.
        const ready=model.ghoul.root.metadata?.tripoStatus==="ready";
        model.ghoul.root.setEnabled(ready);
        if(ready){
          model.ghoul.root.position.set(pos.x,.08,pos.z);
          model.ghoul.root.rotation.y=actor.heading;
          model.ghoul.animate(actor.phase,ghoulRecordedPhaseAge(
            fight.frames,id,frame.t),actor.phase==="strike"
              ?ghoulRecordedStrikeOrdinal(fight.frames,id,frame.t):1);
        }
      }
    }
    // Apply physical-looking, motor-owned hero holds and flight only AFTER
    // animating the Troll rig, so its actual finger socket is up to date.
    this.paintObservedGrapples(view,frame);
    const particles=frame.projectiles;
    while(this.projectiles.length<particles.length){
      const dot=MeshBuilder.CreateSphere(
        "live-arena-projectile-"+this.projectiles.length,
        {diameter:.23,segments:6},this.scene);
      dot.material=this.projectileMaterial;
      dot.isPickable=false;
      this.projectiles.push(dot);
    }
    this.projectiles.forEach((mesh,i)=>{
      mesh.setEnabled(i<particles.length);
      if(i<particles.length)mesh.position.set(particles[i].x,1.18,particles[i].z);
    });
    // No actor can be added by the visualizer, no alternative damage or AI.
    // Saved participants and exact poses are the only source of truth.
    // The local V loop calls updateCamera once per rendered frame, which
    // draws this HUD once. Do not double-project every plate per frame.
    if(!deferHud)this.hud?.render(this.scene,0);
  }

  /** Attach a captured hero to the Troll's real animated left-hand socket.
   * This is a read-only counterpart of the Level-6 grip presentation. The
   * saved motor position always determines displacement and landing. */
  private paintObservedGrapples(
    view:CombatArenaView,frame:GroupReplayFrame,
  ):void{
    const trollIds=(view.combat?.actors??[]).filter(actor=>
      actor.specialAbility==="grapple-throw").map(actor=>actor.id);
    for(const [id,model] of this.actors){
      if(!model.hero)continue;
      const actor=frame.actors.find(candidate=>candidate.id===id);
      if(!actor||actor.phase!=="grabbed"&&actor.phase!=="thrown"){
        this.observedGrips.delete(id);
        continue;
      }
      const root=model.hero.root;
      let observed=this.observedGrips.get(id);
      if(!observed){
        observed={handStart:null,heroOrientation:null,approach:null,
          heldRoot:null,launchRoot:null,launchMotor:null};
        this.observedGrips.set(id,observed);
      }
      const age=ghoulRecordedPhaseAge(view.combat!.frames,id,frame.t);
      if(actor.phase==="grabbed"){
        // A lab encounter permits one Troll; for future parties with multiple
        // bosses the nearest visible real Troll owns the visual hold.
        const holder=trollIds.map(trollId=>({
          visual:this.actors.get(trollId)?.troll,
          pose:frame.actors.find(entry=>entry.id===trollId),
        })).filter(entry=>entry.visual&&entry.pose).sort((a,b)=>
          Math.hypot(actor.x-a.pose!.x,actor.z-a.pose!.z)-
          Math.hypot(actor.x-b.pose!.x,actor.z-b.pose!.z))[0];
        const grip=holder?.visual?.gripPose?.();
        if(grip){
          if(!observed.handStart){
            observed.handStart=grip.handRotation.clone();
            observed.heroOrientation=Quaternion.RotationYawPitchRoll(
              actor.heading,0,-.38);
            observed.approach=root.position.clone();
          }
          const handDelta=grip.handRotation.multiply(
            Quaternion.Inverse(observed.handStart));
          const orientation=handDelta.multiply(observed.heroOrientation!);
          root.rotationQuaternion=orientation;
          const torsoRotation=Matrix.Identity();
          Matrix.FromQuaternionToRef(orientation,torsoRotation);
          const offset=Vector3.TransformNormal(
            new Vector3(0,1.14*root.scaling.y,0),torsoRotation);
          const target=grip.position.subtract(offset);
          const progress=Math.min(1,Math.max(0,age/.16));
          const eased=progress*progress*(3-2*progress);
          root.position.copyFrom(Vector3.Lerp(
            observed.approach!,target,eased));
          root.metadata.gripAttached=progress>=1;
          root.metadata.gripJoint="mixamorig:LeftHand";
        }else{
          // The GLB may still be loading. Maintain the real hold horizontally.
          root.position.y=2.45;
          root.rotation.z=-.38;
          root.metadata.gripAttached=false;
          root.metadata.gripJoint=null;
        }
        observed.heldRoot=root.position.clone();
        observed.launchRoot=null;
        observed.launchMotor=null;
      }else{
        if(!observed.launchRoot){
          observed.launchRoot=observed.heldRoot?.clone()??
            new Vector3(actor.x,2.45,actor.z);
          observed.launchMotor=new Vector3(actor.x,0,actor.z);
        }
        const progress=Math.min(1,Math.max(0,age/GRAPPLE_TIMING.flight));
        root.position.copyFrom(airborneRootFromGrip(
          observed.launchRoot,observed.launchMotor!,
          new Vector3(actor.x,0,actor.z),progress));
        root.rotationQuaternion=Quaternion.RotationYawPitchRoll(
          actor.heading,-.35*Math.sin(Math.PI*progress),
          2*Math.PI*progress);
        root.metadata.gripAttached=false;
        root.metadata.gripJoint=null;
      }
    }
  }

  private soundListener():SoundListener|undefined{
    return this.camera?{
      x:this.camera.position.x,z:this.camera.position.z,
      yaw:this.camera.rotation.y,
    }:undefined;
  }

  /** Play only the authoritative saved action stream at the observed pose.
   * Never infer hits from an animation, camera FPS, or interpolated HP. */
  private playRecordedCues(view:CombatArenaView,frame:GroupReplayFrame):void {
    if(!this.sfx||!this.audioCursor||!view.combat)return;
    const sounds=this.audioCursor.advance(view.combat.cues??[],frame.t);
    if(!sounds.length)return;
    const listener:SoundListener|undefined=this.camera
      ?{x:this.camera.position.x,z:this.camera.position.z,
          yaw:this.camera.rotation.y}:undefined;
    for(const event of sounds){
      const actor=frame.actors.find(a=>a.id===event.actorId)
        ??view.combat.actors.find(a=>a.id===event.actorId);
      if(!actor)continue;
      this.sfx.play(event.cue,{x:actor.x,z:actor.z},listener,
        false,event.cue==="troll-impact"&&actor.ability==="troll-slam");
    }
  }

  /** Same Level-6 spectator camera: free-flight and focus cycle. */
  updateCamera(dt:number,pressed:ReadonlySet<string>):void {
    if(!this.camera)return;
    const bounded=Math.min(.1,Math.max(0,dt));
    // Even while the audience watches the intro, the authoritative world
    // and the 60Hz committed-frame presentation keep moving independently.
    if(this.liveBuffered&&this.lastCommittedView?.combat){
      const fight=this.lastCommittedView.combat;
      const next=Math.min(fight.frame.t,this.presentationTime+Math.max(0,dt));
      if(next>this.presentationTime){
        this.presentationTime=next;
        this.paintSavedFrame(this.lastCommittedView,
          sampleGroupReplayPresentation(fight.frames,next));
      }
    }
    if(this.intro){
      this.introElapsed=Math.min(this.intro.duration,
        this.introElapsed+bounded);
      if(this.bossStage){
        const landmarks=[{at:1.8,cue:"troll-breath" as const},
          {at:5.9,cue:"troll-roar" as const},
          {at:11.2,cue:"troll-breath" as const}];
        while(this.introSfxIndex<landmarks.length&&
            this.introElapsed>=landmarks[this.introSfxIndex].at){
          const entry=landmarks[this.introSfxIndex++];
          this.sfx?.play(entry.cue);
        }
      }
      const frame=sampleGroupCombatIntro(this.intro,this.introElapsed);
      this.camera.position.set(...frame.eye);
      this.camera.setTarget(new Vector3(...frame.look));
      if(this.introElapsed>=this.intro.duration)this.intro=null;
    }else flyCombatSpectatorCamera(this.camera,pressed,dt);
    if(this.scene)this.hud?.render(this.scene,dt);
  }
  turnCamera(dx:number,dy:number):void{
    if(this.camera&&!this.intro)turnCombatSpectatorCamera(this.camera,dx,dy);
  }
  nextFocus():string|null{
    if(this.intro||!this.camera||!this.focusIds.length)return null;
    const index=this.focusIds.indexOf(this.focusedId??"");
    this.focusedId=this.focusIds[(index+1)%this.focusIds.length];
    const pos=this.observedPositions.get(this.focusedId);
    if(pos)focusCombatSpectatorCamera(this.camera,pos,
      new Vector3(4,5,-8),pos.add(new Vector3(0,2,0)));
    return this.focusedId;
  }
  resetCamera():void{
    const camera=this.camera;
    if(!camera||!this.scene)return;
    const bounds=this.scene.metadata as {
      cx:number;cz:number;width:number;depth:number;
    };
    this.focusedId=null;
    camera.position.set(bounds.cx+Math.min(9,bounds.width*.35),
      Math.max(7,bounds.width*.64),
      bounds.cz-Math.max(14,bounds.depth*1.25));
    camera.setTarget(new Vector3(bounds.cx,1.5,bounds.cz));
  }

  dispose():void{
    this.audioCursor=null;
    this.sfx?.endArena();
    this.sfx?.stopCombatSamples();
    this.bossStage=false;
    this.introSfxIndex=0;
    for(const model of this.actors.values())model.ghoul?.dispose();
    for(const fx of this.bossImpactVisuals.values())fx.dispose();
    this.bossImpactVisuals.clear();
    this.hud?.dispose();this.hud=null;
    this.observedPositions.clear();
    this.actorPhases.clear();
    this.stepDistances.clear();
    this.observedGrips.clear();
    this.focusIds=[];this.focusedId=null;this.lastPoseTime=-1;
    this.lastCommittedView=null;this.localPresentationTime=null;
    this.liveBuffered=false;this.presentationTime=0;
    this.intro=null;this.introElapsed=0;
    this.actors.clear();
    this.projectiles=[];
    this.projectileMaterial=null;
    this.scene?.dispose();
    this.scene=null;this.camera=null;this.fightId=null;
  }

  private create(view:CombatArenaView):void{
    const fight=view.combat;
    if(!fight)return;
    const bounds=fitBounds(fight.actors);
    const hasTroll=fight.actors.some(spec=>spec.specialAbility==="grapple-throw");
    const trollStage=this.developerStage
      ?this.developerStage==="cave-troll":hasTroll;
    this.bossStage=trollStage;
    // The existing Level-6 Cave Troll spectator stage is the baseline:
    // monster variants change art and assets; multi-hero parties merely add actors.
    const {scene,camera}=createCombatSpectatorStage(this.engine,
      trollStage?"cave-troll":"crypt",bounds);
    this.scene=scene;
    this.fightId=fight.id;
    scene.metadata=bounds;
    this.camera=camera;
    if(trollStage){
      const stone=new StandardMaterial("group-troll-floor-mat",scene);
      paintCaveTrollFloor(scene,stone);
      const floor=MeshBuilder.CreateCylinder("live-fight-arena-floor",
        {diameter:34.8,height:.65,tessellation:96},scene);
      floor.position.set(bounds.cx,-.35,bounds.cz);
      floor.material=stone;floor.isPickable=false;floor.checkCollisions=false;
      const lava=new StandardMaterial("group-troll-lava-mat",scene);
      lava.diffuseColor=Color3.FromHexString("#481b13");
      lava.emissiveColor=Color3.FromHexString("#aa3318").scale(.34);
      const molten=MeshBuilder.CreateCylinder("group-troll-lethal-lava",
        {diameter:47,height:.22,tessellation:96},scene);
      molten.position.set(bounds.cx,-.95,bounds.cz);
      molten.material=lava;molten.isPickable=false;molten.checkCollisions=false;
      buildCaveTrollArenaArt(scene);
    }else buildCryptCombatArenaArt(scene,bounds);
    this.resetCamera();
    this.hud=new CombatGroupWorldHud(
      this.engine,this.canvas,this.panel,fight.actors,fight.frame.t);
    this.focusIds=fight.actors.map(actor=>actor.id);
    const heroById=new Map(view.heroes.map(hero=>[hero.id,hero]));
    this.projectileMaterial=new StandardMaterial("live-fight-projectile",scene);
    this.projectileMaterial.diffuseColor=Color3.FromHexString("#efb861");
    this.projectileMaterial.emissiveColor=Color3.FromHexString("#b77b2c");
    for(const spec of fight.actors){
      if(spec.team==="heroes"){
        const known=heroById.get(spec.id);
        const hero=createHeroVisual(scene,{
          id:spec.id,role:known?.role??(spec.role==="monster"?"DPS":spec.role),
          equipment:known?.equipment??spec.equipment??{
            weapon:null,armor:null,
          },
        },"live-fight-hero-"+spec.id);
        hero.root.metadata={...hero.root.metadata,liveArenaOnly:true,
          actorId:spec.id};
        this.actors.set(spec.id,{spec,hero,ghoul:null,troll:null});
      }else{
        if(spec.specialAbility==="grapple-throw"){
          // Optional party boss, SAME skinned Troll asset and animations as
          // the Level-6 preview. Never misrepresent a boss as a Ghoul.
          const troll=createTripoCaveTrollVisual(scene);
          this.bossImpactVisuals.set(spec.id,
            createCaveTrollImpactVisual(scene,"group-"+spec.id));
          troll.root.metadata={...troll.root.metadata,liveArenaOnly:true,
            actorId:spec.id};
          this.actors.set(spec.id,{spec,hero:null,ghoul:null,troll});
          continue;
        }
        // No legacy spheres or duplicated actor meshes. Exactly one
        // authoritative enemy identity receives one opt-in Tripo model.
        const ghoul=createDungeonGhoulVisual(scene,spec.id);
        this.actors.set(spec.id,{spec,hero:null,ghoul,troll:null});
        // Babylon loads rigged GLBs asynchronously. A paused world or a
        // historical still-frame will never dispatch another committed tick.
        // On readiness, repaint ONLY the last saved frame, without RNG,
        // stepping fighters or allocating an additional renderer.
        void ghoul.ready.then(loaded=>{
          if(!loaded||this.scene!==scene||this.fightId!==fight.id)return;
          const committed=this.lastCommittedView;
          if(committed)this.show(committed,
            this.localPresentationTime??undefined);
        });
      }
    }
  }
}

function fitBounds(actors:readonly CombatantSpec[]):{
  cx:number;cz:number;width:number;depth:number;
}{
  const x=actors.map(actor=>actor.x);
  const z=actors.map(actor=>actor.z);
  const lowX=Math.min(...x),highX=Math.max(...x);
  const lowZ=Math.min(...z),highZ=Math.max(...z);
  return {cx:(lowX+highX)/2,cz:(lowZ+highZ)/2,
    width:Math.max(12,highX-lowX+12),
    depth:Math.max(12,highZ-lowZ+12)};
}

function animateHero(
  model:HeroVisual,phase:GroupPhase,time:number,phaseAge:number,
):void{
  const walking=phase==="move";
  const swing=walking?Math.sin(time*12)*.46:0;
  model.legs[0].rotation.x=swing;
  model.legs[1].rotation.x=-swing;
  model.arms[0].rotation.x=phase==="parry"?.65:
    (phase==="strike"||phase==="windup")?.8:-swing*.55;
  // A committed parry lifts the actual equipped weapon into the impact lane.
  model.arms[1].rotation.x=phase==="parry"?-1.65:
    phase==="strike"?-1.1:
    phase==="cast"||phase==="heal"?-.65:swing*.55;
  model.arms[1].rotation.z=phase==="parry"?-.38:0;
  model.root.rotationQuaternion=null;
  const roll=Math.min(1,Math.max(0,phaseAge/.53));
  model.root.rotation.x=phase==="roll"?2*Math.PI*roll:0;
  model.root.rotation.z=phase==="roll"?
    .72*Math.sin(Math.PI*roll):phase==="parry"?-.22:0;
  model.root.scaling.y=phase==="dead"?.48:1;
}
