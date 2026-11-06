import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { worldX, worldZ, isSoldier, type BattleState } from "./state";
import { terrainHeight } from "./grass-material";
import { KenneyParticles } from "./kenney-particles";
import { QUALITY, type Quality } from "./quality";
const point = (x: number, y: number, lift = 0) =>
  new T.Vector3(
    worldX(x),
    terrainHeight(worldX(x), worldZ(y)) + lift,
    worldZ(y),
  );
type Ring = {
  at: T.Vector3;
  color: T.Color;
  age: number;
  life: number;
  radius: number;
};
type Bolt = { points: T.Vector3[]; color: T.Color; age: number };
export class CombatEffects {
  readonly group = new T.Group();
  private previous = new Map<
    number,
    { hp: number; attack: number; step: number }
  >();
  private lastEffectId = 0;
  private round = "";
  private clock = 0;
  private quality: Quality = "medium";
  private arrows: T.InstancedMesh;
  private rings: T.InstancedMesh;
  private ringList: Ring[] = [];
  private bolts: Bolt[] = [];
  private lines: T.LineSegments;
  private matrix = new T.Matrix4();
  private rotation = new T.Quaternion();
  private scale = new T.Vector3();
  private up = new T.Vector3(0, 1, 0);
  private castles: number[] = [];
  private projectileSeen = new Set<number>();
  private arrowPositions = new Map<number, T.Vector3>();
  private trailAt = new Map<number, number>();
  private particleStats = { attacks: 0, castleHits: 0, deaths: 0 };
  constructor(private particles: KenneyParticles) {
    this.group.name =
      "Authoritative projectiles and pooled Kenney combat effects";
    const shaft = new T.CylinderGeometry(0.028, 0.028, 0.8, 5),
      head = new T.ConeGeometry(0.095, 0.25, 5);
    head.translate(0, 0.48, 0);
    const g = mergeGeometries([shaft, head])!;
    shaft.dispose();
    head.dispose();
    this.arrows = new T.InstancedMesh(
      g,
      new T.MeshStandardMaterial({
        color: 0xc6aa7b,
        roughness: 0.7,
        metalness: 0.1,
      }),
      260,
    );
    this.arrows.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.arrows.frustumCulled = false;
    this.arrows.count = 0;
    this.arrows.name = "Pooled three-dimensional arrows";
    this.group.add(this.arrows);
    const ringMat = new T.MeshBasicMaterial({
      transparent: true,
      opacity: 0.65,
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: T.DoubleSide,
    });
    this.rings = new T.InstancedMesh(
      new T.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2),
      ringMat,
      16,
    );
    this.rings.frustumCulled = false;
    this.rings.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.rings.count = 0;
    this.group.add(this.rings);
    const lines = new T.BufferGeometry();
    lines.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(8 * 7 * 2 * 3), 3).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    lines.setAttribute(
      "color",
      new T.BufferAttribute(new Float32Array(8 * 7 * 2 * 3), 3).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    lines.setDrawRange(0, 0);
    this.lines = new T.LineSegments(
      lines,
      new T.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: T.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
  }
  setQuality(q: Quality) {
    this.quality = q;
  }
  private ring(at: T.Vector3, color: number, radius: number) {
    if (this.ringList.length >= 16) this.ringList.shift();
    this.ringList.push({
      at: at.clone(),
      color: new T.Color(color).multiplyScalar(2.5),
      radius,
      age: 0,
      life: 0.65,
    });
  }
  private bolt(a: T.Vector3, b: T.Vector3, color: number) {
    if (this.bolts.length >= 8) this.bolts.shift();
    const direction = b.clone().sub(a),
      points = Array.from({ length: 8 }, (_, i) =>
        a
          .clone()
          .addScaledVector(direction, i / 7)
          .add(
            new T.Vector3(
              i === 0 || i === 7 ? 0 : Math.sin(i * 12.9) * 0.4,
              i === 0 || i === 7 ? 0 : Math.cos(i * 7.8) * 0.5,
              0,
            ),
          ),
      );
    this.bolts.push({
      points,
      color: new T.Color(color).multiplyScalar(4),
      age: 0,
    });
  }
  update(state: BattleState | null, dt: number) {
    if (!state) return;
    if (this.round !== state.roundState.id) {
      this.round = state.roundState.id;
      this.previous.clear();
      this.lastEffectId = 0;
      this.ringList = [];
      this.bolts = [];
      this.castles = [...state.castles];
      this.projectileSeen.clear();
      this.arrowPositions.clear();
      this.trailAt.clear();
    }
    const running =
      !state.paused && ["combat", "final"].includes(state.roundState.phase);
    if (running) this.clock += dt;
    const raw = state as BattleState & { effects?: any[]; projectiles?: any[] };
    if (running) {
      for (const e of raw.effects ?? []) {
        if (!Number.isFinite(e.id) || e.id <= this.lastEffectId) continue;
        this.lastEffectId = e.id;
        const at = point(e.x, e.y, e.air ? 3 : 0.45),
          purple = e.team === 0 ? 0xc34dff : 0x72cfff;
        if (e.type === "explosion") {
          this.particles.emit("fire_01", at, 0xff842a, 18, {
            size: 1.8,
            life: 0.55,
          });
          this.particles.emit("smoke_04", at, 0x644070, 10, { size: 2.5 });
          this.ring(at, 0xffb33d, 3);
        } else if (
          e.type === "hit" ||
          e.type === "block" ||
          e.type === "spark"
        ) {
          this.particles.emit(
            "spark_01",
            at,
            e.type === "block" ? 0x84dfff : 0xffd878,
            5,
            { size: 0.35, gravity: 6 },
          );
          if (e.sourceKind === "melee")
            this.particles.emit("slash_01", at, 0xffe7aa, 1, {
              size: 1.4,
              life: 0.2,
              speed: 0,
              gravity: 0,
            });
          if (e.dead) {
            this.particles.emit("smoke_01", at, 0x9c81a5, 7, {
              size: 1.4,
              life: 0.9,
            });
            this.particles.emit("star_01", at, purple, 4, { size: 0.4 });
            this.particleStats.deaths++;
          }
        } else if (e.type === "stomp" || e.type === "rage") {
          this.ring(at, purple, 6);
          this.particles.emit("dirt_01", at, 0xd2ba85, 30, {
            size: 1.8,
            spread: 2.5,
            speed: 4,
            life: 1,
          });
        } else if (
          e.type === "fire" ||
          e.type === "meteor" ||
          e.type === "ice" ||
          e.type === "fury"
        ) {
          this.particles.emit(
            e.team === 0 ? "flame_01" : "star_01",
            at,
            e.team === 0 ? 0xff842a : 0x75dfff,
            20,
            { size: 2, spread: 3 },
          );
          this.ring(at, purple, 5);
        }
      }
      const ids = new Set(state.units.map((u) => u.id));
      for (const id of this.previous.keys())
        if (!ids.has(id)) this.previous.delete(id);
      let tracked = 0;
      for (const u of state.units) {
        if (!isSoldier(u) || tracked++ >= 360) continue;
        const old = this.previous.get(u.id),
          at = point(u.x, u.y, u.type === "mage" ? 4 : 1);
        if (old && (u.attackId ?? 0) !== old.attack && u.hp > 0) {
          this.particleStats.attacks++;
          if (u.type === "mage") {
            this.particles.emit("smoke_04", at, 0x8726b5, 9, {
              size: 2,
              life: 1.1,
              spread: 0.7,
            });
            this.particles.emit("magic_01", at, 0xde86ff, 8, {
              size: 0.7,
              life: 0.6,
            });
          } else if (u.type === "boss" || u.type === "guardian") {
            this.ring(point(u.x, u.y, 0.08), u.team ? 0x70cfff : 0xff7b4a, 4.5);
            this.particles.emit("dirt_01", point(u.x, u.y, 0.2), 0xc6ad8f, 16, {
              size: 1.5,
              spread: 2,
              life: 0.75,
            });
          } else if (u.type !== "archer")
            this.particles.emit("slash_01", at, 0xffe5a6, 1, {
              size: u.type === "cavalry" ? 2 : 1.2,
              life: 0.22,
              gravity: 0,
              speed: 0,
            });
        }
        let step = old?.step ?? 0;
        if (
          u.state === "run" &&
          u.hp > 0 &&
          this.clock - step > 0.45 &&
          u.id % 4 === 0
        ) {
          this.particles.emit("dirt_01", point(u.x, u.y, 0.1), 0xc0ac7b, 1, {
            size: 0.5,
            life: 0.45,
            speed: 0.25,
          });
          step = this.clock;
        }
        this.previous.set(u.id, { hp: u.hp, attack: u.attackId ?? 0, step });
      }
      state.castles.forEach((hp, team) => {
        if (hp < (this.castles[team] ?? hp)) {
          const at = new T.Vector3(team ? 40 : -40, 3, 0);
          this.particles.emit("smoke_01", at, 0x9d8ba6, 14, {
            size: 2,
            life: 1.2,
          });
          this.particles.emit("spark_01", at, 0xffbc58, 15, { size: 0.5 });
          this.ring(new T.Vector3(at.x, 0.05, 0), 0xffb75c, 4);
          this.particleStats.castleHits++;
        }
      });
      this.castles = [...state.castles];
    }
    let arrowCount = 0;
    const ids = new Set<number>();
    for (const p of raw.projectiles ?? []) {
      ids.add(p.id);
      const t = T.MathUtils.clamp(p.age / p.flightTime, 0, 1),
        z = worldZ(
          T.MathUtils.lerp(p.startGroundY ?? p.y, p.endGroundY ?? p.ty, t),
        ),
        x = worldX(p.x),
        arrow = p.kind === "arrow",
        lift = T.MathUtils.lerp(
          p.kind === "arrow" && p.startLift === 10.5
            ? 1.05
            : p.kind === "fireball"
              ? 4.1
              : (p.startLift ?? p.lift ?? 50) / 50,
          p.endLift === 10.5 ? 0.9 : (p.endLift ?? p.lift ?? 50) / 50,
          t,
        );
      const at = new T.Vector3(
          x,
          terrainHeight(x, z) +
            lift +
            Math.sin(Math.PI * t) *
              (arrow ? Math.min(8, 1.5 + p.flightTime * 2) : 0.8),
          z,
        ),
        last = this.arrowPositions.get(p.id);
      if (arrow && arrowCount < QUALITY[this.quality].arrows) {
        const velocity = last
          ? at.clone().sub(last)
          : new T.Vector3(
              worldX(p.tx) - x,
              0.5,
              worldZ(p.endGroundY ?? p.ty) - z,
            );
        if (velocity.lengthSq() < 0.00001) velocity.set(p.team ? -1 : 1, 0, 0);
        this.rotation.setFromUnitVectors(this.up, velocity.normalize());
        this.scale.setScalar(1);
        this.matrix.compose(at, this.rotation, this.scale);
        this.arrows.setMatrixAt(arrowCount++, this.matrix);
      }
      if (running && this.clock - (this.trailAt.get(p.id) ?? -1) > 0.075) {
        this.trailAt.set(p.id, this.clock);
        if (arrow)
          this.particles.emit("trace_01", at, 0xe8d2a0, 1, {
            size: 0.25,
            life: 0.18,
            speed: 0.1,
            gravity: 0,
          });
        else {
          const king = p.kind === "kingMagic",
            color = king ? (p.team ? 0x58e6ff : 0xe44bfa) : 0xff8c32;
          this.particles.emit(king ? "magic_01" : "fire_01", at, color, 3, {
            size: king ? 0.65 : 1.15,
            life: 0.3,
            speed: 0.15,
            gravity: 0,
          });
          this.particles.emit("smoke_04", at, king ? 0x772fc4 : 0x6b2b82, 1, {
            size: 1.1,
            life: 0.7,
            speed: 0.25,
          });
          if (!this.projectileSeen.has(p.id)) {
            this.projectileSeen.add(p.id);
            if (this.projectileSeen.size > 600)
              this.projectileSeen.delete(
                this.projectileSeen.values().next().value!,
              );
            this.bolt(
              at,
              point(p.tx, p.endGroundY ?? p.ty, 1),
              king ? color : 0xd293ff,
            );
          }
        }
      }
      this.arrowPositions.set(p.id, at);
    }
    for (const id of this.arrowPositions.keys())
      if (!ids.has(id)) {
        this.arrowPositions.delete(id);
        this.trailAt.delete(id);
      }
    this.arrows.count = arrowCount;
    this.arrows.instanceMatrix.needsUpdate = true;
    if (running) {
      for (const r of this.ringList) r.age += dt;
      for (const b of this.bolts) b.age += dt;
    }
    this.ringList = this.ringList.filter((r) => r.age < r.life);
    this.bolts = this.bolts.filter((b) => b.age < 0.16);
    this.ringList.forEach((r, i) => {
      const t = r.age / r.life;
      this.scale.setScalar(0.1 + t * r.radius);
      this.rotation.identity();
      r.at.y = terrainHeight(r.at.x, r.at.z) + 0.08;
      this.matrix.compose(r.at, this.rotation, this.scale);
      this.rings.setMatrixAt(i, this.matrix);
      this.rings.setColorAt(i, r.color.clone().multiplyScalar(1 - t));
    });
    this.rings.count = this.ringList.length;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    let n = 0;
    for (const b of this.bolts)
      for (let i = 0; i < 7; i++)
        for (const v of [b.points[i], b.points[i + 1]]) {
          this.lines.geometry.getAttribute("position").setXYZ(n, v.x, v.y, v.z);
          this.lines.geometry
            .getAttribute("color")
            .setXYZ(n, b.color.r, b.color.g, b.color.b);
          n++;
        }
    this.lines.geometry.setDrawRange(0, n);
    for (const a of Object.values(this.lines.geometry.attributes))
      a.needsUpdate = true;
  }
  diagnostics() {
    return {
      arrows: this.arrows.count,
      arrowCap: QUALITY[this.quality].arrows,
      rings: this.rings.count,
      lightningBolts: this.bolts.length,
      ...this.particleStats,
      projectiles: "server snapshot; no client damage or guessed targets",
      pooled: true,
    };
  }
  dispose() {
    for (const o of [this.arrows, this.rings]) {
      o.dispose();
      o.geometry.dispose();
      (o.material as T.Material).dispose();
    }
    this.lines.geometry.dispose();
    (this.lines.material as T.Material).dispose();
    this.group.clear();
  }
}
