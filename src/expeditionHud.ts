import type { GameStore } from "./game/gameStore.ts";
import { level6Progress } from "./game/level6Progress.ts";
import { hasObservedReplay } from "./replayDisclosure.ts";

/** A bounded read-only expedition ledger over the saved authoritative event log. */
export function setupExpeditionHud(store: GameStore): void {
  const summary = document.querySelector<HTMLElement>("#level6-progress-summary")!;
  const counts = document.querySelector<HTMLElement>("#level6-progress-counts")!;
  const list = document.querySelector<HTMLOListElement>("#level6-expedition-events")!;

  function render(): void {
    const stats = level6Progress(store.state);
    const sealed=stats.recent.some(event=>!hasObservedReplay(event.id));
    summary.textContent = "Level 6 expeditions: " + stats.encounters + " fights" +
      (sealed ? " · outcomes sealed" : " · " + stats.victories + " victories");
    counts.textContent = sealed
      ? stats.departures + " departures · " + stats.encounters + " recorded fights · WATCH before revealing results"
      : stats.departures + " departures · " + stats.victories + " victories · " +
        stats.retreats + " retreats · " + stats.deaths + " deaths · " +
        (stats.firstClear ? "First clear achieved" : "Not cleared yet");
    list.replaceChildren(...stats.recent.map(event => {
      const entry = document.createElement("li");
      entry.dataset.eventId = event.id;
      const viewed=hasObservedReplay(event.id);
      entry.dataset.outcome = viewed ? event.combatOutcome ?? "" : "sealed";
      entry.textContent = event.id + " · Day " + event.day + " · " +
        (viewed ? event.message : "SEALED COMBAT · Watch recorded footage to see the result.");
      return entry;
    }));
    if (!stats.recent.length) {
      const empty = document.createElement("li");
      empty.textContent = "No Level 6 encounters yet. Authorize a living visitor to start an expedition.";
      list.append(empty);
    }
  }
  store.subscribe(render);
  window.addEventListener("expedition-observed",render);
  render();
}
