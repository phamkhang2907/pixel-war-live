import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { worldX, type BattleState, CASTLE_X } from "./state";

export type CameraMode = "overview" | "front" | "red" | "blue" | "manual";
export class BattlefieldCamera {
  readonly camera = new PerspectiveCamera(42, 9 / 16, 0.1, 750);
  mode: CameraMode = "overview";
  private focus = new Vector3(0, 0, 0);
  private desiredFocus = new Vector3(0, 0, 0);
  private distance = 310;
  private desiredDistance = 310;
  private position = new Vector3();
  private yaw = 0;
  private desiredYaw = 0;
  private elevation = 52;
  private desiredElevation = 52;
  constructor() {
    this.update(1);
  }
  select(mode: CameraMode) {
    if (mode === "manual") {
      this.mode = mode;
      this.desiredFocus.copy(this.focus);
      this.desiredDistance = this.distance;
      this.desiredYaw = this.yaw;
      this.desiredElevation = this.elevation;
      return;
    }
    this.mode = mode;
    this.desiredElevation = 52;
    this.desiredYaw = MathUtils.degToRad(
      mode === "red" ? 38 : mode === "blue" ? -38 : 0,
    );
    this.desiredFocus.set(
      mode === "red"
        ? CASTLE_X[0] - 5.5
        : mode === "blue"
          ? CASTLE_X[1] + 5.5
          : 0,
      0,
      0,
    );
    this.desiredFocus.z = mode === "front" ? -5.5 : 0;
    this.desiredDistance =
      mode === "overview" ? 310 : mode === "red" || mode === "blue" ? 115 : 100;
  }
  orbit(dx: number, dy: number) {
    this.mode = "manual";
    this.desiredYaw -= dx * Math.PI * 2;
    this.desiredElevation = MathUtils.clamp(
      this.desiredElevation + dy * 120,
      20,
      78,
    );
  }
  panScreen(dx: number, dy: number) {
    this.mode = "manual";
    const k = this.desiredDistance * 0.65,
      c = Math.cos(this.desiredYaw),
      s = Math.sin(this.desiredYaw);
    this.desiredFocus.x = MathUtils.clamp(
      this.desiredFocus.x + (-dx * c + dy * s) * k,
      -65,
      65,
    );
    this.desiredFocus.z = MathUtils.clamp(
      this.desiredFocus.z + (dx * s + dy * c) * k,
      -40,
      40,
    );
  }
  pan(delta: number) {
    this.mode = "manual";
    this.desiredFocus.x = MathUtils.clamp(this.desiredFocus.x + delta, -48, 48);
  }
  zoom(factor: number) {
    this.mode = "manual";
    this.desiredDistance = MathUtils.clamp(
      this.desiredDistance * factor,
      35,
      320,
    );
  }
  follow(state: BattleState | null) {
    if (this.mode !== "front" || !state) return;
    let min = Infinity,
      max = -Infinity,
      red = -Infinity,
      blue = Infinity;
    const hasMarchers = state.units.some((v) => v.type !== "mushroomKing");
    for (const u of state.units) {
      if (u.hp <= 0 || (u.type === "mushroomKing" && hasMarchers)) continue;
      const x = worldX(u.x);
      min = Math.min(min, x);
      max = Math.max(max, x);
      if (u.team === 0) red = Math.max(red, x);
      else blue = Math.min(blue, x);
    }
    if (!Number.isFinite(min)) return;
    const frontline =
      Number.isFinite(red) && Number.isFinite(blue)
        ? (red + blue) / 2
        : (min + max) / 2;
    this.desiredFocus.x = MathUtils.clamp(
      frontline * 0.6 + ((min + max) / 2) * 0.4,
      -40,
      40,
    );
    this.desiredFocus.z = -5.5;
    this.desiredDistance = MathUtils.clamp(
      (2 * Math.max(this.desiredFocus.x - min, max - this.desiredFocus.x) +
        16) /
        0.42,
      100,
      250,
    );
  }

  update(dt: number) {
    const alpha = 1 - Math.exp(-5 * dt);
    this.focus.lerp(this.desiredFocus, alpha);
    this.distance = MathUtils.lerp(this.distance, this.desiredDistance, alpha);
    this.elevation = MathUtils.lerp(
      this.elevation,
      this.desiredElevation,
      alpha,
    );
    this.position.set(
      this.focus.x,
      Math.max(
        16,
        this.distance * Math.sin(MathUtils.degToRad(this.elevation)),
      ),
      this.distance * Math.cos(MathUtils.degToRad(this.elevation)),
    );
    this.yaw = MathUtils.lerp(this.yaw, this.desiredYaw, alpha);
    const horizontal =
      this.distance * Math.cos(MathUtils.degToRad(this.elevation));
    this.position.x += horizontal * Math.sin(this.yaw);
    this.position.z = this.focus.z + horizontal * Math.cos(this.yaw);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
  diagnostics() {
    return {
      mode: this.mode,
      x: this.focus.x,
      targetX: this.desiredFocus.x,
      targetDistance: this.desiredDistance,
      distance: this.distance,
      elevation: this.elevation,
      z: this.focus.z,
      cameraPosition: this.camera.position.toArray(),
      yaw: MathUtils.radToDeg(this.yaw),
      targetYaw: MathUtils.radToDeg(this.desiredYaw),
    };
  }
}
