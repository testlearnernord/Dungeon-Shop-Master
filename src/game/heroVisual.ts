import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type { AdventurerRole } from "./adventurers.ts";
import { appearanceForHero } from "./heroIdentity.ts";

/** All scenes use the same equipment names as the actual merchant economy. */
export interface HeroEquipmentVisual {
  readonly weapon: string | null;
  readonly armor: string | null;
}

export interface HeroVisualIdentity {
  readonly id: string;
  readonly role: AdventurerRole;
  readonly equipment: HeroEquipmentVisual;
}

/** Pure cosmetics: no new GameState fields, RNG consumption or save migration. */

export interface HeroVisual {
  readonly root: TransformNode;
  readonly torso: Mesh;
  readonly arms: readonly [TransformNode, TransformNode];
  readonly legs: readonly [TransformNode, TransformNode];
  /** Weapon animation is driven by the active scene, not the model factory. */
  readonly weaponPivot: TransformNode;
  readonly signature: string;
  readonly swordMesh: Mesh;
  readonly vestMesh: Mesh;
  readonly appearanceKey: string;
}

/**
 * One Babylon character builder for shop, future dungeon and boss scenes.
 * Same hero ID + role + equipment => same proportions, colors and visible gear.
 * Scene-specific movement, camera, labels, combat physics stay outside.
 */
export function createHeroVisual(
  scene: Scene, identity: HeroVisualIdentity, rootName: string,
): HeroVisual {
  const look = appearanceForHero(identity.id, identity.role);
  const prefix = rootName;
  const root = new TransformNode(rootName, scene);
  // Material ownership belongs to this Babylon scene; root disposal is local.
  const mat = (tag: string, color: string) => {
    const value = new StandardMaterial(prefix + "-" + tag + "-material", scene);
    value.diffuseColor = Color3.FromHexString(color);
    value.specularColor = new Color3(0.10, 0.08, 0.06);
    return value;
  };
  const coat = mat("coat", identity.role === "tank" ? "#536f91" :
    identity.role === "healer" ? "#477f67" : "#a44837");
  const skin = mat("skin", look.skin);
  const hair = mat("hair", look.hair);
  const trim = mat("trim", look.trim);
  const dark = mat("dark", "#272728");
  const leather = mat("leather", "#674633");
  const steel = mat("steel", "#a7b8c6");

  const attach = (name: string, mesh: Mesh, parent: TransformNode,
    xyz: [number, number, number], material: StandardMaterial): Mesh => {
    mesh.name = prefix + "-" + name;
    mesh.parent = parent;
    mesh.position.set(...xyz);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    return mesh;
  };

  const shoulder = identity.role === "tank" ? 0.62 :
    identity.role === "healer" ? 0.48 : 0.43;
  const torso = attach("torso",
    MeshBuilder.CreateCylinder(prefix + "-torso", {
      height: 0.70, diameterTop: shoulder,
      diameterBottom: identity.role === "healer" ? 0.58 : 0.48,
      tessellation: 8,
    }, scene), root, [0, 1.14, 0], coat);
  attach("head", MeshBuilder.CreateSphere(prefix + "-head",
    { diameter: 0.39, segments: 8 }, scene), root, [0, 1.73, 0], skin);
  // Visible personal silhouette: stable head hair, occasional beard, and role silhouette.
  const hairMesh = attach("hair", MeshBuilder.CreateSphere(prefix + "-hair",
    { diameter: 0.40, segments: 8 }, scene), root, [0, 1.86, 0], hair);
  hairMesh.scaling.y = 0.36;
  if (look.beard) {
    const beard = attach("beard", MeshBuilder.CreateSphere(prefix + "-beard",
      { diameter: 0.29, segments: 8 }, scene), root, [0, 1.60, -0.13], hair);
    beard.scaling.y = 0.60;
  }
  if (identity.role === "tank") {
    attach("shoulder-left", MeshBuilder.CreateBox(prefix + "-shoulder-left",
      { width: 0.28, height: 0.21, depth: 0.34 }, scene), root, [-0.41, 1.46, 0], trim);
    attach("shoulder-right", MeshBuilder.CreateBox(prefix + "-shoulder-right",
      { width: 0.28, height: 0.21, depth: 0.34 }, scene), root, [0.41, 1.46, 0], trim);
  } else if (identity.role === "healer") {
    attach("robe", MeshBuilder.CreateCylinder(prefix + "-robe", {
      height: 0.57, diameterTop: 0.42, diameterBottom: 0.75, tessellation: 8,
    }, scene), root, [0, 0.74, 0], coat);
    attach("focus", MeshBuilder.CreateSphere(prefix + "-focus", {
      diameter: 0.18, segments: 8,
    }, scene), root, [-0.40, 1.32, -0.14], trim);
  } else {
    attach("hood", MeshBuilder.CreateCylinder(prefix + "-hood", {
      height: 0.16, diameter: 0.50, tessellation: 8,
    }, scene), root, [0, 1.92, 0], dark);
  }

  const arms = ([-1, 1] as const).map((side) => {
    const pivot = new TransformNode(prefix + "-arm-" + side, scene);
    pivot.parent = root;
    pivot.position.set(side * 0.31, 1.4, 0);
    attach("arm-" + side + "-mesh", MeshBuilder.CreateCylinder(prefix + "-arm-part",
      { height: 0.52, diameter: 0.15, tessellation: 6 }, scene),
      pivot, [0, -0.27, 0], coat);
    return pivot;
  }) as [TransformNode, TransformNode];
  const legs = ([-1, 1] as const).map((side) => {
    const pivot = new TransformNode(prefix + "-leg-" + side, scene);
    pivot.parent = root;
    pivot.position.set(side * 0.14, 0.6, 0);
    attach("leg-" + side + "-mesh", MeshBuilder.CreateCylinder(prefix + "-leg-part",
      { height: 0.62, diameter: 0.17, tessellation: 6 }, scene),
      pivot, [0, -0.29, 0], dark);
    return pivot;
  }) as [TransformNode, TransformNode];
  // A shared animation socket, so future rigged GLBs can replace primitives cleanly.
  const weaponPivot = new TransformNode(prefix + "-weapon-socket", scene);
  weaponPivot.parent = root;
  weaponPivot.position.set(0.40, 1.36, -0.12);
  const swordMesh = attach("equipped-iron-sword",
    MeshBuilder.CreateBox(prefix + "-sword-part",
      { width: 0.09, height: 0.72, depth: 0.12 }, scene),
    weaponPivot, [0.02, -0.24, -0.13], steel);
  const vestMesh = attach("equipped-leather-vest",
    MeshBuilder.CreateBox(prefix + "-vest-part",
      { width: shoulder + 0.06, height: 0.48, depth: 0.50 }, scene),
    root, [0, 1.17, 0], leather);
  // A tiny stable stature variance retains a different silhouette for each ID.
  root.scaling.setAll(look.stature);
  const model: HeroVisual = {
    root, torso, arms, legs, weaponPivot, swordMesh, vestMesh,
    appearanceKey: look.key,
    signature: look.key,
  };
  root.metadata = {
    adventurerId: identity.id, role: identity.role,
    appearanceKey: look.key, visualSignature: look.key,
    skinColor: look.skin, hairColor: look.hair,
  };
  setHeroVisualEquipment(model, identity.equipment);
  return model;
}

/** A purchase updates the existing model; replays pass historical equipment. */
export function setHeroVisualEquipment(model: HeroVisual, equipment: HeroEquipmentVisual): void {
  const sword = equipment.weapon === "Iron Sword";
  const vest = equipment.armor === "Leather Vest";
  model.swordMesh.setEnabled(sword);
  model.vestMesh.setEnabled(vest);
  model.root.metadata.weapon = equipment.weapon;
  model.root.metadata.armor = equipment.armor;
  model.root.metadata.swordVisible = sword;
  model.root.metadata.vestVisible = vest;
}
