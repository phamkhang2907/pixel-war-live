import type { BattleState } from "./state";
import type { CameraMode } from "./camera";
export function visitorControls(api: {
  demoMode: boolean;
  control: (a: string, p?: Record<string, unknown>) => Promise<boolean>;
  isOwner: () => boolean;
  camera: (m: CameraMode) => void;
}) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const panel = el<HTMLDialogElement>("demoGiftPanel"),
    live = el<HTMLDialogElement>("livePanel");
  el("freeCamera").onclick = () => api.camera("manual");
  el("resetCamera").onclick = () => api.camera("overview");
  el("followBattle").onclick = () => api.camera("front");
  el("sendDemoGift").onclick = () => {
    if (!api.demoMode) {
      location.href = "/3d/?demo=1&gift=1";
      return;
    }
    panel.showModal();
  };
  const ready = fetch("/api/demo/config")
    .then((r) => r.json())
    .then((c) => {
      for (const g of c.gifts)
        el<HTMLSelectElement>("publicGift").add(
          new Option(`${g.name} → ${g.count} ${g.unit}`, g.name),
        );
    });
  if (api.demoMode && new URLSearchParams(location.search).has("gift"))
    void ready.then(() => panel.showModal());
  el("publicGiftForm").onsubmit = async (e) => {
    e.preventDefault();
    const button = el("publicGiftForm").querySelector("button")!;
    button.disabled = true;
    try {
      await ready;
      const r = await fetch("/api/demo/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: Number(el<HTMLSelectElement>("publicTeam").value),
          username: el<HTMLInputElement>("publicUsername").value,
          giftName: el<HTMLSelectElement>("publicGift").value,
          quantity: Number(el<HTMLInputElement>("publicQuantity").value),
          eventId: crypto.randomUUID(),
        }),
      });
      const p = await r.json();
      if (!r.ok) throw Error(p.error);
      el("publicGiftStatus").textContent =
        `SIMULATED · ${p.queued ?? 0} units queued · FIFO ${p.sequenceStart ?? "duplicate"} · no LIVE rewards`;
    } catch (error) {
      el("publicGiftStatus").textContent = String(error);
    } finally {
      button.disabled = false;
    }
  };
  el("connectLive").onclick = () => {
    if (!api.isOwner()) {
      location.href = "/owner/login";
      return;
    }
    if (api.demoMode) {
      location.href = "/3d/?admin=1&live=1";
      return;
    }
    live.showModal();
  };
  el("quickLiveConnect").onsubmit = (e) => {
    e.preventDefault();
    el("liveConnectionStatus").textContent = "Connecting…";
    void api.control("connect", {
      username: el<HTMLInputElement>("quickLiveName").value.trim(),
    });
  };
  el("quickDisconnect").onclick = () => void api.control("demo");
  el("quickReconnect").onclick = () => void api.control("reconnect");
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-battle]",
  ))
    button.onclick = () => void api.control(button.dataset.battle!);
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-close]",
  ))
    button.onclick = () => el<HTMLDialogElement>(button.dataset.close!).close();
  for (const d of [panel, live])
    d.addEventListener("click", (e) => {
      const b = d.getBoundingClientRect();
      if (
        e.target === d &&
        (e.clientX < b.left ||
          e.clientX > b.right ||
          e.clientY < b.top ||
          e.clientY > b.bottom)
      )
        d.close();
    });
  return {
    state(s: BattleState) {
      el("publicQueue").textContent =
        `${api.demoMode ? "PUBLIC DEMO · simulated" : "Production view"} · Pending: ${s.summonQueue?.pending ?? 0}`;
      const c = s.liveConnection;
      if (c) {
        el<HTMLButtonElement>("quickReconnect").disabled = !c.username;
        el("liveConnectionStatus").textContent =
          `${c.state.toUpperCase()} · ${c.username || "no stream"} · ${c.message}`;
        el("liveDiagnostic").textContent = c.hint;
      }
      for (const b of document.querySelectorAll<HTMLButtonElement>(
        "[data-battle]",
      )) {
        const a = b.dataset.battle!,
          phase = s.roundState.phase;
        b.disabled =
          a === "startBattle"
            ? !["ready", "stopped"].includes(phase)
            : a === "resumeBattle"
              ? !s.paused
              : a === "pauseBattle"
                ? s.paused || ["stopped", "ready", "results"].includes(phase)
                : a === "stopBattle"
                  ? phase === "stopped"
                  : false;
      }
    },
  };
}
