import Phaser from "phaser";
import { io } from "socket.io-client";
const $ = (id) => document.getElementById(id),
  names = {
    sword: "Swordsman",
    archer: "Archer",
    cavalry: "Cavalry",
    mage: "Mage",
    boss: "Boss",
  },
  costs = [1, 5, 20, 50, 100],
  types = Object.keys(names);
let lastFx = 0;
let state = null,
  selected = 0,
  token = sessionStorage.getItem("pw-token") || "",
  sound = false,
  audio = null,
  lastEvent = 0;
const sprites = new Map();
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
if (new URLSearchParams(location.search).has("overlay"))
  document.body.classList.add("overlay");
function toast(message) {
  $("toast").textContent = message;
  $("toast").style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($("toast").style.display = "none"), 3500);
}
async function control(action, data = {}) {
  if (!token) {
    $("setup").showModal();
    toast("Enter the admin token from your server terminal");
    return;
  }
  try {
    const res = await fetch("/api/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ action, ...data }),
    });
    const result = await res.json();
    if (!res.ok) throw Error(result.error);
    return result;
  } catch (e) {
    toast(e.message);
    return null;
  }
}
$("token").value = token;
$("help").onclick = $("settingsNav").onclick = () => $("setup").showModal();
$("unlock").onclick = async () => {
  token = $("token").value.trim();
  try {
    const res = await fetch("/api/config", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw Error("Invalid admin token");
    const config = await res.json();
    sessionStorage.setItem("pw-token", token);
    $("authStatus").textContent = "Controls unlocked for this tab.";
    renderRules(config.rules);
    toast("Controls unlocked");
  } catch (e) {
    toast(e.message);
  }
};
function renderRules(rules) {
  $("rules").innerHTML = rules
    .map(
      (r) =>
        `<div class="rule"><input type="number" min="1" max="100000" value="${r.min}" aria-label="Minimum coins"><select aria-label="Troop type">${types.map((t) => `<option value="${t}" ${r.type === t ? "selected" : ""}>${names[t]}</option>`).join("")}</select><input type="number" min="1" max="50" value="${r.count}" aria-label="Troop quantity"></div>`,
    )
    .join("");
}
renderRules(
  types.map((type, i) => ({ type, min: costs[i], count: [1, 2, 2, 3, 1][i] })),
);
$("saveRules").onclick = async () => {
  const rules = [...$("rules").children].map((row) => ({
    min: Number(row.children[0].value),
    type: row.children[1].value,
    count: Number(row.children[2].value),
  }));
  if (await control("rules", { rules })) toast("Gift mapping saved");
};
$("troops").innerHTML = types
  .map(
    (type, i) =>
      `<div class="troop"><canvas class="sprite-icon" width="32" height="40" data-type="${type}"></canvas><div class="troop-info"><strong>${names[type]}</strong><small>${["Frontline fighter", "Ranged precision", "Fast & powerful", "Area damage", "The kingdom breaker"][i]} <span class="coin">· ${costs[i]} ◈</span></small></div><button data-coins="${costs[i]}" aria-label="Summon ${names[type]}">+</button></div>`,
  )
  .join("");
for (const c of document.querySelectorAll(".sprite-icon")) {
  const im = new Image();
  im.onload = () =>
    c.getContext("2d").drawImage(im, 0, 0, 32, 40, 0, 0, 32, 40);
  im.src = "/assets/red-" + c.dataset.type + ".png";
}
for (const b of document.querySelectorAll("[data-coins]"))
  b.onclick = async () => {
    if (
      await control("troop", {
        team: selected,
        type: types[costs.indexOf(Number(b.dataset.coins))],
        count: 1,
        name: "You",
      })
    )
      toast(`${names[types[costs.indexOf(Number(b.dataset.coins))]]} summoned`);
  };
for (const b of document.querySelectorAll("[data-team]"))
  b.onclick = () => {
    selected = Number(b.dataset.team);
    document
      .querySelectorAll("[data-team]")
      .forEach((x) => x.classList.toggle("selected", x === b));
  };
$("sendGift").onclick = async () => {
  if (
    await control("spawn", {
      team: selected,
      name: $("giftName").value.trim() || "You",
      coins: Number($("giftCoins").value),
      count: Number($("giftCount").value),
    })
  )
    toast("Gift simulated");
};
$("speed").onchange = () =>
  control("speed", { value: Number($("speed").value) });
$("pause").onclick = () => control("pause");
$("reset").onclick = () => control("reset");
$("auto").onclick = () => control("auto");
$("demoToggle").onclick = () => control("demo");
$("burst").onclick = () => control("burst");
$("connect").onclick = async () => {
  $("connect").disabled = true;
  await control("connect", {
    username: $("username").value.trim().replace(/^@/, ""),
  });
  $("connect").disabled = false;
};
$("fullscreen").onclick = () => {
  const el = $("arenaWrap");
  if (el.requestFullscreen) el.requestFullscreen();
  else window.open("/?overlay=1", "_blank");
};
$("sound").onclick = () => {
  sound = !sound;
  if (sound) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  }
  $("sound").style.color = sound ? "#8dd9bc" : "";
  toast(sound ? "Battle sounds on" : "Battle sounds off");
};
class Arena extends Phaser.Scene {
  preload() {
    this.load.image("arrow", "/assets/arrow.png");
    this.load.image("magic", "/assets/magic.png");
    for (const team of ["red", "blue"]) {
      this.load.image(team + "castle", `/assets/${team}-castle.png`);
      for (const type of types)
        this.load.spritesheet(
          team + "-" + type,
          `/assets/${team}-${type}.png`,
          { frameWidth: 32, frameHeight: 40 },
        );
    }
  }
  create() {
    this.makeTerrain();
    this.loadRound = 0;
    for (const team of ["red", "blue"])
      for (const type of types)
        for (let row = 0; row < 5; row++)
          this.anims.create({
            key: `${team}-${type}-${["idle", "run", "attack", "hurt", "death"][row]}`,
            frames: this.anims.generateFrameNumbers(team + "-" + type, {
              start: row * 6,
              end: row * 6 + 5,
            }),
            frameRate: row === 4 ? 9 : 9 + row,
            repeat: row === 4 ? 0 : -1,
          });
    this.add.image(270, 215, "redcastle").setScale(1.45);
    this.add.image(270, 797, "bluecastle").setScale(1.45);
    this.hp = this.add.graphics().setDepth(2000);
    this.lastDamage = 0;
    this.ready = true;
  }
  makeTerrain() {
    const g = this.add.graphics();
    let seed = 34;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    g.fillStyle(0x48614c);
    g.fillRect(0, 0, 540, 960);
    for (let y = 0; y < 960; y += 8)
      for (let x = 0; x < 540; x += 8) {
        const n = rand();
        g.fillStyle(n < 0.2 ? 0x4d6750 : n < 0.6 ? 0x506b50 : 0x536e53);
        g.fillRect(x, y, 8, 8);
      }
    // River, banks, crossing and worn stone path.
    for (let x = 0; x < 540; x += 8) {
      const wave = Math.round(Math.sin(x / 65) * 2) * 8;
      g.fillStyle(0x334c47);
      g.fillRect(x, 440 + wave, 8, 72);
      g.fillStyle(0x5f9395);
      g.fillRect(x, 448 + wave, 8, 48);
      g.fillStyle(0x7caaa2);
      if (rand() > 0.6) g.fillRect(x, 456 + wave, 8, 2);
    }
    for (let y = 260; y < 760; y += 16)
      for (let x = 218; x < 324; x += 16)
        if (rand() > 0.2) {
          g.fillStyle(rand() > 0.5 ? 0x898773 : 0x7e826b);
          g.fillRect(x + (Math.floor(y / 16) % 2) * 5, y, 14, 13);
        }
    g.fillStyle(0x594f3e);
    g.fillRect(198, 427, 145, 96);
    for (let y = 432; y < 523; y += 10) {
      g.fillStyle(y % 20 ? 0xada081 : 0x9c9075);
      g.fillRect(204, y, 133, 7);
    }
    g.fillStyle(0x574d3d);
    g.fillRect(197, 428, 6, 96);
    g.fillRect(337, 428, 6, 96);
    // Original pixel pine silhouettes and rocks.
    for (let i = 0; i < 50; i++) {
      const x = rand() < 0.5 ? rand() * 130 : 405 + rand() * 130,
        y = 145 + rand() * 700;
      g.fillStyle(0x314e3d);
      g.fillEllipse(x + 5, y + 23, 35, 12);
      g.fillStyle(0x665a40);
      g.fillRect(x - 2, y + 5, 6, 24);
      for (let j = 0; j < 3; j++) {
        g.fillStyle([0x304b3a, 0x36583e, 0x436744][j]);
        g.fillTriangle(
          x,
          y - 23 + j * 12,
          x - 19 + j * 2,
          y + 7 + j * 8,
          x + 19 - j * 2,
          y + 7 + j * 8,
        );
      }
    }
    for (let i = 0; i < 200; i++) {
      const x = rand() * 540,
        y = rand() * 960;
      if (x > 180 && x < 360) continue;
      g.fillStyle(rand() > 0.5 ? 0x81956b : 0xa2a67b);
      g.fillRect(x, y, 2, 3);
      g.fillRect(x + 3, y - 2, 2, 3);
    }
    g.fillStyle(0x13261e, 0.23);
    g.fillRect(0, 0, 540, 135);
    g.fillRect(0, 865, 540, 95);
  }
  update(time, delta) {
    if (!this.ready || !state) return;
    if (this.loadRound !== state.round) {
      for (const o of sprites.values()) {
        o.s.destroy();
        o.label.destroy();
      }
      sprites.clear();
      this.loadRound = state.round;
      lastFx = 0;
    }
    for (const e of state.effects || []) {
      if (e.id <= lastFx) continue;
      lastFx = e.id;
      if (e.type === "archer" || e.type === "mage") {
        const projectile = this.add
          .image(e.x, e.y + 37, e.type === "mage" ? "magic" : "arrow")
          .setDepth(1800)
          .setScale(e.type === "mage" ? 1.8 : 1.4)
          .setRotation(Math.atan2(e.ty - e.y, e.tx - e.x));
        this.tweens.add({
          targets: projectile,
          x: e.tx,
          y: e.ty + 37,
          duration: 180,
          onComplete: () => projectile.destroy(),
        });
      }
    }
    const ids = new Set();
    this.hp.clear();
    for (const u of state.units) {
      ids.add(u.id);
      let o = sprites.get(u.id);
      if (!o) {
        const s = this.add
          .sprite(
            u.x,
            u.y + 45,
            u.team === 0 ? "red-" + u.type : "blue-" + u.type,
          )
          .setScale(
            u.type === "boss" ? 2.15 : u.type === "cavalry" ? 1.5 : 1.3,
          );
        const label = this.add
          .text(u.x, u.y - 34, u.name, {
            fontFamily: "monospace",
            fontSize: "7px",
            color: u.team === 0 ? "#ffc2bb" : "#b4d5ff",
            stroke: "#213428",
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        o = { s, label, previous: u.hp };
        sprites.set(u.id, o);
      }
      o.s.x = Phaser.Math.Linear(o.s.x, u.x, Math.min(1, delta / 50));
      o.s.y = Phaser.Math.Linear(o.s.y, u.y + 45, Math.min(1, delta / 50));
      o.s.setDepth(o.s.y);
      o.s.setFlipX(u.team === 1);
      const key = `${u.team === 0 ? "red" : "blue"}-${u.type}-${state.paused || (state.winner !== null && u.hp > 0) ? "idle" : u.state}`;
      if (o.s.anims.currentAnim?.key !== key) o.s.play(key);
      o.s.anims.timeScale = state.paused ? 0 : 1;
      o.label.setPosition(o.s.x, o.s.y - 33).setDepth(1500);
      o.label.setVisible(state.units.length < 125 && u.hp > 0);
      const width = u.type === "boss" ? 38 : 24;
      if (u.hp > 0) {
        this.hp.fillStyle(0x15261f, 0.8);
        this.hp.fillRect(o.s.x - width / 2, o.s.y - 25, width, 3);
        this.hp.fillStyle(u.team === 0 ? 0xe58b88 : 0x8ebbe9);
        this.hp.fillRect(
          o.s.x - width / 2,
          o.s.y - 25,
          width * Math.max(0, u.hp / u.maxHp),
          3,
        );
      }
      if (u.hp < o.previous && time - this.lastDamage > 65) {
        this.lastDamage = time;
        const txt = this.add
          .text(o.s.x, o.s.y - 30, "−" + Math.round(o.previous - u.hp), {
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#ffe6a3",
            stroke: "#3b3927",
            strokeThickness: 2,
          })
          .setDepth(3000);
        this.tweens.add({
          targets: txt,
          y: txt.y - 27,
          alpha: 0,
          duration: 650,
          onComplete: () => txt.destroy(),
        });
        if (u.type === "mage") {
          const orb = this.add
            .circle(o.s.x, o.s.y - 8, 15, 0x9df5db, 0.3)
            .setDepth(2001);
          this.tweens.add({
            targets: orb,
            scale: 2,
            alpha: 0,
            duration: 250,
            onComplete: () => orb.destroy(),
          });
        }
      }
      o.previous = u.hp;
    }
    for (const [id, o] of sprites)
      if (!ids.has(id)) {
        o.s.destroy();
        o.label.destroy();
        sprites.delete(id);
      }
  }
}
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 540,
  height: 960,
  pixelArt: true,
  antialias: false,
  backgroundColor: "#48614c",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Arena,
  audio: { noAudio: true },
  render: { powerPreference: "high-performance" },
});
const socket = io();
let lastRender = 0;
socket.on("disconnect", () => toast("Server disconnected. Reconnecting…"));
socket.on("state", (data) => {
  state = data;
  if (Date.now() - lastRender < 250) return;
  lastRender = Date.now();
  $("timer").textContent =
    `${String(Math.floor(data.time / 60)).padStart(2, "0")}:${String(Math.floor(data.time % 60)).padStart(2, "0")}`;
  $("unitCount").textContent = data.units.length;
  $("round").textContent = "ROUND " + String(data.round).padStart(2, "0");
  for (const [i, color] of ["red", "blue"].entries()) {
    $(color + "Hp").textContent = Math.ceil(data.castles[i]).toLocaleString();
    $(color + "Bar").style.width = data.castles[i] / 100 + "%";
  }
  $("speed").value = String(data.speed || 1);
  $("pause").textContent = data.paused ? "▶ Resume" : "Ⅱ Pause";
  $("paused").hidden = !data.paused;
  $("auto").classList.toggle("on", data.auto);
  $("auto").setAttribute("aria-pressed", data.auto);
  $("demoToggle").classList.toggle("on", data.mode === "demo");
  $("demoToggle").setAttribute("aria-pressed", data.mode === "demo");
  $("modeLabel").textContent =
    data.mode === "demo" ? "DEMO LIVE" : data.mode.toUpperCase();
  document.querySelector(".badge").textContent = data.mode.toUpperCase();
  $("liveStatus").textContent =
    data.mode === "demo" ? "Demo mode · no LIVE required" : data.liveStatus;
  $("winner").hidden = data.winner === null;
  if (data.winner !== null)
    $("winner").textContent =
      (data.winner === 0 ? "RED" : "BLUE") + " KINGDOM WINS";
  $("scores").innerHTML = data.scores.length
    ? data.scores
        .map(
          (s, i) =>
            `<div class="score"><span class="rank ${i === 0 ? "first" : ""}">${i === 0 ? "♕" : String(i + 1).padStart(2, "0")}</span><span class="user-avatar ${s.team === 1 ? "blue" : ""}">${esc(s.name.slice(0, 1).toUpperCase())}</span><div class="score-name">${esc(s.name)}<small>Team ${s.team === 0 ? "Red" : "Blue"}</small></div><span class="score-value">${s.coins.toLocaleString()} <small>◈</small></span></div>`,
        )
        .join("")
    : '<div class="empty">Your first commander is on the way.<br>Send a demo gift to join the ranks.</div>';
  $("events").innerHTML =
    data.events
      .slice(0, 7)
      .map(
        (e) =>
          `<div class="event ${e.team === 1 ? "blue" : ""}"><p><strong>${esc(e.name)}</strong> sent a gift<small>+${e.count} ${names[e.type]} → Team ${e.team === 0 ? "Red" : "Blue"}</small></p><time>${Math.max(0, Math.floor((Date.now() - e.at) / 1000))}s</time></div>`,
      )
      .join("") ||
    '<p class="empty">The battlefield awaits. Summon your first troop.</p>';
  if (sound && audio && data.events[0]?.at > lastEvent) {
    lastEvent = data.events[0].at;
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(440, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      220,
      audio.currentTime + 0.12,
    );
    gain.gain.setValueAtTime(0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.16);
  }
});
