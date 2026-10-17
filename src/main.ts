import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { createFirstPersonCamera } from "./game/firstPersonController";
import { Inventory, ITEMS, type ItemId } from "./game/inventory";
import { InteractionSystem } from "./game/interactionSystem";
import { Shop } from "./game/shop";
import { buildWorld } from "./game/world";
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
const inventory = new Inventory();
const shop = new Shop(scene, inventory);

function renderInventory(selectedItem: ItemId): void {
  inventoryHud.replaceChildren();
  for (const item of ITEMS) {
    const row = document.createElement("div");
    row.className = `inventory-row${item.id === selectedItem ? " selected" : ""}`;
    row.innerHTML = `<span class="item-dot" style="--item-color:${item.color}"></span><span>${item.name}</span><strong>${inventory.count(item.id)}</strong>`;
    inventoryHud.append(row);
  }
  const capacity = document.createElement("div");
  capacity.className = "capacity";
  capacity.textContent = `Bag ${inventory.total} / ${inventory.capacity}`;
  inventoryHud.append(capacity);
}

new InteractionSystem(scene, canvas, camera, shop, worldItems, (message, selected) => {
  statusHud.textContent = message;
  renderInventory(selected);
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
