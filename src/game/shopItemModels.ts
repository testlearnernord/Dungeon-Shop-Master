import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { ItemId } from "./inventory.ts";

/**
 * Actual shelf-scale 3D geometry, never a camera-facing PNG/card.
 *
 * All props have their pivot on the shelf surface (y=0), face +X and
 * fit inside a stock slot. Each stock unit is merged into one mesh with
 * per-vertex colors, so five units don't cost dozens of draw calls.
 * No selection, pathfinding or economy state lives here.
 */
type Tint = readonly [number, number, number];
const rgb = (hex: string): Tint => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const materialByScene = new WeakMap<Scene, StandardMaterial>();
function stockMaterial(scene: Scene): StandardMaterial {
  let material = materialByScene.get(scene);
  if (!material) {
    material = new StandardMaterial("shelf-stock-vertex-paint", scene);
    material.diffuseColor = Color3.White();
    material.specularColor = new Color3(.12, .11, .09);
    materialByScene.set(scene, material);
  }
  return material;
}

export function createShopStockModel(
  scene: Scene, itemId: ItemId, name: string,
): Mesh {
  const parts: Mesh[] = [];
  let partNumber = 0;
  const paint = (mesh: Mesh, tint: Tint) => {
    const colors = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < colors.length; i += 4) {
      colors[i] = tint[0] / 255;
      colors[i + 1] = tint[1] / 255;
      colors[i + 2] = tint[2] / 255;
      colors[i + 3] = 1;
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.material = stockMaterial(scene);
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    parts.push(mesh);
    return mesh;
  };
  const box = (
    width: number, height: number, depth: number,
    x: number, y: number, z: number, tint: Tint,
  ) => {
    const mesh = MeshBuilder.CreateBox(name + "-part-" + partNumber++, {
      width, height, depth,
    }, scene);
    mesh.position.set(x, y, z);
    return paint(mesh, tint);
  };
  const ball = (
    sx: number, sy: number, sz: number,
    x: number, y: number, z: number, tint: Tint, segments = 6,
  ) => {
    const mesh = MeshBuilder.CreateSphere(name + "-part-" + partNumber++, {
      diameter: 1, segments,
    }, scene);
    mesh.scaling.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    return paint(mesh, tint);
  };
  const tube = (
    diameter: number, height: number,
    x: number, y: number, z: number, tint: Tint,
    tessellation = 7,
  ) => {
    const mesh = MeshBuilder.CreateCylinder(name + "-part-" + partNumber++, {
      diameter, height, tessellation,
    }, scene);
    mesh.position.set(x, y, z);
    return paint(mesh, tint);
  };

  switch (itemId) {
    case "healing-herb": {
      const blades = [
        [-.07, .225, -.06, -.22], [-.03, .275, .01, -.10],
        [.035, .255, -.035, .23], [.072, .195, .065, .52],
        [-.052, .225, .07, -.48], [.01, .30, .065, .12],
      ] as const;
      blades.forEach(([x, y, z, tilt], i) => {
        const stem = tube(.012, .15 + i % 2 * .035, x * .27, .085, z * .2, rgb("#6c7836"), 5);
        stem.rotation.z = -tilt * .55;
        const leaf = ball(.032, .088, .016, x, y, z, i % 2 ? rgb("#72944d") : rgb("#8da75b"));
        leaf.rotation.z = tilt;
        leaf.rotation.y = (i - 2) * .3;
      });
      tube(.047, .03, 0, .053, 0, rgb("#b28a56"), 8);
      tube(.044, .018, 0, .076, 0, rgb("#9b7044"), 8);
      break;
    }
    case "mana-potion": {
      const liquid = tube(.21, .20, 0, .125, 0, rgb("#256eb7"), 10);
      liquid.scaling.set(.92, 1, .92);
      tube(.214, .025, 0, .03, 0, rgb("#7aa1b0"), 10);
      tube(.135, .073, 0, .258, 0, rgb("#779ca7"), 10);
      tube(.154, .018, 0, .285, 0, rgb("#bbaf92"), 10);
      tube(.113, .062, 0, .328, 0, rgb("#a4794e"), 9);
      ball(.065, .014, .065, 0, .360, 0, rgb("#bd9361"), 7);
      ball(.012, .025, .012, .035, .135, -.078, rgb("#60b9f3"), 5);
      break;
    }
    case "iron-ore": {
      const shards = [
        [-.065, .092, -.055, .13, .09, .09, "#777876"],
        [.057, .070, .036, .09, .062, .075, "#87847d"],
        [-.035, .055, .078, .075, .065, .08, "#5f6060"],
      ] as const;
      shards.forEach(([x, y, z, sx, sy, sz, color], i) => {
        const shard = MeshBuilder.CreatePolyhedron(name + "-part-" + partNumber++, {
          type: 1, size: 1,
        }, scene);
        shard.scaling.set(sx, sy, sz);
        shard.rotation.set(.2 + i * .35, .5 + i * .4, .25 - i * .22);
        shard.position.set(x, y, z);
        paint(shard, rgb(color));
      });
      break;
    }
    case "bread": {
      ball(.164, .085, .131, 0, .087, 0, rgb("#ae6a38"), 8);
      ball(.151, .045, .118, 0, .134, 0, rgb("#d39b5b"), 7);
      for (const z of [-.065, 0, .065]) {
        const scoring = box(.022, .008, .145, .012, .177, z, rgb("#8d582f"));
        scoring.rotation.y = .16;
      }
      break;
    }
    case "iron-sword": {
      // Blade lies flat across the plank, rather than standing through the shelf above.
      box(.233, .020, .060, .025, .028, 0, rgb("#b4b4ad"));
      const point = MeshBuilder.CreateCylinder(name + "-part-" + partNumber++, {
        diameterBottom: .075, diameterTop: 0, height: .095, tessellation: 4,
      }, scene);
      point.rotation.z = -Math.PI / 2;
      point.position.set(.183, .028, 0);
      paint(point, rgb("#c3c3bb"));
      box(.021, .030, .140, -.107, .031, 0, rgb("#77716b"));
      box(.113, .027, .034, -.168, .031, 0, rgb("#845738"));
      ball(.022, .022, .025, -.234, .031, 0, rgb("#9b9383"), 5);
      break;
    }
    case "leather-vest": {
      // A standing, folded leather chestpiece with two shoulder tabs and lacing.
      box(.060, .203, .185, 0, .141, 0, rgb("#85512f"));
      box(.064, .067, .060, 0, .264, -.080, rgb("#a66b3c"));
      box(.064, .067, .060, 0, .264, .080, rgb("#a66b3c"));
      box(.015, .189, .024, .036, .141, 0, rgb("#503824"));
      box(.014, .038, .202, .042, .095, 0, rgb("#68402a"));
      box(.019, .041, .039, .052, .095, 0, rgb("#bf955c"));
      for (const y of [.143, .183, .222]) {
        const lace = tube(.008, .072, .051, y, 0, rgb("#c89a64"), 5);
        lace.rotation.x = Math.PI * .36;
      }
      break;
    }
  }

  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!merged) throw new Error("Failed to construct shop 3D stock: " + itemId);
  merged.name = name;
  merged.material = stockMaterial(scene);
  merged.isPickable = false;
  merged.checkCollisions = false;
  return merged;
}
