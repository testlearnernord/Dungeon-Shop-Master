import type {Engine} from "@babylonjs/core/Engines/engine";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import type {GameSfx} from "../gameSfx.ts";
import {
  developerPresentationTime,LAB_CAPTURE_STRIDE,
} from "./developerCombatPresentation.ts";
import {LiveGroupCombatArena,type CombatArenaView} from "./liveGroupCombatArena.ts";
import {
  createGroupCombat,stepGroupCombat,captureGroupCombatFrame,
  type GroupCombatOptions,type GroupCombatState,type GroupReplayFrame,
} from "./groupCombat.ts";
import {
  buildDeveloperCombat,developerHeroFromRoster,randomDeveloperHeroes,
  DEFAULT_DEVELOPER_HERO,DEFAULT_DEVELOPER_CONFIG,
  type DeveloperCombatConfig,type DeveloperHero,
} from "./developerCombatScenario.ts";

const number=(input:HTMLInputElement,min:number,max:number)=>
  Math.max(min,Math.min(max,Number(input.value)||min));
const option=(text:string,value:string)=>new Option(text,value);

/**
 * A disposable 60Hz balance laboratory behind V. Uses the exact production
 * GroupCombat motor and production 3D spectator; nothing is written to
 * GameStore, the world clock, campaign RNG or a persisted replay.
 * A separate editable input panel allows real stat experiments.
 */
export class DeveloperCombatLab {
  private readonly panel:HTMLElement;
  private readonly renderer:LiveGroupCombatArena;
  private readonly opponent:HTMLSelectElement;
  private readonly enemyCount:HTMLSelectElement;
  private readonly arena:HTMLSelectElement;
  private readonly heroCount:HTMLSelectElement;
  private readonly heroSlot:HTMLSelectElement;
  private readonly roster:HTMLSelectElement;
  private readonly heroRole:HTMLSelectElement;
  private readonly heroHp:HTMLInputElement;
  private readonly heroDamage:HTMLInputElement;
  private readonly heroArmor:HTMLInputElement;
  private readonly heroAgility:HTMLInputElement;
  private readonly heroHeals:HTMLInputElement;
  private readonly heroSword:HTMLInputElement;
  private readonly heroVest:HTMLInputElement;
  private readonly seed:HTMLInputElement;
  private readonly status:HTMLElement;
  private readonly pauseButton:HTMLButtonElement;
  private readonly cinematicsButton:HTMLButtonElement;
  private readonly speed:HTMLSelectElement;
  private heroes:DeveloperHero[]=[{...DEFAULT_DEVELOPER_HERO}];
  private state:GroupCombatState|null=null;
  private options:GroupCombatOptions|null=null;
  private frames:GroupReplayFrame[]=[];
  private ticks=0;
  private session=0;
  private accumulated=0;
  private presentedTime=0;
  private lastRenderedTime=-1;
  private statusElapsed=0;
  private paused=false;
  private active=false;
  /** Local developer presentation preference, not part of any game save. */
  private cinematicsEnabled=true;

  constructor(
    engine:Engine,canvas:HTMLCanvasElement,
    host:HTMLElement,private readonly store:GameStore,
    private readonly sfx?:GameSfx,
  ){
    this.panel=host.querySelector<HTMLElement>("#arena-lab-panel")!;
    this.renderer=new LiveGroupCombatArena(engine,canvas,host,this.sfx);
    const get=<T extends Element>(selector:string)=>this.panel.querySelector<T>(selector)!;
    this.opponent=get("#lab-enemy");
    this.enemyCount=get("#lab-enemy-count");
    this.arena=get("#lab-arena");
    this.heroCount=get("#lab-hero-count");
    this.heroSlot=get("#lab-hero-slot");
    this.roster=get("#lab-roster");
    this.heroRole=get("#lab-hero-role");
    this.heroHp=get("#lab-hero-hp");
    this.heroDamage=get("#lab-hero-damage");
    this.heroArmor=get("#lab-hero-armor");
    this.heroAgility=get("#lab-hero-agility");
    this.heroHeals=get("#lab-hero-heals");
    this.heroSword=get("#lab-hero-sword");
    this.heroVest=get("#lab-hero-vest");
    this.seed=get("#lab-seed");
    this.status=get("#lab-status");
    this.pauseButton=get("#lab-pause");
    this.cinematicsButton=get("#lab-cinematics-toggle");
    this.speed=get("#lab-speed");
    this.panel.hidden=true;
    this.seed.value=String(DEFAULT_DEVELOPER_CONFIG.seed);
    this.opponent.addEventListener("change",()=>this.limitEnemyCount());
    this.heroCount.addEventListener("change",()=>{
      this.saveSelectedHero();
      const count=Number(this.heroCount.value);
      while(this.heroes.length<count)this.heroes.push({
        ...DEFAULT_DEVELOPER_HERO,label:"Training hero "+(this.heroes.length+1)});
      this.heroes.length=count;
      this.selectHero(0);
    });
    this.heroSlot.addEventListener("change",()=>this.loadSelectedHero());
    for(const element of [this.heroRole,this.heroHp,this.heroDamage,
      this.heroArmor,this.heroAgility,this.heroHeals,this.heroSword,this.heroVest]){
      element.addEventListener("change",()=>this.saveSelectedHero());
    }
    this.roster.addEventListener("change",()=>this.importRosterHero());
    get<HTMLButtonElement>("#lab-random").addEventListener("click",()=>{
      const seed=Math.floor(Math.random()*0xffffffff)>>>0;
      this.seed.value=String(seed);
      this.heroes=randomDeveloperHeroes(seed,Number(this.heroCount.value));
      this.selectHero(0);
      this.start();
    });
    get<HTMLButtonElement>("#lab-start").addEventListener("click",()=>this.start());
    this.cinematicsButton.addEventListener("click",()=>{
      this.cinematicsEnabled=!this.cinematicsEnabled;
      this.renderer.setCinematicsEnabled(this.cinematicsEnabled);
      this.paintCinematicsButton();
    });
    this.paintCinematicsButton();
    this.pauseButton.addEventListener("click",()=>{
      this.paused=!this.paused;
      // An explicitly paused test must show the EXACT committed state.
      // Do not leave its visible HP/position a tenth of a second behind.
      if(this.paused)this.capturePendingFrame();
      this.presentFrame();
      this.paintStatus();
    });
    get<HTMLButtonElement>("#lab-step").addEventListener("click",()=>{
      if(!this.active||!this.state)return;
      this.paused=true;
      this.simulateTicks(1,true);
      this.presentFrame();
      this.paintStatus();
    });
    this.loadSelectedHero();
  }
  private paintCinematicsButton():void{
    this.cinematicsButton.setAttribute("aria-pressed",
      String(this.cinematicsEnabled));
    this.cinematicsButton.textContent=
      "Cinematic camera: "+(this.cinematicsEnabled?"ON":"OFF");
  }
  get isActive():boolean{return this.active;}
  get currentScene():Scene|null{return this.active?this.renderer.currentScene:null;}
  get isIntroActive():boolean{return this.renderer.isIntroActive;}
  skipIntro():void{this.renderer.skipIntro();}
  nextFocus():void{this.renderer.nextFocus();}
  turnCamera(dx:number,dy:number):void{this.renderer.turnCamera(dx,dy);}

  open():void{
    this.active=true;
    this.panel.hidden=false;
    this.refreshRoster();
    this.limitEnemyCount();
    this.selectHero(0);
    this.start();
  }
  close():void{
    this.active=false;
    this.panel.hidden=true;
    this.renderer.dispose();
    this.state=null;this.options=null;this.frames=[];
    this.accumulated=0;
    this.presentedTime=0;this.lastRenderedTime=-1;this.statusElapsed=0;
  }
  /** The asset inspector owns a different Babylon scene. Its activation
   * must dispose the Lab spectator, including cinematic/HP DOM overlays,
   * without discarding the local encounter configuration or touching GameStore.
   * Returning via restart constructs exactly one fresh observed fight. */
  suspendForModelInspector():void{
    if(!this.active)return;
    this.paused=true;
    this.renderer.dispose();
  }

  /** Full restart from the configured immutable fixture, no random reroll. */
  restart():void{if(this.active)this.start();}

  private refreshRoster():void{
    this.roster.replaceChildren(option("Custom hero / enter values",""));
    for(const hero of this.store.state.adventurers)
      this.roster.add(option(hero.name+" · "+hero.role,hero.id));
    this.roster.value="";
  }
  private importRosterHero():void{
    const rosterHero=this.store.state.adventurers.find(h=>h.id===this.roster.value);
    if(!rosterHero)return;
    this.heroes[Number(this.heroSlot.value)]=developerHeroFromRoster(rosterHero);
    this.loadSelectedHero();
    this.roster.value="";
  }
  private selectHero(index:number):void{
    this.heroSlot.replaceChildren(...this.heroes.map((hero,i)=>
      option((i+1)+". "+hero.label,String(i))));
    this.heroSlot.value=String(Math.min(index,this.heroes.length-1));
    this.loadSelectedHero();
  }
  private loadSelectedHero():void{
    const hero=this.heroes[Number(this.heroSlot.value)]??this.heroes[0];
    if(!hero)return;
    this.heroRole.value=hero.role;
    this.heroHp.value=String(hero.maxHp);
    this.heroDamage.value=String(hero.damage);
    this.heroArmor.value=String(hero.armor);
    this.heroAgility.value=String(hero.agility);
    this.heroHeals.value=String(hero.healCharges);
    this.heroSword.checked=hero.sword;
    this.heroVest.checked=hero.vest;
  }
  private saveSelectedHero():void{
    const index=Number(this.heroSlot.value);
    const previous=this.heroes[index];
    if(!previous)return;
    const role=this.heroRole.value as DeveloperHero["role"];
    const {magicHeals,equipment,...editable}=previous;
    this.heroes[index]={
      ...editable,
      role,
      ...(role===previous.role&&magicHeals!==undefined?{magicHeals}:{}),
      ...(role===previous.role&&equipment?{equipment}:{}),
      maxHp:number(this.heroHp,1,10000),
      damage:number(this.heroDamage,1,1000),
      armor:number(this.heroArmor,0,1000),
      agility:number(this.heroAgility,0,1000),
      healCharges:number(this.heroHeals,0,10),
      sword:this.heroSword.checked,vest:this.heroVest.checked,
    };
  }
  private limitEnemyCount():void{
    const troll=this.opponent.value==="cave-troll";
    for(const item of this.enemyCount.options)item.disabled=troll&&item.value!=="1";
    if(troll)this.enemyCount.value="1";
  }
  private config():DeveloperCombatConfig{
    this.saveSelectedHero();
    return {
      arena:this.arena.value as DeveloperCombatConfig["arena"],
      enemy:this.opponent.value as DeveloperCombatConfig["enemy"],
      enemyCount:Number(this.enemyCount.value),
      heroes:this.heroes.map(h=>({...h})),
      seed:number(this.seed,0,0xffffffff),
    };
  }
  private snapshot():CombatArenaView{
    const options=this.options!,state=this.state!;
    const latest=this.frames.at(-1)!;
    return {
      heroes:options.actors.filter(a=>a.team==="heroes").map(a=>({
        id:a.id,role:a.role==="monster"?"DPS":a.role,
        equipment:a.equipment??{weapon:null,armor:null},
        health:state.actors.find(f=>f.id===a.id)?.hp??a.hp,
      })),
      combat:{
        id:"developer-combat-"+this.session,
        featureId:"lab-opponents",x:0,z:0,
        actors:options.actors,frame:latest,frames:this.frames,
        cues:state.events,
      },
    };
  }
  start():void{
    if(!this.active)return;
    try{
      const config=this.config();
      const options=buildDeveloperCombat(config);
      const state=createGroupCombat(options);
      this.renderer.dispose();
      this.renderer.setDeveloperTheme(config.arena);
      this.renderer.setCinematicsEnabled(this.cinematicsEnabled);
      this.options=options;this.state=state;
      this.frames=[captureGroupCombatFrame(state)];
      this.session++;
      this.ticks=0;this.accumulated=0;this.paused=false;
      this.presentedTime=0;this.lastRenderedTime=-1;this.statusElapsed=0;
      this.renderer.watch(this.snapshot(),"recorded");
      this.paintStatus();
    }catch(error){
      this.paused=true;
      this.status.textContent="Invalid test fixture: "+String(error);
    }
  }
  /** This is the ONLY place that captures an extra lab frame. Normal
   * tests still retain compact 10Hz checkpoints. Never call the 3D painter
   * from the 60Hz motor loop. */
  private capturePendingFrame():void {
    const state=this.state;
    if(!state)return;
    if(state.time>this.frames[this.frames.length-1].t+0.0001)
      this.frames.push(captureGroupCombatFrame(state));
  }
  private simulateTicks(count:number,forceCapture=false):void{
    const s=this.state;
    if(!s||s.outcome!=="fighting")return;
    for(let i=0;i<count&&s.outcome==="fighting";i++){
      stepGroupCombat(s,1/60);
      this.ticks++;
      if(this.ticks>=5400&&s.outcome==="fighting")s.outcome="draw";
      if(this.ticks%LAB_CAPTURE_STRIDE===0||
         s.outcome!=="fighting"||forceCapture)
        this.capturePendingFrame();
    }
    // The real motor performs NO GLB animation, HUD projection or renderer
    // work here. That happens once in presentFrame per display refresh.
  }
  private presentFrame():void {
    const state=this.state;
    if(!state||!this.renderer.isActive)return;
    const last=this.frames[this.frames.length-1].t;
    this.presentedTime=developerPresentationTime(
      state.time,this.accumulated,last,this.presentedTime,
      this.paused||state.outcome!=="fighting");
    // No point repainting the same saved model/HP when the test is paused.
    // Camera motion and the projected HUD still update independently.
    if(Math.abs(this.presentedTime-this.lastRenderedTime)<1e-7)return;
    this.renderer.show(this.snapshot(),this.presentedTime);
    this.lastRenderedTime=this.presentedTime;
  }
  update(dt:number,pressed:ReadonlySet<string>):void{
    if(!this.active)return;
    const bounded=Math.min(.1,Math.max(0,dt));
    const intro=this.renderer.isIntroActive;
    const state=this.state;
    if(state&&!intro&&!this.paused&&state.outcome==="fighting"){
      this.accumulated+=bounded*Number(this.speed.value);
      let steps=0;
      while(this.accumulated>=1/60&&steps<24){
        this.simulateTicks(1);
        this.accumulated-=1/60;
        steps++;
      }
      this.statusElapsed+=bounded;
      if(steps>0&&(this.statusElapsed>=.1||state.outcome!=="fighting")){
        this.statusElapsed=0;
        this.paintStatus();
      }
    }
    if(!intro)this.presentFrame();
    // ONE visual pass per screen frame, irrespective of how many 60Hz
    // simulation steps were processed on this frame.
    this.renderer.updateCamera(dt,pressed);
  }
  private paintStatus():void{
    const state=this.state;
    if(!state)return;
    const heroes=state.actors.filter(a=>a.team==="heroes");
    const foes=state.actors.filter(a=>a.team==="monsters");
    const living=(arr:typeof heroes)=>arr.filter(a=>a.hp>0).length;
    this.pauseButton.textContent=this.paused?"Resume":"Pause";
    this.status.textContent=
      "Test #"+this.session+" · "+state.time.toFixed(2)+"s · "+
      "Heroes "+living(heroes)+"/"+heroes.length+" · Monsters "+
      living(foes)+"/"+foes.length+" · "+
      (state.outcome==="fighting"?(this.paused?"PAUSED":"RUNNING"):
        "RESULT: "+state.outcome.toUpperCase())+
      " · "+state.events.filter(e=>e.kind==="hit").length+" landed hits";
  }
}
