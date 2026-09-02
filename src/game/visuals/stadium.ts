import Phaser from "phaser";

import { BATTER_X, BOUNDARY, BOWLER_X, CANVAS, GROUND_Y, HORIZON_Y, PX_PER_METRE, m } from "../config";

/**
 * The ground, drawn once into static graphics.
 *
 * All vector work -- no image assets. That keeps the repo dependency-free and
 * means every colour and proportion is a value you can edit rather than a file
 * you have to open a paint program to change.
 */

const SKY_TOP = 0x0b1a3a;
const SKY_HORIZON = 0x2a3f6b;
const GRASS_DARK = 0x1e5c2e;
const GRASS_LIGHT = 0x27703a;

export function drawStadium(scene: Phaser.Scene): void {
  const width = BATTER_X + BOUNDARY + 400;

  drawSky(scene, width);
  drawStands(scene, width);
  drawFloodlights(scene, width);
  drawOutfield(scene, width);
  drawPitch(scene);
  drawMarkers(scene);
}

function drawSky(scene: Phaser.Scene, width: number): void {
  const g = scene.add.graphics().setDepth(-100);
  // Banded gradient: cheaper than a texture and edits in one place.
  const bands = 40;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const colour = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(SKY_TOP),
      Phaser.Display.Color.ValueToColor(SKY_HORIZON),
      100,
      t * 100,
    );
    g.fillStyle(Phaser.Display.Color.GetColor(colour.r, colour.g, colour.b));
    g.fillRect(0, (HORIZON_Y / bands) * i, width, HORIZON_Y / bands + 1);
  }
}

function drawStands(scene: Phaser.Scene, width: number): void {
  const g = scene.add.graphics().setDepth(-90);
  const standTop = HORIZON_Y - 210;

  // Upper tier, then lower, so the lower reads as nearer.
  g.fillStyle(0x131f3d).fillRect(0, standTop, width, 120);
  g.fillStyle(0x1a2950).fillRect(0, standTop + 120, width, 90);

  // Crowd speckle. Drawn once, so plain randomness is fine -- nothing here
  // feeds the simulation, which is the only thing that has to be reproducible.
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * width;
    const y = standTop + 8 + Math.random() * 190;
    const shade = [0xf2c777, 0xe8e3d6, 0xd97b5a, 0x8fb8e0, 0xc4a3d4][Math.floor(Math.random() * 5)];
    g.fillStyle(shade, 0.5 + Math.random() * 0.5).fillRect(x, y, 2, 2);
  }

  // Advertising hoardings at the boundary edge.
  g.fillStyle(0x0d1b2e).fillRect(0, HORIZON_Y - 34, width, 34);
  for (let x = 0; x < width; x += 190) {
    g.fillStyle([0x2563eb, 0xdc2626, 0x0f766e][(x / 190) % 3], 0.75);
    g.fillRect(x + 8, HORIZON_Y - 29, 170, 24);
  }
}

function drawFloodlights(scene: Phaser.Scene, width: number): void {
  const g = scene.add.graphics().setDepth(-95);
  for (let x = 220; x < width; x += 620) {
    g.fillStyle(0x0a1428).fillRect(x - 5, HORIZON_Y - 400, 10, 190);
    g.fillStyle(0x16233f).fillRect(x - 46, HORIZON_Y - 430, 92, 40);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 5; c++) {
        g.fillStyle(0xfff6d0, 0.92).fillCircle(x - 34 + c * 17, HORIZON_Y - 420 + r * 18, 5);
      }
    }
    // Glow, so the lights read as lit rather than painted on.
    g.fillStyle(0xfff6d0, 0.05).fillCircle(x, HORIZON_Y - 410, 70);
  }
}

function drawOutfield(scene: Phaser.Scene, width: number): void {
  const g = scene.add.graphics().setDepth(-50);
  g.fillStyle(GRASS_DARK).fillRect(0, HORIZON_Y, width, CANVAS.height);

  // Mowing stripes. Real outfields have them and they give the eye something to
  // measure distance against, which a flat green field does not.
  for (let x = 0; x < width; x += m(6)) {
    g.fillStyle(GRASS_LIGHT, 0.55).fillRect(x, HORIZON_Y, m(3), CANVAS.height);
  }

  g.fillStyle(0x143f22, 0.55).fillRect(0, HORIZON_Y, width, 14);

  // The rope.
  const ropeX = BATTER_X + BOUNDARY;
  g.fillStyle(0xf8fafc, 0.95).fillRect(ropeX - 2, GROUND_Y - 7, 4, 14);
  g.lineStyle(3, 0xf8fafc, 0.85).lineBetween(ropeX, GROUND_Y + 2, ropeX, GROUND_Y + 26);
}

function drawPitch(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(-40);
  const left = BATTER_X - m(2.5);
  const right = BOWLER_X + m(2.5);

  g.fillStyle(0xb9a06e).fillRect(left, GROUND_Y - 6, right - left, 12);
  g.fillStyle(0xcbb98a, 0.6).fillRect(left, GROUND_Y - 6, right - left, 4);

  // Popping creases at both ends.
  g.fillStyle(0xf5f5f0, 0.9);
  for (const x of [BATTER_X + m(1.22), BOWLER_X - m(1.22)]) {
    g.fillRect(x - 1, GROUND_Y - 8, 2, 16);
  }
}

function drawMarkers(scene: Phaser.Scene): void {
  for (let d = 10; d <= 70; d += 10) {
    const x = BATTER_X + d * PX_PER_METRE;
    scene.add.text(x, GROUND_Y + 30, `${d}m`, {
      fontFamily: "system-ui, sans-serif", fontSize: "10px", color: "#7fa889",
    }).setOrigin(0.5, 0).setDepth(-30);
  }
}
