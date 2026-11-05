import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneRig } from "three/addons/utils/SkeletonUtils.js";
import { TYPES } from "../src/characters.js";
import { worldX, worldZ, type BattleState } from "./state";

const names: Record<string, string> = {
  sword: "Knight", archer: "Ranger", cavalry: "Barbarian",
  mage: "Mage", guardian: "Rogue_Hooded", boss: "Barbarian",
};
const root = "/kaykit/adventurers/Characters/gltf/";
export class KaykitUnits {
  readonly group = new T.Group();
  private templates = new Map<string, T.Group>();
  private instances = new Map<number, T.Object3D>();
  private lastPositions = new Map<number, T.Vector3>();
  private loaded = false;
  constructor(private onReady: () => void) {
    const loader = new GLTFLoader();
    Promise.all([...new Set(Object.values(names))].map(async (name) => {
      const model = await loader.loadAsync(root + name + ".glb");
      const template = model.scene;
      template.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(template);
      const size = bounds.getSize(new T.Vector3());
      const center = bounds.getCenter(new T.Vector3());
      // KayKit GLB character exports vary in scale: normalize height.
      const normalized = new T.Group();
      template.position.sub(center);
      template.position.y += size.y / 2;
      normalized.add(template);
      normalized.scale.setScalar(1.8 / Math.max(0.01, size.y));
      normalized.traverse((o) => { if (o instanceof T.Mesh) o.castShadow = true; });
      this.templates.set(name, normalized);
    })).then(() => {
      this.loaded = true;
      this.onReady();
    }).catch((e) => console.warn("KayKit characters unavailable; using fallback markers", e));
  }
  update(state: BattleState | null, dt: number) {
    if (!this.loaded) return;
    const units = state?.units.slice(0, 300) ?? [];
    const active = new Set(units.map((u) => u.id));
    for (const [id, object] of this.instances) if (!active.has(id)) {
      object.removeFromParent(); this.instances.delete(id); this.lastPositions.delete(id);
    }
    for (const unit of units) {
      const name = names[unit.type] ?? "Knight";
      let object = this.instances.get(unit.id);
      if (!object) {
        const source = this.templates.get(name);
        if (!source) continue;
        object = cloneRig(source);
        this.instances.set(unit.id, object);
        this.group.add(object);
      }
      const target = new T.Vector3(worldX(unit.x), unit.type === "mage" ? 2.8 : 0, worldZ(unit.y));
      const last = this.lastPositions.get(unit.id) ?? target.clone();
      last.lerp(target, 1 - Math.exp(-16 * dt));
      this.lastPositions.set(unit.id, last);
      object.position.copy(last);
      const size = TYPES[unit.type].scale;
      object.scale.setScalar(size * (unit.hp <= 0 ? 0.15 : 1));
      object.rotation.y = unit.team === 0 ? Math.PI / 2 : -Math.PI / 2;
      object.rotation.z = unit.hp <= 0 ? Math.PI / 2 : 0;
    }
  }
  get ready() { return this.loaded; }
  dispose() { this.instances.clear(); this.lastPositions.clear(); this.group.clear(); }
}
