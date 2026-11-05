import { hudSnapshot } from "./hud-data.js";
import { WORLD } from "./characters.js";
import { League } from "./league.js";
import { RoundManager } from "./rounds.js";
import { TikTokService } from "./tiktok-connection.js";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Battle, TYPES, DEFAULT_RULES } from "./game.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const app = express(),
  http = createServer(app),
  io = new Server(http, { maxHttpBufferSize: 16000 });
const game = new Battle();
const dataDir = process.env.DATA_DIR || root + "data";
const league = new League(dataDir);
const rounds = new RoundManager(game, league);
const tiktok = new TikTokService(game);
let auto = true,
  speed = 1;
const token = process.env.ADMIN_TOKEN || randomBytes(18).toString("hex");
try {
  game.rules = validate(
    JSON.parse(await readFile(dataDir + "/rules.json", "utf8")),
  );
} catch {}
function validate(r) {
  if (
    !Array.isArray(r) ||
    !r.length ||
    r.length > 20 ||
    r.some(
      (x) =>
        !Object.hasOwn(TYPES, x.type) ||
        !Number.isInteger(x.min) ||
        x.min < 1 ||
        !Number.isInteger(x.count) ||
        x.count < 1 ||
        x.count > 50,
    )
  )
    throw Error("Invalid rules");
  return r;
}
app.use(express.json({ limit: "16kb" }));
// The 3D renderer is the primary game. Keep the former dashboard isolated
// at /legacy/ for administrative operations until those controls are migrated.
app.get(["/", "/index.html"], (_req, res) => res.redirect(302, "/3d/"));
app.use(
  "/legacy",
  express.static(root + "dist/public", { index: "index.html" }),
);
app.use(express.static(root + "dist/public"));

app.get("/health", (_, r) =>
  r.json({
    ok: true,
    units: game.units.length,
    mode: tiktok.mode,
    phase: rounds.phase,
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
  next();
}
app.get("/api/config", auth, (_, r) =>
  r.json({
    rules: game.rules,
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
      case "spawn":
        if (tiktok.mode !== "demo") throw Error("Demo mode required");
        if (
          ![0, 1].includes(p.team) ||
          !Number.isFinite(p.coins) ||
          p.coins < 1 ||
          !Number.isInteger(p.count ?? 1) ||
          (p.count ?? 1) < 1 ||
          (p.count ?? 1) > 100
        )
          throw Error("Invalid gift request");
        const demoId =
          "demo:" +
          p.team +
          ":" +
          String(p.userId || p.name || "You").slice(0, 64);
        game.profile(demoId,p.name || "You",p.avatar);
        game.choose(demoId, p.team, p.name || "You");
        game.gift({
          id: demoId,
          name: p.name || "You",
          coins: p.coins,
          count: p.count || 1,
        });
        break;
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
      case "defaultRules":
        game.rules = structuredClone(DEFAULT_RULES);
        await mkdir(dataDir, { recursive: true });
        await writeFile(
          dataDir + "/rules.json",
          JSON.stringify(game.rules, null, 2),
        );
        break;
      case "burst":
        if (tiktok.mode !== "demo") throw Error("Demo mode required");
        if (![100, 200, 300].includes(p.count ?? 200))
          throw Error("Use 100, 200 or 300 units");
        for (let i = 0; i < (p.count ?? 200); i++)
          game.spawn(
            i % 2,
            Object.keys(TYPES)[Math.floor(i / 2) % 6],
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
                ? "guardian"
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
          results: 3,
          countdown: 1,
        });
        rounds.start();
        break;
      case "newLiveSession":
        rounds.finish("new_live_session", true);
        league.data.sessionId = randomBytes(16).toString("hex");
        league.dirty = true;
        rounds.start();
        break;
      case "rules": {
        const rules = validate(p.rules);
        await mkdir(dataDir, { recursive: true });
        await writeFile(
          dataDir + "/rules.json",
          JSON.stringify(rules, null, 2),
        );
        game.rules = rules;
        break;
      }
      case "troop":
        if (tiktok.mode !== "demo") throw Error("Demo mode required");
        if (
          ![0, 1].includes(p.team) ||
          !Object.hasOwn(TYPES, p.type) ||
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
    league.flush();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
let lastHud = null, lastHudAt = 0;
function state() {
  if(!lastHud || Date.now()-lastHudAt>=250){lastHud=hudSnapshot(game,league);lastHudAt=Date.now();}
  return {
    ...game.snapshot(),
    hud:lastHud,
    roundState: rounds.snapshot(),
    paused: rounds.paused,
    auto,
    speed,
    mode: tiktok.mode,
    liveStatus: tiktok.status,
    serverNow: Date.now(),
  };
}
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
setInterval(() => {
  const now = performance.now(),
    dt = (now - previous) / 1000;
  previous = now;
  rounds.advance(dt * speed);
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
      coins: [1, 10, 50, 100, 200, 1000][Math.floor(Math.random() * 6)],
    });
  }
  rounds.settle();
  league.flush();
  io.emit("state", state());
}, 50);
for (let team = 0; team < 2; team++)
  for (const type of ["sword", "archer", "cavalry", "mage"])
    game.spawn(team, type, 3, "Founders", null);
league.flush();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    league.flush();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
http.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(
    `PIXEL WAR http://localhost:${process.env.PORT || 3000}\nAdmin token: ${token}`,
  ),
);
