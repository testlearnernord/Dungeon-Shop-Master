import {Engine} from "@babylonjs/core/Engines/engine";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Scene} from "@babylonjs/core/scene";
import {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import {createCombatSpectatorStage,flyCombatSpectatorCamera,
  focusCombatSpectatorCamera,turnCombatSpectatorCamera} from "./combatSpectatorStage.ts";
import {buildCryptCombatArenaArt} from "./cryptCombatArenaArt.ts";
import {buildCaveTrollArenaArt,paintCaveTrollFloor} from "./caveTrollArenaArt.ts";
import {createTripoCaveTrollVisual} from "./tripoCaveTrollVisual.ts";
import type {CaveTrollVisual} from "./caveTrollVisual.ts";
import type {BossPhase} from "./arenaCombatMotion.ts";
import {CombatGroupWorldHud} from "./combatGroupWorldHud.ts";
import {createHeroVisual,type HeroVisual} from "./heroVisual.ts";
import {createDungeonGhoulVisual,type GhoulVisual} from "./dungeonGhoulVisual.ts";
import type {CombatantSpec,GroupPhase,GroupReplayFrame} from "./groupCombat.ts";
import type {LiveSpectatorFrame} from "./liveSpectator.ts";

/** Shared presentation contract for committed LIVE and archived fight frames. */
export type CombatArenaView=Pick<LiveSpectatorFrame,"combat"|"heroes">;

interface VisualActor {
  readonly spec:CombatantSpec;
  readonly hero:HeroVisual|null;
  readonly fallback:Mesh|null;
  readonly ghoul:GhoulVisual|null;
  readonly troll:CaveTrollVisual|null;
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
  private readonly observedPositions=new Map<string,Vector3>();

  constructor(private readonly engine:Engine,
    private readonly canvas:HTMLCanvasElement,
    private readonly panel:HTMLElement) {}

  get isActive():boolean{return this.scene!==null;}
  get currentScene():Scene|null{return this.scene;}
  get observedFightId():string|null{return this.fightId;}

  /** Explicit viewer gesture is the ONLY construction entry point. */
  watch(view:CombatArenaView):boolean{
    if(!view.combat)return false;
    if(this.fightId!==view.combat.id){
      this.dispose();
      this.create(view);
    }
    this.show(view);
    return true;
  }

  /** Show a different immutable committed pose without executing combat AI. */
  show(view:CombatArenaView):void {
    const fight=view.combat;
    if(!fight||!this.scene||fight.id!==this.fightId)return;
    this.hud?.show(fight.frame);
    const timeDelta=this.lastPoseTime>=0&&fight.frame.t>=this.lastPoseTime
      ?Math.min(.1,fight.frame.t-this.lastPoseTime):0;
    this.lastPoseTime=fight.frame.t;
    for(const [id,model] of this.actors){
      const actor=fight.frame.actors.find(candidate=>candidate.id===id);
      if(!actor){
        model.hero?.root.setEnabled(false);
        model.fallback?.setEnabled(false);
        model.ghoul?.root.setEnabled(false);
        model.troll?.root.setEnabled(false);
        continue;
      }
      const pos=new Vector3(actor.x,0.10,actor.z);
      const previous=this.observedPositions.get(id);
      const moved=previous?.subtract(pos).length()??0;
      this.observedPositions.set(id,pos.clone());
      if(model.troll){
        model.troll.root.setEnabled(true);
        model.troll.root.position.set(pos.x,0,pos.z);
        model.troll.root.rotation.y=actor.heading;
        model.troll.root.metadata={...model.troll.root.metadata,
          hp:actor.hp,combatPhase:actor.phase,liveArenaOnly:true};
        const phase:BossPhase=actor.phase==="move"?"chase":
          actor.phase==="hurt"?"stagger":
          actor.phase==="dead"?"dead":
          actor.phase==="grabMiss"?"grabMiss":
          actor.phase==="grab"?"grab":
          actor.phase==="throw"?"throw":
          actor.phase==="windup"?"windup":
          actor.phase==="strike"?"strike":"recover";
        model.troll.animate({
          phase,phaseAge:recordedPhaseAge(fight.frames,id,fight.frame.t),
          slam:false,attackType:"grab",time:fight.frame.t,
          moved,delta:timeDelta,hp:actor.hp,maxHp:model.spec.maxHp,
        });
      }
      if(model.hero){
        model.hero.root.setEnabled(true);
        model.hero.root.position.copyFrom(pos);
        model.hero.root.rotation.y=actor.heading;
        model.hero.root.metadata={...model.hero.root.metadata,
          hp:actor.hp,combatPhase:actor.phase,liveArenaOnly:true};
        animateHero(model.hero,actor.phase,fight.frame.t);
      }
      if(model.fallback){
        const ready=model.ghoul?.root.metadata?.tripoStatus==="ready";
        model.fallback.setEnabled(!ready);
        model.fallback.position.set(pos.x,.9,pos.z);
        model.fallback.rotation.y=actor.heading;
        model.fallback.metadata={...model.fallback.metadata,
          hp:actor.hp,combatPhase:actor.phase};
        if(model.ghoul){
          model.ghoul.root.setEnabled(!!ready);
          if(ready){
            model.ghoul.root.position.set(pos.x,.08,pos.z);
            model.ghoul.root.rotation.y=actor.heading;
            model.ghoul.animate(actor.phase,recordedPhaseAge(
              fight.frames,id,fight.frame.t));
          }
        }
      }
    }
    const particles=fight.frame.projectiles;
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
    this.hud?.render(this.scene,0);
  }

  /** Same Level-6 spectator camera: free-flight and focus cycle. */
  updateCamera(dt:number,pressed:ReadonlySet<string>):void {
    if(!this.camera)return;
    flyCombatSpectatorCamera(this.camera,pressed,dt);
    if(this.scene)this.hud?.render(this.scene,dt);
  }
  turnCamera(dx:number,dy:number):void{
    if(this.camera)turnCombatSpectatorCamera(this.camera,dx,dy);
  }
  nextFocus():string|null{
    if(!this.camera||!this.focusIds.length)return null;
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
    for(const model of this.actors.values())model.ghoul?.dispose();
    this.hud?.dispose();this.hud=null;
    this.observedPositions.clear();
    this.focusIds=[];this.focusedId=null;this.lastPoseTime=-1;
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
    // The existing Level-6 Cave Troll spectator stage is the baseline:
    // monster variants change art and assets; multi-hero parties merely add actors.
    const {scene,camera}=createCombatSpectatorStage(this.engine,
      hasTroll?"cave-troll":"crypt",bounds);
    this.scene=scene;
    this.fightId=fight.id;
    scene.metadata=bounds;
    this.camera=camera;
    if(hasTroll){
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
    this.hud=new CombatGroupWorldHud(this.engine,this.canvas,this.panel,fight.actors);
    this.focusIds=fight.actors.map(actor=>actor.id);
    const heroById=new Map(view.heroes.map(hero=>[hero.id,hero]));
    const monsterMaterial=new StandardMaterial("live-fight-monster",scene);
    monsterMaterial.diffuseColor=Color3.FromHexString("#944a37");
    monsterMaterial.emissiveColor=Color3.FromHexString("#27130d");
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
        this.actors.set(spec.id,{spec,hero,fallback:null,ghoul:null,troll:null});
      }else{
        if(spec.specialAbility==="grapple-throw"){
          // Optional party boss, SAME skinned Troll asset and animations as
          // the Level-6 preview. Never misrepresent a boss as a Ghoul.
          const troll=createTripoCaveTrollVisual(scene);
          troll.root.metadata={...troll.root.metadata,liveArenaOnly:true,
            actorId:spec.id};
          this.actors.set(spec.id,{spec,hero:null,fallback:null,ghoul:null,troll});
          continue;
        }
        const fallback=MeshBuilder.CreateSphere("live-fight-monster-"+spec.id,
          {diameter:Math.max(1.1,2*(spec.radius??.65)),segments:12},scene);
        fallback.material=monsterMaterial;
        fallback.isPickable=false;fallback.checkCollisions=false;
        fallback.metadata={liveArenaOnly:true,actorId:spec.id,fallbackOnly:true};
        // A Ghoul is instantiated only on explicit view, never on the map.
        const ghoul=createDungeonGhoulVisual(scene,spec.id);
        this.actors.set(spec.id,{spec,hero:null,fallback,ghoul,troll:null});
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

function recordedPhaseAge(
  frames:readonly GroupReplayFrame[],actorId:string,t:number,
):number{
  const current=frames.at(-1)?.actors.find(actor=>actor.id===actorId);
  if(!current)return 0;
  for(let i=frames.length-2;i>=0;i--){
    const previous=frames[i].actors.find(actor=>actor.id===actorId);
    if(!previous||previous.phase!==current.phase)
      return Math.max(0,t-frames[i+1].t);
  }
  return Math.max(0,t-(frames[0]?.t??0));
}

function animateHero(model:HeroVisual,phase:GroupPhase,time:number):void{
  const walking=phase==="move";
  const swing=walking?Math.sin(time*12)*.46:0;
  model.legs[0].rotation.x=swing;
  model.legs[1].rotation.x=-swing;
  model.arms[0].rotation.x=(phase==="strike"||phase==="windup")?0.8:-swing*.55;
  model.arms[1].rotation.x=phase==="strike"?-1.1:
    phase==="cast"||phase==="heal"?-.65:swing*.55;
  model.root.scaling.y=phase==="dead"?.48:1;
}
