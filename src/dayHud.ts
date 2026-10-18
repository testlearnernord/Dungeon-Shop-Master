import { advanceDay, createGameState, transitionDayConfirmation, type DayAction } from "./game/gameState";

export function setupDayHud(canvas: HTMLCanvasElement): void {
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

  let state = createGameState();
  let pending = false;

  const render = (): void => {
    day.textContent = `Day ${state.day}`;
    events.replaceChildren(...state.events.slice(-3).map((event) => {
      const entry = document.createElement("li");
      entry.dataset.eventId = event.id;
      entry.textContent = event.message;
      return entry;
    }));
    const active = state.adventurers.filter((hero) => hero.status !== "dead");
    const atShop = active.filter((hero) => hero.status === "at-shop");
    population.textContent = `Adventurers: ${active.length} active · ${state.adventurers.length - active.length} lost`;
    visitors.textContent = `Shop visitors (${atShop.length}): ${atShop.map((hero) => hero.name).join(", ") || "none"}`;
    roster.replaceChildren(...active.map((hero) => {
      const entry = document.createElement("li");
      entry.dataset.adventurerId = hero.id;
      entry.dataset.status = hero.status;
      entry.textContent = `${hero.name} · ${hero.role} · Lv ${hero.level} · HP ${hero.health}/${hero.stats.maxHealth} · F${hero.floor} ${hero.status}`;
      entry.title = `${hero.id} · XP ${hero.xp} · Gold ${hero.gold} · ${hero.traits.positive} / ${hero.traits.neutral} / ${hero.traits.negative} · Hunger ${hero.hunger} · Food ${hero.inventory.food}`;
      return entry;
    }));
    request.setAttribute("aria-expanded", String(pending));
    confirmation.hidden = !pending;
  };

  const act = (action: DayAction): void => {
    const transition = transitionDayConfirmation(pending, action);
    pending = transition.pending;
    if (transition.advance) state = advanceDay(state).state;
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
  render();
}
