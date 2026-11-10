import assert from "node:assert/strict";
import test from "node:test";
import { reconcileVisitors, shouldLeaveShopVisual, type VisitorSnapshot } from "../../src/game/npcVisitors.ts";

const visitor = (id: string, status: VisitorSnapshot["status"] = "at-shop"): VisitorSnapshot => ({
  id, name: id, role: "tank", status,
});

test("visitor reconciliation separates arrivals, persistent shop visitors and departures by ID", () => {
  const changes = reconcileVisitors(
    [visitor("staying"), visitor("leaving"), visitor("dead", "dead")],
    [visitor("staying"), visitor("arriving"), visitor("dead", "dead")],
  );
  assert.deepEqual(changes.entering.map(({ id }) => id), ["arriving"]);
  assert.deepEqual(changes.staying.map(({ id }) => id), ["staying"]);
  assert.deepEqual(changes.leaving.map(({ id }) => id), ["leaving"]);
});

test("reconciliation handles initial visitors and never treats dead heroes as arrivals", () => {
  const changes = reconcileVisitors([], [visitor("visitor"), visitor("dead", "dead")]);
  assert.deepEqual(changes.entering.map(({ id }) => id), ["visitor"]);
  assert.deepEqual(changes.staying, []);
  assert.deepEqual(changes.leaving, []);
});

test("reconciliation does not create duplicate changes for repeated IDs", () => {
  const previous = [visitor("one")];
  const current = [visitor("one"), visitor("one")];
  const changes = reconcileVisitors(previous, current);
  assert.deepEqual(changes.entering, []);
  assert.deepEqual(changes.staying.map(({ id }) => id), ["one"]);
  assert.deepEqual(changes.leaving, []);
});

test("paid customer exits only when the authoritative visitor status leaves at-shop", () => {
  const before = [visitor("paid"), visitor("waiting"), visitor("unpaid")];
  const after = [
    visitor("paid", "returning"),
    visitor("waiting"),
    visitor("unpaid"),
  ];
  const changes = reconcileVisitors(before, after);
  assert.deepEqual(changes.leaving.map(({id})=>id), ["paid"]);
  assert.deepEqual(changes.staying.map(({id})=>id), ["waiting","unpaid"]);
  assert.deepEqual(changes.entering, []);
});

test("clearing a nonempty cart while still at-shop never triggers visual departure", () => {
  const before={visitor:visitor("customer"),cart:{heroId:"customer",lines:[{itemId:"potion",quantity:1,subtotal:12}]}};
  const after={visitor:visitor("customer"),cart:{heroId:"customer",lines:[]}};
  assert.equal(before.cart.lines.length,1);
  assert.equal(after.cart.lines.length,0);
  // This is the same status-only guard used by NpcVisualSystem.setShoppingIntents.
  assert.equal(shouldLeaveShopVisual(before.visitor.status),false);
  assert.equal(shouldLeaveShopVisual(after.visitor.status),false);
  const changes=reconcileVisitors([before.visitor],[after.visitor]);
  assert.deepEqual(changes.leaving,[]);
  assert.deepEqual(changes.staying.map(({id})=>id),["customer"]);
  assert.equal(shouldLeaveShopVisual("returning"),true);
  assert.equal(shouldLeaveShopVisual("expedition"),true);
});

test("paid customer departing for an expedition exits just once", () => {
  const previous = [visitor("buyer")];
  const current = [visitor("buyer","expedition")];
  assert.deepEqual(reconcileVisitors(previous,current).leaving.map(({id})=>id),["buyer"]);
  assert.deepEqual(reconcileVisitors(current,current).leaving,[]);
});
