import { DEFAULT_GIFT_MAPPINGS, resolveGift, SUMMONABLE } from "./gifts.js";
import { safeAvatar } from "./hud-data.js";
import { TYPES, WORLD, LIKE_REWARDS, formation, ARMY } from "./characters.js";
import { SpatialGrid, seeded } from "./spatial.js";
export { TYPES } from "./characters.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export class Battle {
  constructor({
    clock = () => Date.now() / 1000,
    maxUnits = ARMY.defaultUnits,
    spawnBatch = ARMY.deploymentBatch,
    spawnBudgetMs = 6,
  } = {}) {
    this.onCombat = () => {};
    this.onQueue = () => {};
    this.maxUnits = Math.min(ARMY.maxUnits, Math.max(1, Math.floor(maxUnits)));
    this.nextSummonSequence = 1;
    this.spawnBatch = spawnBatch;
    this.spawnBudgetMs = spawnBudgetMs;
    this.spawnWeight = [0, 0];
    this.spawnBandWeight = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    this.spawnGrid = new SpatialGrid(70);
    this.spawnGridDirty = true;
    this.acceptReceipt = () => true;
    this.combatEventId = 1;
    this.clock = clock;
    this.giftMappings = structuredClone(DEFAULT_GIFT_MAPPINGS);
    this.giftCatalog = new Map();
    this.teams = new Map();
    this.scores = new Map();
    this.round = 0;
    this.nextId = 1;
    this.effectId = 1;
    this.reset();
  }
  reset() {
    this.roundStartedAt = Date.now();
    this.summonQueue = this.summonQueue?.filter((q) => q.remaining > 0) ?? [];
    this.giftRates = new Map();
    this.globalGiftRate = { at: this.clock(), count: 0 };
    this.queueStats = { accepted: 0, spawned: 0, rejected: 0, expired: 0 };
    this.inputOpen = true;
    this.combatOpen = true;
    this.pendingPowers = [];
    this.committedTeams = new Map(
      this.summonQueue.map((q) => [String(q.userId), q.team]),
    );
    for (const q of this.summonQueue)
      if (q.userId !== null) this.teams.set(String(q.userId), q.team);
    this.spawnSlots = [0, 0];
    this.cameraEvents = [];
    this.cameraEventId ??= 1;
    this.units = [];
    this.spawnGridDirty = true;
    this.projectiles = [];
    this.effects = [];
    this.events = [];
    this.castles = [10000, 10000];
    this.time = 0;
    this.winner = null;
    this.round++;
    this.scores.clear();
    this.energy = [0, 0];
    this.teamScore = [0, 0];
    this.claimed = [[], []];
    this.likeBuckets = [[], []];
    this.furyUntil = [0, 0];
    this.boostUntil = [0, 0];
  }
  profile(id, name, avatar) {
    if (id === undefined || id === null) return;
    this.onCombat({
      kind: "profile",
      userId: String(id),
      profile: {
        name: String(name || id).slice(0, 64),
        avatar: safeAvatar(avatar),
      },
    });
  }
  choose(id, team, name = String(id)) {
    if (![0, 1].includes(team) || id === undefined) return;
    if (
      this.committedTeams.has(String(id)) &&
      this.committedTeams.get(String(id)) !== team
    )
      return;
    this.teams.set(String(id), team);
    this.onCombat({ kind: "join", userId: id, name, team });
  }
  spawn(
    team,
    type,
    count,
    name = "Demo",
    userId = name,
    sequenceStart = null,
    origin = "demo",
  ) {
    if (
      !this.inputOpen ||
      this.winner !== null ||
      !Object.hasOwn(TYPES, type) ||
      ![0, 1].includes(team) ||
      !Number.isFinite(count)
    )
      return 0;
    const t = TYPES[type];
    count = clamp(Math.floor(count), 0, this.maxUnits - this.units.length);
    if (this.spawnGridDirty) {
      this.spawnGrid.build(this.units);
      this.spawnGridDirty = false;
      this.spawnWeight = [0, 0];
      this.spawnBandWeight = [
        [0, 0, 0],
        [0, 0, 0],
      ];
      for (const u of this.units)
        if (u.hp > 0) {
          const w = Math.max(1, (TYPES[u.type].radius / 13) ** 2);
          this.spawnWeight[u.team] += w;
          this.spawnBandWeight[u.team][u.spawnBand ?? 0] += w;
        }
    }
    let deployed = 0;
    for (let i = 0; i < count; i++) {
      let position = null;
      for (let attempt = 0; attempt < 96; attempt++) {
        const slot = this.spawnSlots[team]++;
        const candidate = this.spawnZone
          ? this.spawnZone(team, slot, type)
          : (() => {
              const bands = Math.min(
                3,
                1 + Math.floor(this.spawnWeight[team] / 180),
              );
              let selected = 0;
              for (let b = 1; b < bands; b++)
                if (
                  this.spawnBandWeight[team][b] <
                  this.spawnBandWeight[team][selected]
                )
                  selected = b;
              return formation(team, slot, type, bands, selected);
            })();
        let free = true;
        this.spawnGrid.query(candidate.x, candidate.y, t.radius + 73, (v) => {
          if (TYPES[v.type].air !== t.air) return;
          if (
            Math.hypot(v.x - candidate.x, v.y - candidate.y) <
            t.radius + TYPES[v.type].radius + 3
          ) {
            free = false;
            return false;
          }
        });
        if (free) {
          position = candidate;
          break;
        }
      }
      if (!position) break; // Capacity/space backpressure: caller retains undeployed quantities.
      const unitId = this.nextId++;
      const summonSequence =
        sequenceStart === null ? this.nextSummonSequence++ : sequenceStart + i;
      this.units.push({
        id: unitId,
        team,
        type,
        name: String(name).slice(0, 24),
        userId,
        summonSequence,
        origin,
        attackId: 0,
        ...position,
        hp: t.hp,
        maxHp: t.hp,
        cd: seeded(unitId, 113) * 0.5,
        state: "idle",
        hurt: 0,
        dead: 0,
        windup: 0.4,
        skill: 0,
        charge: false,
        chargeUntil: 0,
        rage: false,
      });
      this.spawnGrid.add(this.units.at(-1));
      this.spawnWeight[team] += Math.max(1, (t.radius / 13) ** 2);
      this.spawnBandWeight[team][position.spawnBand ?? 0] += Math.max(
        1,
        (t.radius / 13) ** 2,
      );
      deployed++;
      this.cameraEvent({
        kind: "spawn",
        type,
        team,
        x: position.x,
        y: position.y,
      });
      if (userId !== null) this.committedTeams.set(String(userId), team);
      this.onCombat({ kind: "spawn", unitId, source: { userId, name, team } });
    }
    if (sequenceStart === null) this.queueChanged();
    return deployed;
  }
  queueChanged() {
    this.onQueue({
      nextSequence: this.nextSummonSequence,
      requests: this.summonQueue,
    });
  }
  restoreQueue(saved) {
    if (saved?.requests) {
      this.summonQueue = saved.requests.filter((q) => q.remaining > 0);
      this.nextSummonSequence = this.summonQueue.reduce(
        (n, q) => Math.max(n, q.sequenceStart + q.quantity),
        saved.nextSequence || 1,
      );
    }
  }
  cameraEvent(data) {
    this.cameraEvents.push({
      ...data,
      id: this.cameraEventId++,
      time: this.time,
    });
    if (this.cameraEvents.length > 256) this.cameraEvents.shift();
  }
  event(data) {
    this.events.unshift({ ...data, id: this.effectId++, at: Date.now() });
    this.events = this.events.slice(0, 20);
  }
  effect(type, x, y, extra = {}) {
    this.effects.push({
      id: this.effectId++,
      type,
      x,
      y,
      time: this.time,
      ...extra,
    });
    if (this.effects.length > 140) this.effects.shift();
  }
  score(id, name, team) {
    id = String(id);
    let s = this.scores.get(id);
    if (!s) {
      s = { name: String(name).slice(0, 24), team, coins: 0, likes: 0 };
      this.scores.set(id, s);
    }
    s.team = team;
    return s;
  }
  gift({
    id,
    name,
    coins,
    count = 1,
    giftId = "",
    giftName = "",
    roundId,
    eventAt,
    origin = "gift",
    continuedStreak = false,
  }) {
    const team = this.teams.get(String(id));
    const reject = (error) => {
      this.queueStats.rejected++;
      return { error };
    };
    if (team === undefined) return reject("Choose a team with 1 or 2 first");
    if (
      (roundId && roundId !== this.roundId) ||
      (eventAt && !continuedStreak && eventAt < this.roundStartedAt - 1000)
    )
      return reject("Late gift from an earlier round");
    const rule = resolveGift(this.giftMappings, { giftId, giftName, coins });
    if (!rule) return reject("No configured action for this gift");
    const repeats = Number(count ?? 1);
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10000)
      return reject("Invalid streak count");
    const quantity = rule.count * repeats;
    const now = this.clock();
    if (now - this.globalGiftRate.at >= 1)
      this.globalGiftRate = { at: now, count: 0 };
    let rate = this.giftRates.get(String(id));
    if (!rate || now - rate.at >= 10) {
      rate = { at: now, count: 0 };
      this.giftRates.set(String(id), rate);
    }
    // Completed, deduplicated gifts are compact queue records, not per-unit objects.
    // Deployment is rate-limited; accepted quantities are never silently discarded.
    if (this.giftRates.size > 5000)
      this.giftRates.delete(this.giftRates.keys().next().value);
    rate.count++;
    this.globalGiftRate.count++;
    this.committedTeams.set(String(id), team);
    this.onCombat({ kind: "join", userId: id, name, team });
    const value =
      Number.isFinite(Number(coins)) && Number(coins) > 0
        ? Math.min(Number(coins), 100000) * repeats
        : 0;
    const deferCoins = !this.inputOpen || this.winner !== null;
    if (!deferCoins) {
      this.score(id, name, team).coins += value;
      this.teamScore[team] += value;
    }
    const sequenceStart = this.nextSummonSequence;
    this.nextSummonSequence += quantity;
    this.summonQueue.push({
      team,
      type: rule.type,
      remaining: quantity,
      quantity,
      sequenceStart,
      sourceRound: this.roundId,
      creditOnDeploy: deferCoins ? value : 0,
      origin,
      name,
      userId: String(id),
      roundId: this.roundId,
    });
    this.queueStats.accepted += quantity;
    this.queueChanged();
    this.event({
      name,
      team,
      type: rule.type,
      count: quantity,
      value,
      kind: "gift",
      queued: true,
      giftName: giftName || rule.giftName,
      giftId,
    });
    return {
      queued: quantity,
      spawned: 0,
      sequenceStart,
      sequenceEnd: sequenceStart + quantity - 1,
    };
  }
  enqueue(team, type, quantity, name = "Demo", userId = null, origin = "demo") {
    if (
      ![0, 1].includes(team) ||
      !SUMMONABLE.includes(type) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 500000
    )
      return { error: "Invalid summon" };
    const sequenceStart = this.nextSummonSequence;
    this.nextSummonSequence += quantity;
    this.summonQueue.push({
      team,
      type,
      quantity,
      remaining: quantity,
      name,
      userId,
      origin,
      sequenceStart,
      sourceRound: this.roundId,
    });
    this.queueStats.accepted += quantity;
    this.queueChanged();
    return {
      queued: quantity,
      sequenceStart,
      sequenceEnd: sequenceStart + quantity - 1,
    };
  }
  drainSummons(budget = this.spawnBatch) {
    if (!this.inputOpen) return 0;
    const started = performance.now();
    let spawned = 0,
      checked = 0;
    while (this.summonQueue.length && budget > 0 && checked++ < 500) {
      const q = this.summonQueue[0];
      const n = this.spawn(
        q.team,
        q.type,
        Math.min(q.remaining, budget, 16),
        q.name,
        q.userId,
        q.sequenceStart + (q.quantity - q.remaining),
        q.origin,
      );
      if (n > 0 && q.creditOnDeploy) {
        this.score(q.userId, q.name, q.team).coins += q.creditOnDeploy;
        this.teamScore[q.team] += q.creditOnDeploy;
        q.creditOnDeploy = 0;
      }
      q.remaining -= n;
      budget -= n;
      spawned += n;
      if (q.remaining === 0) this.summonQueue.shift();
      else if (n === 0) break;
      if (performance.now() - started >= this.spawnBudgetMs) break;
    }
    this.queueStats.spawned += spawned;
    if (spawned) this.queueChanged();
    return spawned;
  }
  likes({ id, name = "Viewer", count }) {
    const team = this.teams.get(String(id));
    if (team === undefined) return { error: "Choose a team first" };
    if (!this.inputOpen || this.winner !== null)
      return { error: "Battle ended" };
    count = Number(count);
    if (!Number.isInteger(count) || count <= 0 || count > 100000)
      return { error: "Invalid like count" };
    this.committedTeams.set(String(id), team);
    this.onCombat({ kind: "join", userId: id, name, team });
    this.energy[team] += count;
    this.score(id, name, team).likes += count;
    const now = this.clock();
    const buckets = this.likeBuckets[team];
    // Date.now clock has millisecond resolution: combine only identical times,
    // never round timestamps across the exact 10-second boundary.
    if (buckets.at(-1)?.at === now) buckets.at(-1).count += count;
    else buckets.push({ at: now, count });
    this.likeBuckets[team] = buckets.filter((b) => now - b.at < 10);
    const unlocked = [];
    for (const r of LIKE_REWARDS) {
      if (this.energy[team] < r.at || this.claimed[team].includes(r.at))
        continue;
      this.claimed[team].push(r.at);
      unlocked.push(r.at);
      switch (r.at) {
        case 100:
          this.enqueue(team, "sword", 3, name, id, "likes");
          break;
        case 300:
          this.enqueue(team, "archer", 2, name, id, "likes");
          break;
        case 500:
          this.castles[team] = Math.min(10000, this.castles[team] + 100);
          this.effect("heal", WORLD.castles[team], WORLD.ground, { team });
          break;
        case 1000:
          this.enqueue(team, "cavalry", 1, name, id, "likes");
          break;
        case 3000:
          this.arrowRain(team, { userId: id, name, team });
          break;
        case 5000:
          this.boostUntil[team] = this.time + 15;
          break;
      }
      this.event({
        name: r.label,
        team,
        type: "energy",
        kind: "reward",
        count: 0,
        value: r.at,
      });
    }
    const rolling = this.likeBuckets[team].reduce((n, b) => n + b.count, 0);
    let fury = false;
    if (rolling >= 500 && now >= this.furyUntil[team]) {
      this.furyUntil[team] = now + 60;
      this.likeBuckets[team] = [];
      fury = true;
      this.fury(team, { userId: id, name, team });
    }
    return { unlocked, fury, energy: this.energy[team] };
  }
  fury(team, source = { team, userId: null }) {
    if (!this.combatOpen) {
      this.pendingPowers.push({ type: "fury", team, source });
      return;
    }
    if (this.winner !== null) return;
    const kind = team === 0 ? "meteor" : "ice";
    for (const u of this.units)
      if (u.team !== team && u.hp > 0) {
        this.damage(u, 60, { ...source, team, x: WORLD.castles[team] }, true);
        this.effect(kind, u.x, u.y, { team });
      }
    this.damageCastle(1 - team, 120, source);
    this.effect(kind, WORLD.castles[1 - team], WORLD.ground, { team });
    this.event({
      name: team === 0 ? "Red Fury · Meteor shower" : "Blue Fury · Ice storm",
      team,
      kind: "fury",
      type: "fury",
      count: 0,
      value: 500,
    });
  }
  arrowRain(team, source = { team, userId: null }) {
    if (!this.combatOpen) {
      this.pendingPowers.push({ type: "rain", team, source });
      return;
    }
    if (this.winner !== null) return;
    const enemies = this.units.filter((u) => u.team !== team && u.hp > 0);
    for (let i = 0; i < 24; i++) {
      const t = enemies[i % Math.max(1, enemies.length)];
      const tx = t?.x ?? WORLD.castles[1 - team],
        ty = t?.y ?? WORLD.ground;
      this.addProjectile(
        { ...source, team, type: "archer", x: tx - 80, y: ty - 350 },
        t ? { ...t } : this.castle(1 - team),
        20,
        "rain",
        55,
      );
    }
    this.effect("rain", WORLD.width / 2, WORLD.ground, { team });
  }
  castle(team, lane = WORLD.ground) {
    return {
      id: "castle" + team,
      castle: true,
      team,
      x: WORLD.castles[team],
      y: clamp(lane, WORLD.ground - 900, WORLD.ground + 900),
      hp: this.castles[team],
    };
  }
  damageCastle(team, amount, source) {
    if (!this.combatOpen || this.winner !== null) return 0;
    const actual = Math.min(this.castles[team], Math.round(amount));
    if (actual <= 0) return 0;
    this.castles[team] -= actual;
    this.cameraEvent({
      kind: "castle",
      x: WORLD.castles[team],
      y: WORLD.ground,
      team: source.team,
      amount: actual,
    });
    this.onCombat({
      kind: "castle",
      eventId: this.combatEventId++,
      amount: actual,
      source,
    });
    if (this.castles[team] === 0) this.winner = 1 - team;
    return actual;
  }
  damage(target, amount, source, magic = false) {
    if (!this.combatOpen || this.winner !== null || target.hp <= 0) return 0;
    let blocked = false;
    if (
      target.type === "guardian" &&
      !magic &&
      (source.x - target.x) * (target.team === 0 ? 1 : -1) > 0
    ) {
      amount *= 0.55;
      blocked = true;
    }
    amount = Math.min(target.hp, Math.round(amount));
    target.hp = Math.max(0, target.hp - amount);
    this.cameraEvent({
      kind: "damage",
      x: target.x,
      y: target.y,
      team: source.team,
      amount,
    });
    target.hurt = 0.24;
    target.contributors ??= new Map();
    if (source.userId !== null && source.userId !== undefined)
      target.contributors.set(String(source.userId), {
        userId: source.userId,
        name: source.name,
        team: source.team,
      });
    this.onCombat({
      kind: "damage",
      eventId: this.combatEventId++,
      amount,
      source,
    });
    if (target.hp === 0) {
      target.state = "death";
      target.dead = 0;
      this.onCombat({
        kind: "kill",
        unitId: target.id,
        source,
        boss: target.type === "boss",
        helpers: [...target.contributors.values()],
      });
    }
    this.effect(blocked ? "block" : "hit", target.x, target.y, {
      amount,
      team: target.team,
      air: TYPES[target.type].air,
      sourceKind: source.kind || TYPES[source.type]?.projectile || "melee",
      dead: target.hp <= 0,
    });
    return amount;
  }
  addProjectile(
    u,
    target,
    damage,
    kind = TYPES[u.type].projectile,
    splash = 0,
  ) {
    if (this.projectiles.length >= 600) return;
    this.projectiles.push({
      id: this.nextId++,
      team: u.team,
      userId: u.userId,
      name: u.name,
      kind,
      x: u.x,
      y: u.y - (TYPES[u.type]?.air ? 85 : 25),
      tx: target.x,
      ty: target.y - (target.type && TYPES[target.type].air ? 85 : 25),
      target: target.id,
      damage,
      startLift: TYPES[u.type]?.air ? 84 : 10.5,
      endLift: target.type && TYPES[target.type].air ? 84 : 10.5,
      lift: TYPES[u.type]?.air ? 84 : 10.5,
      flightTime: Math.max(
        0.1,
        Math.hypot(target.x - u.x, target.y - u.y) /
          (kind === "fireball" ? 360 : 560),
      ),
      splash,
      speed: kind === "fireball" ? 360 : 560,
      age: 0,
    });
  }
  hitArea(
    team,
    x,
    y,
    amount,
    radius,
    knock = 0,
    canAir = false,
    source = { team, userId: null, x },
  ) {
    for (const v of this.units) {
      if (
        v.team === team ||
        v.hp <= 0 ||
        (!canAir && TYPES[v.type].air) ||
        Math.hypot(v.x - x, (v.y - y) * 1.2) > radius
      )
        continue;
      this.damage(v, amount, { ...source, team, x }, true);
      v.x = clamp(
        v.x + (team === 0 ? knock : -knock),
        WORLD.castles[0] + 60,
        WORLD.castles[1] - 60,
      );
    }
  }
  tick(dt, deploy = true) {
    if (deploy) this.drainSummons();
    if (!this.combatOpen) return;
    const powers = this.pendingPowers.splice(0);
    for (const p of powers) {
      if (p.type === "fury") this.fury(p.team, p.source);
      else this.arrowRain(p.team, p.source);
    }
    dt = clamp(dt, 0, 0.1); // Always age corpses, including after victory.
    for (const u of this.units) if (u.hp <= 0) u.dead += dt;
    this.units = this.units.filter((u) => u.dead < 0.95);
    if (this.winner !== null) return;
    this.time += dt;
    const grid = new SpatialGrid(100).build(this.units),
      byId = new Map(this.units.map((u) => [u.id, u]));
    const enemies = [new SpatialGrid(100), new SpatialGrid(100)];
    for (const u of this.units) if (u.hp > 0) enemies[u.team].add(u);
    const engaged = new Map();
    for (const u of this.units) {
      if (this.winner !== null) break;
      if (u.hp <= 0) continue;
      const t = TYPES[u.type];
      u.cd -= dt;
      u.skill -= dt;
      u.hurt = Math.max(0, u.hurt - dt);
      u.windup -= dt;
      if (u.windup > 0) {
        u.state = "idle";
        continue;
      }
      if (u.type === "boss" && !u.rage && u.hp < u.maxHp * 0.4) {
        u.rage = true;
        u.enrage = 0.8;
        this.effect("rage", u.x, u.y, { team: u.team });
      }
      if (u.enrage > 0) {
        u.enrage -= dt;
        u.state = "rage";
        continue;
      }
      let target = byId.get(u.targetId),
        best = Infinity;
      const valid = (v) =>
        v && v.hp > 0 && v.team !== u.team && (!TYPES[v.type].air || t.antiAir);
      if (valid(target))
        best = Math.hypot(target.x - u.x, (target.y - u.y) * 1.15);
      u.retarget = (u.retarget ?? seeded(u.id, 79) * 0.25) - dt;
      if (
        !valid(target) ||
        best > Math.max(340, t.range + 120) ||
        u.retarget <= 0
      ) {
        target = null;
        best = Infinity;
        let cost = Infinity;
        enemies[1 - u.team].query(
          u.x,
          u.y,
          Math.max(240, t.range + 80),
          (v) => {
            if (!valid(v)) return;
            const d = Math.hypot(v.x - u.x, (v.y - u.y) * 1.15),
              candidate = d + (engaged.get(v.id) || 0) * 12;
            if (candidate < cost) {
              cost = candidate;
              best = d;
              target = v;
            }
          },
          128,
          u.id,
        );
        u.targetId = target?.id;
        u.retarget = 0.2 + seeded(u.id, 89) * 0.15;
      }
      if (target) engaged.set(target.id, (engaged.get(target.id) || 0) + 1);
      // Titan prioritizes the enemy fortress, only engaging blockers already in melee range.
      if (
        !target ||
        (u.type === "boss" && best > t.range + TYPES[target.type].radius)
      ) {
        target = this.castle(1 - u.team, u.lane ?? u.y);
        best = Math.hypot(u.x - target.x, (u.y - target.y) * 1.2);
      }
      const reach =
        (u.type === "cavalry" && u.charge ? t.radius + 5 : t.range) +
        (target.castle ? 48 : TYPES[target.type].radius);
      if (best <= reach) {
        u.state = u.hurt > 0 ? "hurt" : "attack";
        if (u.cd <= 0) {
          const boost = this.boostUntil[u.team] > this.time ? 1.2 : 1;
          u.cd = t.cooldown / boost / (u.rage ? 1.2 : 1);
          u.attackId++;
          let amount = t.damage * (u.rage ? 1.25 : 1);
          if (t.projectile)
            this.addProjectile(u, target, amount, t.projectile, t.splash || 0);
          else if (target.castle) {
            this.damageCastle(1 - u.team, amount, u);
            this.effect("hit", target.x, target.y, {
              amount: Math.round(amount),
              team: 1 - u.team,
            });
          } else this.damage(target, amount, u);
          if ((u.type === "guardian" || u.type === "boss") && u.skill <= 0) {
            u.skill = u.type === "guardian" ? 6 : 5;
            u.stomping = 0.65;
            this.hitArea(
              u.team,
              u.x,
              u.y,
              u.type === "guardian" ? 35 : 120,
              u.type === "guardian" ? 135 : 175,
              u.type === "guardian" ? 48 : 24,
              false,
              u,
            );
            this.effect("stomp", u.x, u.y, {
              team: u.team,
              radius: u.type === "guardian" ? 135 : 175,
            });
          }
        }
      } else {
        u.state = u.hurt > 0 ? "hurt" : t.air ? "fly" : "run";
        const velocity = t.speed;
        if (best > 0) {
          u.x += ((target.x - u.x) / best) * velocity * dt;
          const wander =
            Math.sin(
              this.time * (0.7 + seeded(u.id, 271) * 0.45) +
                seeded(u.id, 291) * Math.PI * 2,
            ) * 48;
          const goalY =
            target.castle && Math.abs(target.x - u.x) > 650
              ? clamp((u.lane ?? u.y) + wander, WORLD.laneMin, WORLD.laneMax)
              : target.y;
          const lateral = clamp(
            (goalY - u.y) * 0.8,
            -velocity * 0.65,
            velocity * 0.65,
          );
          u.y += lateral * dt;
        }
      }
      if (u.stomping > 0) {
        u.stomping -= dt;
        u.state = "stomp";
      }
      // Soft circle collisions, same altitude only. Ground troops cannot block flight.
      let sx = 0,
        sy = 0,
        n = 0;
      grid.query(
        u.x,
        u.y,
        t.radius + 85,
        (v) => {
          if (v === u || v.hp <= 0 || TYPES[v.type].air !== t.air) return;
          const ax = u.x - v.x,
            ay = u.y - v.y,
            d = Math.hypot(ax, ay),
            r = t.radius + TYPES[v.type].radius + 3;
          if (d <= 0.01) {
            sx += (u.id < v.id ? -1 : 1) * r * 0.6;
            n++;
          } else if (d < r) {
            sx += (ax / d) * (r - d);
            sy += (ay / d) * (r - d);
            n++;
          }
        },
        64,
        u.id,
      );
      if (n) {
        u.x += (sx / n) * dt * 3;
        u.y += (sy / n) * dt * 4;
      }
      // No row restoration: local separation and individually varied routes keep a swarm.
      u.x = clamp(u.x, WORLD.castles[0] + 60, WORLD.castles[1] - 60);
      u.y = clamp(u.y, WORLD.laneMin, WORLD.laneMax);
    }
    this.spawnGridDirty = true;
    const alive = byId;
    const pending = [];
    for (const p of this.projectiles) {
      if (this.winner !== null) break;
      p.age += dt;
      p.lift =
        p.startLift +
        (p.endLift - p.startLift) * Math.min(1, p.age / p.flightTime);
      const t =
        typeof p.target === "string"
          ? this.castle(Number(p.target.at(-1)), p.ty + 25)
          : alive.get(p.target);
      if (t && t.hp > 0 && p.kind !== "rain") {
        p.tx = t.x;
        p.ty = t.y - (t.type && TYPES[t.type].air ? 85 : 25);
      }
      const dx = p.tx - p.x,
        dy = p.ty - p.y,
        d = Math.hypot(dx, dy);
      if (d <= p.speed * dt) {
        if (typeof p.target === "string") {
          const team = Number(p.target.at(-1));
          this.damageCastle(team, p.damage, p);
        } else if (p.splash) {
          this.hitArea(
            p.team,
            p.tx,
            p.ty + (t?.type && TYPES[t.type].air ? 85 : 25),
            p.damage,
            p.splash,
            0,
            true,
            p,
          );
        } else if (t && t.hp > 0) this.damage(t, p.damage, p);
        this.effect(p.kind === "fireball" ? "explosion" : "spark", p.tx, p.ty, {
          team: p.team,
        });
      } else if (p.age < 6) {
        p.x += (dx / d) * p.speed * dt;
        p.y += (dy / d) * p.speed * dt;
        pending.push(p);
      }
    }
    this.projectiles = pending;
    if (this.winner === null && this.castles.some((h) => h <= 0))
      this.winner = this.castles[0] <= 0 ? 1 : 0;
  }
  snapshot() {
    const now = this.clock();
    return {
      units: this.units.map(
        ({
          id,
          team,
          type,
          name,
          x,
          y,
          hp,
          maxHp,
          state,
          charge,
          rage,
          summonSequence,
          origin,
          attackId,
          spawnBand,
        }) => ({
          id,
          team,
          type,
          name,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          hp,
          maxHp,
          state,
          charge,
          rage,
          summonSequence,
          origin,
          attackId,
          spawnBand,
        }),
      ),
      cameraEvents: this.cameraEvents.filter((e) => this.time - e.time < 4),
      projectiles: this.projectiles,
      effects: this.effects.filter((e) => this.time - e.time < 1),
      castles: this.castles,
      time: this.time,
      winner: this.winner,
      round: this.round,
      energy: this.energy,
      teamScore: this.teamScore,
      armyCapacity: this.maxUnits,
      summonQueue: {
        ...this.queueStats,
        pending: this.summonQueue.reduce((n, q) => n + q.remaining, 0),
        batches: this.summonQueue.length,
        headSequence: this.summonQueue[0]
          ? this.summonQueue[0].sequenceStart +
            this.summonQueue[0].quantity -
            this.summonQueue[0].remaining
          : null,
        nextSequence: this.nextSummonSequence,
      },
      claimed: this.claimed,
      boost: this.boostUntil.map((t) => Math.max(0, t - this.time)),
      furyCooldown: this.furyUntil.map((t) => Math.max(0, t - now)),
      scores: [...this.scores.values()]
        .sort(
          (a, b) =>
            b.coins * 10 + b.likes / 100 - (a.coins * 10 + a.likes / 100),
        )
        .slice(0, 5),
      events: this.events,
    };
  }
}
