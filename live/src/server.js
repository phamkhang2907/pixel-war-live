import { warfareConfig, queueRaid } from "./warfare.js";
import {
  DEFAULT_GIFT_MAPPINGS,
  validateGiftMappings,
  SUMMONABLE,
  CASTLE_GUARDIAN,
} from "./gifts.js";
import { TikTokIngest } from "./tiktok.js";
import { hudSnapshot } from "./hud-data.js";
import { WORLD, ARMY, formation } from "./characters.js";
import { League } from "./league.js";
import { RoundManager } from "./rounds.js";
import { TikTokService } from "./tiktok-connection.js";
import { seeded } from "./spatial.js";
import express from "express";
import { ownerSessions } from "./owner-session.js";
import { publicDemo } from "./public-demo.js";
import { mountMusic } from "./music.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Battle, TYPES } from "./game.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const app = express(),
  http = createServer(app),
  io = new Server(http, {
    maxHttpBufferSize: 16000,
    perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 1 } },
  });
const game = new Battle();
const dataDir = process.env.DATA_DIR || root + "data";
const league = new League(dataDir, { asyncPersistence: true });
game.profiles = new Map(Object.entries(league.data.profiles || {}));
for (const [id, p] of game.profiles)
  if ([0, 1].includes(p.team)) {
    game.teams.set(id, p.team);
    if (Number.isFinite(p.teamChangedAt))
      game.teamChangedAt.set(id, p.teamChangedAt);
  }

const rounds = new RoundManager(game, league);
game.giftCatalog = new Map(
  (league.data.observedGifts || [])
    .filter((g) => g.source === "live")
    .map((g) => [g.giftId || g.giftName, g]),
);
game.onGiftMetadata = () => {
  league.data.observedGifts = [...game.giftCatalog.values()].filter(
    (g) => g.source === "live",
  );
  league.dirty = true;
  league.checkpoint();
};
const tiktok = new TikTokService(game);
let auto = false,
  speed = 1;
const token = process.env.ADMIN_TOKEN || randomBytes(18).toString("hex");
try {
  game.giftMappings = validateGiftMappings(
    JSON.parse(await readFile(dataDir + "/gift-mappings.json", "utf8")),
    game.giftCatalog,
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
try {
  const c = JSON.parse(await readFile(dataDir + "/army-config.json", "utf8"));
  if (
    !Number.isInteger(c.batch) ||
    c.batch < 8 ||
    c.batch > 256 ||
    !Number.isFinite(c.budgetMs) ||
    c.budgetMs < 1 ||
    c.budgetMs > 12
  )
    throw Error("Invalid spawn config");
  game.spawnBatch = c.batch;
  game.spawnBudgetMs = c.budgetMs;
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
for (const row of DEFAULT_GIFT_MAPPINGS.filter((r) =>
  ["lion-frost", "dragon-fire", "dragon-flame", "ice-summon"].includes(r.key),
))
  if (!game.giftMappings.some((r) => r.key === row.key))
    game.giftMappings.push(structuredClone(row));
if (league.data.giftRulesVersion !== 1) {
  const rose = game.giftMappings.find(
    (r) => r.key === "rose" && r.type === "sword",
  );
  if (rose?.count === 1) {
    rose.count = 5;
    try {
      await writeFile(
        dataDir + "/gift-mappings.before-heart-war-v1.json",
        await readFile(dataDir + "/gift-mappings.json"),
        { flag: "wx" },
      );
    } catch (e) {
      if (!["ENOENT", "EEXIST"].includes(e.code)) throw e;
    }
    const tmp = dataDir + "/gift-mappings." + randomUUID() + ".tmp";
    await writeFile(tmp, JSON.stringify(game.giftMappings, null, 2));
    await rename(tmp, dataDir + "/gift-mappings.json");
  }
  league.data.giftRulesVersion = 1;
  league.dirty = true;
}
// Only server-persisted LIVE metadata can restore verified pending bindings.
new TikTokIngest(game).catalog(
  [...game.giftCatalog.values()],
  "persisted-live-metadata",
);
const demoIngest = new TikTokIngest(game, { source: "demo" });
const owner = ownerSessions(app, {
  password: process.env.OWNER_PASSWORD || token,
});
const adminRates = new Map();
app.use(express.json({ limit: "16kb" }));
// Retired routes do not serve the old renderer or its administrative surface.
app.get(["/", "/index.html"], (_req, res) =>
  res.set("Cache-Control", "no-store").redirect(302, "/3d/"),
);
app.get("/admin", (_req, res) =>
  res.set("Cache-Control", "no-store").redirect(302, "/3d/?admin=1&live=1"),
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
    armyCapacity: game.maxUnits,
    pendingSummons: game.summonQueue.reduce((n, q) => n + q.remaining, 0),
    memory: process.memoryUsage(),
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
    (provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)) &&
    !owner.authenticated(req)
  )
    return res.status(401).json({ error: "Owner sign in required" });
  if (owner.authenticated(req) && req.method !== "GET" && !owner.originOK(req))
    return res.sendStatus(403);
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
const music = await mountMusic(app, {
  auth,
  directory: dataDir,
  changed: (payload) => {
    io.emit("music", payload);
    io.of("/demo").emit("music", payload);
  },
});
const demo = publicDemo(app, io, {
  warfare: league.data.warfare,
  roundConfig: league.data.config,
});
demo.game.spawnBatch = game.spawnBatch;
demo.game.spawnBudgetMs = game.spawnBudgetMs;
const commands = new Map();
app.get("/api/config", auth, (_, r) =>
  r.json({
    music: music.manifest(),
    giftMappings: game.giftMappings,
    giftCatalog: [...game.giftCatalog.values()],
    summonable: SUMMONABLE,
    guardian: CASTLE_GUARDIAN,
    army: {
      capacity: game.maxUnits,
      max: ARMY.maxUnits,
      spawnBatch: game.spawnBatch,
      spawnBudgetMs: game.spawnBudgetMs,
      pending: game.summonQueue.reduce((n, q) => n + q.remaining, 0),
    },
    roundConfig: league.data.config,
    warfareConfig: league.data.warfare,
    memberships: [...game.teams].slice(-500).map(([id, team]) => ({
      id,
      team,
      ...game.profiles.get(id),
      remainder: game.likeRemainders.get(id) || 0,
    })),
    likeDiagnostics: game.likeDiagnostics,
    mode: tiktok.mode,
    auto,
    paused: rounds.paused,
    liveStatus: tiktok.status,
    liveConnection: tiktok.diagnostics(),
  }),
);
app.post("/api/control", auth, async (req, res) => {
  try {
    const { action, ...p } = req.body;
    const cid = String(p.commandId || "");
    if (cid && commands.has(cid))
      return res.json({ ok: true, duplicate: true });
    if (cid) {
      if (!/^[\w-]{8,80}$/.test(cid)) throw Error("Invalid command ID");
      commands.set(cid, Date.now());
      if (commands.size > 1000) commands.delete(commands.keys().next().value);
    }

    switch (action) {
      case "startBattle":
        rounds.begin();
        break;
      case "pauseBattle":
        rounds.setPaused(true);
        break;
      case "resumeBattle":
        rounds.setPaused(false);
        break;
      case "stopBattle":
        rounds.stop();
        auto = false;
        speed = 1;
        await tiktok.disconnect();
        break;
      case "resetBattle":
        rounds.resetReady();
        auto = false;
        speed = 1;
        break;
      case "spawnConfig": {
        if (
          !Number.isInteger(p.batch) ||
          p.batch < 8 ||
          p.batch > 256 ||
          !Number.isFinite(p.budgetMs) ||
          p.budgetMs < 1 ||
          p.budgetMs > 12
        )
          throw Error("Spawn batch 8–256; budget 1–12 ms");
        await mkdir(dataDir, { recursive: true });
        await writeFile(
          dataDir + "/army-config.tmp",
          JSON.stringify({ batch: p.batch, budgetMs: p.budgetMs }),
        );
        await rename(
          dataDir + "/army-config.tmp",
          dataDir + "/army-config.json",
        );
        game.spawnBatch = p.batch;
        game.spawnBudgetMs = p.budgetMs;
        demo.game.spawnBatch = p.batch;
        demo.game.spawnBudgetMs = p.budgetMs;
        break;
      }
      case "reconnect":
        await tiktok.connect(tiktok.username);
        break;

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
            giftImage: { urlList: [String(p.giftIcon || "")] },
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
        const mappings = validateGiftMappings(p.mappings, game.giftCatalog);
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
        if (![100, 200, 300, 500, 1000, 2000].includes(p.count ?? 200))
          throw Error("Use 100–2000 units in Demo mode");
        game.maxUnits = Math.max(game.maxUnits, p.count ?? 200);
        for (const team of [0, 1])
          game.enqueue(
            team,
            "sword",
            (p.count ?? 200) / 2,
            "Demo army",
            null,
            "demo",
          );
        break;
      case "monsterScenario": {
        if (tiktok.mode !== "demo" || !["breath", "gate"].includes(p.kind))
          throw Error("Choose an owner Demo monster fixture");
        if (game.summonQueue.length)
          throw Error("Deploy accepted summons before changing a fixture");
        rounds.start({ baseline: false });
        rounds.config.prepare = 0;
        rounds.phase = "combat";
        rounds.paused = false;
        rounds.gates();
        speed = 1;
        auto = false;
        if (p.kind === "breath") {
          for (const [team, type, y] of [
            [0, "frostDragon", 1430],
            [1, "fireDragon", 1770],
          ]) {
            game.spawn(team, type, 1, "Owner Demo dragon", null);
            const d = game.units.at(-1);
            Object.assign(d, {
              x: team ? 2600 : 2200,
              y,
              lane: y,
              windup: 0,
              cd: 0,
            });
            Object.assign(d.flyby, { fromX: d.x, fromY: d.y });
            for (let i = 0; i < 4; i++) {
              game.spawn(1 - team, "sword", 1, "Owner Demo target", null);
              Object.assign(game.units.at(-1), {
                x: team ? 2390 : 2410,
                y: y + (i - 1.5) * 38,
                hp: 2000,
                maxHp: 2000,
                windup: 120,
              });
            }
          }
        } else {
          for (const team of [0, 1])
            for (const king of game.units.filter(
              (u) => u.type === "mushroomKing" && u.team === team,
            ))
              for (let i = 0; i < 3; i++) {
                game.spawn(
                  1 - team,
                  "sword",
                  1,
                  "Owner Demo siege target",
                  null,
                );
                Object.assign(game.units.at(-1), {
                  x: king.x + (team ? -1 : 1) * 280,
                  y: king.y + (i - 1) * 45,
                  hp: 2000,
                  maxHp: 2000,
                  windup: 120,
                });
              }
        }
        game.spawnGridDirty = true;
        break;
      }
      case "cameraScenario": {
        if (
          tiktok.mode !== "demo" ||
          !["balanced", "red", "blue", "boss", "swarm"].includes(p.scenario) ||
          (p.count !== undefined &&
            ![50, 100, 200, 300, 500, 1000, 2000].includes(p.count))
        )
          throw Error("Choose a valid Demo camera scenario");
        if (game.summonQueue.length)
          throw Error(
            "Pending accepted summons must deploy before replacing a Demo scenario",
          );
        rounds.start({ baseline: false });
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
              : p.layout === "march"
                ? [WORLD.castles[0] + 1020, WORLD.castles[1] - 1020]
                : [2260, 2500];
        game.maxUnits = Math.max(ARMY.defaultUnits, p.count ?? 300);
        game.spawnZone = (team, slot, type) => {
          const v = formation(team, slot, type),
            available =
              team === 0
                ? fronts[team] - (WORLD.castles[0] + 120)
                : WORLD.castles[1] - 120 - fronts[team],
            depth = Math.min(available, 1200, 120 + (p.count ?? 300) * 0.55);
          v.x =
            fronts[team] +
            (team === 0 ? -1 : 1) * seeded(slot + 1, 981 + team * 821) * depth;
          return v;
        };
        for (let team = 0; team < 2; team++)
          for (let i = 0; i < counts[team]; i++) {
            const type =
              p.scenario === "swarm" && i === 0
                ? "boss"
                : i % 12 === 0
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
              null,
            );
          }
        game.spawnZone = null;
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
        rounds.resetReady();
        break;
      case "newRound":
        rounds.start();
        break;
      case "warfareConfig":
        rounds.configureWarfare(p.config);
        demo.rounds.configureWarfare(p.config);
        break;
      case "heartRaid":
        if (tiktok.mode !== "demo" || ![0, 1].includes(p.team))
          throw Error("Demo team required");
        queueRaid(game, p.team);
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
          p.count > 1000
        )
          throw Error("Invalid troop request");
        game.enqueue(p.team, p.type, p.count, p.name || "Demo", null, "demo");
        break;
      case "demo":
        await tiktok.disconnect();
        break;
      case "connect":
        await tiktok.connect(p.username);
        // Demo stress armies/test requests cannot enter the real LIVE simulation.
        game.units = game.units.filter(
          (u) => !["demo", "demoGift"].includes(u.origin),
        );
        game.summonQueue = game.summonQueue.filter(
          (q) => !["demo", "demoGift"].includes(q.origin),
        );
        game.spawnGridDirty = true;
        game.queueChanged();
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
    if (req.body?.commandId) commands.delete(String(req.body.commandId));
    res.status(400).json({ error: e.message });
  }
});
let lastBroadcast = 0;
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
    liveConnection: tiktok.diagnostics(),
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
io.on("connection", (socket) => {
  socket.emit("state", state());
  socket.emit("music", music.manifest());
});
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
  demo.advance(dt);
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
      origin: "demoGift",
      giftName: ["Rose", "Finger Heart", "Doughnut", "Perfume"][
        Math.floor(Math.random() * 4)
      ],
    });
  }
  rounds.settle();
  league.checkpoint();
  if (game.units.length <= 500 || Date.now() - lastBroadcast >= 100) {
    io.emit("state", state());
    lastBroadcast = Date.now();
  }
  tickMs = performance.now() - now;
  maxTickMs = Math.max(maxTickMs, tickMs);
}, 50);
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
