import Phaser from "phaser";

import { CANVAS } from "../config";

/**
 * Fit a scene laid out on the 1280x720 design frame into whatever the
 * viewport is, by zooming its camera. The menu scenes are pages, not a world:
 * they keep their layout and scale as one piece, centred, and paint the
 * ground behind them to the edges so nothing reads as a bar.
 *
 * Call once from `create`. It listens for resizes until the scene shuts down.
 */
export function fitDesignFrame(scene: Phaser.Scene): void {
  const apply = () => {
    const { width, height } = scene.scale;
    const zoom = Math.min(width / CANVAS.width, height / CANVAS.height);
    scene.cameras.main.setZoom(zoom).centerOn(CANVAS.width / 2, CANVAS.height / 2);
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, apply));
}

/** A ground that covers the viewport at any zoom. */
export function paintGround(scene: Phaser.Scene, colour: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(CANVAS.width / 2, CANVAS.height / 2, CANVAS.width * 6, CANVAS.height * 6, colour);
}
