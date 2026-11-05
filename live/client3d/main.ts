import "./style.css";
import { BattleHud, type HudState } from "./hud";
import { io } from "socket.io-client";
import { BattlefieldRenderer } from "./renderer";
import type { CameraMode } from "./camera";
import type { BattleState } from "./state";

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const hud = new BattleHud(element("stage"));
const query = new URLSearchParams(location.search);
if (query.has("overlay")) document.body.classList.add("overlay");
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
    "The 3D renderer could not start. This preview needs WebGL 2 (Safari 15.4+). Reload the page or use the existing game via the link above. " +
      (error instanceof Error ? error.message : ""),
  );
}
const socket = io({ autoConnect: false });
socket.on("connect", () => {
  element("connectionDot").classList.add("online");
  setStatus("Connected · authoritative battle server");
});
socket.on("disconnect", () => {
  element("connectionDot").classList.remove("online");
  setStatus("Disconnected · reconnecting…");
});
socket.on("connect_error", () => setStatus("Server unavailable · retrying…"));
socket.on("state", (state: BattleState) => {
  battlefield?.setState(state);
  hud.render(state as HudState);
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
  const result = state.roundState.result;
  element("result").hidden = !result;
  if (result)
    element("result").textContent = result.aborted
      ? "ROUND INTERRUPTED"
      : result.winner === null
        ? "DRAW"
        : `${result.winner === 0 ? "RED" : "BLUE"} WINS`;
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

// Keep every mutation behind existing server authorization. No token in URLs.
let token = "";
element("auth").onsubmit = async (event) => {
  event.preventDefault();
  const candidate = element<HTMLInputElement>("token").value.trim();
  try {
    const response = await fetch("/api/config", {
      headers: { Authorization: `Bearer ${candidate}` },
    });
    if (!response.ok) throw Error("Invalid admin token");
    token = candidate;
    element("demoActions").hidden = false;
    element<HTMLInputElement>("token").value = "";
    element("adminStatus").textContent =
      "Unlocked for this page. Commands change the shared server battle.";
  } catch (error) {
    element("adminStatus").textContent = String(error);
  }
};
async function control(action: string, data: Record<string, unknown> = {}) {
  try {
    const response = await fetch("/api/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...data }),
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
element("pause").onclick = () => {
  void control("pause");
};
element("reset").onclick = () => {
  void control("reset");
};

if (battlefield) {
  const view = battlefield;
  if (query.has("debug")) {
    element("debug").hidden = false;
    // Read-only diagnostic hook for acceptance tests; no admin commands or token.
    Object.defineProperty(window, "__PW3D", {
      value: { inspect: () => view.diagnostics() },
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
        `FPS ${d.fps.toFixed(1)} · ${d.drawCalls} draw calls · ${d.triangles.toLocaleString()} triangles\n${d.units} server units · camera ${d.mode} · X ${d.x.toFixed(1)}\nBuffer ${d.drawingBuffer.join(" × ")} · context ${d.contextLost ? "lost" : "ready"}\nDevelopment measurements only; no device benchmark claim.`;
  }, 500);
}
function cleanup() {
  clearInterval(timer);
  socket.disconnect();
  battlefield?.dispose();
  hud.dispose();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) cleanup();
});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
