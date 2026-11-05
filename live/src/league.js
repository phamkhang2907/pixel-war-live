import { Worker } from "node:worker_threads";
import {
  mkdirSync,
  copyFileSync,
  constants,
  existsSync,
  readFileSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
export const DEFAULT_ROUND = {
  duration: 300,
  prepare: 30,
  final: 30,
  results: 7,
  countdown: 0,
  season: new Date().toISOString().slice(0, 7),
};
export function roundConfig(input) {
  const c = { ...DEFAULT_ROUND, ...input };
  for (const k of ["duration", "prepare", "final", "results", "countdown"])
    if (!Number.isInteger(c[k]) || c[k] < 0 || c[k] > 7200)
      throw Error("Round times must be whole seconds, 0–7200");
  if (
    c.duration < 1 ||
    c.prepare + c.final >= c.duration ||
    c.results < 1 ||
    c.countdown < 0 ||
    !/^[-\w]{1,48}$/.test(c.season)
  )
    throw Error(
      "Need positive combat/results and nonnegative countdown and a valid season ID",
    );
  return c;
}
const row = (id, name, team) => ({
  id: String(id),
  name: String(name || id).slice(0, 24),
  team,
  points: 0,
  summoned: 0,
  kills: 0,
  unitDamage: 0,
  castleDamage: 0,
  bossAssists: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  rounds: 0,
  achievements: [],
});
const rank = (players) =>
  Object.values(players).sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.castleDamage - a.castleDamage ||
      a.id.localeCompare(b.id),
  );
export class League {
  constructor(directory = null, { asyncPersistence = false } = {}) {
    this.asyncPersistence = asyncPersistence;
    this.saving = false;
    this.persistenceError = null;
    this.directory = directory;
    this.dirty = false;
    const path = directory && join(directory, "league.json");
    if (path && existsSync(path))
      this.data = JSON.parse(readFileSync(path, "utf8"));
    else
      this.data = {
        version: 1,
        config: { ...DEFAULT_ROUND },
        sessionId: randomUUID(),
        sessions: {},
        seasons: {},
        history: [],
        active: null,
        receipts: {},
      };
    if (
      this.data.version !== 1 ||
      !Array.isArray(this.data.history) ||
      !this.data.sessions ||
      !this.data.seasons
    )
      throw Error(
        "Unsupported or corrupt league storage; refusing to overwrite",
      );
    if (this.data.presentationVersion !== 2) {
      if (path && existsSync(path)) {
        const backup = join(directory, "league.before-3d-v2.json");
        if (!existsSync(backup))
          copyFileSync(path, backup, constants.COPYFILE_EXCL);
      }
      this.data.config.results = 7;
      this.data.config.countdown = 0;
      this.data.presentationVersion = 2;
      this.dirty = true;
    }
    roundConfig(this.data.config);
    this.ensureScopes();
  }
  ensureScopes() {
    const d = this.data;
    d.sessions[d.sessionId] ??= {
      id: d.sessionId,
      startedAt: new Date().toISOString(),
      players: {},
    };
    if (!Object.hasOwn(d.seasons, d.config.season))
      Object.defineProperty(d.seasons, d.config.season, {
        value: { id: d.config.season, players: {} },
        enumerable: true,
        writable: true,
      });
  }
  start() {
    this.ensureScopes();
    const d = this.data;
    d.active = {
      id: randomUUID(),
      number: (d.history.at(-1)?.number || 0) + 1,
      sessionId: d.sessionId,
      season: d.config.season,
      startedAt: new Date().toISOString(),
      players: {},
      awards: {},
      events: {},
      damage: [0, 0],
      castleDamage: [0, 0],
      summoned: [0, 0],
      finished: false,
    };
    this.dirty = true;
    return d.active;
  }
  player(id, name, team) {
    const a = this.data.active;
    if (id === null || id === undefined || !a || a.finished) return null;
    const key = String(id);
    const list = [
      a.players,
      this.data.sessions[a.sessionId].players,
      this.data.seasons[a.season].players,
    ];
    for (const players of list) {
      if (!Object.hasOwn(players, key))
        Object.defineProperty(players, key, {
          value: row(key, name, team),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      players[key].name = String(name || players[key].name).slice(0, 24);
      players[key].team = team;
    }
    this.dirty = true;
    return list.map((p) => p[key]);
  }
  award(key, id, name, team, changes = {}) {
    const a = this.data.active;
    if (!a || a.finished || a.awards[key]) return false;
    const rows = this.player(id, name, team);
    if (!rows) return false;
    a.awards[key] = true;
    for (const r of rows) {
      for (const [field, n] of Object.entries(changes)) r[field] += n;
      const achievements = [
        ["First Blood", r.kills >= 1],
        ["Titan Slayer", r.bossAssists >= 1],
        ["Army Commander", r.summoned >= 100],
        ["Siege Master", r.castleDamage >= 1000],
        ["Ten Victories", r.wins >= 10],
      ];
      for (const [name, yes] of achievements)
        if (yes && !r.achievements.includes(name)) r.achievements.push(name);
    }
    this.dirty = true;
    return true;
  }
  event(e) {
    if (e.kind === "profile") {
      const id = String(e.userId);
      this.data.profiles ??= {};
      const previous = this.data.profiles[id];
      const next = {
        name: e.profile.name,
        avatar: e.profile.avatar || previous?.avatar || "",
      };
      if (previous?.name === next.name && previous?.avatar === next.avatar)
        return;
      Object.defineProperty(this.data.profiles, id, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      const keys = Object.keys(this.data.profiles);
      if (keys.length > 5000) delete this.data.profiles[keys[0]];
      this.dirty = true;
      return;
    }
    const a = this.data.active;
    if (!a || a.finished) return;
    const p = e.source || e;
    const id = p.userId;
    if (e.kind === "join") {
      this.player(id, p.name, p.team);
      return;
    }
    const eventKey = e.kind + ":" + (e.unitId ?? e.eventId);
    a.events ??= {};
    if (a.events[eventKey]) return;
    a.events[eventKey] = true;
    if (e.kind === "spawn") {
      a.summoned[p.team]++;
      this.award("spawn:" + e.unitId, id, p.name, p.team, {
        summoned: 1,
        points: 5,
      });
    }
    if (e.kind === "damage") {
      a.damage[p.team] += e.amount;
      this.award("damage:" + e.eventId, id, p.name, p.team, {
        unitDamage: e.amount,
      });
    }
    if (e.kind === "castle") {
      a.damage[p.team] += e.amount;
      a.castleDamage[p.team] += e.amount;
      const old = a.players[String(id)]?.castleDamage || 0;
      const points =
        (Math.floor((old + e.amount) / 100) - Math.floor(old / 100)) * 20;
      this.award("castle:" + e.eventId, id, p.name, p.team, {
        castleDamage: e.amount,
        points,
      });
    }
    if (e.kind === "kill") {
      this.award("kill:" + e.unitId, id, p.name, p.team, {
        kills: 1,
        points: 10,
      });
      if (e.boss)
        for (const helper of e.helpers)
          this.award(
            `assist:${e.unitId}:${helper.userId}`,
            helper.userId,
            helper.name,
            helper.team,
            { bossAssists: 1, points: 50 },
          );
    }
    this.dirty = true;
  }
  receipt(key) {
    if (!key) return true;
    if (this.data.receipts[key]) return false;
    this.data.receipts[key] = true;
    this.dirty = true;
    return true;
  }
  finish({ winner, reason, elapsed, castles, aborted = false }) {
    const a = this.data.active;
    if (!a || a.finished) return a;
    if (!aborted)
      for (const p of Object.values(a.players)) {
        const won = p.team === winner;
        this.award("result:" + p.id, p.id, p.name, p.team, {
          points: won ? 30 : 0,
          wins: won ? 1 : 0,
          draws: winner === null ? 1 : 0,
          losses: winner !== null && !won ? 1 : 0,
          rounds: 1,
        });
      }
    a.finished = true;
    Object.assign(a, {
      winner,
      reason,
      elapsed,
      castles: [...castles],
      aborted,
      endedAt: new Date().toISOString(),
    });
    const { awards, events, ...record } = a;
    this.data.history.push(structuredClone(record));
    this.dirty = true;
    return a;
  }
  board(scope = "round", limit = 10) {
    const d = this.data,
      a = d.active;
    const players =
      scope === "season"
        ? d.seasons[a?.season || d.config.season]?.players
        : scope === "live"
          ? d.sessions[a?.sessionId || d.sessionId]?.players
          : a?.players;
    return rank(players || {}).slice(0, limit);
  }
  checkpoint(urgent = false) {
    if (!this.asyncPersistence) return this.flush();
    if (!this.dirty || !this.directory || this.flushTimer) return;
    this.flushTimer = setTimeout(
      () => {
        this.flushTimer = null;
        if (this.saving) return;
        if (!this.worker) {
          this.worker = new Worker(
            new URL("./persistence-worker.js", import.meta.url),
            { workerData: this.directory },
          );
          this.worker.on("message", (message) => {
            this.saving = false;
            if (message.error) {
              this.dirty = true;
              this.persistenceError = message.error;
            } else this.persistenceError = null;
            this.checkpoint();
          });
          this.worker.on("error", (error) => {
            this.persistenceError = error.message;
            this.dirty = true;
            this.saving = false;
            this.worker = null;
          });
          this.worker.unref();
        }
        this.dirty = false;
        this.saving = true;
        this.worker.postMessage(this.data);
      },
      urgent ? 0 : 1000,
    );
    this.flushTimer.unref();
  }
  async close() {
    this.asyncPersistence = false;
    clearTimeout(this.flushTimer);
    if (this.worker) await this.worker.terminate();
    this.dirty = true;
    this.flush();
  }
  flush() {
    if (!this.dirty || !this.directory) return;
    mkdirSync(this.directory, { recursive: true });
    const tmp = join(this.directory, "league.json.tmp"),
      path = join(this.directory, "league.json");
    const fd = openSync(tmp, "w", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(this.data));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
    const dir = openSync(this.directory, "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
    this.dirty = false;
  }
}
