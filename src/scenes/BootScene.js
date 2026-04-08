import Phaser from "phaser";
import * as Data from "../game/data.js";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    const base = import.meta.env.BASE_URL || "/";
    Data.TILE_TYPES.forEach((t) => {
      this.load.image(`tile_${t}`, Data.svgDataUriTile(t));
    });
    this.load.image("bg_act1", `${base}assets/Backgrounds/act1.png`);
    this.load.image("hunter_kael", `${base}assets/Hunters/Kael_back.png`);
    this.load.image("monster_thorn", `${base}assets/monster/Thornback.png`);
    this.load.image("monster_bog", `${base}assets/monster/Bog wraith.png`);
  }

  create() {
    this.scene.start("TownStubScene");
  }
}
