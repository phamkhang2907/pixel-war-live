import { TikTokService } from "./tiktok-connection.js";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Battle, TYPES } from "./game.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const app = express(),
  http = createServer(app),
  io = new Server(http, { maxHttpBufferSize: 16000 });
const game = new Battle();
const dataDir = process.env.DATA_DIR || root + "data";
const tiktok = new TikTokService(game);
let paused = false,
  auto = true,
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
app.use(express.static(root + "dist/public"));

app.get("/health", (_, r) =>
  r.json({ ok: true, units: game.units.length, mode: tiktok.mode }),
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
    mode: tiktok.mode,
    auto,
    paused,
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
        game.choose("demo", p.team);
        game.gift({
          id: "demo",
          name: p.name || "You",
          coins: p.coins,
          count: p.count || 1,
        });
        break;
      case "burst":
        if (tiktok.mode !== "demo") throw Error("Demo mode required");
        for (let i = 0; i < 2; i++) game.spawn(i, "sword", 100, "Demo army");
        break;
      case "speed":
        if (tiktok.mode !== "demo" || ![1, 2, 4, 8].includes(p.value))
          throw Error("Demo speed must be 1, 2, 4 or 8");
        speed = p.value;
        break;
      case "pause":
        paused = !paused;
        break;
      case "auto":
        auto = !auto;
        break;
      case "reset":
        game.reset();
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
        game.spawn(p.team, p.type, p.count, p.name || "Demo");
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
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
io.on("connection", (s) => {
  s.emit("state", {
    ...game.snapshot(),
    paused,
    auto,
    speed,
    mode: tiktok.mode,
    liveStatus: tiktok.status,
  });
});
setInterval(() => {
  if (!paused) {
    for (let i = 0; i < speed; i++) game.tick(0.05);
    if (
      auto &&
      tiktok.mode === "demo" &&
      game.winner === null &&
      Math.random() < 0.1
    ) {
      const team = Math.random() < 0.5 ? 0 : 1;
      const name = [
        "pixel.ninja",
        "Luna",
        "Minh Anh",
        "blueberry",
        "Kai",
        "Ruby",
      ][Math.floor(Math.random() * 6)];
      game.choose(name, team);
      game.gift({
        id: name,
        name,
        coins: [1, 5, 20, 50][Math.floor(Math.random() * 4)],
      });
    }
  }
  io.emit("state", {
    ...game.snapshot(),
    paused,
    auto,
    speed,
    mode: tiktok.mode,
    liveStatus: tiktok.status,
  });
}, 50);
for (let t = 0; t < 2; t++)
  for (const type of ["sword", "archer", "cavalry", "mage"])
    game.spawn(t, type, 3, "Founders");
http.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(
    `PIXEL WAR http://localhost:${process.env.PORT || 3000}\nAdmin token: ${token}`,
  ),
);
