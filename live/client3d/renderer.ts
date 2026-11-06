import * as T from "three";
import { BattlefieldCamera, type CameraMode } from "./camera";
import type { TerrainSurface } from "./grass-material";
import { buildWorld } from "./world";
import { KaykitUnits } from "./kaykit-units";
import { CombatEffects } from "./combat-effects";
import { GroundContacts } from "./ground-contacts";
import { loadKaykitWorld } from "./kaykit-world";
import { CASTLE_X, worldX, worldZ, type BattleState } from "./state";

export class BattlefieldRenderer {
  readonly scene = new T.Scene();
  readonly director = new BattlefieldCamera();
  readonly renderer: T.WebGLRenderer;
  private effects = new CombatEffects();
  private contacts = new GroundContacts();
  private kaykit = new KaykitUnits(() => {});
  private state: BattleState | null = null;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private last = performance.now();
  private elapsed = 0;
  private frames = 0;
  private fps = 0;
  private totalFrames = 0;
  private maxFrameMs = 0;
  private lost = false;
  private adaptiveScale = 1;
  private lastBufferScale = -1;
  private lowQuality = matchMedia("(pointer: coarse)").matches;
  private disposed = false;
  private sun: T.DirectionalLight;
  private terrain: TerrainSurface;
  private fortresses: T.Group[] = [];
  private pointers = new Map<
    number,
    { x: number; y: number; button: number }
  >();
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
    const world = buildWorld(this.scene);
    this.sun = world.sun;
    this.terrain = world.terrain;
    this.scene.add(this.kaykit.group, this.effects.group, this.contacts.group);
    void loadKaykitWorld(this.scene, this.contacts)
      .then((forts) => {
        this.fortresses = forts;
      })
      .catch((error) => this.status("Environment load failed: " + error));
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      if (!this.lost && !this.disposed)
        this.renderer.render(this.scene, this.director.camera);
    });
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
    canvas.addEventListener("contextmenu", this.onContextMenu);
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
    this.lowQuality = low;
    this.kaykit.setQuality(low);
    this.adaptiveScale = 1;
    this.lastBufferScale = -1;
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
      const resultPhase = ["results", "countdown"].includes(
        this.state?.roundState.phase ?? "",
      );
      const bufferScale =
        Math.min(window.devicePixelRatio, this.lowQuality ? 1 : 1.5) *
        Math.min(this.adaptiveScale, resultPhase ? 0.6 : 1);
      if (Math.abs(bufferScale - this.lastBufferScale) > 0.02) {
        this.renderer.setPixelRatio(bufferScale);
        this.lastBufferScale = bufferScale;
        this.resize();
      }
      this.kaykit.update(
        this.state,
        Math.min(wallDt, 1),
        this.director.camera.position,
      );
      this.effects.update(this.state, dt);
      this.contacts.update(this.state, Math.min(wallDt, 1));
      this.renderer.render(this.scene, this.director.camera);
      this.frames++;
      this.totalFrames++;
      this.maxFrameMs = Math.max(this.maxFrameMs, wallDt * 1000);
      this.elapsed += wallDt;
      if (this.elapsed > 0.75) {
        this.fps = this.frames / this.elapsed;
        if (this.fps < 22)
          this.adaptiveScale = Math.max(0.5, this.adaptiveScale * 0.8);
        else if (this.fps > 50)
          this.adaptiveScale = Math.min(1, this.adaptiveScale + 0.02);
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
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
    });
  };
  private onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const before = [...this.pointers.values()],
      dx = event.clientX - previous.x,
      dy = event.clientY - previous.y;
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      button: previous.button,
    });
    if (this.pointers.size === 2) {
      const [a, b] = before,
        [c, d] = [...this.pointers.values()];
      const oldDistance = Math.hypot(a.x - b.x, a.y - b.y),
        distance = Math.hypot(c.x - d.x, c.y - d.y);
      this.director.panScreen(
        dx / 2 / this.host.clientWidth,
        dy / 2 / this.host.clientHeight,
      );
      if (oldDistance > 2 && distance > 2)
        this.director.zoom(oldDistance / distance);
    } else if (this.pointers.size === 1) {
      if (previous.button === 2)
        this.director.panScreen(
          dx / this.host.clientWidth,
          dy / this.host.clientHeight,
        );
      else
        this.director.orbit(
          dx / this.host.clientWidth,
          dy / this.host.clientHeight,
        );
    }
  };
  private onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
  };
  private onContextMenu = (event: Event) => event.preventDefault();
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
    const visibility = { inFrame: [0, 0], clearHud: [0, 0] },
      v = new T.Vector3();
    for (const u of this.state?.units ?? []) {
      if (u.hp <= 0) continue;
      v.set(worldX(u.x), u.type === "mage" ? 3.4 : 0.7, worldZ(u.y)).project(
        this.director.camera,
      );
      if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && Math.abs(v.z) <= 1) {
        visibility.inFrame[u.team]++;
        if (v.y <= 0.3 && v.y >= -0.88) visibility.clearHud[u.team]++;
      }
    }
    return {
      ...this.director.diagnostics(),
      estimatedVisibleUnitCenters: visibility,
      fortresses: this.fortresses.map((f) => ({
        name: f.name,
        modules: f.children.length,
        catalog: f.userData.modules,
        bounds: f.userData.bounds,
        projectedBounds: f.userData.bounds
          ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
              new T.Vector3(
                f.userData.bounds[i & 1 ? "max" : "min"][0],
                f.userData.bounds[i & 2 ? "max" : "min"][1],
                f.userData.bounds[i & 4 ? "max" : "min"][2],
              )
                .project(this.director.camera)
                .toArray(),
            )
          : [],
        visible: f.visible,
      })),
      terrain: this.terrain.inspect(),
      environment:
        this.scene.getObjectByName("Instanced KayKit fantasy environment")
          ?.userData ?? null,
      contacts: this.contacts.inspect(),
      assets: this.kaykit.diagnostics(),
      fps: this.fps,
      totalFrames: this.totalFrames,
      maxFrameMs: this.maxFrameMs,
      listenerX: this.director.camera.position.x,
      adaptiveScale: this.adaptiveScale,
      contextLost: this.lost,
      renderMemory: { ...this.renderer.info.memory },
      jsHeapBytes:
        (performance as Performance & { memory?: { usedJSHeapSize: number } })
          .memory?.usedJSHeapSize ?? null,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      units: this.state?.units.length ?? 0,
      connectedState: this.state !== null,
      roundState: this.state?.roundState,
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
    canvas.removeEventListener("contextmenu", this.onContextMenu);
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>();
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh) {
        if (o instanceof T.InstancedMesh) o.dispose();
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this.terrain.dispose();
    this.contacts.dispose();
    const textures = new Set<T.Texture>();
    for (const m of materials) {
      const map = (m as T.MeshStandardMaterial).map;
      if (map) textures.add(map);
    }
    for (const texture of textures) texture.dispose();
    this.sun.shadow.dispose();
    this.effects.dispose();
    this.kaykit.dispose();
    this.scene.clear();
    this.renderer.dispose();
    canvas.remove();
  }
}
