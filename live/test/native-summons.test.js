import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle, TYPES } from "../src/game.js";
import { TikTokIngest } from "../src/tiktok.js";
test("native notification gift quantity differs from troop count; deployment records are exact, attributed and replay safe", () => {
  const b = new Battle(),
    ingest = new TikTokIngest(b, { source: "demo" }),
    user = {
      userId: "native-user",
      nickname: "Native Viewer",
      avatarThumb: { urlList: ["/assets/ui/kit/IMG_4974.PNG"] },
    };
  ingest.chat({ user, comment: "1" });
  const event = {
    user,
    giftId: "fixture-only",
    giftDetails: {
      giftName: "Finger Heart",
      giftType: 1,
      giftImage: { urlList: ["/assets/ui/kit/IMG_4974.PNG"] },
    },
    repeatCount: 3,
    repeatEnd: true,
    groupId: "native-one",
    common: { msgId: "native-final" },
  };
  assert.equal(ingest.gift(event).queued, 15);
  assert.equal(
    ingest.gift({ ...event, common: { msgId: "other-final" } }).duplicate,
    true,
  );
  assert.equal(b.summonEvents.length, 0);
  b.drainSummons();
  const snapshot = b.snapshot();
  assert.equal(snapshot.summonProtocol, 1);
  assert.equal(snapshot.events[0].giftQuantity, 3);
  assert.equal(snapshot.events[0].count, 15);
  assert.equal(snapshot.events[0].avatar, user.avatarThumb.urlList[0]);
  assert.equal(snapshot.events[0].giftIcon, user.avatarThumb.urlList[0]);
  assert.equal(
    snapshot.summons.reduce((n, e) => n + e.count, 0),
    15,
  );
  assert.ok(
    snapshot.summons.every(
      (e) => e.name === "Native Viewer" && e.team === 0 && e.type === "sword",
    ),
  );
  assert.equal(b.units.length, 15);
});
test("ordinary gift cohorts are compact, seeded, non-overlapping and run after emergence", () => {
  const b = new Battle();
  b.choose("viewer", 0);
  b.gift({ id: "viewer", name: "Group", giftName: "Finger Heart", count: 3 });
  b.drainSummons();
  const center = b.summonEvents[0];
  assert.ok(
    b.units.every((u) => Math.hypot(u.x - center.x, u.y - center.y) < 150),
  );
  for (let i = 0; i < b.units.length; i++)
    for (let j = i + 1; j < b.units.length; j++)
      assert.ok(
        Math.hypot(b.units[i].x - b.units[j].x, b.units[i].y - b.units[j].y) >=
          TYPES.sword.radius * 2 + 2.9,
      );
  assert.deepEqual(
    b.units.map((u) => u.summonSequence),
    Array.from({ length: 15 }, (_, i) => i + 1),
  );
  for (let i = 0; i < 20; i++) b.tick(0.05);
  assert.ok(b.units.every((u) => u.state === "run"));
  assert.ok(b.units.every((u) => u.bornAt === 0));
});
test("crowded gift cohorts retain FIFO and reach capacity rather than stalling a head request", () => {
  const b = new Battle();
  for (const team of [0, 1]) {
    b.choose("viewer" + team, team);
    b.gift({ id: "viewer" + team, giftName: "Finger Heart", count: 100 });
  }
  for (let i = 0; i < 160 && b.summonQueue.length; i++) b.drainSummons();
  assert.equal(b.units.length, 1000);
  assert.equal(b.summonQueue.length, 0);
  assert.ok(
    b.units.every(
      (u, i, a) => !i || u.summonSequence > a[i - 1].summonSequence,
    ),
  );
  assert.ok(b.summonEvents.length <= 128);
});
test("video icon URLs and untrusted avatar schemes are not published as native image media", () => {
  const b = new Battle();
  b.choose("viewer", 1);
  b.gift({
    id: "viewer",
    giftName: "Rose",
    avatar: "javascript:alert(1)",
    giftIcon: "https://example.com/overlay.mp4",
  });
  b.drainSummons();
  assert.equal(b.events[0].avatar, "");
  assert.equal(b.events[0].giftIcon, "");
  assert.equal(b.summonEvents[0].giftIcon, "");
});
