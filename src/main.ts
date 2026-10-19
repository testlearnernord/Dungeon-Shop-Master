import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { createFirstPersonCamera } from "./game/firstPersonController";
import { ITEMS, type ItemId } from "./game/inventory";
import { ECONOMY } from "./game/economy";
import { GameStore } from "./game/gameStore";
import { InteractionSystem } from "./game/interactionSystem";
import { NpcVisualSystem } from "./game/npcVisualSystem";
import { Shop } from "./game/shop";
import { buildWorld } from "./game/world";
import { setupDayHud } from "./dayHud";
import { setupEconomyHud } from "./economyHud";
import "./styles.css";

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas");
const inventoryElement = document.querySelector<HTMLDivElement>("#inventory");
const statusElement = document.querySelector<HTMLDivElement>("#status");

if (!canvas || !inventoryElement || !statusElement) {
  throw new Error("The game canvas and HUD must exist before the game starts.");
}

const inventoryHud = inventoryElement;
const statusHud = statusElement;
const engine = new Engine(canvas, true, { antialias: true, preserveDrawingBuffer: false });
const scene = new Scene(engine);
const camera = createFirstPersonCamera(canvas, scene);
const worldItems = buildWorld(scene);
const store = new GameStore();
const shop = new Shop(scene, store);
const npcVisuals = new NpcVisualSystem(scene);
const toggleCatalog = setupEconomyHud(canvas, store, (open) => {
  if (open) camera.detachControl();
  else camera.attachControl(canvas, true);
});
setupDayHud(canvas, store, (current, previous) => npcVisuals.reconcile(current, previous));
let selectedItemId: ItemId = ITEMS[0].id;

function renderInventory(selectedItem: ItemId): void {
  inventoryHud.replaceChildren();
  for (const item of ITEMS) {
    const row = document.createElement("div");
    row.className = `inventory-row${item.id === selectedItem ? " selected" : ""}`;
    row.innerHTML = `<span class="item-dot" style="--item-color:${item.color}"></span><span>${item.name}</span><strong>${store.state.shopEconomy.bag[item.id]}</strong>`;
    inventoryHud.append(row);
  }
  const capacity = document.createElement("div");
  capacity.className = "capacity";
  capacity.textContent = `Bag ${Object.values(store.state.shopEconomy.bag).reduce((sum, quantity) => sum + quantity, 0)} / ${ECONOMY.bagCapacity}`;
  inventoryHud.append(capacity);
}

new InteractionSystem(scene, canvas, camera, shop, worldItems, (message, selected) => {
  selectedItemId = selected;
  statusHud.textContent = message;
  renderInventory(selected);
}, toggleCatalog);
store.subscribe(() => renderInventory(selectedItemId));

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
