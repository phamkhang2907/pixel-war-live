import type { HudState } from "./hud";
import { worldX } from "./state";
const sounds = [
  "sword",
  "arrow-shot",
  "arrow-impact",
  "spell",
  "magic-impact",
  "giant-step",
  "giant-attack",
  "castle-hit",
  "death",
  "gift",
  "special",
  "victory",
  "defeat",
  "countdown",
  "next-round",
  "music",
] as const;
type Sound = (typeof sounds)[number];
export class BattleAudio {
  private context?: AudioContext;
  private sfx?: GainNode;
  private music?: GainNode;
  private loop?: AudioBufferSourceNode;
  private raw = new Map<Sound, ArrayBuffer>();
  private buffers = new Map<Sound, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private cooldown = new Map<Sound, number>();
  private effectSeen = new Set<number>();
  private previous = new Map<number, { hp: number; last: number }>();
  private round = "";
  private lastResult = "";
  private lastNotice = "";
  private castles = [10000, 10000];
  private phase = "";
  private count = -1;
  private ready: Promise<void>;
  private enabled = false;
  private muted = false;
  private sfxVolume = 0.65;
  private musicVolume = 0;
  private favorite = -1;
  private played = 0;
  private dropped = 0;
  constructor() {
    this.ready = Promise.all(
      sounds.map(async (name) => {
        const r = await fetch("/assets/audio/" + name + ".wav");
        if (!r.ok) throw Error("Missing audio " + name);
        this.raw.set(name, await r.arrayBuffer());
      }),
    ).then(() => {});
    void this.ready.catch(() => {
      document.getElementById("audioStatus")!.textContent =
        "Audio assets could not load. Game remains playable.";
    });
    const toggle = document.getElementById("soundToggle")!;
    toggle.onclick = () => {
      void this.toggle();
    };
    for (const [id, key] of [
      ["sfxVolume", "sfxVolume"],
      ["musicVolume", "musicVolume"],
    ] as const) {
      const input = document.getElementById(id) as HTMLInputElement;
      input.oninput = () => {
        this[key] = Number(input.value);
        this.mix();
        if (this.enabled) this.startMusic();
      };
    }
    (document.getElementById("audioTeam") as HTMLSelectElement).onchange = (
      e,
    ) => (this.favorite = Number((e.target as HTMLSelectElement).value));
    document.addEventListener("visibilitychange", this.visibility);
  }
  private visibility = () => {
    if (document.hidden) {
      for (const voice of this.voices) voice.stop();
      this.loop?.stop();
      this.loop = undefined;
    } else if (this.enabled && !this.muted) {
      this.startMusic();
    }
  };
  private async toggle() {
    const button = document.getElementById("soundToggle")!;
    try {
      if (!this.context) {
        const Constructor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.context = new Constructor();
        this.sfx = this.context.createGain();
        this.music = this.context.createGain();
        this.sfx.connect(this.context.destination);
        this.music.connect(this.context.destination);
      }
      // Invoked synchronously from a tap before awaiting network/decode (iPad Safari).
      await this.context.resume();
      if (!this.enabled) {
        await this.ready;
        await Promise.all(
          [...this.raw].map(async ([name, data]) =>
            this.buffers.set(
              name,
              await this.context!.decodeAudioData(data.slice(0)),
            ),
          ),
        );
        this.raw.clear();
        this.enabled = true;
        this.muted = false;
      } else this.muted = !this.muted;
      this.mix();
      this.startMusic();
      button.textContent = this.muted ? "Unmute" : "Mute";
      button.setAttribute("aria-pressed", String(!this.muted));
      document.getElementById("audioStatus")!.textContent = this.muted
        ? "Muted"
        : "Sound enabled after your tap";
      if (!this.muted) this.play("gift", 0.5);
    } catch (error) {
      document.getElementById("audioStatus")!.textContent =
        "Tap again to enable audio. " + String(error);
    }
  }
  private mix() {
    if (this.sfx) this.sfx.gain.value = this.muted ? 0 : this.sfxVolume;
    if (this.music)
      this.music.gain.value = this.muted ? 0 : this.musicVolume * 0.35;
  }
  private startMusic() {
    if (
      this.loop ||
      !this.context ||
      !this.enabled ||
      document.hidden ||
      !this.buffers.has("music")
    )
      return;
    this.loop = this.context.createBufferSource();
    this.loop.buffer = this.buffers.get("music")!;
    this.loop.loop = true;
    this.loop.connect(this.music!);
    this.loop.start();
  }
  private play(name: Sound, volume = 1) {
    const ctx = this.context;
    if (
      !this.enabled ||
      this.muted ||
      !ctx ||
      ctx.state !== "running" ||
      document.hidden
    )
      return;
    const now = ctx.currentTime;
    if (
      this.voices.size >= 12 ||
      now - (this.cooldown.get(name) ?? -10) < 0.08
    ) {
      this.dropped++;
      return;
    }
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    this.cooldown.set(name, now);
    const source = ctx.createBufferSource(),
      gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = Math.min(1, volume);
    source.connect(gain);
    gain.connect(this.sfx!);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    this.played++;
  }
  update(state: HudState, listenerX: number) {
    if (this.round !== state.roundState.id) {
      if (this.round) this.play("next-round");
      this.round = state.roundState.id;
      this.previous.clear();
      this.effectSeen.clear();
      this.castles = [...state.castles];
      this.lastNotice = "";
    }
    const result = state.roundState.result;
    if (
      result &&
      !result.aborted &&
      ["results", "countdown"].includes(state.roundState.phase)
    ) {
      if (this.lastResult !== result.id) {
        this.lastResult = result.id;
        this.play(
          this.favorite >= 0 &&
            result.winner !== null &&
            this.favorite !== result.winner
            ? "defeat"
            : "victory",
        );
      }
      const count = Math.ceil(state.roundState.phaseRemaining);
      if (count !== this.count && count <= 3 && count > 0)
        this.play("countdown", 0.45);
      this.count = count;
    }
    const notice = state.events[0];
    if (notice) {
      const key = String(notice.at) + notice.name + notice.type;
      if (key !== this.lastNotice) {
        this.lastNotice = key;
        if (
          (state.serverNow ?? Date.now()) - notice.at < 1500 &&
          notice.kind === "gift"
        )
          this.play(notice.type === "boss" ? "special" : "gift", 0.65);
      }
    }
    for (let team = 0; team < 2; team++) {
      if (state.castles[team] < this.castles[team])
        this.play("castle-hit", 0.6);
      this.castles[team] = state.castles[team];
    }
    const active =
      ["combat", "final"].includes(state.roundState.phase) && !state.paused;
    let budget = 4;
    for (const effect of state.effects ?? []) {
      if (this.effectSeen.has(effect.id)) continue;
      this.effectSeen.add(effect.id);
      if (this.effectSeen.size > 1000)
        this.effectSeen.delete(this.effectSeen.values().next().value!);
      if (!active || budget <= 0) continue;
      const volume = 0.6 / (1 + Math.abs(worldX(effect.x) - listenerX) * 0.055);
      if (effect.type === "hit" || effect.type === "block") {
        this.play(
          effect.dead
            ? "death"
            : effect.sourceKind === "arrow" || effect.sourceKind === "rain"
              ? "arrow-impact"
              : effect.sourceKind === "fireball"
                ? "magic-impact"
                : "sword",
          volume,
        );
        budget--;
      } else if (effect.type === "stomp") {
        this.play("giant-attack", volume);
        budget--;
      }
    }
    for (const u of state.units) {
      const old = this.previous.get(u.id),
        volume = 0.65 / (1 + Math.abs(worldX(u.x) - listenerX) * 0.055);
      let last = old?.last ?? -100;
      if (active && budget > 0) {
        if (old && old.hp > 0 && u.hp <= 0) {
          this.play("death", volume * 0.5);
          budget--;
        } else if (old && u.hp < old.hp) {
          this.play(
            u.type === "archer"
              ? "arrow-impact"
              : u.type === "mage"
                ? "magic-impact"
                : "sword",
            volume,
          );
          budget--;
        }
        if (
          u.hp > 0 &&
          u.state === "attack" &&
          state.time - last > (u.type === "boss" ? 1.8 : 0.9) &&
          budget > 0
        ) {
          this.play(
            u.type === "archer"
              ? "arrow-shot"
              : u.type === "mage"
                ? "spell"
                : u.type === "boss"
                  ? "giant-attack"
                  : "sword",
            volume,
          );
          last = state.time;
          budget--;
        } else if (
          u.hp > 0 &&
          u.type === "boss" &&
          /run|walk/.test(u.state) &&
          state.time - last > 1.2 &&
          budget > 0
        ) {
          this.play("giant-step", volume);
          last = state.time;
          budget--;
        }
      }
      this.previous.set(u.id, { hp: u.hp, last });
    }
    const ids = new Set(state.units.map((u) => u.id));
    for (const id of this.previous.keys())
      if (!ids.has(id)) this.previous.delete(id);
    this.phase = state.roundState.phase;
  }
  diagnostics() {
    return {
      enabled: this.enabled,
      muted: this.muted,
      context: this.context?.state ?? "locked",
      sfxVolume: this.sfxVolume,
      musicVolume: this.musicVolume,
      activeVoices: this.voices.size,
      maxVoices: 12,
      played: this.played,
      dropped: this.dropped,
      buffers: this.buffers.size,
    };
  }
  dispose() {
    document.removeEventListener("visibilitychange", this.visibility);
    for (const source of this.voices) source.stop();
    this.loop?.stop();
    void this.context?.close();
  }
}
