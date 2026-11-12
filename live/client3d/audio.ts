import type { HudState } from "./hud";
import { worldX } from "./state";
import { SOUND_FILES } from "../src/sounds.js";
type Sound = keyof typeof SOUND_FILES;
const sounds = Object.keys(SOUND_FILES) as Sound[];
export type MusicTrack = {
  id: string;
  name: string;
  url: string;
  mime: string;
  bytes: number;
  uploadedAt: string;
};
export class BattleAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private compressor?: DynamicsCompressorNode;
  private slots: {
    gain: GainNode;
    pan: StereoPannerNode;
    source?: AudioBufferSourceNode;
    name?: Sound;
    priority: number;
  }[] = [];
  private masterVolume = 1;
  private unlocking = false;
  private duckUntil = 0;
  private cues = new Set<string>();
  private hornRound = "";
  private latest?: HudState;
  private crowdAt = 0;
  private wingsAt = 0;
  private playedSounds: Partial<Record<Sound, number>> = {};
  private sfx?: GainNode;
  private music?: GainNode;
  private loop?: AudioBufferSourceNode;
  private track: MusicTrack | null = null;
  private trackEpoch = 0;
  private stream?: HTMLAudioElement;
  private streamNode?: MediaElementAudioSourceNode;
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
    const epoch = this.trackEpoch;
    void fetch("/api/music", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { track: null }))
      .then((p) => {
        if (this.trackEpoch === epoch) this.setTrack(p.track);
      })
      .catch(() => {});
    this.ready = Promise.all(
      sounds.map(async (name) => {
        const r = await fetch("/assets/audio/" + SOUND_FILES[name]);
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
      ["masterVolume", "masterVolume"],
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
      this.stream?.pause();
    } else if (this.enabled && !this.muted) {
      void this.context?.resume().catch(() => {});
      this.startMusic();
    }
  };
  private async toggle() {
    if (this.unlocking) return;
    this.unlocking = true;
    const button = document.getElementById("soundToggle")!;
    try {
      if (!this.context) {
        const Constructor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.context = new Constructor();
        this.master = this.context.createGain();
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -12;
        this.compressor.ratio.value = 5;
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 256;
        this.master.connect(this.compressor);
        this.compressor.connect(this.analyser);
        this.analyser.connect(this.context.destination);
        this.sfx = this.context.createGain();
        this.music = this.context.createGain();
        this.sfx.connect(this.master);
        this.music.connect(this.master);
        this.slots = Array.from({ length: 12 }, () => {
          const gain = this.context!.createGain(),
            pan = this.context!.createStereoPanner();
          gain.connect(pan);
          pan.connect(this.sfx!);
          return { gain, pan, priority: 0 };
        });
      }
      this.mix();
      // Streaming play is requested inside the original gesture, before async decode.
      if (this.track && this.musicVolume > 0)
        this.prepareStream()
          ?.play()
          .catch((error) => {});
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
      if (!this.muted) {
        this.play("gift", 0.5);
        if (this.latest) this.roundCue(this.latest);
      }
    } catch (error) {
      document.getElementById("audioStatus")!.textContent =
        "Tap again to enable audio. " + String(error);
    } finally {
      this.unlocking = false;
    }
  }
  private mix() {
    if (this.master)
      this.master.gain.value = this.muted ? 0 : this.masterVolume;
    if (this.sfx) this.sfx.gain.value = this.muted ? 0 : this.sfxVolume;
    if (this.music)
      this.music.gain.value = this.muted
        ? 0
        : this.musicVolume *
          0.35 *
          ((this.context?.currentTime ?? 0) < this.duckUntil ? 0.25 : 1);
  }
  setTrack(track: MusicTrack | null) {
    if (this.track?.id === track?.id) return;
    this.trackEpoch++;
    this.track = track;
    this.stream?.pause();
    this.loop?.stop();
    this.loop = undefined;
    if (this.stream) {
      this.stream.removeAttribute("src");
      this.stream.load();
    }
    if (this.enabled && !this.muted) this.startMusic();
  }
  previewMusic() {
    this.musicVolume = Math.max(0.35, this.musicVolume);
    (document.getElementById("musicVolume") as HTMLInputElement).value = String(
      this.musicVolume,
    );
    this.mix();
    if (!this.enabled || this.muted) void this.toggle();
    else {
      // Safari can suspend/interrupt an already unlocked context after backgrounding.
      // Request resume inside this fresh tap as well as restarting the media stream.
      void this.context?.resume().catch(() => {});
      this.startMusic();
    }
  }
  private prepareStream() {
    if (!this.track || !this.context || !this.music) return;
    if (!this.stream) {
      this.stream = new Audio();
      this.stream.preload = "metadata";
      this.stream.loop = true;
      this.stream.onerror = () => {
        document.getElementById("audioStatus")!.textContent =
          "Không phát được tệp này trên trình duyệt. Thử MP3, WAV hoặc M4A.";
      };
      this.streamNode = this.context.createMediaElementSource(this.stream);
      this.streamNode.connect(this.music);
    }
    if (this.stream.getAttribute("src") !== this.track.url) {
      this.stream.src = this.track.url;
      this.stream.load();
    }
    return this.stream;
  }
  private startMusic() {
    if (this.track) {
      if (
        this.enabled &&
        !this.muted &&
        this.musicVolume > 0 &&
        !document.hidden
      ) {
        this.prepareStream()
          ?.play()
          .catch((error) => {
            document.getElementById("audioStatus")!.textContent =
              error?.name === "NotSupportedError"
                ? "Định dạng này không phát được trên trình duyệt. Thử MP3, WAV hoặc M4A."
                : "Chạm Nghe thử hoặc bật âm thanh để phát nhạc trên Safari.";
          });
      } else this.stream?.pause();
      return;
    }

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
  private stopEffects() {
    for (const slot of this.slots) {
      const source = slot.source;
      slot.source = undefined;
      if (source) {
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
    }
    this.voices.clear();
    this.cooldown.clear();
    this.duckUntil = 0;
    this.mix();
  }
  private roundCue(state: HudState) {
    const elapsed = state.roundState.elapsed ?? state.time;
    if (!this.enabled || state.paused || this.hornRound === state.roundState.id)
      return;
    if (["combat", "final"].includes(state.roundState.phase) && elapsed <= 2) {
      this.hornRound = state.roundState.id;
      this.play("war-horn", 1, 0, 3);
    }
  }
  private play(name: Sound, volume = 1, pan = 0, priority = 0) {
    const ctx = this.context;
    if (
      !this.enabled ||
      this.muted ||
      !ctx ||
      ctx.state !== "running" ||
      document.hidden
    )
      return false;
    const now = ctx.currentTime,
      major = [
        "war-horn",
        "fire-roar",
        "frost-roar",
        "bomb-explosion",
      ].includes(name);
    const gap = major
      ? 0.6
      : name.includes("cry")
        ? 1
        : name === "dragon-wings"
          ? 0.7
          : 0.08;
    if (
      now - (this.cooldown.get(name) ?? -100) < gap ||
      ((major || name.includes("breath") || name === "frost-wind") &&
        this.slots.some((s) => s.source && s.name === name))
    ) {
      this.dropped++;
      return false;
    }
    const buffer = this.buffers.get(name);
    if (!buffer) return false;
    let slot = this.slots.find((s) => !s.source);
    if (!slot && (priority > 0 || major))
      slot = this.slots.find((s) => s.priority === 0);
    if (!slot) {
      this.dropped++;
      return false;
    }
    if (slot.source) {
      const old = slot.source;
      slot.source = undefined;
      this.voices.delete(old);
      try {
        old.stop();
      } catch {}
      old.disconnect();
    }
    if (major) {
      this.duckUntil = Math.max(
        this.duckUntil,
        now + Math.min(3, buffer.duration),
      );
      this.mix();
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = name.includes("cry")
      ? 0.94 + Math.random() * 0.12
      : 1;
    slot.gain.gain.value =
      Math.max(0, Math.min(1.2, volume)) *
      (!major && priority === 0 && now < this.duckUntil ? 0.35 : 1);
    slot.pan.pan.value = Math.max(-1, Math.min(1, pan));
    slot.name = name;
    slot.priority = priority || (major ? 3 : 0);
    slot.source = source;
    source.connect(slot.gain);
    this.voices.add(source);
    const voice = slot;
    source.onended = () => {
      this.voices.delete(source);
      if (voice.source === source) voice.source = undefined;
      source.disconnect();
    };
    this.cooldown.set(name, now);
    source.start();
    this.played++;
    this.playedSounds[name] = (this.playedSounds[name] ?? 0) + 1;
    return true;
  }

  update(state: HudState, listenerX: number) {
    this.latest = state;
    this.mix();
    if (this.round !== state.roundState.id) {
      this.stopEffects();
      this.cues.clear();
      this.hornRound = "";
      this.crowdAt = 0;
      this.wingsAt = 0;
      this.round = state.roundState.id;
      this.previous.clear();
      this.effectSeen.clear();
      this.castles = [...state.castles];
      this.lastNotice = "";
    }
    if (
      this.phase !== state.roundState.phase &&
      ["results", "stopped", "ready"].includes(state.roundState.phase)
    )
      this.stopEffects();
    this.roundCue(state);
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
    if (active && this.enabled) {
      if (state.time - this.crowdAt > 6 && state.units.length > 30) {
        this.crowdAt = state.time;
        const variation = 1 + Math.floor(Math.random() * 3);
        this.play(("red-cry-" + variation) as Sound, 0.3, -0.55);
        this.play(
          ("blue-cry-" + (1 + Math.floor(Math.random() * 3))) as Sound,
          0.3,
          0.55,
        );
        this.play("ambience", 0.16);
      }
      const dragons = state.units.filter((u) => u.flyby && u.hp > 0);
      for (const u of dragons) {
        const key = "roar:" + u.id;
        if (!this.cues.has(key)) {
          this.cues.add(key);
          if (u.flyby!.age < 1.5)
            this.play(
              u.type === "fireDragon" ? "fire-roar" : "frost-roar",
              1,
              Math.max(-0.7, Math.min(0.7, worldX(u.x) / 50)),
              3,
            );
        }
      }
      if (dragons.length && state.time - this.wingsAt > 1.1) {
        this.wingsAt = state.time;
        this.play("dragon-wings", 0.45);
      }
    }
    let budget = 4;
    for (const effect of state.effects ?? []) {
      if (this.effectSeen.has(effect.id)) continue;
      this.effectSeen.add(effect.id);
      if (this.effectSeen.size > 1000)
        this.effectSeen.delete(this.effectSeen.values().next().value!);
      if (!active) continue;
      const volume = 0.6 / (1 + Math.abs(worldX(effect.x) - listenerX) * 0.055);
      if (effect.type === "bombWarning") {
        const key = "raid-warning:" + effect.raidId;
        if (!this.cues.has(key)) {
          this.cues.add(key);
          this.play("bomb-whistle", 0.85, 0, 2);
        }
        continue;
      } else if (effect.type === "bombImpact") {
        this.play(
          "bomb-explosion",
          1,
          Math.max(-0.7, Math.min(0.7, worldX(effect.x) / 50)),
          3,
        );
        continue;
      } else if (effect.type === "dragonBreath") {
        this.play(
          effect.element === "ice" ? "frost-wind" : "fire-breath",
          0.7,
          0,
          2,
        );
        if (effect.element === "ice") this.play("ice-shatter", 0.4, 0, 1);
        continue;
      }
      if (budget <= 0) continue;
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
      musicTrack: this.track
        ? {
            id: this.track.id,
            name: this.track.name,
            paused: this.stream?.paused ?? true,
            currentTime: this.stream?.currentTime ?? 0,
            readyState: this.stream?.readyState ?? 0,
          }
        : null,
      context: this.context?.state ?? "locked",
      sfxVolume: this.sfxVolume,
      musicVolume: this.musicVolume,
      masterVolume: this.masterVolume,
      effectiveMasterGain: this.master?.gain.value ?? 0,
      ducked: (this.context?.currentTime ?? 0) < this.duckUntil,
      playedSounds: { ...this.playedSounds },
      decodedSounds: [...this.buffers.keys()],
      durations: Object.fromEntries(
        [...this.buffers].map(([name, b]) => [name, b.duration]),
      ),
      outputRms: (() => {
        if (!this.analyser) return 0;
        const b = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(b);
        return Math.sqrt(b.reduce((n, v) => n + v * v, 0) / b.length);
      })(),
      activeVoices: this.voices.size,
      maxVoices: 12,
      played: this.played,
      dropped: this.dropped,
      buffers: this.buffers.size,
    };
  }
  dispose() {
    this.stream?.pause();
    this.streamNode?.disconnect();
    this.stream?.removeAttribute("src");
    this.stream?.load();
    document.removeEventListener("visibilitychange", this.visibility);
    for (const source of this.voices) source.stop();
    this.loop?.stop();
    void this.context?.close();
  }
}
