import Phaser from "phaser";

import { BOUNDARY, PITCH_LENGTH, PX_PER_METRE } from "../config";
import { RING } from "../physics/field";
import type { Fielder } from "../physics/field";
import { planPosition } from "../physics/direction";
import type { Bearing } from "../physics/direction";
import type { Outcome } from "../../sim/types";

/**
 * The plan view, in the corner. A wagon wheel.
 *
 * The side-on picture cannot show where a shot went, only how far; this can.
 * Bowler at the top, the batter at the centre, leg side on the left the way
 * broadcast draws it for a right-hander. Every shot leaves a spoke coloured by
 * what it was worth, so an innings accumulates into the picture a commentator
 * would put up at the break -- and so the fielders you are trying to beat are
 * visible somewhere, since the men square of the wicket are off the side-on
 * screen entirely.
 */

const BOUNDARY_M = BOUNDARY / PX_PER_METRE;

export class Radar {
  /** Drawn about its own origin; the container carries it to the corner. */
  private readonly cx = 0;
  private readonly cy = 0;
  private readonly k: number;
  readonly root: Phaser.GameObjects.Container;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly men: Phaser.GameObjects.Graphics;
  private readonly wheel: Phaser.GameObjects.Graphics;
  private readonly ball: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, cx: number, cy: number, radiusPx: number) {
    this.k = radiusPx / BOUNDARY_M;

    this.root = scene.add.container(cx, cy).setScrollFactor(0).setDepth(1030);
    this.ground = scene.add.graphics();
    this.wheel = scene.add.graphics();
    this.men = scene.add.graphics();
    this.ball = scene.add.circle(0, 0, 3, 0xffffff).setVisible(false);
    this.root.add([this.ground, this.wheel, this.men, this.ball]);

    this.drawGround(radiusPx);
  }

  setPosition(cx: number, cy: number): void {
    this.root.setPosition(cx, cy);
  }

  private drawGround(radiusPx: number): void {
    const g = this.ground;
    g.fillStyle(0x08111f, 0.85).fillCircle(this.cx, this.cy, radiusPx + 6);
    g.fillStyle(0x1e5c2e, 0.9).fillCircle(this.cx, this.cy, radiusPx);
    g.lineStyle(1.5, 0xf8fafc, 0.9).strokeCircle(this.cx, this.cy, radiusPx);
    g.lineStyle(1, 0xf8fafc, 0.35).strokeCircle(this.cx, this.cy, RING * this.k);

    // The pitch, striker's end at the centre.
    const pitchPx = (PITCH_LENGTH / PX_PER_METRE) * this.k;
    g.fillStyle(0xb9a06e, 0.9).fillRect(this.cx - 2, this.cy - pitchPx, 4, pitchPx);
    g.fillStyle(0xffffff).fillCircle(this.cx, this.cy, 2);
  }

  /** The point on the radar for a plan position. Leg side is left, bowler is up. */
  private at(distanceM: number, bearing: Bearing): { x: number; y: number } {
    const { along, across } = planPosition(distanceM, bearing);
    return { x: this.cx - across * this.k, y: this.cy - along * this.k };
  }

  setField(field: Fielder[]): void {
    this.men.clear();
    for (const fielder of field) {
      const { x, y } = this.at(fielder.distance, fielder.bearing);
      this.men.fillStyle(0xf8fafc, 0.95).fillCircle(x, y, 2.5);
    }
  }

  /** Where the ball is now, while it is live. */
  live(distanceM: number, bearing: Bearing): void {
    const { x, y } = this.at(Math.min(distanceM, BOUNDARY_M + 2), bearing);
    this.ball.setPosition(x, y).setVisible(true);
  }

  hideBall(): void {
    this.ball.setVisible(false);
  }

  /** A spoke for a finished shot, coloured by what it was worth. */
  trace(distanceM: number, bearing: Bearing, outcome: Outcome): void {
    const colour = outcome.wicket ? 0xf87171
      : outcome.runs === 6 ? 0xfb923c
        : outcome.runs === 4 ? 0xfbbf24
          : outcome.runs > 0 ? 0xe2e8f0
            : 0x64748b;
    const { x, y } = this.at(Math.min(distanceM, BOUNDARY_M), bearing);
    this.wheel.lineStyle(1.5, colour, 0.9).lineBetween(this.cx, this.cy, x, y);
  }

  clearWheel(): void {
    this.wheel.clear();
  }
}
