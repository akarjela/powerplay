import Phaser from "phaser";

import { BALL_RADIUS, BAT_LENGTH, BAT_WIDTH, GROUND_Y } from "../config";

/**
 * The people and the ball. Vector-drawn, sized to the same ~4x exaggeration the
 * bat and ball use, so a player reads as roughly 1.8m against a bat of 0.97m.
 */

/** A batsman at the crease, facing the bowler (to the right). */
export function drawBatsman(scene: Phaser.Scene, x: number, handsY: number): Phaser.GameObjects.Container {
  const c = scene.add.container(x, GROUND_Y).setDepth(4);
  const g = scene.add.graphics();
  const handsLocalY = handsY - GROUND_Y;

  // Back leg, front leg -- front one stepping toward the ball.
  g.fillStyle(0xe8eaed);
  g.fillRoundedRect(-16, -46, 13, 46, 4);
  g.fillRoundedRect(2, -44, 13, 44, 4);
  // Pads, over the front of each leg.
  g.fillStyle(0xf7f9fb);
  g.fillRoundedRect(-15, -44, 11, 42, 4);
  g.fillRoundedRect(3, -42, 11, 40, 4);
  g.lineStyle(1, 0xc8ced6);
  g.strokeRoundedRect(-15, -44, 11, 42, 4);
  g.strokeRoundedRect(3, -42, 11, 40, 4);

  // Boots.
  g.fillStyle(0x1c2534);
  g.fillRoundedRect(-18, -6, 17, 6, 2);
  g.fillRoundedRect(1, -6, 18, 6, 2);

  // Torso, leaning slightly forward into the shot.
  g.fillStyle(0x1e40af);
  g.fillRoundedRect(-14, -84, 26, 42, 7);
  g.fillStyle(0xf59e0b, 0.9).fillRect(-14, -66, 26, 4);

  // Head and helmet with a grille.
  g.fillStyle(0xd9a06b).fillCircle(0, -94, 9);
  g.fillStyle(0x1e3a8a).fillCircle(0, -96, 10);
  g.fillStyle(0x1e3a8a).fillRect(-10, -98, 20, 6);
  g.lineStyle(1.5, 0xcbd5e1);
  g.lineBetween(4, -92, 12, -90);
  g.lineBetween(4, -88, 12, -87);

  // Arms reaching down to the hands, which is where the bat pivots.
  g.lineStyle(7, 0x1e40af);
  g.lineBetween(-2, -76, 6, handsLocalY - 4);
  g.lineStyle(5, 0xd9a06b);
  g.lineBetween(6, handsLocalY - 6, 9, handsLocalY);
  // Gloves.
  g.fillStyle(0xf1f5f9).fillCircle(10, handsLocalY, 6);

  c.add(g);
  return c;
}

/** A fielder, smaller and dimmer so they read as further away. */
export function drawFielder(scene: Phaser.Scene, x: number, label: string): void {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x0f2d1c, 0.35).fillEllipse(x, GROUND_Y + 2, 26, 7);

  g.fillStyle(0x1c2534);
  g.fillRoundedRect(x - 7, GROUND_Y - 26, 5, 26, 2);
  g.fillRoundedRect(x + 2, GROUND_Y - 26, 5, 26, 2);
  g.fillStyle(0xdc2626).fillRoundedRect(x - 9, GROUND_Y - 50, 18, 26, 5);
  g.lineStyle(4, 0xdc2626);
  g.lineBetween(x - 8, GROUND_Y - 44, x - 15, GROUND_Y - 32);
  g.lineBetween(x + 8, GROUND_Y - 44, x + 15, GROUND_Y - 32);
  g.fillStyle(0xd9a06b).fillCircle(x, GROUND_Y - 56, 7);

  scene.add.text(x, GROUND_Y - 70, label, {
    fontFamily: "system-ui, sans-serif", fontSize: "10px", color: "#a7d3b4",
  }).setOrigin(0.5, 1).setDepth(2);
}

/** Stumps: three of them, with bails sitting on top. */
export function drawStumps(scene: Phaser.Scene, x: number): void {
  const g = scene.add.graphics().setDepth(3);
  const height = 30;
  for (let i = -1; i <= 1; i++) {
    g.fillStyle(0xf5f5f0).fillRect(x + i * 5 - 1.5, GROUND_Y - height, 3, height);
  }
  g.fillStyle(0xe2b04a);
  g.fillRect(x - 6, GROUND_Y - height - 3, 5, 3);
  g.fillRect(x + 1, GROUND_Y - height - 3, 5, 3);
}

/** The bat: grip, splice and blade, drawn around its own centre so it rotates. */
export function makeBat(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0).setDepth(6);
  const g = scene.add.graphics();
  const half = BAT_LENGTH / 2;

  // Handle, at the top (the pivot end).
  g.fillStyle(0x2f2a24).fillRoundedRect(-3, -half, 6, 18, 3);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0x1b1814).fillRect(-3, -half + 3 + i * 4, 6, 1.5);
  }
  // Blade, widening slightly toward the toe.
  g.fillStyle(0xe3cd9a).fillRoundedRect(-BAT_WIDTH / 2, -half + 17, BAT_WIDTH, half * 2 - 17, 3);
  g.fillStyle(0xf0e0b8, 0.7).fillRect(-BAT_WIDTH / 2 + 1.5, -half + 20, 2.5, half * 2 - 24);
  g.lineStyle(1, 0xbfa678).strokeRoundedRect(-BAT_WIDTH / 2, -half + 17, BAT_WIDTH, half * 2 - 17, 3);

  c.add(g);
  return c;
}

/** The ball: red, seamed, with a shadow on the grass beneath it. */
export class BallSprite {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly history: { x: number; y: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.trail = scene.add.graphics().setDepth(6);
    this.shadow = scene.add.ellipse(0, 0, 18, 5, 0x0a1f12, 0.4).setDepth(1).setVisible(false);

    this.gfx = scene.add.graphics().setDepth(7);
    this.gfx.fillStyle(0xc0392b).fillCircle(0, 0, BALL_RADIUS);
    this.gfx.fillStyle(0x8e2a20).fillCircle(-1.5, 1.5, BALL_RADIUS - 2);
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

  update(x: number, y: number): void {
    this.gfx.setPosition(x, y);

    // Shadow shrinks and fades with height, which is most of what sells the arc.
    const height = Math.max(0, GROUND_Y - y);
    const scale = Phaser.Math.Clamp(1 - height / 420, 0.25, 1);
    this.shadow.setPosition(x, GROUND_Y + 2).setScale(scale, scale).setAlpha(0.4 * scale);

    this.history.push({ x, y });
    if (this.history.length > 14) this.history.shift();

    this.trail.clear();
    for (let i = 1; i < this.history.length; i++) {
      const alpha = (i / this.history.length) * 0.4;
      this.trail.lineStyle(BALL_RADIUS * 0.9 * (i / this.history.length), 0xef8a7d, alpha);
      this.trail.lineBetween(
        this.history[i - 1].x, this.history[i - 1].y,
        this.history[i].x, this.history[i].y,
      );
    }
  }
}
