import * as T from "three";
import { BattlefieldCamera, type CameraMode } from "./camera";
import { buildWorld } from "./world";
import { KaykitUnits } from "./kaykit-units";
import { CombatEffects } from "./combat-effects";
import { loadKaykitWorld } from "./kaykit-world";
import { CASTLE_X, type BattleState } from "./state";

export class BattlefieldRenderer {
  readonly scene = new T.Scene();
  readonly director = new BattlefieldCamera();
  readonly renderer: T.WebGLRenderer;
  private effects = new CombatEffects();
  private kaykit = new KaykitUnits(() => {});
  private state: BattleState | null = null;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private last = performance.now();
  private elapsed = 0;
  private frames = 0;
  private fps = 0;
  private lost = false;
  private disposed = false;
  private sun: T.DirectionalLight;
  private fortresses: T.Group[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  constructor(
    private host: HTMLElement,
    private status: (message: string) => void,
  ) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        matchMedia("(pointer: coarse)").matches ? 1 : 1.5,
      ),
    );
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = !matchMedia("(pointer: coarse)").matches;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D battlefield, RED castle left, BLUE castle right. Drag horizontally to move the camera.",
    );
    this.renderer.domElement.tabIndex = 0;
    this.host.append(this.renderer.domElement);
    this.sun = buildWorld(this.scene).sun;
    this.scene.add(this.kaykit.group, this.effects.group);
    void loadKaykitWorld(this.scene)
      .then((forts) => {
        this.fortresses = forts;
      })
      .catch((error) => this.status("Environment load failed: " + error));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    const canvas = this.renderer.domElement;
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("keydown", this.onKey);
    this.frame = requestAnimationFrame(this.animate);
  }
  setState(state: BattleState) {
    this.state = state;
    this.fortresses.forEach((fort, team) => {
      fort.visible = state.castles[team] > 0;
    });
  }
  select(mode: CameraMode) {
    this.director.select(mode);
  }
  setQuality(low: boolean) {
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, low ? 1 : 1.5),
    );
    this.renderer.shadowMap.enabled = !low;
    this.sun.castShadow = !low;
    this.scene.traverse((object) => {
      if (object instanceof T.Mesh) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.needsUpdate = true;
      }
    });
    this.resize();
  }
  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(Math.round(width), Math.round(height), false);
    this.director.camera.aspect = width / height;
    this.director.camera.updateProjectionMatrix();
  }
  private animate = (now: number) => {
    if (this.disposed || this.lost) return;
    const wallDt = (now - this.last) / 1000;
    const dt = Math.min(wallDt, 0.1);
    this.last = now;
    if (!document.hidden) {
      this.director.follow(this.state);
      this.director.update(Math.min(wallDt, 1));
      this.kaykit.update(this.state, dt);
      this.effects.update(this.state, dt);
      this.renderer.render(this.scene, this.director.camera);
      this.frames++;
      this.elapsed += wallDt;
      if (this.elapsed > 0.75) {
        this.fps = this.frames / this.elapsed;
        this.frames = 0;
        this.elapsed = 0;
      }
    }
    this.frame = requestAnimationFrame(this.animate);
  };
  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.frame);
    this.status("Graphics context lost. Waiting for browser recovery…");
  };
  private onRestored = () => {
    this.lost = false;
    this.last = performance.now();
    this.status("Graphics restored");
    this.frame = requestAnimationFrame(this.animate);
  };
  private onPointerDown = (event: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.pinchDistance = 0;
  };
  private onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDistance > 0 && distance > 0)
        this.director.zoom(this.pinchDistance / distance);
      this.pinchDistance = distance;
    } else
      this.director.pan(
        (-dx / this.host.clientWidth) *
          this.director.diagnostics().distance *
          0.5,
      );
  };
  private onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.pinchDistance = 0;
  };
  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.director.zoom(
      Math.exp(Math.max(-0.25, Math.min(0.25, event.deltaY * 0.001))),
    );
  };
  private onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      this.director.pan(event.key === "ArrowLeft" ? -4 : 4);
    }
    if (event.key === "+" || event.key === "=") this.director.zoom(0.85);
    if (event.key === "-") this.director.zoom(1.15);
  };
  diagnostics() {
    const project = (x: number) =>
      new T.Vector3(x, 0, 0).project(this.director.camera).toArray();
    return {
      ...this.director.diagnostics(),
      fortresses: this.fortresses.map((f) => ({
        name: f.name,
        modules: f.children.length,
        visible: f.visible,
      })),
      assets: this.kaykit.diagnostics(),
      fps: this.fps,
      contextLost: this.lost,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      units: this.state?.units.length ?? 0,
      connectedState: this.state !== null,
      drawingBuffer: this.renderer
        .getDrawingBufferSize(new T.Vector2())
        .toArray(),
      castleNDC: CASTLE_X.map(project),
    };
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.onLost);
    canvas.removeEventListener("webglcontextrestored", this.onRestored);
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    canvas.removeEventListener("wheel", this.onWheel);
    canvas.removeEventListener("keydown", this.onKey);
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>();
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this.sun.shadow.dispose();
    this.effects.dispose();
    this.kaykit.dispose();
    this.scene.clear();
    this.renderer.dispose();
    canvas.remove();
  }
}
