import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { GameStore } from "./gameStore.ts";
import { locationLabel, portraitIndex, rosterEntries } from "./rosterView.ts";
import { heroDisplayNames } from "./heroIdentity.ts";

/** Read-only projection of the authoritative heroes onto the shop's front wall. */
export function createRosterBoard(scene: Scene, store: GameStore): { mesh: Mesh } {
  const board = MeshBuilder.CreatePlane("adventurer-roster-board", { width: 4.55, height: 2.75 }, scene);
  board.position = new Vector3(0, 2.17, -6.68);
  board.rotation.y = Math.PI;
  board.checkCollisions = false;
  board.isPickable = true;
  board.metadata = { kind: "roster-board" };
  const texture = new DynamicTexture("roster-board-texture", { width: 1024, height: 640 }, scene, false);
  const paint = new StandardMaterial("roster-board-paint", scene);
  paint.diffuseTexture = texture;
  paint.emissiveColor = new Color3(0.85, 0.76, 0.65);
  paint.disableLighting = true;
  paint.backFaceCulling = false;
  board.material = paint;
  const portraits = new Image();
  portraits.src = import.meta.env.BASE_URL + "assets/hero-portraits.webp";
  portraits.addEventListener("load", () => draw());
  const wood = new StandardMaterial("roster-board-wood", scene);
  wood.diffuseColor = new Color3(0.38, 0.23, 0.11);
  for (const [name, w, h, x, y] of [
    ["top", 4.75, 0.12, 0, 3.60], ["bottom", 4.75, 0.12, 0, 0.75],
    ["left", 0.12, 2.8, -2.37, 2.17], ["right", 0.12, 2.8, 2.37, 2.17],
  ] as const) {
    const frame = MeshBuilder.CreateBox("roster-frame-" + name, { width: w, height: h, depth: 0.11 }, scene);
    frame.position.set(x, y, -6.64);
    frame.material = wood;
    frame.isPickable = false;
    frame.checkCollisions = false;
  }
  function draw(): void {
    const state = store.state;
    const ctx = texture.getContext();
    ctx.fillStyle = "#15221c";
    ctx.fillRect(0, 0, 1024, 640);
    ctx.fillStyle = "#dec38a";
    ctx.font = "bold 47px sans-serif";
    ctx.fillText("ADVENTURERS", 45, 66);
    ctx.font = "26px sans-serif";
    ctx.fillText("DAY " + state.day, 780, 66);
    ctx.fillStyle = "#7e5e35";
    ctx.fillRect(44, 83, 930, 4);
    const heroes = rosterEntries(state, "active");
    const labels = heroDisplayNames(state.adventurers);
    ctx.font = "23px sans-serif";
    heroes.slice(0, 9).forEach((hero, i) => {
      const y = 122 + i * 47;
      ctx.fillStyle = i % 2 ? "#223027" : "#29372c";
      ctx.fillRect(38, y - 26, 947, 40);
      ctx.fillStyle = "#f0e4c9";
      const portrait = portraitIndex(hero.id);
      if (portraits.complete && portraits.naturalWidth > 0) {
        const tileWidth = portraits.naturalWidth / 5;
        const tileHeight = portraits.naturalHeight / 5;
        const inset = Math.min(tileWidth, tileHeight) * 0.06;
        ctx.drawImage(portraits, (portrait % 5) * tileWidth + inset, Math.floor(portrait / 5) * tileHeight + inset,
          tileWidth - 2 * inset, tileHeight - 2 * inset, 45, y - 25, 36, 36);
      }
      ctx.font = "bold 21px sans-serif";
      ctx.fillText((labels.get(hero.id) ?? hero.name) + " · Lv" + hero.level + " " + hero.role, 93, y + 1, 238);
      ctx.font = "23px sans-serif";
      ctx.fillStyle = hero.status === "at-shop" ? "#a8e1b8" :
        hero.status === "expedition" ? "#e9ae67" : "#c0bcae";
      ctx.fillText(locationLabel(hero), 345, y + 1);
      ctx.fillStyle = "#352a20";
      ctx.fillRect(756, y - 14, 173, 15);
      ctx.fillStyle = hero.health / hero.stats.maxHealth < 0.3 ? "#d16b55" : "#8ab668";
      ctx.fillRect(756, y - 14, 173 * hero.health / hero.stats.maxHealth, 15);
    });
    ctx.fillStyle = "#c8ae7d";
    ctx.font = "22px sans-serif";
    ctx.fillText(heroes.length > 9 ? "+" + (heroes.length - 9) + " more" : heroes.length + " active", 46, 585);
    ctx.fillText("PRESS E NEARBY OR R ANYWHERE", 525, 605);
    texture.update();
  }
  store.subscribe(draw);
  draw();
  return { mesh: board };
}
