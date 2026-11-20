import type {GameState} from "./gameState.ts";
import type {LiveBossCombat} from "./liveDungeonRuntime.ts";
import {createCombatPreview} from "./arenaCombatMotion.ts";
import {frameFromCombat,validateBossReplay} from "./bossCombatReplay.ts";
import {
  LIVE_COMBAT_INTERVAL_TICKS,DUNGEON_STEP_INTERVAL_TICKS,
} from "./liveDungeonRuntime.ts";

const isRecord=(v:unknown):v is Record<string,unknown> =>
  !!v&&typeof v==="object"&&!Array.isArray(v);
const shape=(v:unknown,keys:readonly string[],optional:readonly string[]=[]):boolean=>
  isRecord(v)&&keys.every(k=>Object.hasOwn(v,k))&&
  Object.keys(v).every(k=>keys.includes(k)||optional.includes(k));
const range=(n:unknown,a:number,b:number):n is number=>
  typeof n==="number"&&Number.isFinite(n)&&n>=a&&n<=b;
const point=(v:unknown,bound:number):boolean=>
  isRecord(v)&&shape(v,["x","z"])&&
  range(v.x,-bound,bound)&&range(v.z,-bound,bound);
const nonnegativeInteger=(x:unknown,max=100000)=>
  Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<=max;

export function liveBossCheckpointProblem(
  state:GameState,raw:unknown,combatTick:number,lastStepTick:number,
):string|null {
  if(raw===undefined||raw===null)return null;
  const fail=(reason:string):string=>"payload.liveDungeon.bossCombat "+reason;
  if(!shape(raw,["id","startedTick","heroId","state","frames","pendingCues"]))
    return fail("has missing or unknown fields");
  const value=raw as unknown as LiveBossCombat;
  const hero=state.adventurers.find(a=>a.id===value.heroId);
  if(!hero||hero.floor!==6||hero.status!=="expedition"||hero.health<=0)
    return fail("must refer to a living real Floor-6 explorer");
  // A boss may span several actual 30-second exploration steps. The
  // original start must remain fixed while lastStepTick progresses.
  if(!Number.isSafeInteger(value.startedTick)||
     value.startedTick>lastStepTick||
     value.startedTick<0||
     (lastStepTick-value.startedTick)%DUNGEON_STEP_INTERVAL_TICKS!==0||
     combatTick<value.startedTick||
     (combatTick-value.startedTick)%LIVE_COMBAT_INTERVAL_TICKS!==0||
     value.id!=="live-boss:"+state.day+":"+value.startedTick+":"+hero.id)
    return fail("clock/identity does not match the one real boss");
  const motion=value.state;
  const required=["options","time","hero","boss","heroHeading","bossHeading",
    "lockedBossHeading","heroHp","bossHp","stamina","heroPhase",
    "heroAge","heroCooldown","heroApplied","rollDirection",
    "lastDefenseAttack","rollRisksLava","bossPhase","bossAge",
    "bossCooldown","bossDamageApplied","bossAttacks","bossSlam",
    "bossAttack","throwVelocity","bossStamina","magicHeals",
    "healingSupplies","projectiles","cues","outcome",
    "distanceTraveled","dodgeCount","parryCount","landedHits","missedHits"];
  if(!shape(motion,required)||motion.outcome!=="fighting")
    return fail("must preserve an active, genuine boss motor state");
  const opts=motion.options;
  const optsKeys=["role","sword","armor","health","maxHealth",
    "healingSupplies","strength","agility","intellect","tacticsSeed"];
  if(!shape(opts,optsKeys)||
     opts.role!==hero.role||
     opts.sword!==(hero.equipment.weapon==="Iron Sword")||
     opts.armor!==(hero.equipment.armor==="Leather Vest")||
     opts.health!==hero.health||opts.maxHealth!==hero.stats.maxHealth||
     opts.healingSupplies!==hero.inventory.healing||
     opts.strength!==hero.stats.strength||
     opts.agility!==hero.stats.agility||
     opts.intellect!==hero.stats.intellect||
     !nonnegativeInteger(opts.tacticsSeed,31))
    return fail("options do not match the actual original hero");
  const ticks=(combatTick-value.startedTick)*3;
  if(ticks<0||ticks>=90*60||!range(motion.time,0,90)||
     Math.abs(motion.time*60-ticks)>.001)
    return fail("60Hz state time differs from committed world-clock ticks");
  const runtime=motion as unknown as Record<string,unknown>;
  for(const key of ["hero","boss","rollDirection","throwVelocity"])
    if(!point(runtime[key],50))return fail("invalid "+key+" coordinates");
  for(const key of ["heroHeading","bossHeading","lockedBossHeading",
    "heroAge","heroCooldown","bossAge","bossCooldown","bossStamina",
    "distanceTraveled"])
    if(!range(runtime[key],-100,100000))return fail("invalid "+key);
  if(!range(motion.heroHp,0,hero.stats.maxHealth)||
     !range(motion.bossHp,0,280)||!range(motion.stamina,0,100)||
     motion.heroHp===0||motion.bossHp===0)
    return fail("invalid fighting HP or stamina");
  for(const key of ["heroApplied","rollRisksLava","bossDamageApplied","bossSlam"])
    if(typeof runtime[key]!=="boolean")return fail("invalid "+key);
  if(!["move","roll","parry","attack","cast","heal","hurt",
        "grabbed","thrown","dead"].includes(String(motion.heroPhase))||
     !["chase","windup","strike","grab","throw","grabMiss",
        "recover","stagger","dead"].includes(String(motion.bossPhase))||
     !["smash","slam","grab"].includes(String(motion.bossAttack)))
    return fail("invalid combat phase/ability");
  for(const key of ["bossAttacks","magicHeals","healingSupplies",
    "dodgeCount","parryCount","landedHits","missedHits"]){
    if(!nonnegativeInteger(runtime[key]))return fail("invalid "+key);
  }
  if(!Number.isSafeInteger(motion.lastDefenseAttack)||
     motion.lastDefenseAttack< -1)return fail("invalid defense attack ordinal");
  const cueCheck=(v:unknown):boolean=>
    isRecord(v)&&shape(v,["kind"],["amount"])&&
    ["windup","dodge","parry","miss","hit","hero-hit",
      "grab","throw","projectile","heal","stagger","lava",
      "victory","defeat"].includes(String(v.kind))&&
    (v.amount===undefined||range(v.amount,0,100000));
  if(!Array.isArray(motion.cues)||motion.cues.length>30||
     !motion.cues.every(cueCheck)||
     !Array.isArray(value.pendingCues)||value.pendingCues.length>30||
     !value.pendingCues.every(cueCheck))
    return fail("invalid pending combat cues");
  if(!Array.isArray(motion.projectiles)||motion.projectiles.length>20||
     !motion.projectiles.every(p=>
       shape(p,["x","z","dx","dz","damage","ttl"])&&
       ["x","z","dx","dz","damage","ttl"].every(k=>
         range((p as unknown as Record<string,unknown>)[k],-10000,10000))))
    return fail("invalid active projectiles");
  if(!Array.isArray(value.frames)||
     value.frames.length!==1+Math.floor(ticks/8)||
     value.frames.length>700)
    return fail("expected actual eight-tick snapshot count");
  const initial=frameFromCombat(createCombatPreview(opts as
    Parameters<typeof createCombatPreview>[0]));
  if(JSON.stringify(value.frames[0])!==JSON.stringify(initial))
    return fail("initial frame was not produced by the real motor");
  if(value.frames.length>1){
    try{
      validateBossReplay({
        version:1,day:state.day,heroId:hero.id,
        role:hero.role,sword:opts.sword,armor:opts.armor,
        maxHp:hero.stats.maxHealth,outcome:"retreat",frames:value.frames,
      },"payload.liveDungeon.bossCombat.frames",hero.id,state.day,"retreat");
    }catch{return fail("invalid replay frame payload");}
  }
  const last=value.frames.at(-1);
  const expected=Math.round(Math.floor(ticks/8)*8/60*1000)/1000;
  if(!last||Math.abs(last.t-expected)>.002)
    return fail("latest eight-tick snapshot is missing");
  return null;
}
