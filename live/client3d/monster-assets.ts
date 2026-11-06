import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { MonsterKind, Team } from "./state";
export const monsterSlots = {
  frostDragon: {
    model: "Dragon",
    height: 4.5,
    idle: "Flying_Idle",
    move: "Fast_Flying",
    attack: "Headbutt",
    death: "Death",
  },
  fireDragon: {
    model: "Dragon_Evolved",
    height: 5,
    idle: "Flying_Idle",
    move: "Fast_Flying",
    attack: "Headbutt",
    death: "Death",
  },
  mushroomKing: {
    model: "MushroomKing",
    height: 3.98,
    idle: "Idle",
    move: "Walk",
    attack: "Weapon",
    death: "Death",
  },
} as const;
export type MonsterInstance = {
  root: T.Group;
  rig: T.Group;
  mixer: T.AnimationMixer;
  clips: T.AnimationClip[];
  action?: T.AnimationAction;
  key?: string;
  elapsed: number;
  poolKey: string;
  materials: T.Material[];
};
export class MonsterAssets {
  readonly reports: Record<
    string,
    {
      status: string;
      sourceHeight?: number;
      meshes?: number;
      bones?: number;
      textures?: number;
      clips?: string[];
      error?: string;
    }
  > = {};
  readonly ready: Promise<void>;
  private models = new Map<
    string,
    { scene: T.Group; clips: T.AnimationClip[] }
  >();
  private pool = new Map<string, MonsterInstance[]>();
  private owned = new Set<MonsterInstance>();
  private disposed = false;
  constructor() {
    this.ready = this.load();
  }
  private async load() {
    await Promise.all(
      Object.values(monsterSlots).map(async (slot) => {
        this.reports[slot.model] = { status: "loading" };
        try {
          const g = await new GLTFLoader().loadAsync(
            `/assets/3d/monsters/${slot.model}/${slot.model}.gltf`,
          );
          const box = new T.Box3().setFromObject(g.scene),
            size = box.getSize(new T.Vector3()),
            center = box.getCenter(new T.Vector3());
          let meshes = 0,
            bones = 0;
          const textures = new Set<T.Texture>();
          g.scene.traverse((o) => {
            if (o instanceof T.Bone) bones++;
            if (o instanceof T.Mesh) {
              meshes++;
              o.frustumCulled = false;
              o.castShadow = false;
              for (const m of Array.isArray(o.material)
                ? o.material
                : [o.material])
                if (m.map) textures.add(m.map);
            }
          });
          if (
            !meshes ||
            !bones ||
            !textures.size ||
            !Number.isFinite(size.y) ||
            size.y <= 0
          )
            throw Error("Incomplete monster mesh/rig/texture");
          for (const key of [slot.idle, slot.move, slot.attack, slot.death])
            if (!g.animations.some((c) => c.name === key))
              throw Error("Missing clip " + key);
          g.scene.position.sub(new T.Vector3(center.x, box.min.y, center.z));
          const normalized = new T.Group();
          normalized.add(g.scene);
          normalized.scale.setScalar(slot.height / size.y);
          this.models.set(slot.model, {
            scene: normalized,
            clips: g.animations,
          });
          this.reports[slot.model] = {
            status: "ready",
            sourceHeight: size.y,
            meshes,
            bones,
            textures: textures.size,
            clips: g.animations.map((c) => c.name),
          };
          if (this.disposed) this.disposeTemplate(normalized);
        } catch (e) {
          this.reports[slot.model] = { status: "failed", error: String(e) };
        }
      }),
    );
  }
  acquire(type: MonsterKind, team: Team) {
    const slot = monsterSlots[type],
      poolKey = type + ":" + team,
      cached = this.pool.get(poolKey)?.pop();
    if (cached) {
      cached.root.visible = true;
      cached.key = undefined;
      return cached;
    }
    const source = this.models.get(slot.model);
    if (!source || this.disposed) return null;
    const rig = clone(source.scene) as T.Group,
      root = new T.Group(),
      materials: T.Material[] = [];
    root.add(rig);
    root.name = slot.model + " " + type + " " + team;
    const tint = new T.Color(
      type === "frostDragon"
        ? 0x559fff
        : type === "fireDragon"
          ? 0xff622f
          : team === 0
            ? 0xc146be
            : 0x55cbe8,
    );
    rig.traverse((o) => {
      if (o instanceof T.Mesh) {
        const original = o.material;
        const variants = (Array.isArray(original) ? original : [original]).map(
          (m) => {
            const material = m.clone();
            materials.push(material);
            material.onBeforeCompile = (
              shader: Parameters<T.Material["onBeforeCompile"]>[0],
            ) => {
              shader.uniforms.monsterTint = { value: tint };
              shader.fragmentShader =
                "uniform vec3 monsterTint;\n" +
                shader.fragmentShader.replace(
                  "#include <map_fragment>",
                  "#include <map_fragment>\n float monsterLuma = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(monsterLuma) * monsterTint * 1.8, 0.86);",
                );
            };
            material.customProgramCacheKey = () => "monster-element-tint-v1";
            return material;
          },
        );
        o.material = Array.isArray(original) ? variants : variants[0];
      }
    });
    // A small team-colored 3D ring distinguishes allegiance from elemental body color.
    const ringMat = new T.MeshBasicMaterial({
      color: team === 0 ? 0xff394f : 0x309aff,
      transparent: true,
      opacity: 0.8,
    });
    materials.push(ringMat);
    const ring = new T.Mesh(
      new T.TorusGeometry(type === "mushroomKing" ? 1.1 : 2, 0.055, 4, 28),
      ringMat,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    root.add(ring);
    rig.traverse((o) => {
      if (o instanceof T.Bone && !root.userData.rootBoneId)
        root.userData.rootBoneId = o.uuid;
    });
    const instance: MonsterInstance = {
      root,
      rig,
      mixer: new T.AnimationMixer(rig),
      clips: source.clips,
      elapsed: 0,
      poolKey,
      materials,
    };
    this.owned.add(instance);
    return instance;
  }
  animate(i: MonsterInstance, clipName: string, key = clipName, death = false) {
    if (i.key === key) return;
    const clip = i.clips.find((c) => c.name === clipName);
    if (!clip) return;
    i.action?.fadeOut(0.12);
    const a = i.mixer.clipAction(clip);
    a.reset()
      .fadeIn(0.12)
      .setLoop(death ? T.LoopOnce : T.LoopRepeat, death ? 1 : Infinity);
    a.clampWhenFinished = death;
    if (death) a.timeScale = clip.duration / 2.3;
    else if (/Headbutt|Weapon|HitReact/.test(clipName)) {
      a.setLoop(T.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = clip.duration / (clipName === "HitReact" ? 0.24 : 0.85);
    }
    a.play();
    i.action = a;
    i.key = key;
  }
  release(i: MonsterInstance) {
    i.root.removeFromParent();
    i.mixer.stopAllAction();
    i.elapsed = 0;
    const pool = this.pool.get(i.poolKey) || [];
    pool.push(i);
    this.pool.set(i.poolKey, pool);
  }
  private disposeTemplate(root: T.Group) {
    const textures = new Set<T.Texture>();
    root.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const v of Object.values(m))
            if (v instanceof T.Texture) textures.add(v);
          m.dispose();
        }
      }
    });
    for (const t of textures) t.dispose();
  }
  dispose() {
    this.disposed = true;
    for (const i of this.owned) {
      i.mixer.stopAllAction();
      i.mixer.uncacheRoot(i.rig);
      i.root.removeFromParent();
      for (const m of i.materials) m.dispose();
      const r = i.root.children.at(-1);
      if (r instanceof T.Mesh) r.geometry.dispose();
    }
    for (const m of this.models.values()) this.disposeTemplate(m.scene);
    this.owned.clear();
    this.models.clear();
    this.pool.clear();
  }
}
