import { WORLD, TYPES } from "./characters.js";
import { seeded } from "./spatial.js";

export const WARFARE_DEFAULTS = Object.freeze({
  initialPerTeam: 150,
  composition: { sword: 90, cavalry: 30, archer: 20, mage: 10 },
  castleHp: 500000,
  baselineEnabled: true,
  reinforcementFloor: 70,
  reinforcementBatch: 20,
  reinforcementInterval: 15,
  baselineCap: 240,
  likesPerSoldier: 10,
  teamSwitchCooldown: 60,
  heartSeconds: 60,
  heartTarget: 300,
  bombCount: 5,
  bombDamage: 240,
  bombRadius: 260,
  bombWarning: 2,
  phaseHaste: 1.1,
  phaseBonusSeconds: 10,
  flybySeconds: 9,
  maxFlybys: 2,
  breathInterval: 0.3,
  breathRadius: 360,
  fireDamage: 260,
  burnDps: 70,
  burnSeconds: 4,
  frostDamage: 380,
  slowMove: 0.35,
  slowAttack: 0.5,
  slowSeconds: 5,
});
export function warfareConfig(input = {}) {
  const c = {
    ...WARFARE_DEFAULTS,
    ...input,
    composition: { ...WARFARE_DEFAULTS.composition, ...input.composition },
  };
  const ranges = {
    initialPerTeam: [0, 500],
    castleHp: [1000, 10000000],
    reinforcementFloor: [0, 500],
    reinforcementBatch: [1, 100],
    reinforcementInterval: [2, 120],
    baselineCap: [0, 800],
    likesPerSoldier: [1, 1000],
    teamSwitchCooldown: [0, 3600],
    heartSeconds: [5, 300],
    heartTarget: [1, 100000],
    bombCount: [1, 8],
    bombDamage: [1, 10000],
    bombRadius: [30, 700],
    bombWarning: [0.5, 5],
    phaseHaste: [1, 1.3],
    phaseBonusSeconds: [1, 30],
    flybySeconds: [4, 20],
    maxFlybys: [1, 4],
    breathInterval: [0.15, 1],
    breathRadius: [50, 700],
    fireDamage: [1, 10000],
    burnDps: [0, 2000],
    burnSeconds: [0, 15],
    frostDamage: [1, 10000],
    slowMove: [0.1, 1],
    slowAttack: [0.1, 1],
    slowSeconds: [0, 15],
  };
  for (const [k, [lo, hi]] of Object.entries(ranges))
    if (!Number.isFinite(c[k]) || c[k] < lo || c[k] > hi)
      throw Error(`Invalid warfare ${k}: ${lo}–${hi}`);
  for (const k of [
    "initialPerTeam",
    "reinforcementFloor",
    "reinforcementBatch",
    "baselineCap",
    "likesPerSoldier",
    "heartTarget",
    "bombCount",
    "maxFlybys",
  ])
    if (!Number.isInteger(c[k])) throw Error(`${k} must be an integer`);
  if (typeof c.baselineEnabled !== "boolean")
    throw Error("Invalid baseline switch");
  if (
    Object.keys(c.composition).some(
      (k) => !["sword", "cavalry", "archer", "mage"].includes(k),
    ) ||
    Object.values(c.composition).some(
      (v) => !Number.isFinite(v) || v < 0 || v > 10000,
    ) ||
    !Object.values(c.composition).some((v) => v > 0)
  )
    throw Error("Invalid initial composition");
  return c;
}
export const teamCommand = (value) => {
  const s = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  if (["do", "red", "team red", "phe do", "1"].includes(s)) return 0;
  if (["xanh", "blue", "team blue", "phe xanh", "2"].includes(s)) return 1;
  return null;
};
export function resetWarfare(g) {
  g.castleMaxHp = g.warfareConfig.castleHp;
  g.castles = [g.castleMaxHp, g.castleMaxHp];
  g.battleScore = [0, 0];
  g.teamKills = [0, 0];
  g.likeRemainders = new Map();
  g.likeTotals = new Map();
  g.teamChangedAt ??= new Map();
  g.pendingBombs = [];
  g.phaseHasteUntil = [0, 0];
  g.nextReinforcement = g.warfareConfig.reinforcementInterval;
  g.heart = {
    index: 0,
    started: 0,
    ends: g.warfareConfig.heartSeconds,
    likes: [0, 0],
    raided: [false, false],
    lastWinner: null,
  };
  g.likeDiagnostics = {
    accepted: 0,
    rejected: 0,
    unattributed: 0,
    roomTotal: null,
    policy:
      "Native count/likeCount are packet deltas with a stable message ID; room totals never create attributed troops. Unjoined likes are discarded.",
  };
}
export function chooseTeam(g, id, team, name, origin = "live") {
  if (
    id === undefined ||
    id === null ||
    String(id) === "" ||
    ![0, 1].includes(team)
  )
    return { error: "Invalid viewer/team" };
  id = String(id);
  const previous = g.teams.get(id),
    now = g.clock();
  if (previous === team) return { team, alreadyJoined: true };
  const remaining =
    g.warfareConfig.teamSwitchCooldown -
    (now - (g.teamChangedAt.get(id) ?? -Infinity));
  if (previous !== undefined && remaining > 0)
    return { error: "Team switch cooldown", retryAfter: Math.ceil(remaining) };
  g.teams.set(id, team);
  g.teamChangedAt.set(id, now);
  g.onCombat({ kind: "join", userId: id, name, team, changedAt: now, origin });
  g.event({
    kind: "join",
    type: "join",
    userId: id,
    name,
    team,
    avatar: g.profiles.get(id)?.avatar || "",
    count: 0,
  });
  return { team };
}
function composition(c, count) {
  const entries = Object.entries(c.composition),
    total = entries.reduce((n, [, v]) => n + v, 0),
    counts = entries.map(([type, w]) => ({
      type,
      n: Math.floor((count * w) / total),
      fraction: ((count * w) / total) % 1,
    }));
  let left = count - counts.reduce((n, r) => n + r.n, 0);
  for (const r of [...counts].sort((a, b) => b.fraction - a.fraction))
    if (left-- > 0) r.n++;
  return counts;
}
export function spawnBaseline(g, count, initial = false) {
  count = Math.min(
    count,
    Math.floor(
      (g.maxUnits - g.units.filter((u) => !TYPES[u.type].defender).length) / 2,
    ),
  );
  if (count <= 0) return 0;
  const zone = g.spawnZone,
    firstId = g.nextId;
  if (initial)
    g.spawnZone = (team, slot) => {
      const x = 1870 + seeded(slot + 1, 441) * 330,
        y =
          WORLD.laneMin +
          90 +
          seeded(slot + 1, 813) * (WORLD.laneMax - WORLD.laneMin - 180);
      return { x: team ? WORLD.width - x : x, y, lane: y, spawnBand: 0 };
    };
  try {
    for (const team of [0, 1])
      for (const r of composition(g.warfareConfig, count)) {
        const n = g.spawn(
          team,
          r.type,
          r.n,
          "",
          null,
          null,
          initial ? "baseline" : "reinforcement",
        );
        if (n !== r.n) {
          g.units = g.units.filter((u) => u.id < firstId);
          g.spawnGridDirty = true;
          if (initial) throw Error("Initial deployment has insufficient space");
          return 0;
        }
      }
  } finally {
    g.spawnZone = zone;
  }
  return count;
}
export function acceptLikes(g, { id, name, count, origin = "likes" }) {
  id = String(id);
  const team = g.teams.get(id);
  if (team === undefined)
    return { error: "Choose RED/BLUE first; unjoined likes are discarded" };
  if (!g.inputOpen || g.winner !== null) return { error: "Battle ended" };
  if (!Number.isInteger(count) || count < 1 || count > 100000)
    return { error: "Invalid like count" };
  g.onCombat({ kind: "join", userId: id, name, team, origin });
  const likes = (g.likeRemainders.get(id) || 0) + count,
    quantity = Math.floor(likes / g.warfareConfig.likesPerSoldier),
    remainder = likes % g.warfareConfig.likesPerSoldier;
  g.likeRemainders.set(id, remainder);
  g.energy[team] += count;
  g.score(id, name, team).likes += count;
  g.likeDiagnostics.accepted += count;
  g.heart.likes[team] += count;
  if (quantity) g.enqueue(team, "sword", quantity, name, id, origin);
  let raid = false;
  if (
    g.heart.likes[team] >= g.warfareConfig.heartTarget &&
    !g.heart.raided[team]
  ) {
    g.heart.raided[team] = true;
    queueRaid(g, team);
    raid = true;
  }
  return { quantity, remainder, raid, phase: g.heart.index };
}
export function queueRaid(g, team) {
  if (![0, 1].includes(team) || !g.inputOpen || g.winner !== null) return false;
  if (!g.combatOpen) {
    g.pendingPowers.push({ type: "raid", team });
    return true;
  }
  const c = g.warfareConfig,
    cells = new Map();
  for (const u of g.units)
    if (u.team !== team && u.hp > 0 && !TYPES[u.type].defender) {
      const key = `${Math.floor(u.x / 500)}:${Math.floor(u.y / 500)}`;
      let b = cells.get(key);
      if (!b) cells.set(key, (b = { x: 0, y: 0, n: 0 }));
      b.x += u.x;
      b.y += u.y;
      b.n++;
    }
  const spots = [...cells.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, c.bombCount),
    raidId = g.effectId++;
  for (let i = 0; i < c.bombCount; i++) {
    const spot = spots[i],
      x = spot ? spot.x / spot.n : team ? 1550 : 3250,
      y = spot ? spot.y / spot.n : 400 + i * 550,
      delay = c.bombWarning + i * 0.18;
    g.pendingBombs.push({
      raidId,
      team,
      x,
      y,
      at: g.time + delay,
      damage: c.bombDamage,
      radius: c.bombRadius,
    });
    g.effect("bombWarning", x, y, {
      raidId,
      team,
      radius: c.bombRadius,
      delay,
      life: delay + 0.3,
    });
  }
  g.event({
    kind: "raid",
    type: "raid",
    name: "HEART WAR bombing raid",
    team,
    count: c.bombCount,
    phase: g.heart.index,
  });
  return true;
}
export function tickWarfare(g, dt) {
  const c = g.warfareConfig;
  while (g.time + 1e-8 >= g.heart.ends) {
    const [r, b] = g.heart.likes,
      winner = r === b ? null : r > b ? 0 : 1;
    if (winner !== null)
      g.phaseHasteUntil[winner] = g.heart.ends + c.phaseBonusSeconds;
    g.event({
      kind: "heartResult",
      type: "heartResult",
      name:
        winner === null
          ? "HEART WAR · draw"
          : `HEART WAR · ${winner ? "BLUE" : "RED"} wins`,
      team: winner ?? 0,
      winner,
      likes: [r, b],
      phase: g.heart.index,
      count: 0,
    });
    g.heart = {
      index: g.heart.index + 1,
      started: g.heart.ends,
      ends: g.heart.ends + c.heartSeconds,
      likes: [0, 0],
      raided: [false, false],
      lastWinner: winner,
    };
  }
  const pending = [];
  for (const bomb of g.pendingBombs) {
    if (g.time < bomb.at) {
      pending.push(bomb);
      continue;
    }
    g.hitArea(bomb.team, bomb.x, bomb.y, bomb.damage, bomb.radius, 0, true, {
      team: bomb.team,
      userId: null,
      name: "",
      origin: "heartWar",
      x: bomb.x,
    });
    g.effect("bombImpact", bomb.x, bomb.y, {
      team: bomb.team,
      radius: bomb.radius,
      raidId: bomb.raidId,
      life: 2.5,
    });
  }
  g.pendingBombs = pending;
  if (c.baselineEnabled && g.time >= g.nextReinforcement) {
    g.nextReinforcement = g.time + c.reinforcementInterval;
    const alive = [0, 1].map(
      (team) =>
        g.units.filter(
          (u) =>
            u.team === team &&
            u.hp > 0 &&
            ["baseline", "reinforcement"].includes(u.origin),
        ).length,
    );
    if (Math.min(...alive) < c.reinforcementFloor)
      spawnBaseline(
        g,
        Math.min(
          c.reinforcementBatch,
          Math.max(0, c.baselineCap - Math.max(...alive)),
        ),
      );
  }
  for (const u of g.units)
    if (u.hp > 0 && u.burn) {
      while (u.hp > 0 && u.burn.next <= g.time && u.burn.next <= u.burn.until) {
        g.damage(u, u.burn.dps * 0.5, u.burn.source, true);
        u.burn.next += 0.5;
      }
      if (g.time >= u.burn.until) delete u.burn;
    }
}
export function initFlyby(g, u) {
  const c = g.warfareConfig;
  u.flyby = {
    age: 0,
    duration: c.flybySeconds,
    next: 0.75,
    hit: new Set(),
    roundId: g.roundId,
    fromX: u.x,
    fromY: u.y,
  };
  u.state = "fly";
  u.faceX = WORLD.castles[1 - u.team];
  u.faceY = u.y;
  g.effect("dragonArrival", u.x, u.y, {
    team: u.team,
    element: TYPES[u.type].element,
    sourceId: u.id,
    life: 1.5,
  });
}
export function tickFlyby(g, u, dt) {
  if (!u.flyby) initFlyby(g, u);
  const f = u.flyby,
    c = g.warfareConfig,
    t = TYPES[u.type];
  f.age += dt;
  if (f.age >= f.duration) {
    u.exited = true;
    return true;
  }
  const progress = f.age / f.duration,
    from = f.fromX,
    to = u.team ? WORLD.castles[0] - 260 : WORLD.castles[1] + 260;
  u.x = from + (to - from) * progress;
  const blend = Math.min(1, progress / 0.15);
  u.y =
    f.fromY * (1 - blend) +
    (WORLD.ground +
      Math.sin(progress * Math.PI * 2) *
        (WORLD.laneMax - WORLD.laneMin) *
        0.29) *
      blend;
  u.faceX = u.x + (u.team ? -100 : 100);
  u.faceY = u.y + Math.cos(progress * Math.PI * 2) * 50;
  u.state = "fly";
  if (f.age >= f.next && progress > 0.12 && progress < 0.88) {
    f.next = f.age + c.breathInterval;
    u.attackId++;
    const x = u.x + (u.team ? -180 : 180),
      y = u.y;
    for (const v of g.units)
      if (
        v.team !== u.team &&
        v.hp > 0 &&
        !f.hit.has(v.id) &&
        Math.hypot(v.x - x, (v.y - y) * 1.2) <= c.breathRadius
      ) {
        f.hit.add(v.id);
        g.damage(
          v,
          t.element === "fire" ? c.fireDamage : c.frostDamage,
          u,
          true,
        );
        if (v.hp > 0 && t.element === "fire")
          v.burn = {
            until: g.time + c.burnSeconds,
            next: g.time + 0.5,
            dps: c.burnDps,
            source: {
              userId: u.userId,
              name: u.name,
              team: u.team,
              type: u.type,
              x: u.x,
              origin: u.origin,
            },
          };
        if (v.hp > 0 && t.element === "ice") {
          v.slowUntil = Math.max(v.slowUntil || 0, g.time + c.slowSeconds);
          v.moveSlowFactor = c.slowMove;
          v.attackSlowFactor = c.slowAttack;
        }
      }
    g.effect("dragonBreath", x, y, {
      team: u.team,
      element: t.element,
      sourceId: u.id,
      sx: u.x,
      sy: u.y,
      radius: c.breathRadius,
      life: 0.7,
    });
    g.effect(t.element === "fire" ? "burnGround" : "frostGround", x, y, {
      team: u.team,
      radius: c.breathRadius,
      life: t.element === "fire" ? c.burnSeconds : c.slowSeconds,
    });
  }
  return true;
}
