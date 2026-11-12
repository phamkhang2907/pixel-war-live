import * as T from "three";
import { worldX, worldZ, type BattleState } from "./state";
import { terrainHeight } from "./grass-material";
import type { KenneyParticles } from "./kenney-particles";
type Ground = {
  x: number;
  z: number;
  age: number;
  life: number;
  radius: number;
  ice: boolean;
};
// Cosmetic only. Warning deadlines and all damage come from the server.
export class WarfareEffects {
  readonly group = new T.Group();
  private warnings: T.InstancedMesh;
  private bombs: T.InstancedMesh;
  private ground: T.InstancedMesh;
  private shock: T.InstancedMesh;
  private marks: Ground[] = [];
  private rings: { p: T.Vector3; age: number; radius: number }[] = [];
  private seen = new Set<number>();
  private round = "";
  private matrix = new T.Matrix4();
  private q = new T.Quaternion();
  private scale = new T.Vector3();
  private p = new T.Vector3();
  private color = new T.Color();
  private grassColor = new T.Color(0x718c4a);
  private totals = { bombs: 0, fire: 0, frost: 0 };
  constructor(
    private particles: KenneyParticles,
    private shake: (s: number) => void,
  ) {
    this.group.name =
      "Server timed bombing warnings and pooled fire/frost ground";
    this.warnings = new T.InstancedMesh(
      new T.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({
        color: 0xff553c,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: T.DoubleSide,
        toneMapped: false,
      }),
      64,
    );
    this.bombs = new T.InstancedMesh(
      new T.ConeGeometry(0.25, 1.4, 6).rotateZ(Math.PI),
      new T.MeshStandardMaterial({
        color: 0x423b4b,
        emissive: 0xff6837,
        emissiveIntensity: 0.8,
      }),
      64,
    );
    this.ground = new T.InstancedMesh(
      new T.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: T.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      32,
    );
    this.shock = new T.InstancedMesh(
      new T.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({
        color: 0xffc575,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false,
      }),
      16,
    );
    for (const m of [this.warnings, this.bombs, this.ground, this.shock]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.group.add(m);
    }
  }
  update(state: BattleState, dt: number) {
    if (this.round !== state.roundState.id) {
      this.round = state.roundState.id;
      this.seen.clear();
      this.marks = [];
      this.rings = [];
    }
    const active =
        !state.paused && ["combat", "final"].includes(state.roundState.phase),
      step = active ? dt : 0;
    let n = 0;
    for (const h of state.hazards ?? []) {
      if (n >= 64) break;
      const left = h.at - state.time;
      if (left < 0) continue;
      const x = worldX(h.x),
        z = worldZ(h.y),
        y = terrainHeight(x, z),
        r = h.radius / 50;
      this.p.set(x, y + 0.08, z);
      this.q.identity();
      this.scale.setScalar(r * (0.96 + 0.04 * Math.sin(state.time * 14)));
      this.matrix.compose(this.p, this.q, this.scale);
      this.warnings.setMatrixAt(n, this.matrix);
      this.p.y = y + Math.min(38, Math.max(0.3, left) * 18);
      this.scale.setScalar(1);
      this.matrix.compose(this.p, this.q, this.scale);
      this.bombs.setMatrixAt(n, this.matrix);
      n++;
    }
    this.warnings.count = this.bombs.count = n;
    for (const e of state.effects ?? []) {
      if (this.seen.has(e.id)) continue;
      this.seen.add(e.id);
      if (this.seen.size > 1500)
        this.seen.delete(this.seen.values().next().value!);
      if (!active || state.time - (e.time ?? state.time) > (e.life ?? 1))
        continue;
      const x = worldX(e.x),
        z = worldZ(e.y),
        p = new T.Vector3(x, terrainHeight(x, z) + 0.2, z);
      if (e.type === "bombImpact") {
        this.totals.bombs++;
        this.shake(0.16);
        this.rings.push({
          p: p.clone(),
          age: 0,
          radius: (e.radius ?? 260) / 50,
        });
        if (this.rings.length > 16) this.rings.shift();
        this.particles.emit("light_01", p, 0xffe49c, 4, {
          size: 7,
          life: 0.25,
        });
        this.particles.emit("fire_01", p, 0xff882b, 16, {
          size: 2.5,
          spread: 2,
          life: 0.8,
        });
        this.particles.emit("dirt_01", p, 0x99836c, 20, {
          size: 3,
          spread: 2,
          life: 1.4,
          speed: 4,
        });
        this.particles.emit("spark_01", p, 0xffc16f, 12, {
          size: 0.5,
          speed: 6,
          gravity: 8,
        });
      } else if (e.type === "burnGround" || e.type === "frostGround") {
        const ice = e.type === "frostGround";
        this.totals[ice ? "frost" : "fire"]++;
        const close = this.marks.find(
          (m) => m.ice === ice && Math.hypot(m.x - x, m.z - z) < 1.5,
        );
        if (close) close.age = 0;
        else {
          if (this.marks.length >= 32) this.marks.shift();
          this.marks.push({
            x,
            z,
            age: 0,
            life: ice ? 5 : 4,
            radius: (e.radius ?? 250) / 50,
            ice,
          });
        }
      } else if (e.type === "dragonBreath") {
        const ice = e.element === "ice";
        this.particles.emit(
          ice ? "magic_01" : "flame_01",
          p,
          ice ? 0x71eaff : 0xff8b29,
          12,
          { size: ice ? 2 : 3, spread: 3, life: 0.8 },
        );
        this.particles.emit("smoke_04", p, ice ? 0x9dcce2 : 0x5a425b, 6, {
          size: 4,
          spread: 2,
          life: 1.3,
        });
        if (ice)
          this.particles.emit("scratch_01", p, 0xc2f7ff, 8, {
            size: 0.7,
            speed: 4,
            gravity: 4,
          });
      }
    }
    this.marks = this.marks.filter((m) => (m.age += step) < m.life);
    n = 0;
    for (const m of this.marks) {
      this.p.set(m.x, terrainHeight(m.x, m.z) + 0.045, m.z);
      this.q.identity();
      this.scale.setScalar(m.radius * (1 - (m.age / m.life) * 0.12));
      this.matrix.compose(this.p, this.q, this.scale);
      this.ground.setMatrixAt(n, this.matrix);
      this.color
        .set(m.ice ? 0x7ccce1 : 0x3a2524)
        .lerp(this.grassColor, m.age / m.life);
      this.ground.setColorAt(n++, this.color);
    }
    this.ground.count = n;
    this.rings = this.rings.filter((r) => (r.age += step) < 0.8);
    n = 0;
    for (const r of this.rings) {
      this.scale.setScalar(r.radius * (0.2 + r.age / 0.8));
      this.p.copy(r.p);
      this.q.identity();
      this.matrix.compose(this.p, this.q, this.scale);
      this.shock.setMatrixAt(n++, this.matrix);
    }
    this.shock.count = n;
    for (const m of [this.warnings, this.bombs, this.ground, this.shock]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  diagnostics() {
    return {
      ...this.totals,
      warnings: this.warnings.count,
      ground: this.ground.count,
      shockwaves: this.shock.count,
      maxGround: 32,
      maxWarnings: 64,
    };
  }
  dispose() {
    for (const m of [this.warnings, this.bombs, this.ground, this.shock]) {
      m.geometry.dispose();
      (m.material as T.Material).dispose();
      m.dispose();
    }
    this.group.clear();
  }
}
