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
