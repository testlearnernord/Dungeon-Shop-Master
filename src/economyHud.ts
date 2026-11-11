import { ECONOMY, ITEMS } from "./game/economy";
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
  const discards = document.querySelector<HTMLElement>("#discard-catalog")!;
  const message = document.querySelector<HTMLElement>("#wholesale-message")!;
  let orderId = 0;

  const toggle = (): void => {
    if (dialog.open) {
      dialog.close();
    } else {
      if (document.querySelector("dialog[open]")) return;
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
    const header = document.createElement("div");
    header.className = "catalog-item-header";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("catalog-item-icon");
    icon.setAttribute("viewBox", "0 0 64 64");
    icon.setAttribute("aria-hidden", "true");
    const symbol = document.createElementNS("http://www.w3.org/2000/svg", "use");
    symbol.setAttribute("href", import.meta.env.BASE_URL + "assets/ui-item-icons.svg#" + item.id);
    icon.append(symbol);
    const description = document.createElement("span");
    description.className = "catalog-item-description";
    description.textContent = `${item.name} · buy ${item.wholesaleCost}g / sell ${item.salePrice}g` +
      (item.kind === "weapon" ? " · +3 attack on F6, improved F1–F4 progress" :
       item.kind === "armor" ? " · -2 damage, lower F1–F4 danger" : "");
    header.append(icon, description);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Buy 1 ${item.name}`;
    button.dataset.itemId = item.id;
    button.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      message.textContent = store.purchase(item.id, 1, ++orderId);
    });
    const actions = document.createElement("div");
    actions.className = "catalog-actions";
    const buyQuantity = (quantity: number): void => {
      message.textContent = store.purchase(item.id, quantity, ++orderId);
    };
    const five = document.createElement("button");
    five.type = "button";
    five.textContent = "Buy 5";
    five.dataset.itemId = item.id;
    five.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      buyQuantity(5);
    });
    const max = document.createElement("button");
    max.type = "button";
    max.textContent = "Buy max";
    max.dataset.itemId = item.id;
    max.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      const economy = store.state.shopEconomy;
      const used = Object.values(economy.bag).reduce((sum, n) => sum + n, 0);
      const free = ECONOMY.bagCapacity - used;
      const affordable = Math.floor(economy.balance / item.wholesaleCost);
      const quantity = Math.min(free, affordable);
      if (quantity < 1) {
        message.textContent = free < 1 ? "Your inventory is full." : "Not enough gold.";
        return;
      }
      buyQuantity(quantity);
    });
    actions.append(button, five, max);
    row.append(header, actions);
    catalog.append(row);
    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = `Discard 1 ${item.name}`;
    discard.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      message.textContent = store.discard(item.id, ++orderId);
    });
    discards.append(discard);
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
