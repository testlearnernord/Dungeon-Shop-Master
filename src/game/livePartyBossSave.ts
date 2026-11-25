import type {GameState} from "./gameState.ts";
import type {LivePartyBossCombat} from "./liveDungeonRuntime.ts";
import {caveTrollPartyOptions,CAVE_TROLL_LIVE_PROFILE} from "./sharedBossCombat.ts";
import {gearFromName} from "./gearCatalog.ts";
import {createGroupCombat,captureGroupCombatFrame,
  type GroupCombatOptions} from "./groupCombat.ts";
import {CAVE_TROLL_FLOOR} from "./dungeonTopology.ts";
import {PARTY_BOSS_MAX_SECONDS} from "./combatEncounter.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,LIVE_COMBAT_INTERVAL_TICKS}
  from "./liveDungeonRuntime.ts";

const record=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==="object"&&!Array.isArray(v);
const exactly=(v:unknown,required:readonly string[],
  optional:readonly string[]=[]):boolean=>record(v)&&
  required.every(k=>Object.hasOwn(v,k))&&
  Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const bounded=(v:unknown,low:number,high:number):v is number=>
  typeof v==="number"&&Number.isFinite(v)&&v>=low&&v<=high;
const integer=(v:unknown,min:number,max:number):v is number=>
  Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;

/** Strict v26+ validator for the one LIVE Level-10 party boss snapshot.
 *
 * The original campaign combat is a 60Hz GroupCombat, never a second
 * boss simulator. Saved options are compared against live *actual* heroes,
 * and the state must follow one and only one scheduled world clock.
 */
export function livePartyBossCheckpointProblem(
  state:GameState,raw:unknown,combatTick:number,lastStepTick:number,
):string|null{
  if(raw===undefined||raw===null)return null;
  const fail=(message:string)=>"payload.liveDungeon.partyBossCombat "+message;
  if(!exactly(raw,["id","startedTick","heroIds","options","state","frames"]))
    return fail("has missing or unknown fields");
  const b=raw as unknown as LivePartyBossCombat;
  if(!Array.isArray(b.heroIds)||b.heroIds.length<2||b.heroIds.length>3||
     b.heroIds.some(id=>typeof id!=="string")||
     new Set(b.heroIds).size!==b.heroIds.length)
    return fail("requires two or three unique saved heroes");
  const members=b.heroIds.map(id=>state.adventurers.find(h=>h.id===id));
  if(members.some(h=>!h||h.floor!==CAVE_TROLL_FLOOR||
    h.status!=="expedition"||h.health<=0||!h.bossPass))
    return fail("must be a real permitted co-located Level-10 party");
  if(!integer(b.startedTick,0,lastStepTick)||
     (lastStepTick-b.startedTick)%DUNGEON_STEP_INTERVAL_TICKS!==0||
     !integer(combatTick,b.startedTick,state.worldClock.tick)||
     (combatTick-b.startedTick)%LIVE_COMBAT_INTERVAL_TICKS!==0||
     b.id!=="party-boss:"+state.day+":"+b.startedTick+":"+
       b.heroIds.join("+"))
    return fail("clock/identity does not match the one real boss party");
  if(!record(b.options)||!integer(b.options.tacticsSeed,0,0xffffffff))
    return fail("requires saved seeded GroupCombat rules");
  let canonical;
  try{
    canonical=caveTrollPartyOptions(members as GameState["adventurers"][number][],
      b.options.tacticsSeed);
    if(JSON.stringify(b.options)!==JSON.stringify(canonical))
      return fail("encounter options diverged from the real party");
  }catch{
    return fail("cannot reconstruct original fighter options");
  }
  let initial;
  try{initial=createGroupCombat(canonical);}catch{
    return fail("could not reconstruct the 60Hz actor motor");
  }
  if(!exactly(b.state,["actors","bounds","obstacles","projectiles",
    "events","time","outcome"],["environment","tacticsSeed"]))
    return fail("has invalid current GroupCombat shape");
  if(b.state.outcome!=="fighting"||
     b.state.environment!==initial.environment||
     b.state.tacticsSeed!==initial.tacticsSeed||
     JSON.stringify(b.state.bounds)!==JSON.stringify(initial.bounds)||
     JSON.stringify(b.state.obstacles)!==JSON.stringify(initial.obstacles))
    return fail("environment or motor rules have diverged");
  const completed=(combatTick-b.startedTick)*3;
  if(!bounded(b.state.time,0,PARTY_BOSS_MAX_SECONDS)||
     Math.abs(b.state.time*60-completed)>.001||
     completed>=PARTY_BOSS_MAX_SECONDS*60)
    return fail("must match the single world-clock 60Hz simulation time");
  if(!Array.isArray(b.state.actors)||
     b.state.actors.length!==initial.actors.length)
    return fail("must preserve the original participant roster");
  const ids=new Set(initial.actors.map(a=>a.id));
  for(const [i,a] of b.state.actors.entries()){
    const original=initial.actors[i];
    if(!record(a))return fail("fighter has no saved state");
    const keys=["id","team","role","style","maxHp","damage","armor",
      "speed","reach","radius","meleeAbility","agility",
      "grappleDamage","staggerThreshold","specialAbility"] as const;
    if(keys.some(k=>a[k]!==original[k]))
      return fail("fighter stat or identity changed: "+a.id);
    if(!exactly(a,[
      "id","team","role","style","maxHp","damage","armor","speed",
      "reach","radius","meleeAbility","agility","grappleDamage",
      "staggerThreshold","attacksStarted","activeMeleeAbility",
      "grappleTargetId","grabbedById","throwVelocity","x","z",
      "hp","stamina","heading","lockedHeading","phase","phaseAge",
      "cooldown","applied","targetId","rollX","rollZ",
      "healCharges","distanceTraveled",
    ],["specialAbility","magicHeals"]))
      return fail("has invented actor state fields");
    if(!bounded(a.hp,0,original.maxHp)||
       !bounded(a.stamina,0,100)||
       !integer(a.healCharges,0,10)||
       (a.magicHeals!==undefined&&!integer(a.magicHeals,0,10))||
       !integer(a.attacksStarted,0,10000)||
       typeof a.applied!=="boolean")
      return fail("has inconsistent combat resources");
    if(!["move","windup","strike","recover","cast","heal",
      "roll","parry","hurt","dead","grab","grabMiss","throw",
      "grabbed","thrown"].includes(String(a.phase))||
       !["ordinary","heavy","grapple","troll-smash","troll-slam"]
         .includes(String(a.activeMeleeAbility)))
      return fail("has invalid actor phase");
    for(const key of ["x","z","heading","lockedHeading","phaseAge",
      "cooldown","rollX","rollZ","distanceTraveled"]){
      if(!bounded(a[key],-10000,100000))
        return fail("has invalid actor coordinate "+key);
    }
    for(const key of ["targetId","grappleTargetId","grabbedById"]){
      if(a[key]!==null&&!ids.has(String(a[key])))
        return fail("references an unreal combat target");
    }
    if(!exactly(a.throwVelocity,["x","z"])||
      !bounded(a.throwVelocity.x,-10000,10000)||
      !bounded(a.throwVelocity.z,-10000,10000))
      return fail("has invalid throw velocity");
  }
  if(!Array.isArray(b.state.projectiles)||b.state.projectiles.length>30||
     !Array.isArray(b.state.events)||b.state.events.length>3500)
    return fail("has oversized combat history");
  for(const projectile of b.state.projectiles){
    if(!exactly(projectile,["ownerId","team","x","z","vx","vz","damage","ttl"])||
       !ids.has(projectile.ownerId)||!["heroes","monsters"].includes(projectile.team)||
       !["x","z","vx","vz","damage","ttl"].every(k=>
         bounded((projectile as unknown as Record<string,unknown>)[k],
           -10000,10000)))
      return fail("has invalid physical projectile");
  }
  if(!Array.isArray(b.frames)||b.frames.length!==1+completed/6||
     b.frames.length>901||
     JSON.stringify(b.frames[0])!==
       JSON.stringify(captureGroupCombatFrame(initial)))
    return fail("has missing or forged group combat snapshots");
  let prior=-1;
  for(const frame of b.frames){
    if(!exactly(frame,["t","actors","projectiles"])||
       !bounded(frame.t,0,b.state.time+.001)||frame.t<prior||
       !Array.isArray(frame.actors)||
       frame.actors.length!==initial.actors.length||
       !Array.isArray(frame.projectiles)||frame.projectiles.length>30)
      return fail("has invalid chronological 60Hz snapshot");
    prior=frame.t;
    for(const actor of frame.actors){
      if(!exactly(actor,["id","x","z","hp","stamina","heading","phase"],["ability"])||
         !ids.has(actor.id)||!bounded(actor.hp,0,100000)||
         !["x","z","stamina","heading"].every(k=>
           bounded(actor[k],-10000,10000)))
        return fail("has an invalid saved replay fighter");
    }
  }
  if(Math.abs((b.frames.at(-1)?.t??-1)-b.state.time)>.11)
    return fail("is missing the latest saved frame");
  return null;
}

/** Historical gear uses the same catalog as actual combat, not today's roster.
 * Null slots are legal, but foreign-class weapons and wrong-slot items are not. */
function validRecordedGear(role:unknown,raw:unknown):boolean{
  if(!record(raw))return false;
  const weapon=typeof raw.weapon==="string"?gearFromName(raw.weapon):null;
  const armor=typeof raw.armor==="string"?gearFromName(raw.armor):null;
  return (raw.weapon===null||(weapon?.slot==="weapon"&&weapon.role===role))&&
    (raw.armor===null||armor?.slot==="armor");
}

/**
 * Immutable, already committed Floor-10 party result. Validate the archive
 * independently of today's roster: a deceased or leveled-up hero must not
 * change the historical fighter stats. The group motor and first frame are
 * still the sole authority; no combat is recomputed during replay.
 */
export function partyBossReplayProblem(raw:unknown,leaderId:string):string|null{
  const fail=(message:string)=>"partyBossReplay "+message;
  if(!exactly(raw,["version","actors","bounds","obstacles","environment",
    "tacticsSeed","frames","cues","outcome"]))
    return fail("has missing or unknown fields");
  const rec=raw as Record<string,unknown>;
  if(rec.version!==1||rec.environment!=="cave-lava"||
     !integer(rec.tacticsSeed,0,0xffffffff)||
     !["heroes","monsters","draw"].includes(String(rec.outcome)))
    return fail("has incompatible replay identity or outcome");
  if(!Array.isArray(rec.actors)||rec.actors.length<3||
     rec.actors.length>4||!rec.actors.every(v=>record(v)))
    return fail("must preserve a two/three hero team and one real Troll");
  const specs=rec.actors as Record<string,unknown>[];
  const heroes=specs.filter(a=>a.team==="heroes");
  const monsters=specs.filter(a=>a.team==="monsters");
  const heroIds=new Set(heroes.map(a=>a.id));
  if(heroes.length<2||heroes.length>3||
     heroes.some(a=>typeof a.id!=="string"||
       !/^adventurer-[1-9]\d*$/.test(a.id)||
       !["tank","DPS","healer"].includes(String(a.role))||
       !exactly(a.equipment,["weapon","armor"])||
       !validRecordedGear(a.role,a.equipment))||
     heroIds.size!==heroes.length||!heroIds.has(leaderId)||
     monsters.length!==1||
     monsters[0].id!=="cave-troll"||
     monsters[0].specialAbility!=="grapple-throw"||
     Object.entries(CAVE_TROLL_LIVE_PROFILE).some(([key,value])=>monsters[0][key]!==value))
    return fail("must match real saved Level-10 party and boss archetype");
  if(!Array.isArray(rec.obstacles)||rec.obstacles.length!==0||
     !exactly(rec.bounds,["minX","maxX","minZ","maxZ"])||
     JSON.stringify(rec.bounds)!==
       JSON.stringify({minX:-15,maxX:15,minZ:-15,maxZ:15}))
    return fail("must preserve genuine Level-10 lava arena geometry");
  let initial;
  try{initial=createGroupCombat({
    actors:rec.actors,bounds:rec.bounds,obstacles:rec.obstacles,
    environment:rec.environment,tacticsSeed:rec.tacticsSeed,
  } as unknown as GroupCombatOptions);}catch{
    return fail("fighters are invalid to the single authoritative motor");
  }
  if(!Array.isArray(rec.frames)||rec.frames.length<2||
     rec.frames.length>1000||
     JSON.stringify(rec.frames[0])!==
       JSON.stringify(captureGroupCombatFrame(initial)))
    return fail("lacks the one genuine initial combat frame");
  let previous=-1;
  const actorLimits=new Map(initial.actors.map(a=>[a.id,a.maxHp]));
  for(const rawFrame of rec.frames){
    if(!exactly(rawFrame,["t","actors","projectiles"]))
      return fail("frame has unexpected fields");
    const frame=rawFrame as Record<string,unknown>;
    if(!bounded(frame.t,0,PARTY_BOSS_MAX_SECONDS+.1)||
       frame.t<previous||!Array.isArray(frame.actors)||
       frame.actors.length!==initial.actors.length||
       !Array.isArray(frame.projectiles)||frame.projectiles.length>30)
      return fail("frame timing or fighter count is inconsistent");
    previous=frame.t;
    const seen=new Set<string>();
    for(const rawActor of frame.actors){
      if(!exactly(rawActor,["id","x","z","hp","stamina","heading","phase"],
        ["ability"]))return fail("frame actor structure was tampered with");
      const actor=rawActor as Record<string,unknown>;
      const max=actorLimits.get(String(actor.id));
      if(max===undefined||seen.has(String(actor.id))||
         !bounded(actor.hp,0,max)||
         !bounded(actor.stamina,0,100)||
         !["x","z","heading"].every(k=>bounded(actor[k],-10000,10000))||
         !["move","windup","strike","recover","cast","heal",
           "roll","parry","hurt","dead","grab","grabMiss",
           "throw","grabbed","thrown"].includes(String(actor.phase)))
        return fail("frame actor does not match saved original fighter");
      seen.add(String(actor.id));
    }
    if(seen.size!==actorLimits.size)
      return fail("frame omits an original actor");
    for(const rawProjectile of frame.projectiles){
      if(!exactly(rawProjectile,["ownerId","x","z"])||
         !actorLimits.has(String(rawProjectile.ownerId))||
         !bounded(rawProjectile.x,-10000,10000)||
         !bounded(rawProjectile.z,-10000,10000))
        return fail("frame projectile is not a real fighter's projectile");
    }
  }
  if(!Array.isArray(rec.cues)||rec.cues.length>5000)
    return fail("has oversized combat cue log");
  const ids=new Set(actorLimits.keys());
  for(const rawCue of rec.cues){
    if(!exactly(rawCue,["t","actorId","kind"],["targetId","amount"])||
       !bounded(rawCue.t,0,PARTY_BOSS_MAX_SECONDS+.1)||
       !ids.has(String(rawCue.actorId))||
       (rawCue.targetId!==undefined&&!ids.has(String(rawCue.targetId)))||
       (rawCue.amount!==undefined&&!bounded(rawCue.amount,0,100000)))
      return fail("has forged combat cues");
  }
  const final=rec.frames.at(-1) as Record<string,unknown>;
  const bodies=final.actors as Record<string,unknown>[];
  const aliveHeroes=bodies.some(a=>heroes.some(h=>h.id===a.id)&&Number(a.hp)>0);
  const trollHp=Number(bodies.find(a=>a.id==="cave-troll")?.hp??-1);
  if((rec.outcome==="heroes"&&trollHp>0)||
     (rec.outcome==="monsters"&&aliveHeroes))
    return fail("outcome contradicts final saved fighters");
  return null;
}
