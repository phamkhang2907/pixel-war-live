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
  private age = 0;
  constructor() {
    this.group.name = "Quaternius monsters · exact three-model allowlist";
    for (const m of [this.particleMesh, this.projectileMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.group.add(m);
    }
  }
  setQuality(low: boolean) {
    this.low = low;
  }
  update(state: BattleState | null, dt: number, camera: T.Vector3) {
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
          type === "mushroomKing" ? 0 : 5.6,
          worldZ(u.y),
        );
        this.instances.set(u.id, i);
        this.group.add(i.root);
      }
      const target = new T.Vector3(
        worldX(u.x),
        type === "mushroomKing" ? 0 : 5.6,
        worldZ(u.y),
      );
      i.root.position.lerp(target, 1 - Math.exp(-16 * dt));
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
      i.elapsed += frozen ? 0 : dt;
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
        for (
          let j = 0;
          j < (this.low ? 24 : 44) && this.particles.length < 220;
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
            life: 0.55 + (j % 4) * 0.08,
            color,
            size: 1 + f * 1.8,
          });
        }
      }
    if (!frozen)
      for (const p of this.particles) {
        p.age += Math.min(dt, 0.08);
        p.position.addScaledVector(p.velocity, Math.min(dt, 0.08));
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
          Math.max(0.3, p.lift / 50) + Math.sin(f * Math.PI) * 0.7,
          worldZ(T.MathUtils.lerp(p.startGroundY, p.endGroundY, f)),
        );
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
