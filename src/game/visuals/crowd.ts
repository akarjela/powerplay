import Phaser from "phaser";

import type { Camera, Viewport } from "../view/camera";
import { bakeCrowd } from "./stadium";
import type { CrowdFrame } from "./stadium";
import type { Kit } from "./figures";
import { reducedMotion } from "../hud/dom";

const IDLE: CrowdFrame[] = ["a", "b", "c"];

/**
 * The crowd as a living layer: four baked frames of the same people, stacked
 * as images over the stands, crossfaded. Idle, it drifts between three ways
 * of sitting -- a shift here, a lean there, a flag at a different angle --
 * every half second or so, which is enough for a few thousand people to
 * stop being wallpaper. On a boundary or a wicket it cuts to the frame with
 * everyone on their feet, hops, holds, and settles back down.
 *
 * Under reduced motion it holds one frame and swaps without a fade or a hop.
 */
export class Crowd {
  private readonly scene: Phaser.Scene;
  private readonly images = new Map<CrowdFrame, Phaser.GameObjects.Image>();
  private readonly keys: string[] = [];
  private current: CrowdFrame = "a";
  private idle?: Phaser.Time.TimerEvent;
  private settle?: Phaser.Time.TimerEvent;
  private reacting = false;

  constructor(scene: Phaser.Scene, camera: Camera, home: Kit, view: Viewport, depth: number) {
    this.scene = scene;
    for (const frame of ["a", "b", "c", "up"] as const) {
      const key = bakeCrowd(scene, camera, home, view, frame);
      this.keys.push(key);
      const image = scene.add.image(0, 0, key).setOrigin(0).setDepth(depth).setAlpha(frame === "a" ? 1 : 0);
      this.images.set(frame, image);
    }
    if (!reducedMotion()) this.scheduleIdle(800);
  }

  /** The texture keys this layer baked, so a relayout can free them. */
  get textureKeys(): readonly string[] {
    return this.keys;
  }

  private show(frame: CrowdFrame, ms: number): void {
    if (frame === this.current) return;
    const from = this.images.get(this.current)!;
    const to = this.images.get(frame)!;
    this.current = frame;
    this.scene.tweens.killTweensOf([from, to]);
    if (ms === 0 || reducedMotion()) {
      from.setAlpha(0);
      to.setAlpha(1);
      return;
    }
    this.scene.tweens.add({ targets: to, alpha: 1, duration: ms, ease: "Sine.easeInOut" });
    this.scene.tweens.add({ targets: from, alpha: 0, duration: ms, ease: "Sine.easeInOut" });
  }

  private scheduleIdle(delay: number): void {
    this.idle?.remove(false);
    this.idle = this.scene.time.delayedCall(delay, () => {
      if (this.reacting) return;
      const next = IDLE.filter((f) => f !== this.current);
      this.show(next[Math.floor(Math.random() * next.length)], 520);
      this.scheduleIdle(520 + 300 + Math.random() * 600);
    });
  }

  /** Everyone up. A six holds longest; a wicket is a short, sharp rise. */
  react(kind: "four" | "six" | "wicket"): void {
    const hold = kind === "six" ? 1000 : kind === "four" ? 700 : 420;
    this.reacting = true;
    this.idle?.remove(false);
    this.settle?.remove(false);
    this.show("up", 110);
    if (!reducedMotion()) {
      const targets = [...this.images.values()];
      this.scene.tweens.killTweensOf(targets);
      for (const image of targets) image.setY(0);
      this.scene.tweens.add({ targets, y: -3, duration: 90, ease: "Quad.easeOut", yoyo: true });
    }
    this.settle = this.scene.time.delayedCall(hold, () => {
      this.reacting = false;
      this.show(IDLE[Math.floor(Math.random() * IDLE.length)], 450);
      if (!reducedMotion()) this.scheduleIdle(900);
    });
  }

  destroy(): void {
    this.idle?.remove(false);
    this.settle?.remove(false);
    for (const image of this.images.values()) {
      this.scene.tweens.killTweensOf(image);
      image.destroy();
    }
    this.images.clear();
  }
}
