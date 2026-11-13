import {setIconButtonLabel} from "./uiIcons.ts";
/** Toggle detailed adventurer information without removing live DOM bindings. */
export function setupAdventurerOverview(): void {
  const button = document.querySelector<HTMLButtonElement>("#toggle-adventurer-details");
  const details = document.querySelector<HTMLElement>("#adventurer-details");
  if (!button || !details) return;
  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    setIconButtonLabel(button,expanded ? "Less" : "Details");
    details.hidden = !expanded;
  });
}
