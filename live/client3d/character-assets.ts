import * as T from "three";
import { originalAttacks, onceClip } from "./unit-animation";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneRig } from "three/addons/utils/SkeletonUtils.js";
import type { Team, UnitKind } from "./state";

export const ASSET_REVISION = "kaykit-render-fix-1";
export const assetRoot = "/kaykit/adventurers/";
export const characterNames = [
  "Knight",
  "Ranger",
  "Mage",
  "Barbarian",
  "Rogue",
  "Rogue_Hooded",
] as const;
export type CharacterName = (typeof characterNames)[number];
export const unitAssets: Record<
  UnitKind,
  { model: CharacterName; status: string; weapons: string[] }
> = {
  sword: {
    model: "Knight",
    status: "KayKit Knight",
    weapons: ["sword_1handed", "shield_round"],
  },
  archer: { model: "Ranger", status: "KayKit Ranger", weapons: ["bow"] },
  mage: { model: "Mage", status: "KayKit Mage", weapons: ["staff"] },
  cavalry: {
    model: "Barbarian",
    status: "KayKit Barbarian · Heavy Soldier (on foot)",
    weapons: ["axe_2handed"],
  },
  guardian: {
    model: "Knight",
    status: "RESERVED · approved castle Guardian asset missing; not spawned",
    weapons: ["sword_1handed", "shield_round"],
  },
  boss: {
    model: "Barbarian",
    status: "Giant · enlarged existing KayKit Barbarian (shared rig)",
    weapons: ["axe_2handed"],
  },
};
export interface AssetReport {
  model: string;
  status: "loading" | "ready" | "failed";
  path?: string;
  error?: string;
  meshes?: string[];
  bones?: number;
  textures?: number;
  sourceHeight?: number;
}
export interface CharacterInstance {
  root: T.Group;
  model: T.Group;
  mixer: T.AnimationMixer;
  materials: T.Material[];
  poolKey: string;
}
export function findModel(paths: string[], name: string) {
  // Match the extension itself, not a literal backslash before it.
  return paths.find(
    (path) =>
      path
        .split("/")
        .pop()
        ?.replace(/\.(glb|gltf)$/i, "")
        .toLowerCase() === name.toLowerCase() && /\.(glb|gltf)$/i.test(path),
  );
}

export class CharacterAssets {
  readonly reports = new Map<CharacterName, AssetReport>();
  readonly clips = new Map<string, T.AnimationClip>();
  readonly errors: string[] = [];
  readonly ready: Promise<void>;
  private templates = new Map<CharacterName, T.Group>();
  private weapons = new Map<string, T.Group>();
  private ownedMaterials = new Set<T.Material>();
  private disposed = false;
  private pool = new Map<string, CharacterInstance[]>();
  constructor() {
    for (const model of characterNames)
      this.reports.set(model, { model, status: "loading" });
    this.ready = this.load();
  }
  private async load() {
    try {
      const response = await fetch(assetRoot + "manifest.json", {
        cache: "no-cache",
      });
      if (!response.ok) throw Error(`Asset manifest HTTP ${response.status}`);
      const paths: string[] = await response.json();
      const loader = new GLTFLoader();
      await Promise.all(
        characterNames.map(async (name) => {
          const path = findModel(paths, name);
          try {
            if (!path) throw Error(`No exact model entry for ${name}`);
            const gltf = await loader.loadAsync(assetRoot + path);
            if (this.disposed) return;
            gltf.scene.updateMatrixWorld(true);
            const bounds = new T.Box3().setFromObject(gltf.scene);
            const size = bounds.getSize(new T.Vector3()),
              center = bounds.getCenter(new T.Vector3());
            const meshes: string[] = [];
            let bones = 0;
            const textures = new Set<T.Texture>();
            gltf.scene.traverse((o) => {
              if (o instanceof T.Bone) bones++;
              if (o instanceof T.Mesh) {
                meshes.push(o.name);
                o.castShadow = true;
                o.frustumCulled = false;
                for (const mat of Array.isArray(o.material)
                  ? o.material
                  : [o.material]) {
                  this.ownedMaterials.add(mat);
                  if (mat instanceof T.MeshStandardMaterial && mat.map)
                    textures.add(mat.map);
                }
              }
            });
            if (
              !Number.isFinite(size.y) ||
              size.y <= 0 ||
              meshes.length < 6 ||
              !bones ||
              !textures.size
            )
              throw Error(
                `Incomplete character: height=${size.y}, meshes=${meshes.length}, bones=${bones}, textures=${textures.size}`,
              );
            // Two wrappers keep static normalization separate from per-unit transforms.
            gltf.scene.position.sub(
              new T.Vector3(center.x, bounds.min.y, center.z),
            );
            const normalized = new T.Group();
            normalized.add(gltf.scene);
            normalized.scale.setScalar(1.8 / size.y);
            const template = new T.Group();
            template.add(normalized);
            this.templates.set(name, template);
            this.reports.set(name, {
              model: name,
              status: "ready",
              path,
              meshes,
              bones,
              textures: textures.size,
              sourceHeight: size.y,
            });
          } catch (error) {
            this.reports.set(name, {
              model: name,
              status: "failed",
              path,
              error: String(error),
            });
          }
        }),
      );
      await Promise.all(
        ["Rig_Medium_General", "Rig_Medium_MovementBasic"].map(async (name) => {
          try {
            const path = findModel(paths, name);
            if (!path) throw Error("Missing animation pack " + name);
            const gltf = await loader.loadAsync(assetRoot + path);
            if (this.disposed) return;
            for (const clip of gltf.animations)
              if (clip.name !== "T-Pose") this.clips.set(clip.name, clip);
            gltf.scene.traverse((o) => {
              if (o instanceof T.Mesh) {
                o.geometry.dispose();
                for (const m of Array.isArray(o.material)
                  ? o.material
                  : [o.material])
                  m.dispose();
              }
            });
          } catch (error) {
            this.errors.push(String(error));
          }
        }),
      );
      await Promise.all(
        ["sword_1handed", "shield_round", "bow", "staff", "axe_2handed"].map(
          async (name) => {
            try {
              const path = findModel(paths, name);
              if (!path) throw Error("Missing weapon " + name);
              const gltf = await loader.loadAsync(assetRoot + path);
              if (!this.disposed) this.weapons.set(name, gltf.scene);
            } catch (error) {
              this.errors.push(String(error));
            }
          },
        ),
      );
      const base = this.templates.get("Knight"),
        idle = this.clips.get("Idle_A");
      if (base && idle)
        for (const clip of originalAttacks(base, idle))
          this.clips.set(clip.name, clip);
    } catch (error) {
      for (const model of characterNames)
        this.reports.set(model, {
          model,
          status: "failed",
          error: String(error),
        });
    }
  }
  create(
    name: CharacterName,
    team: Team,
    weapons: string[] = [],
  ): CharacterInstance | null {
    const poolKey = name + ":" + team + ":" + weapons.join(",");
    const cached = this.pool.get(poolKey)?.pop();
    if (cached) {
      cached.root.position.set(0, 0, 0);
      cached.root.rotation.set(0, 0, 0);
      cached.root.scale.setScalar(1);
      return cached;
    }
    const source = this.templates.get(name);
    if (!source || this.disposed) return null;
    const root = cloneRig(source) as T.Group;
    root.name = `${name} ${team === 0 ? "RED" : "BLUE"}`;
    const model = root.children[0] as T.Group;
    const materials: T.Material[] = [];
    root.traverse((object) => {
      if (!(object instanceof T.Mesh)) return;
      // Preserve the embedded textures and skin/face colors. Tint cloth/armor only.
      object.material = (
        Array.isArray(object.material) ? object.material : [object.material]
      ).map((original) => {
        const mat = original.clone();
        materials.push(mat);
        if (
          mat instanceof T.MeshStandardMaterial &&
          /Cape|Body|Hat/.test(object.name)
        ) {
          mat.color.setHex(team === 0 ? 0xff7474 : 0x74baff);
        }
        return mat;
      });
      if (object.material.length === 1) object.material = object.material[0];
    });
    for (const weaponName of weapons) {
      const weapon = this.weapons.get(weaponName);
      const slotName =
        weaponName.startsWith("shield") || weaponName === "bow"
          ? "handslotl"
          : "handslotr";
      const slot = root.getObjectByName(slotName);
      if (weapon && slot) slot.add(weapon.clone(true));
    }
    const ring = new T.Mesh(
      new T.RingGeometry(0.38, 0.46, 24),
      new T.MeshBasicMaterial({
        color: team === 0 ? 0xf54651 : 0x319bff,
        side: T.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    ring.name = "Team ownership ring";
    root.add(ring);
    materials.push(ring.material);
    return {
      root,
      model,
      mixer: new T.AnimationMixer(root),
      materials,
      poolKey,
    };
  }
  release(instance: CharacterInstance) {
    instance.mixer.stopAllAction();
    instance.root.removeFromParent();
    if (!this.disposed) {
      const list = this.pool.get(instance.poolKey) ?? [];
      if ([...this.pool.values()].reduce((n, p) => n + p.length, 0) < 300) {
        list.push(instance);
        this.pool.set(instance.poolKey, list);
        return;
      }
    }
    this.destroy(instance);
  }
  private destroy(instance: CharacterInstance) {
    instance.mixer.uncacheRoot(instance.root);
    instance.root.traverse((o) => {
      if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
    });
    for (const mat of instance.materials) mat.dispose();
    const ring = instance.root.getObjectByName("Team ownership ring") as T.Mesh;
    ring?.geometry.dispose();
    instance.root.removeFromParent();
  }
  diagnostics() {
    return {
      revision: ASSET_REVISION,
      models: [...this.reports.values()],
      clips: [...this.clips.keys()],
      errors: [...this.errors],
      pooled: [...this.pool.values()].reduce((n, p) => n + p.length, 0),
    };
  }
  dispose() {
    this.disposed = true;
    for (const list of this.pool.values())
      for (const instance of list) this.destroy(instance);
    this.pool.clear();
    const geometry = new Set<T.BufferGeometry>(),
      textures = new Set<T.Texture>();
    for (const root of [...this.templates.values(), ...this.weapons.values()])
      root.traverse((o) => {
        if (o instanceof T.Mesh) {
          geometry.add(o.geometry);
          for (const mat of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            this.ownedMaterials.add(mat);
            if (mat instanceof T.MeshStandardMaterial && mat.map)
              textures.add(mat.map);
          }
        }
      });
    for (const g of geometry) g.dispose();
    for (const t of textures) t.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    this.templates.clear();
    this.weapons.clear();
    this.clips.clear();
  }
}

export function playClip(
  instance: CharacterInstance,
  clip: T.AnimationClip,
  previous?: T.AnimationAction,
) {
  const action = instance.mixer.clipAction(clip);
  const once = onceClip(clip.name) || /Use_Item|Throw/.test(clip.name);
  action.stopFading().setEffectiveWeight(1).setEffectiveTimeScale(1);
  action.enabled = true;
  action.reset().setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity);
  action.clampWhenFinished = once;
  action.play();
  if (previous && previous !== action) {
    previous.fadeOut(0.12);
    action.fadeIn(0.12);
  }
  return action;
}
