import * as T from "three";
import { TYPES } from "../src/characters.js";
import { worldX, worldZ, type BattleState } from "./state";
import {
  CharacterAssets,
  playClip,
  unitAssets,
  type CharacterInstance,
} from "./character-assets";

type UnitVisual = {
  instance: CharacterInstance;
  position: T.Vector3;
  action?: T.AnimationAction;
  clip?: string;
};
export class KaykitUnits {
  readonly group = new T.Group();
  readonly assets = new CharacterAssets();
  private instances = new Map<number, UnitVisual>();
  private loaded = false;
  private disposed = false;
  constructor(onReady: () => void) {
    this.group.name = "KayKit skinned units (no procedural soldiers)";
    void this.assets.ready.then(() => {
      if (!this.disposed) {
        this.loaded = true;
        onReady();
      }
    });
  }
  update(state: BattleState | null, dt: number) {
    if (!this.loaded || this.disposed) return;
    const units = state?.units.slice(0, 300) ?? [];
    const ids = new Set(units.map((u) => u.id));
    for (const [id, visual] of this.instances)
      if (!ids.has(id)) {
        this.assets.release(visual.instance);
        this.instances.delete(id);
      }
    for (const unit of units) {
      let visual = this.instances.get(unit.id);
      const target = new T.Vector3(
        worldX(unit.x),
        unit.type === "mage" ? 2.8 : 0,
        worldZ(unit.y),
      );
      if (!visual) {
        const asset = unitAssets[unit.type];
        const instance = this.assets.create(
          asset.model,
          unit.team,
          asset.weapons,
        );
        if (!instance) continue;
        instance.root.userData = {
          unitId: unit.id,
          team: unit.team,
          assetStatus: asset.status,
        };
        this.group.add(instance.root);
        visual = { instance, position: target.clone() };
        this.instances.set(unit.id, visual);
      }
      const moving = visual.position.distanceTo(target) > 0.06;
      visual.position.lerp(target, 1 - Math.exp(-16 * dt));
      const { instance } = visual;
      instance.root.position.copy(visual.position);
      // Only the instance wrapper changes. The nested 1.8m normalization survives.
      instance.root.scale.setScalar(TYPES[unit.type].scale);
      instance.root.rotation.y = unit.team === 0 ? Math.PI / 2 : -Math.PI / 2;
      const desired =
        unit.hp <= 0 || /dead|death/.test(unit.state)
          ? "Death_A"
          : /hurt/.test(unit.state)
            ? "Hit_A"
            : /attack|fight|cast|shoot/.test(unit.state)
              ? unit.type === "mage" || unit.type === "archer"
                ? "Throw"
                : "Use_Item"
              : moving || /run|walk|move/.test(unit.state)
                ? "Running_A"
                : "Idle_A";
      const clip = this.assets.clips.get(desired);
      if (
        clip &&
        (visual.clip !== desired ||
          (desired !== "Death_A" &&
            /Use_Item|Throw|Hit/.test(desired) &&
            visual.action &&
            !visual.action.isRunning()))
      ) {
        visual.action = playClip(instance, clip, visual.action);
        visual.clip = desired;
      }
      instance.mixer.update(state?.paused ? 0 : dt);
    }
  }
  diagnostics() {
    return {
      ...this.assets.diagnostics(),
      ready: this.loaded,
      rendered: this.instances.size,
      proceduralSoldiers: 0,
      instances: [...this.instances.entries()]
        .slice(0, 12)
        .map(([id, v]) => ({
          id,
          model: v.instance.root.name,
          position: v.instance.root.position.toArray(),
          scale: v.instance.root.scale.x,
          normalizedScale: v.instance.model.scale.x,
          clip: v.clip,
          time: v.action?.time,
        })),
    };
  }
  dispose() {
    this.disposed = true;
    for (const visual of this.instances.values())
      this.assets.release(visual.instance);
    this.instances.clear();
    this.assets.dispose();
    this.group.clear();
  }
}
