import type {AdventurerState} from "./adventurers.ts";
import {heroProgression} from "./heroProgression.ts";
import {canAttemptCaveTroll,CAVE_TROLL_FLOOR} from "./dungeonTopology.ts";
import {
  createCombatPreview,type ArenaCue,type CombatPreviewOptions,
  type CombatPreviewState,type ActorPhase,type BossPhase,
} from "./arenaCombatMotion.ts";
import {
  createGroupCombat,stepGroupCombat,
  type GroupCombatOptions,type GroupCombatState,type GroupCombatCue,
  type GroupActor,
} from "./groupCombat.ts";

/**
 * ONE shared 60-Hz combat authority. The current Floor-10 party boss
 * and ordinary live encounters consume the group motor; this adapter
 * also supports historical solo Floor-6 previews.
 *
 * The group motor is the only AI, position, HP and damage writer. The
 * historic flat BossCombatReplay-v1 state is a read-only projection from
 * that motor for the existing historical cinematic renderer. Keeping this
 * projection avoids inventing a second combat resolver or rerolling replays.
 */
export type SharedBossPreview=CombatPreviewState & {
  group:GroupCombatState;
};

export function caveTrollGroupOptions(
  options:CombatPreviewOptions,
):GroupCombatOptions{
  const melee=options.role==="tank"||
    options.role==="DPS"&&options.sword;
  const strength=options.strength??6,intellect=options.intellect??6;
  const base=melee
    ?(options.sword?16:6)+(options.role==="DPS"?5:0)+
      Math.floor(Math.max(0,strength-6)/3)
    :(options.role==="healer"?9:12)+(options.sword?4:0)+
      Math.floor(Math.max(0,intellect-6)/3);
  return {
    environment:"cave-lava",
    ...(options.tacticsSeed!==undefined?{tacticsSeed:options.tacticsSeed}:{}),
    bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},
    obstacles:[],
    actors:[
      {
        id:"hero",team:"heroes",role:options.role,
        style:melee?"melee":"ranged",x:0,z:-9,
        hp:options.health,maxHp:options.maxHealth,
        // The historical Troll had zero armor in the solo hit formula.
        // Group armor is real, so add its 10-point mitigation to preserve
        // the intended old raw hit value when testing the same equipment.
        damage:base+10+(options.progressionDamageBonus??0),
        armor:(options.armor?7:0)+(options.role==="tank"?3:0)+
          (options.progressionArmorBonus??0),
        agility:options.agility??10,
        speed:options.role==="tank"?2.7:3.7,
        reach:options.sword?4.2:3.2,
        radius:.58,healCharges:options.healingSupplies,
        ...(options.role==="healer"?{
          magicHeals:2+(options.progressionMagicHeals??0)}:{}),
        equipment:{weapon:options.sword?"Iron Sword":null,
          armor:options.armor?"Leather Vest":null},
      },
      {
        id:"cave-troll",team:"monsters",role:"monster",
        style:"melee",x:0,z:2,hp:280,maxHp:280,
        damage:33,armor:10,speed:3.25,reach:1.8,
        radius:1.8,agility:7,specialAbility:"grapple-throw",
        grappleDamage:42,staggerThreshold:62,
      },
    ],
  };
}

/**
 * Floor-10 party boss encounter. It uses the SAME GroupCombat 60Hz motor,
 * Troll grapple/throw signatures, existing hero gear, real owned medicines,
 * and bounded earned level bonuses as the LIVE dungeon and Combat Lab.
 *
 * Calling this factory does NOT invent a party or start a boss fight. The
 * saved world scheduler must authenticate the actual co-located party and
 * commit the encounter. Old solo Floor-6 preview fixtures are untouched.
 */
export function caveTrollPartyOptions(
  party:readonly AdventurerState[],tacticsSeed:number,
):GroupCombatOptions{
  if(!canAttemptCaveTroll(party.length,party.every(h=>h.level6Permit))||
    party.some(hero=>hero.status==="dead"||hero.health<=0)||
    new Set(party.map(hero=>hero.id)).size!==party.length)
    throw new RangeError("Level "+CAVE_TROLL_FLOOR+" requires a real permitted 2–3 hero party.");
  if(!Number.isSafeInteger(tacticsSeed)||tacticsSeed<0||tacticsSeed>0xffffffff)
    throw new RangeError("Invalid saved boss tactics seed");
  const positions=[{x:-4,z:-9},{x:0,z:-9},{x:4,z:-9}];
  const heroes=party.map((hero,i)=>{
    const p=heroProgression(hero);
    const solo=caveTrollGroupOptions({
      role:hero.role,sword:hero.equipment.weapon==="Iron Sword",
      armor:hero.equipment.armor==="Leather Vest",
      health:hero.health,maxHealth:p.maxHealth,
      healingSupplies:Math.min(10,hero.inventory.healing),
      strength:p.strength,agility:p.agility,intellect:p.intellect,
      progressionDamageBonus:p.damageBonus,
      progressionArmorBonus:p.armorBonus,
      progressionMagicHeals:p.bonusMagicHeals,
      tacticsSeed,
    }).actors[0];
    return {...solo,id:hero.id,...positions[i]};
  });
  const oldTroll=caveTrollGroupOptions({
    role:"tank",sword:false,armor:false,
    health:50,maxHealth:50,healingSupplies:0,tacticsSeed,
  }).actors[1];
  return {
    environment:"cave-lava",tacticsSeed,
    bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},
    obstacles:[],actors:[...heroes,{
      ...oldTroll,
      // The unique Floor-10 Cave Troll is a party-grade boss, not the
      // previous single-hero Floor-6 training encounter.
      hp:700,maxHp:700,damage:46,armor:16,grappleDamage:55,
      staggerThreshold:92,
    }],
  };
}

export function createSharedBossPreview(
  options:CombatPreviewOptions,
):SharedBossPreview{
  const legacy=createCombatPreview(options);
  return {...legacy,group:createGroupCombat(caveTrollGroupOptions(options))};
}

function heroPhase(a:GroupActor):ActorPhase{
  if(a.phase==="windup"||a.phase==="strike"||a.phase==="recover")
    return "attack";
  if(a.phase==="move"||a.phase==="cast"||a.phase==="heal"||
     a.phase==="roll"||a.phase==="parry"||a.phase==="hurt"||
     a.phase==="grabbed"||a.phase==="thrown"||a.phase==="dead")
    return a.phase;
  return "move";
}
function bossPhase(a:GroupActor):BossPhase{
  if(a.phase==="move")return "chase";
  if(a.phase==="hurt"||a.phase==="parry")return "stagger";
  if(a.phase==="windup"||a.phase==="strike"||a.phase==="grab"||
     a.phase==="throw"||a.phase==="grabMiss"||
     a.phase==="recover"||a.phase==="dead")return a.phase;
  return "chase";
}
function convertCue(c:GroupCombatCue):ArenaCue|null{
  switch(c.kind){
    case "attack":return c.actorId==="cave-troll"?{kind:"windup"}:null;
    case "hit":return {kind:c.actorId==="hero"?"hero-hit":"hit",
      amount:c.amount};
    case "landing":return {kind:"hit",amount:c.amount};
    case "death":return {kind:c.actorId==="hero"?"defeat":"victory"};
    case "dodge":case "parry":case "miss":case "grab":
    case "throw":case "projectile":case "heal":case "lava":
      return {kind:c.kind,...(c.amount!==undefined?{amount:c.amount}:{})};
    case "escape":return {kind:"miss"};
    default:return null;
  }
}

export function projectSharedBossState(
  state:SharedBossPreview,events:readonly GroupCombatCue[]=[],
):readonly ArenaCue[]{
  const group=state.group;
  const hero=group.actors.find(a=>a.id==="hero");
  const boss=group.actors.find(a=>a.id==="cave-troll");
  if(!hero||!boss)throw Error("Shared Troll motor lost its real actors");
  state.time=group.time;
  state.hero={x:hero.x,z:hero.z};
  state.boss={x:boss.x,z:boss.z};
  state.heroHeading=hero.heading;
  state.bossHeading=boss.heading;
  state.lockedBossHeading=boss.lockedHeading;
  state.heroHp=hero.hp;
  state.bossHp=boss.hp;
  state.stamina=hero.stamina;
  state.heroPhase=heroPhase(hero);
  state.heroAge=hero.phaseAge;
  state.heroCooldown=hero.cooldown;
  state.heroApplied=hero.applied;
  state.rollDirection={x:hero.rollX,z:hero.rollZ};
  state.bossPhase=bossPhase(boss);
  state.bossAge=boss.phaseAge;
  state.bossCooldown=boss.cooldown;
  state.bossDamageApplied=boss.applied;
  state.bossAttacks=boss.attacksStarted;
  state.bossAttack=boss.activeMeleeAbility==="grapple"?"grab":
    boss.activeMeleeAbility==="troll-slam"?"slam":"smash";
  state.bossSlam=state.bossAttack==="slam";
  state.bossStamina=boss.stamina;
  state.throwVelocity={...hero.throwVelocity};
  state.healingSupplies=hero.healCharges;
  state.magicHeals=hero.magicHeals??0;
  state.distanceTraveled=hero.distanceTraveled;
  state.projectiles=group.projectiles.map(p=>({
    x:p.x,z:p.z,dx:p.vx/12,dz:p.vz/12,damage:p.damage,ttl:p.ttl,
  }));
  for(const event of events){
    if(event.kind==="dodge")state.dodgeCount++;
    if(event.kind==="parry")state.parryCount++;
    if(event.kind==="hit"&&event.actorId==="hero")state.landedHits++;
    if(event.kind==="miss"&&event.actorId==="hero")state.missedHits++;
  }
  state.outcome=group.outcome==="heroes"?"victory":
    group.outcome==="monsters"||group.outcome==="draw"?"defeat":"fighting";
  state.cues=events.map(convertCue).filter((e):e is ArenaCue=>e!==null);
  return state.cues;
}

export function stepSharedBossPreview(
  state:SharedBossPreview,dt=1/60,
):readonly ArenaCue[]{
  if(state.outcome!=="fighting")return [];
  return projectSharedBossState(state,stepGroupCombat(state.group,dt));
}
