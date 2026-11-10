import assert from "node:assert/strict";
import test from "node:test";
import { reconcileVisitors, type VisitorSnapshot } from "../../src/game/npcVisitors.ts";

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

test("clearing a cart alone cannot remove a customer still marked at-shop", () => {
  // Reconciliation is status-driven, not cart-driven. A completed sale that
  // leaves a hero at the shop must not despawn the physical NPC prematurely.
  const previous = [visitor("customer")];
  const current = [visitor("customer")];
  const changes = reconcileVisitors(previous,current);
  assert.deepEqual(changes.leaving,[]);
  assert.deepEqual(changes.staying.map(({id})=>id),["customer"]);
});

test("paid customer departing for an expedition exits just once", () => {
  const previous = [visitor("buyer")];
  const current = [visitor("buyer","expedition")];
  assert.deepEqual(reconcileVisitors(previous,current).leaving.map(({id})=>id),["buyer"]);
  assert.deepEqual(reconcileVisitors(current,current).leaving,[]);
});
