import {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import {Engine} from "@babylonjs/core/Engines/engine";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {Color3,Color4} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Scene} from "@babylonjs/core/scene";
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

  constructor(private readonly engine:Engine){}

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
    for(const [id,model] of this.actors){
      const actor=fight.frame.actors.find(candidate=>candidate.id===id);
      if(!actor){
        model.hero?.root.setEnabled(false);
        model.fallback?.setEnabled(false);
        model.ghoul?.root.setEnabled(false);
        continue;
      }
      const pos=new Vector3(actor.x,0.10,actor.z);
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
    // No new actor can be created from an interpolated render state: all
    // specs and IDs came from the authoritative combat checkpoint.
  }

  resetCamera():void{
    const camera=this.camera;
    if(!camera||!this.scene)return;
    const geometry=this.scene.metadata as {
      cx:number;cz:number;width:number;depth:number;
    };
    camera.position.set(geometry.cx,Math.max(12,geometry.width*.85),
      geometry.cz-Math.max(14,geometry.depth));
    camera.setTarget(new Vector3(geometry.cx,0,geometry.cz));
  }

  dispose():void{
    for(const model of this.actors.values())model.ghoul?.dispose();
    this.actors.clear();
    this.projectiles=[];
    this.projectileMaterial=null;
    this.scene?.dispose();
    this.scene=null;this.camera=null;this.fightId=null;
  }

  private create(view:CombatArenaView):void{
    const fight=view.combat;
    if(!fight)return;
    const scene=new Scene(this.engine);
    this.scene=scene;
    this.fightId=fight.id;
    scene.clearColor=new Color4(.025,.025,.034,1);
    const bounds=fitBounds(fight.actors);
    scene.metadata=bounds;
    const camera=new UniversalCamera("live-fight-arena-camera",
      Vector3.Zero(),scene);
    camera.minZ=.1;camera.maxZ=120;camera.fov=.82;
    scene.activeCamera=camera;
    this.camera=camera;
    this.resetCamera();
    const ambient=new HemisphericLight("live-fight-ambient",
      new Vector3(0,1,0),scene);
    ambient.intensity=.90;
    const floorMat=new StandardMaterial("live-fight-stone",scene);
    floorMat.diffuseColor=Color3.FromHexString("#484741");
    floorMat.specularColor=Color3.FromHexString("#171819");
    const floor=MeshBuilder.CreateGround("live-fight-arena-floor",
      {width:bounds.width, height:bounds.depth},scene);
    floor.position.set(bounds.cx,0,bounds.cz);
    floor.material=floorMat;
    floor.isPickable=false;floor.checkCollisions=false;
    const ringMat=new StandardMaterial("live-fight-ring",scene);
    ringMat.diffuseColor=Color3.FromHexString("#7f5943");
    ringMat.emissiveColor=Color3.FromHexString("#30211a");
    const rim=MeshBuilder.CreateTorus("live-fight-arena-rim",
      {diameter:Math.max(bounds.width,bounds.depth)*.84,
        thickness:.11,tessellation:56},scene);
    rim.position.set(bounds.cx,.10,bounds.cz);
    rim.material=ringMat;rim.isPickable=false;
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
        this.actors.set(spec.id,{spec,hero,fallback:null,ghoul:null});
      }else{
        const fallback=MeshBuilder.CreateSphere("live-fight-monster-"+spec.id,
          {diameter:Math.max(1.1,2*(spec.radius??.65)),segments:12},scene);
        fallback.material=monsterMaterial;
        fallback.isPickable=false;fallback.checkCollisions=false;
        fallback.metadata={liveArenaOnly:true,actorId:spec.id,fallbackOnly:true};
        // Animated Tripo ghouls are requested only when a player explicitly
        // enters this arena. The cave-Troll boss still has its own viewer.
        const ghoul=spec.specialAbility==="grapple-throw"?null:
          createDungeonGhoulVisual(scene,spec.id);
        this.actors.set(spec.id,{spec,hero:null,fallback,ghoul});
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
