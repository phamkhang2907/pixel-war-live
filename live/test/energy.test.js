import { WORLD } from "../src/characters.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/game.js";
function setup() {
  let now = 100;
  const b = new Battle({ clock: () => now });
  b.choose("a", 0);
  b.choose("b", 1);
  return { b, set: (t) => (now = t) };
}
test("cumulative milestones trigger exactly once, team-specific, heal capped", () => {
  const { b } = setup();
  b.castles[0] = 9800;
  let r = b.likes({ id: "a", count: 500 });
  assert.deepEqual(r.unlocked, [100, 300, 500]);
  assert.equal(b.castles[0], 9900);
  const units = b.units.length;
  r = b.likes({ id: "a", count: 1 });
  assert.equal(b.units.length, units);
  assert.deepEqual(r.unlocked, []);
  assert.equal(b.energy[1], 0);
  assert.ok(b.likes({ id: "unknown", count: 100 }).error);
});
test("all milestones grant Heavy Soldier, rain projectiles and 20% haste for 15 simulated sec", () => {
  const { b } = setup();
  b.likes({ id: "a", count: 5000 });
  assert.deepEqual(b.claimed[0], [100, 300, 500, 1000, 3000, 5000]);
  assert.ok(b.units.some((u) => u.type === "cavalry"));
  assert.equal(b.projectiles.length, 24);
  assert.equal(b.boostUntil[0], 15);
  b.spawn(0, "sword", 1);
  const u = b.units.at(-1);
  Object.assign(u, {
    x: WORLD.castles[1] - 60,
    y: WORLD.ground, lane:WORLD.ground,
    windup: 0,
    cd: 0,
  });
  b.tick(0.05);
  assert.ok(Math.abs(u.cd - 0.85 / 1.2) < 0.001);
  for (let i = 0; i < 310; i++) b.tick(0.05);
  assert.equal(b.snapshot().boost[0], 0);
});
test("Fury 500/10s, no repeat during cooldown, both sides equal damage", () => {
  const { b, set } = setup();
  b.spawn(0, "sword", 1);
  b.spawn(1, "sword", 1);
  b.likes({ id: "a", count: 499 });
  assert.equal(b.castles[1], 10000);
  set(105);
  assert.equal(b.likes({ id: "a", count: 1 }).fury, true);
  assert.equal(b.units.find((u) => u.team === 1).hp, 40);
  assert.equal(b.castles[1], 9880);
  assert.equal(b.likes({ id: "a", count: 500 }).fury, false);
  b.likes({ id: "b", count: 500 });
  assert.equal(b.units.find((u) => u.team === 0 && u.name === "Demo").hp, 40);
  assert.equal(b.castles[0], 9880);
  set(166);
  assert.equal(b.likes({ id: "a", count: 500 }).fury, true);
});
test("likes outside rolling window cannot combine; no repeated milestone after 60s", () => {
  const { b, set } = setup();
  b.likes({ id: "a", count: 499 });
  set(111);
  assert.equal(b.likes({ id: "a", count: 1 }).fury, false);
  set(200);
  assert.deepEqual(b.likes({ id: "a", count: 1 }).unlocked, []);
});
test("reset clears energy/cooldowns/milestones and allows new round rewards", () => {
  const { b } = setup();
  b.likes({ id: "a", count: 1000 });
  b.reset();
  assert.deepEqual(b.furyUntil, [0, 0]);
  assert.deepEqual(b.claimed, [[], []]);
  assert.deepEqual(b.likes({ id: "a", count: 100 }).unlocked, [100]);
  assert.equal(b.likes({ id: "a", count: -2 }).error, "Invalid like count");
});
test("rolling ten-second boundary keeps sub-second precision", () => {
  const { b, set } = setup();
  set(100.05);
  b.likes({ id: "a", count: 499 });
  set(110.01);
  assert.equal(b.likes({ id: "a", count: 1 }).fury, true);
});
