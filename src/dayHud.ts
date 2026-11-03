import { transitionDayConfirmation, type DayAction } from "./game/gameState";
import { GameStore } from "./game/gameStore";
import { level6ReturnIds, type VisitorSnapshot } from "./game/npcVisitors";
import { heroDisplayNames } from "./game/heroIdentity.ts";

export function setupDayHud(
  canvas: HTMLCanvasElement,
  store: GameStore,
  onVisitorsChanged: (current: readonly VisitorSnapshot[], previous: readonly VisitorSnapshot[]) => void = () => {},
  onConfirmedDay: () => void = () => {},
): void {
  const day = document.querySelector<HTMLElement>("#day");
  const events = document.querySelector<HTMLOListElement>("#world-events");
  const request = document.querySelector<HTMLButtonElement>("#end-day");
  const confirmation = document.querySelector<HTMLElement>("#day-confirmation");
  const confirm = document.querySelector<HTMLButtonElement>("#confirm-day");
  const cancel = document.querySelector<HTMLButtonElement>("#cancel-day");
  const roster = document.querySelector<HTMLUListElement>("#adventurer-roster");
  const visitors = document.querySelector<HTMLElement>("#shop-visitors");
  const population = document.querySelector<HTMLElement>("#population-summary");
  if (!day || !events || !request || !confirmation || !confirm || !cancel || !roster || !visitors || !population) {
    throw new Error("The day clock HUD must exist before the game starts.");
  }

  const history = document.querySelector<HTMLOListElement>("#day-history")!;
  let pending = false;
  const snapshotVisitors = (): readonly VisitorSnapshot[] => {
    const state = store.state;
    const fromLevel6 = level6ReturnIds(state.events, state.day);
    const names = heroDisplayNames(state.adventurers);
    return state.adventurers.filter(({ status }) => status !== "dead").map(({ id, name, role, level, status, equipment }) => ({
      id, name, role, level, status, equipment, displayName: names.get(id) ?? name,
      entranceGate: fromLevel6.has(id) ? "level6" as const : "level4" as const,
    }));
  };
  let previousVisitors: readonly VisitorSnapshot[] = [];

  const render = (): void => {
    const state = store.state;
    day.textContent = `Day ${state.day}`;
    events.replaceChildren(...state.events.slice(-3).map((event) => {
      const entry = document.createElement("li");
      entry.dataset.eventId = event.id;
      entry.textContent = event.message;
      return entry;
    }));
    const today = [];
    for (let index = state.events.length - 1; index >= 0 && today.length < 100; index -= 1) {
      const event = state.events[index];
      if (event.day !== state.day) break;
      today.push(event);
    }
    history.replaceChildren(...today.reverse().map((event) => {
      const entry = document.createElement("li");
      entry.textContent = event.message;
      return entry;
    }));
    const names = heroDisplayNames(state.adventurers);
    const active = state.adventurers.filter((hero) => hero.status !== "dead");
    const atShop = active.filter((hero) => hero.status === "at-shop");
    population.textContent = `Adventurers: ${active.length} active · ${state.adventurers.length - active.length} lost`;
    visitors.textContent = `Shop visitors (${atShop.length}): ${atShop.map((hero) => names.get(hero.id) ?? hero.name).join(", ") || "none"}`;
    roster.replaceChildren(...active.map((hero) => {
      const entry = document.createElement("li");
      entry.dataset.adventurerId = hero.id;
      entry.dataset.status = hero.status;
      const summary = document.createElement("span");
      summary.className = "hero-summary";
      summary.textContent = `${names.get(hero.id) ?? hero.name} · ${hero.role} · Lv ${hero.level} · HP ${hero.health}/${hero.stats.maxHealth} · F${hero.floor} ${hero.status} · Hunger ${hero.hunger} · Food ${hero.inventory.food}`;
      entry.append(summary);
      if (hero.status === "at-shop") {
        const permission = document.createElement("button");
        permission.type = "button";
        permission.className = "level6-permit";
        permission.dataset.adventurerId = hero.id;
        permission.setAttribute("aria-pressed", String(hero.level6Permit));
        permission.textContent = hero.level6Permit ? "Revoke L6 pass" : "Grant L6 pass";
        permission.title = "Approve this hero's Level 6 departure on the next confirmed day. Combat resolves one day later.";
        permission.addEventListener("click", () => {
          store.setLevel6Permit(hero.id, !hero.level6Permit);
        });
        entry.append(" ", permission);
      }
      entry.title = `${hero.id} · XP ${hero.xp} · Gold ${hero.gold} · ${hero.traits.positive} / ${hero.traits.neutral} / ${hero.traits.negative} · Hunger ${hero.hunger} · Food ${hero.inventory.food}`;
      return entry;
    }));
    request.setAttribute("aria-expanded", String(pending));
    confirmation.hidden = !pending;
  };

  const act = (action: DayAction): void => {
    const transition = transitionDayConfirmation(pending, action);
    pending = transition.pending;
    if (transition.advance) {
      store.endDay();
      onConfirmedDay();
    }
    // Do not leave keyboard focus on a confirmation button that is about to hide.
    if (!pending && (document.activeElement === confirm || document.activeElement === cancel)) {
      canvas.focus();
    }
    render();
  };

  request.addEventListener("click", () => act("request"));
  confirm.addEventListener("click", () => act("confirm"));
  cancel.addEventListener("click", () => act("cancel"));
  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    if (document.querySelector("dialog[open]")) return;
    if (event.code === "Escape") {
      if (pending) act("cancel");
      return;
    }
    if (event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.code === "KeyN" || event.code === "KeyY") {
      event.preventDefault();
      act(event.code === "KeyN" ? "request" : "confirm");
    }
  });
  let previousAdventurers = store.state.adventurers;
  store.subscribe(() => {
    pending = false;
    if (store.state.adventurers !== previousAdventurers) {
      const currentVisitors = snapshotVisitors();
      onVisitorsChanged(currentVisitors, previousVisitors);
      previousVisitors = currentVisitors;
      previousAdventurers = store.state.adventurers;
    }
    render();
  });
  render();
  const initialVisitors = snapshotVisitors();
  onVisitorsChanged(initialVisitors, previousVisitors);
  previousVisitors = initialVisitors;
}
