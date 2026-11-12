import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { DungeonSurfaces } from "./dungeonSurfaces";

/**
 * The merchant's private cell, built entirely from lightweight procedural
 * geometry.  Its structural walls and bed retain the exact original collision
 * footprint; every piece of decoration is non-colliding and unpickable.
 */
export function buildBedroom(scene: Scene, surfaces: DungeonSurfaces): Mesh {
  const iron = new Color3(0.14, 0.145, 0.14);
  const linen = new Color3(0.36, 0.32, 0.25);
  const fabric = new Color3(0.18, 0.205, 0.17);

  const mats = new Map<string, StandardMaterial>();
  function mat(name: string, color: Color3, emissive?: Color3) {
    let result = mats.get(name);
    if (!result) {
      result = new StandardMaterial("bedroom-" + name + "-material", scene);
      result.diffuseColor = color;
      result.specularColor = new Color3(0.035, 0.03, 0.02);
      // Warm, low indirect bounce in a room otherwise swallowed by the cave fog.
      result.emissiveColor = emissive ?? color.scale(0.12);
      mats.set(name, result);
    }
    return result;
  }
  function cube(name: string, width: number, height: number, depth: number,
    x: number, y: number, z: number, surface: StandardMaterial, solid = false): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.material = surface;
    mesh.checkCollisions = solid;
    mesh.isPickable = false;
    return mesh;
  }
  function round(name: string, diameter: number, height: number,
    x: number, y: number, z: number, surface: StandardMaterial, sides = 9) {
    const mesh = MeshBuilder.CreateCylinder(name, {
      height, diameter, tessellation: sides,
    }, scene);
    mesh.position.set(x, y, z);
    mesh.material = surface;
    mesh.checkCollisions = false;
    mesh.isPickable = false;
    return mesh;
  }
  const wall = surfaces.stone;
  const masonry = surfaces.stone;
  const stoneHighlight = surfaces.stoneAccent;
  const timber = surfaces.wood;
  const wornEdges = surfaces.woodEdge;
  const metal = mat("black-iron", iron);
  const mattress = mat("mattress", linen);
  const quilt = mat("quilt", fabric);
  const foldedQuilt = mat("quilt-folds", new Color3(0.23, 0.24, 0.195));
  const leather = mat("leather", new Color3(0.24, 0.16, 0.105));
  const wax = mat("wax", new Color3(0.64, 0.5, 0.29), new Color3(0.1, 0.055, 0.016));
  const fire = mat("flame", new Color3(0.93, 0.48, 0.115), new Color3(1.0, 0.48, 0.16));

  // The old back-wall opening and dimensions are intentional. Moving these
  // would invalidate navigation, save positions and the bed's hold-E reach.
  cube("bedroom-door-left-pier", 1.3, 4, 0.4, -1.85, 2, -7, wall, true);
  cube("bedroom-door-right-pier", 1.3, 4, 0.4, 1.85, 2, -7, wall, true);
  // Overlap the entry and rear masonry with thicker side walls so the FPS
  // camera cannot graze a seam and peek into the unrendered cave exterior.
  cube("bedroom-left-wall", 0.85, 4, 6.05, -3.25, 2, -9.68, wall, true);
  cube("bedroom-right-wall", 0.85, 4, 6.05, 3.25, 2, -9.68, wall, true);
  cube("bedroom-rear-wall", 6.9, 4, 0.65, 0, 2, -12.35, wall, true);
  const flagstone = surfaces.floor;
  cube("bedroom-floor-skin", 6.05, 0.025, 5.08, 0, 0.012, -9.68, flagstone);
  // Thin offset slabs interrupt the uninterrupted cube-floor silhouette.
  for (let i = 0; i < 12; i++) {
    const x = -2.42 + (i % 4) * 1.52;
    const z = -8.01 - Math.floor(i / 4) * 1.72;
    const slab = cube("bedroom-flagstone-" + i, 1.43, 0.025, 1.58,
      x, 0.034, z, i % 3 === 0 ? stoneHighlight : masonry);
    slab.rotation.y = ((i % 3) - 1) * 0.018;
  }
  // Jagged, irregular stone insets are kept to the edges; the middle aisle
  // and the 2.4 m door are deliberately clear.
  for (let i = 0; i < 22; i++) {
    const left = i % 2 === 0;
    const offset = Math.floor(i / 2);
    const z = -7.59 - (offset % 11) * 0.40;
    const x = (left ? -1 : 1) * (3.10 - (offset % 3) * 0.025);
    const mesh = MeshBuilder.CreateIcoSphere("bedroom-rock-rib-" + i,
      { radius: 0.5, subdivisions: 1, flat: true }, scene);
    mesh.position.set(x, 0.78 + ((offset * 7) % 8) * 0.38, z);
    mesh.scaling.set(0.27, 0.56 + (offset % 3) * 0.09, 0.31);
    mesh.rotation.set(offset * 0.24, offset * 0.48, offset * 0.17);
    mesh.material = offset % 3 === 0 ? stoneHighlight : masonry;
    mesh.checkCollisions = false;
    mesh.isPickable = false;
  }
  for (let i = 0; i < 9; i++) {
    const x = -2.6 + i * 0.65;
    const mesh = MeshBuilder.CreateIcoSphere("bedroom-rear-rock-" + i,
      { radius: 0.5, subdivisions: 1, flat: true }, scene);
    mesh.position.set(x, 2.15 + (i % 3) * 0.38, -12.06);
    mesh.scaling.set(0.44, 0.55 + (i % 2) * 0.24, 0.23);
    mesh.rotation.y = i * 0.47;
    mesh.material = i % 3 === 0 ? stoneHighlight : masonry;
    mesh.isPickable = false;
  }
  // The doorway gains lintels and worn side frames, rather than an unrelated
  // new wall which could block the player.
  cube("bedroom-door-lintel", 3.48, 0.47, 0.46, 0, 3.72, -6.96, masonry, true);
  for (const side of [-1, 1]) {
    cube("bedroom-door-jamb-" + side, 0.22, 2.75, 0.27,
      side * 1.18, 1.48, -6.75, wornEdges, true);
  }
  cube("bedroom-roof-beam", 6.05, 0.25, 0.32, 0, 3.37, -11.46, timber);
  cube("bedroom-roof-beam-front", 6.05, 0.19, 0.29, 0, 3.52, -8.12, timber);

  // A bed patched up over centuries. Galvik's mattress stays named and
  // pickable for the existing interaction system and retains its collider.
  cube("bed-frame", 1.70, 0.38, 2.25, 0.8, 0.35, -10.6, timber, true);
  const bed = cube("galvik-bed", 1.50, 0.22, 1.95, 0.8, 0.59, -10.6, mattress, true);
  bed.metadata = { kind: "bed" };
  bed.isPickable = true;
  cube("bed-headboard", 1.72, 0.95, 0.22, 0.8, 0.70, -11.78, wornEdges, true);
  cube("bed-footboard", 1.7, 0.50, 0.14, 0.8, 0.50, -9.42, timber);
  for (const side of [-1, 1]) {
    const x = 0.8 + side * 0.79;
    cube("bed-frame-rail-" + side, 0.11, 0.16, 2.13,
      x, 0.55, -10.6, wornEdges);
    for (const [index, z] of [-11.67, -9.52].entries()) {
      cube("bed-post-" + side + "-" + index, 0.13,
        index === 0 ? 1.36 : 0.78, 0.13,
        x, index === 0 ? 0.68 : 0.39, z, timber);
      const stud = round("bed-post-stud-" + side + "-" + index,
        0.15, 0.05, x, index === 0 ? 1.39 : 0.80, z, metal, 6);
      stud.rotation.z = Math.PI / 2;
    }
  }
  // Quilt stays above the mattress, with sewn folds instead of one flat lid.
  cube("bed-blanket", 1.44, 0.067, 1.13, 0.8, 0.745, -10.10, quilt);
  for (let i = 0; i < 7; i++) {
    cube("bed-quilt-seam-" + i, 1.32, 0.014, 0.019,
      0.8, 0.783, -9.60 - i * 0.15, i % 2 ? quilt : foldedQuilt);
  }
  cube("bed-blanket-fold", 1.44, 0.085, 0.21,
    0.8, 0.783, -10.57, foldedQuilt);
  const pillow = cube("bed-pillow", 1.10, 0.14, 0.40,
    0.8, 0.753, -11.34, mattress);
  pillow.rotation.y = 0.07;

  // Collision shapes for entire furniture groups, NOT every candlewick,
  // quill and chest hinge. Invisible solid hulls prevent the player from
  // walking through books, chest and candle while preserving clean FPS motion.
  // They must never steal the bed's interaction ray.
  function furnitureCollider(name: string, width: number, height: number, depth: number,
    x: number, y: number, z: number): void {
    const hull = cube("bedroom-furniture-collider-" + name,
      width, height, depth, x, y, z, timber, true);
    hull.visibility = 0;
    hull.isPickable = false;
  }
  // The bed itself already owns its physical footprint and E interaction.
  // Keep a broad 0.9m central aisle between the three furniture groups.
  furnitureCollider("chest", 1.04, 1.42, 0.72, -2.15, 0.73, -11.30);
  furnitureCollider("desk", 1.18, 1.60, 0.76, -2.27, 0.82, -9.08);
  furnitureCollider("candle-stool", 0.66, 1.39, 0.66, 2.27, 0.72, -10.95);

  // Battered storage chest, bronze hardware, debt book and ink.
  cube("galvik-bed-chest", 0.95, 0.70, 0.55, -2.15, 0.36, -11.30, timber);
  cube("bed-chest-lid", 1.02, 0.10, 0.63, -2.15, 0.75, -11.30, wornEdges);
  for (const z of [-11.52, -11.08]) {
    cube("bed-chest-strap-" + z, 0.09, 0.71, 0.09, -2.15, 0.39, z, metal);
  }
  cube("bed-chest-lock", 0.16, 0.16, 0.04, -2.15, 0.49, -10.995, metal);

  // An improvised accounting desk. Nothing here is a buyable shop prop.
  cube("bedroom-desk", 1.17, 0.12, 0.72, -2.27, 0.95, -9.08, wornEdges);
  for (const x of [-2.72, -1.83]) {
    for (const z of [-9.34, -8.83]) {
      cube("bedroom-desk-leg-" + x + "-" + z, 0.105, 0.84, 0.105,
        x, 0.45, z, timber);
    }
  }
  cube("bedroom-account-book", 0.65, 0.075, 0.41, -2.28, 1.065, -9.15, leather);
  cube("bedroom-account-pages", 0.58, 0.018, 0.36, -2.28, 1.114, -9.15, mattress);
  cube("bedroom-account-spine", 0.055, 0.12, 0.43, -2.62, 1.06, -9.15, metal);
  round("bedroom-inkwell", 0.15, 0.18, -1.93, 1.095, -8.87, metal);
  const quill = cube("bedroom-quill", 0.025, 0.025, 0.51, -1.89, 1.20, -9.05, mattress);
  quill.rotation.y = -0.41;

  // Small bedside stool and physically placed candle, not a floating flame.
  cube("bed-side-stool", 0.50, 0.54, 0.50, 2.27, 0.29, -10.95, timber);
  cube("bed-side-stool-top", 0.59, 0.075, 0.59, 2.27, 0.60, -10.95, wornEdges);
  round("bed-candle-holder", 0.28, 0.055, 2.25, 0.68, -10.95, metal);
  round("bed-candle", 0.13, 0.28, 2.25, 0.84, -10.95, wax);
  const flame = MeshBuilder.CreateSphere("bed-candle-flame",
    { diameter: 0.10, segments: 8 }, scene);
  flame.position.set(2.25, 1.025, -10.95);
  flame.scaling.set(0.72, 1.52, 0.72);
  flame.material = fire;
  flame.isPickable = false;
  const candleLight = new PointLight("galvik-bed-candle", new Vector3(2.25, 1.15, -10.95), scene);
  candleLight.diffuse = new Color3(1, 0.55, 0.26);
  candleLight.intensity = 2.25;
  candleLight.range = 7;
  // Secondary torch by the doorway fills the dark stone without washing the
  // entire shop in uniform ambient light.
  cube("bedroom-door-torch-bracket", 0.40, 0.12, 0.21,
    -2.70, 2.47, -7.54, metal);
  round("bedroom-door-torch", 0.18, 0.72, -2.70, 2.83, -7.54, wornEdges);
  const torchTip = MeshBuilder.CreateSphere("bedroom-torch-flame",
    { diameter: 0.19, segments: 7 }, scene);
  torchTip.position.set(-2.70, 3.26, -7.54);
  torchTip.scaling.y = 1.48;
  torchTip.material = fire;
  torchTip.isPickable = false;
  const light = new PointLight("bedroom-door-torch-light", torchTip.position, scene);
  light.diffuse = new Color3(1, 0.37, 0.15);
  light.intensity = 1.55;
  light.range = 6.5;
  // A tiny deterministic candle shimmer is cheap and needs no timer.
  scene.onBeforeRenderObservable.add(() => {
    const seconds = performance.now() * 0.001;
    candleLight.intensity = 2.23 + Math.sin(seconds * 4.7) * 0.09
      + Math.sin(seconds * 9.1) * 0.035;
    light.intensity = 1.52 + Math.sin(seconds * 5.3) * 0.075;
    flame.scaling.y = 1.44 + Math.sin(seconds * 6.8) * 0.12;
  });

  // Uneven tally cuts, like someone has been counting far too many nights.
  const scratches = mat("tally", new Color3(0.46, 0.34, 0.23),
    new Color3(0.035, 0.022, 0.009));
  cube("bedroom-tally-board", 1.20, 0.95, 0.10, -1.5, 2.17, -12.10, timber);
  for (let group = 0; group < 3; group++) {
    for (let line = 0; line < 4; line++) {
      const cut = cube("bedroom-tally-mark-" + group + "-" + line,
        0.019, 0.33, 0.016, -1.92 + group * 0.42 + line * 0.079,
        2.24 - group * 0.055, -12.024, scratches);
      cut.rotation.z = ((line + group) % 3 - 1) * 0.06;
    }
    const diagonal = cube("bedroom-tally-strike-" + group,
      0.021, 0.42, 0.018, -1.80 + group * 0.42,
      2.24 - group * 0.055, -12.005, scratches);
    diagonal.rotation.z = 1.05;
  }
  // A note, pinned on the other side of the wall. This is story dressing,
  // not a gameplay counter, so it deliberately contains no changing numbers.
  const note = MeshBuilder.CreatePlane("bedroom-debt-note",
    { width: 0.91, height: 0.60 }, scene);
  // Put the lettering in front of the rocky insets, not through them.
  note.position.set(1.93, 2.14, -11.79);
  // Babylon planes face -Z by default; turn the writing toward the shop door.
  note.rotation.y = Math.PI;
  const paper = new DynamicTexture("bedroom-debt-note-texture",
    { width: 512, height: 336 }, scene, false);
  paper.drawText("DEBTS OUTLIVE", null, 128, "bold 43px monospace",
    "#39251b", "#ac9473", true);
  paper.drawText("THE DEAD", null, 225, "bold 53px monospace",
    "#39251b", null, true);
  const paperMat = new StandardMaterial("bedroom-debt-note-material", scene);
  paperMat.diffuseTexture = paper;
  paperMat.backFaceCulling = false;
  paperMat.emissiveColor = new Color3(0.07, 0.046, 0.024);
  note.material = paperMat;
  note.isPickable = false;
  round("bedroom-debt-note-pin", 0.07, 0.04, 1.93, 2.44, -11.74, metal, 7);

  // Scattered rubble stays near the edges and never becomes a collision trap.
  for (let i = 0; i < 12; i++) {
    const left = i % 2 === 0;
    const r = MeshBuilder.CreateIcoSphere("bedroom-fallen-stone-" + i,
      { radius: 0.16, subdivisions: 1, flat: true }, scene);
    r.position.set((left ? -1 : 1) * (2.56 + (i % 3) * 0.12),
      0.11, -7.65 - Math.floor(i / 2) * 0.78);
    r.scaling.set(0.85 + (i % 3) * 0.18, 0.33, 0.65 + (i % 2) * 0.17);
    r.rotation.y = i * 1.7;
    r.material = i % 4 === 0 ? stoneHighlight : masonry;
    r.isPickable = false;
  }

  return bed;
}
