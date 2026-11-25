import type {AdventurerState} from "./adventurers.ts";
import {heroCombatAttributes} from "./heroProgression.ts";
import {equipmentEffects,GEAR_BY_ITEM} from "./gearCatalog.ts";
import type {GroupCombatOptions,CombatantSpec,GroupRole} from "./groupCombat.ts";
import {ghoulCombatProfile} from "./ghoulPack.ts";
import {caveTrollActor} from "./sharedBossCombat.ts";
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
  readonly magicHeals?:number;
  readonly equipment?:AdventurerState["equipment"];
  readonly sword:boolean;
  readonly vest:boolean;
  readonly label:string;
}
export interface DeveloperCombatConfig {
  readonly arena:CombatStageTheme;
  readonly enemy:DeveloperEnemy;
  readonly enemyCount:number;
  /** Floor strength, independent of the chosen stage and test pack count. */
  readonly ghoulFloor?:number;
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
  if(config.ghoulFloor!==undefined&&(!Number.isSafeInteger(config.ghoulFloor)||config.ghoulFloor<1||config.ghoulFloor>9))
    throw new RangeError("Select Ghoul floor 1–9");
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
       hero.healCharges>10||
       (hero.magicHeals!==undefined&&(
         !Number.isSafeInteger(hero.magicHeals)||hero.magicHeals<0||
         hero.magicHeals>10||hero.role!=="healer"))||
       typeof hero.sword!=="boolean"||
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
  const stats=heroCombatAttributes(hero);
  return {
    role:hero.role,label:hero.name,maxHp:stats.maxHp,damage:stats.damage,
    armor:stats.armor,agility:stats.agility,healCharges:stats.healCharges,
    ...(stats.magicHeals!==undefined?{magicHeals:stats.magicHeals}:{}),
    equipment:stats.equipment,sword:stats.equipment.weapon!==null,vest:stats.equipment.armor!==null,
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
    const original=equipmentEffects(hero.role,hero.equipment??{weapon:null,armor:null});
    const starter=Object.values(GEAR_BY_ITEM).find(item=>
      item.slot==="weapon"&&item.role===hero.role&&item.tier===1);
    const gear=equipmentEffects(hero.role,{
      weapon:hero.sword?original.weapon??starter?.name??null:null,
      armor:hero.vest?original.vest??GEAR_BY_ITEM["leather-vest"].name:null,
    });
    actors.push({
      id:"lab-hero-"+(index+1),team:"heroes",role:hero.role,
      style:hero.role==="healer"?"ranged":"melee",
      ...pos,hp:hero.maxHp,maxHp:hero.maxHp,damage:hero.damage,
      armor:hero.armor,agility:hero.agility,speed:hero.role==="tank"?2.5:3.1,
      ...(hero.role==="healer"?{magicHeals:hero.magicHeals??2}:{}),
      reach:gear.reach,healCharges:hero.healCharges,
      equipment:{weapon:gear.weapon,armor:gear.vest},
    });
  });
  for(let i=0;i<config.enemyCount;i++){
    if(config.enemy==="cave-troll"){
      actors.push(caveTrollActor(enemyPositions[i],"lab-cave-troll"));
    }else{
      actors.push({
        ...ghoulCombatProfile(config.ghoulFloor??5,config.seed),
        id:"lab-ghoul-"+(i+1),...enemyPositions[i],
      });
    }
  }
  return {actors,bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},obstacles:[],
    tacticsSeed:config.seed,
    ...(config.arena==="cave-troll"?{environment:"cave-lava" as const}:{})};
}
