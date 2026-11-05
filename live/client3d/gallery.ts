import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CharacterAssets,
  characterNames,
  playClip,
  type CharacterInstance,
  type CharacterName,
} from "./character-assets";
const host = document.getElementById("viewport")!;
const labelHost = document.getElementById("labels")!;
const modelSelect = document.getElementById("model") as HTMLSelectElement;
const clipSelect = document.getElementById("clip") as HTMLSelectElement;
const status = document.getElementById("status")!;
const error = document.getElementById("error")!;
const report = document.getElementById("report")!;
const scene = new T.Scene();
scene.background = new T.Color(0xc8dddd);
scene.add(new T.HemisphereLight(0xffffff, 0x76805c, 2));
const light = new T.DirectionalLight(0xffedcf, 2.3);
light.position.set(5, 10, 8);
scene.add(light);
const ground = new T.Mesh(
  new T.PlaneGeometry(60, 60),
  new T.MeshStandardMaterial({ color: 0x8caa8c, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);
const grid = new T.GridHelper(30, 30, 0x718d79, 0xa0b7a4);
scene.add(grid);
const camera = new T.PerspectiveCamera(42, 1, 0.05, 150);
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
host.prepend(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 3;
controls.maxDistance = 35;
function reset() {
  camera.position.set(
    modelSelect.value === "all" ? 9 : 3,
    modelSelect.value === "all" ? 8 : 3.2,
    modelSelect.value === "all" ? 14 : 6,
  );
  controls.target.set(0, 0.9, 0);
  controls.update();
}
reset();
const resize = new ResizeObserver(() => {
  renderer.setSize(host.clientWidth, host.clientHeight);
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
});
resize.observe(host);
const assets = new CharacterAssets();
type Entry = {
  instance: CharacterInstance;
  label: HTMLElement;
  name: CharacterName;
  team: number;
  action?: T.AnimationAction;
};
const entries: Entry[] = [];
let paused = false,
  disposed = false;
for (const name of characterNames) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  modelSelect.append(option);
}
function place() {
  for (const e of entries) {
    const all = modelSelect.value === "all";
    e.instance.root.visible = all || modelSelect.value === e.name;
    const i = characterNames.indexOf(e.name);
    e.instance.root.position.set(
      (all ? ((i % 3) - 1) * 4 : 0) + (e.team === 0 ? -0.7 : 0.7),
      0,
      all ? (Math.floor(i / 3) - 0.5) * 4.5 : 0,
    );
    e.label.hidden = !e.instance.root.visible;
  }
}
function play() {
  const clip = assets.clips.get(clipSelect.value);
  if (clip)
    for (const e of entries) e.action = playClip(e.instance, clip, e.action);
}
modelSelect.onchange = () => {
  place();
  reset();
};
clipSelect.onchange = play;
document.getElementById("reset")!.onclick = reset;
document.getElementById("pause")!.onclick = () => {
  paused = !paused;
  document.getElementById("pause")!.textContent = paused
    ? "Resume animation"
    : "Pause animation";
};
(document.getElementById("wireframe") as HTMLInputElement).onchange = (
  event,
) => {
  for (const e of entries)
    for (const m of e.instance.materials)
      if (m instanceof T.MeshStandardMaterial)
        m.wireframe = (event.target as HTMLInputElement).checked;
};
void assets.ready.then(() => {
  if (disposed) return;
  for (const name of characterNames)
    for (const team of [0, 1] as const) {
      const weapons =
        name === "Knight"
          ? ["sword_1handed", "shield_round"]
          : name === "Ranger"
            ? ["bow"]
            : name === "Mage"
              ? ["staff"]
              : name === "Barbarian"
                ? ["axe_2handed"]
                : [];
      const instance = assets.create(name, team, weapons);
      if (!instance) continue;
      scene.add(instance.root);
      const label = document.createElement("span");
      label.className = "label " + (team === 0 ? "red" : "blue");
      label.textContent = `${name} · ${team === 0 ? "RED" : "BLUE"}`;
      labelHost.append(label);
      entries.push({ instance, label, name, team });
    }
  for (const name of assets.clips.keys()) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    clipSelect.append(option);
  }
  clipSelect.value = "Walking_A";
  place();
  play();
  status.textContent = `${entries.length} independently skinned characters · ${assets.clips.size} animation clips · revision ${assets.diagnostics().revision}`;
  const diagnostics = assets.diagnostics();
  error.textContent = [
    ...diagnostics.models
      .filter((m) => m.status === "failed")
      .map((m) => `${m.model}: ${m.error}`),
    ...diagnostics.errors,
  ].join("\n");
  report.textContent = diagnostics.models
    .map(
      (m) =>
        `${m.model}: ${m.status} · ${m.meshes?.length ?? 0} meshes · ${m.bones ?? 0} bones · ${m.textures ?? 0} texture(s)`,
    )
    .join("\n");
});
let last = performance.now(),
  frame = 0;
function animate(now: number) {
  if (disposed) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const e of entries) {
    if (!paused) e.instance.mixer.update(dt);
    const p = e.instance.root.position
      .clone()
      .add(new T.Vector3(0, 2.05, 0))
      .project(camera);
    e.label.style.left = `${(p.x * 0.5 + 0.5) * host.clientWidth}px`;
    e.label.style.top = `${(-p.y * 0.5 + 0.5) * host.clientHeight}px`;
  }
  controls.update();
  renderer.render(scene, camera);
  frame = requestAnimationFrame(animate);
}
frame = requestAnimationFrame(animate);
Object.defineProperty(window, "__PW_GALLERY", {
  configurable: true,
  value: {
    inspect: () => ({
      ...assets.diagnostics(),
      count: entries.length,
      entries: entries.map((e) => {
        const skins: T.SkinnedMesh[] = [];
        e.instance.root.traverse((o) => {
          if (o instanceof T.SkinnedMesh) skins.push(o);
        });
        const sample = skins.map((m) =>
          m.getVertexPosition(0, new T.Vector3()).toArray(),
        );
        const bounds = new T.Box3().setFromObject(e.instance.root);
        return {
          name: e.name,
          team: e.team,
          time: e.action?.time,
          clip: e.action?.getClip().name,
          bones: skins[0]?.skeleton.bones.map((b) => b.uuid),
          sample,
          height: bounds.max.y - bounds.min.y,
          minY: bounds.min.y,
          materials: e.instance.materials
            .filter((m) => m instanceof T.MeshStandardMaterial)
            .map((m) => ({
              color: (m as T.MeshStandardMaterial).color.getHexString(),
              texture: !!(m as T.MeshStandardMaterial).map,
            })),
          weapons: e.instance.root
            .getObjectByName("handslotr")
            ?.children.map((o) => o.name),
        };
      }),
    }),
  },
});
function cleanup() {
  disposed = true;
  cancelAnimationFrame(frame);
  resize.disconnect();
  controls.dispose();
  for (const e of entries) assets.release(e.instance);
  assets.dispose();
  ground.geometry.dispose();
  (ground.material as T.Material).dispose();
  grid.geometry.dispose();
  (grid.material as T.Material).dispose();
  renderer.dispose();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) cleanup();
});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
