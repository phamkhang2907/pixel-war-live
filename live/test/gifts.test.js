import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/game.js";
import { League } from "../src/league.js";
import { RoundManager } from "../src/rounds.js";
import { TikTokIngest } from "../src/tiktok.js";
import {
  DEFAULT_GIFT_MAPPINGS,
  validateGiftMappings,
  CASTLE_GUARDIAN,
} from "../src/gifts.js";
import { calendarBoard } from "../src/hud-data.js";
const setup = () => {
  const league = new League(),
    battle = new Battle(),
    rounds = new RoundManager(battle, league),
    ingest = new TikTokIngest(battle);
  const user = { userId: "stable", nickname: "Viewer" };
  ingest.chat({ user, comment: "1" });
  return { league, battle, rounds, ingest, user };
};
const gift = (user, extra = {}) => ({
  user,
  giftId: "actual-id-from-connector",
  giftDetails: { giftName: "Rose", diamondCount: 1, giftType: 1 },
  repeatCount: 3,
  repeatEnd: true,
  groupId: "group",
  common: { msgId: "message" },
  ...extra,
});
test("four proposed mappings use connector names, not guessed coin prices", () => {
  const { battle } = setup();
  for (const [giftName, count, type] of [
    ["Rose", 1, "sword"],
    ["Finger Heart", 5, "sword"],
    ["Doughnut", 3, "archer"],
    ["Perfume", 2, "mage"],
  ]) {
    assert.equal(
      battle.gift({ id: "stable", name: "Viewer", giftName }).queued,
      count,
    );
    battle.drainSummons(50);
    assert.equal(
      battle.units.filter((u) => u.type === type).length,
      type === "sword" ? (giftName === "Rose" ? 1 : 6) : count,
    );
  }
  assert.deepEqual(battle.teamScore, [0, 0]);
  assert.equal(battle.units.length, 11);
});
test("exact observed ID overrides name, and an admin can configure Heavy/Giant tiers", () => {
  const { battle } = setup();
  battle.giftMappings = validateGiftMappings([
    ...DEFAULT_GIFT_MAPPINGS,
    {
      key: "actual-heavy",
      giftId: "900001",
      giftName: "Rose",
      type: "cavalry",
      count: 2,
      enabled: true,
    },
  ]);
  assert.equal(
    battle.gift({
      id: "stable",
      name: "Viewer",
      giftId: "900001",
      giftName: "Rose",
      coins: 17,
    }).queued,
    2,
  );
  battle.drainSummons();
  assert.ok(battle.units.every((u) => u.type === "cavalry"));
  assert.equal(battle.teamScore[0], 17);
});
test("Guardian and dragons are rejected in mappings; castle Guardian reserved and disabled", () => {
  for (const type of ["guardian", "fireDragon", "frostDragon"])
    assert.throws(() =>
      validateGiftMappings([{ ...DEFAULT_GIFT_MAPPINGS[0], type }]),
    );
  assert.equal(CASTLE_GUARDIAN.enabled, false);
  assert.equal(CASTLE_GUARDIAN.perCastle, 1);
});
test("streak progress does not spawn; changed final msg IDs for one group cannot duplicate summons/XP", () => {
  const { battle, league, ingest, user } = setup();
  const d = gift(user);
  ingest.gift({ ...d, repeatEnd: false });
  assert.equal(battle.summonQueue.length, 0);
  ingest.gift(d);
  ingest.gift({ ...d, common: { msgId: "different-final" } });
  battle.drainSummons(50);
  assert.equal(battle.units.length, 3);
  assert.equal(league.board()[0].points, 15);
  assert.equal(battle.teamScore[0], 3);
});
test("a recreated connector cannot replay a completed gift because the receipt is authoritative", () => {
  const { battle, league, ingest, user } = setup();
  ingest.gift(gift(user));
  new TikTokIngest(battle).gift(gift(user, { common: { msgId: "another" } }));
  battle.drainSummons(50);
  assert.equal(battle.units.length, 3);
  assert.equal(league.board()[0].points, 15);
});
test("fresh completed gifts during results queue once for the next round; frozen results stay unchanged", () => {
  const { battle, rounds, ingest, user } = setup();
  ingest.gift(gift(user));
  battle.drainSummons();
  rounds.finish("timeout");
  const result = structuredClone(rounds.result);
  const late = gift(user, { groupId: "late", common: { msgId: "late" } });
  assert.equal(ingest.gift(late).queued, 3);
  assert.equal(battle.drainSummons(), 0);
  assert.deepEqual(rounds.result, result);
  rounds.start();
  assert.equal(ingest.gift(late).duplicate, true);
  battle.drainSummons();
  assert.equal(battle.units.length, 3);
});
test("observed ongoing streaks complete across a round boundary; unknown old events are rejected", () => {
  const { battle, rounds, ingest, user } = setup();
  const d = gift(user);
  ingest.gift({ ...d, repeatEnd: false });
  rounds.start();
  assert.equal(ingest.gift(d).queued, 3);
  assert.ok(
    ingest.gift(
      gift(user, {
        groupId: "old",
        common: { msgId: "old", createTime: Date.now() - 5000 },
      }),
    ).error,
  );
  assert.equal(battle.summonQueue.length, 1);
});
test("accepted gifts stay FIFO at capacity and carry through round results without phantom XP", () => {
  const { battle, league, rounds } = setup();
  battle.maxUnits = 20;
  battle.spawnBatch = 8;
  const a = battle.gift({
    id: "stable",
    name: "Viewer",
    giftName: "Finger Heart",
    count: 1000,
  });
  const b = battle.gift({
    id: "stable",
    name: "Viewer",
    giftName: "Doughnut",
    count: 2,
  });
  assert.equal(a.queued, 5000);
  assert.equal(b.sequenceStart, a.sequenceEnd + 1);
  assert.equal(league.board()[0].points, 0);
  assert.equal(battle.drainSummons(), 8);
  assert.equal(league.board()[0].points, 40);
  battle.drainSummons(100);
  assert.equal(battle.units.length, 20);
  assert.equal(battle.drainSummons(), 0);
  const remaining = battle.summonQueue.reduce((n, q) => n + q.remaining, 0);
  rounds.finish("timeout");
  rounds.start();
  assert.equal(
    battle.summonQueue.reduce((n, q) => n + q.remaining, 0),
    remaining,
  );
  assert.equal(battle.drainSummons(), 8);
  assert.ok(battle.units.every((u) => u.type === "sword"));
  assert.equal(league.board()[0].points, 40);
});
test("a valid gift burst is queued compactly; deployment rather than acceptance is rate limited", () => {
  const { battle } = setup();
  battle.spawnBatch = 8;
  for (let i = 0; i < 100; i++)
    assert.equal(
      battle.gift({ id: "stable", giftName: "Rose", coins: 1 }).queued,
      1,
    );
  assert.equal(battle.summonQueue.length, 100);
  assert.equal(battle.units.length, 0);
  assert.equal(battle.teamScore[0], 100);
  assert.equal(battle.drainSummons(), 8);
  assert.deepEqual(
    battle.units.map((u) => u.summonSequence),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});
test("seven-second results use wall seconds even in accelerated demo; next-round reset preserves calendar rankings", () => {
  const { battle, rounds, league } = setup();
  battle.gift({ id: "stable", name: "Viewer", giftName: "Rose" });
  battle.drainSummons();
  battle.castles[1] = 9000;
  rounds.finish("timeout");
  const first = rounds.result.id;
  assert.equal(rounds.snapshot().state, "ROUND_RESULTS");
  assert.equal(rounds.result.winner, 0);
  rounds.settle();
  assert.equal(league.data.history.length, 1);
  rounds.advance(6, 8);
  assert.equal(rounds.phase, "results");
  assert.equal(Math.ceil(rounds.snapshot().phaseRemaining), 1);
  rounds.advance(1, 8);
  assert.notEqual(rounds.snapshot().id, first);
  assert.equal(league.board().length, 0);
  assert.equal(calendarBoard(league, "weekly").players[0].points, 35);
});

test("protobuf groupId zero is absent; distinct non-streak gifts must both summon", () => {
  const { battle, ingest, user } = setup();
  for (const msgId of ["one", "two"])
    ingest.gift(
      gift(user, {
        groupId: "0",
        giftDetails: { giftName: "Rose", giftType: 0, diamondCount: 1 },
        repeatCount: 1,
        common: { msgId },
      }),
    );
  battle.drainSummons();
  assert.equal(battle.units.length, 2);
  assert.equal(battle.teamScore[0], 2);
});
test("protobuf zero group ID still deduplicates identical final message IDs", () => {
  const { battle, ingest, user } = setup();
  const d = gift(user, { groupId: "0" });
  ingest.gift(d);
  ingest.gift(d);
  battle.drainSummons();
  assert.equal(battle.units.length, 3);
});

test("protobuf zero repeatCount on a non-streak gift means one event, not a missing summon", () => {
  const { battle, ingest, user } = setup();
  ingest.gift(
    gift(user, {
      groupId: "0",
      giftDetails: { giftName: "Rose", giftType: 0, diamondCount: 1 },
      repeatCount: 0,
    }),
  );
  battle.drainSummons();
  assert.equal(battle.units.length, 1);
});
