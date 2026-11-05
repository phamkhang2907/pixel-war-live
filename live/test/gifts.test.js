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
test("closed round gifts cannot be replayed into a new round; frozen result rankings remain unchanged", () => {
  const { battle, rounds, ingest, user } = setup();
  ingest.gift(gift(user));
  battle.drainSummons();
  rounds.finish("timeout");
  const result = structuredClone(rounds.result);
  const late = gift(user, { groupId: "late", common: { msgId: "late" } });
  assert.ok(ingest.gift(late).error);
  assert.deepEqual(rounds.result, result);
  rounds.start();
  assert.equal(ingest.gift(late).duplicate, true);
  battle.drainSummons();
  assert.equal(battle.units.length, 0);
});
test("streaks crossing a round boundary and old timestamped gifts are rejected", () => {
  const { battle, rounds, ingest, user } = setup();
  const d = gift(user);
  ingest.gift({ ...d, repeatEnd: false });
  rounds.start();
  assert.ok(ingest.gift(d).error);
  assert.ok(
    ingest.gift(
      gift(user, {
        groupId: "old",
        common: { msgId: "old", createTime: Date.now() - 5000 },
      }),
    ).error,
  );
  assert.equal(battle.summonQueue.length, 0);
});
test("queue drains in bounded batches, credits actual spawns only, and holds accepted requests at capacity until the round closes", () => {
  let now = 0;
  const battle = new Battle({ clock: () => now }),
    league = new League();
  league.start();
  battle.onCombat = (e) => league.event(e);
  battle.choose("a", 0);
  assert.equal(
    battle.gift({ id: "a", name: "A", giftName: "Finger Heart", count: 1000 })
      .queued,
    5000,
  );
  assert.equal(battle.units.length, 0);
  assert.equal(league.board()[0].points, 0);
  assert.equal(battle.drainSummons(), 8);
  assert.equal(league.board()[0].points, 40);
  assert.ok(
    battle.gift({ id: "a", giftName: "Rose", count: 20, coins: 99 }).error,
  );
  assert.equal(battle.teamScore[0], 0);
  battle.spawn(0, "sword", 292, "A", "a");
  assert.equal(battle.drainSummons(), 0);
  now = 31;
  battle.drainSummons();
  assert.equal(battle.summonQueue[0].remaining, 4992);
  battle.roundId = "next-round";
  battle.drainSummons();
  assert.equal(battle.summonQueue.length, 0);
  assert.equal(battle.queueStats.expired, 4992);
});
test("per-viewer and global flood budgets remain bounded without phantom coins or units", () => {
  const { battle } = setup();
  let accepted = 0;
  for (let i = 0; i < 100; i++)
    if (
      !battle.gift({ id: "stable", name: "Viewer", giftName: "Rose", coins: 1 })
        .error
    )
      accepted++;
  assert.equal(accepted, 40);
  assert.equal(battle.teamScore[0], 40);
  assert.equal(battle.summonQueue.length, 40);
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
