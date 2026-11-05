import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CharacterAssets, unitAssets, playClip } from "./character-assets";
import { worldX, worldZ, type UnitState } from "./state";
import { TYPES } from "../src/characters.js";
type Batch = { mesh: T.InstancedMesh; count: number };
// Distant troops use baked real KayKit meshes with their original PBR textures.
// Nearby troops keep independent skeletons. No sprites or substitute geometry.
export class ArmyLOD {
  readonly group = new T.Group();
  private batches = new Map<string, Batch[]>();
  private positions = new Map<number, T.Vector3>();
  private matrix = new T.Matrix4();
  private rotation = new T.Quaternion();
  private scale = new T.Vector3();
  private disposed = false;
  rendered = 0;
  async prepare(assets: CharacterAssets) {
    for (const type of ["sword", "archer", "mage", "cavalry", "boss"] as const)
      for (const team of [0, 1] as const) {
        if (this.disposed) return;
        const a = unitAssets[type],
          source = assets.create(a.model, team, a.weapons);
        if (!source) continue;
        const clip = assets.clips.get("Idle_A");
        if (clip) {
          playClip(source, clip);
          source.mixer.update(0.2);
        }
        source.root.updateMatrixWorld(true);
        const parts = new Map<
          string,
          { material: T.Material; geometry: T.BufferGeometry[] }
        >();
        source.root.traverse((o) => {
          if (!(o instanceof T.Mesh)) return;
          const material = Array.isArray(o.material)
            ? o.material[0]
            : o.material;
          const m = material as T.MeshStandardMaterial;
          const key = [
            material.type,
            m.color?.getHex(),
            m.map?.uuid,
            m.roughness,
            m.metalness,
            material.side,
          ].join(":");
          const g = o.geometry.clone();
          const position = g.getAttribute("position");
          if (o instanceof T.SkinnedMesh) {
            o.skeleton.update();
            const v = new T.Vector3();
            for (let i = 0; i < position.count; i++) {
              o.applyBoneTransform(i, v.fromBufferAttribute(position, i));
              position.setXYZ(i, v.x, v.y, v.z);
            }
          }
          g.applyMatrix4(o.matrixWorld);
          for (const name of Object.keys(g.attributes))
            if (!["position", "normal", "uv"].includes(name))
              g.deleteAttribute(name);
          if (!g.getAttribute("uv"))
            g.setAttribute(
              "uv",
              new T.Float32BufferAttribute(
                new Float32Array(position.count * 2),
                2,
              ),
            );
          g.computeVertexNormals();
          const item: { material: T.Material; geometry: T.BufferGeometry[] } =
            parts.get(key) ?? { material: material.clone(), geometry: [] };
          item.geometry.push(g.index ? g.toNonIndexed() : g);
          if (g.index) g.dispose();
          parts.set(key, item);
        });
        const list: Batch[] = [];
        for (const part of parts.values()) {
          const geometry = mergeGeometries(part.geometry);
          for (const g of part.geometry) g.dispose();
          if (!geometry) {
            part.material.dispose();
            continue;
          }
          const mesh = new T.InstancedMesh(geometry, part.material, 300);
          mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
          mesh.count = 0;
          mesh.frustumCulled = false;
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          mesh.name = `KayKit baked LOD ${type} ${team}`;
          this.group.add(mesh);
          list.push({ mesh, count: 0 });
        }
        this.batches.set(type + ":" + team, list);
        assets.release(source);
        // Yield between model/team preparation so loading never monopolizes a frame.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
  }
  update(units: UnitState[], dt: number, time: number) {
    this.rendered = 0;
    const ids = new Set(units.map((u) => u.id));
    for (const id of this.positions.keys())
      if (!ids.has(id)) this.positions.delete(id);
    for (const list of this.batches.values())
      for (const batch of list) batch.count = 0;
    for (const u of units) {
      const list = this.batches.get(u.type + ":" + u.team);
      if (!list?.length) continue;
      const target = new T.Vector3(
        worldX(u.x),
        u.type === "mage" ? 2.8 : 0,
        worldZ(u.y),
      );
      let p = this.positions.get(u.id);
      if (!p) {
        p = target.clone();
        this.positions.set(u.id, p);
      }
      p.lerp(target, 1 - Math.exp(-16 * dt));
      this.rotation.setFromEuler(
        new T.Euler(
          0,
          u.team === 0 ? Math.PI / 2 : -Math.PI / 2,
          u.hp <= 0 ? Math.PI / 2 : 0,
        ),
      );
      this.scale.setScalar(TYPES[u.type].scale);
      const at = p.clone();
      if (u.hp > 0 && /run|fly/.test(u.state))
        at.y += Math.sin(time * 8 + u.id) * 0.04;
      this.matrix.compose(at, this.rotation, this.scale);
      for (const batch of list)
        batch.mesh.setMatrixAt(batch.count++, this.matrix);
      this.rendered++;
    }
    for (const list of this.batches.values())
      for (const batch of list) {
        batch.mesh.count = batch.count;
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
  }
  dispose() {
    this.disposed = true;
    for (const list of this.batches.values())
      for (const b of list) {
        b.mesh.geometry.dispose();
        (b.mesh.material as T.Material).dispose();
        b.mesh.dispose();
      }
    this.batches.clear();
    this.positions.clear();
    this.group.clear();
  }
}
