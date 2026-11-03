/** Pure shared combat geometry: arena and group encounters must agree on hit rules. */
export type Point2 = { x: number; z: number };

export function inAttackArc(origin: Point2, heading: number, target: Point2,
  reach: number, halfAngleRadians: number): boolean {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const d = Math.hypot(dx, dz);
  if (d > reach || d < 0.000001) return false;
  const alignment = (dx * Math.sin(heading) + dz * Math.cos(heading)) / d;
  return alignment >= Math.cos(halfAngleRadians);
}

/** Same invulnerability / parry windows for the troll and ordinary monsters. */
export function rollInvulnerable(age: number): boolean {
  return age >= 0.09 && age <= 0.43;
}

export function parryActive(age: number): boolean {
  return age >= 0.10 && age <= 0.36;
}
