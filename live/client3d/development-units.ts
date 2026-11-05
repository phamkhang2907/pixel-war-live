import * as T from "three";
import { TYPES } from "../src/characters.js";
import { worldX, worldZ, type BattleState } from "./state";

// PHASE 1 ONLY: unrigged instanced markers, not final character artwork.
// Server remains the sole authority for movement, health, targeting and combat.
export class DevelopmentUnits {
  readonly group = new T.Group();
  private parts: {
    mesh: T.InstancedMesh;
    y: number;
    z: number;
    armor: boolean;
  }[] = [];
  private transform = new T.Object3D();
  private color = new T.Color();
  private positions = new Map<number, T.Vector3>();
  constructor() {
    this.group.name = "TEMPORARY UNRIGGED DEVELOPMENT UNIT MARKERS";
    const parts = [
      {
        geometry: new T.CapsuleGeometry(0.28, 0.42, 2, 5),
        y: 0.95,
        z: 0,
        armor: false,
      },
      {
        geometry: new T.IcosahedronGeometry(0.27, 1),
        y: 1.62,
        z: 0,
        armor: true,
      },
      {
        geometry: new T.CapsuleGeometry(0.11, 0.4, 1, 4),
        y: 0.35,
        z: -0.16,
        armor: true,
      },
      {
        geometry: new T.CapsuleGeometry(0.11, 0.4, 1, 4),
        y: 0.35,
        z: 0.16,
        armor: true,
      },
    ];
    for (const part of parts) {
      const mesh = new T.InstancedMesh(
        part.geometry,
        new T.MeshStandardMaterial({
          roughness: 0.6,
          metalness: part.armor ? 0.35 : 0.05,
        }),
        300,
      );
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.parts.push({ mesh, ...part });
      this.group.add(mesh);
    }
  }
  update(state: BattleState | null, dt: number) {
    const units = state?.units.slice(0, 300) ?? [];
    const aliveIds = new Set(units.map((u) => u.id));
    for (const id of this.positions.keys())
      if (!aliveIds.has(id)) this.positions.delete(id);
    for (const part of this.parts) {
      part.mesh.count = units.length;
      units.forEach((unit, index) => {
        const size = TYPES[unit.type].scale;
        const destination = new T.Vector3(
          worldX(unit.x),
          unit.type === "mage" ? 2.8 : 0,
          worldZ(unit.y),
        );
        let position = this.positions.get(unit.id);
        if (!position) {
          position = destination.clone();
          this.positions.set(unit.id, position);
        }
        // Interpolate once per frame rather than once per mesh part.
        if (part === this.parts[0])
          position.lerp(destination, 1 - Math.exp(-16 * dt));
        this.transform.position.copy(position);
        this.transform.position.y += part.y * size;
        this.transform.position.z += part.z * size;
        this.transform.scale.setScalar(size * (unit.hp <= 0 ? 0.15 : 1));
        this.transform.rotation.z = unit.hp <= 0 ? Math.PI / 2 : 0;
        this.transform.updateMatrix();
        part.mesh.setMatrixAt(index, this.transform.matrix);
        this.color.setHex(
          part.armor ? 0xc7d4d7 : unit.team === 0 ? 0xd94654 : 0x388ae0,
        );
        part.mesh.setColorAt(index, this.color);
      });
      part.mesh.instanceMatrix.needsUpdate = true;
      if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    }
  }
}
