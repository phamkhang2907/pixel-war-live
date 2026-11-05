import * as T from "three";
import { worldX, worldZ, type BattleState, type UnitState } from "./state";

// Lightweight procedural VFX: no external textures, licenses or extra downloads.
type Particle = { mesh: T.Mesh; velocity: T.Vector3; age: number; life: number; origin: number };
type Projectile = { mesh: T.Mesh; start: T.Vector3; end: T.Vector3; age: number; life: number; color: number };
export class CombatEffects {
  readonly group = new T.Group();
  private previous = new Map<number, { hp: number; state: string }>();
  private particles: Particle[] = [];
  private projectiles: Projectile[] = [];
  private cooldown = new Map<number, number>();
  private elapsed = 0;
  private sphere = new T.SphereGeometry(0.16, 6, 5);
  private shard = new T.OctahedronGeometry(0.15, 0);
  private arrow = new T.ConeGeometry(0.13, 0.8, 5);
  private cap = 110;
  private position(u: UnitState) {
    return new T.Vector3(worldX(u.x), u.type === "mage" ? 3.5 : 1.2, worldZ(u.y));
  }
  private particle(at: T.Vector3, color: number, amount: number, life = 0.42) {
    for (let i = 0; i < amount && this.particles.length < this.cap; i++) {
      const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, blending: T.AdditiveBlending });
      const mesh = new T.Mesh(i % 2 ? this.sphere : this.shard, mat);
      mesh.position.copy(at);
      mesh.scale.setScalar(0.5 + (i % 4) * 0.24);
      this.group.add(mesh);
      const angle = i * 2.39996;
      this.particles.push({ mesh, velocity: new T.Vector3(Math.cos(angle) * (1.6 + i % 3), 1.2 + i % 4, Math.sin(angle) * (1.6 + i % 3)), age: 0, life, origin: at.y });
    }
  }
  private shoot(source: UnitState, target: UnitState) {
    if (this.projectiles.length >= 40) return;
    const magic = source.type === "mage";
    const color = magic ? 0x8e64ff : 0xffe1a1;
    const mesh = new T.Mesh(magic ? this.sphere : this.arrow, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: magic ? T.AdditiveBlending : T.NormalBlending }));
    const start = this.position(source), end = this.position(target);
    start.y += 0.4;
    const direction = end.clone().sub(start);
    if (!magic) mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.clone().normalize());
    mesh.position.copy(start);
    if (magic) mesh.scale.setScalar(2.5);
    this.group.add(mesh);
    this.projectiles.push({ mesh, start, end, age: 0, life: magic ? 0.5 : 0.34, color });
  }
  update(state: BattleState | null, dt: number) {
    this.elapsed += dt;
    if (state) {
      const units = state.units.filter(u => u.hp > 0).slice(0, 300);
      const ids = new Set(state.units.map(u => u.id));
      for (const id of this.previous.keys()) if (!ids.has(id)) this.previous.delete(id);
      for (const unit of state.units.slice(0, 300)) {
        const old = this.previous.get(unit.id);
        const at = this.position(unit);
        if (old && unit.hp < old.hp) {
          this.particle(at, unit.team === 0 ? 0xff7777 : 0x6bbcff, 5);
          if (unit.hp <= 0) this.particle(at, 0xc8b899, 9, 0.7);
        }
        const attacking = /attack|strike|shoot|cast|fight/i.test(unit.state);
        const previouslyAttacking = old && /attack|strike|shoot|cast|fight/i.test(old.state);
        const last = this.cooldown.get(unit.id) ?? -Infinity;
        if (unit.hp > 0 && attacking && (!previouslyAttacking || this.elapsed - last > 0.85)) {
          this.cooldown.set(unit.id, this.elapsed);
          const nearest = units.filter(u => u.team !== unit.team).sort((a, b) => Math.abs(a.x - unit.x) - Math.abs(b.x - unit.x))[0];
          if (nearest && Math.abs(nearest.x - unit.x) < 1500) {
            if (unit.type === "archer" || unit.type === "mage") this.shoot(unit, nearest);
            else this.particle(this.position(nearest), 0xffdc83, 4, 0.22);
          }
          if (unit.type === "guardian") this.particle(at, 0x80c9ff, 4, 0.3);
        }
        this.previous.set(unit.id, { hp: unit.hp, state: unit.state });
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      const t = Math.min(1, p.age / p.life);
      p.mesh.position.lerpVectors(p.start, p.end, t);
      p.mesh.position.y += Math.sin(t * Math.PI) * 1.5;
      if (t >= 1) {
        this.particle(p.end, p.color, 7);
        this.removeMesh(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= 9 * dt;
      p.mesh.position.y = Math.max(0.1, p.mesh.position.y);
      (p.mesh.material as T.MeshBasicMaterial).opacity = Math.max(0, 1 - p.age / p.life);
      p.mesh.scale.multiplyScalar(Math.max(0.8, 1 - dt));
      if (p.age >= p.life) { this.removeMesh(p.mesh); this.particles.splice(i, 1); }
    }
  }
  private removeMesh(mesh: T.Mesh) {
    mesh.removeFromParent();
    (mesh.material as T.Material).dispose();
  }
  dispose() {
    for (const p of this.particles) this.removeMesh(p.mesh);
    for (const p of this.projectiles) this.removeMesh(p.mesh);
    this.particles = []; this.projectiles = []; this.previous.clear(); this.cooldown.clear();
    this.sphere.dispose(); this.shard.dispose(); this.arrow.dispose();
    this.group.clear();
  }
}
