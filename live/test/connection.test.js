import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Battle } from "../src/game.js";
import { TikTokService } from "../src/tiktok-connection.js";
const stub = (connect = async () => {}) =>
  Object.assign(new EventEmitter(), {
    connect,
    disconnect() {
      throw Error("teardown failed");
    },
  });
test("TikTok factory rejection leaves playable demo", async () => {
  const b = new Battle(),
    s = new TikTokService(b, {
      factory: async () => {
        throw Error("offline");
      },
    });
  await assert.rejects(s.connect("test"));
  assert.equal(s.mode, "demo");
  b.spawn(0, "sword", 1);
  const y = b.units[0].x;
  for (let i = 0; i < 20; i++) b.tick(0.05);
  assert.notEqual(b.units[0].x, y);
});
test("timeout, late connection, stale events cannot overwrite demo", async () => {
  const b = new Battle();
  let resolve;
  const c = stub(() => new Promise((r) => (resolve = r)));
  const s = new TikTokService(b, { factory: async () => c, timeoutMs: 15 });
  await assert.rejects(s.connect("test"));
  resolve();
  c.emit("error", Error("late"));
  assert.equal(s.mode, "demo");
  assert.equal(s.connection, null);
});
test("live failure falls back; malformed gifts do not escape callback", async () => {
  const b = new Battle(),
    c = stub(),
    s = new TikTokService(b, { factory: async () => c });
  await s.connect("test");
  assert.equal(s.mode, "live");
  c.emit("chat", null);
  c.emit("gift", null);
  c.emit("error", Error("network"));
  assert.equal(s.mode, "demo");
  await s.disconnect();
  c.emit("disconnected");
  assert.equal(s.status, "Offline");
});
test("switching to demo cancels a pending connection", async () => {
  let resolve;
  const c = stub(() => new Promise((r) => (resolve = r))),
    s = new TikTokService(new Battle(), { factory: async () => c });
  const pending = s.connect("test");
  await new Promise((r) => setImmediate(r));
  await s.disconnect();
  resolve();
  await assert.rejects(pending);
  assert.equal(s.mode, "demo");
});
