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
import { CHECKOUT_COUNTER, COMPACT_COUNTER } from "./shopLayout";

export interface WorldInteractable extends Omit<Interactable, "kind"> {
  mesh: Mesh;
  kind: "register" | "corridor" | "roster-board" | "bed";
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
): Mesh {
  const mesh = MeshBuilder.CreateBox(name, size, scene);
  mesh.position.copyFrom(position);
  mesh.material = material(scene, `${name}-material`, color);
  mesh.checkCollisions = collides;
  return mesh;
}

function sign(scene: Scene, name: string, text: string, position: Vector3): void {
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
}

export function buildWorld(scene: Scene): WorldInteractable[] {
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
  const floor = box(scene, "stone-floor", { width: 15, height: 0.4, depth: 25 }, new Vector3(0, -0.2, 0), new Color3(0.25, 0.22, 0.18));
  floor.checkCollisions = true;
  const ceiling = box(scene, "stone-ceiling", { width: 15, height: 0.35, depth: 25 }, new Vector3(0, 4.1, 0), rock);
  ceiling.checkCollisions = true;

  box(scene, "left-wall", { width: 0.4, height: 4, depth: 14 }, new Vector3(-7.5, 2, 0), rock);
  box(scene, "right-wall", { width: 0.4, height: 4, depth: 14 }, new Vector3(7.5, 2, 0), rock);
  box(scene, "front-left-wall", { width: 5, height: 4, depth: 0.4 }, new Vector3(-5, 2, -7), rock);
  box(scene, "front-right-wall", { width: 5, height: 4, depth: 0.4 }, new Vector3(5, 2, -7), rock);
  // Galvik's miserable sleeping alcove opens behind the old back wall.
  // The original central wall becomes two solid piers around a 2.4m door.
  box(scene, "bedroom-door-left-pier", { width: 1.3, height: 4, depth: 0.4 },
    new Vector3(-1.85, 2, -7), rock);
  box(scene, "bedroom-door-right-pier", { width: 1.3, height: 4, depth: 0.4 },
    new Vector3(1.85, 2, -7), rock);
  box(scene, "bedroom-left-wall", { width: 0.4, height: 4, depth: 5.55 },
    new Vector3(-3.25, 2, -9.68), rock);
  box(scene, "bedroom-right-wall", { width: 0.4, height: 4, depth: 5.55 },
    new Vector3(3.25, 2, -9.68), rock);
  box(scene, "bedroom-rear-wall", { width: 6.9, height: 4, depth: 0.4 },
    new Vector3(0, 2, -12.35), rock);
  const dustyWood=new Color3(0.22,0.125,0.074);
  box(scene,"bed-frame",{width:1.7,height:0.38,depth:2.25},
    new Vector3(0.8,0.35,-10.6),dustyWood);
  const bed=box(scene,"galvik-bed",{width:1.5,height:0.22,depth:1.95},
    new Vector3(0.8,0.59,-10.6),new Color3(0.32,0.28,0.25));
  bed.metadata={kind:"bed"};
  box(scene,"bed-headboard",{width:1.72,height:0.95,depth:0.22},
    new Vector3(0.8,0.7,-11.78),dustyWood);
  box(scene,"bed-blanket",{width:1.44,height:0.07,depth:1.05},
    new Vector3(0.8,0.74,-10.1),new Color3(0.21,0.23,0.21),false).isPickable=false;
  box(scene,"bed-pillow",{width:1.1,height:0.14,depth:0.40},
    new Vector3(0.8,0.75,-11.35),new Color3(0.45,0.42,0.35),false).isPickable=false;
  box(scene,"galvik-bed-chest",{width:0.95,height:0.7,depth:0.55},
    new Vector3(-2.1,0.36,-11.3),dustyWood);
  box(scene,"bed-side-stool",{width:0.48,height:0.55,depth:0.48},
    new Vector3(2.23,0.29,-10.9),dustyWood);
  const candle=new PointLight("galvik-bed-candle",new Vector3(-2.1,1.8,-10.45),scene);
  candle.diffuse=new Color3(1,0.52,0.23);
  candle.intensity=0.95;
  candle.range=6;
  box(scene,"bed-candle",{width:0.12,height:0.20,depth:0.12},
    new Vector3(-2.1,1.14,-10.45),new Color3(0.9,0.65,0.31),false).isPickable=false;
  sign(scene,"bedroom-sign","GALVIK'S REST",new Vector3(0,2.8,-6.76));
  box(scene, "back-left-wall", { width: 2.25, height: 4, depth: 0.4 }, new Vector3(-6.375, 2, 7), rock);
  box(scene, "back-middle-wall", { width: 5.5, height: 4, depth: 0.4 }, new Vector3(0, 2, 7), rock);
  box(scene, "back-right-wall", { width: 2.25, height: 4, depth: 0.4 }, new Vector3(6.375, 2, 7), rock);
  for (const x of [-5.3, -2.7, 2.7, 5.3]) {
    box(scene, `corridor-wall-${x}`, { width: 0.25, height: 4, depth: 5.5 }, new Vector3(x, 2, 9.65), rock);
  }
  box(scene, "corridor-end-left-outer", { width: 0.2, height: 4, depth: 0.4 }, new Vector3(-5.2, 2, 12.2), rock);
  box(scene, "corridor-end-left-inner", { width: 0.2, height: 4, depth: 0.4 }, new Vector3(-2.8, 2, 12.2), rock);
  // Let Level 6 adventurers pass through the end wall without letting the player escape.
  box(scene, "corridor-end-right-inner", { width: 0.2, height: 4, depth: 0.4 }, new Vector3(2.8, 2, 12.2), rock);
  box(scene, "corridor-end-right-outer", { width: 0.2, height: 4, depth: 0.4 }, new Vector3(5.2, 2, 12.2), rock);

  sign(scene, "level-4-sign", "LEVEL 4 · BLOCKED", new Vector3(-4, 2.8, 6.73));
  sign(scene, "level-6-sign", "LEVEL 6 · BLOCKED", new Vector3(4, 2.8, 6.73));
  const level4Door = box(scene, "level-4-barrier", { width: 2.2, height: 1.8, depth: 0.25 },
    new Vector3(-4, 0.9, 11.7), new Color3(0.26, 0.12, 0.1), false);
  level4Door.isPickable = false;
  const playerBarrier = box(scene, "level-4-player-barrier", { width: 2.2, height: 1.8, depth: 0.25 },
    new Vector3(-4, 0.9, 11.7), new Color3(0.26, 0.12, 0.1));
  playerBarrier.visibility = 0;
  playerBarrier.isPickable = false;
  const level6Gate = box(scene, "level-6-barrier", { width: 2.2, height: 1.8, depth: 0.25 },
    new Vector3(4, 0.9, 11.7), new Color3(0.21, 0.24, 0.28), false);
  level6Gate.isPickable = false;
  const level6PlayerBarrier = box(scene, "level-6-player-barrier", { width: 2.2, height: 2.6, depth: 0.25 },
    new Vector3(4, 1.3, 11.7), new Color3(0.21, 0.24, 0.28));
  level6PlayerBarrier.visibility = 0;
  level6PlayerBarrier.isPickable = false;

  const counter=CHECKOUT_COUNTER;
  box(scene, "checkout-counter", { width: COMPACT_COUNTER.bodyWidth, height: 1.15, depth: COMPACT_COUNTER.bodyDepth },
    new Vector3(counter.x, 0.68, counter.z), new Color3(0.32, 0.2, 0.12));
  box(scene, "counter-top", { width: COMPACT_COUNTER.topWidth, height: 0.14, depth: COMPACT_COUNTER.topDepth },
    new Vector3(counter.x, 1.32, counter.z), new Color3(0.42, 0.29, 0.17));
  box(scene, "register-base", { width: 0.62, height: 0.3, depth: 0.5 },
    new Vector3(counter.x+0.35, 1.55, counter.z), new Color3(0.17, 0.2, 0.18), false);
  const register = box(scene, "cash-register", { width: 0.48, height: 0.38, depth: 0.18 },
    new Vector3(counter.x+counter.registerOffsetX, 1.87, counter.z+counter.registerOffsetZ),
    new Color3(0.3, 0.48, 0.36), false);
  register.metadata = { kind: "register" };
  return [{ id: "checkout-register", mesh: register, kind: "register" },
    { id: "galvik-bed", mesh: bed, kind: "bed" }];
}
