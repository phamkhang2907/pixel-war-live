import Phaser from "phaser";
import { TYPES, ANIMATIONS, SPRITE, WORLD } from "../src/characters.js";
let state = null,
  cameraMode = "auto";
export const setBattleState = (s) => (state = s);
export const moveCamera = (mode) => (cameraMode = mode);
export class Arena extends Phaser.Scene {
  constructor() {
    super("Battlefield");
    this.units = new Map();
    this.shots = new Map();
    this.fxId = 0;
    this.round = 0;
    this.fxCount = 0;
  }
  preload() {
    for (const team of ["red", "blue"]) {
      this.load.image(team + "castle", `/assets/${team}-castle.png`);
      for (const type of Object.keys(TYPES))
        this.load.spritesheet(
          `${team}-${type}`,
          `/assets/${team}-${type}.png`,
          { frameWidth: SPRITE.width, frameHeight: SPRITE.height },
        );
    }
    for (const key of [
      "sky",
      "mountains",
      "forest",
      "arrow",
      "fireball",
      "ice",
      "spark",
      "dust",
    ])
      this.load.image(key, `/assets/${key}.png`);
  }
  create() {
    this.add.image(270, 480, "sky").setScrollFactor(0);
    this.add
      .tileSprite(0, 180, 2000, 500, "mountains")
      .setOrigin(0)
      .setScrollFactor(0.22, 1)
      .setAlpha(0.85);
    this.add
      .tileSprite(0, 350, 2000, 400, "forest")
      .setOrigin(0)
      .setScrollFactor(0.5, 1);
    this.terrain();
    for (const [team, x] of WORLD.castles.entries()) {
      this.add
        .image(x, 565, (team === 0 ? "red" : "blue") + "castle")
        .setScale(2.4);
      const flag = this.add.graphics();
      flag.lineStyle(3, 0xa99e85);
      flag.lineBetween(x, 392, x, 480);
      flag.fillStyle(team === 0 ? 0xc6506c : 0x558ed3);
      flag.fillTriangle(x, 395, x + 50, 408, x, 423);
    }
    for (const team of ["red", "blue"])
      for (const type of Object.keys(TYPES))
        for (const [row, name] of ANIMATIONS.entries())
          this.anims.create({
            key: `${team}-${type}-${name}`,
            frames: this.anims.generateFrameNumbers(`${team}-${type}`, {
              start: row * 8,
              end: row * 8 + 7,
            }),
            frameRate: name === "death" ? 10 : 12,
            repeat: ["death", "rage", "stomp"].includes(name) ? 0 : -1,
          });
    this.bars = this.add.graphics().setDepth(1800);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.centerOn(900, 480);
    this.input.on("pointermove", (p) => {
      if (p.isDown) {
        cameraMode = "manual";
        this.cameras.main.scrollX = Phaser.Math.Clamp(
          this.cameras.main.scrollX - (p.x - p.prevPosition.x),
          0,
          1260,
        );
      }
    });
    this.input.on("wheel", (_, __, dx, dy) => {
      cameraMode = "manual";
      this.cameras.main.scrollX = Phaser.Math.Clamp(
        this.cameras.main.scrollX + (dx || dy),
        0,
        1260,
      );
    });
    this.ready = true;
  }
  terrain() {
    const g = this.add.graphics();
    g.fillStyle(0x344d45);
    g.fillRect(0, 562, 1800, 398);
    g.fillStyle(0x657258);
    g.fillRect(0, 604, 1800, 150);
    g.fillStyle(0x837b60);
    g.fillRect(0, 665, 1800, 70);
    let seed = 6;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 1400; i++) {
      const x = Math.floor((rand() * 1800) / 4) * 4,
        y = 580 + Math.floor((rand() * 380) / 4) * 4;
      g.fillStyle([0x51634c, 0x92906b, 0x3b5747, 0x777d57][i % 4]);
      g.fillRect(x, y, 4 + Math.floor(rand() * 3) * 4, 2);
    }
    for (let x = 0; x < 1800; x += 46) {
      g.fillStyle(0x535e52);
      g.fillRect(x, 678 + (x % 3) * 7, 20, 8);
    }
    for (let i = 0; i < 25; i++) {
      const x = i * 83;
      g.fillStyle(0x273e3d);
      g.fillTriangle(x - 20, 850, x, 782, x + 27, 850);
      g.fillTriangle(x - 28, 879, x, 812, x + 32, 879);
      g.fillStyle(0x756b55);
      g.fillRect(x - 3, 858, 5, 30);
    }
  }
  particle(texture, x, y, quantity = 3) {
    if (this.fxCount > 160) return;
    for (let i = 0; i < quantity; i++) {
      this.fxCount++;
      const p = this.add
        .image(x, y, texture)
        .setScale(0.3 + Math.random() * 0.5)
        .setAlpha(0.9)
        .setDepth(1700);
      this.tweens.add({
        targets: p,
        x: x + (Math.random() - 0.5) * 55,
        y: y - 10 - Math.random() * 35,
        alpha: 0,
        rotation: Math.random() * 3,
        duration: 300 + Math.random() * 300,
        onComplete: () => {
          p.destroy();
          this.fxCount--;
        },
      });
    }
  }
  effect(e) {
    if (this.fxCount > 160) return;
    const y = e.y - (e.air ? 115 : 25);
    if (["hit", "block"].includes(e.type)) {
      const text = this.add
        .text(e.x, y - 30, (e.type === "block" ? "BLOCK " : "−") + e.amount, {
          fontFamily: "monospace",
          fontSize: e.type === "block" ? "11px" : "15px",
          color: e.type === "block" ? "#b9d3ef" : "#ffe5ab",
          stroke: "#202039",
          strokeThickness: 3,
        })
        .setDepth(2500)
        .setOrigin(0.5);
      this.fxCount++;
      this.tweens.add({
        targets: text,
        y: y - 75,
        alpha: 0,
        duration: 650,
        onComplete: () => {
          text.destroy();
          this.fxCount--;
        },
      });
      this.particle("spark", e.x, y, 2);
    } else if (["meteor", "ice"].includes(e.type)) {
      const rock = this.add
        .image(e.x - 90, y - 300, e.type === "ice" ? "ice" : "fireball")
        .setScale(3)
        .setDepth(2300)
        .setRotation(0.9);
      this.tweens.add({
        targets: rock,
        x: e.x,
        y,
        duration: 450,
        onComplete: () => {
          rock.destroy();
          this.particle(e.type === "ice" ? "ice" : "fireball", e.x, y, 8);
        },
      });
    } else if (e.type === "stomp") {
      const ring = this.add.graphics().setPosition(e.x, e.y).setDepth(1700);
      ring.lineStyle(3, e.team === 0 ? 0xf1a07b : 0x9ad5ed, 0.7);
      ring.strokeEllipse(0, 0, e.radius * 2, 65);
      this.tweens.add({
        targets: ring,
        scale: 1.6,
        alpha: 0,
        duration: 500,
        onComplete: () => ring.destroy(),
      });
      this.particle("dust", e.x, e.y, 7);
    } else
      this.particle(
        e.type === "explosion"
          ? "fireball"
          : e.type === "heal"
            ? "ice"
            : "spark",
        e.x,
        y,
        5,
      );
  }
  update(time, delta) {
    if (!state || !this.ready) return;
    const dt = Math.min(delta / 50, 1),
      camera = this.cameras.main;
    if (this.round !== state.round) {
      for (const o of this.units.values()) {
        o.s.destroy();
        o.label.destroy();
      }
      for (const s of this.shots.values()) s.destroy();
      this.units.clear();
      this.shots.clear();
      this.round = state.round;
      this.fxId = 0;
    }
    if (cameraMode !== "manual") {
      let target =
        cameraMode === "red" ? 270 : cameraMode === "blue" ? 1530 : 900;
      if (cameraMode === "auto" && state.units.length) {
        const reds = state.units.filter((u) => u.team === 0 && u.hp > 0),
          blues = state.units.filter((u) => u.team === 1 && u.hp > 0);
        const r = reds.length ? Math.max(...reds.map((u) => u.x)) : null,
          b = blues.length ? Math.min(...blues.map((u) => u.x)) : null;
        target = r !== null && b !== null ? (r + b) / 2 : (r ?? b ?? 900);
      }
      camera.scrollX = Phaser.Math.Linear(
        camera.scrollX,
        Phaser.Math.Clamp(target - 270, 0, 1260),
        1 - Math.exp(-Math.min(delta, 500) / 180),
      );
    }
    const cameraView = document.getElementById("cameraView");
    if (cameraView) {
      cameraView.style.left = camera.scrollX / 18 + "%";
      cameraView.style.width = "30%";
    }
    this.bars.clear();
    const ids = new Set();
    for (const u of state.units) {
      ids.add(u.id);
      const t = TYPES[u.type],
        air = t.air ? 94 + Math.sin(time / 260 + u.id) * 5 : 0;
      let o = this.units.get(u.id);
      if (!o) {
        const s = this.add
          .sprite(u.x, u.y - air, `${u.team === 0 ? "red" : "blue"}-${u.type}`)
          .setOrigin(0.5, 0.9)
          .setScale(t.scale);
        const label = this.add
          .text(u.x, u.y - 70, u.name, {
            fontFamily: "monospace",
            fontSize: "9px",
            color: u.team === 0 ? "#ffa7a8" : "#b0d9ff",
            stroke: "#1e2934",
            strokeThickness: 3,
          })
          .setOrigin(0.5);
        o = { s, label };
        this.units.set(u.id, o);
      }
      o.s.x = Phaser.Math.Linear(o.s.x, u.x, dt);
      o.s.y = Phaser.Math.Linear(o.s.y, u.y - air, dt);
      o.s.setFlipX(u.team === 1).setDepth(u.y + (t.air ? 100 : 0));
      const animation =
          u.hp <= 0
            ? "death"
            : state.paused
              ? "idle"
              : state.winner !== null
                ? "idle"
                : u.state,
        key = `${u.team === 0 ? "red" : "blue"}-${u.type}-${animation}`;
      if (o.s.anims.currentAnim?.key !== key) o.s.play(key);
      o.s.anims.timeScale = state.paused ? 0 : 1;
      const top = o.s.y - 55 * t.scale;
      o.label
        .setPosition(o.s.x, top - 15)
        .setDepth(1900)
        .setVisible(u.hp > 0 && state.units.length <= 90);
      if (u.hp > 0) {
        const w = 32 * t.scale;
        this.bars.fillStyle(0x152536, 0.85);
        this.bars.fillRect(o.s.x - w / 2, top, w, 4);
        this.bars.fillStyle(u.team === 0 ? 0xf17a83 : 0x81bdff);
        this.bars.fillRect(o.s.x - w / 2, top, (w * u.hp) / u.maxHp, 4);
        if (t.air) {
          this.bars.fillStyle(0x1b3035, 0.25);
          this.bars.fillEllipse(u.x, u.y + 3, 33, 8);
        }
      }
      if (u.state === "run" && time % 180 < delta && state.units.length < 125)
        this.particle("dust", u.x, u.y, 1);
    }
    for (const [id, o] of this.units)
      if (!ids.has(id) && !o.removing) {
        o.removing = true;
        o.label.destroy();
        const key = o.s.texture.key + "-death";
        if (o.s.anims.currentAnim?.key !== key) o.s.play(key);
        this.time.delayedCall(800, () => {
          o.s.destroy();
          this.units.delete(id);
        });
      }
    const shots = new Set();
    for (const p of state.projectiles) {
      shots.add(p.id);
      let s = this.shots.get(p.id);
      if (!s) {
        s = this.add
          .image(p.x, p.y, p.kind === "fireball" ? "fireball" : "arrow")
          .setScale(p.kind === "fireball" ? 1.2 : 1)
          .setDepth(2000);
        this.shots.set(p.id, s);
      }
      s.setPosition(
        Phaser.Math.Linear(s.x, p.x, dt),
        Phaser.Math.Linear(s.y, p.y, dt),
      );
      s.setRotation(Math.atan2(p.ty - p.y, p.tx - p.x));
    }
    for (const [id, s] of this.shots)
      if (!shots.has(id)) {
        s.destroy();
        this.shots.delete(id);
      }
    for (const e of state.effects)
      if (e.id > this.fxId) {
        this.fxId = e.id;
        this.effect(e);
      }
  }
}
