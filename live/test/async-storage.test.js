import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { League } from "../src/league.js";
import { Battle } from "../src/game.js";
import { RoundManager } from "../src/rounds.js";
test("runtime checkpoints serialize and fsync in worker; shutdown retains latest receipts and result", async () => {
  const dir = await mkdtemp("/tmp/pw-async-test-");
  const league = new League(dir, { asyncPersistence: true });
  try {
    const battle = new Battle(),
      rounds = new RoundManager(battle, league);
    battle.choose("a", 0, "A");
    battle.spawn(0, "sword", 1, "A", "a");
    league.receipt("gift:durable");
    // A runtime checkpoint must never call the synchronous fallback.
    const sync = league.flush;
    league.flush = () => {
      throw Error("Synchronous runtime flush");
    };
    for (let i = 0; i < 100; i++)
      league.data.history.push({
        id: "old" + i,
        aborted: true,
        players: Object.fromEntries(
          Array.from({ length: 50 }, (_, n) => [
            "u" + n,
            { id: "u" + n, name: "Viewer", team: 0, points: n },
          ]),
        ),
      });
    league.dirty = true;
    league.checkpoint();
    rounds.finish("timeout");
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      try {
        const saved = JSON.parse(await readFile(dir + "/league.json", "utf8"));
        if (saved.active?.finished) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(
      JSON.parse(await readFile(dir + "/league.json", "utf8")).active.finished,
      true,
    );
    assert.equal(league.persistenceError, null);
    league.flush = sync;
    await league.close();
    const restored = new League(dir);
    assert.equal(restored.receipt("gift:durable"), false);
    assert.equal(restored.board()[0].points, 5);
  } finally {
    clearTimeout(league.flushTimer);
    if (league.worker) await league.worker.terminate();
    await rm(dir, { recursive: true, force: true });
  }
});

test("one-time presentation migration backs up the original league without losing players", async () => {
  const dir = await mkdtemp("/tmp/pw-migration-test-");
  try {
    const original = new League();
    original.start();
    original.player("stable", "Existing Player", 1);
    delete original.data.presentationVersion;
    original.data.config.results = 15;
    original.data.config.countdown = 5;
    const raw = JSON.stringify(original.data);
    await writeFile(dir + "/league.json", raw);
    const league = new League(dir);
    assert.equal(league.data.config.results, 7);
    assert.equal(league.data.config.countdown, 0);
    assert.equal(league.data.active.players.stable.name, "Existing Player");
    assert.equal(
      await readFile(dir + "/league.before-3d-v2.json", "utf8"),
      raw,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
