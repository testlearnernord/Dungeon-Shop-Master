import type {AdventurerState} from "./adventurers.ts";
import type {GroupCombatOptions,CombatantSpec} from "./groupCombat.ts";

/** Shared source of genuine 60Hz Cave Troll encounter participants.
 * The V developer sandbox and the LIVE world use the SAME GroupCombat
 * engine; there is no scripted second roll hidden behind the camera.
 *
 * The Level-6 cinematic duel remains a supported historical recording.
 * New LIVE boss fights use independently saved actor state and group frames.
 */
export const LIVE_TROLL_ID="unique-cave-troll";
export const LIVE_TROLL_MAX_HP=280;
export const LIVE_TROLL_COMBAT_SECONDS=90;

export function prepareLiveBossEncounter(
  party:readonly AdventurerState[],
):GroupCombatOptions{
  if(party.length<1||party.length>3||
    new Set(party.map(h=>h.id)).size!==party.length||
    party.some(h=>h.floor!==6||h.status!=="expedition"||h.health<=0))
    throw new RangeError("LIVE boss requires 1–3 distinct living floor-6 explorers");
  const heroes:CombatantSpec[]=party.map((hero,index)=>{
    const sword=hero.equipment.weapon==="Iron Sword";
    return {
      id:hero.id,team:"heroes",role:hero.role,
      style:hero.role==="healer"||hero.role==="DPS"&&!sword?"ranged":"melee",
      x:-7,z:-4+4*index,
      hp:hero.health,maxHp:hero.stats.maxHealth,
      damage:6+Math.floor((hero.role==="healer"?hero.stats.intellect:
        hero.role==="DPS"?hero.stats.agility:hero.stats.strength)/2)+
        (sword?5:0),
      armor:hero.equipment.armor==="Leather Vest"?5:1,
      speed:hero.role==="tank"?2.5:3.1,reach:1.75,
      agility:hero.stats.agility,
      healCharges:Math.min(10,hero.inventory.healing),
      equipment:{weapon:sword?"Iron Sword":null,
        armor:hero.equipment.armor==="Leather Vest"?"Leather Vest":null},
    };
  });
  return {
    bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},
    obstacles:[],
    actors:[...heroes,{
      id:LIVE_TROLL_ID,team:"monsters",role:"monster",style:"melee",
      x:5,z:0,hp:LIVE_TROLL_MAX_HP,maxHp:LIVE_TROLL_MAX_HP,
      damage:33,armor:10,speed:2.7,reach:1.8,radius:1.8,
      agility:7,staggerThreshold:18,specialAbility:"grapple-throw",
      grappleDamage:42,
    }],
  };
}
