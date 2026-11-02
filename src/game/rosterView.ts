import type { AdventurerState } from "./adventurers.ts";
import type { GameState } from "./gameState.ts";

export type RosterFilter = "active" | "fallen";
const PRIORITY: Record<AdventurerState["status"], number> = {
  "at-shop": 0, expedition: 1, traveling: 2, returning: 3, exploring: 4, dead: 5,
};
export function portraitIndex(id: string): number {
  const result = /^adventurer-([1-9]\d*)$/.exec(id);
  return result ? (Number(result[1]) - 1) % 25 : 0;
}
export function rosterEntries(state: GameState, filter: RosterFilter): readonly AdventurerState[] {
  if (filter === "fallen") return state.adventurers.filter((hero) => hero.status === "dead").slice(-40).reverse();
  return state.adventurers.filter((hero) => hero.status !== "dead")
    .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
export function locationLabel(hero: AdventurerState): string {
  if (hero.status === "dead") return "Fallen";
  if (hero.status === "at-shop") return "F5 · Shop";
  if (hero.status === "expedition") return "F6 · Expedition";
  if (hero.status === "traveling") return "Returning to F5";
  if (hero.status === "returning") return "Leaving F5";
  return "F" + hero.floor + " · Exploring";
}
