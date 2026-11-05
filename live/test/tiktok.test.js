import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/game.js";
import { TikTokIngest } from "../src/tiktok.js";
test("native nested TikTok chat and completed streak; deduplicate message", () => {
  const b = new Battle(),
    a = new TikTokIngest(b);
  const user = { userId: "123", nickname: "Minh" };
  a.chat({ user, comment: " 2 " });
  const gift = {
    user,
    common: { msgId: "gift-1" },
    giftDetails: { giftType: 1, diamondCount: 5 },
    repeatCount: 10,
    repeatEnd: false,
  };
  a.gift(gift);
  assert.equal(b.units.length, 0);
  gift.repeatEnd = true;
  a.gift(gift);
  a.gift(gift);
  assert.equal(b.units.length, 10);
  assert.equal(b.units[0].team, 1);
  assert.equal(b.units[0].name, "Minh");
  assert.equal(b.snapshot().scores[0].coins, 50);
});
test("unknown coin value and unknown users do not summon", () => {
  const b = new Battle(),
    a = new TikTokIngest(b);
  a.gift({ user: { userId: "x" }, giftDetails: { diamondCount: 100 } });
  a.chat({ user: { userId: "x" }, comment: "1" });
  a.gift({ user: { userId: "x" }, giftDetails: { giftType: 0 } });
  assert.equal(b.units.length, 0);
});
test("native likeCount is per-event, team selected by chat, duplicate IDs ignored", () => {
  const b = new Battle(),
    a = new TikTokIngest(b),
    user = { userId: "heart", nickname: "Heart" };
  a.like({ user, likeCount: 500, common: { msgId: "a" } });
  assert.deepEqual(b.energy, [0, 0]);
  a.chat({ user, comment: "2" });
  const d = { user, likeCount: 100, common: { msgId: "b" } };
  a.like(d);
  a.like(d);
  assert.deepEqual(b.energy, [0, 100]);
  assert.equal(b.units.length, 3);
});
