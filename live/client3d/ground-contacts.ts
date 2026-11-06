import * as T from "three";
import { terrainHeight } from "./grass-material";
import { worldX, worldZ, type BattleState } from "./state";
import { TYPES, ARMY, renderScale } from "../src/characters.js";
// One shared, generated soft disk: contact shading without a screen-space AO pass.
export class GroundContacts {
  readonly group = new T.Group();
  readonly texture: T.CanvasTexture;
  readonly material: T.MeshBasicMaterial;
  readonly geometry = new T.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  private units: T.InstancedMesh;
  private positions = new Map<number, T.Vector3>();
  private matrix = new T.Matrix4();
  private rotation = new T.Quaternion();
  private scale = new T.Vector3();
  constructor() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!,
      g = ctx.createRadialGradient(32, 32, 3, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,.9)");
    g.addColorStop(0.45, "rgba(255,255,255,.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.texture = new T.CanvasTexture(c);
    this.material = new T.MeshBasicMaterial({
      name: "Shared soft contact shadow",
      color: 0x263120,
      map: this.texture,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      toneMapped: false,
    });
    this.units = new T.InstancedMesh(
      this.geometry,
      this.material,
      ARMY.maxUnits,
    );
    this.units.name = "Unit ground contact shadows";
    this.units.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.units.count = 0;
    this.units.frustumCulled = false;
    this.units.renderOrder = 2;
    this.group.add(this.units);
  }
  addStatic(contacts: { x: number; z: number; radius: number }[]) {
    const batch = new T.InstancedMesh(
      this.geometry,
      this.material,
      contacts.length,
    );
    batch.name = "Scenery ground contact shadows";
    batch.renderOrder = 2;
    contacts.forEach((p, i) => {
      this.scale.set(p.radius, 1, p.radius * 0.78);
      this.matrix.compose(
        new T.Vector3(p.x, terrainHeight(p.x, p.z) + 0.018, p.z),
        this.rotation,
        this.scale,
      );
      batch.setMatrixAt(i, this.matrix);
    });
    batch.computeBoundingSphere();
    this.group.add(batch);
  }
  update(state: BattleState | null, dt: number) {
    let count = 0;
    const ids = new Set<number>();
    for (const u of state?.units.slice(0, ARMY.maxUnits) ?? []) {
      if (u.hp <= 0) continue;
      ids.add(u.id);
      const x = worldX(u.x),
        z = worldZ(u.y);
      let p = this.positions.get(u.id);
      if (!p) {
        p = new T.Vector3(x, 0, z);
        this.positions.set(u.id, p);
      }
      p.x = T.MathUtils.lerp(p.x, x, 1 - Math.exp(-16 * dt));
      p.z = T.MathUtils.lerp(p.z, z, 1 - Math.exp(-16 * dt));
      p.y = terrainHeight(p.x, p.z) + 0.021;
      const radius = renderScale(u.type) * (u.type === "mage" ? 0.66 : 0.52);
      this.scale.set(radius, 1, radius * 0.75);
      this.matrix.compose(p, this.rotation, this.scale);
      this.units.setMatrixAt(count++, this.matrix);
    }
    for (const id of this.positions.keys())
      if (!ids.has(id)) this.positions.delete(id);
    this.units.count = count;
    this.units.instanceMatrix.needsUpdate = true;
  }
  inspect() {
    return {
      units: this.units.count,
      static: this.group.children
        .filter((o) => o !== this.units)
        .reduce((n, o) => n + (o as T.InstancedMesh).count, 0),
      textureSize: 64,
      shadowPasses: 0,
    };
  }
  dispose() {
    this.texture.dispose();
    this.positions.clear();
    this.group.clear();
  }
}
