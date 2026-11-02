import type { GameState, WorldEvent } from "./gameState.ts";

export interface ExpeditionProgress {
  readonly departures: number;
  readonly encounters: number;
  readonly victories: number;
  readonly retreats: number;
  readonly deaths: number;
  readonly firstClear: boolean;
  readonly recent: readonly WorldEvent[];
}

/**
 * Event sourcing, not a second RPG state. The full event log is already persisted
 * and validated by CampaignSave (including across v3-v6 migrations).
 * Reopening the panel or replaying a loaded state cannot increment a counter.
 */
export function level6Progress(state: GameState, recentLimit = 20): ExpeditionProgress {
  let departures = 0, encounters = 0, victories = 0, retreats = 0, deaths = 0;
  const recent: WorldEvent[] = [];
  const seen = new Set<string>();
  for (const event of state.events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    if (event.type === "level6-departure") departures++;
    if (event.type !== "level6-combat") continue;
    encounters++;
    if (event.combatOutcome === "victory") victories++;
    if (event.combatOutcome === "retreat") retreats++;
    if (event.combatOutcome === "death") deaths++;
    recent.push(event);
    if (recent.length > recentLimit) recent.shift();
  }
  return {
    departures, encounters, victories, retreats, deaths,
    firstClear: state.dungeonFloors.some(floor => floor.floor === 6 && floor.cleared),
    recent: recent.reverse(),
  };
}
