import type { BattleState } from "./state";
import "./hud.css";
import manifest from "../public/assets/ui/kit/manifest.json";
const root = "/assets/ui/kit/";
const views = manifest.views as Record<
  string,
  { source: string; viewport: number[] }
>;
const art = (name: string, cls = "") => {
  const v = views[name],
    a = manifest.assets.find((a) => a.file === v.source)!;
  return `<svg class="kit-art ${cls}" viewBox="${v.viewport.join(" ")}" aria-hidden="true" preserveAspectRatio="none"><image href="${root + v.source}" width="${a.width}" height="${a.height}"/></svg>`;
};
const kinds = [
  ["sword", "Swordsman", "Sword"],
  ["archer", "Archer", "Archer"],
  ["cavalry", "Cavalry", "Cav"],
  ["mage", "Mage", "Mage"],
  ["guardian", "Guardian", "Guard"],
  ["boss", "Titan", "Titan"],
];
export interface Contributor {
  id: string;
  name: string;
  team: number;
  points: number;
  avatar?: string;
}
export interface HudData {
  boards: {
    round: Contributor[];
    weekly: Contributor[];
    monthly: Contributor[];
  };
  teams: Contributor[][];
  periodLabels: { weekly: string; monthly: string };
}
export type HudState = BattleState & {
  teamScore: number[];
  events: {
    name: string;
    team: number;
    type?: string;
    count?: number;
    kind: string;
    at: number;
  }[];
  hud?: HudData;
};
export class BattleHud {
  private canvas: HTMLElement;
  private latest: HudState | null = null;
  private board = "round";
  private resultId = "";
  private roundId = "";
  private completedResults = new Set<string>();
  private last = 0;
  private lastPeople = "";
  private observer: ResizeObserver;
  constructor(stage: HTMLElement) {
    const mount = document.createElement("div");
    mount.id = "battleHud";
    mount.className = "hud-canvas";
    mount.innerHTML = `
  <div class="hud-assembly" aria-label="Fantasy battle dashboard">
   <div class="hud-backlight"></div>
   <div class="hud-hero">${art("titan")}<h1 class="sr-only">PIXEL WAR 3D — WAR TITAN</h1><div class="hero-score"><small>TOTAL BATTLE SCORE</small><strong id="totalBattleScore">0</strong><span id="scoreUnit">GIFT COINS</span></div></div>
   <div class="clock-bridge">${art("connector")}<b id="timer">05:00</b><small><span id="round">ROUND —</span> · <span id="phase">CONNECTING</span></small></div>
   ${[0, 1]
     .map((team) => {
       const c = team === 0 ? "red" : "blue";
       return `<section class="faction faction-${c}" aria-label="${c.toUpperCase()} Kingdom">
    <div class="faction-emblem">${art(c + "-crest")}</div><div class="faction-shell">${art("stats")}</div>
    <div class="faction-title">${art(c + "-name")}<h2>${c.toUpperCase()} KINGDOM</h2></div>
    <div class="faction-score"><b id="${c}Score">0</b><small>GIFT COINS</small></div>
    <div class="hp-shell">${art(c + "-hp")}<div class="hp-track"><div id="${c}HpFill" class="hp-fill">${art(c + "-fill")}</div></div><strong id="${c}Hp">10,000 HP</strong><meter hidden id="${c}Bar" min="0" max="10000" value="10000"></meter></div>
    <div class="player-shell">${art("connector")}<div class="faction-players" id="${c}Players"></div></div>
    <div class="army-counter"><b id="${c}Count">0 units</b><small>ARMY ON FIELD</small></div>
   </section>`;
     })
     .join("")}
   <section class="hud-troops" aria-label="Troop statistics">${art("stats")}<h2><span>RED</span> <i>VS</i> <span>BLUE</span></h2><div class="troop-table">${kinds.map(([k, name, short]) => `<div class="troop-row"><b class="red-number" id="troop-red-${k}">0</b><span class="troop-name"><span class="long-name">${name}</span><span class="short-name">${short}</span></span><b class="blue-number" id="troop-blue-${k}">0</b></div>`).join("")}</div></section>
   <nav class="ranking-tabs" aria-label="Contributor rankings"><button data-board="round">${art("connector")}<span>TOP 10</span></button><button data-board="weekly">${art("connector")}<span>WEEKLY</span></button><button data-board="monthly">${art("connector")}<span>MONTHLY</span></button></nav>
   <div class="hud-source" id="hudSource">CONNECTING</div>
  </div>
  <div id="rankingBackdrop" class="leaderboard-backdrop" hidden></div>
  <div id="resultsBackdrop" class="results-backdrop" hidden></div>
  <section id="roundResults" class="round-results" role="dialog" aria-modal="true" aria-label="Round results" hidden>
    <div class="result-banner">${art("connector")}<h2 id="resultWinner"></h2><p id="resultScores"></p><b id="resultCountdown"></b></div>
    <div class="ranking-panel result-ranks">${art("top10")}<header><h2>ROUND TOP 10</h2></header><ol id="resultRows"></ol><p id="resultEmpty" hidden>No contributors this round</p></div>
  </section>
  <section id="rankingPanel" class="ranking-panel" aria-label="Expanded contributor leaderboard" hidden>${art("top10", "rank-border")}<header><h2 id="rankingTitle">TOP 10</h2><button id="closeRanking" aria-label="Close leaderboard">×</button></header><p id="rankingPeriod"></p><ol id="rankingRows"></ol><p id="rankingEmpty">No contributors yet</p></section>
  <div id="giftNotice" class="gift-notice" hidden>${art("rare-notice")}${art("rewards", "gift-reward")}<div><strong id="giftName"></strong><span id="giftDetail"></span></div></div>`;
    stage.append(mount);
    this.canvas = mount;
    this.observer = new ResizeObserver(() => {
      mount.style.transform = `scale(${stage.clientWidth / 1080})`;
      mount.classList.toggle("narrow", stage.clientWidth < 500);
    });
    this.observer.observe(stage);
    mount.querySelectorAll<HTMLButtonElement>("[data-board]").forEach(
      (b) =>
        (b.onclick = () => {
          if (!this.el("roundResults").hidden) return;
          this.board = b.dataset.board!;
          this.el("rankingBackdrop").hidden=false;
          this.el("rankingPanel").hidden = false;
          this.drawBoard();
        }),
    );
    this.el("closeRanking").onclick = () => this.closeManual();
    this.el("rankingBackdrop").onclick = () => this.closeManual();
    // Decode artwork before any round ends; results never load a model or new frame.
    for(const name of ["top10","connector"]) {const image = new Image();image.src=root+views[name].source;void image.decode().catch(()=>{});}

  }
  private el<T extends HTMLElement = HTMLElement>(id: string) {
    return this.canvas.querySelector("#" + id) as T;
  }
  private text(id: string, value: string) {
    this.el(id).textContent = value;
  }
  private avatar(player: Contributor | undefined, team: number) {
    const wrap = document.createElement("div");
    wrap.className = "contributor";
    const portrait = document.createElement("div");
    portrait.className = "avatar-slot";
    const fallback = document.createElement("span");
    fallback.textContent = player
      ? player.name.trim().slice(0, 2).toUpperCase()
      : "＋";
    portrait.append(fallback);
    if (player?.avatar) {
      const img = new Image();
      img.alt = player.name;
      img.referrerPolicy = "no-referrer";
      img.src = player.avatar;
      img.onerror = () => img.remove();
      portrait.append(img);
    }
    const ring = document.createElement("div");
    ring.innerHTML = art("avatar", "avatar-ring");
    portrait.append(ring.firstElementChild!);
    wrap.append(portrait);
    const name = document.createElement("span");
    name.className = "contributor-name";
    name.textContent = player?.name ?? `Join ${team === 0 ? "RED" : "BLUE"}`;
    name.title = name.textContent;
    const score = document.createElement("b");
    score.textContent = player ? player.points.toLocaleString() + " XP" : "—";
    wrap.append(name, score);
    return wrap;
  }
  render(state: HudState) {
    this.latest = state;
    this.results(state);
    if (performance.now() - this.last < 200) return;
    this.last = performance.now();
    this.text(
      "totalBattleScore",
      state.teamScore.reduce((a, b) => a + b, 0).toLocaleString(),
    );
    for (const [team, c] of ["red", "blue"].entries()) {
      this.text(c + "Score", state.teamScore[team].toLocaleString());
      this.el(c + "HpFill").style.width =
        Math.max(0, Math.min(100, state.castles[team] / 100)) + "%";
      for (const [k] of kinds)
        this.text(
          "troop-" + c + "-" + k,
          String(
            state.units.filter(
              (u) => u.hp > 0 && u.team === team && u.type === k,
            ).length,
          ),
        );
    }
    const people = JSON.stringify(state.hud?.teams ?? []);
    if (people !== this.lastPeople) {
      this.lastPeople = people;
      for (const [team, c] of ["red", "blue"].entries())
        this.el(c + "Players").replaceChildren(
          ...Array.from({ length: 3 }, (_, i) =>
            this.avatar(state.hud?.teams[team]?.[i], team),
          ),
        );
    }
    this.text(
      "hudSource",
      state.mode === "demo"
        ? "DEMO · SIMULATED VIEWER EVENTS"
        : state.mode === "live"
          ? "TIKTOK LIVE · SERVER CONNECTED"
          : "CONNECTING TO TIKTOK",
    );
    if (!this.el("rankingPanel").hidden) this.drawBoard();
    const notice = state.events.find(
      (e) => e.kind === "gift" || e.kind === "fury",
    );
    const show = notice && Date.now() - notice.at < 8000;
    this.el("giftNotice").hidden = !show;
    if (show) {
      this.text("giftName", notice.name);
      this.text(
        "giftDetail",
        notice.kind === "gift"
          ? `${notice.count ?? 0} ${kinds.find((k) => k[0] === notice.type)?.[1] ?? "units"} summoned · ${notice.team === 0 ? "RED" : "BLUE"}`
          : `${notice.team === 0 ? "RED" : "BLUE"} FURY`,
      );
    }
  }
  private closeManual() {
    this.el("rankingPanel").hidden=true;
    this.el("rankingBackdrop").hidden=true;
  }
  private rows(players: Contributor[]) {
    return players.slice(0,10).map(p=>{
      const row=document.createElement("li"),value=document.createElement("strong");
      value.textContent=p.points.toLocaleString()+" XP";
      row.append(this.avatar(p,p.team),value);return row;
    });
  }
  private results(state:HudState) {
    const round=state.roundState,result=round.result;
    if(this.roundId!==round.id) {
      if(this.resultId) this.completedResults.add(this.resultId);
      if(this.completedResults.size>64)this.completedResults.delete(this.completedResults.values().next().value!);
      this.roundId=round.id;this.closeManual();this.el("roundResults").hidden=true;
    }
    const active=["results","countdown"].includes(round.phase) && result && !result.aborted;
    if(active && !this.completedResults.has(result.id)) {
      this.closeManual();
      if(this.resultId!==result.id) {
        this.resultId=result.id;
        const panel=this.el("roundResults");panel.dataset.round=result.id;
        panel.dataset.presentations=String(Number(panel.dataset.presentations||0)+1);
        this.text("resultWinner",result.winner===null?"DRAW":(result.winner===0?"RED":"BLUE")+" KINGDOM WINS");
        this.text("resultScores",`ROUND ${result.number} · RED ${(result.scores?.[0]??0).toLocaleString()} — ${(result.scores?.[1]??0).toLocaleString()} BLUE · GIFT COINS`);
        this.el("resultRows").replaceChildren(...this.rows(result.top10));
        this.el("resultEmpty").hidden=result.top10.length>0;
      }
      this.el("roundResults").hidden=false;
      this.text("resultCountdown",`NEXT ROUND IN ${Math.ceil(round.phaseRemaining)}s`);
    } else {
      if(this.resultId && !["results","countdown"].includes(round.phase)) this.completedResults.add(this.resultId);
      this.el("roundResults").hidden=true;
    }
    const visible=!this.el("roundResults").hidden;
    this.el("resultsBackdrop").hidden=!visible;
    this.canvas.classList.toggle("results-active",visible);
  }
  private drawBoard() {
    const data = this.latest?.hud;
    const key = this.board as keyof HudData["boards"];
    const players = data?.boards[key] ?? [];
    this.text(
      "rankingTitle",
      key === "round" ? "TOP 10 · ROUND" : key.toUpperCase() + " · TOP 10",
    );
    this.text(
      "rankingPeriod",
      key === "round"
        ? "Contribution score · current round"
        : (data?.periodLabels[key] ?? "UTC calendar period"),
    );
    // Reuse the original ten-slot artwork for every ranking period.
    const rows = players.slice(0, 10).map((p, i) => {
      const row = document.createElement("li");
      const n = document.createElement("b");
      n.className = "place";
      n.textContent = String(i + 1);
      const person = this.avatar(p, p.team);
      const value = document.createElement("strong");
      value.textContent = p.points.toLocaleString() + " XP";
      row.append(n, person, value);
      return row;
    });
    this.el("rankingRows").replaceChildren(...rows);
    this.el("rankingEmpty").hidden = players.length > 0;
  }
  dispose() {
    this.observer.disconnect();
    this.canvas.remove();
  }
}
