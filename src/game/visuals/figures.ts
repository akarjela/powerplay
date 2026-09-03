import Phaser from "phaser";

import { BALL_RADIUS, BAT_LENGTH, BAT_WIDTH, STUMP_HEIGHT } from "../config";
import type { Camera, Projected } from "../view/camera";

/**
 * The people, the stumps, the bat and the ball. Vector-drawn in world pixels
 * -- the same ~4x exaggeration the bat and ball use, so a player reads as
 * roughly 1.8m against a bat of 0.97m -- inside containers the scene places
 * and scales by projection. A figure never knows where it is on screen.
 *
 * Everyone wears a kit: the batter the batting franchise's, the fielders the
 * bowling franchise's. Labels are gone; the call names the fielder.
 */

export interface Kit {
  primary: number;
  secondary: number;
}

const SKIN = 0xd9a06b;
const PAD = 0xf7f9fb;
const BOOT = 0x1c2534;

const darken = (colour: number, by: number) => {
  const c = Phaser.Display.Color.ValueToColor(colour);
  return Phaser.Display.Color.GetColor(c.red * (1 - by), c.green * (1 - by), c.blue * (1 - by));
};

/** A batsman at the crease, facing the bowler (to the right). Origin at the feet. */
export function drawBatsman(scene: Phaser.Scene, handsLocalY: number, kit: Kit): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const shade = darken(kit.primary, 0.35);

  // Ground shadow.
  g.fillStyle(0x0b2413, 0.35).fillEllipse(0, 1, 40, 8);

  // Back leg, front leg -- front one stepping toward the ball.
  g.fillStyle(0xe8eaed);
  g.fillRoundedRect(-16, -46, 13, 46, 4);
  g.fillRoundedRect(2, -44, 13, 44, 4);
  // Pads, with straps.
  g.fillStyle(PAD);
  g.fillRoundedRect(-15, -44, 11, 42, 4);
  g.fillRoundedRect(3, -42, 11, 40, 4);
  g.lineStyle(1, 0xc8ced6);
  g.strokeRoundedRect(-15, -44, 11, 42, 4);
  g.strokeRoundedRect(3, -42, 11, 40, 4);
  for (const y of [-36, -26, -16]) {
    g.lineBetween(-15, y, -4, y);
    g.lineBetween(3, y + 2, 14, y + 2);
  }

  // Boots.
  g.fillStyle(BOOT);
  g.fillRoundedRect(-18, -6, 17, 6, 2);
  g.fillRoundedRect(1, -6, 18, 6, 2);

  // Torso in the kit, leaning slightly forward, a shaded back and a sash.
  g.fillStyle(kit.primary).fillRoundedRect(-14, -84, 26, 42, 7);
  g.fillStyle(shade, 0.9).fillRoundedRect(-14, -84, 8, 42, { tl: 7, bl: 7, tr: 0, br: 0 });
  g.fillStyle(kit.secondary, 0.95).fillRect(-14, -66, 26, 4);
  g.fillStyle(kit.secondary, 0.95).fillRect(-14, -58, 26, 2);

  // Head and helmet with a grille.
  g.fillStyle(SKIN).fillCircle(0, -94, 9);
  g.fillStyle(darken(kit.primary, 0.15)).fillCircle(0, -96, 10);
  g.fillStyle(darken(kit.primary, 0.15)).fillRect(-10, -98, 20, 6);
  g.fillStyle(kit.secondary, 0.9).fillRect(-10, -100, 20, 2);
  g.lineStyle(1.5, 0xcbd5e1);
  g.lineBetween(4, -92, 12, -90);
  g.lineBetween(4, -88, 12, -87);

  // Arms reaching down to the hands, which is where the bat pivots.
  g.lineStyle(7, kit.primary);
  g.lineBetween(-2, -76, 6, handsLocalY - 4);
  g.lineStyle(5, SKIN);
  g.lineBetween(6, handsLocalY - 6, 9, handsLocalY);
  // Gloves.
  g.fillStyle(0xf1f5f9).fillCircle(10, handsLocalY, 6);
  g.fillStyle(kit.secondary, 0.8).fillCircle(10, handsLocalY, 2.5);

  c.add(g);
  return c;
}

/** A fielder in the bowling side's kit. Origin at the feet. */
export function drawFielder(scene: Phaser.Scene, kit: Kit): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const shade = darken(kit.primary, 0.35);

  g.fillStyle(0x0b2413, 0.35).fillEllipse(0, 1, 30, 7);

  // Legs in kit trousers, slightly apart, ready.
  g.fillStyle(darken(kit.primary, 0.5));
  g.fillRoundedRect(-9, -28, 7, 28, 2);
  g.fillRoundedRect(2, -28, 7, 28, 2);
  g.fillStyle(BOOT);
  g.fillRoundedRect(-10, -4, 9, 4, 1.5);
  g.fillRoundedRect(1, -4, 9, 4, 1.5);

  // Shirt with a shaded side and a trim.
  g.fillStyle(kit.primary).fillRoundedRect(-10, -54, 20, 28, 5);
  g.fillStyle(shade, 0.9).fillRoundedRect(-10, -54, 6, 28, { tl: 5, bl: 5, tr: 0, br: 0 });
  g.fillStyle(kit.secondary, 0.95).fillRect(-10, -40, 20, 2.5);
  // Arms, hands on knees-ish.
  g.lineStyle(4.5, kit.primary);
  g.lineBetween(-9, -48, -15, -34);
  g.lineBetween(9, -48, 15, -34);
  g.fillStyle(SKIN).fillCircle(-15, -33, 2.5).fillCircle(15, -33, 2.5);

  // Head and cap.
  g.fillStyle(SKIN).fillCircle(0, -61, 7);
  g.fillStyle(darken(kit.primary, 0.1)).fillRect(-7, -68, 14, 5);
  g.fillStyle(darken(kit.primary, 0.1)).fillRect(-7, -64, 17, 2);

  c.add(g);
  return c;
}

/** Stumps at a point along the pitch, projected: three of them with bails. */
export function drawStumps(scene: Phaser.Scene, camera: Camera, physicsX: number, fromPhysics: (x: number, y: number) => { x: number; y: number; z: number }, groundY: number): void {
  const base = camera.project(fromPhysics(physicsX, groundY));
  if (!base) return;
  const g = scene.add.graphics().setDepth(500 - 0.5);
  const s = base.scale;
  const height = STUMP_HEIGHT * s;
  for (let i = -1; i <= 1; i++) {
    g.fillStyle(0xf5f5f0).fillRect(base.sx + i * 5 * s - 1.5 * s, base.sy - height, 3 * s, height);
  }
  g.fillStyle(0xe2b04a);
  g.fillRect(base.sx - 6 * s, base.sy - height - 3 * s, 5 * s, 3 * s);
  g.fillRect(base.sx + 1 * s, base.sy - height - 3 * s, 5 * s, 3 * s);
}

/** The bat: grip, splice and blade, drawn around its own centre so it rotates. */
export function makeBat(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const half = BAT_LENGTH / 2;

  // Handle, at the top (the pivot end).
  g.fillStyle(0x2f2a24).fillRoundedRect(-3, -half, 6, 18, 3);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0x1b1814).fillRect(-3, -half + 3 + i * 4, 6, 1.5);
  }
  // Blade, widening slightly toward the toe, with a grain line.
  g.fillStyle(0xe3cd9a).fillRoundedRect(-BAT_WIDTH / 2, -half + 17, BAT_WIDTH, half * 2 - 17, 3);
  g.fillStyle(0xf0e0b8, 0.7).fillRect(-BAT_WIDTH / 2 + 1.5, -half + 20, 2.5, half * 2 - 24);
  g.fillStyle(0xc9b07a, 0.6).fillRect(BAT_WIDTH / 2 - 3, -half + 20, 1.5, half * 2 - 24);
  g.lineStyle(1, 0xbfa678).strokeRoundedRect(-BAT_WIDTH / 2, -half + 17, BAT_WIDTH, half * 2 - 17, 3);
  // A sticker.
  g.fillStyle(0xdc2626, 0.85).fillRect(-BAT_WIDTH / 2 + 2, -half + 26, BAT_WIDTH - 4, 6);

  c.add(g);
  return c;
}

/** The ball: red, seamed, with a shadow on the grass beneath it and a trail. */
export class BallSprite {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly history: { x: number; y: number; w: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.trail = scene.add.graphics().setDepth(499);
    this.shadow = scene.add.ellipse(0, 0, 18, 5, 0x0a1f12, 0.45).setDepth(-20).setVisible(false);

    this.gfx = scene.add.graphics().setDepth(503);
    this.gfx.fillStyle(0xc0392b).fillCircle(0, 0, BALL_RADIUS);
    this.gfx.fillStyle(0x8e2a20).fillCircle(-1.5, 1.5, BALL_RADIUS - 2);
    this.gfx.fillStyle(0xe06b5c, 0.6).fillCircle(-2, -2, 2);
    this.gfx.lineStyle(1.4, 0xf3f4f6).beginPath();
    this.gfx.arc(0, 0, BALL_RADIUS - 1, -0.9, 0.9);
    this.gfx.strokePath();
    this.gfx.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.gfx.setVisible(visible);
    this.shadow.setVisible(visible);
    if (!visible) {
      this.history.length = 0;
      this.trail.clear();
    }
  }

  /** A wide is drawn faint: it is past you, and the bat will not meet it. */
  setGhost(ghost: boolean): void {
    this.gfx.setAlpha(ghost ? 0.45 : 1);
  }

  setDepth(depth: number): void {
    this.gfx.setDepth(depth + 3);
    this.trail.setDepth(depth + 2);
  }

  /** Both projected: the ball where it is, the shadow on the turf beneath it. */
  update(ball: Projected, shadow: Projected, heightPx: number): void {
    this.gfx.setPosition(ball.sx, ball.sy).setScale(ball.scale);

    // Shadow shrinks and fades with height, which is most of what sells the arc.
    const fade = Phaser.Math.Clamp(1 - heightPx / 420, 0.25, 1);
    this.shadow.setPosition(shadow.sx, shadow.sy + 2 * shadow.scale)
      .setScale(shadow.scale * fade, shadow.scale * fade * 0.8)
      .setAlpha(0.45 * fade);

    this.history.push({ x: ball.sx, y: ball.sy, w: ball.scale });
    if (this.history.length > 14) this.history.shift();

    this.trail.clear();
    for (let i = 1; i < this.history.length; i++) {
      const t = i / this.history.length;
      this.trail.lineStyle(BALL_RADIUS * 0.9 * t * this.history[i].w, 0xef8a7d, t * 0.4);
      this.trail.lineBetween(
        this.history[i - 1].x, this.history[i - 1].y,
        this.history[i].x, this.history[i].y,
      );
    }
  }
}
