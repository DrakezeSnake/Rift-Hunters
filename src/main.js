import Phaser from "phaser";
import BootScene from "./scenes/BootScene.js";
import TownStubScene from "./scenes/TownStubScene.js";
import DungeonStubScene from "./scenes/DungeonStubScene.js";
import BattleScene from "./scenes/BattleScene.js";
import RiftCardScene from "./scenes/RiftCardScene.js";

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: 390,
  height: 844,
  backgroundColor: "#0d0d0d",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    TownStubScene,
    DungeonStubScene,
    BattleScene,
    RiftCardScene,
  ],
};

new Phaser.Game(config);
