import { WORLD, LIVE_VIEW, projectY } from "./characters.js";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const engaged = new Set(["attack", "hurt", "stomp", "rage"]);
export const CAMERA_MODES = [
  "overview",
  "combat_focus",
  "boss_focus",
  "castle_siege",
];
/** Pure, renderer-independent camera selection. All times below are real presentation seconds. */
export class CameraDirector {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = WORLD.width / 2;
    this.y = WORLD.ground;
    this.zoom = 0.78;
    this.overviewSide = null;
    this.mode = "overview";
    this.region = 6;
    this.holdUntil = 0;
    this.lastEvent = 0;
    this.lastRound = null;
    this.lastNow = null;
    this.lastEval = -Infinity;
    this.damage = [];
    this.major = [];
    this.emphasisUntil = 0;
    this.emphasisCooldown = 0;
    this.candidate = null;
    this.candidateCount = 0;
    this.request = "auto";
    this.target = { x: this.x, y: this.y, zoom: 0.7 };
    this.switches = 0;
    this.lastSwitch = -Infinity;
  }
  observe(state, now) {
    for (const e of state.cameraEvents || []) {
      if (e.id <= this.lastEvent) continue;
      this.lastEvent = e.id;
      if (e.kind === "damage" || e.kind === "castle")
        this.damage.push({ ...e, received: now });
      if (e.kind === "spawn" && ["guardian", "mage", "boss"].includes(e.type))
        this.major.push({ ...e, received: now });
    }
    this.damage = this.damage.filter((e) => now - e.received < 4);
    this.major = this.major.filter((e) => now - e.received < 6);
  }
  regions(state, now) {
    const living = state.units.filter((u) => u.hp > 0);
    const zones = [];
    for (let index = 0; index < 12; index++) {
      const x = (index + 0.5) * 400,
        local = living.filter((u) => Math.abs(u.x - x) < 520),
        reds = local.filter((u) => u.team === 0),
        blues = local.filter((u) => u.team === 1),
        mixed = reds.length && blues.length;
      const fighting = local.filter((u) => engaged.has(u.state));
      const hits = this.damage.filter((e) => Math.abs(e.x - x) < 520);
      const dps = hits.reduce(
        (n, e) => n + (e.amount * Math.exp(-(now - e.received) / 1.3)) / 1.3,
        0,
      );
      let score = mixed
        ? (fighting.length ? 120 : 10) +
          Math.min(20, Math.min(reds.length, blues.length)) * 2 +
          Math.min(35, fighting.length) * 5 +
          Math.min(160, dps * 0.15)
        : Math.min(5, local.length * 0.05);
      let siege = null;
      for (const [team, cx] of WORLD.castles.entries()) {
        const attackers = local.filter(
          (u) => u.team !== team && Math.abs(u.x - cx) < 520,
        );
        const castleDps = hits
          .filter((e) => e.kind === "castle" && Math.abs(e.x - cx) < 10)
          .reduce(
            (n, e) => n + e.amount * Math.exp(-(now - e.received) / 1.5),
            0,
          );
        if (
          attackers.length &&
          Math.abs(x - cx) < 700 &&
          (castleDps > 0 || (mixed && fighting.length > 0))
        ) {
          const urgent = (state.castles?.[team] ?? 10000) < 2500;
          score += 150 + Math.min(120, castleDps * 0.4) + (urgent ? 150 : 0);
          siege = { team, x: cx, urgent };
        }
      }
      const focus = fighting.length ? fighting : local;
      const y = focus.length
        ? focus.reduce((n, u) => n + projectY(u.y), 0) / focus.length
        : WORLD.ground;
      const center = focus.length
        ? focus.reduce((n, u) => n + u.x, 0) / focus.length
        : x;
      zones.push({
        index,
        x: clamp(center, x - 300, x + 300),
        y,
        score,
        mixed: !!mixed,
        fighting: fighting.length,
        dps,
        spanX: focus.length
          ? Math.max(...focus.map((u) => u.x)) -
            Math.min(...focus.map((u) => u.x))
          : 0,
        spanY: focus.length
          ? Math.max(...focus.map((u) => projectY(u.y))) -
            Math.min(...focus.map((u) => projectY(u.y)))
          : 0,
        count: local.length,
        siege,
      });
    }
    return zones;
  }
  evaluate(state, now) {
    const zones = this.regions(state, now);
    const best = [...zones].sort((a, b) => b.score - a.score)[0];
    let current = zones[this.region] || best;
    const urgent = best.siege?.urgent && best.score > current.score + 25;
    const stronger =
      best.index !== this.region && best.score > current.score * 1.35 + 20;
    if (stronger) {
      if (this.candidate === best.index) this.candidateCount++;
      else {
        this.candidate = best.index;
        this.candidateCount = 1;
      }
    } else {
      this.candidate = null;
      this.candidateCount = 0;
    }
    if (
      (now >= this.holdUntil && this.candidateCount >= 2) ||
      (urgent && now - this.lastSwitch >= 1.5) ||
      (current.count === 0 && best.score > 10 && now >= this.holdUntil)
    ) {
      if (this.region !== best.index) this.switches++;
      this.region = best.index;
      this.lastSwitch = now;
      this.holdUntil = now + 3;
      current = best;
      this.candidate = null;
      this.candidateCount = 0;
    }
    this.mode = current.siege
      ? "castle_siege"
      : current.mixed && (current.fighting || current.dps > 5)
        ? "combat_focus"
        : "overview";
    let x = current.x,
      y = current.y,
      zoom =
        this.mode === "overview"
          ? 0.66
          : clamp(1.08 - current.count * 0.0015, 0.7, 1.06);
    if (current.siege) {
      x = (current.x + current.siege.x) / 2;
      zoom = 0.82;
    }
    // Never abandon an active clash for a distant spawn. Emphasis is rate-limited.
    if (now >= this.emphasisCooldown) {
      const event = this.major
        .filter(
          (e) =>
            Math.abs(e.x - current.x) < 550 &&
            (current.mixed || this.mode === "overview"),
        )
        .sort(
          (a, b) =>
            ({ boss: 3, guardian: 2, mage: 1 })[b.type] -
            { boss: 3, guardian: 2, mage: 1 }[a.type],
        )[0];
      if (event) {
        this.emphasis = { ...event };
        this.emphasisUntil = now + 2.8;
        this.emphasisCooldown = now + 9;
        this.major = [];
      }
    }
    if (now < this.emphasisUntil && this.emphasis) {
      const hero = state.units.find(
        (u) =>
          u.hp > 0 &&
          u.type === this.emphasis.type &&
          u.team === this.emphasis.team &&
          Math.abs(u.x - this.emphasis.x) < 650,
      );
      if (hero && Math.abs(hero.x - current.x) < 550 && !current.siege) {
        this.mode = "boss_focus";
        x = (hero.x + current.x) / 2;
        y = (projectY(hero.y) + current.y) / 2;
        zoom = current.count > 70 ? 0.84 : 1.12;
      }
    }
    // With no active clash, establish the advancing ranks instead of filming empty midfield.
    if (
      this.mode === "overview" &&
      !zones.some((z) => z.siege || (z.mixed && (z.fighting || z.dps > 5)))
    ) {
      const sides = [0, 1].map((team) =>
        state.units
          .filter((u) => u.hp > 0 && u.team === team)
          .map((u) => u.x)
          .sort((a, b) => a - b),
      );
      const r = sides[0].length
        ? sides[0][Math.floor((sides[0].length - 1) * 0.85)]
        : null;
      const b = sides[1].length
        ? sides[1][Math.floor((sides[1].length - 1) * 0.15)]
        : null;
      if (r !== null && b !== null && b - r < 1250) x = (r + b) / 2;
      else {
        this.overviewSide ??= r !== null ? 0 : 1;
        x = (this.overviewSide === 0 ? r : b) ?? r ?? b ?? WORLD.width / 2;
      }
      y = WORLD.ground;
    }
    // Fit the active ranks and the tallest silhouettes before applying any emphasis.
    zoom = Math.min(
      zoom,
      clamp(
        Math.min(
          LIVE_VIEW.viewport.width / (current.spanX + 200),
          LIVE_VIEW.viewport.height / (current.spanY + 360),
        ),
        LIVE_VIEW.minZoom,
        LIVE_VIEW.maxZoom,
      ),
    );
    if (this.request === "overview") {
      this.mode = "overview";
      zoom = LIVE_VIEW.minZoom;
    }
    if (this.request === "red" || this.request === "blue") {
      this.mode = "castle_siege";
      x = WORLD.castles[this.request === "red" ? 0 : 1];
      y = WORLD.ground;
      zoom = 0.9;
    }
    this.displayRegion =
      this.mode === "overview"
        ? clamp(Math.floor(x / 400), 0, 11)
        : this.region;
    if (this.request !== "manual") this.target = { x, y, zoom };
    this.analysis = {
      zones: zones.map((z) => ({
        index: z.index,
        score: Math.round(z.score),
        dps: Math.round(z.dps),
        mixed: z.mixed,
      })),
      selected: this.region,
      switches: this.switches,
    };
  }
  update(state, now) {
    if (state.round !== this.lastRound) {
      const request = this.request,
        pose = { x: this.x, y: this.y, zoom: this.zoom };
      this.reset();
      Object.assign(this, pose);
      this.target = { ...pose };
      this.lastRound = state.round;
      this.lastNow = now;
      this.request = request;
      this.holdUntil = now + 0.5;
    }
    const dt = clamp(now - (this.lastNow ?? now), 0, 0.25);
    this.lastNow = now;
    this.observe(state, now);
    if (now - this.lastEval >= 0.25) {
      this.evaluate(state, now);
      this.lastEval = now;
    }
    const alpha = 1 - Math.exp(-dt / 0.65);
    const zoomChange = clamp(
      (this.target.zoom - this.zoom) * alpha,
      -dt * 0.28,
      dt * 0.28,
    );
    this.zoom = clamp(
      this.zoom + zoomChange,
      LIVE_VIEW.minZoom,
      LIVE_VIEW.maxZoom,
    );
    const halfX = LIVE_VIEW.viewport.width / (2 * this.zoom),
      halfY = LIVE_VIEW.viewport.height / (2 * this.zoom);
    this.x = clamp(
      this.x + (this.target.x - this.x) * alpha,
      halfX,
      WORLD.width - halfX,
    );
    this.y = clamp(
      this.y + (this.target.y - this.y) * alpha,
      halfY,
      WORLD.height - halfY,
    );
    return {
      x: this.x,
      y: this.y,
      zoom: this.zoom,
      mode: this.mode,
      region: this.displayRegion ?? this.region,
      ...this.analysis,
    };
  }
  pan(dx, dy = 0) {
    const base =
      this.request === "manual" ? this.target : { x: this.x, y: this.y };
    const hx = LIVE_VIEW.viewport.width / 2 / this.zoom,
      hy = LIVE_VIEW.viewport.height / 2 / this.zoom;
    this.request = "manual";
    this.target = {
      x: clamp(base.x + dx, hx, WORLD.width - hx),
      y: clamp(base.y + dy, hy, WORLD.height - hy),
      zoom: this.zoom,
    };
  }
}
