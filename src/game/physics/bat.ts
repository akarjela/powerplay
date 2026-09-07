import Phaser from "phaser";

import { BAT_BODY, BAT_CATEGORY, BAT_LENGTH, BAT_WIDTH } from "../config";
import type { Stance } from "../config";
import { nextAngularVelocity, settlePivot, swingEffort, swingTarget } from "./swing";
import type { Point } from "./swing";

export class Bat {
  readonly body: MatterJS.BodyType;
  private readonly scene: Phaser.Scene;

  private readonly pivot: { x: number; y: number };
  private readonly home: { x: number; y: number };
  private stance: Stance = "neutral";
  private speed = 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.pivot = { x, y };
    this.home = { x, y };

    this.body = scene.matter.add.rectangle(
      x,
      y + BAT_LENGTH / 2,
      BAT_WIDTH,
      BAT_LENGTH,
      {
        ...BAT_BODY,
        label: "bat",

        ignoreGravity: true,

        collisionFilter: { category: BAT_CATEGORY, mask: 0xffffffff, group: 0 },
      },
    );

    scene.matter.add.worldConstraint(this.body, 0, 1, {
      pointA: this.pivot,
      pointB: { x: 0, y: -BAT_LENGTH / 2 },
    });
  }

  setStance(stance: Stance): void {
    this.stance = stance;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  get speedFactor(): number {
    return this.speed;
  }

  effort(): number {
    return swingEffort(this.body.angularVelocity, this.speed);
  }

  get pivotPoint(): { x: number; y: number } {
    return this.pivot;
  }

  update(pointer: Point): void {
    settlePivot(this.pivot, this.home, this.stance);
    const target = swingTarget(pointer, this.pivot);
    this.scene.matter.body.setAngularVelocity(
      this.body,
      nextAngularVelocity(this.body.angle, this.body.angularVelocity, target, this.speed),
    );
  }

  tipSpeed(): number {
    return Math.abs(this.body.angularVelocity) * BAT_LENGTH;
  }
}
