import * as T from "three";
import {
  CharacterAssets,
  unitAssets,
  playClip,
  type CharacterInstance,
} from "./character-assets";
import { worldX, worldZ, type UnitState, type UnitKind } from "./state";
import { ARMY, renderScale } from "../src/characters.js";
import { animationFor, onceClip } from "./unit-animation";

type Vertex = { mesh: T.Mesh; index: number; color: T.Color };
type Clip = { start: number; count: number; duration: number; once: boolean };
type Batch = {
  mesh: T.InstancedMesh;
  animation: T.InstancedBufferAttribute;
  count: number;
};
type Model = {
  batches: Batch[];
  clips: Map<string, Clip>;
  time: { value: number };
  textures: T.DataTexture[];
  triangles: number;
  vertices: number;
  bytes: number;
  maxMotion: number;
  motions: Record<string, number>;
};
type Pose = { position: T.Vector3; key: string; epoch: number };

function poseVertex(o: T.Mesh, index: number, out: T.Vector3) {
  out.fromBufferAttribute(o.geometry.getAttribute("position"), index);
  if (o instanceof T.SkinnedMesh) o.applyBoneTransform(index, out);
  return out.applyMatrix4(o.matrixWorld);
}
function updateBones(source: CharacterInstance) {
  source.root.updateMatrixWorld(true);
  source.root.traverse((o) => {
    if (o instanceof T.SkinnedMesh) o.skeleton.update();
  });
}
function topology(source: CharacterInstance, gridSize: number) {
  const groups = new Map<
    string,
    {
      map: T.Texture | null;
      side: T.Side;
      vertices: Vertex[];
      uv: number[];
      colors: number[];
      indices: number[];
      positions: number[];
    }
  >();
  source.root.traverse((o) => {
    if (!(o instanceof T.Mesh) || o.name === "Team ownership ring") return;
    const mat = (
      Array.isArray(o.material) ? o.material[0] : o.material
    ) as T.MeshStandardMaterial;
    const key = (mat.map?.uuid ?? "untextured") + ":" + mat.side;
    const group = groups.get(key) ?? {
      map: mat.map,
      side: mat.side,
      vertices: [],
      uv: [],
      colors: [],
      indices: [],
      positions: [],
    };
    groups.set(key, group);
    const positions = o.geometry.getAttribute("position"),
      uv = o.geometry.getAttribute("uv"),
      points: T.Vector3[] = [];
    const box = new T.Box3();
    for (let i = 0; i < positions.count; i++) {
      const p = poseVertex(o, i, new T.Vector3());
      points.push(p);
      box.expandByPoint(p);
    }
    const cell = Math.min(
      gridSize,
      Math.max(0.012, box.getSize(new T.Vector3()).length() * 0.2),
    );
    const bins = new Map<string, number>(),
      remap: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i],
        u = uv?.getX(i) ?? 0,
        v = uv?.getY(i) ?? 0;
      const key = [
        Math.round(p.x / cell),
        Math.round(p.y / cell),
        Math.round(p.z / cell),
        Math.floor(u * 8),
        Math.floor(v * 8),
      ].join(":");
      let j = bins.get(key);
      if (j === undefined) {
        j = group.vertices.length;
        bins.set(key, j);
        group.vertices.push({
          mesh: o,
          index: i,
          color: mat.color?.clone() ?? new T.Color(),
        });
        group.positions.push(p.x, p.y, p.z);
        group.uv.push(u, v);
        group.colors.push(mat.color.r, mat.color.g, mat.color.b);
      }
      remap.push(j);
    }
    const idx = o.geometry.index,
      sourceCount = idx?.count ?? positions.count,
      faces = new Set<string>();
    for (let i = 0; i < sourceCount; i += 3) {
      const a = remap[idx ? idx.getX(i) : i],
        b = remap[idx ? idx.getX(i + 1) : i + 1],
        c = remap[idx ? idx.getX(i + 2) : i + 2];
      if (a === b || b === c || a === c) continue;
      const key = [a, b, c].sort((x, y) => x - y).join(":");
      if (faces.has(key)) continue;
      faces.add(key);
      group.indices.push(a, b, c);
    }
  });
  return [...groups.values()];
}

// Vertex-animation textures contain real sampled KayKit/MIT bone animation, not sprites.
// A bounded number of nearby rigs is handled separately; this evaluates no per-unit mixers.
export class ArmyLOD {
  readonly group = new T.Group();
  private models = new Map<string, Model>();
  private poses = new Map<number, Pose>();
  private matrix = new T.Matrix4();
  private rotation = new T.Quaternion();
  private scale = new T.Vector3();
  private euler = new T.Euler();
  private disposed = false;
  private elapsed = 0;
  private low = true;
  rendered = 0;
  private states: Record<string, number> = {};
  async prepare(assets: CharacterAssets) {
    for (const type of ["sword", "archer", "mage", "cavalry"] as const)
      for (const team of [0, 1] as const) {
        if (this.disposed) return;
        const a = unitAssets[type],
          source = assets.create(a.model, team, a.weapons);
        if (!source) throw Error("Missing GPU animation source " + a.model);
        const idle = assets.clips.get("Idle_A")!;
        playClip(source, idle);
        source.mixer.setTime(0);
        updateBones(source);
        let parts = topology(source, 0.08);
        for (const cell of [0.12, 0.17, 0.23, 0.3]) {
          if (parts.reduce((n, p) => n + p.indices.length / 3, 0) <= 850) break;
          parts = topology(source, cell);
        }
        const requested = [
          "Idle_A",
          "Running_A",
          "Walking_A",
          "Jump_Idle",
          "Hit_A",
          "Death_A",
          type === "cavalry"
            ? "PW_Heavy_Swing"
            : type === "sword"
              ? "PW_Sword_Swing"
              : type === "archer"
                ? "PW_Bow_Shot"
                : "PW_Staff_Cast",
          ...(type === "cavalry" ? ["PW_Giant_Slam"] : []),
        ];
        const clips = new Map<string, Clip>();
        let frames = 0;
        for (const name of requested) {
          const clip = assets.clips.get(name);
          if (!clip) throw Error("Missing animation " + name);
          const count = /Running/.test(name) ? 8 : /Idle/.test(name) ? 3 : 5;
          clips.set(name, {
            start: frames,
            count,
            duration: /Death/.test(name) ? 0.9 : clip.duration,
            once: onceClip(name),
          });
          frames += count;
        }
        const model: Model = {
          batches: [],
          clips,
          time: { value: 0 },
          textures: [],
          triangles: 0,
          vertices: 0,
          bytes: 0,
          maxMotion: 0,
          motions: {},
        };
        for (const part of parts) {
          const geometry = new T.BufferGeometry();
          geometry.setAttribute(
            "position",
            new T.Float32BufferAttribute(part.positions, 3),
          );
          geometry.setAttribute("uv", new T.Float32BufferAttribute(part.uv, 2));
          geometry.setAttribute(
            "color",
            new T.Float32BufferAttribute(part.colors, 3),
          );
          geometry.setAttribute(
            "vatIndex",
            new T.Float32BufferAttribute(
              part.vertices.map((_, i) => i),
              1,
            ),
          );
          geometry.setIndex(part.indices);
          geometry.computeVertexNormals();
          const vertexCount = part.vertices.length,
            width = 256,
            height = Math.ceil((frames * vertexCount) / width),
            positionData = new Float32Array(width * height * 4),
            normalData = new Float32Array(positionData.length),
            v = new T.Vector3();
          for (const [name, meta] of clips) {
            const clip = assets.clips.get(name)!;
            source.mixer.stopAllAction();
            const action = playClip(source, clip);
            action.setEffectiveTimeScale(1);
            for (let frame = 0; frame < meta.count; frame++) {
              const t = meta.once
                ? frame / (meta.count - 1)
                : frame / meta.count;
              source.mixer.setTime(t * (clip.duration - 0.001));
              updateBones(source);
              const attr = geometry.getAttribute("position");
              for (let i = 0; i < vertexCount; i++) {
                poseVertex(part.vertices[i].mesh, part.vertices[i].index, v);
                attr.setXYZ(i, v.x, v.y, v.z);
                const index = ((meta.start + frame) * vertexCount + i) * 4;
                positionData.set([v.x, v.y, v.z, 1], index);
                if (frame > 0) {
                  const base = (meta.start * vertexCount + i) * 4;
                  const displacement = Math.hypot(
                    v.x - positionData[base],
                    v.y - positionData[base + 1],
                    v.z - positionData[base + 2],
                  );
                  model.motions[name] = Math.max(
                    model.motions[name] ?? 0,
                    displacement,
                  );
                  if (name === "Running_A")
                    model.maxMotion = Math.max(model.maxMotion, displacement);
                }
              }
              geometry.computeVertexNormals();
              const normals = geometry.getAttribute("normal");
              for (let i = 0; i < vertexCount; i++)
                normalData.set(
                  [normals.getX(i), normals.getY(i), normals.getZ(i), 0],
                  ((meta.start + frame) * vertexCount + i) * 4,
                );
              if (frame % 3 === 2)
                // Yield small CPU batches without waiting for a costly GPU frame.
                // RAF-gated baking can take minutes on software/mobile renderers.
                await new Promise<void>((r) => setTimeout(r, 0));
              if (this.disposed) {
                geometry.dispose();
                assets.release(source);
                return;
              }
            }
          }
          const texture = (data: Float32Array) => {
            const t = new T.DataTexture(
              data,
              width,
              height,
              T.RGBAFormat,
              T.FloatType,
            );
            t.minFilter = t.magFilter = T.NearestFilter;
            t.generateMipmaps = false;
            t.needsUpdate = true;
            model.textures.push(t);
            return t;
          };
          const positions = texture(positionData),
            normals = texture(normalData);
          const material = new T.MeshLambertMaterial({
            map: part.map,
            side: part.side,
            vertexColors: true,
          });
          material.name = "Instanced animated KayKit " + type + " " + team;
          material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, {
              vatPositions: { value: positions },
              vatNormals: { value: normals },
              vatTime: model.time,
              vatSize: { value: new T.Vector2(width, height) },
              vatVertices: { value: vertexCount },
            });
            shader.vertexShader =
              `uniform sampler2D vatPositions;uniform sampler2D vatNormals;uniform float vatTime;uniform vec2 vatSize;uniform float vatVertices;attribute float vatIndex;attribute vec4 instanceAnimation;
vec3 vatRead(sampler2D atlas,float frame){float index=frame*vatVertices+vatIndex;return texture2D(atlas,(vec2(mod(index,vatSize.x),floor(index/vatSize.x))+.5)/vatSize).xyz;}
vec2 vatFrames(){float count=abs(instanceAnimation.y);float f=max(0.,vatTime-instanceAnimation.w)*instanceAnimation.z;f=instanceAnimation.y<0.?min(f,count-1.):mod(f,count);return vec2(instanceAnimation.x+floor(f),fract(f));}
` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader
              .replace(
                "#include <beginnormal_vertex>",
                "#include <beginnormal_vertex>\nobjectNormal=normalize(vatRead(vatNormals,vatFrames().x));",
              )
              .replace(
                "#include <begin_vertex>",
                "vec3 transformed=vatRead(vatPositions,vatFrames().x);\n#ifdef VAT_INTERPOLATE\nfloat nextFrame=instanceAnimation.x+mod(vatFrames().x-instanceAnimation.x+1.,abs(instanceAnimation.y));if(instanceAnimation.y<0.)nextFrame=min(nextFrame,instanceAnimation.x+abs(instanceAnimation.y)-1.);transformed=mix(transformed,vatRead(vatPositions,nextFrame),vatFrames().y);\n#endif",
              );
          };
          material.customProgramCacheKey = () =>
            "pw-vat-1-" + (this.low ? "low" : "smooth");
          (
            material as T.MeshLambertMaterial & {
              defines: Record<string, number>;
            }
          ).defines = this.low ? {} : { VAT_INTERPOLATE: 1 };
          const animation = new T.InstancedBufferAttribute(
            new Float32Array(ARMY.maxUnits * 4),
            4,
          );
          animation.setUsage(T.DynamicDrawUsage);
          geometry.setAttribute("instanceAnimation", animation);
          const mesh = new T.InstancedMesh(geometry, material, ARMY.maxUnits);
          mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
          mesh.count = 0;
          mesh.frustumCulled = false;
          mesh.receiveShadow = true;
          mesh.name = `KayKit GPU animation ${type} ${team}`;
          this.group.add(mesh);
          model.batches.push({ mesh, animation, count: 0 });
          model.triangles += part.indices.length / 3;
          model.vertices += vertexCount;
          model.bytes += positionData.byteLength + normalData.byteLength;
        }
        this.models.set(a.model + ":" + team, model);
        assets.release(source);
      }
  }
  setQuality(low: boolean) {
    this.low = low;
    for (const model of this.models.values())
      for (const batch of model.batches) {
        const m = batch.mesh.material as T.MeshLambertMaterial;
        (
          m as T.MeshLambertMaterial & { defines: Record<string, number> }
        ).defines = low ? {} : { VAT_INTERPOLATE: 1 };
        m.needsUpdate = true;
      }
  }
  update(units: UnitState[], dt: number, paused = false, results = false) {
    if (!paused || results) this.elapsed += dt;
    this.rendered = 0;
    this.states = {};
    const ids = new Set<number>();
    for (const model of this.models.values()) {
      model.time.value = this.elapsed;
      for (const b of model.batches) b.count = 0;
    }
    for (const u of units) {
      const model = this.models.get(unitAssets[u.type].model + ":" + u.team);
      if (!model) continue;
      ids.add(u.id);
      let p = this.poses.get(u.id);
      if (!p) {
        p = {
          position: new T.Vector3(
            worldX(u.x),
            u.type === "mage" ? 2.8 : 0,
            worldZ(u.y),
          ),
          key: "",
          epoch: 0,
        };
        this.poses.set(u.id, p);
      }
      const alpha = 1 - Math.exp(-16 * dt);
      p.position.x = T.MathUtils.lerp(p.position.x, worldX(u.x), alpha);
      p.position.z = T.MathUtils.lerp(p.position.z, worldZ(u.y), alpha);
      const name = animationFor(u, results),
        meta = model.clips.get(name) ?? model.clips.get("Idle_A")!,
        key = name + ":" + (/PW_/.test(name) ? (u.attackId ?? 0) : 0);
      if (p.key !== key) {
        p.key = key;
        p.epoch =
          this.elapsed -
          (meta.once ? 0 : ((u.id * 0.61803398875) % 1) * meta.duration);
      }
      this.rotation.setFromEuler(
        this.euler.set(0, u.team === 0 ? Math.PI / 2 : -Math.PI / 2, 0),
      );
      this.scale.setScalar(renderScale(u.type));
      this.matrix.compose(p.position, this.rotation, this.scale);
      for (const b of model.batches) {
        b.mesh.setMatrixAt(b.count, this.matrix);
        b.animation.setXYZW(
          b.count,
          meta.start,
          meta.count * (meta.once ? -1 : 1),
          meta.once
            ? (meta.count - 1) / meta.duration
            : meta.count / meta.duration,
          p.epoch,
        );
        b.count++;
      }
      this.rendered++;
      this.states[name] = (this.states[name] ?? 0) + 1;
    }
    for (const id of this.poses.keys()) if (!ids.has(id)) this.poses.delete(id);
    for (const m of this.models.values())
      for (const b of m.batches) {
        b.mesh.count = b.count;
        b.mesh.instanceMatrix.needsUpdate = true;
        b.animation.needsUpdate = true;
      }
  }
  diagnostics() {
    return {
      strategy: "vertex-animation-textures",
      rendered: this.rendered,
      states: this.states,
      time: this.elapsed,
      textureBytes: [...this.models.values()].reduce((n, m) => n + m.bytes, 0),
      models: [...this.models].map(([key, m]) => ({
        key,
        triangles: m.triangles,
        vertices: m.vertices,
        clips: [...m.clips.keys()],
        runPoseDisplacement: m.maxMotion,
        clipPoseDisplacements: m.motions,
      })),
      capacity: ARMY.maxUnits,
    };
  }
  dispose() {
    this.disposed = true;
    for (const model of this.models.values()) {
      for (const t of model.textures) t.dispose();
      for (const b of model.batches) {
        b.mesh.geometry.dispose();
        (b.mesh.material as T.Material).dispose();
        b.mesh.dispose();
      }
    }
    this.models.clear();
    this.poses.clear();
    this.group.clear();
  }
}
