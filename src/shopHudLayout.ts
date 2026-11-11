/** Shop HUD presentation only; game state remains mounted while details are collapsed. */
export function setupShopStatusToggle(): void {
  const button = document.querySelector<HTMLButtonElement>("#toggle-shop-status");
  const content = document.querySelector<HTMLElement>("#shop-status-content");
  if (!button || !content) return;
  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    content.hidden = !expanded;
    button.textContent = expanded ? "Hide shop details" : "Show shop details";
  });
}
