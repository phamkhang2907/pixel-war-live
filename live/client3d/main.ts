import { showBuildVersion, clientBuild } from "./build-version";
import { BattleAudio } from "./audio";
import { openAdmin } from "./admin";
import "./style.css";
import { BattleHud, type HudState } from "./hud";
import { io } from "socket.io-client";
import { BattlefieldRenderer } from "./renderer";
import type { CameraMode } from "./camera";
import { visitorControls } from "./visitor-controls";
import type { BattleState } from "./state";

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const hud = new BattleHud(element("stage"));
const audio = new BattleAudio();
const stopVersionCheck = showBuildVersion();
const query = new URLSearchParams(location.search);
if (query.has("debug"))
  Object.defineProperty(window, "__PW_AUDIO", {
    value: { inspect: () => audio.diagnostics() },
    configurable: true,
  });
if (query.has("overlay")) document.body.classList.add("overlay");
if (query.has("admin")) element<HTMLDetailsElement>("admin").open = true;
const showError = (message: string) => {
  element("error").textContent = message;
  element("error").hidden = false;
};
const setStatus = (message: string) => {
  element("connection").textContent = message;
};
let battlefield: BattlefieldRenderer | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
try {
  battlefield = new BattlefieldRenderer(element("world"), setStatus);
} catch (error) {
  showError(
    "The 3D renderer could not start. This preview needs WebGL 2 (Safari 15.4+). Reload the page or select the low quality preset. " +
      (error instanceof Error ? error.message : ""),
  );
}
const demoMode =
  query.has("demo") || !["live", "admin", "overlay"].some((k) => query.has(k));
const socket = io(demoMode ? "/demo" : "/", { autoConnect: false });
const arenaLink = element<HTMLAnchorElement>("viewArena");
arenaLink.href = demoMode ? "/3d/?live=1" : "/3d/?demo=1";
arenaLink.textContent = demoMode ? "Watch LIVE" : "Public Demo";
let isOwner = false;
const visitors = visitorControls({
  demoMode,
  control,
  isOwner: () => isOwner,
  camera: (mode) => battlefield?.select(mode),
});
socket.on("music", (payload) => audio.setTrack(payload.track));
socket.on("connect", () => {
  element("connectionDot").classList.add("online");
  setStatus("Connected · authoritative battle server");
});
socket.on("disconnect", () => {
  element("connectionDot").classList.remove("online");
  setStatus("Disconnected · reconnecting…");
});
socket.on("connect_error", () => setStatus("Server unavailable · retrying…"));
let latestServerTime = 0;
socket.on("state", (state: BattleState) => {
  if (state.serverNow && state.serverNow < latestServerTime) return;
  latestServerTime = state.serverNow ?? latestServerTime;
  if (state.armyCapacity === undefined)
    setStatus(
      "Server vẫn chạy bản cũ: khởi động lại Node server sau khi cập nhật/build.",
    );
  const liveStatus = element("liveStatus");
  if (liveStatus)
    liveStatus.textContent =
      (state as BattleState & { liveStatus?: string }).liveStatus ?? state.mode;
  battlefield?.setState(state);
  visitors.state(state);
  const queueStatus = document.getElementById("summonStatus");
  if (queueStatus)
    queueStatus.textContent = `${state.units.length}/${state.armyCapacity ?? 1000} quân · Chờ triển khai: ${state.summonQueue?.pending ?? 0} · FIFO tiếp theo: ${state.summonQueue?.headSequence ?? "—"}`;
  hud.render(state as HudState);
  audio.update(state as HudState, battlefield?.director.camera.position.x ?? 0);
  element("round").textContent = `ROUND ${state.round}`;
  const phase = state.roundState.phase;
  element("phase").textContent = state.paused ? "PAUSED" : phase.toUpperCase();
  const seconds = Math.ceil(
    ["results", "countdown"].includes(phase)
      ? state.roundState.phaseRemaining
      : state.roundState.remaining,
  );
  element("timer").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  for (const [team, name] of ["red", "blue"].entries()) {
    element(name + "Hp").textContent =
      `${Math.ceil(state.castles[team]).toLocaleString()} HP`;
    element<HTMLMeterElement>(name + "Bar").value = state.castles[team];
    element(name + "Count").textContent =
      `${state.units.filter((u) => u.team === team && u.hp > 0).length} units`;
  }
});
socket.connect();
document
  .querySelectorAll<HTMLButtonElement>("[data-camera]")
  .forEach((button) => {
    button.onclick = () =>
      battlefield?.select(button.dataset.camera as CameraMode);
  });
element("zoomIn").onclick = () => battlefield?.director.zoom(0.8);
element("zoomOut").onclick = () => battlefield?.director.zoom(1.25);
const quality = element<HTMLSelectElement>("quality");
quality.value = matchMedia("(pointer: coarse)").matches ? "low" : "balanced";
quality.onchange = () => battlefield?.setQuality(quality.value === "low");

// HTTP-only session: browser JavaScript never receives the owner password or bearer secret.
void fetch("/api/owner/session")
  .then((r) => r.json())
  .then(async (session) => {
    isOwner = session.owner;
    if (!isOwner || demoMode) return;
    element("ownerBattleControls").hidden = false;
    element("ownerLink").textContent = "Owner controls";
    if (!query.has("admin")) return;
    const response = await fetch("/api/config");
    if (!response.ok) throw Error("Owner session expired");
    element<HTMLDetailsElement>("admin").hidden = false;
    element<HTMLDetailsElement>("admin").open = true;
    openAdmin(
      await response.json(),
      control,
      () =>
        fetch("/api/config").then((r) => {
          if (!r.ok) throw Error("Sign in again");
          return r.json();
        }),
      {
        setTrack: (t) => audio.setTrack(t),
        preview: () => audio.previewMusic(),
        showArmy: () => battlefield?.select("front"),
      },
    );
    element("demoActions").hidden = false;
  })
  .catch((error) => {
    element("adminStatus").textContent = String(error);
  });
async function control(action: string, data: Record<string, unknown> = {}) {
  try {
    const response = await fetch("/api/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...data, commandId: crypto.randomUUID() }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Command failed");
    element("adminStatus").textContent = "Command sent.";
    return true;
  } catch (error) {
    element("adminStatus").textContent = String(error);
    return false;
  }
}
document
  .querySelectorAll<HTMLButtonElement>("[data-scenario]")
  .forEach((button) => {
    button.onclick = async () => {
      if (
        await control("cameraScenario", { scenario: button.dataset.scenario })
      )
        battlefield?.select(
          button.dataset.scenario === "red"
            ? "blue"
            : button.dataset.scenario === "blue"
              ? "red"
              : "front",
        );
    };
  });
if (battlefield) {
  const view = battlefield;
  if (query.has("debug")) {
    element("debug").hidden = false;
    // Read-only diagnostic hook for acceptance tests; no admin commands or token.
    Object.defineProperty(window, "__PW3D", {
      value: {
        inspect: () => ({
          ...view.diagnostics(),
          audio: audio.diagnostics(),
          build: clientBuild,
        }),
      },
      configurable: true,
    });
  }
  timer = setInterval(() => {
    const d = view.diagnostics();
    element("cameraLabel").textContent =
      d.mode === "overview"
        ? "WIDE OVERVIEW"
        : d.mode === "front"
          ? "BATTLEFIELD"
          : d.mode.toUpperCase();
    document
      .querySelectorAll<HTMLButtonElement>("[data-camera]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(d.mode === button.dataset.camera),
        ),
      );
    const readyModels = d.assets.models.filter((m) => m.status === "ready");
    const failedModels = d.assets.models.filter((m) => m.status === "failed");
    element("assetStatus").textContent =
      `${d.assets.revision} · ${readyModels.length}/6 models loaded · ${d.assets.rendered} real character instances` +
      (failedModels.length
        ? ` · FAILED: ${failedModels.map((m) => m.model + ": " + m.error).join("; ")}`
        : "") +
      (d.assets.errors.length
        ? ` · Asset warnings: ${d.assets.errors.join("; ")}`
        : "");
    if (query.has("debug"))
      element("debug").textContent =
        `FPS ${d.fps.toFixed(1)} · average frame ${d.fps > 0 ? (1000 / d.fps).toFixed(1) : "—"} ms\n${d.drawCalls} draw calls · ${d.triangles.toLocaleString()} triangles\n${d.units} server units · camera ${d.mode} · X ${d.x.toFixed(1)}\nBuffer ${d.drawingBuffer.join(" × ")} · JS heap ${d.jsHeapBytes ? (d.jsHeapBytes / 1048576).toFixed(1) + " MiB" : "unavailable"}\nContext ${d.contextLost ? "lost" : "ready"} · Development measurements only.`;
  }, 500);
}
function cleanup() {
  stopVersionCheck();
  clearInterval(timer);
  socket.disconnect();
  battlefield?.dispose();
  hud.dispose();
  audio.dispose();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) cleanup();
});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
