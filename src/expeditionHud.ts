import type { GameStore } from "./game/gameStore.ts";
import { level6Progress } from "./game/level6Progress.ts";

/** A bounded read-only expedition ledger over the saved authoritative event log. */
export function setupExpeditionHud(store: GameStore): void {
  const summary = document.querySelector<HTMLElement>("#level6-progress-summary")!;
  const counts = document.querySelector<HTMLElement>("#level6-progress-counts")!;
  const list = document.querySelector<HTMLOListElement>("#level6-expedition-events")!;

  function render(): void {
    const stats = level6Progress(store.state);
    summary.textContent = "Level 6 expeditions: " + stats.victories + " victories / " + stats.encounters + " fights";
    counts.textContent = stats.departures + " departures · " + stats.victories + " victories · " +
      stats.retreats + " retreats · " + stats.deaths + " deaths · " +
      (stats.firstClear ? "First clear achieved" : "Not cleared yet");
    list.replaceChildren(...stats.recent.map(event => {
      const entry = document.createElement("li");
      entry.dataset.eventId = event.id;
      entry.dataset.outcome = event.combatOutcome ?? "";
      entry.textContent = event.id + " · Day " + event.day + " · " + event.message;
      return entry;
    }));
    if (!stats.recent.length) {
      const empty = document.createElement("li");
      empty.textContent = "No Level 6 encounters yet. Authorize a living visitor to start an expedition.";
      list.append(empty);
    }
  }
  store.subscribe(render);
  render();
}
