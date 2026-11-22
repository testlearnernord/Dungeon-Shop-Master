import type {AdventurerState} from "./adventurers.ts";

/**
 * Level is derived from real XP, while stored hero.stats remain immutable
 * generation-time attributes. Effective bonuses are pure, deterministic,
 * capped and apply to existing saves without rewriting base attributes.
 *
 * Do not mutate the seeded base stats or infer equipment from levels.
 * Every combat/view/save path must read the same derived ceiling.
 */
export const HERO_POWER_CAP_LEVEL=20;
export const HERO_XP_PER_LEVEL=100;

export type ProgressionHero=Pick<AdventurerState,"role"|"level"|"stats">;

export interface HeroProgression {
  readonly maxHealth:number;
  readonly strength:number;
  readonly agility:number;
  readonly intellect:number;
  readonly damageBonus:number;
  readonly armorBonus:number;
  /** Magical healing charges added to the existing boss healing budget. */
  readonly bonusMagicHeals:number;
  /** Standard dungeon fights also allow one spell for a novice healer. */
  readonly dungeonMagicHeals:number;
}

export function heroLevel(xp:number):number{
  return 1+Math.floor(xp/HERO_XP_PER_LEVEL);
}

export function heroProgression(hero:ProgressionHero):HeroProgression {
  const steps=Math.max(0,Math.min(HERO_POWER_CAP_LEVEL-1,hero.level-1));
  const tank=hero.role==="tank",dps=hero.role==="DPS";
  return {
    maxHealth:hero.stats.maxHealth+(tank?4:2)*steps,
    strength:hero.stats.strength+(tank?Math.floor(steps/3):0),
    agility:hero.stats.agility+(dps?Math.floor(steps/3):0),
    intellect:hero.stats.intellect+(!tank&&!dps?Math.floor(steps/3):0),
    damageBonus:tank?Math.floor(steps/5):dps?Math.floor(steps/3):0,
    armorBonus:tank?Math.floor(steps/4):0,
    bonusMagicHeals:!tank&&!dps?Math.floor(steps/6):0,
    dungeonMagicHeals:!tank&&!dps?1+Math.floor(steps/6):0,
  };
}

/**
 * Apply earned XP after a real encounter. A level-up adds exactly the new
 * HP capacity, preserving the previous injury in absolute HP. It does not
 * revive the dead or grant an arbitrary full heal.
 */
export function settleHeroExperience(
  hero:AdventurerState,xp:number,health=hero.health,
):AdventurerState{
  if(!Number.isSafeInteger(xp)||xp<hero.xp||xp>Number.MAX_SAFE_INTEGER)
    throw new RangeError("Experience must only increase through real settlement.");
  const nextLevel=heroLevel(xp);
  const priorMax=heroProgression(hero).maxHealth;
  const newMax=heroProgression({...hero,level:nextLevel}).maxHealth;
  const gained=health>0?newMax-priorMax:0;
  return {...hero,xp,level:nextLevel,
    health:health>0?Math.min(newMax,health+gained):0};
}
