import type { CaveTrollAnimation } from "./caveTrollVisual.ts";

/** One-way translation of authoritative duel poses into a *visual* GLB clip.
 * No combat ticks, damage windows, position or replay frames are modified.
 * Progress is sampled from recorded phase ages instead of render-frame timers.
 */
export type TripoClip = "idle_combat" | "walk_heavy" | "attack_2h_swing" |
  "attack_slam" | "stagger" | "roar" | "death_fall";
export type TripoPose = { clip: TripoClip; progress: number; loop: boolean };
type MotionInput = Pick<CaveTrollAnimation,
  "phase" | "phaseAge" | "slam" | "time" | "moved" | "introTime">;

const clamp = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const wrap = (seconds: number, duration: number) =>
  ((Number.isFinite(seconds) ? seconds : 0) % duration + duration) % duration / duration;

/** Attack spans windup -> strike -> recover without replaying/resetting the
 * weapon animation between states. Its visible hit is deliberately sampled
 * near the motor's real 0.14 s strike contact, not a second attack timer.
 * These proportions require visual acceptance against the actual Tripo clip.
 */
export function sampleTripoBossPose(input: MotionInput, deathSeconds = 0): TripoPose {
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
    return input.moved > .008
      ? { clip: "walk_heavy", progress: wrap(input.time, 2.375), loop: true }
      : { clip: "idle_combat", progress: wrap(input.time, 5), loop: true };
  }
  const clip: TripoClip = input.slam ? "attack_slam" : "attack_2h_swing";
  if (input.phase === "windup")
    return { clip, progress: .05 + .57 * clamp(input.phaseAge / (input.slam ? 1.05 : .85)), loop: false };
  if (input.phase === "strike")
    return { clip, progress: .62 + .27 * clamp(input.phaseAge / .38), loop: false };
  return { clip, progress: .89 + .10 * clamp(input.phaseAge / .72), loop: false };
}
