import { ArmyLOD } from "./army-lod";
import * as T from "three";
import { animationFor } from "./unit-animation";
import { TYPES, ARMY, renderScale } from "../src/characters.js";
import { worldX, worldZ, isSoldier, type BattleState } from "./state";
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
  key?: string;
};
export class KaykitUnits {
  readonly group = new T.Group();
  readonly assets = new CharacterAssets();
  private instances = new Map<number, UnitVisual>();
  private loaded = false;
  private nearIds = new Set<number>();
  private selectionAge = 1;
  private selectionCount = -1;
  private lod = new ArmyLOD();
  private tick = 0;
  private lowQuality = matchMedia("(pointer: coarse)").matches;
  get ready() {
    return this.loaded;
  }
  setQuality(low: boolean) {
    this.lowQuality = low;
    this.lod.setQuality(low);
    this.selectionAge = 1;
  }
  private disposed = false;
  constructor(onReady: () => void) {
    this.group.name = "KayKit skinned units (no procedural soldiers)";
    this.group.add(this.lod.group);
    void this.assets.ready.then(async () => {
      await this.lod.prepare(this.assets);
      if (!this.disposed) {
        this.loaded = true;
        onReady();
      }
    });
  }
  update(state: BattleState | null, dt: number, camera?: T.Vector3) {
    if (!this.loaded || this.disposed) return;
    const all = state?.units.filter(isSoldier).slice(0, ARMY.maxUnits) ?? [];
    this.selectionAge += dt;
    if (this.selectionAge > 0.5 || this.selectionCount !== all.length) {
      this.selectionAge = 0;
      this.selectionCount = all.length;
      const order = [...all].sort((a, b) => {
        const distance = (u: typeof a) => {
          const x = worldX(u.x) - (camera?.x ?? 0),
            z = worldZ(u.y) - (camera?.z ?? 0);
          return x * x + z * z - (u.type === "boss" ? 10000 : 0);
        };
        return distance(a) - distance(b);
      });
      this.nearIds = new Set(
        order
          .slice(0, all.length > 40 ? (this.lowQuality ? 4 : 8) : 40)
          .map((u) => u.id),
      );
    }
    const units = all.filter((u) => this.nearIds.has(u.id));
    const resultPhase = ["results", "countdown"].includes(
      state?.roundState.phase ?? "",
    );
    const ids = new Set(units.map((u) => u.id));
    for (const [id, visual] of this.instances)
      if (!ids.has(id)) {
        this.assets.release(visual.instance);
        this.instances.delete(id);
      }
    let created = 0;
    this.tick++;
    for (const unit of units) {
      let visual = this.instances.get(unit.id);
      const target = new T.Vector3(
        worldX(unit.x),
        unit.type === "mage" ? 2.8 : 0,
        worldZ(unit.y),
      );
      if (!visual) {
        if (created++ >= 2) continue;
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
      visual.position.lerp(target, 1 - Math.exp(-16 * dt));
      const { instance } = visual;
      instance.root.position.copy(visual.position);
      // Only the instance wrapper changes. The nested 1.8m normalization survives.
      instance.root.scale.setScalar(renderScale(unit.type));
      instance.root.rotation.y = unit.team === 0 ? Math.PI / 2 : -Math.PI / 2;
      const desired = animationFor(unit, resultPhase);
      const clip = this.assets.clips.get(desired),
        key = desired + ":" + (/PW_/.test(desired) ? (unit.attackId ?? 0) : 0);
      if (clip && visual.key !== key) {
        visual.action = playClip(instance, clip, visual.action);
        visual.clip = desired;
        visual.key = key;
        if (desired === "Death_A")
          visual.action.setEffectiveTimeScale(clip.duration / 0.9);
        if (desired === "Hit_A")
          visual.action.setEffectiveTimeScale(clip.duration / 0.24);
      }
      const stride = units.length > 200 ? 4 : units.length > 100 ? 2 : 1;
      if (this.tick % stride === unit.id % stride)
        instance.mixer.update(state?.paused && !resultPhase ? 0 : dt * stride);
    }
    // Keep a real GPU model visible until its nearby skeletal instance exists.
    // Bounded rig creation must never produce holes during an LOD transition.
    this.lod.update(
      all.filter((u) => !this.instances.has(u.id)),
      dt,
      state?.paused ?? false,
      resultPhase,
    );
  }
  diagnostics() {
    return {
      ...this.assets.diagnostics(),
      ready: this.loaded,
      rendered: this.instances.size + this.lod.rendered,
      independentSkeletons: this.instances.size,
      bakedLod: this.lod.rendered,
      proceduralSoldiers: 0,
      gpuAnimation: this.lod.diagnostics(),
      scaleHeights: {
        normal: ARMY.normalHeight,
        heavy: ARMY.normalHeight * TYPES.cavalry.scale,
        giant: ARMY.normalHeight * TYPES.boss.scale,
      },
      instances: [...this.instances.entries()].slice(0, 12).map(([id, v]) => ({
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
    this.lod.dispose();
    this.assets.dispose();
    this.group.clear();
  }
}
