import Phaser from "phaser";
import {
  TYPES,
  ANIMATIONS,
  WORLD,
  LIVE_VIEW,
  projectY,
} from "../src/characters.js";
import { CameraDirector } from "../src/camera-director.js";
let state = null,
  requested = "auto";
export const setBattleState = (s) => (state = s);
export const moveCamera = (mode) => (requested = mode);
/** Real 1080x1920 stage. Only the middle camera viewport sees/zooms the world. */
export class Arena extends Phaser.Scene {
  constructor() {
    super("Battlefield");
    this.units = new Map();
    this.shots = new Map();
    this.fxId = 0;
    this.round = 0;
    this.textFree = [];
    this.fxActive = new Set();
    this.director = new CameraDirector();
    this.lastMap = 0;
    this.createdSprites = 0;
    this.reusedSprites = 0;
  }
  preload() {
    this.load.atlas(
      "army",
      "/assets/army-atlas.png",
      "/assets/army-atlas.json",
    );
    for (const team of ["red", "blue"])
      this.load.image(team + "castle", `/assets/${team}-castle.png`);
    for (const key of [
      "meadow",
      "road",
      "sun-mountains",
      "sun-forest",
      "arrow",
      "fireball",
      "ice",
      "spark",
      "dust",
      "unit-shadow",
    ])
      this.load.image(key, `/assets/${key}.png`);
  }
  create() {
    const v = LIVE_VIEW.viewport;
    this.cameras.main
      .setViewport(v.x, v.y, v.width, v.height)
      .setBounds(0, 0, WORLD.width, WORLD.height)
      .setBackgroundColor("#b7d197");
    this.terrain();
    for (const [team, x] of WORLD.castles.entries()) {
      const y = projectY(WORLD.ground);
      this.add.ellipse(x, y + 20, 310, 130, 0x345c43, 0.18);
      this.add
        .image(x, y - 70, (team === 0 ? "red" : "blue") + "castle")
        .setScale(2.8)
        .setDepth(y - 120);
      const flag = this.add.graphics().setDepth(y - 119);
      flag.lineStyle(4, 0x6c7050).lineBetween(x, y - 320, x, y - 190);
      flag.fillStyle(team === 0 ? 0xe75e77 : 0x5b9fe8);
      flag.fillTriangle(x, y - 315, x + 65, y - 292, x, y - 265);
    }
    const ring = this.make.graphics({ x: 0, y: 0, add: false });
    ring.lineStyle(4, 0xffdf91, 0.9);
    ring.strokeEllipse(128, 48, 248, 78);
    ring.generateTexture("stomp-ring", 256, 96);
    ring.destroy();
    for (const team of ["red", "blue"])
      for (const type of Object.keys(TYPES))
        for (const [row, name] of ANIMATIONS.entries())
          this.anims.create({
            key: `${team}-${type}-${name}`,
            frames: this.anims.generateFrameNames("army", {
              prefix: `${team}-${type}-`,
              start: row * 8,
              end: row * 8 + 7,
            }),
            frameRate: name === "death" ? 10 : 12,
            repeat: ["death", "rage", "stomp"].includes(name) ? 0 : -1,
          });
    this.spritePool = this.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: 440,
    });
    this.shotPool = this.add.group({
      classType: Phaser.GameObjects.Image,
      maxSize: 650,
    });
    this.fxPool = this.add.group({
      classType: Phaser.GameObjects.Image,
      maxSize: 180,
    });
    this.shadowPool = this.add.group({
      classType: Phaser.GameObjects.Image,
      maxSize: 440,
    });
    this.bars = this.add.graphics().setDepth(2000);
    this.input.on("pointermove", (p) => {
      if (p.isDown && Math.abs(p.x - p.prevPosition.x) > 1) {
        requested = "manual";
        this.director.pan(
          -(p.x - p.prevPosition.x) / this.director.zoom,
          -(p.y - p.prevPosition.y) / this.director.zoom,
        );
      }
    });
    this.input.on("wheel", (_, __, dx, dy) => {
      requested = "manual";
      this.director.pan((dx || dy) / this.director.zoom);
    });
    // Read-only diagnostics support automated browser checks without exposing game controls.
    this.game.registry.set("cameraDiagnostics", {});
    this.ready = true;
  }
  terrain() {
    this.add.tileSprite(0, 0, WORLD.width, WORLD.height, "meadow").setOrigin(0);
    this.add
      .tileSprite(0, 120, WORLD.width, 500, "sun-mountains")
      .setOrigin(0)
      .setScrollFactor(0.88, 1)
      .setAlpha(0.6);
    this.add
      .tileSprite(0, 360, WORLD.width, 360, "sun-forest")
      .setOrigin(0)
      .setScrollFactor(0.95, 1)
      .setAlpha(0.68);
    const g = this.add.graphics();
    g.fillStyle(0x6f9f62, 0.35);
    g.fillRect(0, 705, WORLD.width, 50);
    g.fillStyle(0xdce0a3, 0.5);
    g.fillRect(0, 1470, WORLD.width, 45);
    this.add
      .tileSprite(0, WORLD.ground - 48, WORLD.width, 120, "road")
      .setOrigin(0)
      .setAlpha(0.68);
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 130; i++) {
      const x = rand() * WORLD.width,
        y = rand() < 0.5 ? 500 + rand() * 180 : 1520 + rand() * 500;
      g.fillStyle(0x5c9565);
      g.fillEllipse(x, y, 55, 25);
      g.fillStyle(0x87b574);
      g.fillEllipse(x - 6, y - 4, 38, 18);
      if (i % 3 === 0) {
        g.fillStyle(0xdbe6b4);
        g.fillEllipse(x + 25, y + 8, 17, 8);
      }
    }
    for (let x = 700; x < WORLD.width - 500; x += 350) {
      g.fillStyle(0x8d9e72);
      g.fillEllipse(x, 1525, 34, 12);
      g.fillStyle(0xc9d3a3);
      g.fillTriangle(x - 18, 1520, x, 1500, x + 19, 1525);
    }
  }
  take(pool, key, x, y, frame) {
    const obj = pool.get(x, y, key, frame);
    if (!obj) return null;
    return obj
      .setActive(true)
      .setVisible(true)
      .setTexture(key, frame)
      .setPosition(x, y)
      .setAlpha(1)
      .setRotation(0)
      .setFlipX(false)
      .setScale(1);
  }
  release(pool, obj) {
    if (!obj) return;
    this.tweens.killTweensOf(obj);
    obj.anims?.stop();
    pool.killAndHide(obj);
  }
  text(text, x, y, size = 15) {
    const obj =
      this.textFree.pop() ||
      this.add.text(0, 0, "", {
        fontFamily: "monospace",
        stroke: "#315747",
        strokeThickness: 3,
      });
    return obj
      .setActive(true)
      .setVisible(true)
      .setText(text)
      .setPosition(x, y)
      .setFontSize(size)
      .setColor("#fff2b9")
      .setStroke("#315747", 3)
      .setAlpha(1)
      .setOrigin(0.5)
      .setDepth(2500);
  }
  releaseText(text) {
    if (!text) return;
    this.tweens.killTweensOf(text);
    text.setActive(false).setVisible(false);
    this.textFree.push(text);
  }
  effectImage(key, x, y, scale = 1, duration = 450, tx = x, ty = y - 30) {
    if (this.fxActive.size >= (this.fxBudget || 100)) return;
    const obj = this.take(this.fxPool, key, x, y);
    if (!obj) return;
    obj.setScale(scale).setDepth(2100);
    this.fxActive.add(obj);
    this.tweens.add({
      targets: obj,
      x: tx,
      y: ty,
      alpha: 0,
      duration,
      onComplete: () => {
        this.fxActive.delete(obj);
        this.release(this.fxPool, obj);
      },
    });
    return obj;
  }
  particle(key, x, y, count = 2) {
    for (let i = 0; i < count; i++)
      this.effectImage(
        key,
        x,
        y,
        0.3 + Math.random() * 0.55,
        350 + Math.random() * 220,
        x + (Math.random() - 0.5) * 48,
        y - 10 - Math.random() * 28,
      );
  }
  visible(x, y, padding = 150) {
    const c = this.view;
    return (
      !c ||
      (x > c.left - padding &&
        x < c.right + padding &&
        y > c.top - padding &&
        y < c.bottom + padding)
    );
  }
  effect(e) {
    const y = projectY(e.y) - (e.air ? 115 : 20);
    if (!this.visible(e.x, y) || this.fxActive.size > (this.fxBudget || 100))
      return;
    if (["hit", "block"].includes(e.type)) {
      if (this.damageTexts < (this.textBudget || 24)) {
        this.damageTexts++;
        const t = this.text(
          (e.type === "block" ? "BLOCK " : "−") + e.amount,
          e.x,
          y - 25,
          14,
        );
        this.tweens.add({
          targets: t,
          y: y - 65,
          alpha: 0,
          duration: 600,
          onComplete: () => {
            this.damageTexts--;
            this.releaseText(t);
          },
        });
      }
      this.particle("spark", e.x, y, 1);
    } else if (["meteor", "ice"].includes(e.type)) {
      const obj = this.effectImage(
        e.type === "ice" ? "ice" : "fireball",
        e.x - 80,
        y - 260,
        2.5,
        450,
        e.x,
        y,
      );
      obj?.setRotation(0.95);
    } else if (e.type === "stomp") {
      this.effectImage(
        "stomp-ring",
        e.x,
        projectY(e.y),
        e.radius / 100,
        550,
        e.x,
        projectY(e.y),
      );
      this.particle("dust", e.x, projectY(e.y), 5);
    } else
      this.particle(
        e.type === "explosion"
          ? "fireball"
          : e.type === "heal"
            ? "ice"
            : "spark",
        e.x,
        y,
        3,
      );
  }
  releaseUnit(o) {
    this.release(this.spritePool, o.s);
    this.release(this.shadowPool, o.shadow);
    this.releaseText(o.label);
    o.label = null;
  }
  miniMap(time, c) {
    if (time - this.lastMap < 160) return;
    this.lastMap = time;
    const el = document.getElementById("cameraView");
    if (el) {
      el.style.left = (c.left / WORLD.width) * 100 + "%";
      el.style.width = ((c.right - c.left) / WORLD.width) * 100 + "%";
    }
    const map = document.getElementById("mapDots");
    if (map) {
      const ctx = map.getContext("2d");
      ctx.clearRect(0, 0, map.width, map.height);
      for (const u of state.units)
        if (u.hp > 0) {
          ctx.fillStyle = u.team === 0 ? "#ff9a99" : "#8ac8ff";
          ctx.fillRect(
            (u.x / WORLD.width) * map.width,
            ((u.y - WORLD.laneMin) / (WORLD.laneMax - WORLD.laneMin)) *
              (map.height - 8) +
              3,
            TYPES[u.type].scale > 2 ? 5 : 3,
            3,
          );
        }
    }
  }
  update(time, delta) {
    if (!state || !this.ready) return;
    const dt = Math.min(delta / 50, 1);
    if (this.round !== state.round) {
      for (const o of this.units.values()) this.releaseUnit(o);
      for (const s of this.shots.values()) this.release(this.shotPool, s);
      this.units.clear();
      this.shots.clear();
      this.round = state.round;
      this.fxId = 0;
      this.damageTexts ??= 0;
    }
    this.director.request = requested;
    const chosen = this.director.update(state, time / 1000),
      c = this.cameras.main;
    c.setZoom(chosen.zoom);
    c.centerOn(chosen.x, chosen.y);
    const hw = LIVE_VIEW.viewport.width / (2 * chosen.zoom),
      hh = LIVE_VIEW.viewport.height / (2 * chosen.zoom);
    this.view = {
      left: chosen.x - hw,
      right: chosen.x + hw,
      top: chosen.y - hh,
      bottom: chosen.y + hh,
    };
    this.game.registry.set("cameraDiagnostics", {
      ...chosen,
      view: { ...this.view },
      canvas: { width: 1080, height: 1920 },
      activeUnits: state.units.filter((u) => u.hp > 0).length,
      pooled: this.spritePool.getLength(),
      reused: this.reusedSprites,
    });
    const status = document.getElementById("directorStatus");
    if (status)
      status.textContent =
        chosen.mode.replaceAll("_", " ").toUpperCase() +
        ` · ZONE ${chosen.region + 1} · ${chosen.zoom.toFixed(2)}×`;
    // A DOM data attribute exposes only the camera pose, for compatibility/browser smoke checks.
    const host = document.getElementById("game");
    if (host) {
      host.dataset.renderer =
        this.game.renderer.type === Phaser.CANVAS ? "canvas" : "webgl";
      host.dataset.cameraX = chosen.x.toFixed(1);
      host.dataset.cameraZoom = chosen.zoom.toFixed(3);
      host.dataset.cameraMode = chosen.mode;
      host.dataset.pool = String(this.spritePool.getLength());
      host.dataset.reused = String(this.reusedSprites);
    }
    this.miniMap(time, this.view);
    this.fxBudget = state.units.length > 160 ? 64 : 120;
    this.textBudget = state.units.length > 160 ? 12 : 30;
    this.bars.clear();
    const ids = new Set();
    for (const u of state.units) {
      ids.add(u.id);
      const t = TYPES[u.type],
        baseY = projectY(u.y),
        air = t.air ? 108 + Math.sin(time / 260 + u.id) * 6 : 0,
        shown = this.visible(u.x, baseY, 200);
      let o = this.units.get(u.id);
      if (!o && shown) {
        const frame = `${u.team === 0 ? "red" : "blue"}-${u.type}-0`;
        const previous = this.spritePool.getLength();
        const s = this.take(this.spritePool, "army", u.x, baseY - air, frame);
        if (!s) continue;
        if (this.spritePool.getLength() === previous) this.reusedSprites++;
        o = { s, label: null, team: u.team, type: u.type };
        this.units.set(u.id, o);
      }
      if (!o) continue;
      if (o.removing) continue;
      o.s.setVisible(shown);
      if (!shown) {
        o.s.anims.pause();
        if (o.shadow) {
          this.release(this.shadowPool, o.shadow);
          o.shadow = null;
        }
        if (o.label) {
          this.releaseText(o.label);
          o.label = null;
        }
        continue;
      }
      o.s.x = Phaser.Math.Linear(o.s.x, u.x, dt);
      o.s.y = Phaser.Math.Linear(o.s.y, baseY - air, dt);
      o.s
        .setOrigin(0.5, 0.9)
        .setScale(t.scale * 0.85)
        .setFlipX(u.team === 1)
        .setDepth(baseY + 100 + (t.air ? 80 : 0));
      const animation =
        u.hp <= 0
          ? "death"
          : state.paused ||
              ["prepare", "results", "countdown"].includes(
                state.roundState?.phase,
              )
            ? "idle"
            : u.state;
      const key = `${u.team === 0 ? "red" : "blue"}-${u.type}-${animation}`;
      if (o.s.anims.currentAnim?.key !== key) o.s.play(key);
      else if (o.s.anims.isPaused && !state.paused) o.s.anims.resume();
      o.s.anims.timeScale = state.paused ? 0 : 1;
      const top = o.s.y - 52 * t.scale * 0.85;
      const labelWanted =
        u.hp > 0 &&
        (state.units.length < 70 || (t.scale > 2 && this.units.size < 120));
      if (labelWanted) {
        if (!o.label)
          o.label = this.text(u.name, u.x, top - 12, 14)
            .setColor(u.team === 0 ? "#7e2f40" : "#245d9b")
            .setStroke("#f2f3d7", 3);
        o.label.setPosition(o.s.x, top - 12).setVisible(true);
      } else if (o.label) {
        this.releaseText(o.label);
        o.label = null;
      }
      if (u.hp > 0) {
        if (!o.shadow)
          o.shadow = this.take(this.shadowPool, "unit-shadow", u.x, baseY);
        o.shadow
          ?.setPosition(u.x, baseY + 3)
          .setDisplaySize(30 * t.scale, 10 * t.scale)
          .setDepth(15);
        const w = 30 * t.scale * 0.85;
        this.bars.fillStyle(0x345044, 0.75);
        this.bars.fillRect(o.s.x - w / 2, top, w, 4);
        this.bars.fillStyle(u.team === 0 ? 0xf36b7b : 0x4f94db);
        this.bars.fillRect(o.s.x - w / 2, top, (w * u.hp) / u.maxHp, 4);
      }
      if (u.hp <= 0 && o.shadow) {
        this.release(this.shadowPool, o.shadow);
        o.shadow = null;
      }
      if (u.state === "run" && time % 200 < delta && state.units.length < 120)
        this.particle("dust", u.x, baseY, 1);
    }
    for (const [id, o] of this.units) {
      if (!ids.has(id) && !o.removing) {
        o.removing = true;
        if (o.label) {
          this.releaseText(o.label);
          o.label = null;
        }
        o.s.anims.timeScale = 1;
        o.s.play(`${o.team === 0 ? "red" : "blue"}-${o.type}-death`);
        o.removeAt = time + 800;
      }
      if (o.removing && time >= o.removeAt) {
        this.releaseUnit(o);
        this.units.delete(id);
      }
    }
    const shots = new Set();
    for (const p of state.projectiles) {
      shots.add(p.id);
      const y = projectY(p.y) - (p.lift || 0);
      let s = this.shots.get(p.id);
      if (!s && this.visible(p.x, y)) {
        s = this.take(
          this.shotPool,
          p.kind === "fireball" ? "fireball" : "arrow",
          p.x,
          y,
        );
        if (s) this.shots.set(p.id, s);
      }
      if (!s) continue;
      s.setVisible(this.visible(p.x, y));
      s.setPosition(
        Phaser.Math.Linear(s.x, p.x, dt),
        Phaser.Math.Linear(s.y, y, dt),
      )
        .setRotation(Math.atan2(projectY(p.ty) - y, p.tx - p.x))
        .setScale(p.kind === "fireball" ? 1.3 : 1.15)
        .setDepth(2200);
    }
    for (const [id, s] of this.shots)
      if (!shots.has(id)) {
        this.release(this.shotPool, s);
        this.shots.delete(id);
      }
    for (const e of state.effects)
      if (e.id > this.fxId) {
        this.fxId = e.id;
        this.effect(e);
      }
  }
}
