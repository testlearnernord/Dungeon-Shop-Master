import type { GameStore } from "./game/gameStore.ts";
import { currentDayReceipts } from "./game/saleView.ts";

const ITEM_ATLAS_INDEX: Record<string, number> = {
  bread: 24, "healing-herb": 31, "mana-potion": 22, "iron-ore": 28,
};

/** Live, replay-safe display of sales already booked by the global day tick. */
export function setupSalesHud(store: GameStore): void {
  const banner = document.querySelector<HTMLElement>("#sales-banner")!;
  const summary = document.querySelector<HTMLElement>("#sales-ledger-summary")!;
  const list = document.querySelector<HTMLOListElement>("#sales-receipts")!;

  function render(): void {
    const state = store.state;
    const receipts = currentDayReceipts(state);
    const { units, revenue } = state.shopEconomy.dailySales;
    summary.textContent = "Sales receipts · " + units + " sold / +" + revenue + "g";
    banner.dataset.hasSales = String(units > 0);
    banner.textContent = units > 0
      ? "Sales completed: " + units + " items sold · +" + revenue + "g received"
      : "No sales today. Stock Waybread or Healing Herbs for visiting heroes.";

    list.replaceChildren(...receipts.slice(-20).map((receipt) => {
      const row = document.createElement("li");
      row.className = "sales-receipt";
      row.dataset.eventId = receipt.id;
      const icon = document.createElement("span");
      icon.className = "sales-item-icon";
      const atlasIndex = ITEM_ATLAS_INDEX[receipt.itemId];
      icon.style.backgroundImage = "url('" + import.meta.env.BASE_URL + "assets/item-icons.webp')";
      icon.style.backgroundPosition =
        ((atlasIndex % 7) * (100 / 6)) + "% " + (Math.floor(atlasIndex / 7) * 25) + "%";
      icon.setAttribute("aria-hidden", "true");
      const detail = document.createElement("span");
      detail.textContent = receipt.heroName + " · " + receipt.quantity + " × " + receipt.itemName;
      const gold = document.createElement("strong");
      gold.textContent = "+" + receipt.revenue + "g";
      row.append(icon, detail, gold);
      list.append(row);
      return row;
    }));
    if (receipts.length > 20) {
      const note = document.createElement("li");
      note.textContent = "Showing latest 20 of " + receipts.length + " receipts.";
      list.append(note);
    } else if (!receipts.length) {
      const note = document.createElement("li");
      note.textContent = "No purchases on this day.";
      list.append(note);
    }
  }
  store.subscribe(render);
  render();
}
