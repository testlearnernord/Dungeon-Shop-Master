import { GameStore } from "./game/gameStore";
import { level6ReturnIds, type VisitorSnapshot } from "./game/npcVisitors";
import { heroDisplayNames } from "./game/heroIdentity.ts";
import { hasObservedReplay } from "./replayDisclosure.ts";

export function setupDayHud(
  canvas: HTMLCanvasElement,
  store: GameStore,
  onVisitorsChanged: (current: readonly VisitorSnapshot[], previous: readonly VisitorSnapshot[]) => void = () => {},
  onConfirmedDay: () => void = () => {},
): {endDayFromBed:()=>void} {
  const day = document.querySelector<HTMLElement>("#day");
  const events = document.querySelector<HTMLOListElement>("#world-events");
  const roster = document.querySelector<HTMLUListElement>("#adventurer-roster");
  const visitors = document.querySelector<HTMLElement>("#shop-visitors");
  const population = document.querySelector<HTMLElement>("#population-summary");
  if (!day || !events || !roster || !visitors || !population) {
    throw new Error("The day clock HUD must exist before the game starts.");
  }

  const history = document.querySelector<HTMLOListElement>("#day-history")!;
  const snapshotVisitors = (): readonly VisitorSnapshot[] => {
    const state = store.state;
    const fromLevel6 = level6ReturnIds(state.events, state.day);
    const names = heroDisplayNames(state.adventurers);
    return state.adventurers.filter(({ status }) => status !== "dead").map(({ id, name, role, level, status, equipment, gold, health, stats, hunger, inventory }) => ({
      id, name, role, level, status, equipment, gold, health,
      maxHealth:stats.maxHealth,hunger, food: inventory.food,
      displayName: names.get(id) ?? name,
      entranceGate: fromLevel6.has(id) ? "level6" as const : "level4" as const,
    }));
  };
  let previousVisitors: readonly VisitorSnapshot[] = [];

  const render = (): void => {
    const state = store.state;
    day.textContent = `Day ${state.day}`;
    const visibleMessage=(event:typeof state.events[number]):string=>
      (event.type==="level6-combat"||event.type==="level7-exploration") &&
        !hasObservedReplay(event.id)
        ? "An expedition recording has been sealed. Watch the saved footage to learn its outcome."
        : event.message;
    events.replaceChildren(...state.events.slice(-3).map((event) => {
      const entry = document.createElement("li");
      entry.dataset.eventId = event.id;
      entry.textContent = visibleMessage(event);
      return entry;
    }));
    const today = [];
    for (let index = state.events.length - 1; index >= 0 && today.length < 100; index -= 1) {
      const event = state.events[index];
      if (event.day !== state.day) break;
      today.push(event);
    }
    history.replaceChildren(...today.reverse().map((event) => {
      const entry = document.createElement("li");
      entry.textContent = visibleMessage(event);
      return entry;
    }));
    const names = heroDisplayNames(state.adventurers);
    const active = state.adventurers.filter((hero) => hero.status !== "dead");
    const atShop = active.filter((hero) => hero.status === "at-shop");
    population.textContent = `Adventurers: ${active.length} active · ${state.adventurers.length - active.length} lost`;
    population.dataset.short=active.length+" active";
    population.setAttribute("aria-label",population.textContent);
    visitors.textContent = `Shop visitors (${atShop.length}): ${atShop.map((hero) => names.get(hero.id) ?? hero.name).join(", ") || "none"}`;
    visitors.dataset.short=atShop.length+" in shop";
    visitors.title=visitors.textContent;
    visitors.setAttribute("aria-label",visitors.textContent);
    roster.replaceChildren(...active.map((hero) => {
      const entry = document.createElement("li");
      entry.dataset.adventurerId = hero.id;
      entry.dataset.status = hero.status;
      const summary = document.createElement("span");
      summary.className = "hero-summary";
      summary.textContent = `${names.get(hero.id) ?? hero.name} · ${hero.role} · Lv ${hero.level} · HP ${hero.health}/${hero.stats.maxHealth} · F${hero.floor} ${hero.status} · Hunger ${hero.hunger} · Food ${hero.inventory.food}`;
      entry.append(summary);
      if (hero.status === "at-shop") {
        const permission = document.createElement("button");
        permission.type = "button";
        permission.className = "level6-permit";
        permission.dataset.adventurerId = hero.id;
        permission.setAttribute("aria-pressed", String(hero.level6Permit));
        permission.textContent = hero.level6Permit ? "Revoke L6 pass" : "Grant L6 pass";
        permission.title = "Approve this hero's Level 6 departure on the next confirmed day. Combat resolves one day later.";
        permission.addEventListener("click", () => {
          store.setLevel6Permit(hero.id, !hero.level6Permit);
        });
        entry.append(" ", permission);
      }
      entry.title = `${hero.id} · XP ${hero.xp} · Gold ${hero.gold} · ${hero.traits.positive} / ${hero.traits.neutral} / ${hero.traits.negative} · Hunger ${hero.hunger} · Food ${hero.inventory.food}`;
      return entry;
    }));
  };

  let previousAdventurers = store.state.adventurers;
  store.subscribe(() => {
    if (store.state.adventurers !== previousAdventurers) {
      const currentVisitors = snapshotVisitors();
      onVisitorsChanged(currentVisitors, previousVisitors);
      previousVisitors = currentVisitors;
      previousAdventurers = store.state.adventurers;
    }
    render();
  });
  window.addEventListener("expedition-observed",render);
  render();
  const initialVisitors = snapshotVisitors();
  onVisitorsChanged(initialVisitors, previousVisitors);
  previousVisitors = initialVisitors;
  return {
    // Only the bed controller invokes this. The modal controls navigation
    // after settlement; neither navigation nor replay can trigger another day.
    endDayFromBed(){
      store.endDay();
      onConfirmedDay();
    },
  };
}
