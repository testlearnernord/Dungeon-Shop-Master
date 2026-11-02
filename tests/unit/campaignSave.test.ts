import assert from "node:assert/strict";
import test from "node:test";
import {
  CampaignStorage, createSave, parseSave, SAVE_SCHEMA_VERSION,
  type CampaignRecords, type CampaignStorageAdapter,
} from "../../src/game/campaignSave.ts";
import { advanceDay, createGameState, SIMULATION_VERSION, type GameState } from "../../src/game/gameState.ts";
import { buyWholesale, discardBag, transferShelf } from "../../src/game/economy.ts";

function encoded(state = createGameState()): string {
  return JSON.stringify(createSave(state));
}

test("versioned saves round-trip every field without retaining caller references", () => {
  const state = createGameState(0);
  const before = structuredClone(state);
  const envelope = createSave(state);
  assert.equal(envelope.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(envelope.simulationVersion, SIMULATION_VERSION);
  assert.equal(new Date(envelope.savedAt).toISOString(), envelope.savedAt);
  assert.deepEqual(parseSave(JSON.stringify(envelope)), state);
  state.shopEconomy.bag.bread = 0;
  assert.deepEqual(envelope.payload, before);
  assert.notEqual(envelope.payload.adventurers, state.adventurers);
});

test("seeded 220-day continuation preserves history, RNG, dead heroes and economy mutations", () => {
  for (const seed of [0, 7351, 0xffffffff]) {
    let uninterrupted = createGameState(seed);
    let resumed = parseSave(encoded(uninterrupted));
    for (let tick = 0; tick < 220; tick += 1) {
      function step(state: GameState): GameState {
        if (tick % 3 === 0) state = buyWholesale(state, "bread", 1).state;
        if (tick % 5 === 0) state = discardBag(state, "iron-ore").state;
        state = transferShelf(state, "shelf-2-slot-1", "bread", "stock").state;
        if (tick % 7 === 0) state = transferShelf(state, "shelf-1-slot-3", "healing-herb", "remove").state;
        return advanceDay(state).state;
      }
      uninterrupted = step(uninterrupted);
      resumed = parseSave(encoded(step(resumed)));
      assert.deepEqual(resumed, uninterrupted, `seed ${seed}, tick ${tick}`);
    }
    assert.equal(resumed.day, 221);
    assert(resumed.adventurers.some((hero) => hero.status === "dead"));
    assert(resumed.events.some((event) => event.type === "sale"));
  }
});

const badPayloads: [string, (state: any) => void, RegExp][] = [
  ["missing field", (s) => { delete s.rngState; }, /rngState.*required/],
  ["unknown field", (s) => { s.extra = 1; }, /extra.*not supported/],
  ["prototype key", (s) => { Object.defineProperty(s, "__proto__", { value: {}, enumerable: true }); }, /__proto__/],
  ["null state", (s) => { s.shopEconomy = null; }, /shopEconomy.*object/],
  ["invalid day", (s) => { s.day = 0; }, /day/],
  ["fractional day", (s) => { s.day = 2.5; }, /day/],
  ["unsafe day", (s) => { s.day = Number.MAX_SAFE_INTEGER; }, /day/],
  ["future payload version", (s) => { s.simulationVersion += 1; }, /simulationVersion.*incompatible/],
  ["negative seed", (s) => { s.seed = -1; }, /seed/],
  ["too large seed", (s) => { s.seed = 0x100000000; }, /seed/],
  ["fractional RNG", (s) => { s.rngState = 1.1; }, /rngState/],
  ["null RNG", (s) => { s.rngState = null; }, /rngState/],
  ["negative RNG", (s) => { s.rngState = -1; }, /rngState/],
  ["too large RNG", (s) => { s.rngState = 0x100000000; }, /rngState/],
  ["bad population", (s) => { s.populationConfig.maxActive = 9; }, /maxActive/],
  ["oversized population", (s) => { s.populationConfig.maxActive = 101; }, /maxActive/],
  ["bad influx", (s) => { s.populationConfig.dailyInflux = -1; }, /dailyInflux/],
  ["duplicate hero", (s) => { s.adventurers[1].id = s.adventurers[0].id; }, /id.*unique/],
  ["invalid hero ID", (s) => { s.adventurers[0].id = "adventurer-01"; }, /id/],
  ["reused next ID", (s) => { s.nextAdventurerId = 10; }, /nextAdventurerId/],
  ["unknown role", (s) => { s.adventurers[0].role = "mage"; }, /role/],
  ["unknown status", (s) => { s.adventurers[0].status = "missing"; }, /status/],
  ["live zero health", (s) => { s.adventurers[0].health = 0; }, /status.*health/],
  ["dead positive health", (s) => { s.adventurers[0].status = "dead"; }, /status.*health/],
  ["overfull health", (s) => { s.adventurers[0].health = 9999; }, /health/],
  ["bad stats", (s) => { s.adventurers[0].stats.strength = 0; }, /strength/],
  ["missing trait", (s) => { delete s.adventurers[0].traits.positive; }, /positive/],
  ["empty name", (s) => { s.adventurers[0].name = " "; }, /name/],
  ["invalid equipment", (s) => { s.adventurers[0].equipment.weapon = 42; }, /weapon/],
  ["negative hero gold", (s) => { s.adventurers[0].gold = -1; }, /gold/],
  ["negative inventory", (s) => { s.adventurers[0].inventory.food = -1; }, /food/],
  ["fractional inventory", (s) => { s.adventurers[0].inventory.loot = 0.5; }, /loot/],
  ["bad level", (s) => { s.adventurers[0].level = 2; }, /level.*XP/],
  ["negative XP", (s) => { s.adventurers[0].xp = -1; }, /xp/],
  ["bad floor", (s) => { s.adventurers[0].floor = 6; }, /floor/],
  ["shop on dungeon floor", (s) => { s.adventurers[0].floor = 4; }, /floor.*status/],
  ["explorer at shop", (s) => { s.adventurers[0].status = "exploring"; }, /floor.*status/],
  ["returning on wrong floor", (s) => { s.adventurers[0].status = "returning"; }, /floor.*status/],
  ["too long stay", (s) => { s.adventurers[0].shopStayDays = 2; }, /shopStayDays/],
  ["negative hunger", (s) => { s.adventurers[0].hunger = -1; }, /hunger/],
  ["negative gold", (s) => { s.shopEconomy.balance = -1; }, /balance/],
  ["unsafe gold", (s) => { s.shopEconomy.balance = Number.MAX_SAFE_INTEGER + 1; }, /balance/],
  ["unknown bag item", (s) => { s.shopEconomy.bag.sword = 1; }, /sword/],
  ["missing bag item", (s) => { delete s.shopEconomy.bag.bread; }, /bread/],
  ["fractional bag", (s) => { s.shopEconomy.bag.bread = 1.1; }, /bread/],
  ["bag overflow", (s) => { s.shopEconomy.bag.bread = 24; }, /bag.*capacity/],
  ["missing shelf", (s) => { s.shopEconomy.slots.pop(); }, /slots/],
  ["duplicate slot", (s) => { s.shopEconomy.slots[1] = s.shopEconomy.slots[0]; }, /id.*unique/],
  ["wrong shelf", (s) => { s.shopEconomy.slots[0].shelfId = "shelf-9"; }, /shelf/],
  ["wrong index", (s) => { s.shopEconomy.slots[0].index = 4; }, /index/],
  ["wrong capacity", (s) => { s.shopEconomy.slots[0].capacity = 50; }, /capacity/],
  ["slot overflow", (s) => { s.shopEconomy.slots[1].quantity = 6; }, /quantity/],
  ["unknown shelf item", (s) => { s.shopEconomy.slots[1].itemId = "sword"; }, /itemId/],
  ["empty item with stock", (s) => { s.shopEconomy.slots[1].itemId = null; }, /stocked/],
  ["item without stock", (s) => { s.shopEconomy.slots[1].quantity = 0; }, /stocked/],
  ["stale daily sales", (s) => { s.shopEconomy.dailySales.day = 2; }, /dailySales.day/],
  ["negative sales", (s) => { s.shopEconomy.dailySales.revenue = -1; }, /revenue/],
  ["future rescue", (s) => { s.shopEconomy.lastRescueDay = 2; }, /lastRescueDay/],
  ["duplicate floors", (s) => { s.dungeonFloors = [{ floor: 1, cleared: false }, { floor: 1, cleared: true }]; }, /unique/],
  ["invalid floor progress", (s) => { s.dungeonFloors = [{ floor: 6, cleared: true }]; }, /floor/],
  ["invalid cleared flag", (s) => { s.dungeonFloors = [{ floor: 1, cleared: 1 }]; }, /cleared/],
  ["missing events", (s) => { s.events = null; }, /events.*array/],
  ["duplicate events", (s) => { s.events.push(s.events[0]); }, /unique/],
  ["future event", (s) => { s.events[0].day = 2; }, /day/],
  ["unknown event", (s) => { s.events[0].type = "win"; }, /type/],
  ["unknown hero link", (s) => { s.events[0].adventurerId = "adventurer-999"; }, /adventurerId/],
  ["event ID link", (s) => { s.events[0].id = "day-1:adventurer-2:shop-arrival"; }, /id.*agree/],
  ["invalid event data", (s) => { s.events[0].quantity = 1; }, /quantity.*not valid/],
  ["empty event message", (s) => { s.events[0].message = ""; }, /message/],
];

for (const [name, mutate, message] of badPayloads) {
  test(`rejects untrusted payload: ${name}`, () => {
    const envelope = JSON.parse(encoded());
    mutate(envelope.payload);
    assert.throws(() => parseSave(JSON.stringify(envelope)), message);
    assert.throws(() => createSave(envelope.payload), message);
  });
}

test("rejects malformed envelopes and incompatible versions without migrations", () => {
  for (const input of ["", "{", "null", "[]", "42", '"text"']) {
    assert.throws(() => parseSave(input), /Invalid campaign save/);
  }
  for (const key of ["schemaVersion", "simulationVersion"]) {
    for (const version of [0, 999, "1", null]) {
      const envelope: any = JSON.parse(encoded());
      envelope[key] = version;
      assert.throws(() => parseSave(JSON.stringify(envelope)), /incompatible.*no migrations/);
    }
  }
  for (const savedAt of ["yesterday", "2026-02-30T00:00:00.000Z", "2026-01-01", null, 42]) {
    const envelope = { ...createSave(createGameState()), savedAt };
    assert.throws(() => parseSave(JSON.stringify(envelope)), /savedAt/);
  }
  const envelope: any = createSave(createGameState());
  delete envelope.payload;
  assert.throws(() => parseSave(JSON.stringify(envelope)), /payload.*required/);
  assert.throws(() => parseSave(JSON.stringify({ ...envelope, payload: {}, unexpected: 1 })), /unexpected/);
  assert.throws(() => createSave({ ...createGameState(), rngState: NaN }), /rngState/);
  assert.throws(() => createSave({ ...createGameState(), seed: Infinity }), /seed/);
});

test("checks event-specific outcome, prices, quantities, links and chronology", () => {
  let state = advanceDay(createGameState()).state;
  const mutateEvent = (type: string, mutate: (event: any) => void, message: RegExp) => {
    const envelope = JSON.parse(encoded(state));
    const event = envelope.payload.events.find((event: any) => event.type === type);
    assert(event, `test fixture has ${type}`);
    mutate(event);
    assert.throws(() => parseSave(JSON.stringify(envelope)), message);
  };
  mutateEvent("sale", (event) => { event.revenue += 1; }, /revenue/);
  mutateEvent("sale", (event) => { event.quantity = 0; }, /quantity/);
  mutateEvent("sale", (event) => { event.id = "day-2:adventurer-1:sale:unknown"; }, /shelf slot/);
  mutateEvent("ate", (event) => { event.itemId = "mana-potion"; }, /bread/);
  mutateEvent("ate", (event) => { delete event.quantity; }, /quantity/);
  mutateEvent("dungeon-outcome", (event) => { event.outcome = "victory"; }, /outcome/);
  mutateEvent("day-started", (event) => { event.adventurerId = "adventurer-1"; }, /not valid/);
  const envelope = JSON.parse(encoded(state));
  envelope.payload.events.reverse();
  assert.throws(() => parseSave(JSON.stringify(envelope)), /day/);
  state = {
    ...state,
    shopEconomy: {
      ...state.shopEconomy, balance: 0,
      bag: { bread: 0, "healing-herb": 0, "mana-potion": 0, "iron-ore": 0 },
      slots: state.shopEconomy.slots.map((slot) => ({ ...slot, itemId: null, quantity: 0 })),
    },
  };
  state = advanceDay(state).state;
  mutateEvent("rescue", (event) => { event.quantity = 3; }, /quantity/);
});

class MemoryAdapter implements CampaignStorageAdapter {
  records: CampaignRecords = { latest: null, previous: null };
  failNext = false;
  readError = false;
  gate: Promise<void> | null = null;
  writes = 0;

  async read(): Promise<CampaignRecords> {
    if (this.readError) throw new Error("Storage denied");
    return { ...this.records };
  }

  async update(change: (records: CampaignRecords) => CampaignRecords): Promise<void> {
    if (this.gate) await this.gate;
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Quota exceeded");
    }
    const next = change({ ...this.records });
    this.records = next;
    this.writes += 1;
  }
}

test("storage loads null, rotates exactly one backup, and deletes both records", async () => {
  const adapter = new MemoryAdapter();
  const storage = new CampaignStorage(adapter);
  const first = createGameState();
  const second = advanceDay(first).state;
  assert.equal(await storage.loadGame(), null);
  assert.equal(await storage.loadBackup(), null);
  await storage.saveGame(first);
  assert.deepEqual(await storage.loadGame(), first);
  assert.equal(await storage.loadBackup(), null);
  await storage.saveGame(second);
  assert.deepEqual(await storage.loadGame(), second);
  assert.deepEqual(await storage.loadBackup(), first);
  await storage.saveGame(advanceDay(second).state);
  assert.deepEqual(await storage.loadBackup(), second);
  await storage.deleteGame();
  assert.equal(await storage.loadGame(), null);
  assert.equal(await storage.loadBackup(), null);
});

test("invalid latest rejects visibly, stays intact, and never replaces the known-good backup", async () => {
  const adapter = new MemoryAdapter();
  const good = encoded();
  adapter.records = { latest: "{broken", previous: good };
  const storage = new CampaignStorage(adapter);
  await assert.rejects(storage.loadGame(), /Cannot load latest campaign; stored data was preserved.*malformed JSON/);
  assert.deepEqual(adapter.records, { latest: "{broken", previous: good });
  assert.deepEqual(await storage.loadBackup(), createGameState());
  await storage.saveGame(advanceDay(createGameState()).state);
  assert.equal(adapter.records.previous, good);
  adapter.records = { latest: good, previous: "bad backup" };
  await storage.saveGame(advanceDay(createGameState()).state);
  assert.equal(adapter.records.previous, good);
  adapter.records = { latest: good, previous: "bad backup" };
  await assert.rejects(storage.loadBackup(), /Cannot load campaign backup; stored data was preserved/);
  assert.equal(adapter.records.previous, "bad backup");
});

test("queued snapshots are captured at invocation and ordered across shared repository instances", async () => {
  const adapter = new MemoryAdapter();
  let release!: () => void;
  adapter.gate = new Promise<void>((resolve) => { release = resolve; });
  const storage = new CampaignStorage(adapter);
  const other = new CampaignStorage(adapter);
  const first = createGameState();
  const before = structuredClone(first);
  const second = advanceDay(first).state;
  const beforeSecond = structuredClone(second);
  const writeFirst = storage.saveGame(first);
  const writeSecond = other.saveGame(second);
  const load = storage.loadGame();
  first.shopEconomy.bag.bread = 0;
  assert.equal(adapter.writes, 0);
  release();
  await Promise.all([writeFirst, writeSecond]);
  assert.deepEqual(await load, beforeSecond);
  assert.deepEqual(await storage.loadBackup(), before);
});

test("deletion participates in the queue and cannot race a pending save", async () => {
  const adapter = new MemoryAdapter();
  const storage = new CampaignStorage(adapter);
  const state = createGameState();
  await Promise.all([storage.saveGame(state), storage.deleteGame()]);
  assert.equal(await storage.loadGame(), null);
  await Promise.all([storage.saveGame(state), storage.deleteGame(), storage.saveGame(advanceDay(state).state)]);
  assert.deepEqual(await storage.loadGame(), advanceDay(state).state);
  assert.equal(await storage.loadBackup(), null);
});

test("write, read, validation and deletion failures preserve stored records and do not poison the queue", async () => {
  const adapter = new MemoryAdapter();
  const storage = new CampaignStorage(adapter);
  const state = createGameState();
  await storage.saveGame(state);
  const before = { ...adapter.records };
  adapter.failNext = true;
  await assert.rejects(storage.saveGame(advanceDay(state).state), /Quota exceeded/);
  assert.deepEqual(adapter.records, before);
  adapter.readError = true;
  await assert.rejects(storage.loadGame(), /Storage denied/);
  assert.deepEqual(adapter.records, before);
  adapter.readError = false;
  adapter.failNext = true;
  await assert.rejects(storage.deleteGame(), /Quota exceeded/);
  assert.deepEqual(adapter.records, before);
  await assert.rejects(storage.saveGame({ ...state, day: -1 }), /payload.day/);
  assert.deepEqual(adapter.records, before);
  await storage.saveGame(advanceDay(state).state);
  assert.deepEqual(await storage.loadBackup(), state);
  assert.deepEqual(await storage.loadGame(), advanceDay(state).state);
});

test("default repository imports in Node and fails lazily when IndexedDB is unavailable", async () => {
  if (globalThis.indexedDB) return;
  const storage = new CampaignStorage();
  await assert.rejects(storage.loadGame(), /IndexedDB is unavailable/);
  await assert.rejects(storage.saveGame(createGameState()), /IndexedDB is unavailable/);
  await assert.rejects(storage.deleteGame(), /IndexedDB is unavailable/);
});

test("a stalled IndexedDB open rejects within five seconds and closes a late connection", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let closed = false;
  const request: any = { result: { close: () => { closed = true; } } };
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: { open: () => request },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "indexedDB", original);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  });
  const pending = new CampaignStorage().loadGame();
  const rejected = assert.rejects(pending, /Opening campaign storage timed out.*in memory/);
  await Promise.resolve();
  t.mock.timers.tick(5000);
  await rejected;
  request.onsuccess();
  assert.equal(closed, true);
});

test("blocked and failed IndexedDB opens reject immediately and leave the queue usable", async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let request: any;
  let closed = false;
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open: () => {
        request = { error: new Error("Browser denied storage"), result: { close: () => { closed = true; } } };
        return request;
      },
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "indexedDB", original);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  });
  const storage = new CampaignStorage();
  const blocked = storage.loadGame();
  const rejectedBlocked = assert.rejects(blocked, /blocked by another browser tab/);
  await Promise.resolve();
  request.onblocked();
  await rejectedBlocked;
  request.onsuccess();
  assert.equal(closed, true);
  const failed = storage.loadGame();
  const rejectedFailed = assert.rejects(failed, /Browser denied storage/);
  await Promise.resolve();
  request.onerror();
  await rejectedFailed;
});

test("explicit saves and deletion recover structurally corrupt IndexedDB records without losing valid backups", async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let stored: unknown;
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open: () => {
        const open: any = {
          result: {
            close: () => {},
            transaction: () => {
              let aborted = false;
              let staged = stored;
              const transaction: any = {
                abort: () => {
                  aborted = true;
                  queueMicrotask(() => transaction.onabort());
                },
                objectStore: () => ({
                  get: () => {
                    const request: any = { result: stored };
                    queueMicrotask(() => {
                      request.onsuccess();
                      if (!aborted) {
                        stored = staged;
                        transaction.oncomplete();
                      }
                    });
                    return request;
                  },
                  put: (value: unknown) => { staged = structuredClone(value); },
                  delete: () => { staged = undefined; },
                }),
              };
              return transaction;
            },
          },
        };
        queueMicrotask(() => open.onsuccess());
        return open;
      },
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "indexedDB", original);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  });
  const good = encoded(createGameState());
  const nextState = advanceDay(createGameState()).state;
  const cases: [unknown, string | null][] = [
    [null, null],
    [42, null],
    ["corrupt record", null],
    [[], null],
    [{}, null],
    [{ latest: good }, good],
    [{ previous: good }, good],
    [{ latest: 42, previous: good }, good],
    [{ latest: "{invalid JSON", previous: good, unexpected: true }, good],
    [{ latest: good, previous: {} }, good],
  ];
  for (const [corrupt, expectedBackup] of cases) {
    stored = structuredClone(corrupt);
    const storage = new CampaignStorage();
    await assert.rejects(storage.loadGame(), /Invalid campaign save: storage/);
    assert.deepEqual(stored, corrupt, "failed reads must leave damaged records intact");
    await storage.saveGame(nextState);
    assert.deepEqual(await storage.loadGame(), nextState);
    assert.equal((stored as CampaignRecords).previous, expectedBackup);
    stored = structuredClone(corrupt);
    await storage.deleteGame();
    assert.equal(stored, undefined);
    assert.equal(await storage.loadGame(), null);
  }
});
