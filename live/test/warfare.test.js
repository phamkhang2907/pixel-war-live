import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/game.js";
import { League } from "../src/league.js";
import { RoundManager } from "../src/rounds.js";
import { TikTokIngest } from "../src/tiktok.js";
import {
  tickFlyby,
  tickWarfare,
  queueRaid,
  teamCommand,
} from "../src/warfare.js";
import { WORLD } from "../src/characters.js";
import { deserializeMessage } from "tiktok-live-connector";
import {
  WebcastLikeMessage,
  User,
  CommonMessageData,
} from "tiktok-live-proto/v3";

const setup = (warfare = {}) => {
  const g = new Battle({ warfare }),
    l = new League();
  l.data.warfare = { ...g.warfareConfig };
  const r = new RoundManager(g, l);
  return { g, l, r };
};
const step = (g, seconds) => {
  for (let n = 0; n < Math.round(seconds / 0.05); n++) g.tick(0.05);
};
test("every round starts with equal real armies, no viewer identities or dragons, and immediate combat", () => {
  const { g, r, l } = setup();
  assert.equal(g.units.length, 304);
  assert.equal(r.phase, "combat");
  assert.equal(r.snapshot().remaining, 600);
  assert.deepEqual(g.castles, [500000, 500000]);
  for (const team of [0, 1]) {
    assert.equal(
      g.units.filter((u) => u.team === team && u.type === "mushroomKing")
        .length,
      2,
    );
    for (const [type, n] of Object.entries({
      sword: 90,
      cavalry: 30,
      archer: 20,
      mage: 10,
    }))
      assert.equal(
        g.units.filter((u) => u.team === team && u.type === type).length,
        n,
      );
  }
  assert.equal(g.units.filter((u) => u.type.endsWith("Dragon")).length, 0);
  assert.ok(
    g.units
      .filter((u) => u.origin === "baseline")
      .every(
        (u) => u.name === "" && u.userId === null && u.summonSequence === null,
      ),
  );
  assert.equal(l.board("round").length, 0);
  assert.equal(g.summonEvents.length, 0);
  step(g, 4);
  assert.ok(g.battleScore.some((n) => n > 0));
  assert.ok(g.units.some((u) => u.state === "attack" || u.state === "run"));
  r.start();
  assert.equal(g.units.length, 304);
  assert.equal(g.battleScore[0], 0);
});
test("symmetric baseline waves retain viewer troops and their numerical advantage", () => {
  const { g } = setup({
    initialPerTeam: 0,
    reinforcementInterval: 2,
    reinforcementFloor: 5,
    reinforcementBatch: 4,
  });
  for (const t of [0, 1]) g.spawn(t, "sword", 3, "", null, null, "baseline");
  g.spawn(0, "sword", 5, "Viewer", "real-id", null, "gift");
  const ids = g.units.filter((u) => u.userId === "real-id").map((u) => u.id);
  g.time = 2;
  tickWarfare(g, 0.05);
  for (const t of [0, 1])
    assert.equal(
      g.units.filter(
        (u) => u.team === t && ["baseline", "reinforcement"].includes(u.origin),
      ).length,
      7,
    );
  assert.deepEqual(
    g.units.filter((u) => u.userId === "real-id").map((u) => u.id),
    ids,
  );
  assert.equal(
    g.units.filter((u) => u.team === 0).length -
      g.units.filter((u) => u.team === 1).length,
    5,
  );
});
test("600 seconds, 7-second results, immediate next round; score then kills break equal castle HP", () => {
  const { g, r } = setup({ initialPerTeam: 0, baselineEnabled: false });
  r.advance(570);
  assert.equal(r.phase, "final");
  assert.equal(r.snapshot().remaining, 30);
  g.battleScore = [10, 10];
  g.teamKills = [2, 3];
  r.advance(30);
  assert.equal(r.result.winner, 1);
  assert.equal(r.phase, "results");
  const old = r.snapshot().id;
  r.advance(7);
  assert.notEqual(r.snapshot().id, old);
  assert.equal(r.phase, "combat");
  assert.equal(r.snapshot().remaining, 600);
  g.battleScore = [2, 1];
  g.teamKills = [0, 99];
  r.finish("timeout");
  assert.equal(r.result.winner, 0);
});
test("team commands are exact, accent-insensitive and never summon; switching obeys cooldown", () => {
  for (const s of ["đỏ", "do", "RED", " team   RED ", "PHE ĐỎ"])
    assert.equal(teamCommand(s), 0);
  for (const s of ["XANH", "blue", "TEAM BLUE", "phe xanh"])
    assert.equal(teamCommand(s), 1);
  for (const s of [
    "do something",
    "red dragon",
    "I love team blue",
    "tomorrow",
  ])
    assert.equal(teamCommand(s), null);
  let now = 100;
  const g = new Battle({ clock: () => now }),
    i = new TikTokIngest(g);
  i.chat({ user: { id: "123", nickname: "Real Name" }, comment: "đỏ" });
  assert.equal(g.units.length, 0);
  assert.equal(g.teams.get("123"), 0);
  assert.ok(i.chat({ user: { id: "123" }, comment: "blue" }).error);
  now += 61;
  assert.equal(i.chat({ user: { id: "123" }, comment: "blue" }).team, 1);
});
test("actual installed v3 decoder: packet count gives 2 soldiers + 7 remainder; room total is never credited", () => {
  const g = new Battle(),
    i = new TikTokIngest(g),
    user = {
      ...User.decode(new Uint8Array()),
      id: "7123456789012345678",
      nickname: "Actual Native Viewer",
    };
  g.choose(user.id, 0, user.nickname);
  const raw = {
    ...WebcastLikeMessage.decode(new Uint8Array()),
    user,
    count: 27,
    total: "900000",
    common: {
      ...CommonMessageData.decode(new Uint8Array()),
      msgId: "8123456789012345678",
    },
  };
  const decoded = deserializeMessage(
    "WebcastLikeMessage",
    WebcastLikeMessage.encode(raw).finish(),
  );
  assert.deepEqual(i.like(decoded), {
    quantity: 2,
    remainder: 7,
    raid: false,
    phase: 0,
  });
  assert.equal(i.like(decoded).duplicate, true);
  assert.equal(
    i.like({
      ...decoded,
      count: 3,
      total: "999999",
      common: { ...decoded.common, msgId: "native-like-2" },
    }).quantity,
    1,
  );
  g.drainSummons();
  assert.equal(g.units.length, 3);
  assert.ok(
    g.units.every(
      (u) =>
        u.userId === user.id &&
        u.name === user.nickname &&
        u.origin === "likes" &&
        u.roundId === g.roundId,
    ),
  );
  assert.equal(
    i.like({ user, total: "1000000", common: { msgId: "cumulative-only" } })
      .ignored,
    true,
  );
  assert.equal(i.like({ user, count: 50 }).ignored, true);
});
test("likes received before joining are consumed/discarded, not awarded retroactively", () => {
  const g = new Battle(),
    i = new TikTokIngest(g),
    p = {
      user: { id: "unjoined", nickname: "Name" },
      count: 27,
      common: { msgId: "before-join" },
    };
  assert.ok(i.like(p).error);
  g.choose("unjoined", 1, "Name");
  assert.equal(i.like(p).duplicate, true);
  assert.equal(
    i.like({ ...p, count: 3, common: { msgId: "after-join" } }).quantity,
    0,
  );
  assert.equal(g.likeRemainders.get("unjoined"), 3);
});
test("Rose streak completion summons 5 per gift exactly once with per-unit attribution", () => {
  const { g } = setup({ initialPerTeam: 0, baselineEnabled: false }),
    i = new TikTokIngest(g);
  g.choose("sender", 1, "Rose Sender");
  const p = {
    user: {
      id: "sender",
      nickname: "Rose Sender",
      avatarThumb: { urlList: ["https://example.com/avatar.png"] },
    },
    giftId: "native-rose",
    gift: { name: "Rose", type: 1, diamondCount: 1 },
    repeatCount: 2,
    groupId: "rose-group",
    common: { msgId: "rose-message" },
  };
  assert.equal(i.gift({ ...p, repeatEnd: 0 }).pending, true);
  assert.equal(i.gift({ ...p, repeatEnd: 1 }).queued, 10);
  assert.equal(i.gift({ ...p, repeatEnd: 1 }).duplicate, true);
  g.drainSummons();
  const u = g.units.filter((u) => u.userId === "sender");
  assert.equal(u.length, 10);
  assert.ok(
    u.every(
      (v) =>
        v.team === 1 &&
        v.name === "Rose Sender" &&
        v.avatar === "https://example.com/avatar.png" &&
        v.origin === "gift" &&
        v.roundId === g.roundId &&
        Number.isFinite(v.spawnTimestamp),
    ),
  );
  assert.equal(
    g.summonEvents.reduce((n, e) => n + e.count, 0),
    10,
  );
});
test("HEART WAR triggers one warning raid per team, delayed real damage, no friendly/castle damage", () => {
  const { g } = setup({ initialPerTeam: 0, baselineEnabled: false });
  g.choose("red", 0, "Red");
  g.spawn(0, "sword", 1, "Friend", "red");
  g.spawn(1, "sword", 1, "Enemy", "blue");
  const friend = g.units.find((u) => u.name === "Friend"),
    enemy = g.units.find((u) => u.name === "Enemy");
  Object.assign(friend, { x: 2500, y: 1600, hp: 5000 });
  Object.assign(enemy, { x: 2500, y: 1600, hp: 5000 });
  assert.equal(g.likes({ id: "red", name: "Red", count: 300 }).raid, true);
  assert.equal(g.pendingBombs.length, 5);
  assert.equal(g.likes({ id: "red", name: "Red", count: 300 }).raid, false);
  assert.equal(g.pendingBombs.length, 5);
  g.time = 1.9;
  tickWarfare(g, 0.05);
  assert.equal(enemy.hp, 5000);
  g.time = 3;
  tickWarfare(g, 0.05);
  assert.ok(enemy.hp < 5000);
  assert.equal(friend.hp, 5000);
  assert.deepEqual(g.castles, [500000, 500000]);
  assert.equal(g.events.filter((e) => e.kind === "raid").length, 1);
  g.time = 60;
  tickWarfare(g, 0.05);
  assert.equal(g.heart.index, 1);
  assert.deepEqual(g.heart.likes, [0, 0]);
  assert.ok(g.phaseHasteUntil[0] > g.time);
  assert.equal(g.likes({ id: "red", name: "Red", count: 300 }).raid, true);
});
test("tied HEART WAR phases have no haste winner", () => {
  const { g } = setup({ initialPerTeam: 0, baselineEnabled: false });
  g.heart.likes = [200, 200];
  g.time = 60;
  tickWarfare(g, 0.05);
  assert.equal(g.heart.lastWinner, null);
  assert.deepEqual(g.phaseHasteUntil, [0, 0]);
});
for (const [type, element] of [
  ["fireDragon", "fire"],
  ["frostDragon", "ice"],
])
  test(`${type} has a real one-pass lifetime, enemy-only damage and status`, () => {
    const { g } = setup({ initialPerTeam: 0, baselineEnabled: false });
    g.spawn(0, type, 1, "Dragon Sender", "viewer", null, "gift");
    const d = g.units.at(-1);
    g.spawn(0, "sword", 1, "Friend", "friend");
    g.spawn(1, "boss", 1, "Enemy", "enemy");
    const friend = g.units.find((u) => u.name === "Friend"),
      enemy = g.units.find((u) => u.name === "Enemy");
    const x = (d.flyby.fromX + WORLD.castles[1] + 260) / 2 + 180;
    Object.assign(friend, { x, y: WORLD.ground, hp: 5000 });
    Object.assign(enemy, { x, y: WORLD.ground, hp: 5000 });
    d.flyby.age = d.flyby.duration / 2 - 0.05;
    g.time = 4.5;
    tickFlyby(g, d, 0.05);
    assert.ok(enemy.hp < 5000);
    assert.equal(friend.hp, 5000);
    assert.equal(d.state, "fly");
    assert.ok(
      g.effects.some((e) => e.type === "dragonBreath" && e.element === element),
    );
    if (element === "fire") {
      assert.ok(enemy.burn);
      const hp = enemy.hp;
      g.time += 0.5;
      tickWarfare(g, 0.5);
      assert.ok(enemy.hp < hp);
    } else {
      assert.equal(enemy.moveSlowFactor, 0.35);
      assert.equal(enemy.attackSlowFactor, 0.5);
      assert.ok(enemy.slowUntil > g.time);
    }
    d.flyby.age = d.flyby.duration - 0.01;
    tickFlyby(g, d, 0.05);
    assert.equal(d.exited, true);
    g.tick(0);
    assert.ok(!g.units.some((u) => u.id === d.id));
    assert.deepEqual(g.castles, [500000, 500000]);
  });
test("flyby concurrency applies backpressure while preserving FIFO and all accepted summons", () => {
  const { g } = setup({
    initialPerTeam: 0,
    baselineEnabled: false,
    maxFlybys: 1,
  });
  g.enqueue(0, "fireDragon", 2, "Sender", "viewer", "demoGift");
  g.enqueue(0, "sword", 5, "Rose Sender", "rose", "demoGift");
  g.drainSummons(100);
  assert.equal(g.units.filter((u) => u.type === "fireDragon").length, 1);
  assert.equal(
    g.summonQueue.reduce((n, q) => n + q.remaining, 0),
    6,
  );
  const old = g.units.find((u) => u.type === "fireDragon");
  old.flyby.age = old.flyby.duration;
  tickFlyby(g, old, 0.05);
  g.tick(0.05);
  g.drainSummons(100);
  assert.equal(g.summonQueue.length, 0);
  const seq = g.units
    .filter((u) => u.summonSequence !== null)
    .map((u) => u.summonSequence);
  assert.deepEqual(
    seq,
    [...seq].sort((a, b) => a - b),
  );
  assert.equal(g.units.filter((u) => u.type === "sword").length, 5);
});

test("replayed team comments cannot undo a later valid switch; profile updates retain latest username", () => {
  let now = 100;
  const g = new Battle({ clock: () => now }),
    ingest = new TikTokIngest(g),
    l = new League();
  l.start();
  g.onCombat = (e) => l.event(e);
  const user = { id: "stable-replay", nickname: "First Name" };
  ingest.chat({ user, comment: "đỏ", common: { msgId: "1001" } });
  now += 61;
  ingest.chat({
    user: { ...user, nickname: "New Name" },
    comment: "xanh",
    common: { msgId: "1002" },
  });
  now += 61;
  assert.equal(
    ingest.chat({ user, comment: "đỏ", common: { msgId: "1001" } }).duplicate,
    true,
  );
  assert.equal(g.teams.get(user.id), 1);
  // Even a duplicated command may carry updated profile metadata, but no duplicate membership mutation.
  ingest.profile({ user: { userId: user.id, nickname: "Latest Name" } });
  assert.equal(l.data.profiles[user.id].name, "Latest Name");
});

test("major combat cues remain bounded and survive an ordinary melee effect storm", () => {
  const g = new Battle();
  g.effect("bombImpact", 2400, 1600, { life: 2.5 });
  for (let i = 0; i < 400; i++) g.effect("hit", 2000 + i, 1600);
  assert.equal(g.effects.length, 140);
  assert.equal(
    g.snapshot().effects.filter((e) => e.type === "bombImpact").length,
    1,
  );
  g.time = 3;
  for (let i = 0; i < 150; i++) g.effect("hit", 2400, 1600);
  assert.equal(
    g.snapshot().effects.some((e) => e.type === "bombImpact"),
    false,
  );
  assert.ok(g.effects.length <= 140);
});
