import Phaser from "phaser";

/** Cross-scene signals (GDD §11.4 event-bus pattern). */
export const gameEvents = new Phaser.Events.EventEmitter();
