import Phaser from "phaser";

import { GRAVITY_Y, PHYSICS_FPS } from "./game/config";
import { MatchScene } from "./game/scenes/MatchScene";
import { SelectScene } from "./game/scenes/SelectScene";
import { SeasonScene } from "./game/scenes/SeasonScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",

  width: "100%",
  height: "100%",
  backgroundColor: "#05070c",
  physics: {
    default: "matter",
    matter: {
      gravity: { x: 0, y: GRAVITY_Y },

      runner: { fps: PHYSICS_FPS },
      debug: false,
    },
  },
  scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
  scene: [SelectScene, SeasonScene, MatchScene],
});

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__game = game;
