import Phaser from "phaser";

/**
 * GDD §3 — persistent hub placeholder (Phase 0).
 */
export default class TownStubScene extends Phaser.Scene {
  constructor() {
    super({ key: "TownStubScene" });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.game.registry.set("run", { floor: 1, riftCards: [] });
    this.game.registry.set("playerHp", 100);
    this.game.registry.set("playerMaxHp", 100);

    this.add
      .rectangle(0, 0, w, h, 0x141008)
      .setOrigin(0)
      .setInteractive();

    this.add
      .text(w / 2, h * 0.18, "Town (stub)", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "22px",
        color: "#e8e6e3",
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h * 0.28, "Shops and the Rift Portal will live here.", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#8a8580",
        align: "center",
        wordWrap: { width: w - 48 },
      })
      .setOrigin(0.5);

    const btn = this.add
      .text(w / 2, h * 0.5, "Enter the Rift →", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "18px",
        color: "#c9a227",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on("pointerdown", () => {
      this.scene.start("DungeonStubScene");
    });
  }
}
