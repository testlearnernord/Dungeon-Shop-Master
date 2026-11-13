import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { GameStore } from "./game/gameStore.ts";
import { locationLabel, portraitIndex, rosterEntries, type RosterFilter } from "./game/rosterView.ts";
import { ECONOMY } from "./game/economy.ts";
import { heroDisplayNames } from "./game/heroIdentity.ts";
import {itemIcon,uiIcon,goldIcon} from "./uiIcons.ts";
import {portraitCssFrame} from "./game/portraitAtlas.ts";

export function setupRosterBoardHud(
  canvas: HTMLCanvasElement, camera: UniversalCamera, store: GameStore,
): () => void {
  const dialog = document.querySelector<HTMLDialogElement>("#roster-dialog")!;
  const list = document.querySelector<HTMLElement>("#roster-detail-list")!;
  const totals = document.querySelector<HTMLElement>("#roster-totals")!;
  const filter = document.querySelector<HTMLSelectElement>("#roster-filter")!;
  const close = document.querySelector<HTMLButtonElement>("#close-roster")!;
  const openButton = document.querySelector<HTMLButtonElement>("#open-roster")!;
  let filterValue: RosterFilter = "active";

  function render(): void {
    const state = store.state;
    const active = state.adventurers.filter((hero) => hero.status !== "dead").length;
    const fallen = state.adventurers.length - active;
    totals.textContent = active + " active · " + fallen + " fallen · Day " + state.day +
      (filterValue === "fallen" && fallen > 40 ? " · Showing latest 40" : "");
    const expanded = new Set([...list.querySelectorAll<HTMLDetailsElement>("details[open][data-hero-id]")]
      .map((node) => node.dataset.heroId));
    const heroes = rosterEntries(state, filterValue);
    const names = heroDisplayNames(state.adventurers);
    list.replaceChildren(...heroes.map((hero) => {
      const card = document.createElement("details");
      card.className = "roster-card";
      card.dataset.heroId = hero.id;
      card.dataset.status = hero.status;
      card.open = expanded.has(hero.id);
      const summary = document.createElement("summary");
      const portrait = document.createElement("span");
      portrait.className = "roster-portrait roster-role-" + hero.role.toLowerCase();
      const index = portraitIndex(hero.id);
      portrait.dataset.portraitId = String(index);
      portrait.style.backgroundImage = "url('" + import.meta.env.BASE_URL + "assets/hero-portraits.webp')";
      Object.assign(portrait.style,portraitCssFrame(index));
      portrait.setAttribute("aria-hidden", "true");
      const primary = document.createElement("span");
      primary.className = "roster-card-primary";
      const name = document.createElement("strong");
      name.textContent = (names.get(hero.id) ?? hero.name) + " · Lv " + hero.level + " " + hero.role;
      const location = document.createElement("small");
      location.textContent = locationLabel(hero) + " · " + hero.status;
      const bar = document.createElement("span");
      bar.className = "roster-hp";
      bar.setAttribute("role", "meter");
      bar.setAttribute("aria-label", (names.get(hero.id) ?? hero.name) + " hit points");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(hero.stats.maxHealth));
      bar.setAttribute("aria-valuenow", String(hero.health));
      const fill = document.createElement("span");
      fill.style.width = (100 * hero.health / hero.stats.maxHealth) + "%";
      bar.append(fill);
      const overview = document.createElement("span");
      overview.className = "roster-overview";
      overview.append(
        goldIcon(),document.createTextNode(" "+hero.gold+"g  ·  "),
        uiIcon("food"),document.createTextNode(" "+(hero.hunger>=3?"Hungry":"Fed")+
          "  ·  "+hero.inventory.food+" food  ·  "+hero.inventory.healing+" heal"),
      );
      primary.append(name, location, bar, overview);
      const health = document.createElement("span");
      health.className = "roster-hp-value";
      health.textContent = hero.health + "/" + hero.stats.maxHealth;
      summary.append(portrait, primary, health);
      const extended = document.createElement("div");
      extended.className = "roster-card-extended";
      const stats = document.createElement("p");
      stats.textContent = "F" + hero.floor + " · XP " + hero.xp + " · Gold " + hero.gold +
        "g · Hunger " + hero.hunger +
        " · Missed food shops " + hero.missedFoodShopVisits + "/" + ECONOMY.missedFoodShopsBeforeStarvation +
        " · STR " + hero.stats.strength +
        " / AGI " + hero.stats.agility + " / INT " + hero.stats.intellect;
      const traits = document.createElement("p");
      traits.textContent = "Traits: " + hero.traits.positive + " / " + hero.traits.neutral + " / " + hero.traits.negative;
      const items = document.createElement("p");
      items.className = "roster-items";
      const itemChip = (id: string, text: string): HTMLElement => {
        const chip = document.createElement("span");
        chip.className = "roster-item-chip";
        chip.title=text;
        const label=document.createElement("span");
        label.textContent=text;
        chip.append(itemIcon(id,"roster-item-icon"),label);
        return chip;
      };
      items.append(
        itemChip("iron-sword",hero.equipment.weapon??"No weapon"),
        itemChip("leather-vest",hero.equipment.armor??"No armor"),
        itemChip("bread","Food "+hero.inventory.food),
        itemChip("healing-herb","Healing "+hero.inventory.healing),
        itemChip("iron-ore","Loot "+hero.inventory.loot),
      );
      extended.append(stats, traits, items);
      if (hero.status === "at-shop") {
        const permit = document.createElement("button");
        permit.type = "button";
        permit.className = "roster-permit";
        permit.setAttribute("aria-pressed", String(hero.level6Permit));
        permit.textContent = hero.level6Permit ? "Revoke Level 6 permit" : "Grant Level 6 permit";
        permit.addEventListener("click", () => {
          store.setLevel6Permit(hero.id, !hero.level6Permit);
          [...list.querySelectorAll<HTMLDetailsElement>("details[data-hero-id]")]
            .find((entry) => entry.dataset.heroId === hero.id)
            ?.querySelector<HTMLButtonElement>(".roster-permit")?.focus();
        });
        extended.append(permit);
      } else if (hero.level6Permit && hero.status !== "dead") {
        const permitted = document.createElement("p");
        permitted.textContent = "Level 6 permit: granted";
        extended.append(permitted);
      }
      card.append(summary, extended);
      return card;
    }));
    if (!heroes.length) {
      const empty = document.createElement("p");
      empty.textContent = filterValue === "fallen" ? "No fallen adventurers yet." : "No active adventurers.";
      list.append(empty);
    }
  }

  function openRoster(): void {
    if (dialog.open || document.querySelector("dialog[open]")) return;
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
    camera.detachControl();
    render();
    dialog.showModal();
  }
  function closeRoster(): void { if (dialog.open) dialog.close(); }
  dialog.addEventListener("close", () => camera.attachControl(canvas, true));
  close.addEventListener("click", closeRoster);
  openButton.addEventListener("click", openRoster);
  filter.addEventListener("change", () => {
    filterValue = filter.value === "fallen" ? "fallen" : "active";
    render();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyR" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (document.body.classList.contains("blueprint-active")) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (dialog.open) closeRoster();
    else if (!document.querySelector("dialog[open]")) openRoster();
  });
  store.subscribe(render);
  render();
  return openRoster;
}
