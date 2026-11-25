import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { Interactable } from "./inventory";
import { NEW_GAME_COUNTER_PLACEMENT } from "./shopLayout";
import {shopFurnitureDefinition} from "./furnitureRegistry.ts";
import { buildBedroom } from "./bedroom";
import {buildCellarGeometry} from "./cellarGeometry.ts";
import { getDungeonSurfaces, applyCaveWorldUV } from "./dungeonSurfaces";
import {SHOP_PORTAL_X,SHOP_PORTAL_DOOR_Z} from "./shopPortal.ts";

export interface WorldInteractable extends Omit<Interactable, "kind"> {
  mesh: Mesh;
  kind: "register" | "corridor" | "roster-board" | "bed" | "debt-book" | "cellar-door" | "cellar-pond" | "cellar-forge" | "buyback-chest";
}

function material(scene: Scene, name: string, color: Color3): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = color;
  return result;
}

function box(
  scene: Scene,
  name: string,
  size: { width: number; height: number; depth: number },
  position: Vector3,
  color: Color3,
  collides = true,
  surface?: StandardMaterial,
): Mesh {
  const mesh = MeshBuilder.CreateBox(name, size, scene);
  mesh.position.copyFrom(position);
  mesh.material = surface ?? material(scene, `${name}-material`, color);
  if(surface===getDungeonSurfaces(scene).stone||
     surface===getDungeonSurfaces(scene).floor)applyCaveWorldUV(mesh);
  mesh.checkCollisions = collides;
  return mesh;
}

function sign(scene: Scene, name: string, text: string, position: Vector3): Mesh {
  const board = MeshBuilder.CreatePlane(name, { width: 1.7, height: 0.72 }, scene);
  board.position.copyFrom(position);
  const texture = new DynamicTexture(`${name}-texture`, { width: 512, height: 216 }, scene, false);
  texture.hasAlpha = true;
  texture.drawText(text, null, 150, "bold 44px monospace", "#f2d69a", "#292018", true);
  const boardMaterial = new StandardMaterial(`${name}-material`, scene);
  boardMaterial.diffuseTexture = texture;
  boardMaterial.emissiveColor = new Color3(0.25, 0.18, 0.08);
  boardMaterial.backFaceCulling = false;
  board.material = boardMaterial;
  board.isPickable = false;
  return board;
}

export function buildWorld(scene: Scene): WorldInteractable[] {
  const surfaces = getDungeonSurfaces(scene);
  scene.collisionsEnabled = true;
  scene.clearColor.set(0.055, 0.045, 0.04, 1);
  scene.fogMode = Scene.FOGMODE_EXP;
  scene.fogDensity = 0.018;
  scene.fogColor = new Color3(0.055, 0.045, 0.04);

  const ambient = new HemisphericLight("cavern-ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.45;
  const torchColor = new Color3(1, 0.58, 0.25);
  // Wall-mounted fixtures, not hovering globes in the middle of the shop.
  const sconces = [
    { flame: new Vector3(-6.82, 2.9, 0.8), bracket: new Vector3(-7.10, 2.83, 0.8), size: { width: 0.42, height: 0.14, depth: 0.24 } },
    { flame: new Vector3(6.82, 2.9, 0.8), bracket: new Vector3(7.10, 2.83, 0.8), size: { width: 0.42, height: 0.14, depth: 0.24 } },
    { flame: new Vector3(0, 2.9, -6.62), bracket: new Vector3(0, 2.83, -6.86), size: { width: 0.24, height: 0.14, depth: 0.42 } },
  ] as const;
  for (const [index, sconce] of sconces.entries()) {
    const torch = new PointLight(`torch-${index}`, sconce.flame, scene);
    torch.diffuse = torchColor;
    torch.intensity = 1.25;
    torch.range = 9;
    const flame = MeshBuilder.CreateSphere(`torch-flame-${index}`, { diameter: 0.18 }, scene);
    flame.position.copyFrom(sconce.flame);
    flame.material = material(scene, `torch-flame-${index}-material`, new Color3(1, 0.55, 0.12));
    flame.isPickable = false;
    box(scene, `torch-bracket-${index}`, sconce.size, sconce.bracket,
      new Color3(0.22, 0.16, 0.1), false).isPickable = false;
  }

  const rock = new Color3(0.2, 0.18, 0.16);
  const floor = box(scene, "stone-floor", { width: 15, height: 0.4, depth: 25 }, new Vector3(0, -0.2, 0), new Color3(0.25, 0.22, 0.18), true, surfaces.floor);
  floor.checkCollisions = true;
  const ceiling = box(scene, "stone-ceiling", { width: 15, height: 0.35, depth: 25 }, new Vector3(0, 4.1, 0), rock, true, surfaces.stone);
  ceiling.checkCollisions = true;

  box(scene, "left-wall", { width: 0.4, height: 4, depth: 14 }, new Vector3(-7.5, 2, 0), rock, true, surfaces.stone);
  box(scene, "right-wall", { width: 0.4, height: 4, depth: 14 }, new Vector3(7.5, 2, 0), rock, true, surfaces.stone);
  box(scene, "front-left-wall", { width: 5, height: 4, depth: 0.4 }, new Vector3(-5, 2, -7), rock, true, surfaces.stone);
  box(scene, "front-right-wall", { width: 5, height: 4, depth: 0.4 }, new Vector3(5, 2, -7), rock, true, surfaces.stone);
  // Keep the first-person room's structure and decoration isolated.
  const bed=buildBedroom(scene,surfaces);
  buildCellarGeometry(scene,surfaces);
  // Babylon plane front faces -Z by default; this sign must face +Z
  // so visitors in the main shop read the text instead of its mirror.
  sign(scene,"bedroom-sign","GALVIK'S REST",new Vector3(0,2.8,-6.58)).rotation.y=Math.PI;
  box(scene, "back-left-wall", { width: 2.25, height: 4, depth: 0.4 }, new Vector3(-6.375, 2, 7), rock, true, surfaces.stone);
  // ONE uninterrupted back-wall section from the real left portal's
  // right jamb (-2.75m) to the right side wall (+7.5m). The old right
  // exit is NOT a thin cover with gaps and a hollow old corridor.
  box(scene, "back-middle-wall", { width: 10.25, height: 4, depth: 0.4 },
    new Vector3(2.375, 2, 7), rock, true, surfaces.stone);
  for (const x of [SHOP_PORTAL_X-1.3,SHOP_PORTAL_X+1.3]) {
    box(scene, `corridor-wall-${x}`, { width: 0.25, height: 4, depth: 5.5 }, new Vector3(x, 2, 9.65), rock, true, surfaces.stone);
  }
  box(scene, "corridor-end-left-outer", { width: 0.2, height: 4, depth: 0.4 }, new Vector3(-5.2, 2, 12.2), rock, true, surfaces.stone);
  box(scene, "corridor-end-left-inner", { width: 0.2, height: 4, depth: 0.4 }, new Vector3(-2.8, 2, 12.2), rock, true, surfaces.stone);
  sign(scene, "cursed-threshold-sign", "THE CURSED THRESHOLD",
    new Vector3(SHOP_PORTAL_X,2.8,6.73));
  const portalDoor=box(scene,"cursed-portal-door",
    {width:2.2,height:1.8,depth:0.25},
    new Vector3(SHOP_PORTAL_X,0.9,SHOP_PORTAL_DOOR_Z),
    new Color3(0.26,0.12,0.1),false);
  portalDoor.isPickable=false;
  const playerBarrier=box(scene,"cursed-portal-player-barrier",
    {width:2.2,height:1.8,depth:0.25},
    new Vector3(SHOP_PORTAL_X,0.9,SHOP_PORTAL_DOOR_Z),
    new Color3(0.26,0.12,0.1));
  playerBarrier.visibility=0;
  playerBarrier.isPickable=false;

  const counter=NEW_GAME_COUNTER_PLACEMENT;
  const counterDefinition=shopFurnitureDefinition("counter");
  box(scene, "checkout-counter", { width: counterDefinition.body.width, height: 0.84, depth: counterDefinition.body.depth },
    new Vector3(counter.x, 0.42, counter.z), new Color3(0.32, 0.2, 0.12), true, surfaces.wood);
  box(scene, "counter-top", { width: counterDefinition.focus.width, height: 0.12, depth: counterDefinition.focus.depth },
    new Vector3(counter.x, 0.90, counter.z), new Color3(0.42, 0.29, 0.17), true, surfaces.woodEdge);
  box(scene, "register-base", { width: 0.49, height: 0.17, depth: 0.39 },
    new Vector3(counter.x+counterDefinition.register.x, 1.05, counter.z+counterDefinition.register.z),
    new Color3(0.17, 0.2, 0.18), false);
  const register = box(scene, "cash-register", { width: 0.39, height: 0.26, depth: 0.18 },
    new Vector3(counter.x+counterDefinition.register.x, 1.22, counter.z+counterDefinition.register.z),
    new Color3(0.3, 0.48, 0.36), false);
  register.metadata = { kind: "register" };
  const bookMeshNames=["bedroom-account-book","bedroom-account-pages","bedroom-account-spine"];
  const bookInteractables:WorldInteractable[]=bookMeshNames
    .map((name)=>scene.getMeshByName(name))
    .filter((mesh):mesh is Mesh=>mesh instanceof Mesh)
    .map(mesh=>({id:mesh.name,mesh,kind:"debt-book" as const}));
  return [{ id: "checkout-register", mesh: register, kind: "register" },
    { id: "galvik-bed", mesh: bed, kind: "bed" },...bookInteractables];
}
