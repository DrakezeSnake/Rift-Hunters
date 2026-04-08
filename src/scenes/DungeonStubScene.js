import Phaser from "phaser";
import { gameEvents } from "../game/events.js";

/**
 * GDD §4 overworld placeholder — overlap triggers BattleScene (Phase 0).
 */
export default class DungeonStubScene extends Phaser.Scene {
  constructor() {
    super({ key: "DungeonStubScene" });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.physics.world.setBounds(0, 0, w, h);

    this.battlePending = false;

    this.add
      .image(w / 2, h / 2, "bg_act1")
      .setDisplaySize(w, h * 0.55)
      .setY(h * 0.32);

    this.add
      .text(w / 2, 36, "Dungeon (stub)", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "16px",
        color: "#e8e6e3",
      })
      .setOrigin(0.5);

    this.add
      .text(
        w / 2,
        58,
        "Walk into the red wretch to fight (match-3 battle).",
        {
          fontFamily: "system-ui, Segoe UI, sans-serif",
          fontSize: "12px",
          color: "#8a8580",
          align: "center",
          wordWrap: { width: w - 40 },
        }
      )
      .setOrigin(0.5);

    this.player = this.physics.add
      .sprite(w * 0.35, h * 0.55, "hunter_kael")
      .setDisplaySize(72, 72)
      .setCollideWorldBounds(true);

    this.player.body.setSize(40, 40);

    this.spawnMonster();

    this.cursors = this.input.keyboard.createCursorKeys();

    this.debugEnd = this.add
      .text(12, h - 28, "Arrows / drag player", {
        fontSize: "11px",
        color: "#666",
      })
      .setOrigin(0, 1);

    gameEvents.on("battle-won", this.onBattleWon, this);
    gameEvents.on("battle-lost", this.onBattleLost, this);

    this.events.once("shutdown", () => {
      gameEvents.off("battle-won", this.onBattleWon, this);
      gameEvents.off("battle-lost", this.onBattleLost, this);
    });

    this.input.on("pointermove", (p) => {
      if (this.battlePending) return;
      const tx = Phaser.Math.Clamp(p.worldX, 40, w - 40);
      const ty = Phaser.Math.Clamp(p.worldY, h * 0.35, h - 80);
      this.player.setPosition(tx, ty);
    });
  }

  spawnMonster() {
    const w = this.scale.width;
    const h = this.scale.height;
    if (this.overlapCollider) {
      this.overlapCollider.destroy();
      this.overlapCollider = null;
    }
    if (this.monsterSprite) {
      this.monsterSprite.destroy();
      this.monsterSprite = null;
    }
    this.monsterSprite = this.physics.add
      .sprite(w * 0.62, h * 0.52, "monster_thorn")
      .setDisplaySize(64, 64);
    this.monsterSprite.body.setSize(48, 48);
    this.overlapCollider = this.physics.add.overlap(
      this.player,
      this.monsterSprite,
      () => this.triggerBattle(),
      null,
      this
    );
  }

  triggerBattle() {
    if (this.battlePending) return;
    this.battlePending = true;
    this.scene.pause("DungeonStubScene");
    this.scene.launch("BattleScene");
  }

  onBattleWon() {
    this.battlePending = false;
    const w = this.scale.width;
    const h = this.scale.height;
    this.player.setPosition(w * 0.35, h * 0.55);
    this.spawnMonster();
  }

  onBattleLost() {
    this.battlePending = false;
    this.scene.stop("DungeonStubScene");
    this.scene.start("TownStubScene");
  }

  update() {
    if (this.battlePending) return;
    const speed = 180;
    const body = this.player.body;
    body.setVelocity(0);
    if (this.cursors.left.isDown) body.setVelocityX(-speed);
    else if (this.cursors.right.isDown) body.setVelocityX(speed);
    if (this.cursors.up.isDown) body.setVelocityY(-speed);
    else if (this.cursors.down.isDown) body.setVelocityY(speed);
  }
}
