import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceDay,
  createGameState,
  SIMULATION_VERSION,
  transitionDayConfirmation,
} from "../../src/game/gameState.ts";

test("a fresh session starts on Day 1 with independent state and a welcome event", () => {
  const state = createGameState();
  assert.equal(state.day, 1);
  assert.equal(state.simulationVersion, SIMULATION_VERSION);
  assert.deepEqual(state.events.at(-1), {
    id: "day-1:welcome", type: "welcome", day: 1, message: "Welcome to Day 1. The shop is ready.",
  });
  assert.equal(state.adventurers.length, 10);
  assert.equal(state.shopEconomy.balance, 20);
  assert.equal(state.shopEconomy.slots.length, 10);
  assert.deepEqual(state.dungeonFloors, []);
  assert.notEqual(state.events, createGameState().events);
});

test("one tick advances exactly one day and returns only that tick's deterministic events", () => {
  const initial = createGameState();
  const result = advanceDay(initial);
  assert.equal(result.state.day, 2);
  assert.deepEqual(result.events[0], { id: "day-2:started", type: "day-started", day: 2, message: "Day 2 begins." });
  assert(result.events.every((event) => event.day === 2));
  assert.deepEqual(result.state.events, [...initial.events, ...result.events]);
  assert.deepEqual(advanceDay(initial), result);
});

test("ticks do not mutate frozen input, history, or future system state", () => {
  const initial = {
    ...createGameState(),
    shopEconomy: { ...createGameState().shopEconomy, balance: 17 },
    dungeonFloors: [{ floor: 1, cleared: false }],
  };
  const snapshot = structuredClone(initial);
  const freeze = (value: object): void => {
    Object.values(value).forEach((child) => {
      if (child !== null && typeof child === "object") freeze(child);
    });
    Object.freeze(value);
  };
  freeze(initial);
  const { state } = advanceDay(initial);
  assert.deepEqual(initial, snapshot);
  assert.notEqual(state, initial);
  assert.notEqual(state.events, initial.events);
  assert.deepEqual(state.dungeonFloors, snapshot.dungeonFloors);
  assert(state.shopEconomy.balance >= snapshot.shopEconomy.balance);
});

test("ten consecutive ticks preserve ordered history and version", () => {
  let state = createGameState();
  for (let tick = 1; tick <= 10; tick += 1) {
    const previous = state;
    const result = advanceDay(state);
    state = result.state;
    assert.equal(state.day, tick + 1);
    assert.equal(state.events.length, previous.events.length + result.events.length);
    assert.equal(state.simulationVersion, SIMULATION_VERSION);
    assert.equal(state.events.at(-1)?.day, state.day);
  }
});

test("invalid days and unsupported versions fail without modifying state", () => {
  for (const day of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    const state = { ...createGameState(), day };
    const snapshot = structuredClone(state);
    assert.throws(() => advanceDay(state), RangeError);
    assert.deepEqual(state, snapshot);
  }
  assert.throws(() => advanceDay({ ...createGameState(), simulationVersion: 0 }), RangeError);
});

test("requests, cancellation and duplicate confirmation never advance without a pending request", () => {
  assert.deepEqual(transitionDayConfirmation(false, "confirm"), { pending: false, advance: false });
  assert.deepEqual(transitionDayConfirmation(false, "cancel"), { pending: false, advance: false });
  const request = transitionDayConfirmation(false, "request");
  assert.deepEqual(request, { pending: true, advance: false });
  assert.deepEqual(transitionDayConfirmation(request.pending, "request"), request);
  const cancelled = transitionDayConfirmation(request.pending, "cancel");
  assert.deepEqual(cancelled, { pending: false, advance: false });
  assert.equal(transitionDayConfirmation(cancelled.pending, "confirm").advance, false);
  const confirmed = transitionDayConfirmation(request.pending, "confirm");
  assert.deepEqual(confirmed, { pending: false, advance: true });
  assert.equal(transitionDayConfirmation(confirmed.pending, "confirm").advance, false);
});

test("manual payment closes a shop visit instead of randomly sending the buyer back inside",()=>{
  const initial=createGameState(7351);
  const buyer=initial.adventurers[0];
  const state={...initial,
    adventurers:initial.adventurers.map(person=>person.id===buyer.id
      ?{...person,status:"at-shop" as const,floor:5 as const,
        shopStayDays:0,level6Permit:false,gold:100}:person),
    events:[...initial.events,{
      id:`day-1:${buyer.id}:sale:shelf-1-slot-2:manual`,
      type:"sale" as const,saleChannel:"manual" as const,day:1,
      adventurerId:buyer.id,itemId:"bread" as const,quantity:1,revenue:4,
      message:buyer.name+" paid for Waybread.",
    }],
  };
  const next=advanceDay(state);
  const updated=next.state.adventurers.find(person=>person.id===buyer.id)!;
  assert.equal(updated.status,"returning");
  assert.equal(updated.floor,4);
  assert.equal(updated.shopStayDays,0);
  assert.equal(next.events.filter(e=>e.adventurerId===buyer.id&&e.type==="shop-stay").length,0);
  assert.equal(next.events.filter(e=>e.adventurerId===buyer.id&&e.type==="shop-departure").length,1);
  assert.deepEqual(advanceDay(state),next,"a saved day tick must not reroll customer departures");
});

test("an unpaid cart settled at day close also departs; an L6 pass still takes precedence",()=>{
  const initial=createGameState(9321);
  const buyer=initial.adventurers[0];
  const visiting={...initial,
    adventurers:initial.adventurers.map(person=>person.id===buyer.id
      ?{...person,status:"at-shop" as const,floor:5 as const,
        shopStayDays:0,gold:100,level6Permit:false}:person),
    shopCarts:[{heroId:buyer.id,day:1,
      lines:[{itemId:"bread" as const,slotId:"shelf-1-slot-2",
        quantity:1,subtotal:4}]}],
  };
  const settled=advanceDay(visiting);
  assert.equal(settled.state.adventurers.find(person=>person.id===buyer.id)?.status,"returning");
  assert(settled.events.some(e=>e.adventurerId===buyer.id&&e.type==="shop-departure"));
  assert(!settled.events.some(e=>e.adventurerId===buyer.id&&e.type==="shop-stay"));
  const permitted={...visiting,
    adventurers:visiting.adventurers.map(person=>person.id===buyer.id
      ?{...person,level6Permit:true}:person),
  };
  const next=advanceDay(permitted);
  const expedition=next.state.adventurers.find(person=>person.id===buyer.id)!;
  assert.equal(expedition.status,"expedition");
  assert.equal(expedition.floor,6);
  assert(next.events.some(e=>e.adventurerId===buyer.id&&e.type==="level6-departure"));
  assert(!next.events.some(e=>e.adventurerId===buyer.id&&e.type==="shop-stay"));
});
