import Phaser from "phaser";

import { BOUNDARY, PITCH_LENGTH, PX_PER_METRE } from "../config";
import { RING } from "../physics/field";
import type { Fielder } from "../physics/field";
import { planPosition } from "../physics/direction";
import type { Bearing } from "../physics/direction";
import type { Outcome } from "../../sim/types";

const BOUNDARY_M = BOUNDARY / PX_PER_METRE;

export class Radar {
  private readonly k: number;

  private readonly root: Phaser.GameObjects.Container;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly men: Phaser.GameObjects.Graphics;
  private readonly wheel: Phaser.GameObjects.Graphics;
  private readonly ball: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, radiusPx: number) {
    this.k = radiusPx / BOUNDARY_M;

    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1030);
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
    g.fillStyle(0x08111f, 0.85).fillCircle(0, 0, radiusPx + 6);
    g.fillStyle(0x1e5c2e, 0.9).fillCircle(0, 0, radiusPx);
    g.lineStyle(1.5, 0xf8fafc, 0.9).strokeCircle(0, 0, radiusPx);
    g.lineStyle(1, 0xf8fafc, 0.35).strokeCircle(0, 0, RING * this.k);

    const pitchPx = (PITCH_LENGTH / PX_PER_METRE) * this.k;
    g.fillStyle(0xb9a06e, 0.9).fillRect(-2, -pitchPx, 4, pitchPx);
    g.fillStyle(0xffffff).fillCircle(0, 0, 2);
  }

  private at(distanceM: number, bearing: Bearing): { x: number; y: number } {
    const { along, across } = planPosition(distanceM, bearing);
    return { x: -across * this.k, y: -along * this.k };
  }

  setField(field: Fielder[]): void {
    this.men.clear();
    for (const fielder of field) {
      const { x, y } = this.at(fielder.distance, fielder.bearing);
      this.men.fillStyle(0xf8fafc, 0.95).fillCircle(x, y, 2.5);
    }
  }

  live(distanceM: number, bearing: Bearing): void {
    const { x, y } = this.at(Math.min(distanceM, BOUNDARY_M + 2), bearing);
    this.ball.setPosition(x, y).setVisible(true);
  }

  hideBall(): void {
    this.ball.setVisible(false);
  }

  trace(distanceM: number, bearing: Bearing, outcome: Outcome): void {
    const { x, y } = this.at(Math.min(distanceM, BOUNDARY_M), bearing);
    this.wheel.lineStyle(1.5, spokeColour(outcome), 0.9).lineBetween(0, 0, x, y);
  }
}

function spokeColour(outcome: Outcome): number {
  if (outcome.wicket) return 0xf87171;
  if (outcome.runs === 6) return 0xfb923c;
  if (outcome.runs === 4) return 0xfbbf24;
  if (outcome.runs > 0) return 0xe2e8f0;
  return 0x64748b;
}
