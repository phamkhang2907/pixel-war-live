import { randomBytes } from "node:crypto";
import { Battle } from "./game.js";
import { League } from "./league.js";
import { RoundManager } from "./rounds.js";
import { TikTokIngest } from "./tiktok.js";
import { hudSnapshot } from "./hud-data.js";
export function publicDemo(app, io) {
  const game = new Battle(),
    league = new League(),
    rounds = new RoundManager(game, league),
    ingest = new TikTokIngest(game, { source: "demo" }),
    channel = io.of("/demo"),
    rates = new Map();
  rounds.configure({ prepare: 0 });
  rounds.start();
  const state = () => ({
    ...game.snapshot(),
    hud: hudSnapshot(game, league),
    roundState: rounds.snapshot(),
    paused: rounds.paused,
    mode: "demo",
    arena: "public-demo",
    liveStatus: "SIMULATED · isolated public Demo",
    serverNow: Date.now(),
  });
  game.giftMappings.push(
    {
      key: "demo-lion",
      giftId: "demo-lion",
      giftName: "Demo Lion",
      type: "frostDragon",
      count: 1,
      enabled: true,
    },
    {
      key: "demo-dragon",
      giftId: "demo-dragon",
      giftName: "Demo Dragon",
      type: "fireDragon",
      count: 1,
      enabled: true,
    },
    {
      key: "demo-heavy",
      giftId: "demo-heavy",
      giftName: "Demo Heavy",
      type: "cavalry",
      count: 1,
      enabled: true,
    },
    {
      key: "demo-giant",
      giftId: "demo-giant",
      giftName: "Demo Giant",
      type: "boss",
      count: 1,
      enabled: true,
    },
  );
  const gifts = [
    ["Demo Lion", "Blue Frost Dragon", 1],
    ["Demo Dragon", "Red Fire Dragon", 1],
    ["Rose", "Small Soldier", 1],
    ["Finger Heart", "Small Soldier", 5],
    ["Doughnut", "Archer", 3],
    ["Perfume", "Mage", 2],
    ["Demo Heavy", "Heavy Soldier", 1],
    ["Demo Giant", "Giant · Barbarian substitute", 1],
  ];
  app.get("/api/demo/config", (req, res) => {
    if (!/pw_demo=[A-Za-z0-9_-]{24}/.test(req.headers.cookie || ""))
      res.setHeader(
        "Set-Cookie",
        `pw_demo=${randomBytes(18).toString("base64url")}; HttpOnly; SameSite=Strict; Path=/${req.secure || req.get("x-forwarded-proto") === "https" ? "; Secure" : ""}`,
      );
    res.set("Cache-Control", "no-store").json({
      simulated: true,
      gifts: gifts.map(([name, unit, count]) => ({ name, unit, count })),
      maxQuantity: 50,
    });
  });
  app.post("/api/demo/gift", (req, res) => {
    const origin = req.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.get("host"))
          return res.sendStatus(403);
      } catch {
        return res.sendStatus(403);
      }
    }
    const id = (req.headers.cookie || "").match(
      /(?:^|;\s*)pw_demo=([A-Za-z0-9_-]{24})(?:;|$)/,
    )?.[1];
    if (!id) return res.status(401).json({ error: "Open Demo first" });
    const now = Date.now();
    for (const [k, v] of rates) if (now - v.at > 10000) rates.delete(k);
    const key = req.ip + ":" + id;
    let rate = rates.get(key);
    if (!rate) rates.set(key, (rate = { at: now, n: 0 }));
    const ipKey = "ip:" + req.ip;
    let ipRate = rates.get(ipKey);
    if (!ipRate) rates.set(ipKey, (ipRate = { at: now, n: 0 }));
    if (++rate.n > 12 || ++ipRate.n > 120 || rates.size > 5000)
      return res.status(429).json({ error: "Demo rate limit. Retry shortly." });
    const p = req.body;
    if (
      !p ||
      ![0, 1].includes(p.team) ||
      !gifts.some((g) => g[0] === p.giftName) ||
      !Number.isInteger(p.quantity) ||
      p.quantity < 1 ||
      p.quantity > 50 ||
      typeof p.username !== "string" ||
      !p.username.trim() ||
      p.username.length > 24 ||
      !/^[\w-]{8,80}$/.test(p.eventId || "")
    )
      return res
        .status(400)
        .json({ error: "Choose a team, name, valid gift and quantity 1–50" });
    if (game.summonQueue.reduce((n, q) => n + q.remaining, 0) > 5000)
      return res
        .status(429)
        .json({ error: "Demo queue full. Retry when pending summons deploy." });
    const userId = "public:" + id + ":" + p.team;
    game.choose(userId, p.team, p.username.trim());
    const result = ingest.gift({
      user: { userId, nickname: p.username.trim() },
      giftId:
        p.giftName === "Demo Lion"
          ? "demo-lion"
          : p.giftName === "Demo Dragon"
            ? "demo-dragon"
            : p.giftName === "Demo Heavy"
              ? "demo-heavy"
              : p.giftName === "Demo Giant"
                ? "demo-giant"
                : "",
      giftDetails: { giftName: p.giftName, giftType: 1, diamondCount: 0 },
      repeatCount: p.quantity,
      repeatEnd: true,
      groupId: id + ":" + p.eventId,
      common: { msgId: id + ":" + p.eventId },
    });
    res
      .status(result?.error ? 409 : 200)
      .json({ ...result, simulated: true, arena: "public-demo" });
  });
  channel.on("connection", (socket) => socket.emit("state", state()));
  let age = 0;
  return {
    game,
    rounds,
    advance(dt) {
      // Simulate only while someone is watching; no idle public workload on LIVE.
      if (!channel.sockets.size) return;
      rounds.advance(Math.min(dt, 0.25));
      rounds.settle();
      age += dt;
      if (age >= 0.1) {
        age = 0;
        channel.emit("state", state());
      }
      if (league.data.history.length > 30)
        league.data.history.splice(0, league.data.history.length - 30);
    },
    state,
  };
}
