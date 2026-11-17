import type { CaveTrollAnimation } from "./caveTrollVisual.ts";

/** Animation blending is presentation only, never a combat timer. */
export const TRIPO_FADE_SECONDS = .19;
export function sampleTripoFade(elapsed: number): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(elapsed)
    ? elapsed / TRIPO_FADE_SECONDS : 0));
  return t*t*(3-2*t);
}
/** Shortest yaw difference -> visible turning footsteps, NOT a new path. */
export function sampleTripoTurnStride(previous: number | null, current: number): number {
  if (previous===null || !Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  const turn=Math.atan2(Math.sin(current-previous),Math.cos(current-previous));
  return Math.min(.27,Math.abs(turn))*1.5;
}

/** One-way visual pose sampling: all combat, damage and navigation live in the
 * unchanged Level 6 motor. Calibrated against the actual Tripo 12-clip GLB.
 */
export type TripoClip = "idle_combat" | "walk_heavy" | "attack_2h_swing" |
  "stagger" | "roar" | "death_fall";
export type TripoPose = { clip: TripoClip; progress: number; loop: boolean };
export type TripoLocomotion = { walking: boolean; distance: number };
type MotionInput = Pick<CaveTrollAnimation,
  "phase" | "phaseAge" | "slam" | "time" | "moved" | "introTime">;

const clamp = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const wrap = (n: number, length: number) =>
  ((Number.isFinite(n) ? n : 0) % length + length) % length / length;

/** Source inspection (right/left hand bone positions) shows the usable
 * attack_2h_swing raises both hands at ~1.4-1.5 s and strikes downward at
 * ~1.9-2.1 s, in a 5.0-second source clip. The 'attack_slam' source clip
 * barely lowers the hands and looks like an air punch, so neither normal nor
 * heavy combat uses it. Both use the existing overhead motion as an unarmed two-fist smash (no weapon mesh).
 *
 * The REAL hit remains 0.14 s into the motor's 'strike' phase. Sampling the
 * GLB at ~1.93 s at that exact tick aligns the fists with existing debris
 * and flash; it never changes the authoritative hit or replay.
 */
export function sampleTripoBossPose(
  input: MotionInput, deathSeconds = 0, locomotion?: TripoLocomotion,
): TripoPose {
  if (input.introTime !== undefined) {
    if (input.introTime >= 8.5 && input.introTime < 12)
      return { clip: "roar", progress: clamp((input.introTime - 8.5) / 3.5), loop: false };
    return { clip: "idle_combat", progress: wrap(input.introTime, 5), loop: true };
  }
  if (input.phase === "dead")
    return { clip: "death_fall", progress: clamp(deathSeconds / 3.041667), loop: false };
  if (input.phase === "stagger")
    return { clip: "stagger", progress: clamp(input.phaseAge / 1.6), loop: false };
  if (input.phase === "chase") {
    const walking = locomotion?.walking ?? input.moved > .008;
    return walking
      // Travel drives the two-step loop, instead of rendering-frame time.
      // Zero motor ticks on intermediate frames can no longer restart idle.
      ? { clip: "walk_heavy",
          progress: locomotion ? wrap(locomotion.distance, 7.2) : wrap(input.time, 2.375),
          loop: true }
      : { clip: "idle_combat", progress: wrap(input.time, 5), loop: true };
  }
  const clip = "attack_2h_swing";
  if (input.phase === "windup")
    return { clip, progress: .12 + .23 * clamp(input.phaseAge / (input.slam ? 1.05 : .85)), loop: false };
  if (input.phase === "strike")
    return { clip, progress: .35 + .10 * clamp(input.phaseAge / .38), loop: false };
  return { clip, progress: .45 + .27 * clamp(input.phaseAge / .72), loop: false };
}
