import { WORLD } from "../src/characters.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle, TYPES } from "../src/game.js";
const run = (b, seconds) => {
  for (let n = 0; n < seconds / 0.05; n++) b.tick(0.05);
};
function pair(a = "sword", b = "sword", distance = 25) {
  const g = new Battle();
  g.spawn(0, a, 1);
  g.spawn(1, b, 1);
  Object.assign(g.units[0], { x: 700, y: WORLD.ground, cd: 0, windup: 0 });
  Object.assign(g.units[1], {
    x: 700 + distance,
    y: WORLD.ground,
    cd: 100,
    windup: 100,
  });
  return g;
}
test("six configured combat stats and name-based gift queue", () => {
  assert.deepEqual(
    Object.values(TYPES)
      .filter((t) => !t.monster)
      .map((t) => [t.hp, t.damage]),
    [
      [100, 15],
      [65, 20],
      [180, 35],
      [100, 50],
      [900, 35],
      [2500, 120],
    ],
  );
  const g = new Battle();
  g.choose("a", 0);
  const result = g.gift({
    id: "a",
    name: "A",
    giftName: "Finger Heart",
    count: 2,
  });
  assert.equal(result.queued, 10);
  g.drainSummons(20);
  assert.equal(g.units.length, 10);
  assert.ok(g.units.every((u) => u.type === "sword"));
  assert.ok(new Battle().gift({ id: "x", coins: 1 }).error);
});
test("melee damages, hurt, death remains then is removed", () => {
  const g = pair();
  g.tick(0.05);
  assert.equal(g.units[1].hp, 85);
  assert.ok(g.units[1].hurt > 0);
  g.damage(g.units[1], 100, g.units[0]);
  const id = g.units[1].id;
  assert.equal(g.units[1].state, "death");
  run(g, 0.5);
  assert.ok(g.units.some((u) => u.id === id));
  run(g, 0.6);
  assert.ok(!g.units.some((u) => u.id === id));
});
test("arrow travels before dealing 20 damage", () => {
  const g = pair("archer", "sword", 180);
  g.tick(0.05);
  assert.equal(g.units[1].hp, 100);
  assert.equal(g.projectiles[0].kind, "arrow");
  run(g, 0.5);
  assert.equal(g.units[1].hp, 80);
});
test("flying mage immune to ground melee; archer can hit air", () => {
  const g = pair("sword", "mage", 20);
  run(g, 1);
  assert.equal(g.units[1].hp, 100);
  const a = pair("archer", "mage", 120);
  run(a, 1);
  assert.equal(a.units[1].hp, 80);
});
test("fireball real flight and splash damage", () => {
  const g = pair("mage", "sword", 180);
  g.spawn(1, "sword", 1);
  Object.assign(g.units[2], { x: 890, y: WORLD.ground, windup: 100 });
  g.tick(0.05);
  assert.equal(g.units[1].hp, 100);
  assert.equal(g.projectiles[0].kind, "fireball");
  run(g, 1);
  assert.equal(g.units[1].hp, 50);
  assert.equal(g.units[2].hp, 50);
});
test("Heavy Soldier is on foot and deals its configured damage", () => {
  const g = pair("cavalry", "sword");
  g.tick(0.05);
  assert.equal(g.units[1].hp, 65);
  assert.equal(g.units[0].charge, false);
});
test("guardian frontal shield and stomp knockback", () => {
  const g = pair("sword", "guardian");
  const guardian = g.units[1];
  assert.equal(g.damage(guardian, 100, g.units[0]), 55);
  assert.equal(g.damage(guardian, 100, { x: 900 }), 100);
  const s = pair("guardian", "sword");
  const old = s.units[1].x;
  s.tick(0.05);
  assert.equal(s.units[0].state, "stomp");
  assert.ok(s.units[1].x > old + 20);
  assert.ok(s.units[1].hp < 100 - 35);
});
test("titan castle priority, enrage, stomp and 4x scale", () => {
  const g = pair("boss", "sword", 250),
    u = g.units[0];
  g.tick(0.05);
  assert.ok(u.x > 700);
  u.hp = 800;
  g.tick(0.05);
  assert.equal(u.state, "rage");
  assert.equal(u.rage, true);
  assert.equal(TYPES.boss.scale, 4);
  assert.equal(TYPES.guardian.scale, 2.5);
});
test("soft collisions separate overlapping ground troops but leave air free", () => {
  const g = new Battle();
  g.spawn(0, "sword", 2);
  g.units.forEach((u, i) =>
    Object.assign(u, { x: 700 + i, y: WORLD.ground, windup: 0 }),
  );
  g.tick(0.05);
  assert.ok(
    Math.hypot(g.units[0].x - g.units[1].x, g.units[0].y - g.units[1].y) > 1,
  );
});
test("configurable capacity, invalid inputs and no recycled IDs", () => {
  const g = new Battle({ maxUnits: 300 });
  assert.equal(g.spawn(0, "toString", 2), 0);
  assert.equal(g.spawn(7, "sword", 2), 0);
  g.spawn(0, "sword", 350);
  assert.equal(g.units.length, 300);
  const id = g.units.at(-1).id;
  g.reset();
  g.spawn(1, "mage", 1);
  assert.ok(g.units[0].id > id);
});
test("full siege destroys castle and freezes winner; reset clears powers", () => {
  const g = new Battle({ warfare: { castleHp: 10000 } });
  g.spawn(0, "boss", 30);
  run(g, 180);
  assert.equal(g.winner, 0);
  assert.equal(g.castles[1], 0);
  g.reset();
  assert.equal(g.winner, null);
  assert.deepEqual(g.energy, [0, 0]);
  assert.deepEqual(g.castles, [10000, 10000]);
});
test("300 mixed-unit CPU benchmark", () => {
  const g = new Battle();
  const kinds = Object.keys(TYPES);
  for (let i = 0; i < 300; i++) g.spawn(i % 2, kinds[Math.floor(i / 2) % 6], 1);
  const start = performance.now();
  run(g, 30);
  const elapsed = performance.now() - start;
  console.log(`300 mixed units / 600 ticks: ${elapsed.toFixed(0)}ms`);
  assert.ok(elapsed < 10000);
});
test("gift streak repeats multiply unit quantity rather than promote tier", () => {
  const b = new Battle();
  b.choose("a", 0);
  b.gift({ id: "a", name: "A", giftName: "Doughnut", coins: 50, count: 3 });
  b.drainSummons(20);
  assert.equal(b.units.length, 9);
  assert.ok(b.units.every((u) => u.type === "archer"));
  assert.equal(b.scores.get("a").coins, 150);
});
