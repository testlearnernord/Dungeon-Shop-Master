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
  // World time and the physical NPC motor publish fresh state 20+ times
  // per second. Neither changes old Level-6 results; do not scan the
  // unbounded event history or replace a DOM list on each shop movement.
  let previousEvents:typeof store.state.events|null=null;
  let previousFloors:typeof store.state.dungeonFloors|null=null;
  let renderCount=0;
  const renderIfChanged=()=>{
    const state=store.state;
    if(previousEvents===state.events&&previousFloors===state.dungeonFloors)return;
    previousEvents=state.events;
    previousFloors=state.dungeonFloors;
    renderCount++;
    render();
  };
  store.subscribe(renderIfChanged);
  window.addEventListener("expedition-observed",render);
  if(import.meta.env.VITE_E2E==="1")
    (window as Window&{__shopTestExpeditionRenders?:()=>number})
      .__shopTestExpeditionRenders=()=>renderCount;
  renderIfChanged();
}
