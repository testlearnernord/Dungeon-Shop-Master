import { createCashierSfx } from "./cashierSfx.ts";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { createFirstPersonCamera } from "./game/firstPersonController";
import { ITEMS, type ItemId } from "./game/inventory";
import { ECONOMY } from "./game/economy";
import { GameStore } from "./game/gameStore";
import { InteractionSystem } from "./game/interactionSystem";
import { NpcVisualSystem } from "./game/npcVisualSystem";
import { forecastShoppingIntents } from "./game/shopperIntents.ts";
import { Level6Arena } from "./game/level6Arena";
import { DungeonViewer } from "./game/dungeonViewer";
import { createRosterBoard } from "./game/rosterBoard";
import { setupRosterBoardHud } from "./rosterBoardHud";
import { Shop } from "./game/shop";
import { setupShopPlacementHud } from "./shopPlacementHud.ts";
import { buildWorld } from "./game/world";
import { setupDayHud } from "./dayHud";
import { setupEconomyHud } from "./economyHud";
import { setupSalesHud } from "./salesHud";
import { setupExpeditionHud } from "./expeditionHud";
import { currentDayReceipts } from "./game/saleView";
import { loadCampaign, setupCampaignHud } from "./campaignHud";
import { setupSoundtrack } from "./soundtrack";
import { setupCashierHud } from "./cashierHud.ts";
import { setupShopStatusToggle } from "./shopHudLayout";
import "./styles.css";

async function startGame(): Promise<void> {
setupShopStatusToggle();
const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas");
const inventoryElement = document.querySelector<HTMLDivElement>("#inventory");
const statusElement = document.querySelector<HTMLDivElement>("#status");

if (!canvas || !inventoryElement || !statusElement) {
  throw new Error("The game canvas and HUD must exist before the game starts.");
}

const inventoryHud = inventoryElement;
const statusHud = statusElement;
const campaign = await loadCampaign();
const engine = new Engine(canvas, true, { antialias: true, preserveDrawingBuffer: false });
const scene = new Scene(engine);
const camera = createFirstPersonCamera(canvas, scene);
const worldItems = buildWorld(scene);
const store = new GameStore(campaign.state);
const shop = new Shop(scene, store);
const board = createRosterBoard(scene, store);
worldItems.push({ id: "adventurer-roster-board", mesh: board.mesh, kind: "roster-board" });
const openRoster = setupRosterBoardHud(canvas, camera, store);
setupShopPlacementHud(canvas, camera, store, shop);
const npcVisuals = new NpcVisualSystem(scene);
const toggleCatalog = setupEconomyHud(canvas, store, (open) => {
  if (open) camera.detachControl();
  else camera.attachControl(canvas, true);
});
setupDayHud(
  canvas, store,
  (current, previous) => npcVisuals.reconcile(current, previous),
  () => npcVisuals.showSales(currentDayReceipts(store.state)),
);
// The forecast is read-only. It uses exactly the same purchase decisions
// as the confirmed next-day transaction. Stock changes trigger replanning.
const refreshShoppingIntents = () => npcVisuals.setShoppingIntents(
  forecastShoppingIntents(store.state),
  store.state.shopLayout, shop, store.state.shopCarts,
  (heroId,slotId)=>{
    const previous=store.state;
    store.pickUpShopItem(heroId,slotId);
    return store.state!==previous;
  });
store.subscribe(refreshShoppingIntents);
refreshShoppingIntents();
setupSalesHud(store);
setupExpeditionHud(store);
let selectedItemId: ItemId = ITEMS[0].id;
setupCampaignHud(store, campaign, () => {
  npcVisuals.reconcile([], []);
  cashier?.close();
  interactions.reset();
  camera.position.set(0, 1.7, -4.6);
  camera.rotation.setAll(0);
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
  const catalog = document.querySelector<HTMLDialogElement>("#wholesale")!;
  if (catalog.open) catalog.close();
  statusHud.textContent = "Campaign ready. Click to enter the shop.";
});

function renderInventory(selectedItem: ItemId): void {
  const focusedItemId = document.activeElement instanceof HTMLElement &&
    inventoryHud.contains(document.activeElement) ? document.activeElement.dataset.itemId : undefined;
  inventoryHud.replaceChildren();
  const rows = new Map<string, HTMLDivElement>();
  for (const [index,item] of ITEMS.entries()) {
    const row = document.createElement("div");
    row.className = `inventory-row${item.id === selectedItem ? " selected" : ""}${store.state.shopEconomy.bag[item.id]===0?" empty":""}`;
    row.setAttribute("role","button");
    row.setAttribute("tabindex","0");
    row.dataset.itemId = item.id;
    row.setAttribute("aria-label",`Select ${item.name}, ${store.state.shopEconomy.bag[item.id]} available`);
    row.setAttribute("aria-pressed",String(item.id===selectedItem));
    row.title=`${index+1}: ${item.name}`;
    row.addEventListener("click",()=>interactions.selectItem(item.id));
    row.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();interactions.selectItem(item.id);}});
    const key=document.createElement("kbd");
    key.className="hotbar-key";key.textContent=String(index+1);
    const dot = document.createElement("span");
    dot.className = "item-dot";
    dot.style.setProperty("--item-color", item.color);
    const name = document.createElement("span");
    name.textContent = item.name;
    name.className="item-name";
    const quantity = document.createElement("strong");
    quantity.textContent = String(store.state.shopEconomy.bag[item.id]);
    row.append(key,dot, name, quantity);
    inventoryHud.append(row);
    rows.set(item.id, row);
  }
  const capacity = document.createElement("div");
  capacity.className = "capacity";
  capacity.textContent = `Bag ${Object.values(store.state.shopEconomy.bag).reduce((sum, quantity) => sum + quantity, 0)} / ${ECONOMY.bagCapacity}`;
  inventoryHud.append(capacity);
  const hint=document.createElement("span");hint.className="hotbar-hint";
  hint.textContent="Wheel / 1–6 select · Click stock · Right-click remove";
  inventoryHud.append(hint);
  if (focusedItemId) rows.get(focusedItemId)?.focus({ preventScroll: true });
}

let isShopActive = () => true;
let cashier:ReturnType<typeof setupCashierHud>|null=null;
const interactions = new InteractionSystem(scene, canvas, camera, shop, worldItems, (message, selected) => {
  selectedItemId = selected;
  statusHud.textContent = message;
  renderInventory(selected);
}, toggleCatalog, 3, openRoster, () => cashier?.open()??"Register unavailable.", () => isShopActive());
store.subscribe(() => renderInventory(selectedItemId));
const soundtrack = setupSoundtrack();
const cashierSfx=createCashierSfx(()=>soundtrack.soundEnabled,()=>soundtrack.soundVolume);
const arena = new Level6Arena(engine, canvas, camera, store, (active) => {
  soundtrack.setScene(active ? "boss" : "shop");
});
const dungeon = new DungeonViewer(engine, canvas, camera, store, (active) => {
  soundtrack.setScene(active ? "dungeon" : "shop");
});
isShopActive=()=>!arena.isActive&&!dungeon.isActive;
cashier=setupCashierHud(canvas,camera,store,()=>npcVisuals.readyCheckoutHeroId(),isShopActive,
  (heroId,perfectTiming)=>store.payReservedCart(heroId,perfectTiming),message=>{statusHud.textContent=message;},cashierSfx.play,cashierSfx.pulse);

engine.runRenderLoop(() => {
  if (dungeon.isActive) {
    dungeon.update(engine.getDeltaTime() / 1000);
    dungeon.currentScene?.render();
  } else if (arena.isActive) {
    arena.update(engine.getDeltaTime() / 1000);
    arena.currentScene?.render();
  } else scene.render();
});
window.addEventListener("resize", () => engine.resize());
}

void startGame();
