import type {AdventurerState} from "./adventurers.ts";
import {heroCombatAttributes} from "./heroProgression.ts";
import {canAttemptCaveTroll,CAVE_TROLL_FLOOR} from "./dungeonTopology.ts";
import type {GroupCombatOptions,CombatantSpec} from "./groupCombat.ts";

/** Canonical Cave Troll profile used by LIVE encounters and Combat Lab. */
const CAVE_TROLL_BASE=Object.freeze({
  id:"cave-troll",team:"monsters",role:"monster",style:"melee",
  x:0,z:2,speed:3.25,reach:1.8,radius:1.8,agility:7,
  specialAbility:"grapple-throw",
} as const);
export const CAVE_TROLL_LIVE_PROFILE=Object.freeze({
  hp:480,maxHp:480,damage:27,armor:8,grappleDamage:34,staggerThreshold:92,
});
export function caveTrollActor(position:{x:number;z:number}={x:0,z:2},id="cave-troll"):CombatantSpec{
  return {...CAVE_TROLL_BASE,...CAVE_TROLL_LIVE_PROFILE,...position,id};
}
export function caveTrollPartyOptions(
  party:readonly AdventurerState[],tacticsSeed:number,
):GroupCombatOptions{
  if(!canAttemptCaveTroll(party.length,party.every(h=>h.bossPass))||
    party.some(hero=>hero.status==="dead"||hero.health<=0)||
    new Set(party.map(hero=>hero.id)).size!==party.length)
    throw new RangeError("Level "+CAVE_TROLL_FLOOR+" requires a real permitted 2–3 hero party.");
  if(!Number.isSafeInteger(tacticsSeed)||tacticsSeed<0||tacticsSeed>0xffffffff)
    throw new RangeError("Invalid saved boss tactics seed");
  const positions=[{x:-4,z:-9},{x:0,z:-9},{x:4,z:-9}];
  const heroes=party.map((hero,i)=>({
    id:hero.id,team:"heroes" as const,role:hero.role,...positions[i],
    hp:hero.health,...heroCombatAttributes(hero),
  }));
  return {
    environment:"cave-lava",tacticsSeed,
    bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},
    obstacles:[],actors:[...heroes,caveTrollActor()],
  };
}

