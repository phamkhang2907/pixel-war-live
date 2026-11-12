// These existing unit fixtures isolate summon/scoring behavior; monster tests cover default automatic defenders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Battle } from "../src/game.js";
import { League } from "../src/league.js";
import { RoundManager } from "../src/rounds.js";
test("spawn footprint grows into three jittered depth bands, maintaining FIFO and capacity", () => {
  const b = new Battle({ maxUnits: 2000 });
  b.spawn(0, "sword", 1000, "fixture", null);
  b.spawn(1, "sword", 1000, "fixture", null);
  assert.equal(b.units.length, 2000);
  for (const team of [0, 1]) {
    const u = b.units.filter((u) => u.team === team);
    assert.deepEqual([...new Set(u.map((u) => u.spawnBand))].sort(), [0, 1, 2]);
    assert.ok(new Set(u.map((u) => u.y)).size > 990);
    assert.ok(
      Math.max(...u.map((u) => u.y)) - Math.min(...u.map((u) => u.y)) > 2800,
    );
  }
});
test("64-unit timed batches materially increase deployment while conserving pending quantities", () => {
  const run = (batch) => {
    const b = new Battle({ spawnBatch: batch });
    b.enqueue(0, "sword", 500);
    b.enqueue(1, "sword", 500);
    for (let i = 0; i < 20; i++) b.drainSummons();
    const pending = b.summonQueue.reduce((n, q) => n + q.remaining, 0);
    assert.equal(b.units.length + pending, 1000);
    assert.ok(b.units.every((u, i) => u.summonSequence === i + 1));
    return b.units.length;
  };
  const before = run(8),
    after = run(64);
  console.log({ oneSecondTicks20: { before, after } });
  assert.ok(after >= before * 3);
});
test("STOP survives clocks and graceful storage restart; Reset waits for explicit Start; repeated Pause is idempotent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pw-controls-"));
  try {
    let l = new League(dir),
      b = new Battle(),
      r = new RoundManager(b, l, { defenders: false, baseline: false });
    r.configure({
      duration: 3,
      prepare: 0,
      final: 0,
      results: 1,
      countdown: 0,
    });
    r.start();
    b.enqueue(0, "sword", 50);
    r.setPaused(true);
    r.setPaused(true);
    r.advance(60);
    assert.equal(b.units.length, 0);
    assert.equal(r.elapsed, 0);
    r.setPaused(false);
    r.advance(0.05);
    assert.ok(b.units.length > 0);
    r.stop();
    const id = r.snapshot().id;
    r.advance(100);
    assert.equal(r.phase, "stopped");
    assert.equal(r.snapshot().id, id);
    await l.close();
    l = new League(dir);
    b = new Battle();
    r = new RoundManager(b, l, { defenders: false, baseline: false });
    assert.equal(r.phase, "stopped");
    r.advance(100);
    assert.equal(r.phase, "stopped");
    r.resetReady();
    r.advance(100);
    assert.equal(r.phase, "ready");
    r.begin();
    assert.equal(r.phase, "combat");
    r.advance(0.05);
    assert.equal(r.elapsed, 0.05);
    await l.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
