import Phaser from "phaser";
import { RIFT_CARD_DEFS } from "../game/data.js";
import { gameEvents } from "../game/events.js";

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * GDD §6 — pick 1 of 3 cards between encounters (Phase 0 pool).
 */
export default class RiftCardScene extends Phaser.Scene {
  constructor() {
    super({ key: "RiftCardScene" });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    const rng =
      this.game.registry.get("riftRng") || (() => Math.random());

    this.add
      .rectangle(w / 2, h / 2, w, h, 0x0d0d0d, 0.88)
      .setInteractive();

    this.add
      .text(w / 2, h * 0.12, "Choose a Rift Card", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "20px",
        color: "#e8e6e3",
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h * 0.17, "Mutates rules for the rest of this run.", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "13px",
        color: "#8a8580",
      })
      .setOrigin(0.5);

    const pool = shuffle(
      ["ember_core", "frozen_clockwork", "bloodpact"],
      rng
    );

    const cardW = Math.min(108, (w - 48) / 3);
    const baseX = w / 2 - cardW * 1.5 - 16;
    const y = h * 0.48;

    for (let i = 0; i < 3; i++) {
      const id = pool[i];
      const def = RIFT_CARD_DEFS[id];
      const x = baseX + i * (cardW + 16);

      const bg = this.add
        .rectangle(x + cardW / 2, y, cardW, cardW * 1.45, 0x1a1a1a, 1)
        .setStrokeStyle(2, 0x3a3a3a)
        .setInteractive({ useHandCursor: true });

      this.add
        .text(x + cardW / 2, y - cardW * 0.52, def.name, {
          fontFamily: "system-ui, Segoe UI, sans-serif",
          fontSize: "13px",
          color: "#c9a227",
          align: "center",
          wordWrap: { width: cardW - 8 },
        })
        .setOrigin(0.5, 0);

      this.add
        .text(x + cardW / 2, y - cardW * 0.2, def.description, {
          fontFamily: "system-ui, Segoe UI, sans-serif",
          fontSize: "11px",
          color: "#b8b3ad",
          align: "center",
          wordWrap: { width: cardW - 10 },
        })
        .setOrigin(0.5, 0);

      bg.on("pointerdown", () => this.pickCard(id));
    }
  }

  pickCard(id) {
    const run = this.game.registry.get("run");
    if (!run) return;
    run.riftCards.push(id);
    run.floor++;

    this.scene.resume("DungeonStubScene");
    this.scene.stop("BattleScene");
    this.scene.stop("RiftCardScene");

    gameEvents.emit("battle-won");
  }
}
