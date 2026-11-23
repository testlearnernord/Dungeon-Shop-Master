/**
 * Cosmetic interpolation of TWO already committed dungeon checkpoints.
 * No AI, prediction, RNG, world-time change or synthetic intermediate save.
 * Deliberately short: the LIVE dungeon commits one hero tile per
 * 200 world ticks (10 unpaused real seconds). The rendered walk is 0.85s;
 * the rest of the interval is a genuine standstill, not slow motion.
 */
export const LIVE_PARTY_STEP_SECONDS = 0.85;

export interface LivePartyCheckpoint {
  readonly heroId: string;
  readonly floor: number;
  readonly worldTick: number;
  readonly x: number;
  readonly z: number;
  readonly combat: unknown | null;
  readonly heroes: readonly { readonly id: string }[];
}
export interface CommittedPartyStep {
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
  readonly heading: number;
}

/** Movement exists only when successive saved, matching party checkpoints
 * have a real one-tile displacement. Identity/level/fight transitions snap. */
export function committedLivePartyStep(
  previous: LivePartyCheckpoint | null, current: LivePartyCheckpoint,
): CommittedPartyStep | null {
  if (!previous || previous.heroId !== current.heroId ||
      previous.floor !== current.floor ||
      previous.worldTick >= current.worldTick ||
      previous.combat !== null || current.combat !== null) return null;
  const members = (view: LivePartyCheckpoint) =>
    view.heroes.map(hero => hero.id).sort().join("|");
  if (members(previous) !== members(current)) return null;
  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  // A portal, load correction or skipped steps are not an animated walk.
  if (Math.abs(dx) + Math.abs(dz) !== 1) return null;
  return {fromX: previous.x, fromZ: previous.z,
    toX: current.x, toZ: current.z, heading: Math.atan2(dx, dz)};
}

export function sampleLivePartyStep(
  step: CommittedPartyStep | null, seconds: number,
  destination: {readonly x:number;readonly z:number},
): {x:number;z:number;walking:boolean} {
  if (!step) return {x:destination.x,z:destination.z,walking:false};
  const portion = Math.max(0,Math.min(1,
    Number.isFinite(seconds)?seconds/LIVE_PARTY_STEP_SECONDS:1));
  return {
    x:step.fromX+(step.toX-step.fromX)*portion,
    z:step.fromZ+(step.toZ-step.fromZ)*portion,
    walking:portion<1,
  };
}

/** A stable visual formation, not additional actor navigation.
 * Every participant gets one distinct offset in the selected real tile. */
export function livePartyVisualOffset(
  partyIds:readonly string[],actorId:string,heading:number,
): {x:number;z:number} {
  const order=[...partyIds].sort();
  const index=order.indexOf(actorId);
  if(index<0)return {x:0,z:0};
  const lateral=(index-(order.length-1)/2)*0.7;
  return {x:Math.cos(heading)*lateral,z:-Math.sin(heading)*lateral};
}
