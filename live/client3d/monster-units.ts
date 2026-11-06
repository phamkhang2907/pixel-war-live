import type { KenneyParticles } from "./kenney-particles";
import { terrainHeight } from "./grass-material";
import * as T from "three";
import {
  MonsterAssets,
  monsterSlots,
  type MonsterInstance,
} from "./monster-assets";
import {
  worldX,
  worldZ,
  isSoldier,
  type BattleState,
  type MonsterKind,
  type UnitState,
} from "./state";
type Particle = {
  position: T.Vector3;
  velocity: T.Vector3;
  age: number;
  born: number;
  life: number;
  color: T.Color;
  size: number;
};
export class MonsterUnits {
  readonly group = new T.Group();
  readonly assets = new MonsterAssets();
  private instances = new Map<number, MonsterInstance>();
  private particles: Particle[] = [];
  private seen = new Set<string>();
  private matrix = new T.Matrix4();
  private quaternion = new T.Quaternion();
  private scale = new T.Vector3();
  private particleGeometry = new T.IcosahedronGeometry(0.14, 0);
  private particleMaterial = new T.MeshBasicMaterial({
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  private particleMesh = new T.InstancedMesh(
    this.particleGeometry,
    this.particleMaterial,
    220,
  );
  private projectileMesh = new T.InstancedMesh(
    this.particleGeometry,
    this.particleMaterial,
    64,
  );
  private low = true;
  private particleBudget = 80;
  private age = 0;
  private roundId = "";
  constructor(private kenney?: KenneyParticles) {
    this.group.name = "Quaternius monsters · exact three-model allowlist";
    for (const m of [this.particleMesh, this.projectileMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.group.add(m);
    }
  }
  setQuality(low: boolean, particleBudget = low ? 80 : 160) {
    this.particleBudget = particleBudget;
    if (this.particles.length > particleBudget)
      this.particles.length = particleBudget;
    this.low = low;
  }
  update(state: BattleState | null, dt: number, camera: T.Vector3) {
    if (state && this.roundId !== state.roundState.id) {
      this.roundId = state.roundState.id;
      this.particles = [];
      this.seen.clear();
      this.particleMesh.count = 0;
      this.projectileMesh.count = 0;
    }
    const units = state?.units.filter((u) => !isSoldier(u)) ?? [],
      ids = new Set(units.map((u) => u.id));
    for (const [id, i] of this.instances)
      if (!ids.has(id)) {
        this.assets.release(i);
        this.instances.delete(id);
      }
    const frozen =
      state?.paused ||
      ["ready", "stopped", "results", "countdown", "prepare"].includes(
        state?.roundState.phase ?? "",
      );
    for (const u of units) {
      let i = this.instances.get(u.id);
      const type = u.type as MonsterKind,
        slot = monsterSlots[type];
      if (!slot) continue;
      if (!i) {
        i = this.assets.acquire(type, u.team) ?? undefined;
        if (!i) continue;
        i.root.position.set(
          worldX(u.x),
          terrainHeight(worldX(u.x), worldZ(u.y)) +
            (type === "mushroomKing" ? 0 : 5.6),
          worldZ(u.y),
        );
        if (u.summonRequest !== undefined && type !== "mushroomKing")
          i.revealAt = performance.now() / 1000;
        this.instances.set(u.id, i);
        this.group.add(i.root);
      }
      const target = new T.Vector3(
        worldX(u.x),
        terrainHeight(worldX(u.x), worldZ(u.y)) +
          (type === "mushroomKing" ? 0 : 5.6),
        worldZ(u.y),
      );
      i.root.position.lerp(target, 1 - Math.exp(-16 * dt));
      const nearShadow =
        !this.low &&
        Math.hypot(i.root.position.x - camera.x, i.root.position.z - camera.z) <
          120;
      i.root.traverse((o) => {
        if (o instanceof T.SkinnedMesh) o.castShadow = nearShadow;
      });
      const emerging =
        i.revealAt === undefined
          ? 1
          : T.MathUtils.clamp(
              (performance.now() / 1000 - i.revealAt) / 0.65,
              0.08,
              1,
            );
      i.root.scale.setScalar(
        type === "mushroomKing" ? 1 : 1 - Math.pow(1 - emerging, 3),
      );
      const dx = (u.faceX ?? (u.team ? 0 : 4800)) - u.x,
        dz = (u.faceY ?? u.y) - u.y;
      i.rig.rotation.y = Math.atan2(dx, dz);
      const clip =
        u.hp <= 0
          ? slot.death
          : frozen
            ? slot.idle
            : u.state === "hurt"
              ? "HitReact"
              : u.state === "attack"
                ? slot.attack
                : u.state === "fly"
                  ? slot.move
                  : slot.idle;
      this.assets.animate(
        i,
        clip,
        clip + (/attack/.test(u.state) ? ":" + u.attackId : ""),
        u.hp <= 0,
      );
      i.elapsed += state?.paused ? 0 : dt;
      const interval =
        this.low && i.root.position.distanceTo(camera) > 70 ? 1 / 15 : 1 / 30;
      if (i.elapsed >= interval) {
        i.mixer.update(i.elapsed);
        i.elapsed = 0;
      }
    }
    const raw = state as BattleState & {
      effects?: {
        id: number;
        type: string;
        x: number;
        y: number;
        team: number;
        element?: string;
        sourceId?: number;
        sx?: number;
        sy?: number;
      }[];
      projectiles?: {
        id: number;
        kind: string;
        team: number;
        x: number;
        y: number;
        age: number;
        born: number;
        flightTime: number;
        startGroundY: number;
        endGroundY: number;
        lift: number;
      }[];
    };
    if (raw && !frozen)
      for (const e of raw.effects ?? []) {
        if (e.type !== "dragonBreath") continue;
        const key = state!.roundState.id + ":" + e.id;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        if (this.seen.size > 128)
          this.seen.delete(this.seen.values().next().value!);
        const start = new T.Vector3(
            worldX(e.sx ?? e.x),
            5.9,
            worldZ(e.sy ?? e.y),
          ),
          end = new T.Vector3(worldX(e.x), 0.8, worldZ(e.y)),
          color = new T.Color(e.element === "ice" ? 0x55d9ff : 0xff6028);
        const caster = this.instances.get(e.sourceId ?? -1),
          head = caster?.rig.getObjectByName("Head");
        if (head) {
          head.getWorldPosition(start);
          const direction = end.clone().sub(start);
          direction.y = 0;
          if (direction.lengthSq() > 0)
            start.addScaledVector(direction.normalize(), 1.1);
          start.y -= 0.25;
        }
        const flow = end.clone().sub(start).normalize().multiplyScalar(8);
        this.kenney?.emit(
          e.element === "ice" ? "star_01" : "flame_01",
          start,
          e.element === "ice" ? 0x78e9ff : 0xff8c2a,
          32,
          { size: 1.1, life: 0.65, spread: 0.4, velocity: flow, gravity: 0 },
        );
        this.kenney?.emit(
          "smoke_04",
          start,
          e.element === "ice" ? 0x8fc3e6 : 0x713391,
          15,
          {
            size: 2.5,
            life: 1,
            spread: 0.6,
            velocity: flow.clone().multiplyScalar(0.4),
          },
        );
        this.kenney?.emit(
          e.element === "ice" ? "magic_01" : "fire_01",
          end,
          e.element === "ice" ? 0x76e3ff : 0xff9239,
          18,
          { size: 1.8, life: 0.7, spread: 1.2 },
        );
        for (
          let j = 0;
          j < (this.low ? 24 : 44) &&
          this.particles.length < this.particleBudget;
          j++
        ) {
          const f = j / (this.low ? 24 : 44),
            p = start.clone().lerp(end, f);
          p.x += Math.sin(j * 2.4) * f;
          p.z += Math.cos(j * 2.4) * f;
          this.particles.push({
            position: p,
            velocity: end.clone().sub(start).multiplyScalar(0.5),
            age: 0,
            born: performance.now() / 1000,
            life: 0.55 + (j % 4) * 0.08,
            color,
            size: 1 + f * 1.8,
          });
        }
      }
    for (const p of this.particles) {
      const age = performance.now() / 1000 - p.born,
        step = Math.min(0.08, Math.max(0, age - p.age));
      p.age = age;
      if (!frozen) p.position.addScaledVector(p.velocity, step);
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    this.particles.forEach((p, k) => {
      this.scale.setScalar(p.size * (1 - p.age / p.life));
      this.matrix.compose(p.position, this.quaternion, this.scale);
      this.particleMesh.setMatrixAt(k, this.matrix);
      this.particleMesh.setColorAt(k, p.color);
    });
    this.particleMesh.count = this.particles.length;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor)
      this.particleMesh.instanceColor.needsUpdate = true;
    let n = 0;
    for (const p of raw?.projectiles ?? []) {
      if (p.kind !== "kingMagic" || n >= 64) continue;
      const f = Math.min(1, p.age / p.flightTime),
        position = new T.Vector3(
          worldX(p.x),
          T.MathUtils.lerp(p.lift / 50, 0.9, f) + Math.sin(f * Math.PI) * 0.7,
          worldZ(T.MathUtils.lerp(p.startGroundY, p.endGroundY, f)),
        );
      position.y += terrainHeight(position.x, position.z);
      this.scale.setScalar(2.4);
      this.matrix.compose(position, this.quaternion, this.scale);
      this.projectileMesh.setMatrixAt(n, this.matrix);
      this.projectileMesh.setColorAt(
        n++,
        new T.Color(p.team === 0 ? 0xff54cc : 0x55e5ff),
      );
    }
    this.projectileMesh.count = n;
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    if (this.projectileMesh.instanceColor)
      this.projectileMesh.instanceColor.needsUpdate = true;
    this.age += dt;
  }
  diagnostics() {
    return {
      reports: this.assets.reports,
      rendered: this.instances.size,
      particles: this.particles.length,
      projectiles: this.projectileMesh.count,
      animationHz: this.low ? 15 : 30,
      instances: [...this.instances].map(([id, i]) => ({
        id,
        model: i.root.name,
        clip: i.action?.getClip().name,
        time: i.action?.time,
        position: i.root.position.toArray(),
        rootBoneId: i.root.userData.rootBoneId,
      })),
    };
  }
  dispose() {
    this.assets.dispose();
    this.particleMesh.dispose();
    this.projectileMesh.dispose();
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.group.clear();
  }
}
