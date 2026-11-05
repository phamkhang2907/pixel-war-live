import {
  DEFAULT_GIFT_MAPPINGS,
  validateGiftMappings,
  SUMMONABLE,
  CASTLE_GUARDIAN,
} from "./gifts.js";
import { TikTokIngest } from "./tiktok.js";
import { hudSnapshot } from "./hud-data.js";
import { WORLD } from "./characters.js";
import { League } from "./league.js";
import { RoundManager } from "./rounds.js";
import { TikTokService } from "./tiktok-connection.js";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Battle, TYPES } from "./game.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const app = express(),
  http = createServer(app),
  io = new Server(http, { maxHttpBufferSize: 16000 });
const game = new Battle();
const dataDir = process.env.DATA_DIR || root + "data";
const league = new League(dataDir, { asyncPersistence: true });
const rounds = new RoundManager(game, league);
const tiktok = new TikTokService(game);
let auto = true,
  speed = 1;
const token = process.env.ADMIN_TOKEN || randomBytes(18).toString("hex");
try {
  game.giftMappings = validateGiftMappings(
    JSON.parse(await readFile(dataDir + "/gift-mappings.json", "utf8")),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const demoIngest = new TikTokIngest(game, { source: "demo" });
const adminRates = new Map();
app.use(express.json({ limit: "16kb" }));
// Retired routes do not serve the old renderer or its administrative surface.
app.get(["/", "/index.html"], (_req, res) =>
  res.set("Cache-Control", "no-store").redirect(302, "/3d/"),
);
app.get("/admin", (_req, res) =>
  res.set("Cache-Control", "no-store").redirect(302, "/3d/?admin=1"),
);
app.use("/legacy", (_req, res) =>
  res
    .status(410)
    .type("text/plain")
    .send("The 2D game is retired. Open /3d/ for the game and admin controls."),
);
app.use(
  express.static(root + "dist/public", {
    setHeaders(res, path) {
      // Revalidate entry documents on Safari; hashed JS/CSS can still be reused.
      if (path.endsWith(".html") || path.endsWith("/version.json"))
        res.setHeader("Cache-Control", "no-store");
      else if (/\/3d\/assets\/[^/]+-[A-Za-z0-9_-]+\.(js|css)$/.test(path))
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

app.get("/health", (_, r) =>
  r.json({
    ok: true,
    units: game.units.length,
    mode: tiktok.mode,
    phase: rounds.phase,
    persistenceError: league.persistenceError,
    performance: { tickMs, maxTickMs, eventLoopDelayMs },
    roundId: league.data.active.id,
  }),
);
function auth(req, res, next) {
  const provided = Buffer.from(
    req.headers.authorization?.replace("Bearer ", "") || "",
  );
  const expected = Buffer.from(token);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return res.status(401).json({ error: "Admin token required" });
  if (req.method !== "GET") {
    const now = Date.now(),
      ip = req.ip;
    let rate = adminRates.get(ip);
    if (!rate || now - rate.at > 1000) {
      rate = { at: now, count: 0 };
      adminRates.set(ip, rate);
    }
    if (++rate.count > 40)
      return res.status(429).json({ error: "Admin rate limit: retry shortly" });
  }
  next();
}
app.get("/api/config", auth, (_, r) =>
  r.json({
    giftMappings: game.giftMappings,
    giftCatalog: [...game.giftCatalog.values()],
    summonable: SUMMONABLE,
    guardian: CASTLE_GUARDIAN,
    roundConfig: league.data.config,
    mode: tiktok.mode,
    auto,
    paused: rounds.paused,
    liveStatus: tiktok.status,
  }),
);
app.post("/api/control", auth, async (req, res) => {
  try {
    const { action, ...p } = req.body;
    switch (action) {
      case "demoGift": {
        if (tiktok.mode !== "demo") throw Error("Demo mode required");
        if (
          ![0, 1].includes(p.team) ||
          !Number.isInteger(p.count ?? 1) ||
          (p.count ?? 1) < 1 ||
          (p.count ?? 1) > 10000 ||
          String(p.giftName || "").length > 80 ||
          String(p.giftId || "").length > 24 ||
          !Number.isFinite(Number(p.coins ?? 0)) ||
          Number(p.coins ?? 0) < 0 ||
          Number(p.coins ?? 0) > 100000
        )
          throw Error("Invalid demo gift");
        const id =
            "demo:" +
            p.team +
            ":" +
            String(p.userId || p.name || "You").slice(0, 64),
          name = String(p.name || "You").slice(0, 64);
        game.choose(id, p.team, name);
        const result = demoIngest.gift({
          user: { userId: id, nickname: name, profilePictureUrl: p.avatar },
          giftId: String(p.giftId || ""),
          giftDetails: {
            giftName: p.giftName || "Rose",
            diamondCount: Number(p.coins ?? 0),
            giftType: p.streak ? 1 : 0,
          },
          repeatCount: p.count ?? 1,
          repeatEnd: p.repeatEnd ?? true,
          groupId: p.groupId,
          common: {
            msgId: String(p.eventId || randomUUID()),
            createTime: p.eventAt || Date.now(),
          },
        });
        if (result?.error) return res.status(409).json(result);
        res.json({ ok: true, ...result });
        return;
      }
      case "giftMappings": {
        const mappings = validateGiftMappings(p.mappings);
        await mkdir(dataDir, { recursive: true });
        const tmp = dataDir + "/gift-mappings." + randomUUID() + ".tmp";
        await writeFile(tmp, JSON.stringify(mappings, null, 2));
        await rename(tmp, dataDir + "/gift-mappings.json");
        game.giftMappings = mappings;
        break;
      }
      case "likes":
        if (
          tiktok.mode !== "demo" ||
          ![0, 1].includes(p.team) ||
          !Number.isInteger(p.count) ||
          p.count < 1 ||
          p.count > 100000
        )
          throw Error("Invalid demo likes");
        const likeId =
          "demo:" +
          p.team +
          ":" +
          String(p.userId || p.name || "Demo Hearts").slice(0, 64);
        game.choose(likeId, p.team, p.name || "Demo Hearts");
        game.likes({
          id: likeId,
          name: p.name || "Demo Hearts",
          count: p.count,
        });
        break;
      case "burst":
        if (tiktok.mode !== "demo") throw Error("Demo mode required");
        if (![100, 200, 300].includes(p.count ?? 200))
          throw Error("Use 100, 200 or 300 units");
        for (let i = 0; i < (p.count ?? 200); i++)
          game.spawn(
            i % 2,
            SUMMONABLE[Math.floor(i / 2) % SUMMONABLE.length],
            1,
            "Demo army",
            "demo:army:" + (i % 2) + ":" + (i % 12),
          );
        break;
      case "cameraScenario": {
        if (
          tiktok.mode !== "demo" ||
          !["balanced", "red", "blue", "boss"].includes(p.scenario) ||
          (p.count !== undefined && ![50, 100, 300].includes(p.count))
        )
          throw Error("Choose a valid Demo camera scenario");
        rounds.start();
        rounds.config.prepare = 0;
        rounds.config.duration = Math.max(120, rounds.config.duration);
        rounds.phase = "combat";
        rounds.elapsed = 0;
        rounds.paused = false;
        rounds.gates();
        speed = 1;
        auto = false;
        const counts =
          p.scenario === "red"
            ? [120, 36]
            : p.scenario === "blue"
              ? [36, 120]
              : p.scenario === "boss"
                ? [75, 75]
                : [(p.count ?? 300) / 2, (p.count ?? 300) / 2];
        const fronts =
          p.scenario === "red"
            ? [4190, 4360]
            : p.scenario === "blue"
              ? [440, 610]
              : [2260, 2500];
        for (let team = 0; team < 2; team++)
          for (let i = 0; i < counts[team]; i++) {
            const type =
              i % 12 === 0
                ? "cavalry"
                : i % 8 === 0
                  ? "mage"
                  : i % 4 === 0
                    ? "archer"
                    : "sword";
            game.spawn(
              team,
              type,
              1,
              "Demo " + (team === 0 ? "Red" : "Blue"),
              "demo:scenario:" + team + ":" + (i % 12),
            );
            const u = game.units.at(-1);
            u.x =
              fronts[team] +
              (team === 0 ? -1 : 1) * Math.floor(i / WORLD.rows) * 84;
            const event = game.cameraEvents.at(-1);
            if (event) event.x = u.x;
          }
        if (p.scenario === "boss") {
          game.spawn(0, "boss", 1, "Titan Commander", "demo:titan");
          const u = game.units.at(-1);
          u.x = 2380;
          u.y = WORLD.ground;
          u.lane = u.y;
          Object.assign(game.cameraEvents.at(-1), { x: u.x, y: u.y });
        }
        break;
      }
      case "speed":
        if (tiktok.mode !== "demo" || ![1, 2, 4, 8].includes(p.value))
          throw Error("Demo speed must be 1, 2, 4 or 8");
        speed = p.value;
        break;
      case "pause":
        rounds.pause();
        break;
      case "auto":
        auto = !auto;
        break;
      case "reset":
        rounds.start();
        break;
      case "newRound":
        rounds.start();
        break;
      case "roundConfig":
        rounds.configure(p.config);
        break;
      case "demoCycle":
        if (tiktok.mode !== "demo") throw Error("Demo required");
        speed = 1;
        rounds.configure({
          ...league.data.config,
          duration: 12,
          prepare: 2,
          final: 3,
          results: 7,
          countdown: 0,
        });
        rounds.start();
        break;
      case "newLiveSession":
        rounds.finish("new_live_session", true);
        league.data.sessionId = randomBytes(16).toString("hex");
        league.dirty = true;
        rounds.start();
        break;
      case "troop":
        if (tiktok.mode !== "demo") throw Error("Demo mode required");
        if (
          ![0, 1].includes(p.team) ||
          !SUMMONABLE.includes(p.type) ||
          !Number.isInteger(p.count) ||
          p.count < 1 ||
          p.count > 50
        )
          throw Error("Invalid troop request");
        game.spawn(
          p.team,
          p.type,
          p.count,
          p.name || "Demo",
          "demo:" + p.team + ":" + String(p.userId || p.name || "Demo"),
        );
        break;
      case "demo":
        await tiktok.disconnect();
        break;
      case "connect":
        await tiktok.connect(p.username);
        auto = false;
        speed = 1;
        break;
      default:
        throw Error("Unknown action");
    }
    rounds.settle();
    league.checkpoint();
    lastHud = null;
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
let lastHud = null,
  lastHudAt = 0,
  lastHudRound = "",
  lastHudFinished = false;
function state() {
  if (
    !lastHud ||
    lastHudRound !== league.data.active.id ||
    lastHudFinished !== league.data.active.finished ||
    Date.now() - lastHudAt >= 250
  ) {
    lastHud = hudSnapshot(game, league);
    lastHudAt = Date.now();
    lastHudRound = league.data.active.id;
    lastHudFinished = league.data.active.finished;
  }
  return {
    ...game.snapshot(),
    hud: lastHud,
    roundState: rounds.snapshot(),
    paused: rounds.paused,
    auto,
    speed,
    mode: tiktok.mode,
    liveStatus: tiktok.status,
    serverNow: Date.now(),
  };
}
app.get("/api/leaderboards", auth, (_req, res) =>
  res.json({ live: league.board("live"), season: league.board("season") }),
);
app.get("/api/history", auth, (req, res) => {
  const offset = Math.max(0, Number(req.query.offset) || 0);
  res.json({
    total: league.data.history.length,
    rounds: league.data.history
      .slice()
      .reverse()
      .slice(offset, offset + 20)
      .map(({ players, ...r }) => ({
        ...r,
        top10: Object.values(players)
          .sort((a, b) => b.points - a.points)
          .slice(0, 10),
      })),
  });
});
io.on("connection", (socket) => socket.emit("state", state()));
let previous = performance.now();
let tickMs = 0,
  maxTickMs = 0,
  eventLoopDelayMs = 0;
const tickTimer = setInterval(() => {
  const now = performance.now(),
    dt = (now - previous) / 1000;
  previous = now;
  eventLoopDelayMs = Math.max(0, dt * 1000 - 50);
  rounds.advance(dt, speed);
  if (game.inputOpen && (rounds.phase === "prepare" || rounds.paused))
    game.drainSummons();
  if (
    !rounds.paused &&
    auto &&
    tiktok.mode === "demo" &&
    game.inputOpen &&
    Math.random() < 0.1
  ) {
    const team = Math.random() < 0.5 ? 0 : 1,
      name = ["pixel.ninja", "Luna", "Minh Anh", "blueberry", "Kai", "Ruby"][
        Math.floor(Math.random() * 6)
      ];
    const id = "demo:auto:" + team + ":" + name;
    game.choose(id, team, name);
    game.gift({
      id,
      name,
      giftName: ["Rose", "Finger Heart", "Doughnut", "Perfume"][
        Math.floor(Math.random() * 4)
      ],
    });
  }
  rounds.settle();
  league.checkpoint();
  io.emit("state", state());
  tickMs = performance.now() - now;
  maxTickMs = Math.max(maxTickMs, tickMs);
}, 50);
for (let team = 0; team < 2; team++)
  for (const type of ["sword", "archer", "cavalry", "mage"])
    game.spawn(team, type, 3, "Founders", null);
league.checkpoint();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    clearInterval(tickTimer);
    await league.close();
    io.disconnectSockets(true);
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
http.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(
    `PIXEL WAR http://localhost:${process.env.PORT || 3000}\nAdmin token: ${token}`,
  ),
);
