import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/game.js";
const setup = () => {
  const b = new Battle({ warfare: { baselineEnabled: false } });
  b.choose("a", 0, "A");
  b.choose("b", 1, "B");
  return b;
};
const run = (b, t) => {
  for (let n = 0; n < Math.round(t / 0.05); n++) b.tick(0.05);
};
test("likes are spendable toward one small soldier per ten; no old auto-heal or Fury triggers", () => {
  const b = setup();
  b.castles[0] = 490000;
  const r = b.likes({ id: "a", count: 27 });
  assert.deepEqual(
    { quantity: r.quantity, remainder: r.remainder },
    { quantity: 2, remainder: 7 },
  );
  b.drainSummons();
  assert.equal(b.units.length, 2);
  assert.equal(b.castles[0], 490000);
  assert.equal(b.energy[1], 0);
  assert.ok(b.likes({ id: "unknown", count: 10 }).error);
});
test("phase boundary resets milestone once and does not carry old likes into next phase", () => {
  const b = setup();
  b.likes({ id: "a", count: 300 });
  assert.equal(b.heart.raided[0], true);
  b.summonQueue = [];
  run(b, 60);
  assert.equal(b.heart.index, 1);
  assert.deepEqual(b.heart.likes, [0, 0]);
  assert.deepEqual(b.heart.raided, [false, false]);
  assert.equal(b.phaseHasteUntil[0], 70);
  assert.equal(b.likes({ id: "a", count: 300 }).raid, true);
});
test("reset clears round remainders and phase progress but retains memberships", () => {
  const b = setup();
  b.likes({ id: "a", count: 29 });
  b.reset();
  assert.equal(b.teams.get("a"), 0);
  assert.equal(b.likeRemainders.size, 0);
  assert.deepEqual(b.heart.likes, [0, 0]);
  assert.equal(b.likes({ id: "a", count: 1 }).quantity, 0);
  assert.equal(b.likes({ id: "a", count: -1 }).error, "Invalid like count");
});
test("queued raid cannot damage anything during paused/preparation simulation", () => {
  const b = setup();
  b.combatOpen = false;
  b.likes({ id: "a", count: 300 });
  assert.equal(b.pendingPowers.filter((p) => p.type === "raid").length, 1);
  assert.equal(b.pendingBombs.length, 0);
  b.combatOpen = true;
  b.tick(0.05);
  assert.equal(b.pendingBombs.length, 5);
  assert.deepEqual(b.castles, [500000, 500000]);
});
