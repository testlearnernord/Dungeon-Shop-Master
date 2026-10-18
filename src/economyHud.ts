import { ITEMS } from "./game/economy";
import { GameStore } from "./game/gameStore";

export function setupEconomyHud(
  canvas: HTMLCanvasElement,
  store: GameStore,
  onMenuChanged: (open: boolean) => void,
): () => void {
  const gold = document.querySelector<HTMLElement>("#merchant-gold")!;
  const supplies = document.querySelector<HTMLElement>("#shelf-supplies")!;
  const sales = document.querySelector<HTMLElement>("#daily-sales")!;
  const dialog = document.querySelector<HTMLDialogElement>("#wholesale")!;
  const catalog = document.querySelector<HTMLElement>("#wholesale-catalog")!;
  const message = document.querySelector<HTMLElement>("#wholesale-message")!;
  let orderId = 0;

  const toggle = (): void => {
    if (dialog.open) {
      dialog.close();
    } else {
      document.exitPointerLock();
      onMenuChanged(true);
      dialog.showModal();
    }
  };
  document.querySelector("#open-wholesale")!.addEventListener("click", toggle);
  document.querySelector("#close-wholesale")!.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    onMenuChanged(false);
    canvas.focus();
  });
  // Native buttons otherwise repeat purchases while Enter or Space is held.
  dialog.addEventListener("keydown", (event) => {
    if (event.repeat && (event.code === "Enter" || event.code === "Space")) event.preventDefault();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyB" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    toggle();
  });

  for (const item of ITEMS) {
    const row = document.createElement("div");
    row.className = "catalog-row";
    const description = document.createElement("span");
    description.textContent = `${item.name} · buy ${item.wholesaleCost}g / sell ${item.salePrice}g`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Buy 1 ${item.name}`;
    button.dataset.itemId = item.id;
    button.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      message.textContent = store.purchase(item.id, 1, ++orderId);
    });
    row.append(description, button);
    catalog.append(row);
  }

  const render = (): void => {
    const economy = store.state.shopEconomy;
    gold.textContent = `Merchant gold: ${economy.balance}g`;
    supplies.textContent = `Shelves: ${ITEMS.map((item) =>
      `${item.name} ${economy.slots.filter((slot) => slot.itemId === item.id)
        .reduce((sum, slot) => sum + slot.quantity, 0)}`).join(" · ")}`;
    const summary = economy.dailySales;
    sales.textContent = `Last End Day: ${summary.units} sold · earned ${summary.revenue}g`;
  };
  store.subscribe(render);
  render();
  return toggle;
}
