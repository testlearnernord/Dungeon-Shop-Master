import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { reconcileVisitors, type GateSide, type VisitorRole, type VisitorSnapshot } from "./npcVisitors";
import { salesByHero, type SaleReceipt } from "./saleView.ts";

interface NpcVisual {
  readonly root: TransformNode;
  readonly arms: readonly TransformNode[];
  readonly legs: readonly TransformNode[];
  readonly torso: Mesh;
  visitor: VisitorSnapshot;
  phase: "entering" | "browsing" | "queueing" | "leaving";
  route: Vector3[];
  waypoint: number;
  slot: number;
  elapsed: number;
  wait: number;
  browseSide: number;
  animationTime: number;
  gateSide: GateSide;
  saleTag: Mesh | null;
  saleSeconds: number;
}

const ROLE_COLORS: Record<VisitorRole, string> = {
  tank: "#536f91",
  DPS: "#a44837",
  healer: "#477f67",
};
const WALK_SPEED = 2.1;
const DOOR_CLOSED_Y = 0.9;
const DOOR_OPEN_Y = 3.8;
const DOOR_PASSAGE_CLEAR_Y = 3.4;
const CORRIDOR_X: Record<GateSide, number> = { level4: -4, level6: 4 };
const CORRIDOR_INNER_Z = 6.0;
const CORRIDOR_OUTER_Z = 13;

function roleColor(role: VisitorRole): Color3 {
  return Color3.FromHexString(ROLE_COLORS[role]);
}

function material(scene: Scene, name: string, color: Color3): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = color;
  result.specularColor = new Color3(0.12, 0.12, 0.12);
  return result;
}

function createPart(
  scene: Scene,
  root: TransformNode,
  name: string,
  mesh: Mesh,
  position: Vector3,
  material: StandardMaterial,
): Mesh {
  mesh.name = name;
  mesh.parent = root;
  mesh.position.copyFrom(position);
  mesh.material = material;
  mesh.checkCollisions = false;
  mesh.isPickable = false;
  return mesh;
}

function createHumanoid(scene: Scene, visitor: VisitorSnapshot, slot: number, position: Vector3): NpcVisual {
  const root = new TransformNode(`npc-${visitor.id}`, scene);
  root.position.copyFrom(position);
  const bodyMaterial = material(scene, `npc-${visitor.id}-role`, roleColor(visitor.role));
  const skinMaterial = material(scene, `npc-${visitor.id}-skin`, new Color3(0.72, 0.52, 0.36));
  const trimMaterial = material(scene, `npc-${visitor.id}-trim`, new Color3(0.78, 0.67, 0.45));
  const darkMaterial = material(scene, `npc-${visitor.id}-dark`, new Color3(0.17, 0.15, 0.14));

  const torso = createPart(scene, root, `npc-${visitor.id}-torso`,
    MeshBuilder.CreateCylinder("", {
      height: 0.7,
      diameterTop: visitor.role === "tank" ? 0.54 : 0.42,
      diameterBottom: visitor.role === "healer" ? 0.56 : 0.48,
      tessellation: 6,
    }, scene), new Vector3(0, 1.14, 0), bodyMaterial);
  createPart(scene, root, `npc-${visitor.id}-head`,
    MeshBuilder.CreateSphere("", { diameter: 0.38, segments: 6 }, scene),
    new Vector3(0, 1.72, 0), skinMaterial);
  createPart(scene, root, `npc-${visitor.id}-helmet`,
    MeshBuilder.CreateCylinder("", { height: 0.12, diameter: 0.43, tessellation: 6 }, scene),
    new Vector3(0, 1.88, 0), visitor.role === "tank" ? trimMaterial : bodyMaterial);

  const arms = [-1, 1].map((side) => {
    const pivot = new TransformNode(`npc-${visitor.id}-arm-${side}`, scene);
    pivot.parent = root;
    pivot.position.set(side * 0.31, 1.4, 0);
    createPart(scene, root, `npc-${visitor.id}-arm-${side}-mesh`,
      MeshBuilder.CreateCylinder("", { height: 0.52, diameter: 0.15, tessellation: 5 }, scene),
      new Vector3(0, -0.27, 0), bodyMaterial).parent = pivot;
    return pivot;
  });
  const legs = [-1, 1].map((side) => {
    const pivot = new TransformNode(`npc-${visitor.id}-leg-${side}`, scene);
    pivot.parent = root;
    pivot.position.set(side * 0.14, 0.6, 0);
    createPart(scene, root, `npc-${visitor.id}-leg-${side}-mesh`,
      MeshBuilder.CreateCylinder("", { height: 0.62, diameter: 0.17, tessellation: 5 }, scene),
      new Vector3(0, -0.29, 0), darkMaterial).parent = pivot;
    return pivot;
  });

  if (visitor.role === "tank") {
    const shield = MeshBuilder.CreateCylinder("", { height: 0.13, diameter: 0.48, tessellation: 6 }, scene);
    shield.rotation.x = Math.PI / 2;
    createPart(scene, root, `npc-${visitor.id}-shield`, shield, new Vector3(-0.43, 0.96, 0.15), trimMaterial);
  } else if (visitor.role === "DPS") {
    const sword = MeshBuilder.CreateBox("", { width: 0.08, height: 0.72, depth: 0.09 }, scene);
    sword.rotation.z = -0.38;
    createPart(scene, root, `npc-${visitor.id}-sword`, sword, new Vector3(0.45, 1.02, 0.05), trimMaterial);
  } else {
    const staff = MeshBuilder.CreateCylinder("", { height: 1.3, diameter: 0.07, tessellation: 5 }, scene);
    createPart(scene, root, `npc-${visitor.id}-staff`, staff, new Vector3(-0.43, 0.98, 0.05), trimMaterial);
    createPart(scene, root, `npc-${visitor.id}-staff-orb`,
      MeshBuilder.CreateSphere("", { diameter: 0.2, segments: 6 }, scene),
      new Vector3(-0.43, 1.64, 0.05), bodyMaterial);
  }

  const label = MeshBuilder.CreatePlane(`npc-${visitor.id}-label`, { width: 1.8, height: 0.44 }, scene);
  label.parent = root;
  label.position.y = 2.3;
  label.billboardMode = Mesh.BILLBOARDMODE_ALL;
  label.isPickable = false;
  label.checkCollisions = false;
  const texture = new DynamicTexture(`npc-${visitor.id}-label-texture`, { width: 512, height: 128 }, scene, false);
  texture.hasAlpha = true;
  texture.drawText(`${visitor.name} · ${visitor.role}`, null, 86, "bold 38px sans-serif", "#fff1d1", "#211910", true);
  const labelMaterial = material(scene, `npc-${visitor.id}-label-material`, Color3.White());
  labelMaterial.diffuseTexture = texture;
  labelMaterial.emissiveColor = new Color3(0.8, 0.8, 0.8);
  labelMaterial.disableLighting = true;
  labelMaterial.backFaceCulling = false;
  label.material = labelMaterial;

  const visual: NpcVisual = {
    root, arms, legs, torso, visitor, phase: "entering", route: [], waypoint: 0, slot,
    elapsed: 0, wait: 0, browseSide: Number(visitor.id.replace(/\D/g, "")) % 2 ? -1 : 1, animationTime: 0,
    gateSide: visitor.entranceGate ?? "level4",
    saleTag: null, saleSeconds: 0,
  };
  root.metadata = {
    adventurerId: visitor.id, name: visitor.name, role: visitor.role,
    phase: visual.phase, simulationStatus: visitor.status, gateSide: visual.gateSide,
  };
  return visual;
}

export class NpcVisualSystem {
  private readonly npcs = new Map<string, NpcVisual>();
  private readonly doors: Record<GateSide, Mesh | null>;
  private readonly doorY: Record<GateSide, number> = { level4: DOOR_CLOSED_Y, level6: DOOR_CLOSED_Y };

  constructor(private readonly scene: Scene) {
    this.doors = {
      level4: scene.getMeshByName("level-4-barrier") as Mesh | null,
      level6: scene.getMeshByName("level-6-barrier") as Mesh | null,
    };
    scene.onBeforeRenderObservable.add(this.update);
  }

  reconcile(current: readonly VisitorSnapshot[], previous: readonly VisitorSnapshot[]): void {
    const changes = reconcileVisitors(previous, current);
    const currentById = new Map(current.map((visitor) => [visitor.id, visitor]));
    for (const [id, visual] of this.npcs) {
      if (!currentById.has(id) || currentById.get(id)?.status === "dead") this.dispose(visual);
    }
    const usedSlots = new Set([...this.npcs.values()].map(({ slot }) => slot));
    for (const visitor of changes.entering) {
      const existing = this.npcs.get(visitor.id);
      if (existing) {
        existing.visitor = visitor;
        this.beginEntering(existing, existing.slot, false);
      } else {
        let slot = 0;
        while (usedSlots.has(slot)) slot += 1;
        usedSlots.add(slot);
        const lane = (slot % 3 - 1) * 0.55;
        const gate = visitor.entranceGate ?? "level4";
        const visual = createHumanoid(this.scene, visitor, slot, new Vector3(CORRIDOR_X[gate] + lane, 0, CORRIDOR_OUTER_Z));
        this.npcs.set(visitor.id, visual);
        this.beginEntering(visual, slot, true);
      }
    }
    for (const visitor of changes.staying) {
      const visual = this.npcs.get(visitor.id);
      if (visual) {
        visual.visitor = visitor;
        visual.root.metadata.simulationStatus = visitor.status;
        if (visual.phase === "leaving") this.beginEntering(visual, visual.slot, false);
      } else {
        let slot = 0;
        while (usedSlots.has(slot)) slot += 1;
        usedSlots.add(slot);
        const lane = (slot % 3 - 1) * 0.55;
        const gate = visitor.entranceGate ?? "level4";
        const visual = createHumanoid(this.scene, visitor, slot, new Vector3(CORRIDOR_X[gate] + lane, 0, CORRIDOR_OUTER_Z));
        this.npcs.set(visitor.id, visual);
        this.beginEntering(visual, slot, true);
      }
    }
    for (const visitor of changes.leaving) {
      const visual = this.npcs.get(visitor.id);
      if (visual) {
        visual.visitor = currentById.get(visitor.id) ?? visitor;
        visual.root.metadata.simulationStatus = visual.visitor.status;
        this.beginLeaving(visual);
      }
    }
  }

  /** Cosmetic, transient feedback for already-booked purchases. Never writes to GameStore. */
  showSales(receipts: readonly SaleReceipt[]): void {
    for (const [heroId, purchase] of salesByHero(receipts)) {
      const npc = this.npcs.get(heroId);
      if (!npc) continue;
      this.clearSaleTag(npc);
      const tag = MeshBuilder.CreatePlane("npc-sale-" + heroId, { width: 2.1, height: 0.40 }, this.scene);
      tag.parent = npc.root;
      tag.position.y = 2.91;
      tag.billboardMode = Mesh.BILLBOARDMODE_ALL;
      tag.checkCollisions = false;
      tag.isPickable = false;
      const texture = new DynamicTexture("sale-label-" + heroId, { width: 512, height: 120 }, this.scene, false);
      texture.drawText("SOLD " + purchase.units + "  +" + purchase.gold + "g", null, 82,
        "bold 46px sans-serif", "#e8ffb6", "#1d3828", true);
      const saleMaterial = material(this.scene, "sale-material-" + heroId, Color3.White());
      saleMaterial.diffuseTexture = texture;
      saleMaterial.disableLighting = true;
      saleMaterial.emissiveColor = Color3.White();
      saleMaterial.backFaceCulling = false;
      tag.material = saleMaterial;
      npc.saleTag = tag;
      npc.saleSeconds = 8;
      npc.root.metadata.lastSaleGold = purchase.gold;
    }
  }

  private clearSaleTag(npc: NpcVisual): void {
    if (npc.saleTag) {
      const saleMaterial = npc.saleTag.material;
      npc.saleTag.dispose();
      saleMaterial?.dispose(true, true);
      npc.saleTag = null;
    }
    npc.saleSeconds = 0;
  }

  private readonly update = (): void => {
    const delta = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.1);
    const open: Record<GateSide, boolean> = { level4: false, level6: false };
    for (const npc of this.npcs.values()) {
      npc.animationTime += delta;
      if (npc.saleSeconds > 0) {
        npc.saleSeconds -= delta;
        if (npc.saleSeconds <= 0) this.clearSaleTag(npc);
      }
      if (npc.phase === "entering" || npc.phase === "leaving") {
        open[npc.gateSide] = true;
        // A hero switched to an L6 departure while still physically in the
        // Level 4 approach. Open that gate too until they return to the shop.
        if (npc.root.position.z > CORRIDOR_INNER_Z && npc.root.position.x < 0) open.level4 = true;
        if (npc.root.position.z > CORRIDOR_INNER_Z && npc.root.position.x > 0) open.level6 = true;
      }
      if (npc.phase === "queueing") {
        npc.wait -= delta;
        if (npc.wait <= 0) this.beginBrowsing(npc);
      } else {
        const isMovingThroughGate = (npc.phase === "entering" || npc.phase === "leaving") &&
          npc.root.position.z > 11.3;
        const physicalSide: GateSide = npc.root.position.x < 0 ? "level4" : "level6";
        if (!isMovingThroughGate || this.doorY[physicalSide] >= DOOR_PASSAGE_CLEAR_Y) {
          this.move(npc, delta);
        }
      }
      this.animate(npc);
    }
    for (const gate of ["level4", "level6"] as const) {
      const target = open[gate] ? DOOR_OPEN_Y : DOOR_CLOSED_Y;
      const y = this.doorY[gate];
      this.doorY[gate] += Math.sign(target - y) * Math.min(Math.abs(target - y), delta * 4);
      if (this.doors[gate]) this.doors[gate]!.position.y = this.doorY[gate];
    }
  };

  private beginEntering(npc: NpcVisual, slot: number, fromOutside: boolean): void {
    npc.slot = slot;
    npc.phase = "entering";
    npc.gateSide = npc.visitor.entranceGate ?? "level4";
    const x = npc.root.position.x;
    const gateX = CORRIDOR_X[npc.gateSide];
    // Never cut across the physical corridor-end wall if a previous departure
    // animation is interrupted by a later day tick.
    npc.route = fromOutside
      ? [new Vector3(x, 0, CORRIDOR_INNER_Z)]
      : [new Vector3(x, 0, CORRIDOR_INNER_Z), new Vector3(gateX, 0, CORRIDOR_INNER_Z)];
    npc.waypoint = 0;
    npc.wait = 0;
    npc.root.metadata.phase = npc.phase;
    npc.root.metadata.gateSide = npc.gateSide;
    npc.root.metadata.simulationStatus = npc.visitor.status;
  }

  private beginLeaving(npc: NpcVisual): void {
    npc.phase = "leaving";
    npc.gateSide = npc.visitor.status === "expedition" ? "level6" : "level4";
    const gateX = CORRIDOR_X[npc.gateSide];
    // Route through the navigable inner shop (z=6.0) before crossing between
    // left/right corridors. No lateral travel through end walls at z > 7.
    npc.route = [
      new Vector3(npc.root.position.x, 0, CORRIDOR_INNER_Z),
      new Vector3(gateX, 0, CORRIDOR_INNER_Z),
      new Vector3(gateX, 0, CORRIDOR_OUTER_Z),
    ];
    npc.waypoint = 0;
    npc.root.metadata.phase = npc.phase;
    npc.root.metadata.gateSide = npc.gateSide;
  }

  private beginBrowsing(npc: NpcVisual): void {
    npc.phase = "browsing";
    const queue = this.queuePosition(npc.slot);
    const side = npc.browseSide;
    const aisleX = side < 0 ? -4.65 : 4.65;
    const frontX = side < 0 ? -2.4 : 2.4;
    const shelfZ = ((npc.slot % 3) - 1) * 1.35;
    npc.route = [
      new Vector3(frontX, 0, queue.z),
      new Vector3(aisleX, 0, 3.55),
      new Vector3(aisleX, 0, shelfZ),
      new Vector3(aisleX, 0, 3.55),
      new Vector3(frontX, 0, 3.55),
      queue,
    ];
    npc.waypoint = 0;
    npc.browseSide *= -1;
    npc.root.metadata.phase = npc.phase;
  }

  private queuePosition(slot: number): Vector3 {
    const column = slot % 4;
    const row = Math.floor(slot / 4);
    return new Vector3(-1.05 + column * 0.7, 0, 3.65 + row * 0.58);
  }

  private move(npc: NpcVisual, delta: number): void {
    const target = npc.route[npc.waypoint];
    if (!target) {
      if (npc.phase === "entering") {
        this.beginBrowsing(npc);
      } else if (npc.phase === "browsing") {
        npc.phase = "queueing";
        npc.wait = 1 + (npc.slot % 3) * 0.45;
        npc.root.metadata.phase = npc.phase;
      } else if (npc.phase === "leaving") {
        this.dispose(npc);
      }
      return;
    }
    const dx = target.x - npc.root.position.x;
    const dz = target.z - npc.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.04) {
      npc.root.position.x = target.x;
      npc.root.position.z = target.z;
      npc.waypoint += 1;
      return;
    }
    npc.root.rotation.y = Math.atan2(dx, dz);
    const step = Math.min(distance, WALK_SPEED * delta);
    npc.root.position.x += dx / distance * step;
    npc.root.position.z += dz / distance * step;
  }

  private animate(npc: NpcVisual): void {
    const walking = npc.phase === "entering" || npc.phase === "leaving" ||
      (npc.phase === "browsing" && npc.route[npc.waypoint] !== undefined);
    const amplitude = walking ? 0.65 : 0.08;
    const swing = Math.sin(npc.animationTime * (walking ? 8 : 2)) * amplitude;
    npc.legs[0].rotation.x = swing;
    npc.legs[1].rotation.x = -swing;
    npc.arms[0].rotation.x = -swing * 0.7;
    npc.arms[1].rotation.x = swing * 0.7;
    npc.torso.position.y = 1.14 + Math.sin(npc.animationTime * 2) * (walking ? 0.025 : 0.01);
    npc.root.position.y = 0.6 * Math.cos(swing) - 0.6;
  }

  private dispose(npc: NpcVisual): void {
    this.clearSaleTag(npc);
    npc.root.dispose(false, true);
    this.npcs.delete(npc.visitor.id);
  }
}
