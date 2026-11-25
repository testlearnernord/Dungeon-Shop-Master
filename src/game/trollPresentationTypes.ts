/** Animation-only pose categories projected from committed GroupCombat frames.
 * These labels never own actor state, HP, tactics or combat timing. */
export type BossPhase="chase"|"windup"|"strike"|"grab"|"throw"|
  "grabMiss"|"recover"|"stagger"|"dead";
