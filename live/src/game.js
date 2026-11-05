import { DEFAULT_GIFT_MAPPINGS, resolveGift, SUMMONABLE } from "./gifts.js";
import { safeAvatar } from "./hud-data.js";
import { TYPES, WORLD, LIKE_REWARDS, formation } from "./characters.js";
export { TYPES } from "./characters.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export class Battle {
  constructor({ clock = () => Date.now() / 1000 } = {}) {
    this.onCombat = () => {};
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
    this.summonQueue = [];
    this.giftRates = new Map();
    this.globalGiftRate = { at: this.clock(), count: 0 };
    this.queueStats = { accepted: 0, spawned: 0, rejected: 0, expired: 0 };
    this.inputOpen = true;
    this.combatOpen = true;
    this.pendingPowers = [];
    this.committedTeams = new Map();
    this.spawnSlots = [0, 0];
    this.cameraEvents = [];
    this.cameraEventId ??= 1;
    this.units = [];
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
    if (!this.inputOpen || ![0, 1].includes(team) || id === undefined) return;
    if (
      this.committedTeams.has(String(id)) &&
      this.committedTeams.get(String(id)) !== team
    )
      return;
    this.teams.set(String(id), team);
    this.onCombat({ kind: "join", userId: id, name, team });
  }
  spawn(team, type, count, name = "Demo", userId = name) {
    if (
      !this.inputOpen ||
      this.winner !== null ||
      !Object.hasOwn(TYPES, type) ||
      ![0, 1].includes(team) ||
      !Number.isFinite(count)
    )
      return 0;
    const t = TYPES[type];
    count = clamp(Math.floor(count), 0, 300 - this.units.length);
    for (let i = 0; i < count; i++) {
      const unitId = this.nextId++;
      const position = formation(team, this.spawnSlots[team]++, type);
      this.units.push({
        id: unitId,
        team,
        type,
        name: String(name).slice(0, 24),
        userId,
        ...position,
        hp: t.hp,
        maxHp: t.hp,
        cd: Math.random() * 0.5,
        state: "idle",
        hurt: 0,
        dead: 0,
        windup: 0.4,
        skill: 0,
        charge: false,
        chargeUntil: 0,
        rage: false,
      });
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
    return count;
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
  }) {
    const team = this.teams.get(String(id));
    const reject = (error) => {
      this.queueStats.rejected++;
      return { error };
    };
    if (team === undefined) return reject("Choose a team with 1 or 2 first");
    if (!this.inputOpen || this.winner !== null)
      return reject("Round closed; gift is not carried to the next round");
    if (
      (roundId && roundId !== this.roundId) ||
      (eventAt && eventAt < this.roundStartedAt - 1000)
    )
      return reject("Late gift from an earlier round");
    const rule = resolveGift(this.giftMappings, { giftId, giftName, coins });
    if (!rule) return reject("No configured action for this gift");
    const repeats = Number(count ?? 1);
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10000)
      return reject("Invalid streak count");
    const quantity = rule.count * repeats,
      pending = this.summonQueue.reduce((n, q) => n + q.remaining, 0);
    const now = this.clock();
    if (now - this.globalGiftRate.at >= 1)
      this.globalGiftRate = { at: now, count: 0 };
    let rate = this.giftRates.get(String(id));
    if (!rate || now - rate.at >= 10) {
      rate = { at: now, count: 0 };
      this.giftRates.set(String(id), rate);
    }
    if (
      this.globalGiftRate.count >= 200 ||
      rate.count >= 40 ||
      this.summonQueue.length >= 500 ||
      pending + quantity > 5000
    )
      return reject(
        "Summon queue/rate limit reached; no units or coins credited",
      );
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
    this.score(id, name, team).coins += value;
    this.teamScore[team] += value;
    this.summonQueue.push({
      team,
      type: rule.type,
      remaining: quantity,
      name,
      userId: id,
      roundId: this.roundId,
    });
    this.queueStats.accepted += quantity;
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
    return { queued: quantity, spawned: 0 };
  }
  drainSummons(budget = 8) {
    if (!this.inputOpen) return 0;
    let spawned = 0,
      checked = 0;
    while (this.summonQueue.length && budget > 0 && checked++ < 500) {
      const q = this.summonQueue[0];
      if (q.roundId !== this.roundId) {
        this.queueStats.expired += q.remaining;
        this.summonQueue.shift();
        continue;
      }
      const n = this.spawn(
        q.team,
        q.type,
        Math.min(q.remaining, budget),
        q.name,
        q.userId,
      );
      q.remaining -= n;
      budget -= n;
      spawned += n;
      if (q.remaining === 0) this.summonQueue.shift();
      else if (n === 0) break;
    }
    this.queueStats.spawned += spawned;
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
          this.spawn(team, "sword", 3, name, id);
          break;
        case 300:
          this.spawn(team, "archer", 2, name, id);
          break;
        case 500:
          this.castles[team] = Math.min(10000, this.castles[team] + 100);
          this.effect("heal", WORLD.castles[team], WORLD.ground, { team });
          break;
        case 1000:
          this.spawn(team, "cavalry", 1, name, id);
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
      y: clamp(lane, WORLD.laneMin, WORLD.laneMax),
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
  tick(dt) {
    this.drainSummons();
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
    const cells = new Map(),
      key = (x, y) => `${Math.floor(x / 160)},${Math.floor(y / 160)}`;
    for (const u of this.units)
      if (u.hp > 0) {
        const k = key(u.x, u.y);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(u);
      }
    const neighbors = (u, r = 1) => {
      const list = [];
      const cx = Math.floor(u.x / 160),
        cy = Math.floor(u.y / 160);
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (const v of cells.get(`${cx + dx},${cy + dy}`) || [])
            list.push(v);
      return list;
    };
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
      let target = null,
        best = Infinity;
      const near = neighbors(u, Math.ceil(t.range / 160) + 1);
      for (const v of near) {
        if (v.team === u.team || v.hp <= 0 || (TYPES[v.type].air && !t.antiAir))
          continue;
        if (Math.abs(v.y - u.y) > WORLD.rowGap * 1.4) continue;
        const d = Math.hypot(v.x - u.x, (v.y - u.y) * 1.2);
        if (d < best) {
          best = d;
          target = v;
        }
      }
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
          const goalY = clamp(
            target.y,
            (u.lane ?? u.y) - WORLD.rowGap * 0.45,
            (u.lane ?? u.y) + WORLD.rowGap * 0.45,
          );
          u.y += ((goalY - u.y) / best) * velocity * dt;
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
      for (const v of neighbors(u)) {
        if (v === u || v.hp <= 0 || TYPES[v.type].air !== t.air) continue;
        const ax = u.x - v.x,
          ay = u.y - v.y,
          d = Math.hypot(ax, ay),
          r = Math.max(25, t.radius) + Math.max(25, TYPES[v.type].radius);
        if (d <= 0.01) {
          sx += (u.id < v.id ? -1 : 1) * r * 0.6;
          n++;
        } else if (d < r) {
          sx += (ax / d) * (r - d);
          sy += (ay / d) * (r - d);
          n++;
        }
      }
      if (n) {
        u.x += (sx / n) * dt * 3;
        u.y += (sy / n) * dt * 4;
      }
      // Lane restoration prevents pursuit and separation from collapsing the frontage.
      if (u.lane !== undefined) u.y += clamp(u.lane - u.y, -35, 35) * dt * 0.6;
      u.x = clamp(u.x, WORLD.castles[0] + 60, WORLD.castles[1] - 60);
      u.y = clamp(u.y, WORLD.laneMin, WORLD.laneMax);
    }
    const alive = new Map(this.units.map((u) => [u.id, u]));
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
        ({ id, team, type, name, x, y, hp, maxHp, state, charge, rage }) => ({
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
      summonQueue: {
        ...this.queueStats,
        pending: this.summonQueue.reduce((n, q) => n + q.remaining, 0),
        batches: this.summonQueue.length,
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
