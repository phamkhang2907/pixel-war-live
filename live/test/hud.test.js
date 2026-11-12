import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarBoard, safeAvatar, hudSnapshot } from "../src/hud-data.js";
import { Battle } from "../src/game.js";
import { League } from "../src/league.js";
import { TikTokIngest } from "../src/tiktok.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const player = (id, points, team = 0) => ({ id, name: id, points, team });
test("UTC weekly/monthly boards aggregate real history, exclude aborted/duplicate rounds and include current round once", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const done = {
    id: "r1",
    endedAt: "2026-11-03T12:00:00Z",
    players: { a: player("a", 100), b: player("b", 20, 1) },
  };
  const league = {
    data: {
      history: [
        {
          id: "old",
          endedAt: "2026-11-01T12:00:00Z",
          players: { a: player("a", 10) },
        },
        done,
        done,
        {
          id: "aborted",
          aborted: true,
          endedAt: "2026-11-04T12:00:00Z",
          players: { a: player("a", 999) },
        },
      ],
      active: {
        id: "current",
        players: { a: player("a", 5), c: player("c", 7) },
      },
    },
  };
  assert.equal(calendarBoard(league, "weekly", now).players[0].points, 105);
  assert.equal(calendarBoard(league, "monthly", now).players[0].points, 115);
  assert.equal(calendarBoard(league, "weekly", now).players.length, 3);
  league.data.active = { ...done, finished: true };
  assert.equal(calendarBoard(league, "weekly", now).players[0].points, 100);
});
test("avatar URLs reject script/data/insecure/credential-bearing URLs and accept HTTPS or local assets", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:image/svg+xml,x",
    "http://example.com/x",
    "https://user:pass@example.com/x",
    "/assets/../secret",
  ])
    assert.equal(safeAvatar(url), "");
  assert.equal(safeAvatar("/assets/ui/a.PNG"), "/assets/ui/a.PNG");
  assert.equal(
    safeAvatar("https://example.com/a.png"),
    "https://example.com/a.png",
  );
});
test("native TikTok avatar metadata persists without awarding contribution twice", () => {
  const dir = mkdtempSync(join(tmpdir(), "pw-hud-"));
  try {
    const league = new League(dir);
    league.start();
    const battle = new Battle();
    battle.onCombat = (e) => league.event(e);
    const ingest = new TikTokIngest(battle);
    const user = {
      userId: "stable",
      nickname: "Viewer",
      avatarThumb: { urlList: ["https://example.com/avatar.png"] },
    };
    ingest.chat({ user, comment: "1" });
    ingest.gift({
      user,
      giftDetails: { giftName: "Rose", diamondCount: 1, giftType: 1 },
      repeatEnd: true,
      repeatCount: 1,
      msgId: "same",
    });
    ingest.gift({
      user,
      giftDetails: { giftName: "Rose", diamondCount: 1, giftType: 1 },
      repeatEnd: true,
      repeatCount: 1,
      msgId: "same",
    });
    battle.drainSummons();
    assert.equal(league.board()[0].points, 25);
    league.flush();
    const restored = new League(dir);
    assert.equal(
      restored.data.profiles.stable.avatar,
      "https://example.com/avatar.png",
    );
    assert.equal(
      hudSnapshot(battle, restored).teams[0][0].avatar,
      "https://example.com/avatar.png",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
