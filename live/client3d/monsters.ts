import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  MonsterAssets,
  monsterSlots,
  type MonsterInstance,
} from "./monster-assets";
import type { MonsterKind, Team } from "./state";
const assets = new MonsterAssets(),
  scene = new T.Scene(),
  camera = new T.PerspectiveCamera(42, 1, 0.1, 200),
  renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
scene.background = new T.Color(0x263945);
scene.add(new T.HemisphereLight(0xe3f3ff, 0x617447, 2));
const sun = new T.DirectionalLight(0xfff5e8, 3);
sun.position.set(12, 18, 15);
scene.add(sun);
scene.add(
  new T.Mesh(
    new T.PlaneGeometry(60, 45).rotateX(-Math.PI / 2),
    new T.MeshStandardMaterial({ color: 0x4b6940, roughness: 1 }),
  ),
);
document.querySelector("#view")!.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 180;
controls.maxPolarAngle = Math.PI * 0.47;
const reset = () => {
  const wide = el("model").value === "all" ? 18 : 7;
  const d = Math.max(
    18,
    wide / (Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect),
  );
  camera.position.set(d * 0.35, d * 0.4, d);
  controls.target.set(0, 2, 0);
  controls.update();
};
document.querySelector("#reset")!.addEventListener("click", reset);
let instances: MonsterInstance[] = [],
  types: MonsterKind[] = [],
  clock = new T.Clock(),
  frames = 0;
const el = (id: string) => document.getElementById(id) as HTMLSelectElement;
function rebuild() {
  for (const i of instances) assets.release(i);
  instances = [];
  types =
    el("model").value === "all"
      ? (Object.keys(monsterSlots) as MonsterKind[])
      : [el("model").value as MonsterKind];
  types.forEach((type, k) => {
    const i = assets.acquire(type, Number(el("team").value) as Team);
    if (!i) return;
    i.root.position.x = types.length === 1 ? 0 : (k - 1) * 8;
    i.rig.rotation.y = 0;
    scene.add(i.root);
    instances.push(i);
  });
  animateClips();
  reset();
}
function animateClips() {
  instances.forEach((i, k) => {
    const slot = monsterSlots[types[k]],
      kind = el("clip").value as "idle" | "move" | "attack" | "death";
    assets.animate(
      i,
      slot[kind],
      slot[kind] + ":" + performance.now(),
      kind === "death",
    );
  });
}
for (const id of ["model", "team"]) el(id).onchange = rebuild;
el("clip").onchange = animateClips;
void assets.ready.then(() => {
  rebuild();
  document.getElementById("status")!.textContent = Object.entries(
    assets.reports,
  )
    .map(
      ([n, r]) => `${n}: ${r.status}, ${r.bones} bones, ${r.textures} textures`,
    )
    .join(" · ");
});
const resize = () => {
  const width = innerWidth,
    height = Math.max(300, innerHeight - 150);
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  reset();
};
addEventListener("resize", resize);
resize();
function frame() {
  const dt = Math.min(0.1, clock.getDelta());
  for (const i of instances) i.mixer.update(dt);
  controls.update();
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(frame);
}
frame();
Object.defineProperty(window, "__MONSTERS", {
  value: {
    inspect: () => ({
      reports: assets.reports,
      frames,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      instances: instances.map((i) => ({
        model: i.root.name,
        clip: i.action?.getClip().name,
        time: i.action?.time,
        bounds: new T.Box3()
          .setFromObject(i.rig)
          .getSize(new T.Vector3())
          .toArray(),
      })),
    }),
    pose: () =>
      instances.flatMap((i) => {
        i.root.updateMatrixWorld(true);
        const result: number[] = [];
        i.rig.traverse((o) => {
          if (o instanceof T.SkinnedMesh) {
            o.skeleton.update();
            const a = o.geometry.getAttribute("position");
            for (
              let k = 0;
              k < a.count;
              k += Math.max(1, Math.floor(a.count / 24))
            ) {
              const v = o.applyBoneTransform(
                k,
                new T.Vector3().fromBufferAttribute(a, k),
              );
              result.push(v.x, v.y, v.z);
            }
          }
        });
        return result;
      }),
  },
});
