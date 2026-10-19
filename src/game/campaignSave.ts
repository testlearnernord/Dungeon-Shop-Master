import { ECONOMY, ITEMS, createEconomy } from "./economy.ts";
import { SIMULATION_VERSION, type GameState } from "./gameState.ts";

export const SAVE_SCHEMA_VERSION = 1;

export interface SaveEnvelope {
  readonly schemaVersion: 1;
  readonly simulationVersion: number;
  readonly savedAt: string;
  readonly payload: GameState;
}

type RecordValue = Record<string, unknown>;

function fail(path: string, reason: string): never {
  throw new Error(`Invalid campaign save: ${path} ${reason}.`);
}

function object(value: unknown, path: string, required: string[], optional: string[] = []): RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  const record = value as RecordValue;
  for (const key of required) {
    if (!Object.hasOwn(record, key)) fail(`${path}.${key}`, "is required");
  }
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) fail(`${path}.${key}`, "is not supported");
  }
  return record;
}

function integer(value: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(path, `must be a safe integer between ${min} and ${max}`);
  }
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(path, "must be a nonempty string");
  return value;
}

function choice(value: unknown, choices: readonly unknown[], path: string): void {
  if (!choices.includes(value)) fail(path, `must be one of ${choices.join(", ")}`);
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function unique(value: string | number, seen: Set<string | number>, path: string): void {
  if (seen.has(value)) fail(path, "must be unique");
  seen.add(value);
}

const itemIds = ITEMS.map((item) => item.id);
const slotDefinitions = createEconomy().slots;
const eventTypes = [
  "welcome", "day-started", "dungeon-outcome", "shop-arrival", "shop-stay", "shop-departure",
  "influx", "sale", "ate", "healed", "starvation", "rescue",
] as const;

function validateState(value: unknown): asserts value is GameState {
  const state = object(value, "payload", [
    "day", "simulationVersion", "events", "adventurers", "shopEconomy", "dungeonFloors",
    "seed", "rngState", "populationConfig", "nextAdventurerId",
  ]);
  const day = integer(state.day, "payload.day", 1, Number.MAX_SAFE_INTEGER - 1);
  if (state.simulationVersion !== SIMULATION_VERSION) fail("payload.simulationVersion", "is incompatible");
  integer(state.seed, "payload.seed", 0, 0xffffffff);
  integer(state.rngState, "payload.rngState", 0, 0xffffffff);
  const population = object(state.populationConfig, "payload.populationConfig", ["dailyInflux", "maxActive"]);
  integer(population.dailyInflux, "payload.populationConfig.dailyInflux");
  const maxActive = integer(population.maxActive, "payload.populationConfig.maxActive", 10, 100);
  const nextId = integer(state.nextAdventurerId, "payload.nextAdventurerId", 1);
  const heroIds = new Set<string | number>();
  let active = 0;
  array(state.adventurers, "payload.adventurers").forEach((value, index) => {
    const path = `payload.adventurers[${index}]`;
    const hero = object(value, path, [
      "id", "name", "role", "stats", "traits", "level", "xp", "health", "gold",
      "equipment", "inventory", "floor", "status", "hunger", "shopStayDays",
    ]);
    const id = text(hero.id, `${path}.id`);
    const match = /^adventurer-([1-9]\d*)$/.exec(id);
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) >= nextId) {
      fail(`${path}.id`, "must be a canonical adventurer ID below nextAdventurerId");
    }
    unique(id, heroIds, `${path}.id`);
    text(hero.name, `${path}.name`);
    choice(hero.role, ["tank", "DPS", "healer"], `${path}.role`);
    const stats = object(hero.stats, `${path}.stats`, ["strength", "agility", "intellect", "maxHealth"]);
    for (const key of Object.keys(stats)) integer(stats[key], `${path}.stats.${key}`, 1);
    const health = integer(hero.health, `${path}.health`, 0, stats.maxHealth as number);
    const traits = object(hero.traits, `${path}.traits`, ["positive", "neutral", "negative"]);
    for (const key of Object.keys(traits)) text(traits[key], `${path}.traits.${key}`);
    const xp = integer(hero.xp, `${path}.xp`);
    if (integer(hero.level, `${path}.level`, 1) !== 1 + Math.floor(xp / 100)) {
      fail(`${path}.level`, "must agree with XP");
    }
    integer(hero.gold, `${path}.gold`);
    const equipment = object(hero.equipment, `${path}.equipment`, ["weapon", "armor"]);
    for (const key of Object.keys(equipment)) {
      if (equipment[key] !== null) text(equipment[key], `${path}.equipment.${key}`);
    }
    const inventory = object(hero.inventory, `${path}.inventory`, ["loot", "food", "healing"]);
    for (const key of Object.keys(inventory)) integer(inventory[key], `${path}.inventory.${key}`);
    const floor = integer(hero.floor, `${path}.floor`, 1, 5);
    choice(hero.status, ["exploring", "traveling", "at-shop", "returning", "dead"], `${path}.status`);
    if ((hero.status === "dead") !== (health === 0)) fail(`${path}.status`, "must agree with health");
    if (hero.status !== "dead") {
      active += 1;
      if ((hero.status === "at-shop" && floor !== 5) ||
          (hero.status === "exploring" && floor > 4) ||
          ((hero.status === "traveling" || hero.status === "returning") && floor !== 4)) {
        fail(`${path}.floor`, "must agree with status");
      }
    }
    integer(hero.hunger, `${path}.hunger`);
    const stay = integer(hero.shopStayDays, `${path}.shopStayDays`, 0, 1);
    if (stay !== 0 && hero.status !== "at-shop" && hero.status !== "dead") {
      fail(`${path}.shopStayDays`, "requires a shop visit");
    }
  });
  if (active > maxActive) fail("payload.adventurers", "exceeds the active population capacity");

  const economy = object(state.shopEconomy, "payload.shopEconomy", [
    "balance", "bag", "slots", "dailySales", "lastRescueDay",
  ]);
  integer(economy.balance, "payload.shopEconomy.balance");
  const bag = object(economy.bag, "payload.shopEconomy.bag", itemIds);
  let bagTotal = 0;
  for (const id of itemIds) bagTotal += integer(bag[id], `payload.shopEconomy.bag.${id}`, 0, ECONOMY.bagCapacity);
  if (bagTotal > ECONOMY.bagCapacity) fail("payload.shopEconomy.bag", "exceeds bag capacity");
  const slots = array(economy.slots, "payload.shopEconomy.slots");
  if (slots.length !== slotDefinitions.length) fail("payload.shopEconomy.slots", "must contain all ten shelf slots");
  const slotIds = new Set<string | number>();
  slots.forEach((value, index) => {
    const path = `payload.shopEconomy.slots[${index}]`;
    const slot = object(value, path, ["id", "shelfId", "index", "itemId", "quantity", "capacity"]);
    const id = text(slot.id, `${path}.id`);
    unique(id, slotIds, `${path}.id`);
    const definition = slotDefinitions.find((entry) => entry.id === id);
    if (!definition || slot.shelfId !== definition.shelfId || slot.index !== definition.index) {
      fail(path, "has an invalid slot ID, shelf or index");
    }
    if (slot.capacity !== ECONOMY.slotCapacity) fail(`${path}.capacity`, "is incompatible");
    const quantity = integer(slot.quantity, `${path}.quantity`, 0, ECONOMY.slotCapacity);
    choice(slot.itemId, [null, ...itemIds], `${path}.itemId`);
    if ((quantity === 0) !== (slot.itemId === null)) fail(path, "must have an item exactly when stocked");
  });
  const sales = object(economy.dailySales, "payload.shopEconomy.dailySales", ["day", "units", "revenue"]);
  if (sales.day !== day) fail("payload.shopEconomy.dailySales.day", "must match the current day");
  integer(sales.units, "payload.shopEconomy.dailySales.units");
  integer(sales.revenue, "payload.shopEconomy.dailySales.revenue");
  if (economy.lastRescueDay !== null) integer(economy.lastRescueDay, "payload.shopEconomy.lastRescueDay", 1, day);

  const floors = new Set<string | number>();
  array(state.dungeonFloors, "payload.dungeonFloors").forEach((value, index) => {
    const path = `payload.dungeonFloors[${index}]`;
    const floor = object(value, path, ["floor", "cleared"]);
    unique(integer(floor.floor, `${path}.floor`, 1, 5), floors, `${path}.floor`);
    if (typeof floor.cleared !== "boolean") fail(`${path}.cleared`, "must be a boolean");
  });

  const eventIds = new Set<string | number>();
  let lastDay = 1;
  array(state.events, "payload.events").forEach((value, index) => {
    const path = `payload.events[${index}]`;
    const event = object(value, path, ["id", "type", "day", "message"],
      ["adventurerId", "outcome", "itemId", "quantity", "revenue"]);
    choice(event.type, eventTypes, `${path}.type`);
    const eventDay = integer(event.day, `${path}.day`, lastDay, day);
    lastDay = eventDay;
    text(event.message, `${path}.message`);
    const id = text(event.id, `${path}.id`);
    unique(id, eventIds, `${path}.id`);
    const global = ["welcome", "day-started", "rescue"].includes(event.type as string);
    if (!global && !heroIds.has(event.adventurerId as string)) fail(`${path}.adventurerId`, "must link to an existing hero");
    const allowed = ["id", "type", "day", "message", ...(!global ? ["adventurerId"] : [])];
    let suffix = event.type === "day-started" ? "started" : event.type;
    if (event.type === "dungeon-outcome") {
      allowed.push("outcome");
      choice(event.outcome, ["advance", "stay", "retreat", "death"], `${path}.outcome`);
      suffix = "dungeon";
    }
    if (["sale", "ate", "healed", "rescue"].includes(event.type as string)) {
      allowed.push("itemId", "quantity");
      choice(event.itemId, itemIds, `${path}.itemId`);
      integer(event.quantity, `${path}.quantity`, 1,
        event.type === "sale" ? ECONOMY.slotCapacity : event.type === "rescue" ? ECONOMY.rescueQuantity : 1);
      if ((event.type === "ate" || event.type === "rescue") && event.itemId !== "bread") fail(`${path}.itemId`, "must be bread");
      if (event.type === "healed" && event.itemId !== "healing-herb") fail(`${path}.itemId`, "must be healing-herb");
    }
    if (event.type === "sale") {
      allowed.push("revenue");
      const item = ITEMS.find((entry) => entry.id === event.itemId)!;
      if (event.revenue !== item.salePrice * (event.quantity as number)) fail(`${path}.revenue`, "must match item price and quantity");
      const prefix = `day-${eventDay}:${event.adventurerId}:sale:`;
      if (!id.startsWith(prefix) || !slotIds.has(id.slice(prefix.length))) fail(`${path}.id`, "must link to the sale's shelf slot");
    } else {
      const expected = `day-${eventDay}:${global ? "" : `${event.adventurerId}:`}${suffix}`;
      if (id !== expected) fail(`${path}.id`, "must agree with event day, type and hero");
    }
    for (const key of Object.keys(event)) {
      if (!allowed.includes(key)) fail(`${path}.${key}`, "is not valid for this event type");
    }
  });
}

export function createSave(state: GameState): SaveEnvelope {
  validateState(state);
  // Detach at request time, before queued I/O can observe later caller mutations.
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    simulationVersion: SIMULATION_VERSION,
    savedAt: new Date().toISOString(),
    payload: structuredClone(state),
  };
}

export function parseSave(text: string): GameState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid campaign save: malformed JSON.");
  }
  const envelope = object(value, "envelope", ["schemaVersion", "simulationVersion", "savedAt", "payload"]);
  if (envelope.schemaVersion !== SAVE_SCHEMA_VERSION) fail("schemaVersion", "is incompatible; no migrations are available");
  if (envelope.simulationVersion !== SIMULATION_VERSION) fail("simulationVersion", "is incompatible; no migrations are available");
  const savedAt = textTimestamp(envelope.savedAt);
  if (!savedAt) fail("savedAt", "must be an ISO UTC timestamp");
  validateState(envelope.payload);
  return envelope.payload;
}

function textTimestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

export interface CampaignRecords {
  readonly latest: string | null;
  readonly previous: string | null;
}

/** update must read and replace both records atomically, leaving them intact on failure. */
export interface CampaignStorageAdapter {
  read(): Promise<CampaignRecords>;
  update(change: (records: CampaignRecords) => CampaignRecords): Promise<void>;
}

function validSave(text: string | null): boolean {
  if (text === null) return false;
  try {
    parseSave(text);
    return true;
  } catch {
    return false;
  }
}

class IndexedDBAdapter implements CampaignStorageAdapter {
  private async open(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable in this browser.");
    return new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open("dungeon-shop-master-campaign", 1);
      let settled = false;
      const rejectOpen = (error: Error) => {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const timeout = setTimeout(() => {
        rejectOpen(new Error("Opening campaign storage timed out. Continue playing in memory and try again later."));
      }, 5000);
      request.onupgradeneeded = () => {
        if (settled) request.transaction?.abort();
        else request.result.createObjectStore("saves");
      };
      request.onerror = () => rejectOpen(request.error ?? new Error("Could not open campaign storage."));
      request.onblocked = () => {
        rejectOpen(new Error("Campaign storage is blocked by another browser tab."));
      };
      request.onsuccess = () => {
        clearTimeout(timeout);
        if (settled) request.result.close();
        else {
          settled = true;
          resolve(request.result);
        }
      };
    });
  }

  private async transact(change?: (records: CampaignRecords) => CampaignRecords): Promise<CampaignRecords> {
    const db = await this.open();
    try {
      return await new Promise<CampaignRecords>((resolve, reject) => {
        const transaction = db.transaction("saves", change ? "readwrite" : "readonly");
        const store = transaction.objectStore("saves");
        const request = store.get("campaign");
        let result: CampaignRecords = { latest: null, previous: null };
        let failure: unknown;
        request.onsuccess = () => {
          try {
            const value: unknown = request.result;
            if (value !== undefined) {
              if (change) {
                // Explicit overwrites/reset can recover damaged storage without losing readable backups.
                const records = value !== null && typeof value === "object" && !Array.isArray(value)
                  ? value as RecordValue : {};
                result = {
                  latest: typeof records.latest === "string" ? records.latest : null,
                  previous: typeof records.previous === "string" ? records.previous : null,
                };
              } else {
                const records = object(value, "storage", ["latest", "previous"]);
                for (const key of ["latest", "previous"]) {
                  if (records[key] !== null && typeof records[key] !== "string") fail(`storage.${key}`, "must be text or null");
                }
                result = records as unknown as CampaignRecords;
              }
            }
            if (change) {
              result = change(result);
              if (result.latest === null && result.previous === null) store.delete("campaign");
              else store.put(result, "campaign");
            }
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () => reject(
          failure ?? transaction.error ?? request.error ?? new Error("Campaign storage transaction failed."),
        );
      });
    } finally {
      db.close();
    }
  }

  async read(): Promise<CampaignRecords> {
    return this.transact();
  }

  async update(change: (records: CampaignRecords) => CampaignRecords): Promise<void> {
    await this.transact(change);
  }
}

const browserAdapter = new IndexedDBAdapter();
const queues = new WeakMap<CampaignStorageAdapter, Promise<unknown>>();

export class CampaignStorage {
  private readonly adapter: CampaignStorageAdapter;

  constructor(adapter: CampaignStorageAdapter = browserAdapter) {
    this.adapter = adapter;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = (queues.get(this.adapter) ?? Promise.resolve()).then(operation);
    // A failed operation rejects its caller, but does not poison subsequent requests.
    queues.set(this.adapter, result.catch(() => undefined));
    return result;
  }

  async saveGame(state: GameState): Promise<void> {
    const snapshot = JSON.stringify(createSave(state));
    return this.enqueue(() => this.adapter.update((records) => ({
      latest: snapshot,
      previous: validSave(records.latest) ? records.latest : records.previous,
    })));
  }

  loadGame(): Promise<GameState | null> {
    return this.load("latest");
  }

  loadBackup(): Promise<GameState | null> {
    return this.load("previous");
  }

  private load(key: keyof CampaignRecords): Promise<GameState | null> {
    return this.enqueue(async () => {
      const records = await this.adapter.read();
      if (records[key] === null) return null;
      try {
        return parseSave(records[key]);
      } catch (error) {
        throw new Error(`Cannot load ${key === "latest" ? "latest campaign" : "campaign backup"}; stored data was preserved. ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  deleteGame(): Promise<void> {
    return this.enqueue(() => this.adapter.update(() => ({ latest: null, previous: null })));
  }
}
