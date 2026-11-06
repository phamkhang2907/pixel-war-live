import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle, TYPES } from "../src/game.js";
import { League } from "../src/league.js";
import { RoundManager } from "../src/rounds.js";
import { TikTokIngest } from "../src/tiktok.js";
import { validateGiftMappings, verifiedDragonGift } from "../src/gifts.js";
import { MONSTERS, WORLD } from "../src/characters.js";
const run = (b, s) => {
  for (let t = 0; t < s; t += 0.05) b.tick(0.05);
};
const setup = () => {
  const b = new Battle(),
    l = new League(),
    r = new RoundManager(b, l);
  r.config.prepare = 0;
  r.phase = "combat";
  r.gates();
  return { b, l, r };
};
test("exactly two automatic kings per gate, stable on repeated begin, no summon XP; reset gives four new defenders", () => {
  const { b, l, r } = setup();
  const first = b.units.map((u) => u.id);
  assert.equal(b.units.length, 4);
  for (const team of [0, 1]) {
    const kings = b.units.filter((u) => u.team === team);
    assert.equal(kings.length, 2);
    assert.ok(
      kings.every(
        (u) =>
          u.type === "mushroomKing" &&
          u.userId === null &&
          u.origin === "castleDefender",
      ),
    );
    assert.deepEqual(
      kings.map((u) => u.y),
      [WORLD.ground - MONSTERS.gateSide, WORLD.ground + MONSTERS.gateSide],
    );
    assert.ok(
      kings.every((u) => (u.x - WORLD.castles[team]) * (team ? -1 : 1) > 0),
    );
  }
  r.begin();
  assert.deepEqual(
    b.units.map((u) => u.id),
    first,
  );
  assert.equal(l.board().length, 0);
  r.start();
  assert.equal(b.units.length, 4);
  assert.ok(b.units.every((u) => !first.includes(u.id)));
  assert.equal(b.spawn(0, "mushroomKing", 1), 0);
});
test("defenders stay home, never hurt allies, launch traveling magic and damage only enemies", () => {
  const { b } = setup(),
    king = b.units[0],
    home = [king.x, king.y];
  b.spawn(1, "sword", 1, "Enemy", null);
  const enemy = b.units.at(-1);
  Object.assign(enemy, {
    x: king.x + 250,
    y: king.y,
    hp: 500,
    maxHp: 500,
    windup: 100,
  });
  b.spawn(0, "sword", 1, "Friend", null);
  const friend = b.units.at(-1);
  Object.assign(friend, { x: king.x + 200, y: king.y, windup: 100 });
  run(b, 0.85);
  assert.ok(b.projectiles.some((p) => p.kind === "kingMagic"));
  assert.equal(enemy.hp, 500);
  run(b, 2);
  assert.ok(enemy.hp < 500);
  assert.equal(friend.hp, 100);
  assert.deepEqual([king.x, king.y], home);
  run(b, 4);
  assert.deepEqual([king.x, king.y], home);
});
test("frost/red allegiance and fire/blue allegiance remain independent; breaths damage area and only frost slows", () => {
  for (const [type, team] of [
    ["frostDragon", 0],
    ["fireDragon", 1],
  ]) {
    const b = new Battle();
    b.spawn(team, type, 1, "Summoner", "viewer");
    const dragon = b.units[0];
    Object.assign(dragon, { x: 2200, y: 1600, cd: 0, windup: 0 });
    b.spawn(1 - team, "sword", 2, "Enemy", null);
    for (const [i, e] of b.units.slice(1).entries())
      Object.assign(e, {
        x: 2400 + i * 35,
        y: 1600,
        hp: 500,
        maxHp: 500,
        windup: 100,
      });
    run(b, 0.8);
    assert.ok(b.units.slice(1).every((e) => e.hp < 500));
    assert.ok(
      b.effects.some(
        (e) => e.type === "dragonBreath" && e.element === TYPES[type].element,
      ),
    );
    assert.equal(dragon.team, team);
    assert.ok(
      b.units
        .slice(1)
        .every((e) =>
          type === "frostDragon" ? e.slowUntil > b.time : !e.slowUntil,
        ),
    );
  }
});
test("frost slow is temporary and actually reduces frame-independent movement; ground melee cannot hit dragons", () => {
  const a = new Battle(),
    b = new Battle();
  for (const g of [a, b]) {
    g.spawn(0, "sword", 1);
    Object.assign(g.units[0], { x: 1000, y: 1600, windup: 0 });
  }
  a.units[0].slowUntil = 3;
  run(a, 1);
  run(b, 1);
  assert.ok(a.units[0].x - 1000 < (b.units[0].x - 1000) * 0.7);
  run(a, 3);
  assert.ok(a.time > a.units[0].slowUntil);
  const c = new Battle();
  c.spawn(0, "fireDragon", 1);
  c.spawn(1, "sword", 1);
  Object.assign(c.units[0], { x: 2000, y: 1600, cd: 100 });
  Object.assign(c.units[1], { x: 2010, y: 1600, cd: 0, windup: 0 });
  run(c, 1);
  assert.equal(c.units[0].hp, TYPES.fireDragon.hp);
});
test("dragon cap retains FIFO remainder; accepted summons are never discarded", () => {
  const b = new Battle();
  b.enqueue(0, "fireDragon", 15, "Demo", null, "demo");
  for (let i = 0; i < 10; i++) b.drainSummons();
  assert.equal(b.units.length, MONSTERS.maxDragons);
  assert.equal(b.summonQueue[0].remaining, 3);
  for (const u of b.units) u.hp = 0;
  run(b, 2.6);
  assert.equal(b.units.filter((u) => u.hp > 0).length, 3);
  assert.equal(b.summonQueue.length, 0);
});
test("LIVE IDs require connector metadata; demo cannot verify or overwrite live evidence, exact premium selection only", () => {
  const b = new Battle();
  const row = {
    key: "test-only",
    giftId: "990001",
    giftName: "Dragon Flame",
    type: "fireDragon",
    count: 1,
    enabled: true,
  };
  assert.throws(() => validateGiftMappings([row], b.giftCatalog), /exact ID/);
  b.giftCatalog.set(row.giftId, {
    giftId: row.giftId,
    giftName: row.giftName,
    source: "demo",
  });
  assert.equal(verifiedDragonGift(row, b.giftCatalog), false);
  b.giftCatalog.set(row.giftId, {
    giftId: row.giftId,
    giftName: row.giftName,
    source: "live",
  });
  assert.equal(
    validateGiftMappings([row], b.giftCatalog)[0].giftId,
    row.giftId,
  );
  assert.throws(() =>
    validateGiftMappings([{ ...row, giftName: "Dragon" }], b.giftCatalog),
  );
  assert.equal(
    validateGiftMappings([{ ...row, type: "frostDragon" }], b.giftCatalog)[0]
      .type,
    "frostDragon",
  );
  assert.throws(() =>
    validateGiftMappings([{ ...row, minCoins: 1000 }], b.giftCatalog),
  );
  b.giftMappings = [row];
  const live = new TikTokIngest(b),
    demo = new TikTokIngest(b, { source: "demo" }),
    user = { userId: "live-id", nickname: "Actual viewer fixture" };
  b.choose(user.userId, 1);
  const event = {
    user,
    giftId: row.giftId,
    giftDetails: { giftName: row.giftName, giftType: 1 },
    repeatCount: 2,
    groupId: "unique-streak",
    repeatEnd: false,
    common: { msgId: "start" },
  };
  assert.equal(live.gift(event).pending, true);
  assert.equal(b.summonQueue.length, 0);
  assert.equal(
    live.gift({ ...event, repeatEnd: true, common: { msgId: "final" } }).queued,
    2,
  );
  assert.equal(
    live.gift({ ...event, repeatEnd: true, common: { msgId: "another-final" } })
      .duplicate,
    true,
  );
  demo.gift({ ...event, groupId: "demo-try", common: { msgId: "demo-test" } });
  assert.equal(b.giftCatalog.get(row.giftId).source, "live");
  b.drainSummons();
  assert.equal(b.units.length, 2);
  assert.ok(b.units.every((u) => u.type === "fireDragon" && u.team === 1));
});

test("exact Lion LIVE event verifies its actual ID and binds Frost once; Demo cannot auto-verify it", () => {
  const { b } = setup();
  b.choose("lion-viewer", 1);
  const data = {
    user: { userId: "lion-viewer", nickname: "Lion fixture" },
    giftId: "990002",
    giftDetails: { giftName: "Lion", giftType: 1 },
    repeatCount: 1,
    repeatEnd: true,
    groupId: "lion-group",
    common: { msgId: "lion-final" },
  };
  new TikTokIngest(b, { source: "demo" }).gift({
    ...data,
    groupId: "demo-group",
    common: { msgId: "demo-lion" },
  });
  assert.equal(
    b.giftMappings.find((r) => r.key === "lion-frost").enabled,
    false,
  );
  const result = new TikTokIngest(b).gift(data);
  assert.equal(result.queued, 1);
  b.drainSummons();
  assert.equal(
    b.units.filter((u) => u.type === "frostDragon" && u.team === 1).length,
    1,
  );
  assert.equal(
    b.giftMappings.find((r) => r.key === "lion-frost").giftId,
    "990002",
  );
});

test("MOCK catalog confirms owner-supplied 13604/6646 without generating any gift rewards; unrelated IDs never bind", () => {
  const { b, l } = setup();
  const fire = b.giftMappings.find((r) => r.key === "dragon-fire"),
    ice = b.giftMappings.find((r) => r.key === "ice-summon");
  assert.equal(fire.giftId, "13604");
  assert.equal(ice.giftId, "6646");
  assert.equal(fire.enabled, false);
  assert.equal(ice.enabled, false);
  const fixture = [
    { id: 13604, name: "Rồng lửa", diamond_count: 0 },
    { id: 6646, name: "Triệu hồi rồng băng", diamond_count: 0 },
    { id: 990099, name: "Other Dragon-themed Gift", diamond_count: 0 },
  ];
  new TikTokIngest(b, { source: "demo" }).catalog(fixture);
  assert.equal(fire.enabled, false);
  new TikTokIngest(b).catalog(fixture);
  assert.equal(fire.enabled, true);
  assert.equal(ice.enabled, true);
  assert.equal(verifiedDragonGift(fire, b.giftCatalog), true);
  assert.equal(verifiedDragonGift(ice, b.giftCatalog), true);
  assert.equal(b.giftMappings.find((r) => r.key === "lion-frost").giftId, "");
  assert.equal(b.units.length, 4);
  assert.equal(l.board().length, 0);
  assert.deepEqual(b.teamScore, [0, 0]);
});

test("native pending binding cannot retain a coin fallback or duplicate an older exact-ID reward", () => {
  const { b } = setup(),
    row = b.giftMappings.find((r) => r.key === "dragon-fire");
  row.minCoins = 1;
  row.count = 20;
  b.giftMappings.unshift({
    key: "old-fixture",
    giftId: "13604",
    giftName: "Old fixture",
    type: "cavalry",
    count: 1,
    enabled: true,
  });
  new TikTokIngest(b).catalog([
    { id: 13604, name: "Rồng lửa", diamond_count: 0 },
  ]);
  assert.equal(row.count, 1);
  assert.equal(row.minCoins, undefined);
  assert.equal(b.giftMappings[0].enabled, false);
  assert.doesNotThrow(() =>
    validateGiftMappings(b.giftMappings, b.giftCatalog),
  );
});
