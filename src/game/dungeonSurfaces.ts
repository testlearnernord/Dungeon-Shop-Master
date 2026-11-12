import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Lightweight hand-authored procedural surfaces. No network, binary assets or
 * runtime procedural shader: each 384px canvas is baked exactly once per scene.
 * Shared textures/materials keep the shop and sleep cell visually consistent.
 * All randomness is local/seeded; gameplay RNG, saves and simulation are untouched.
 */
export interface DungeonSurfaces {
  readonly stone: StandardMaterial;
  readonly stoneAccent: StandardMaterial;
  readonly floor: StandardMaterial;
  readonly wood: StandardMaterial;
  readonly woodEdge: StandardMaterial;
}
const cache = new WeakMap<Scene, DungeonSurfaces>();

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function valueNoise(x: number, y: number, grid: number, salt: number): number {
  const ix = Math.floor(x / grid);
  const iy = Math.floor(y / grid);
  const tx = (x / grid - ix);
  const ty = (y / grid - iy);
  const smoothX = tx * tx * (3 - 2 * tx);
  const smoothY = ty * ty * (3 - 2 * ty);
  const hash = (a: number, b: number) => {
    let n = (Math.imul(a + 17, 374761393) + Math.imul(b + 37, 668265263) + salt) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
  };
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * smoothX) * (1 - smoothY)
    + (c + (d - c) * smoothX) * smoothY;
}
type SurfaceKind = "stone" | "floor" | "wood";
function makeTexture(scene: Scene, kind: SurfaceKind): DynamicTexture {
  const size = 384;
  const texture = new DynamicTexture("dungeon-" + kind + "-diffuse", {
    width: size, height: size,
  }, scene, false);
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  const bytes = image.data;
  const base: [number, number, number] =
    kind === "wood" ? [89, 53, 31] :
    kind === "floor" ? [97, 86, 72] : [91, 83, 75];
  const salt = kind === "wood" ? 91 : kind === "floor" ? 172 : 299;
  const rand = random(salt);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const coarse = valueNoise(x, y, 52, salt) - 0.5;
      const fine = valueNoise(x, y, 9, salt + 63) - 0.5;
      const grain = kind === "wood"
        ? 7 * Math.sin(y * 0.28 + 2.7 * Math.sin(x * 0.035)
          + coarse * 6) + 3 * Math.sin(y * 0.94 + x * 0.025)
        : 0;
      const variation = coarse * 38 + fine * 17 + grain;
      const pos = (y * size + x) * 4;
      bytes[pos] = Math.max(0, Math.min(255, base[0] + variation));
      bytes[pos + 1] = Math.max(0, Math.min(255, base[1] + variation * 0.9));
      bytes[pos + 2] = Math.max(0, Math.min(255, base[2] + variation * 0.77));
      bytes[pos + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  if (kind === "wood") {
    // Long, irregular fibres rather than the flat brown boxes of the prototype.
    for (let i = 0; i < 100; i++) {
      const y = rand() * size;
      const amplitude = 0.6 + rand() * 2.0;
      ctx.beginPath();
      ctx.moveTo(-12, y);
      for (let x = 0; x <= size + 12; x += 16) {
        ctx.lineTo(x, y + amplitude * Math.sin(x * 0.025 + i * 2.1));
      }
      ctx.lineWidth = rand() < 0.7 ? 0.65 : 1.35;
      ctx.strokeStyle = rand() > 0.45 ? "rgba(26,13,9,0.29)" : "rgba(198,122,70,0.21)";
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const x = 18 + rand() * (size - 36);
      const y = 18 + rand() * (size - 36);
      ctx.beginPath();
      ctx.ellipse(x, y, 8 + rand() * 9, 2 + rand() * 2, 0, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(32,17,11,0.47)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, 3, 1.6, 0, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(27,13,9,0.45)";
      ctx.fill();
    }
  } else {
    // Offset, chipped stone courses. Lines are baked into pixels, NOT colliders.
    const rows = kind === "floor" ? 5 : 6;
    const columns = kind === "floor" ? 5 : 4;
    const rowHeight = size / rows;
    const columnWidth = size / columns;
    ctx.lineWidth = kind === "floor" ? 5.5 : 3.7;
    ctx.strokeStyle = kind === "floor" ? "rgba(24,19,17,0.71)" : "rgba(26,23,21,0.55)";
    for (let row = 1; row < rows; row++) {
      const y = row * rowHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 12) {
        ctx.lineTo(x, y + (rand() - 0.5) * 5);
      }
      ctx.stroke();
    }
    for (let row = 0; row < rows; row++) {
      const offset = (row % 2) * columnWidth * 0.5;
      for (let i = 0; i <= columns; i++) {
        const x = i * columnWidth + offset;
        if (x >= size) continue;
        ctx.beginPath();
        ctx.moveTo(x, row * rowHeight);
        ctx.lineTo(x + (rand() - 0.5) * 4, (row + 0.5) * rowHeight);
        ctx.lineTo(x + (rand() - 0.5) * 5, (row + 1) * rowHeight);
        ctx.stroke();
      }
    }
    // Stained stone veins and worn edges interrupt a perfect square grid.
    for (let i = 0; i < 110; i++) {
      const x = rand() * size, y = rand() * size;
      const extent = 2 + rand() * 19;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + extent * 0.62, y + (rand() - 0.5) * extent);
      ctx.lineTo(x + extent, y - extent * 0.3);
      ctx.lineWidth = 0.5 + rand() * 1.25;
      ctx.strokeStyle = rand() > 0.45 ? "rgba(32,27,24,0.28)" : "rgba(201,180,140,0.20)";
      ctx.stroke();
    }
  }
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}
function standard(scene: Scene, name: string, texture: DynamicTexture, tint = 1): StandardMaterial {
  const surface = new StandardMaterial("dungeon-surface-" + name, scene);
  surface.diffuseTexture = texture;
  surface.diffuseColor = new Color3(tint, tint, tint);
  surface.specularColor = new Color3(0.045, 0.041, 0.036);
  surface.specularPower = 16;
  // Keep the cave legible in the candlelight without turning it into a lobby.
  surface.ambientColor = new Color3(0.025, 0.021, 0.018);
  return surface;
}
export function getDungeonSurfaces(scene: Scene): DungeonSurfaces {
  const existing = cache.get(scene);
  if (existing) return existing;
  const stoneTexture = makeTexture(scene, "stone");
  const floorTexture = makeTexture(scene, "floor");
  const woodTexture = makeTexture(scene, "wood");
  const surfaces: DungeonSurfaces = {
    stone: standard(scene, "stone", stoneTexture),
    stoneAccent: standard(scene, "stone-highlight", stoneTexture, 1.18),
    floor: standard(scene, "floor", floorTexture),
    wood: standard(scene, "timber", woodTexture),
    woodEdge: standard(scene, "timber-edge", woodTexture, 1.18),
  };
  cache.set(scene, surfaces);
  return surfaces;
}
