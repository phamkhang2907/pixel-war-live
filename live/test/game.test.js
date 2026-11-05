import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/game.js";
test("viewer must select a team; gifts map to units and rank", () => {
  const g = new Battle();
  assert.ok(g.gift({ id: "a", name: "A", coins: 100 }).error);
  g.choose("a", 1);
  assert.equal(g.gift({ id: "a", name: "A", coins: 100 }).spawned, 1);
  assert.equal(g.units[0].type, "boss");
  assert.equal(g.units[0].team, 1);
  assert.equal(g.snapshot().scores[0].coins, 100);
});
test("gift streak final total selects tier", () => {
  const g = new Battle();
  g.choose("a", 0);
  g.gift({ id: "a", name: "A", coins: 5, count: 10 });
  assert.equal(g.units.length, 3);
  assert.equal(g.units[0].type, "mage");
});
test("300 unit cap and combat completes a round", () => {
  const g = new Battle();
  g.spawn(0, "boss", 350);
  assert.equal(g.units.length, 300);
  for (let i = 0; i < 20000 && g.winner === null; i++) g.tick(0.05);
  assert.equal(g.winner, 0);
  assert.equal(g.castles[1], 0);
});
test("both teams acquire and damage enemies; reset clears battle", () => {
  const g = new Battle();
  g.spawn(0, "sword", 1);
  g.spawn(1, "sword", 1);
  Object.assign(g.units[0], { x: 270, y: 400, cd: 0 });
  Object.assign(g.units[1], { x: 270, y: 410, cd: 0 });
  g.tick(0.05);
  assert.ok(g.units.some((u) => u.hp < u.maxHp));
  g.reset();
  assert.equal(g.units.length, 0);
  assert.deepEqual(g.castles, [10000, 10000]);
});
test("300 unit benchmark", () => {
  const g = new Battle();
  g.spawn(0, "sword", 150);
  g.spawn(1, "sword", 150);
  const start = performance.now();
  for (let i = 0; i < 600; i++) g.tick(0.05);
  const elapsed = performance.now() - start;
  console.log(`300-unit 600 simulation ticks: ${elapsed.toFixed(0)}ms`);
  assert.ok(elapsed < 10000);
});
test("invalid teams and prototype names cannot create units; reset does not reuse IDs", () => {
  const g = new Battle();
  assert.equal(g.spawn(0, "toString", 2), 0);
  assert.equal(g.spawn(7, "sword", 2), 0);
  g.spawn(0, "sword", 1);
  const id = g.units[0].id;
  g.reset();
  g.spawn(1, "mage", 1);
  assert.ok(g.units[0].id > id);
});
