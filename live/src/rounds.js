import { roundConfig } from "./league.js";
export class RoundManager {
  constructor(game, league) {
    this.game = game;
    this.league = league;
    this.paused = false;
    this.result = null;
    game.onCombat = (e) => league.event(e);
    game.acceptReceipt = (key) => league.receipt(key);
    game.restoreQueue(league.data.summons);
    game.onQueue = (saved) => {
      league.data.summons = saved;
      league.dirty = true;
      league.checkpoint();
    };
    if (league.data.active && !league.data.active.finished)
      league.finish({
        winner: null,
        reason: "server_restart",
        elapsed: league.data.active.checkpoint?.elapsed || 0,
        castles: league.data.active.checkpoint?.castles || [...game.castles],
        aborted: true,
      });
    const savedStatus = league.data.controlStatus;
    if (savedStatus === "stopped" && league.data.active) {
      this.config = { ...league.data.config };
      this.elapsed = 0;
      this.phaseElapsed = 0;
      this.phase = "stopped";
      game.round = league.data.active.number;
      game.roundId = league.data.active.id;
      this.gates();
    } else {
      this.start();
      if (savedStatus === "ready") {
        this.phase = "ready";
        league.data.controlStatus = "ready";
        this.gates();
      }
    }
  }
  setPaused(value) {
    if (["ready", "stopped"].includes(this.phase)) return;
    this.paused = !!value;
    this.gates();
  }
  stop() {
    if (this.phase === "stopped") return;
    if (!this.league.data.active.finished) this.finish("owner_stop", true);
    this.phase = "stopped";
    this.result = null;
    this.paused = false;
    for (const u of this.game.units) if (u.hp > 0) u.state = "idle";
    this.game.projectiles = [];
    this.game.effects = [];
    this.game.cameraEvents = [];
    this.league.data.controlStatus = "stopped";
    this.league.dirty = true;
    this.gates();
    this.league.checkpoint();
  }
  resetReady() {
    this.start();
    this.phase = "ready";
    this.gates();
    this.league.data.controlStatus = "ready";
    this.league.dirty = true;
    this.league.checkpoint();
  }
  begin() {
    if (this.phase === "ready") {
      this.phase = this.config.prepare ? "prepare" : "combat";
      this.paused = false;
      this.gates();
      this.league.data.controlStatus = "running";
      this.league.dirty = true;
      this.league.checkpoint();
    } else if (this.phase === "stopped") this.start();
  }
  start() {
    if (this.league.data.active && !this.league.data.active.finished)
      this.finish("admin_restart", true);
    this.league.data.controlStatus = "running";
    this.game.reset();
    const active = this.league.start();
    this.game.round = active.number;
    this.game.roundId = active.id;
    this.config = { ...this.league.data.config };
    this.elapsed = 0;
    this.phase = this.config.prepare ? "prepare" : "combat";
    this.phaseElapsed = 0;
    this.result = null;
    this.gates();
    this.league.checkpoint();
  }
  configure(input) {
    this.league.data.config = roundConfig({
      ...this.league.data.config,
      ...input,
    });
    this.league.dirty = true;
    this.league.checkpoint();
  }
  gates() {
    this.game.inputOpen = ["prepare", "combat", "final"].includes(this.phase);
    this.game.combatOpen =
      !this.paused && ["combat", "final"].includes(this.phase);
  }
  pause() {
    this.setPaused(!this.paused);
  }
  finish(reason, aborted = false) {
    if (this.phase === "results" || this.phase === "countdown") return;
    const g = this.game;
    let winner = null;
    if (!aborted) {
      if (g.castles[0] !== g.castles[1])
        winner = g.castles[0] > g.castles[1] ? 0 : 1;
      else if (
        this.league.data.active.damage[0] !== this.league.data.active.damage[1]
      )
        winner =
          this.league.data.active.damage[0] > this.league.data.active.damage[1]
            ? 0
            : 1;
    }
    const a = this.league.finish({
      winner,
      reason,
      elapsed: this.elapsed,
      castles: g.castles,
      aborted,
    });
    this.result = {
      id: a.id,
      number: a.number,
      winner,
      reason,
      aborted,
      castles: [...g.castles],
      scores: [...g.teamScore],
      damage: [...a.damage],
      summoned: [...a.summoned],
      top10: structuredClone(this.league.board("round")).map((p) => ({
        ...p,
        avatar: this.league.data.profiles?.[p.id]?.avatar || "",
      })),
    };
    this.paused = false;
    this.phase = "results";
    // Accepted summons wait through results and retain FIFO order into the next round.
    this.phaseElapsed = 0;
    g.winner = winner;
    this.gates();
    this.league.checkpoint();
  }
  settle() {
    if (
      ["combat", "final"].includes(this.phase) &&
      this.game.castles.some((h) => h <= 0)
    )
      this.finish("castle_destroyed");
  }
  advance(dt, speed = 1) {
    if (this.paused || ["ready", "stopped"].includes(this.phase)) return;
    this.settle();
    if (dt > 0 && this.game.inputOpen) this.game.drainSummons();
    let remaining = Math.max(0, dt),
      steps = 0;
    while (remaining > 1e-8) {
      if (this.phase === "results" || this.phase === "countdown") {
        const duration =
          this.phase === "results"
            ? this.config.results
            : this.config.countdown;
        const used = Math.min(remaining, duration - this.phaseElapsed);
        this.phaseElapsed += used;
        remaining -= used;
        if (this.phaseElapsed >= duration - 1e-8) {
          if (this.phase === "results" && this.config.countdown === 0)
            this.start();
          else if (this.phase === "results") {
            this.phase = "countdown";
            this.phaseElapsed = 0;
            this.gates();
          } else this.start();
        }
        continue;
      }
      const boundary =
        this.phase === "prepare"
          ? this.config.prepare
          : this.phase === "combat"
            ? this.config.duration - this.config.final
            : this.config.duration;
      const step = Math.min(
        remaining * speed,
        0.05,
        Math.max(0, boundary - this.elapsed),
      );
      if (step > 1e-8) {
        if (this.phase !== "prepare") {
          if (steps++ < 400) this.game.tick(step, false);
        }
        this.elapsed += step;
        remaining -= step / speed;
        this.settle();
        if (this.phase === "results") continue;
      }
      if (this.elapsed >= boundary - 1e-8) {
        if (this.phase === "prepare") this.phase = "combat";
        else if (this.phase === "combat" && this.config.final > 0)
          this.phase = "final";
        else {
          this.finish("timeout");
          continue;
        }
        this.gates();
      }
    }
    const active = this.league.data.active;
    if (
      !active.finished &&
      (this.league.dirty ||
        Math.floor(this.elapsed) !==
          Math.floor(active.checkpoint?.elapsed ?? -1))
    ) {
      active.checkpoint = {
        elapsed: this.elapsed,
        castles: [...this.game.castles],
        phase: this.phase,
      };
      this.league.dirty = true;
    }
    this.league.checkpoint();
  }
  snapshot() {
    const resultPhase = this.phase === "results" || this.phase === "countdown";
    const end =
      this.phase === "prepare"
        ? this.config.prepare
        : this.phase === "combat"
          ? this.config.duration - this.config.final
          : this.config.duration;
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      remaining: Math.max(
        0,
        resultPhase ? 0 : this.config.duration - this.elapsed,
      ),
      phaseRemaining: Math.max(
        0,
        resultPhase
          ? (this.phase === "results"
              ? this.config.results
              : this.config.countdown) - this.phaseElapsed
          : end - this.elapsed,
      ),
      duration: this.config.duration,
      paused: this.paused,
      id: this.league.data.active.id,
      number: this.league.data.active.number,
      season: this.league.data.active.season,
      sessionId: this.league.data.active.sessionId,
      result: this.result,
      state:
        this.phase === "results" || this.phase === "countdown"
          ? "ROUND_RESULTS"
          : this.phase.toUpperCase(),
      // The dedicated history API serves archives; do not sort ten archives at 20Hz.
    };
  }
}
