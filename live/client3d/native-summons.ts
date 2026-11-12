import type { KenneyParticles } from "./kenney-particles";
import { terrainHeight } from "./grass-material";
import * as T from "three";
import { TYPES } from "../src/characters.js";
import {
  worldX,
  worldZ,
  type BattleState,
  type GiftNotice,
  type SummonBatch,
} from "./state";
import manifest from "../public/assets/ui/kit/manifest.json";
import "./native-summons.css";
type Toast = {
  key: string;
  data: GiftNotice;
  quantity: number;
  born: number;
  node: HTMLElement;
};
type Wave = {
  key: string;
  data: SummonBatch;
  count: number;
  born: number;
  life: number;
  radius: number;
  node: HTMLElement;
};
const make = (tag: string, cls: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  return n;
};
const view = manifest.views["rare-notice"],
  art = manifest.assets.find((a) => a.file === view.source)!;
const frame = () =>
  '<svg class="native-fantasy-frame" viewBox="' +
  view.viewport.join(" ") +
  '" preserveAspectRatio="none" aria-hidden="true"><image href="/assets/ui/kit/' +
  view.source +
  '" width="' +
  art.width +
  '" height="' +
  art.height +
  '"/></svg>';
const imageURL = (url?: string) => {
  if (!url || /\.(mp4|webm|mov)([?#]|$)/i.test(url)) return "";
  try {
    const u = new URL(url, location.origin);
    return (u.origin === location.origin &&
      u.pathname.startsWith("/assets/")) ||
      u.protocol === "https:"
      ? u.href
      : "";
  } catch {
    return "";
  }
};
export class NativeSummons {
  readonly group = new T.Group();
  private stack = make("div", "native-gift-stack");
  private labels = make("div", "summon-nameplate-layer");
  private seenGifts = new Set<string>();
  private seenWaves = new Set<string>();
  private pending: GiftNotice[] = [];
  private toasts: Toast[] = [];
  private waves: Wave[] = [];
  private readyWaves: { data: SummonBatch; expiresAt: number }[] = [];
  private toastPool: HTMLElement[] = [];
  private labelPool: HTMLElement[] = [];
  private circleGeometry = new T.RingGeometry(0.88, 1, 40);
  private particleGeometry = new T.IcosahedronGeometry(0.12, 0);
  private material = new T.MeshBasicMaterial({
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
    side: T.DoubleSide,
  });
  private circles = new T.InstancedMesh(this.circleGeometry, this.material, 16);
  private motes = new T.InstancedMesh(
    this.particleGeometry,
    this.material,
    240,
  );
  private matrix = new T.Matrix4();
  private quaternion = new T.Quaternion();
  private scale = new T.Vector3();
  private position = new T.Vector3();
  private color = new T.Color();
  private now = 0;
  private round = "";
  private received = 0;
  private particleBudget = 240;
  private combined = 0;
  private lastOrigins: number[][] = [];
  constructor(
    private stage: HTMLElement,
    private particles?: KenneyParticles,
  ) {
    this.stack.id = "nativeGiftNotices";
    this.stack.setAttribute("aria-live", "polite");
    this.labels.id = "summonNameplates";
    stage.append(this.stack, this.labels);
    this.group.name = "Native summon portals: pooled geometry, no video";
    for (const mesh of [this.circles, this.motes]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.group.add(mesh);
    }
    for (let k = 0; k < 8; k++) {
      const n = make("div", "summon-nameplate");
      n.hidden = true;
      this.labels.append(n);
      this.labelPool.push(n);
    }
    for (let k = 0; k < 2; k++) {
      const n = make("article", "native-gift-toast");
      n.hidden = true;
      this.stack.append(n);
      this.toastPool.push(n);
    }
  }
  setParticleBudget(cap: number) {
    this.particleBudget = Math.max(0, Math.min(240, cap));
    this.motes.count = Math.min(this.motes.count, this.particleBudget);
  }
  private avatar(
    parent: HTMLElement,
    url: string | undefined,
    name: string,
    cls = "native-avatar",
  ) {
    const avatar = make("span", cls);
    avatar.textContent = name.slice(0, 2).toUpperCase();
    const src = imageURL(url);
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = name + " avatar";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.remove();
      avatar.append(img);
    }
    parent.append(avatar);
  }
  private drawToast(toast: Toast) {
    const { node, data } = toast;
    node.replaceChildren();
    node.insertAdjacentHTML("afterbegin", frame());
    node.dataset.team =
      data.userId === "visual-summary" ? "summary" : String(data.team);
    node.dataset.viewer = data.name;
    node.dataset.gift = data.giftName || "Gift";
    const content = make("div", "native-gift-content");
    this.avatar(content, data.avatar, data.name);
    const text = make("span", "native-gift-text"),
      name = make("strong", "native-viewer"),
      detail = make("small", "native-gift-label");
    name.textContent = data.name;
    name.title = data.name;
    detail.textContent =
      (data.giftName ||
        (data.kind === "join"
          ? "Joined kingdom"
          : data.kind === "raid"
            ? "Bombing raid incoming"
            : data.kind === "heartResult"
              ? "HEART WAR phase complete"
              : "Gift")) +
      " · " +
      (data.userId === "visual-summary"
        ? "gift storm summary"
        : data.team === 0
          ? "RED"
          : "BLUE");
    text.append(name, detail);
    content.append(text);
    const icon = make("span", "native-gift-icon"),
      url = imageURL(data.giftIcon);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = (data.giftName || "Gift") + " icon";
      img.onerror = () => {
        img.remove();
        icon.textContent = "✦";
      };
      icon.append(img);
    } else
      icon.textContent = /lion/i.test(data.giftName || "")
        ? "🦁"
        : /dragon/i.test(data.giftName || "")
          ? "🐉"
          : /rose/i.test(data.giftName || "")
            ? "🌹"
            : "✦";
    const quantity = make("b", "native-gift-quantity");
    quantity.textContent = data.kind === "gift" ? "×" + toast.quantity : "✦";
    content.append(icon, quantity);
    node.append(content);
    node.hidden = false;
    node.style.opacity = "1";
  }
  sync(state: BattleState) {
    this.now = performance.now() / 1000;
    if (this.round !== state.roundState.id) {
      this.round = state.roundState.id;
      for (const toast of this.toasts) {
        toast.node.hidden = true;
        this.toastPool.push(toast.node);
      }
      this.toasts = [];
      this.pending = [];
      for (const wave of this.waves) {
        wave.node.hidden = true;
        this.labelPool.push(wave.node);
      }
      this.waves = [];
      this.readyWaves = [];
      this.seenGifts.clear();
      this.seenWaves.clear();
      this.circles.count = 0;
      this.motes.count = 0;
      this.lastOrigins = [];
    }
    for (const e of [...(state.events ?? [])].reverse()) {
      if (!["gift", "join", "raid", "heartResult"].includes(e.kind)) continue;
      const key = state.roundState.id + ":" + e.id;
      if (this.seenGifts.has(key)) continue;
      this.seenGifts.add(key);
      if (this.seenGifts.size > 512)
        this.seenGifts.delete(this.seenGifts.values().next().value!);
      const age = Math.max(0, (state.serverNow ?? Date.now()) - e.at);
      if (age >= 10000) continue;
      this.received++;
      const identity = (e.userId || e.name) + ":" + e.team + ":" + e.giftName,
        active = this.toasts.find(
          (t) => t.key === identity && this.now - t.born < 1.8,
        ),
        queued = this.pending.find(
          (t) =>
            (t.userId || t.name) + ":" + t.team + ":" + t.giftName === identity,
        );
      if (active) {
        active.quantity += e.giftQuantity ?? 1;
        active.node.querySelector(".native-gift-quantity")!.textContent =
          "×" + active.quantity;
        active.node.querySelector(".native-viewer")!.textContent = e.name;
        active.node.dataset.viewer = e.name;
        this.combined++;
      } else if (queued) {
        queued.giftQuantity =
          (queued.giftQuantity ?? 1) + (e.giftQuantity ?? 1);
        this.combined++;
      } else if (this.pending.length < 24) this.pending.push({ ...e });
      else {
        const last = this.pending.at(-1)!;
        last.name = "Gift storm";
        last.userId = "visual-summary";
        last.giftName = "More gifts";
        last.giftQuantity = (last.giftQuantity ?? 1) + (e.giftQuantity ?? 1);
        last.avatar = "";
        last.giftIcon = "";
        this.combined++;
      }
    }
    for (const batch of state.summons ?? []) {
      if (batch.roundId !== this.round) continue;
      const key = state.roundState.id + ":" + batch.id;
      if (this.seenWaves.has(key)) continue;
      this.seenWaves.add(key);
      if (this.seenWaves.size > 512)
        this.seenWaves.delete(this.seenWaves.values().next().value!);
      const age = Math.max(0, (state.serverNow ?? Date.now()) - batch.at);
      if (age < 5000)
        this.readyWaves.push({
          data: batch,
          expiresAt: this.now + (5000 - age) / 1000,
        });
    }
    this.readyWaves = this.readyWaves.slice(-64);
  }
  private showWave(data: SummonBatch) {
    const existing = this.waves.find(
      (w) =>
        w.data.requestId === data.requestId &&
        w.data.cohort === data.cohort &&
        this.now - w.born < 1.2,
    );
    if (existing) {
      const n = existing.count + data.count;
      existing.data = {
        ...data,
        firstId: Math.min(existing.data.firstId, data.firstId),
        lastId: Math.max(existing.data.lastId, data.lastId),
        x: (existing.data.x * existing.count + data.x * data.count) / n,
        y: (existing.data.y * existing.count + data.y * data.count) / n,
      };
      existing.count = n;
      this.fillLabel(existing);
      return;
    }
    const dragonWave = /Dragon$/.test(data.type);
    const oldDragon =
      dragonWave &&
      this.waves.filter((w) => /Dragon$/.test(w.data.type)).length >= 2
        ? this.waves.find((w) => /Dragon$/.test(w.data.type))
        : undefined;
    const replaced =
      oldDragon ||
      (dragonWave && this.waves.length >= 8
        ? this.waves.find((w) => !/Dragon$/.test(w.data.type))
        : undefined);
    if (replaced) {
      replaced.node.hidden = true;
      this.labelPool.push(replaced.node);
      this.waves.splice(this.waves.indexOf(replaced), 1);
    }
    if (this.waves.length >= 8) {
      const candidate = this.waves.find(
        (w) => w.data.requestId === data.requestId,
      );
      if (candidate) {
        candidate.count += data.count;
        this.fillLabel(candidate);
      }
      return;
    }
    const node = this.labelPool.pop();
    if (!node) return;
    const dragon = /Dragon$/.test(data.type),
      wave: Wave = {
        key: this.round + ":" + data.id,
        data,
        count: data.count,
        born: this.now,
        life: dragon ? 9 : 1.7,
        radius: dragon
          ? 5.2
          : Math.min(3.2, Math.max(1, Math.sqrt(data.count) * 0.5)),
        node,
      };
    this.waves.push(wave);
    const at = new T.Vector3(
      worldX(data.x),
      terrainHeight(worldX(data.x), worldZ(data.y)) + (dragon ? 4 : 0.2),
      worldZ(data.y),
    );
    const element =
      data.type === "frostDragon"
        ? 0x58dfff
        : data.type === "fireDragon"
          ? 0xff8233
          : data.team === 0
            ? 0xffc36b
            : 0x62dcff;
    this.particles?.emit("magic_01", at, element, dragon ? 20 : 10, {
      size: dragon ? 1.4 : 0.55,
      spread: wave.radius * 0.6,
      life: 1.3,
    });
    if (dragon)
      this.particles?.emit(
        "smoke_04",
        at,
        data.type === "frostDragon" ? 0x779bcb : 0x7933a1,
        20,
        { size: 4, spread: 2, life: 1.5 },
      );
    this.fillLabel(wave);
  }
  private fillLabel(wave: Wave) {
    const { node, data } = wave;
    node.replaceChildren();
    node.dataset.team = String(data.team);
    node.dataset.viewer = data.name;
    this.avatar(node, data.avatar, data.name, "native-avatar plate-avatar");
    const text = make("span", "plate-copy"),
      name = make("strong", "plate-name"),
      detail = make("small", "plate-unit");
    name.textContent = data.name;
    detail.textContent =
      (TYPES[data.type]?.name || data.type) + " ×" + wave.count;
    text.append(name, detail);
    node.append(text);
    node.hidden = false;
  }
  update(
    state: BattleState | null,
    dt: number,
    camera: T.Camera,
    modelsReady: boolean,
  ) {
    this.now = performance.now() / 1000;
    // These are cosmetic deadlines, independent of simulation pause/speed.
    // Hidden tabs and slow model loads must not replay old summons on return.
    this.readyWaves = this.readyWaves.filter((e) => e.expiresAt > this.now);
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i],
        age = this.now - t.born;
      if (age > 2.8) {
        t.node.hidden = true;
        this.toastPool.push(t.node);
        this.toasts.splice(i, 1);
      } else t.node.style.opacity = String(age > 2.35 ? (2.8 - age) / 0.45 : 1);
    }
    while (this.pending.length && this.toasts.length < 2) {
      const data = this.pending.shift()!,
        node = this.toastPool.pop()!;
      const toast = {
        key: (data.userId || data.name) + ":" + data.team + ":" + data.giftName,
        data,
        quantity: data.giftQuantity ?? 1,
        born: this.now,
        node,
      };
      this.drawToast(toast);
      this.toasts.push(toast);
    }
    if (modelsReady) {
      for (const b of this.readyWaves) this.showWave(b.data);
      this.readyWaves = [];
    }
    for (let k = this.waves.length - 1; k >= 0; k--)
      if (this.now - this.waves[k].born > this.waves[k].life) {
        this.waves[k].node.hidden = true;
        this.labelPool.push(this.waves[k].node);
        this.waves.splice(k, 1);
      }
    const width = this.stage.clientWidth,
      height = this.stage.clientHeight;
    let ringCount = 0,
      particleCount = 0;
    let visibleLabels = 0;
    this.lastOrigins = [];
    for (const wave of this.waves) {
      const age = this.now - wave.born,
        p = age / wave.life,
        dragon = /Dragon$/.test(wave.data.type),
        fade = Math.max(
          0,
          Math.min(1, age * 5, (Math.min(wave.life, 2) - age) * 2),
        );
      const x = worldX(wave.data.x),
        z = worldZ(wave.data.y);
      this.color
        .set(wave.data.team === 0 ? 0xff483e : 0x328bff)
        .multiplyScalar(fade * 3);
      this.position.set(x, terrainHeight(x, z) + 0.06, z);
      this.scale.setScalar(wave.radius * (0.85 + 0.15 * Math.sin(age * 6)));
      this.quaternion.setFromEuler(new T.Euler(-Math.PI / 2, 0, age * 0.6));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.circles.setMatrixAt(ringCount, this.matrix);
      this.circles.setColorAt(ringCount++, this.color);
      this.position.y = terrainHeight(x, z) + (dragon ? 5.5 : 0.08);
      this.scale.setScalar(wave.radius * (0.5 + p * 0.65));
      this.quaternion.setFromEuler(
        new T.Euler(dragon ? 0 : -Math.PI / 2, dragon ? Math.PI / 2 : 0, -age),
      );
      if (!dragon)
        this.color
          .set(wave.data.team === 0 ? 0xffd46c : 0x62efff)
          .multiplyScalar(fade * 3);
      if (dragon)
        this.color
          .set(wave.data.type === "frostDragon" ? 0x66dcff : 0xff6235)
          .multiplyScalar(fade * 3);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.circles.setMatrixAt(ringCount, this.matrix);
      this.circles.setColorAt(ringCount++, this.color);
      this.lastOrigins.push([x, this.position.y, z]);
      const budget = dragon ? 40 : 20;
      for (let j = 0; j < budget && particleCount < this.particleBudget; j++) {
        const angle = j * 2.39996 + age * (dragon ? 1.8 : 1),
          radius = wave.radius * (0.35 + (j % 7) / 10);
        this.position.set(
          x + Math.cos(angle) * radius,
          terrainHeight(x, z) +
            (dragon ? 1.3 : 0.2) +
            ((age * 1.8 + j * 0.13) % 2) * (dragon ? 2 : 1),
          z + Math.sin(angle) * radius,
        );
        this.scale.setScalar((0.7 + (j % 3) * 0.3) * fade);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.motes.setMatrixAt(particleCount, this.matrix);
        this.motes.setColorAt(particleCount++, this.color);
      }
      let labelX = x,
        labelZ = z,
        living = 0,
        sumX = 0,
        sumY = 0;
      for (const u of state?.units ?? [])
        if (u.id >= wave.data.firstId && u.id <= wave.data.lastId && u.hp > 0) {
          sumX += u.x;
          sumY += u.y;
          living++;
        }
      if (living) {
        labelX = worldX(sumX / living);
        labelZ = worldZ(sumY / living);
      }
      this.position
        .set(
          labelX,
          terrainHeight(labelX, labelZ) + (dragon ? 12 : 3.8),
          labelZ,
        )
        .project(camera);
      const visible =
        visibleLabels < 4 &&
        living > 0 &&
        Math.abs(this.position.x) < 0.98 &&
        this.position.y < 0.28 &&
        this.position.y > -0.8 &&
        Math.abs(this.position.z) < 1;
      wave.node.hidden = !visible;
      if (visible) {
        visibleLabels++;
        wave.node.style.left = (this.position.x * 0.5 + 0.5) * width + "px";
        wave.node.style.top =
          (-this.position.y * 0.5 + 0.5) * height - p * 24 + "px";
        wave.node.style.opacity = String(
          dragon ? Math.min(1, age * 5, (wave.life - age) * 3) : fade,
        );
      }
    }
    this.circles.count = ringCount;
    this.motes.count = particleCount;
    for (const m of [this.circles, this.motes]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  diagnostics() {
    return {
      native: true,
      videos: 0,
      activeWaves: this.waves.length,
      maxWaves: 8,
      maxNameplates: 4,
      maxDragonPortals: 2,
      dragonPortals: this.waves.filter((w) => /Dragon$/.test(w.data.type))
        .length,
      particles: this.motes.count,
      maxParticles: this.particleBudget,
      circles: this.circles.count,
      activeToasts: this.toasts.length,
      queuedToasts: this.pending.length,
      waitingWaves: this.readyWaves.length,
      receivedNotifications: this.received,
      combinedNotifications: this.combined,
      visibleNameplates: this.waves
        .filter((w) => !w.node.hidden)
        .map((w) => ({
          name: w.data.name,
          type: w.data.type,
          count: w.count,
          team: w.data.team,
        })),
      origins: this.lastOrigins,
    };
  }
  dispose() {
    this.group.removeFromParent();
    this.circles.dispose();
    this.motes.dispose();
    this.circleGeometry.dispose();
    this.particleGeometry.dispose();
    this.material.dispose();
    this.stack.remove();
    this.labels.remove();
  }
}
