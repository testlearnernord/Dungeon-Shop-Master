import { advanceDay, createGameState, transitionDayConfirmation, type DayAction } from "./game/gameState";

export function setupDayHud(canvas: HTMLCanvasElement): void {
  const day = document.querySelector<HTMLElement>("#day");
  const events = document.querySelector<HTMLOListElement>("#world-events");
  const request = document.querySelector<HTMLButtonElement>("#end-day");
  const confirmation = document.querySelector<HTMLElement>("#day-confirmation");
  const confirm = document.querySelector<HTMLButtonElement>("#confirm-day");
  const cancel = document.querySelector<HTMLButtonElement>("#cancel-day");
  if (!day || !events || !request || !confirmation || !confirm || !cancel) {
    throw new Error("The day clock HUD must exist before the game starts.");
  }

  let state = createGameState();
  let pending = false;

  const render = (): void => {
    day.textContent = `Day ${state.day}`;
    events.replaceChildren(...state.events.slice(-3).map((event) => {
      const entry = document.createElement("li");
      entry.textContent = event.message;
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
        event.target.closest("button, input, textarea, select, [contenteditable]")) return;
    if (event.code === "KeyN" || event.code === "KeyY") {
      event.preventDefault();
      act(event.code === "KeyN" ? "request" : "confirm");
    }
  });
  render();
}
