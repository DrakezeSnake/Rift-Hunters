import Phaser from "phaser";
import * as RG from "../game/grid.js";
import * as RC from "../game/combat.js";
import { TILE_SPAWN_WEIGHTS, RIFT_CARD_DEFS } from "../game/data.js";
import { monsterForFloor } from "../game/monster.js";
import { mulberry32 } from "../game/rng.js";
import { gameEvents } from "../game/events.js";

const MATCH_VFX_MS = 400;
const MATCH_HOLE_BEAT_MS = 420;
const TIMER_RADIUS = 22;
const CIRC = 2 * Math.PI * TIMER_RADIUS;

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: "BattleScene" });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    const run = this.game.registry.get("run") || { floor: 1, riftCards: [] };
    const playerHp = this.game.registry.get("playerHp") ?? 100;
    const playerMaxHp = this.game.registry.get("playerMaxHp") ?? 100;

    this.cellSize = Math.max(
      36,
      Math.floor(
        Math.min((w - 32) / RG.COLS - 4, (h * 0.5) / RG.ROWS - 4)
      )
    );
    this.gap = 4;
    this.step = this.cellSize + this.gap;
    this.gridOx = (w - (RG.COLS * this.step - this.gap)) / 2;
    this.gridOy = h * 0.42;

    this.s = {
      grid: null,
      monster: monsterForFloor(run.floor),
      hunter: {
        name: "Kael",
        elementType: "blade",
        portraitId: "Kael_back",
        specialCharge: 0,
        specialNeeded: 12,
        specialReady: false,
        specialArmed: false,
        readyToastShown: false,
      },
      playerHp,
      playerMaxHp,
      run,
      monsterTimer: 0,
      paused: false,
      telegraphTick: -1,
      rng: mulberry32((Date.now() ^ (run.floor * 0x9e3779b9)) >>> 0),
      animating: false,
    };
    this.s.monsterTimer = this.s.monster.attackTimerMax;

    this.add
      .image(w / 2, h * 0.22, "bg_act1")
      .setDisplaySize(w, h * 0.42)
      .setAlpha(0.35);

    this.tileSprites = [];
    for (let r = 0; r < RG.ROWS; r++) {
      this.tileSprites[r] = [];
      for (let c = 0; c < RG.COLS; c++) {
        this.tileSprites[r][c] = null;
      }
    }

    this.selectedCell = null;

    this.add
      .text(12, 12, this.s.monster.name, {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "15px",
        color: "#e8e6e3",
      })
      .setName("monsterName");

    this.add
      .text(12, 30, this.elementLabel(this.s.monster.affinityKey), {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "12px",
        color: "#c9a227",
      })
      .setName("monsterElem");

    this.monsterPortrait = this.add
      .image(w - 56, 52, this.monsterTextureKey(this.s.monster.portraitId))
      .setDisplaySize(72, 72);

    this.txtMonsterHp = this.add.text(12, 52, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#e8e6e3",
    });

    this.txtPlayerHp = this.add.text(12, h * 0.3, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#8fd491",
    });

    this.txtHunter = this.add.text(12, h * 0.3 + 18, "Kael · Blade", {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "12px",
      color: "#8a8580",
    });

    this.txtFloor = this.add.text(w - 12, 12, `Floor ${run.floor}`, {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "12px",
      color: "#8a8580",
    }).setOrigin(1, 0);

    this.txtToast = this.add
      .text(w / 2, h * 0.36, "", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#fff",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.timerG = this.add.graphics();
    this.timerIcon = this.add.text(w - 40, 118, "⚔", {
      fontSize: "18px",
    }).setOrigin(0.5);

    this.hunterPortrait = this.add
      .image(48, h * 0.33, "hunter_kael")
      .setDisplaySize(56, 56)
      .setInteractive({ useHandCursor: true });

    this.hunterPortrait.on("pointerdown", () => this.tryCastHunterSpecial());

    this.txtSpecial = this.add.text(90, h * 0.33 + 8, "Special: ░░░░░░░░░░░░", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#aaa",
    });

    this.txtRift = this.add.text(12, h * 0.38, "", {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "10px",
      color: "#6a6a6a",
      wordWrap: { width: w - 24 },
    });

    this.ensurePlayableGrid();
    this.renderGrid();
    this.refreshHudStatic();
    this.txtMonsterHp.setText(
      `${Math.ceil(this.s.monster.hp)} / ${this.s.monster.maxHp}`
    );
    this.txtPlayerHp.setText(
      `HP ${Math.ceil(this.s.playerHp)} / ${this.s.playerMaxHp}`
    );
    this.updateSpecialText();
    this.drawTimerRing();
  }

  monsterTextureKey(portraitId) {
    const s = String(portraitId || "");
    if (s === "Thornback") return "monster_thorn";
    if (s.includes("Bog") || s === "Bog wraith") return "monster_bog";
    return "monster_thorn";
  }

  elementLabel(key) {
    const m = {
      blade: "Blade",
      ember: "Ember",
      tide: "Tide",
      spark: "Spark",
      root: "Root",
      void: "Void",
      divine: "Divine",
    };
    return m[key] || key;
  }

  gridX(c) {
    return this.gridOx + c * this.step + this.cellSize / 2;
  }

  gridY(r) {
    return this.gridOy + r * this.step + this.cellSize / 2;
  }

  ensurePlayableGrid() {
    let guard = 0;
    do {
      this.s.grid = RG.createInitialGrid(this.s.rng, TILE_SPAWN_WEIGHTS);
      guard++;
    } while (RG.findMatchCells(this.s.grid).length > 0 && guard < 80);
  }

  showToast(text, ms) {
    this.txtToast.setText(text);
    this.txtToast.setAlpha(1);
    this.tweens.add({
      targets: this.txtToast,
      alpha: 0,
      delay: ms || 900,
      duration: 400,
    });
  }

  refreshHudStatic() {
    const cards = this.s.run.riftCards || [];
    if (cards.length === 0) {
      this.txtRift.setText("");
    } else {
      const names = cards.map(
        (id) => RIFT_CARD_DEFS[id]?.name || id
      );
      this.txtRift.setText("Rift: " + names.join(" · "));
    }
  }

  renderGrid() {
    const g = this.s.grid;
    for (let r = 0; r < RG.ROWS; r++) {
      for (let c = 0; c < RG.COLS; c++) {
        const cell = g[r][c];
        let img = this.tileSprites[r][c];
        if (!cell.type) {
          if (img) img.setVisible(false);
          continue;
        }
        if (!img) {
          const rr = r;
          const cc = c;
          img = this.add
            .image(this.gridX(cc), this.gridY(rr), `tile_${cell.type}`)
            .setDisplaySize(this.cellSize, this.cellSize)
            .setInteractive({ useHandCursor: true });
          img.on("pointerdown", () => this.onTilePointerDown(rr, cc));
          this.tileSprites[r][c] = img;
        }
        img.setVisible(true);
        img.setTexture(`tile_${cell.type}`);
        img.setPosition(this.gridX(c), this.gridY(r));
        img.setDepth(r * RG.COLS + c);
        if (cell.special === "power") {
          img.setTint(0xfff0a0);
        } else if (cell.special === "rift") {
          img.setTint(0xd4a5ff);
        } else {
          img.clearTint();
        }
        const sel =
          this.selectedCell &&
          this.selectedCell.r === r &&
          this.selectedCell.c === c;
        img.setScale(sel ? 1.06 : 1);
      }
    }
  }

  onTilePointerDown(r, c) {
    if (this.s.paused || this.s.animating) return;
    if (!this.s.grid[r][c].type) return;

    if (!this.selectedCell) {
      this.selectedCell = { r, c };
      this.renderGrid();
      return;
    }
    const a = this.selectedCell;
    if (a.r === r && a.c === c) {
      this.selectedCell = null;
      this.renderGrid();
      return;
    }
    const dr = Math.abs(a.r - r);
    const dc = Math.abs(a.c - c);
    if (dr + dc === 1) {
      this.trySwap(a.r, a.c, r, c);
      this.selectedCell = null;
    } else {
      this.selectedCell = { r, c };
    }
    this.renderGrid();
  }

  trySwap(r1, c1, r2, c2) {
    this.s.animating = true;
    RG.swapCells(this.s.grid, r1, c1, r2, c2);
    this.renderGrid();
    if (RG.findMatchCells(this.s.grid).length === 0) {
      RG.swapCells(this.s.grid, r1, c1, r2, c2);
      this.renderGrid();
      this.s.animating = false;
      return;
    }
    this.resolveCascadeAnimated(() => {
      this.s.animating = false;
    });
  }

  snapshotColumnStacks(grid) {
    const cols = [];
    for (let c = 0; c < RG.COLS; c++) {
      const stack = [];
      for (let r = RG.ROWS - 1; r >= 0; r--) {
        if (grid[r][c].type !== null) {
          stack.push({
            r: r,
            type: grid[r][c].type,
            special: grid[r][c].special,
          });
        }
      }
      cols.push(stack);
    }
    return cols;
  }

  computeGravityFallMap(grid) {
    const before = this.snapshotColumnStacks(grid);
    RG.applyGravity(grid);
    const after = this.snapshotColumnStacks(grid);
    const map = new Map();
    for (let c = 0; c < RG.COLS; c++) {
      const a = before[c];
      const b = after[c];
      if (a.length !== b.length) continue;
      for (let i = 0; i < a.length; i++) {
        const dr = b[i].r - a[i].r;
        if (dr > 0) {
          map.set(RG.cellKey(b[i].r, c), dr);
        }
      }
    }
    return map;
  }

  fillEmptyWithFallDistances(grid, fallMap) {
    for (let c = 0; c < RG.COLS; c++) {
      for (let r = 0; r < RG.ROWS; r++) {
        if (grid[r][c].type === null) {
          const t = RG.pickTileNoAutoMatch(
            grid,
            r,
            c,
            this.s.rng,
            TILE_SPAWN_WEIGHTS
          );
          grid[r][c] = RG.createCell(t, null);
          const k = RG.cellKey(r, c);
          const drop = RG.ROWS - r;
          const prev = fallMap.get(k) || 0;
          fallMap.set(k, Math.max(prev, drop));
        }
      }
    }
  }

  runFallTweens(fallMap, done) {
    if (!fallMap || fallMap.size === 0) {
      done();
      return;
    }
    let maxDur = 0;
    fallMap.forEach((rows, key) => {
      if (rows <= 0) return;
      const p = key.split(",");
      const r = +p[0];
      const c = +p[1];
      const spr = this.tileSprites[r][c];
      if (!spr || !this.s.grid[r][c].type) return;
      const dur = Math.min(320, 95 + rows * 36);
      maxDur = Math.max(maxDur, dur);
      const targetY = this.gridY(r);
      spr.y = targetY - rows * this.step;
      this.tweens.add({
        targets: spr,
        y: targetY,
        duration: dur,
        ease: "Cubic.out",
      });
    });
    this.time.delayedCall(maxDur + 50, done);
  }

  chargeHunterSpecialFromTiles(tiles) {
    const h = this.s.hunter;
    if (h.specialReady) return;
    let gain = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].type === h.elementType) gain += 1;
    }
    if (!gain) return;
    h.specialCharge = Math.min(h.specialNeeded, h.specialCharge + gain);
    if (h.specialCharge >= h.specialNeeded) {
      h.specialCharge = h.specialNeeded;
      h.specialReady = true;
      if (!h.readyToastShown) {
        h.readyToastShown = true;
        this.showToast("READY", 1000);
      }
    }
  }

  tryCastHunterSpecial() {
    const h = this.s.hunter;
    if (!h.specialReady) return;
    h.specialReady = false;
    h.specialArmed = true;
    h.specialCharge = 0;
    this.showToast("Iron Surge", 900);
    this.updateSpecialText();
  }

  updateSpecialText() {
    const h = this.s.hunter;
    const n = h.specialNeeded;
    const f = h.specialCharge;
    const bar =
      "█".repeat(Math.floor((f / n) * 12)) +
      "░".repeat(12 - Math.floor((f / n) * 12));
    this.txtSpecial.setText("Special: " + bar);
    if (h.specialReady) {
      this.hunterPortrait.setTint(0xffffcc);
    } else {
      this.hunterPortrait.clearTint();
    }
  }

  applyMonsterBoardPressure() {
    if (!this.s.monster?.behaviors?.tileDrain) return;
    const candidates = [];
    for (let r = 0; r < RG.ROWS; r++) {
      for (let c = 0; c < RG.COLS; c++) {
        if (this.s.grid[r][c].type !== null) {
          candidates.push({ r, c });
        }
      }
    }
    if (!candidates.length) return;
    const pick =
      candidates[Math.floor(this.s.rng() * candidates.length)];
    this.s.grid[pick.r][pick.c] = RG.createCell(null, null);
    const fallMap = this.computeGravityFallMap(this.s.grid);
    this.fillEmptyWithFallDistances(this.s.grid, fallMap);
    this.renderGrid();
    this.showToast("Tile Drain", 700);
  }

  resolveCascadeAnimated(onComplete) {
    let cascadeIndex = 0;

    const waveStep = () => {
      if (!this.scene.isActive()) return;
      if (this.s.paused) return;
      const matchCells = RG.findMatchCells(this.s.grid);
      if (matchCells.length === 0) {
        onComplete({ waveCount: cascadeIndex });
        return;
      }

      const clearList = RG.buildClearSet(this.s.grid, matchCells);
      const keySet = new Set();
      for (let i = 0; i < clearList.length; i++) {
        keySet.add(RG.cellKey(clearList[i][0], clearList[i][1]));
      }
      const specialSpawn = RG.pickSpecialSpawn(this.s.grid, keySet);

      const tiles = [];
      for (let i = 0; i < clearList.length; i++) {
        const r = clearList[i][0];
        const c = clearList[i][1];
        const cell = this.s.grid[r][c];
        tiles.push({
          r,
          c,
          type: cell.type,
          special: cell.special,
        });
      }

      const wave = { tiles, cascadeIndex };
      let res = RC.resolveWaveDamage(this.s, wave);
      this.chargeHunterSpecialFromTiles(tiles);
      if (this.s.hunter.specialArmed && cascadeIndex === 0) {
        res = {
          damage: Math.floor(res.damage * 3),
          heal: res.heal,
        };
        this.s.hunter.specialArmed = false;
      }

      this.time.delayedCall(MATCH_VFX_MS, () => {
        if (!this.scene.isActive() || this.s.paused) return;
        for (let i = 0; i < clearList.length; i++) {
          const r = clearList[i][0];
          const c = clearList[i][1];
          this.s.grid[r][c] = RG.createCell(null, null);
        }
        if (specialSpawn) {
          this.s.grid[specialSpawn.r][specialSpawn.c] = RG.createCell(
            specialSpawn.type,
            specialSpawn.special
          );
        }

        this.renderGrid();

        this.time.delayedCall(MATCH_HOLE_BEAT_MS, () => {
          if (!this.scene.isActive() || this.s.paused) return;
          const fallMap = this.computeGravityFallMap(this.s.grid);
          this.fillEmptyWithFallDistances(this.s.grid, fallMap);
          this.renderGrid();
          this.runFallTweens(fallMap, () => {
            if (!this.scene.isActive() || this.s.paused) return;
            this.s.monster.hp -= res.damage;
            this.s.playerHp = Math.min(
              this.s.playerMaxHp,
              this.s.playerHp + res.heal
            );
            this.game.registry.set("playerHp", this.s.playerHp);
            if (res.damage > 0) {
              this.s.monsterTimer = Math.min(
                this.s.monsterTimer + 0.5,
                this.s.monster.attackTimerMax
              );
            }
            this.txtMonsterHp.setText(
              `${Math.max(0, Math.ceil(this.s.monster.hp))} / ${this.s.monster.maxHp}`
            );
            this.txtPlayerHp.setText(
              `HP ${Math.max(0, Math.ceil(this.s.playerHp))} / ${this.s.playerMaxHp}`
            );
            this.updateSpecialText();

            if (this.s.monster.hp <= 0) {
              this.s.monster.hp = 0;
              this.s.paused = true;
              this.game.registry.set("riftRng", this.s.rng);
              this.scene.pause("BattleScene");
              this.scene.launch("RiftCardScene");
              return;
            }
            cascadeIndex += 1;
            this.time.delayedCall(50, waveStep);
          });
        });
      });
    };

    waveStep();
  }

  drawTimerRing() {
    const w = this.scale.width;
    const cx = w - 40;
    const cy = 118;
    const maxT = this.s.monster.attackTimerMax;
    const t = Math.max(0, Math.min(1, this.s.monsterTimer / maxT));
    this.timerG.clear();
    this.timerG.lineStyle(5, 0x333333, 1);
    this.timerG.strokeCircle(cx, cy, TIMER_RADIUS);
    this.timerG.lineStyle(5, 0xc9a227, 1);
    this.timerG.beginPath();
    this.timerG.arc(cx, cy, TIMER_RADIUS, -Math.PI / 2, -Math.PI / 2 + CIRC * t, false);
    this.timerG.strokePath();
  }

  update(_time, delta) {
    if (this.s.paused || !this.s.monster || this.s.monster.hp <= 0) {
      this.drawTimerRing();
      return;
    }
    const dt = delta / 1000;
    let behaviorSpeed = 1;
    if (
      this.s.monster.behaviors &&
      this.s.monster.behaviors.berserk &&
      this.s.monster.maxHp > 0 &&
      this.s.monster.hp / this.s.monster.maxHp <= 0.3
    ) {
      behaviorSpeed = 1.8;
    }
    const spd = RC.timerSpeedMultiplier(this.s) * behaviorSpeed;
    this.s.monsterTimer -= dt * spd;

    if (
      this.s.monster.behaviors &&
      this.s.monster.behaviors.chargeTelegraph
    ) {
      const tick = Math.max(0, Math.ceil(this.s.monsterTimer));
      if (tick <= 3 && tick > 0 && tick !== this.s.telegraphTick) {
        this.s.telegraphTick = tick;
        this.showToast("Charge in " + tick, 500);
      }
    }

    if (this.s.monsterTimer <= 0) {
      this.s.monsterTimer = 0;
      const dmg = RC.monsterDamageToPlayer(
        this.s,
        this.s.monster.attackDamage
      );
      this.s.playerHp -= dmg;
      this.s.monsterTimer = this.s.monster.attackTimerMax;
      this.s.telegraphTick = -1;
      this.game.registry.set("playerHp", this.s.playerHp);
      this.applyMonsterBoardPressure();
      this.txtPlayerHp.setText(
        `HP ${Math.max(0, Math.ceil(this.s.playerHp))} / ${this.s.playerMaxHp}`
      );
      if (this.s.playerHp <= 0) {
        this.s.playerHp = 0;
        this.s.paused = true;
        this.scene.stop("BattleScene");
        this.scene.resume("DungeonStubScene");
        gameEvents.emit("battle-lost");
        return;
      }
    }

    this.drawTimerRing();
  }
}
