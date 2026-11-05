import Phaser from "phaser";
import { io } from "socket.io-client";
import { Arena, setBattleState, moveCamera } from "./arena.js";
import { TYPES, DEFAULT_RULES, LIKE_REWARDS } from "../src/characters.js";
const $ = (id) => document.getElementById(id),
  types = Object.keys(TYPES),
  costs = DEFAULT_RULES.map((r) => r.min);
let selected = 0,
  token = sessionStorage.getItem("pw-token") || "",
  state = null,
  sound = false,
  audio = null,
  lastSound = 0;
const esc = (s) =>
  String(s ?? "").replace(
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
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").style.display = "none"), 3200);
}
async function control(action, data = {}) {
  if (!token) {
    $("setup").showModal();
    toast("Enter the admin token printed in the server terminal");
    return;
  }
  try {
    const r = await fetch("/api/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ action, ...data }),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error);
    return result;
  } catch (e) {
    toast(e.message);
    return null;
  }
}
$("token").value = token;
$("help").onclick = $("settingsNav").onclick = () => $("setup").showModal();
function renderRules(rules) {
  $("rules").innerHTML = rules
    .map(
      (r) =>
        `<div class="rule"><input type="number" min="1" value="${r.min}" aria-label="Minimum coins"><select aria-label="Troop type">${types.map((t) => `<option value="${t}" ${r.type === t ? "selected" : ""}>${TYPES[t].name}</option>`).join("")}</select><input type="number" min="1" max="50" value="${r.count}" aria-label="Troop quantity"></div>`,
    )
    .join("");
}
renderRules(DEFAULT_RULES);
$("unlock").onclick = async () => {
  token = $("token").value.trim();
  try {
    const r = await fetch("/api/config", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!r.ok) throw Error("Invalid admin token");
    const data = await r.json();
    sessionStorage.setItem("pw-token", token);
    renderRules(data.rules);
    $("authStatus").textContent = "Controls unlocked for this tab.";
    toast("Controls unlocked");
  } catch (e) {
    toast(e.message);
  }
};
$("saveRules").onclick = async () => {
  const rules = [...$("rules").children].map((row) => ({
    min: Number(row.children[0].value),
    type: row.children[1].value,
    count: Number(row.children[2].value),
  }));
  if (await control("rules", { rules })) toast("Gift mapping saved");
};
$("defaultRules").onclick = async () => {
  if (await control("defaultRules")) {
    renderRules(DEFAULT_RULES);
    toast("Default six gift rules restored");
  }
};
$("troops").innerHTML = types
  .map(
    (type, i) =>
      `<div class="troop"><canvas class="sprite-icon" width="64" height="64" data-type="${type}"></canvas><div class="troop-info"><strong>${TYPES[type].name}</strong><small>${TYPES[type].hp.toLocaleString()} HP · ${TYPES[type].damage} ATK <span class="coin">· ${costs[i]} ◈</span></small></div><button data-type-spawn="${type}" aria-label="Summon ${TYPES[type].name}">+</button></div>`,
  )
  .join("");
function icons() {
  for (const c of document.querySelectorAll(".sprite-icon")) {
    const im = new Image();
    im.onload = () => {
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(im, 0, 0, 64, 64, 0, 0, 64, 64);
    };
    im.src = `/assets/${selected === 0 ? "red" : "blue"}-${c.dataset.type}.png`;
  }
}
icons();
for (const b of document.querySelectorAll("[data-type-spawn]"))
  b.onclick = async () => {
    if (
      await control("troop", {
        team: selected,
        type: b.dataset.typeSpawn,
        count: Number($("spawnCount").value),
        name: "Demo",
      })
    )
      toast(TYPES[b.dataset.typeSpawn].name + " summoned");
  };
for (const b of document.querySelectorAll("[data-team]"))
  b.onclick = () => {
    selected = Number(b.dataset.team);
    document
      .querySelectorAll("[data-team]")
      .forEach((x) => x.classList.toggle("selected", x === b));
    icons();
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
for (const b of document.querySelectorAll("[data-likes]"))
  b.onclick = async () => {
    if (
      await control("likes", { team: selected, count: Number(b.dataset.likes) })
    )
      toast(`+${b.dataset.likes} team energy`);
  };
$("pause").onclick = () => control("pause");
$("reset").onclick = () => control("reset");
$("auto").onclick = () => control("auto");
$("demoToggle").onclick = () => control("demo");
$("burst").onclick = () =>
  control("burst", { count: Number($("stressCount").value) });
$("speed").onchange = () =>
  control("speed", { value: Number($("speed").value) });
$("connect").onclick = async () => {
  $("connect").disabled = true;
  await control("connect", {
    username: $("username").value.trim().replace(/^@/, ""),
  });
  $("connect").disabled = false;
};
$("fullscreen").onclick = () => {
  const el = $("arenaWrap");
  if (el.requestFullscreen)
    el.requestFullscreen().catch(() => window.open("/?overlay=1", "_blank"));
  else window.open("/?overlay=1", "_blank");
};
for (const b of document.querySelectorAll("[data-camera]"))
  b.onclick = () => {
    moveCamera(b.dataset.camera);
    document
      .querySelectorAll("[data-camera]")
      .forEach((x) => x.classList.toggle("selected", x === b));
  };
$("minimap").onclick = (e) =>
  moveCamera(
    e.offsetX < e.currentTarget.clientWidth / 3
      ? "red"
      : e.offsetX > (e.currentTarget.clientWidth * 2) / 3
        ? "blue"
        : "auto",
  );
$("sound").onclick = () => {
  sound = !sound;
  if (sound && !audio)
    audio = new (window.AudioContext || window.webkitAudioContext)();
  if (sound) audio.resume();
  $("sound").style.color = sound ? "#8dd9bc" : "";
  toast(sound ? "Battle sounds on" : "Battle sounds off");
};
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 540,
  height: 960,
  pixelArt: true,
  antialias: false,
  backgroundColor: "#202b45",
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
  setBattleState(data);
  if (Date.now() - lastRender < 200) return;
  lastRender = Date.now();
  $("timer").textContent =
    `${String(Math.floor(data.time / 60)).padStart(2, "0")}:${String(Math.floor(data.time % 60)).padStart(2, "0")}`;
  $("unitCount").textContent = data.units.filter((u) => u.hp > 0).length;
  $("arenaUnits").textContent =
    data.units.filter((u) => u.hp > 0).length + " UNITS";
  $("streamLeaders").textContent =
    "TOP · " +
    (data.scores
      .slice(0, 3)
      .map((s, i) => `${i + 1}. ${s.name} ${s.coins}c / ${s.likes} likes`)
      .join("  ·  ") || "Send gifts or likes to join");
  $("round").textContent = "ROUND " + String(data.round).padStart(2, "0");
  for (const [i, color] of ["red", "blue"].entries()) {
    document.querySelector("." + color + "-ui > span").textContent =
      (i === 0 ? "RED" : "BLUE") +
      " KINGDOM · " +
      data.teamScore[i].toLocaleString() +
      "c";
    $(color + "Hp").textContent = Math.ceil(data.castles[i]).toLocaleString();
    $(color + "Bar").style.width = data.castles[i] / 100 + "%";
    $("energy" + i).textContent = data.energy[i].toLocaleString();
    const next = LIKE_REWARDS.find((r) => !data.claimed[i].includes(r.at));
    $("next" + i).textContent = next
      ? `Next ${next.at.toLocaleString()}: ${next.label}`
      : "All six milestones claimed";
    $("fury" + i).textContent =
      (data.furyCooldown[i] > 0
        ? `Fury cooldown ${Math.ceil(data.furyCooldown[i])}s`
        : "Fury ready · 500 / 10s") +
      (data.boost[i] > 0 ? ` · HASTE ${Math.ceil(data.boost[i])}s` : "");
  }
  $("pause").textContent = data.paused ? "▶ Resume" : "Ⅱ Pause";
  $("paused").hidden = !data.paused;
  $("speed").value = String(data.speed || 1);
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
            `<div class="score"><span class="rank ${i === 0 ? "first" : ""}">${String(i + 1).padStart(2, "0")}</span><span class="user-avatar ${s.team === 1 ? "blue" : ""}">${esc(s.name.slice(0, 1).toUpperCase())}</span><div class="score-name">${esc(s.name)}<small>Team ${s.team === 0 ? "Red" : "Blue"} · ${s.likes.toLocaleString()} likes</small></div><span class="score-value">${s.coins.toLocaleString()} ◈</span></div>`,
        )
        .join("")
    : '<div class="empty">Send a demo gift or likes to join the ranks.</div>';
  $("events").innerHTML =
    data.events
      .slice(0, 10)
      .map(
        (e) =>
          `<div class="event ${e.team === 1 ? "blue" : ""}"><p><strong>${esc(e.name)}</strong><small>${e.kind === "gift" ? `Gift → +${e.count} ${TYPES[e.type]?.name || e.type}` : e.kind === "fury" ? "FURY ACTIVATED" : `Energy milestone ${e.value.toLocaleString()}`} · Team ${e.team === 0 ? "Red" : "Blue"}</small></p><time>${Math.max(0, Math.floor((Date.now() - e.at) / 1000))}s</time></div>`,
      )
      .join("") || '<p class="empty">The battlefield awaits.</p>';
  if (sound && audio && data.effects.at(-1)?.id > lastSound) {
    lastSound = data.effects.at(-1).id;
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, audio.currentTime);
    g.gain.setValueAtTime(0.018, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.08);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.09);
  }
});
