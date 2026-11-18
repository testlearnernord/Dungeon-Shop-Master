/**
 * Authoritative HP arithmetic shared by ordinary encounters and boss skills.
 * Collision, target selection and animation remain the caller's responsibility.
 * These functions have no random state and never mutate caller-owned objects.
 */
export const HEALING_HERB_HP = 18;
export const WAYBREAD_HP = 8;

export interface CombatVitalChange {
  readonly hp: number;
  /** Effective HP actually removed or restored, never requested overkill. */
  readonly amount: number;
}

function health(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100000)
    throw new RangeError(name + " must be finite and within combat HP bounds");
}

export function applyCombatHit(
  hp: number, rawDamage: number, mitigation = 0,
  /** Physical hits have a minimum of one damage; hazards can specify zero. */
  minimumDamage = 1,
): CombatVitalChange {
  health(hp, "hp");
  health(rawDamage, "rawDamage");
  health(mitigation, "mitigation");
  health(minimumDamage, "minimumDamage");
  if (hp === 0 || rawDamage === 0) return {hp, amount:0};
  const applied=Math.min(hp,Math.max(minimumDamage,rawDamage-mitigation));
  return {hp:hp-applied,amount:applied};
}

export function applyCombatHealing(
  hp: number, maxHp: number, requestedHealing: number,
): CombatVitalChange {
  health(hp,"hp");health(maxHp,"maxHp");health(requestedHealing,"requestedHealing");
  if (hp>maxHp) throw new RangeError("hp exceeds maxHp");
  // Healing may not resurrect a dead actor. Revival is a separate mechanic.
  if (hp===0 || requestedHealing===0) return {hp,amount:0};
  const applied=Math.min(maxHp-hp,requestedHealing);
  return {hp:hp+applied,amount:applied};
}
