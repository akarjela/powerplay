import Phaser from "phaser";

import { CANVAS, GRAVITY_Y, PHYSICS_FPS } from "./game/config";
import { MatchScene } from "./game/scenes/MatchScene";
import { SelectScene } from "./game/scenes/SelectScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: CANVAS.width,
  height: CANVAS.height,
  backgroundColor: "#183b1f",
  physics: {
    default: "matter",
    matter: {
      // See GRAVITY_Y in config.ts: empirical, and shared with the harness.
      gravity: { x: 0, y: GRAVITY_Y },
      // See PHYSICS_FPS in config.ts: at 60Hz a full swing tunnels through the
      // ball entirely. Matter has no CCD, so the step has to be small instead.
      runner: { fps: PHYSICS_FPS },
      debug: false,
    },
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [SelectScene, MatchScene],
});

// Dev-only handle so the running simulation can be measured from the console.
// Matter's setVelocity semantics are version-dependent; guessing at them is how
// you end up with a 138kph delivery that ambles in at 30.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__game = game;
