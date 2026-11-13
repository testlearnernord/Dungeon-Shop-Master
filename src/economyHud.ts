import { ECONOMY, ITEMS } from "./game/economy";
import { GameStore } from "./game/gameStore";
import {goldIcon} from "./uiIcons.ts";

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
  const search=document.querySelector<HTMLInputElement>("#wholesale-search")!;
  const filter=document.querySelector<HTMLSelectElement>("#wholesale-category")!;
  const resultCount=document.querySelector<HTMLElement>("#wholesale-count")!;
  const balance=document.querySelector<HTMLElement>("#wholesale-gold")!;
  const capacity=document.querySelector<HTMLElement>("#wholesale-bag-fill")!;
  const cards:{row:HTMLElement;id:(typeof ITEMS)[number]["id"];
    bag:HTMLElement;shelf:HTMLElement;
    buyOne:HTMLButtonElement;buyFive:HTMLButtonElement;
    max:HTMLButtonElement;discard:HTMLButtonElement}[]=[];
  const groupFor=(kind:string)=>kind==="weapon"||kind==="armor"?"equipment":
    kind==="material"?"materials":"supplies";
  const purposeFor=(kind:string)=>kind==="food"?"Keeps heroes fed before expeditions.":
    kind==="healing"?"Restores health for wounded adventurers.":
    kind==="weapon"?"Improves dungeon combat performance.":
    kind==="armor"?"Reduces incoming dungeon damage.":
    kind==="material"?"Raw material for future crafting.":
    "Alchemical supplies for later use.";

  const toggle = (): void => {
    if (dialog.open) {
      dialog.close();
    } else {
      if (document.querySelector("dialog[open]")) return;
      if(document.pointerLockElement)void document.exitPointerLock();
      onMenuChanged(true);
      dialog.showModal();
      search.focus();
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
    row.dataset.itemId=item.id;
    row.dataset.category=groupFor(item.kind);
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
    const identity=document.createElement("div");
    identity.className="catalog-item-identity";
    const name=document.createElement("strong");
    name.className="catalog-product-name";
    name.textContent=item.name;
    const type=document.createElement("small");
    type.className="catalog-product-type";
    type.textContent=groupFor(item.kind).toUpperCase();
    description.textContent=purposeFor(item.kind);
    identity.append(name,type);
    const iconFrame=document.createElement("div");
    iconFrame.className="catalog-icon-frame";
    iconFrame.append(icon);
    header.append(iconFrame,identity);
    const prices=document.createElement("div");
    prices.className="catalog-prices";
    for(const [label,kind] of [
      [item.wholesaleCost+"g buy","buy"],
      [item.salePrice+"g sell","sell"],
      ["+"+(item.salePrice-item.wholesaleCost)+"g margin","margin"],
    ] as const){
      const pill=document.createElement("span");
      pill.className="catalog-price-"+kind;
      pill.textContent=label;
      prices.append(pill);
    }
    const stocks=document.createElement("div");
    stocks.className="catalog-stocks";
    const bag=document.createElement("span");
    bag.className="catalog-bag-amount";
    const shelf=document.createElement("span");
    shelf.className="catalog-shelf-amount";
    stocks.append(bag,shelf);
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
    row.append(header,description,prices,stocks,actions);
    catalog.append(row);
    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = `Discard 1 ${item.name}`;
    discard.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      message.textContent = store.discard(item.id, ++orderId);
    });
    discards.append(discard);
    cards.push({row,id:item.id,bag,shelf,buyOne:button,buyFive:five,max,discard});
  }

  const updateFilter=():void=>{
    const term=search.value.trim().toLowerCase();
    let shown=0;
    for(const card of cards){
      const item=ITEMS.find(entry=>entry.id===card.id)!;
      const visible=(filter.value==="all"||groupFor(item.kind)===filter.value)&&
        (item.name.toLowerCase().includes(term)||item.kind.toLowerCase().includes(term));
      card.row.hidden=!visible;
      if(visible)shown++;
    }
    resultCount.textContent=shown+" / "+ITEMS.length+" items";
  };
  search.addEventListener("input",updateFilter);
  filter.addEventListener("change",updateFilter);

  const render = (): void => {
    const economy = store.state.shopEconomy;
    const used=Object.values(economy.bag).reduce((sum,n)=>sum+n,0);
    const free=ECONOMY.bagCapacity-used;
    balance.replaceChildren(goldIcon(),document.createTextNode(economy.balance+"g"));
    capacity.textContent=used+" / "+ECONOMY.bagCapacity+" bag slots";
    capacity.dataset.full=String(free===0);
    for(const card of cards){
      const item=ITEMS.find(entry=>entry.id===card.id)!;
      const count=economy.slots.filter(slot=>slot.itemId===item.id)
        .reduce((sum,slot)=>sum+slot.quantity,0);
      const possible=Math.min(free,Math.floor(economy.balance/item.wholesaleCost));
      card.bag.textContent="Bag: "+economy.bag[item.id];
      card.shelf.textContent="On shelves: "+count;
      card.buyOne.disabled=possible<1;
      card.buyFive.disabled=possible<5;
      card.discard.disabled=economy.bag[item.id]===0;
      // Keep Buy max active at zero so the original explicit error feedback
      // distinguishes no funds from no storage.
      card.max.title=possible>0
        ?"Buy "+possible+" for "+(possible*item.wholesaleCost)+"g"
        :(free===0?"Bag full":"Insufficient gold");
    }
    gold.textContent = `Merchant gold: ${economy.balance}g`;
    gold.dataset.amount=economy.balance+"g";
    gold.setAttribute("aria-label","Merchant gold: "+economy.balance+"g");
    gold.prepend(goldIcon());
    supplies.textContent = `Shelves: ${ITEMS.map((item) =>
      `${item.name} ${economy.slots.filter((slot) => slot.itemId === item.id)
        .reduce((sum, slot) => sum + slot.quantity, 0)}`).join(" · ")}`;
    const summary = economy.dailySales;
    sales.textContent = `Last End Day: ${summary.units} sold · earned ${summary.revenue}g`;
  };
  store.subscribe(render);
  updateFilter();
  render();
  return toggle;
}
