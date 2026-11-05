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
  private clips = new Map<string, T.AnimationClip>();
  private mixers = new Map<number, T.AnimationMixer>();
  private actions = new Map<number, { name: string; action: T.AnimationAction }>();
  private previousHp = new Map<number, number>();
  private hitUntil = new Map<number, number>();
  private elapsed = 0;
  constructor(private onReady: () => void) {
    const loader = new GLTFLoader();
    const characters = Promise.all([...new Set(Object.values(names))].map(async (name) => {
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
    }));
    const animationPacks = Promise.all(["Rig_Medium_General", "Rig_Medium_MovementBasic"].map(async (name) => {
      const data = await loader.loadAsync("/kaykit/adventurers/Animations/gltf/Rig_Medium/" + name + ".glb");
      for (const clip of data.animations) this.clips.set(clip.name, clip);
    }));
    Promise.all([characters, animationPacks]).then(() => {
      this.loaded = true;
      this.onReady();
    }).catch((e) => console.warn("KayKit characters unavailable; using fallback markers", e));
  }
  update(state: BattleState | null, dt: number) {
    if (!this.loaded) return;
    this.elapsed += dt;
    const units = state?.units.slice(0, 300) ?? [];
    const active = new Set(units.map((u) => u.id));
    for (const [id, object] of this.instances) if (!active.has(id)) {
      object.removeFromParent();
      this.instances.delete(id); this.lastPositions.delete(id);
      this.mixers.delete(id); this.actions.delete(id);
      this.previousHp.delete(id); this.hitUntil.delete(id);
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
        this.mixers.set(unit.id, new T.AnimationMixer(object));
      }
      const target = new T.Vector3(worldX(unit.x), unit.type === "mage" ? 2.8 : 0, worldZ(unit.y));
      const last = this.lastPositions.get(unit.id) ?? target.clone();
      const displacement = last.distanceTo(target);
      last.lerp(target, 1 - Math.exp(-16 * dt));
      this.lastPositions.set(unit.id, last);
      object.position.copy(last);
      const size = TYPES[unit.type].scale;
      object.scale.setScalar(size * (unit.hp <= 0 ? 0.15 : 1));
      object.rotation.y = unit.team === 0 ? Math.PI / 2 : -Math.PI / 2;
      const hp = this.previousHp.get(unit.id) ?? unit.hp;
      if (unit.hp < hp && unit.hp > 0) this.hitUntil.set(unit.id, this.elapsed + 0.35);
      this.previousHp.set(unit.id, unit.hp);
      const status = unit.state.toLowerCase();
      const desired = unit.hp <= 0 || status.includes("dead") ? "Death_A"
        : this.elapsed < (this.hitUntil.get(unit.id) ?? 0) ? "Hit_A"
        : /attack|fight|strike|cast|shoot/.test(status)
          ? (unit.type === "archer" || unit.type === "mage" ? "Throw" : "Use_Item")
        : displacement > 0.06 || /walk|move|run/.test(status) ? "Running_A" : "Idle_A";
      const mixer = this.mixers.get(unit.id);
      const clip = this.clips.get(desired);
      if (mixer && clip) {
        const previous = this.actions.get(unit.id);
        if (previous?.name !== desired) {
          const action = mixer.clipAction(clip);
          action.reset();
          action.enabled = true;
          action.setEffectiveWeight(1);
          const oneShot = ["Death_A", "Hit_A", "Use_Item", "Throw"].includes(desired);
          action.setLoop(oneShot ? T.LoopOnce : T.LoopRepeat, oneShot ? 1 : Infinity);
          action.clampWhenFinished = desired === "Death_A";
          action.play();
          if (previous) previous.action.fadeOut(0.12);
          action.fadeIn(0.12);
          this.actions.set(unit.id, { name: desired, action });
        }
        mixer.update(dt);
      }
      if (!clip && unit.hp <= 0) object.rotation.z = Math.PI / 2;
    }
  }
  get ready() { return this.loaded; }
  dispose() {
    for (const [id, mixer] of this.mixers) {
      const object = this.instances.get(id);
      if (object) mixer.uncacheRoot(object);
    }
    this.mixers.clear(); this.actions.clear(); this.previousHp.clear();
    this.hitUntil.clear(); this.instances.clear(); this.lastPositions.clear(); this.group.clear();
  }
}
