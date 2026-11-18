/**
 * One deterministic action-phase clock used by both multi-actor dungeon
 * encounters and the Cave Troll's scripted abilities. Contact happens
 * at most once per phase and completion never occurs before the contact
 * has had the opportunity to resolve. Timing is authored by ability
 * profiles, not by graphics, frame rate or UI.
 */
export interface CombatActionWindow {
  readonly contactAt?:number;
  readonly completeAt?:number;
}
export interface CombatActionTick {
  readonly age:number;
  readonly contactDue:boolean;
  readonly complete:boolean;
}

export function tickCombatAction(
  age:number, dt:number, applied:boolean, window:CombatActionWindow = {},
):CombatActionTick {
  if(!Number.isFinite(age)||age<0)
    throw new RangeError("Action phase age must be finite and nonnegative");
  if(!Number.isFinite(dt)||dt<=0||dt>0.1)
    throw new RangeError("Combat tick must be in (0, 0.1] seconds");
  if(window.contactAt!==undefined &&
    (!Number.isFinite(window.contactAt)||window.contactAt<0))
    throw new RangeError("Contact offset must be nonnegative and finite");
  if(window.completeAt!==undefined &&
    (!Number.isFinite(window.completeAt)||window.completeAt<0 ||
      (window.contactAt!==undefined&&window.completeAt<window.contactAt)))
    throw new RangeError("Action cannot complete before contact");
  const nextAge=age+dt;
  return {
    age:nextAge,
    contactDue:window.contactAt!==undefined&&!applied&&nextAge>=window.contactAt,
    complete:window.completeAt!==undefined&&nextAge>=window.completeAt,
  };
}

/** Shared resource timers. All actor cooldowns and endurance are advanced
 * once per actual 60-Hz tick, not when a spectator replays an encounter. */
export function tickCombatCooldown(value:number,dt:number):number {
  if(!Number.isFinite(value)||value<0||!Number.isFinite(dt)||dt<=0||dt>0.1)
    throw new RangeError("Invalid combat cooldown step");
  return Math.max(0,value-dt);
}
export function regenerateCombatStamina(
  value:number,dt:number,rate:number,max=100,
):number {
  if(!Number.isFinite(value)||value<0||!Number.isFinite(rate)||rate<0||
    !Number.isFinite(max)||max<=0||value>max||
    !Number.isFinite(dt)||dt<=0||dt>0.1)
    throw new RangeError("Invalid combat stamina step");
  return Math.min(max,value+rate*dt);
}
