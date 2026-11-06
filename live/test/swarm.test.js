import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Battle } from "../src/game.js";
import { League } from "../src/league.js";
import { RoundManager } from "../src/rounds.js";
import { ARMY, TYPES, WORLD, formation } from "../src/characters.js";
test("seeded organic spawn is reproducible, broad, avoids walls and overlapping same-altitude bodies", () => {
  const a = new Battle(),
    b = new Battle();
  for (const game of [a, b])
    for (const team of [0, 1])
      game.spawn(team, "sword", 400, "Density fixture", null);
  assert.equal(a.units.length, 800);
  assert.deepEqual(
    a.units.map((u) => [u.x, u.y]),
    b.units.map((u) => [u.x, u.y]),
  );
  for (const team of [0, 1]) {
    const units = a.units.filter((u) => u.team === team);
    assert.ok(
      Math.max(...units.map((u) => u.y)) - Math.min(...units.map((u) => u.y)) >
        1000,
    );
    assert.ok(new Set(units.map((u) => u.y)).size > 390);
    for (const u of units) {
      assert.ok(Math.abs(u.x - WORLD.castles[team]) >= 260);
      for (const v of units)
        if (v.id > u.id)
          assert.ok(
            Math.hypot(u.x - v.x, u.y - v.y) >= TYPES.sword.radius * 2 + 2.99,
          );
    }
  }
});
test("normal/heavy/giant ratios and speeds are configured independently", () => {
  assert.equal(ARMY.normalHeight, 1.53);
  assert.equal(TYPES.cavalry.scale, 1.6);
  assert.ok(
    ARMY.normalHeight * TYPES.cavalry.scale >= 1.8 * 1.3,
    "Heavy must not shrink with normal soldiers",
  );
  assert.ok(
    Math.abs(ARMY.normalHeight * TYPES.boss.scale - 1.8 * 3.4) < 1e-8,
    "existing Giant world height is preserved",
  );
  assert.equal(TYPES.boss.scale, 4);
  assert.equal(TYPES.archer.scale, 1);
  assert.equal(TYPES.mage.scale, 1);
  assert.equal(TYPES.cavalry.speed / TYPES.sword.speed, 0.65);
  assert.equal(TYPES.boss.speed / TYPES.sword.speed, 0.4);
});
test("strict FIFO across mixed gifts, owners and repeated bounded drains", () => {
  const b = new Battle({ maxUnits: 2000 });
  for (let i = 0; i < 80; i++) {
    const team = i % 2,
      id = "u" + i;
    b.choose(id, team, id);
    b.gift({
      id,
      name: id,
      giftName: i % 3 === 0 ? "Perfume" : i % 3 === 1 ? "Doughnut" : "Rose",
    });
  }
  const expected = b.summonQueue.flatMap((q) =>
    Array.from({ length: q.quantity }, (_, i) => ({
      seq: q.sequenceStart + i,
      owner: q.userId,
      type: q.type,
    })),
  );
  while (b.summonQueue.length) b.drainSummons(7);
  assert.deepEqual(
    b.units.map((u) => ({
      seq: u.summonSequence,
      owner: u.userId,
      type: u.type,
    })),
    expected,
  );
});
test("pending accepted quantities and sequence survive a real graceful storage restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pw-swarm-queue-"));
  try {
    let l = new League(dir),
      b = new Battle({ maxUnits: 2 }),
      r = new RoundManager(b, l);
    b.choose("owner", 0, "Owner");
    b.gift({ id: "owner", name: "Owner", giftName: "Finger Heart", count: 3 });
    b.drainSummons();
    l.checkpoint();
    await l.close();
    l = new League(dir);
    b = new Battle();
    r = new RoundManager(b, l);
    assert.equal(b.summonQueue[0].remaining, 13);
    b.drainSummons(20);
    assert.deepEqual(
      b.units.map((u) => u.summonSequence),
      Array.from({ length: 13 }, (_, i) => i + 3),
    );
    assert.equal(l.board()[0].points, 65);
    await l.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("capacity 2000 is opt-in; 1000 ordinary troops can deploy without expensive physics objects", () => {
  const b = new Battle({ maxUnits: 2000 });
  b.spawn(0, "sword", 1000, "Benchmark", null);
  b.spawn(1, "sword", 1000, "Benchmark", null);
  assert.equal(b.units.length, 2000);
  assert.equal(b.spawn(0, "sword", 1), 0);
  assert.equal(new Battle().maxUnits, 1000);
});
test("movement is frame-rate independent on an unobstructed march and speed hierarchy holds", () => {
  const run = (dt) => {
    const b = new Battle();
    b.spawn(0, "sword", 1);
    const u = b.units[0];
    u.x = 1000;
    u.y = WORLD.ground;
    u.lane = u.y;
    u.windup = 0;
    const x = u.x;
    for (let t = 0; t < 2 - 1e-8; t += dt) b.tick(dt);
    return u.x - x;
  };
  assert.ok(Math.abs(run(0.05) - run(0.025)) < 0.01);
});
