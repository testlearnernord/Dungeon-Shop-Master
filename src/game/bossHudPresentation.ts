import type { ArenaCue } from "./arenaCombatMotion.ts";

export type CombatPopup = Readonly<{
  target:"hero"|"boss";
  tone:"hero"|"troll"|"lava"|"heal";
  text:string;
}>;

/** Every label represents a real motor/recorded cue; no HP deltas are guessed. */
export function combatPopupForCue(cue: ArenaCue): CombatPopup | null {
  const amount=cue.amount;
  if (cue.kind==="lava") return {
    target:"hero",tone:"lava",text:amount === undefined?"LAVA!":`-${amount} LAVA`,
  };
  if (typeof amount!=="number" || !Number.isFinite(amount) || amount<=0)
    return null;
  if (cue.kind==="hit") return {target:"hero",tone:"troll",text:`-${amount}`};
  if (cue.kind==="hero-hit") return {target:"boss",tone:"hero",text:`-${amount}`};
  if (cue.kind==="heal") return {target:"hero",tone:"heal",text:`+${amount}`};
  return null;
}
