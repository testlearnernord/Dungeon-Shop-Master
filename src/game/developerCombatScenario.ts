import type {AdventurerState} from "./adventurers.ts";
import {heroProgression} from "./heroProgression.ts";
import type {GroupCombatOptions,CombatantSpec,GroupRole} from "./groupCombat.ts";
import type {CombatStageTheme} from "./combatSpectatorStage.ts";

/**
 * Disposable developer-only encounter specification. Absolutely no GameStore
 * pointer, world RNG, saved event, or wallet passes through this module.
 * All configured combatants run through the normal 60Hz GroupCombat motor.
 */
export type DeveloperEnemy="ghoul"|"cave-troll";
export interface DeveloperHero {
  readonly role:Exclude<GroupRole,"monster">;
  readonly maxHp:number;
  readonly damage:number;
  readonly armor:number;
  readonly agility:number;
  readonly healCharges:number;
  readonly sword:boolean;
  readonly vest:boolean;
  readonly label:string;
}
export interface DeveloperCombatConfig {
  readonly arena:CombatStageTheme;
  readonly enemy:DeveloperEnemy;
  readonly enemyCount:number;
  readonly heroes:readonly DeveloperHero[];
  /** Replayable local test seed, independent from campaign RNG. */
  readonly seed:number;
}
export const DEV_MAX_HEROES=3;
export const DEV_MAX_ENEMIES=3;
export const DEFAULT_DEVELOPER_HERO:DeveloperHero={
  role:"tank",maxHp:120,damage:16,armor:5,agility:10,
  healCharges:2,sword:true,vest:true,label:"Training hero",
};
export const DEFAULT_DEVELOPER_CONFIG:DeveloperCombatConfig={
  arena:"cave-troll",enemy:"cave-troll",enemyCount:1,
  heroes:[DEFAULT_DEVELOPER_HERO],seed:17,
};
const within=(n:number,min:number,max:number)=>
  Number.isFinite(n)&&n>=min&&n<=max;
export function validateDeveloperCombat(config:DeveloperCombatConfig):void {
  if(config.arena!=="cave-troll"&&config.arena!=="crypt")
    throw new RangeError("Unknown developer arena");
  if(config.enemy!=="ghoul"&&config.enemy!=="cave-troll")
    throw new RangeError("Unknown developer opponent");
  if(!Number.isSafeInteger(config.seed)||config.seed<0||
     config.seed>0xffffffff)
    throw new RangeError("Invalid developer seed");
  if(!Number.isSafeInteger(config.enemyCount)||
     config.enemyCount<1||config.enemyCount>DEV_MAX_ENEMIES||
     config.enemy==="cave-troll"&&config.enemyCount!==1)
    throw new RangeError("Select one Troll or one to three Ghouls");
  if(config.heroes.length<1||config.heroes.length>DEV_MAX_HEROES)
    throw new RangeError("Select one to three heroes");
  for(const hero of config.heroes){
    if(!["tank","DPS","healer"].includes(hero.role)||
       !within(hero.maxHp,1,10000)||!within(hero.damage,1,1000)||
       !within(hero.armor,0,1000)||!within(hero.agility,0,1000)||
       !Number.isSafeInteger(hero.healCharges)||hero.healCharges<0||
       hero.healCharges>10||typeof hero.sword!=="boolean"||
       typeof hero.vest!=="boolean"||typeof hero.label!=="string"||
       hero.label.length>80)
      throw new RangeError("Invalid developer hero attributes");
  }
}
const hash=(seed:number)=>{
  let n=(seed+0x6d2b79f5)>>>0;
  n=Math.imul(n^(n>>>15),n|1);
  n^=n+Math.imul(n^(n>>>7),n|61);
  return ((n^(n>>>14))>>>0)/4294967296;
};
/** Fully reproducible randomization when the caller supplies a seed.
 * A new UI seed is generated locally, never from the world campaign RNG. */
export function randomDeveloperHeroes(seed:number,count:number):DeveloperHero[]{
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||
     !Number.isSafeInteger(count)||count<1||count>DEV_MAX_HEROES)
    throw new RangeError("Invalid test randomization parameters");
  const roles=["tank","DPS","healer"] as const;
  return Array.from({length:count},(_,i)=>{
    const n=seed+i*101;
    const role=roles[Math.floor(hash(n)*3)];
    const sword=role!=="healer"&&hash(n+4)>.35;
    const vest=hash(n+6)>.20;
    return {
      role,sword,vest,label:"Random hero "+(i+1),
      maxHp:Math.round(75+hash(n+1)*120),
      damage:Math.round(8+hash(n+2)*19),
      armor:Math.round((vest?3:0)+hash(n+3)*8),
      agility:Math.round(6+hash(n+5)*16),
      healCharges:Math.floor(hash(n+7)*4),
    };
  });
}
export function developerHeroFromRoster(hero:AdventurerState):DeveloperHero{
  const progress=heroProgression(hero);
  return {
    role:hero.role,label:hero.name,maxHp:progress.maxHealth,
    damage:6+Math.floor((hero.role==="healer"?progress.intellect:
      hero.role==="DPS"?progress.agility:progress.strength)/2)+
      (hero.equipment.weapon==="Iron Sword"?5:0)+progress.damageBonus,
    armor:(hero.equipment.armor==="Leather Vest"?5:1)+progress.armorBonus,
    agility:progress.agility,healCharges:Math.min(10,hero.inventory.healing),
    sword:hero.equipment.weapon==="Iron Sword",
    vest:hero.equipment.armor==="Leather Vest",
  };
}
/** Test balancing changes real combat specs only, not scene animations.
 * Safe spawns for 3v3 and a single arena origin; no overlapped heroes. */
export function buildDeveloperCombat(config:DeveloperCombatConfig):GroupCombatOptions{
  validateDeveloperCombat(config);
  const heroPositions=[{x:-7,z:-3},{x:-7,z:1},{x:-7,z:5}];
  const enemyPositions=[{x:5,z:1},{x:6,z:-4},{x:6,z:6}];
  const actors:CombatantSpec[]=[];
  config.heroes.forEach((hero,index)=>{
    const pos=heroPositions[index];
    actors.push({
      id:"lab-hero-"+(index+1),team:"heroes",role:hero.role,
      style:hero.role==="healer"||hero.role==="DPS"&&!hero.sword?
        "ranged":"melee",
      ...pos,hp:hero.maxHp,maxHp:hero.maxHp,damage:hero.damage,
      armor:hero.armor,agility:hero.agility,speed:hero.role==="tank"?2.5:3.1,
      ...(hero.role==="healer"?{magicHeals:2}:{}),
      reach:1.75,healCharges:hero.healCharges,
      equipment:{weapon:hero.sword?"Iron Sword":null,
        armor:hero.vest?"Leather Vest":null},
    });
  });
  for(let i=0;i<config.enemyCount;i++){
    const troll=config.enemy==="cave-troll";
    actors.push({
      id:troll?"lab-cave-troll":"lab-ghoul-"+(i+1),
      team:"monsters",role:"monster",style:"melee",
      ...enemyPositions[i],hp:troll?280:65,maxHp:troll?280:65,
      damage:troll?33:11,armor:troll?10:2,
      speed:troll?2.7:3.0,reach:troll?1.8:1.6,
      radius:troll?1.8:.5,agility:troll?7:9,
      ...(troll?{specialAbility:"grapple-throw" as const,
        grappleDamage:42,staggerThreshold:62}:{}),
    });
  }
  return {actors,bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},obstacles:[],
    tacticsSeed:config.seed,
    ...(config.arena==="cave-troll"?{environment:"cave-lava" as const}:{})};
}
