import * as T from "three";
import { QUALITY, type Quality } from "./quality";
const TILES = [
  "smoke_01",
  "smoke_04",
  "fire_01",
  "flame_01",
  "magic_01",
  "spark_01",
  "slash_01",
  "trace_01",
  "star_01",
  "circle_01",
  "twirl_01",
  "dirt_01",
  "light_01",
  "scratch_01",
  "muzzle_01",
  "window_01",
] as const;
export type SpriteKind = (typeof TILES)[number];
type Particle = {
  p: T.Vector3;
  v: T.Vector3;
  age: number;
  born: number;
  life: number;
  size: number;
  gravity: number;
  tile: number;
  color: T.Color;
  rotation: number;
  spin: number;
};
type Layer = {
  mesh: T.Points;
  geometry: T.BufferGeometry;
  material: T.ShaderMaterial;
  active: Particle[];
  free: Particle[];
};
const CAP = 1100;
export class KenneyParticles {
  readonly group = new T.Group();
  readonly ready: Promise<void>;
  private atlas = new T.Texture();
  private layers: Layer[] = [];
  private quality: Quality = "medium";
  private frameBudget = 160;
  private emitted: Record<string, number> = {};
  private status = "loading";
  private errors: string[] = [];
  private seed = 0;
  private colors = new Map<number, T.Color>();
  constructor() {
    this.group.name = "Pooled Kenney native WebGL particles";
    for (const additive of [false, true]) {
      const geometry = new T.BufferGeometry();
      for (const [key, width] of [
        ["position", 3],
        ["particleColor", 3],
        ["particleSize", 1],
        ["particleAlpha", 1],
        ["particleTile", 1],
        ["particleRotation", 1],
      ] as const) {
        const a = new T.BufferAttribute(new Float32Array(CAP * width), width);
        a.setUsage(T.DynamicDrawUsage);
        geometry.setAttribute(key, a);
      }
      geometry.setDrawRange(0, 0);
      const material = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: additive ? T.AdditiveBlending : T.NormalBlending,
        toneMapped: false,
        uniforms: { atlas: { value: this.atlas }, pointScale: { value: 1500 } },
        vertexShader: `attribute vec3 particleColor;attribute float particleSize,particleAlpha,particleTile,particleRotation;uniform float pointScale;varying vec3 vColor;varying float vAlpha,vTile,vRotation;
void main(){vColor=particleColor;vAlpha=particleAlpha;vTile=particleTile;vRotation=particleRotation;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(pointScale*particleSize/max(1.,-mv.z),1.,160.);}`,
        fragmentShader: `uniform sampler2D atlas;varying vec3 vColor;varying float vAlpha,vTile,vRotation;
void main(){float c=cos(vRotation),s=sin(vRotation);vec2 q=mat2(c,-s,s,c)*(gl_PointCoord-.5)+.5;if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))discard;vec2 uv=(vec2(mod(vTile,4.),3.-floor(vTile/4.))+q)/4.;vec4 t=texture2D(atlas,uv);float a=t.a*vAlpha;if(a<.01)discard;gl_FragColor=vec4(t.rgb*vColor,a);
#include <colorspace_fragment>
}`,
      });
      const mesh = new T.Points(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = additive ? 5 : 4;
      this.group.add(mesh);
      const free = Array.from({ length: CAP }, (): Particle => ({
        p: new T.Vector3(),
        v: new T.Vector3(),
        age: 0,
        born: 0,
        life: 1,
        size: 1,
        gravity: 0,
        tile: 0,
        color: new T.Color(),
        rotation: 0,
        spin: 0,
      }));
      this.layers.push({ mesh, geometry, material, free, active: [] });
    }
    this.ready = new T.TextureLoader()
      .loadAsync("/assets/3d/effects/kenney/atlas-1k.png")
      .then((t) => {
        t.colorSpace = T.SRGBColorSpace;
        t.generateMipmaps = true;
        t.minFilter = T.LinearMipmapLinearFilter;
        this.atlas.dispose();
        this.atlas = t;
        for (const l of this.layers) l.material.uniforms.atlas.value = t;
        this.status = "ready";
      })
      .catch((e) => {
        this.status = "failed";
        this.errors.push(String(e));
      });
  }
  setQuality(q: Quality) {
    this.quality = q;
    let remaining = QUALITY[q].particles;
    for (const l of [...this.layers].reverse()) {
      const keep = Math.min(l.active.length, remaining);
      l.free.push(...l.active.splice(keep));
      remaining -= keep;
      l.geometry.setDrawRange(0, keep);
    }
  }
  emit(
    kind: SpriteKind,
    at: T.Vector3,
    color: number,
    amount: number,
    options: {
      size?: number;
      life?: number;
      spread?: number;
      speed?: number;
      gravity?: number;
      gain?: number;
      velocity?: T.Vector3;
    } = {},
  ) {
    if (this.status !== "ready") return;
    const smoke = /smoke|dirt/.test(kind),
      layer = this.layers[smoke ? 0 : 1],
      cap = QUALITY[this.quality].particles;
    let tint = this.colors.get(color);
    if (!tint) {
      tint = new T.Color(color);
      this.colors.set(color, tint);
    }
    const total = this.layers.reduce((n, l) => n + l.active.length, 0),
      count = Math.min(
        amount,
        this.frameBudget,
        cap - total,
        layer.free.length,
      );
    if (count <= 0) return;
    for (let k = 0; k < count; k++) {
      const p = layer.free.pop()!,
        seed = ++this.seed,
        angle = seed * 2.399963,
        r = (options.spread ?? 0.5) * Math.sqrt((seed * 0.61803398875) % 1);
      p.p.copy(at);
      p.p.x += Math.cos(angle) * r;
      p.p.z += Math.sin(angle) * r;
      p.p.y += (seed % 5) * 0.06;
      p.v.set(
        Math.cos(angle) * (options.speed ?? 1.8),
        smoke ? 0.7 + (seed % 5) * 0.2 : 1 + (seed % 4) * 0.4,
        Math.sin(angle) * (options.speed ?? 1.8),
      );
      if (options.velocity) p.v.add(options.velocity);
      p.age = 0;
      p.born = performance.now() / 1000;
      p.life =
        (options.life ?? (smoke ? 1.1 : 0.55)) * (0.82 + (seed % 7) * 0.045);
      p.size = (options.size ?? (smoke ? 2 : 0.45)) * (0.8 + (seed % 5) * 0.1);
      p.gravity = options.gravity ?? (smoke ? -0.1 : 2);
      p.tile = TILES.indexOf(kind);
      p.color.copy(tint).multiplyScalar(options.gain ?? (smoke ? 1 : 3));
      p.rotation = (seed % 17) * 0.37;
      p.spin = smoke ? 0.2 : ((seed % 3) - 1) * 1.5;
      layer.active.push(p);
    }
    this.frameBudget -= count;
    this.emitted[kind] = (this.emitted[kind] ?? 0) + count;
  }
  update(dt: number, camera: T.PerspectiveCamera, pixelHeight: number) {
    for (const l of this.layers) {
      for (let i = l.active.length - 1; i >= 0; i--) {
        const p = l.active[i];
        const age = performance.now() / 1000 - p.born;
        const step = Math.min(0.08, Math.max(0, age - p.age));
        p.age = age;
        if (p.age >= p.life) {
          l.active[i] = l.active[l.active.length - 1];
          l.active.pop();
          l.free.push(p);
          continue;
        }
        p.p.addScaledVector(p.v, step);
        p.v.y -= p.gravity * step;
        p.rotation += p.spin * step;
      }
      l.active.forEach((p, i) => {
        const t = p.age / p.life,
          smoke = p.tile <= 1 || p.tile === 11;
        l.geometry.getAttribute("position").setXYZ(i, p.p.x, p.p.y, p.p.z);
        l.geometry
          .getAttribute("particleColor")
          .setXYZ(i, p.color.r, p.color.g, p.color.b);
        l.geometry
          .getAttribute("particleSize")
          .setX(i, p.size * (smoke ? 0.7 + t * 0.9 : 1 - t * 0.35));
        l.geometry
          .getAttribute("particleAlpha")
          .setX(
            i,
            Math.min(1, (p.age + 0.035) / 0.07) *
              Math.pow(1 - t, smoke ? 1.1 : 1.5) *
              (smoke ? 0.65 : 1),
          );
        l.geometry.getAttribute("particleTile").setX(i, p.tile);
        l.geometry.getAttribute("particleRotation").setX(i, p.rotation);
      });
      for (const a of Object.values(l.geometry.attributes))
        a.needsUpdate = true;
      l.geometry.setDrawRange(0, l.active.length);
      l.material.uniforms.pointScale.value =
        pixelHeight / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2));
    }
    this.frameBudget = 160;
  }
  clear() {
    for (const l of this.layers) {
      l.free.push(...l.active);
      l.active = [];
      l.geometry.setDrawRange(0, 0);
    }
  }
  diagnostics() {
    return {
      status: this.status,
      errors: this.errors,
      source: "Kenney Particle Pack 1.1 CC0",
      atlas: [1024, 1024],
      drawCalls: this.layers.filter((l) => l.active.length > 0).length,
      maxDrawCalls: 2,
      active: this.layers.reduce((n, l) => n + l.active.length, 0),
      cap: QUALITY[this.quality].particles,
      emitted: { ...this.emitted },
      pooled: true,
      video: false,
    };
  }
  dispose() {
    this.clear();
    this.atlas.dispose();
    for (const l of this.layers) {
      l.geometry.dispose();
      l.material.dispose();
    }
    this.group.clear();
  }
}
