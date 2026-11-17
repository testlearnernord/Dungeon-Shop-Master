import type { BossPhase } from "./arenaCombatMotion.ts";

/**
 * Pure presentation curve derived from existing authoritative combat frames.
 * Never advances, stores or re-simulates hits, cooldowns, RNG or replay time.
 * A windup telegraphs the motor's locked attack lane; particles do not collide.
 */
export type MaulerImpactFrame = Readonly<{
  telegraph: number;
  impact: number;
  ringScale: number;
  debrisSpread: number;
  debrisRise: number;
  flash: number;
}>;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const EMPTY: MaulerImpactFrame = Object.freeze({
  telegraph: 0, impact: 0, ringScale: 1,
  debrisSpread: 0, debrisRise: 0, flash: 0,
});

/**
 * Resolve one visual-only effect snapshot from a boss pose. The strike hits
 * at 0.14s in arenaCombatMotion.ts and enters recover after 0.38s. Carry the
 * impact seamlessly through the recovery animation, including saved replays.
 */
export function sampleMaulerImpact(
  phase: BossPhase, age: number, slam: boolean,
): MaulerImpactFrame {
  const elapsed = Math.max(0, age);
  if (phase === "windup") {
    const windupDuration = slam ? 1.05 : 0.85;
    const t = smooth(elapsed / windupDuration);
    return { ...EMPTY, telegraph: 0.16 + 0.47 * t };
  }
  const afterHit = phase === "strike"
    ? elapsed - 0.14
    : phase === "recover" ? (0.38 - 0.14) + elapsed : -1;
  if (afterHit < 0 || afterHit >= 0.70) return EMPTY;
  const t = clamp01(afterHit / 0.70);
  const weight = slam ? 1 : 0.65;
  const fade = (1 - t) * (1 - t);
  return {
    telegraph: 0,
    impact: weight * 0.68 * fade,
    ringScale: 0.8 + (slam ? 4.1 : 2.8) * smooth(t),
    debrisSpread: (slam ? 1.0 : 0.7) + (slam ? 5.6 : 3.3) * smooth(t),
    debrisRise: weight * 2.15 * Math.sin(t * Math.PI),
    flash: weight * 2.2 * (1 - smooth(afterHit / 0.25)),
  };
}
