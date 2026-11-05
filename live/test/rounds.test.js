import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Battle } from "../src/game.js";
import { League, roundConfig } from "../src/league.js";
import { RoundManager } from "../src/rounds.js";
import { TikTokIngest } from "../src/tiktok.js";
const setup = (config = {}, dir = null) => {
  const league = new League(dir);
  league.data.config = roundConfig({ ...league.data.config, ...config });
  const game = new Battle();
  const rounds = new RoundManager(game, league);
  return { game, league, rounds };
};
test("default 300s: prepare30 / combat240 / final30 / result15 / countdown5", () => {
  const { game, rounds } = setup();
  game.choose("a", 0, "A");
  game.spawn(0, "sword", 1, "A", "a");
  const x = game.units[0].x;
  rounds.advance(29);
  assert.equal(rounds.phase, "prepare");
  assert.equal(game.units[0].x, x);
  rounds.advance(1);
  assert.equal(rounds.phase, "combat");
  rounds.advance(240);
  assert.equal(rounds.phase, "final");
  assert.equal(rounds.snapshot().remaining, 30);
  rounds.advance(30);
  assert.equal(rounds.phase, "results");
  assert.equal(rounds.result.reason, "timeout");
  const old = rounds.snapshot().id;
  rounds.advance(15);
  assert.equal(rounds.phase, "countdown");
  assert.equal(Math.ceil(rounds.snapshot().phaseRemaining), 5);
  rounds.advance(5);
  assert.equal(rounds.phase, "prepare");
  assert.notEqual(rounds.snapshot().id, old);
});
test("timeout prefers castle HP then actual total damage then draw", () => {
  for (const [hp, damage, winner] of [
    [[6000, 5000], [0, 999], 0],
    [[5000, 5000], [100, 101], 1],
    [[5000, 5000], [100, 100], null],
  ]) {
    const { game, league, rounds } = setup({
      duration: 3,
      prepare: 0,
      final: 1,
    });
    game.castles = hp;
    league.data.active.damage = damage;
    rounds.advance(3);
    assert.equal(rounds.result.winner, winner);
    assert.equal(rounds.phase, "results");
  }
});
test("castle destruction ends immediately; damage stops and one result only", () => {
  const { game, league, rounds } = setup({ prepare: 0 });
  game.choose("a", 0, "A");
  game.castles[1] = 50;
  game.damageCastle(1, 100, { userId: "a", name: "A", team: 0 });
  rounds.settle();
  assert.equal(rounds.phase, "results");
  assert.equal(rounds.result.winner, 0);
  assert.equal(league.data.active.damage[0], 50);
  rounds.settle();
  rounds.advance(1);
  assert.equal(league.data.history.length, 1);
  assert.equal(league.board()[0].points, 30);
  assert.equal(game.damageCastle(1, 500, { team: 0, userId: "a" }), 0);
});
test("merit attribution: spawn, overkill, kill, assists, castle fractions, wins and idempotence", () => {
  const { game, league, rounds } = setup({ prepare: 0 });
  game.choose("a", 0, "Same name");
  game.choose("b", 0, "Same name");
  game.choose("c", 1, "Enemy");
  game.spawn(0, "archer", 1, "Same name", "a");
  game.spawn(0, "mage", 1, "Same name", "b");
  game.spawn(1, "boss", 1, "Enemy", "c");
  const [a, b, boss] = game.units;
  game.damage(boss, 500, a, true);
  game.damage(boss, 5000, b, true);
  assert.equal(league.data.active.damage[0], 2500);
  game.damage(boss, 5000, b, true);
  game.damageCastle(1, 60, a);
  game.damageCastle(1, 60, a);
  game.damageCastle(1, 85, a);
  assert.equal(league.data.active.players.a.castleDamage, 205);
  assert.equal(league.data.active.players.a.points, 5 + 50 + 40);
  assert.equal(league.data.active.players.b.points, 5 + 10 + 50);
  const duplicate = { kind: "spawn", unitId: a.id, source: a };
  league.event(duplicate);
  assert.equal(league.data.active.players.a.points, 95);
  assert.equal(league.data.active.summoned[0], 2);
  game.castles[1] = 0;
  rounds.settle();
  assert.equal(league.data.active.players.a.points, 125);
  assert.equal(league.data.active.players.a.wins, 1);
  assert.equal(league.data.active.players.b.points, 95);
  assert.ok(league.data.active.players.a.achievements.includes("Titan Slayer"));
  assert.equal(league.board("season").length, 3);
});
test("projectile owner survives shooter death; splash and like powers retain user ID", () => {
  const { game, league } = setup({ prepare: 0 });
  game.spawn(0, "archer", 1, "A", "a");
  game.spawn(1, "sword", 1, "B", "b");
  const [a, b] = game.units;
  Object.assign(a, { x: 700, y: 650 });
  Object.assign(b, { x: 760, y: 650, windup: 100 });
  game.addProjectile(a, b, 100);
  a.hp = 0;
  for (let i = 0; i < 10; i++) game.tick(0.05);
  assert.equal(league.data.active.players.a.kills, 1);
  assert.equal(league.data.active.players.a.unitDamage, 100);
  game.choose("h", 0, "Hearts");
  game.likes({ id: "h", name: "Hearts", count: 1000 });
  assert.equal(game.units.filter((u) => u.userId === "h").length, 6);
  assert.equal(league.data.active.players.h.summoned, 6);
  assert.ok(league.data.active.players.h.castleDamage > 0);
});
test("pause freezes every round timer; input closes during results/countdown", () => {
  const { game, rounds } = setup({
    duration: 3,
    prepare: 1,
    final: 1,
    results: 2,
    countdown: 1,
  });
  rounds.pause();
  rounds.advance(200);
  assert.equal(rounds.elapsed, 0);
  rounds.pause();
  rounds.advance(3);
  const phase = rounds.phase;
  assert.equal(game.spawn(0, "sword", 10), 0);
  assert.ok(game.gift({ id: "a", coins: 1 }).error);
  rounds.pause();
  rounds.advance(100);
  assert.equal(rounds.phase, phase);
  assert.equal(rounds.phaseElapsed, 0);
});
test("manual reset archives abort, keeps season points, does not award a fake win", () => {
  const { game, league, rounds } = setup();
  game.spawn(0, "sword", 2, "A", "a");
  rounds.start();
  assert.equal(league.board("round").length, 0);
  assert.equal(league.board("season")[0].points, 10);
  assert.equal(league.board("season")[0].wins, 0);
  assert.equal(league.data.history[0].aborted, true);
});
test("durable season/session/history and gift receipts survive restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "league-"));
  try {
    let { game, league, rounds } = setup({ prepare: 0 }, dir);
    const adapter = new TikTokIngest(game),
      user = { userId: "u", nickname: "User" };
    adapter.chat({ user, comment: "1" });
    const gift = {
      user,
      giftDetails: { diamondCount: 1000, giftType: 0 },
      repeatCount: 1,
      common: { msgId: "persistent" },
    };
    adapter.gift(gift);
    rounds.advance(0.1);
    league.flush();
    const points = league.board("season")[0].points;
    ({ game, league, rounds } = setup({ prepare: 0 }, dir));
    assert.equal(league.board("season")[0].points, points);
    assert.equal(league.data.history[0].reason, "server_restart");
    const replay = new TikTokIngest(game);
    replay.chat({ user, comment: "1" });
    replay.gift(gift);
    assert.equal(game.units.length, 0);
    assert.equal(league.board("season")[0].points, points);
    game.castles[1] = 0;
    rounds.settle();
    const win = league.board("season")[0].wins;
    league.flush();
    ({ game, league, rounds } = setup({}, dir));
    assert.equal(league.board("season")[0].wins, win);
    assert.equal(league.data.history.filter((r) => !r.aborted).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("configuration validation and next-round application; exact large-step rollover", () => {
  const { rounds, league } = setup();
  assert.throws(() => rounds.configure({ duration: 10, prepare: 9, final: 2 }));
  rounds.configure({
    ...league.data.config,
    duration: 4,
    prepare: 1,
    final: 1,
    results: 2,
    countdown: 1,
  });
  assert.equal(rounds.config.duration, 300);
  rounds.start();
  rounds.advance(7);
  assert.equal(rounds.phase, "prepare");
  assert.equal(rounds.elapsed, 0);
  assert.equal(league.data.history.at(-1).winner, null);
});
test("corrupt persistent data is reported, never silently replaced", () => {
  const dir = mkdtempSync(join(tmpdir(), "league-"));
  try {
    writeFileSync(join(dir, "league.json"), "broken");
    assert.throws(() => new League(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("small like contributors join current round; player cannot team-hop after contributing", () => {
  const { game, league, rounds } = setup({ prepare: 0 });
  game.choose("a", 0, "A");
  rounds.start();
  game.likes({ id: "a", name: "A", count: 1 });
  assert.equal(league.data.active.players.a.team, 0);
  game.choose("a", 1, "A");
  assert.equal(game.teams.get("a"), 0);
  game.castles[1] = 0;
  rounds.settle();
  assert.equal(league.data.active.players.a.points, 30);
});
test("new LIVE session and new season keep historical boards independent", () => {
  const { game, league, rounds } = setup();
  game.spawn(0, "sword", 2, "A", "a");
  rounds.finish("admin_restart", true);
  league.data.sessionId = "session-two";
  rounds.configure({ season: "season-two" });
  rounds.start();
  assert.equal(league.board("live").length, 0);
  assert.equal(league.board("season").length, 0);
  assert.equal(
    league.data.seasons[Object.keys(league.data.seasons)[0]].players.a.points,
    10,
  );
  assert.equal(league.data.history.length, 1);
});
