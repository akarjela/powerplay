import Phaser from "phaser";

import { BAT_LENGTH, BAT_WIDTH, SWING_DAMPING, SWING_TORQUE } from "../config";

/**
 * The bat: a rigid body pinned at the handle, driven toward the pointer.
 *
 * Two things make this feel like a bat rather than a cursor.
 *
 * It is *pinned, not teleported*. A `worldConstraint` at the handle lets the
 * blade swing on a pivot, so it carries angular momentum -- the ball leaves
 * faster off the end of a full swing than off a nudge, for free, because that is
 * what the collision solver computes. Setting the angle directly each frame
 * would look identical and feel dead, because a body that is teleported has no
 * velocity to transfer.
 *
 * It is *driven, not dragged*. The controller applies torque toward where the
 * pointer is, so the bat lags the mouse. That lag is the entire skill of the
 * game: swing early and you are through the shot, swing late and you edge it.
 * Remove the lag and there is nothing left to be good at.
 */
export class Bat {
  readonly body: MatterJS.BodyType;
  private readonly scene: Phaser.Scene;
  private readonly pivot: { x: number; y: number };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.pivot = { x, y };

    this.body = scene.matter.add.rectangle(
      x,
      y + BAT_LENGTH / 2,
      BAT_WIDTH,
      BAT_LENGTH,
      {
        // Heavy enough to not be knocked aside by the ball, light enough to swing.
        density: 0.02,
        frictionAir: 0.02,
        // A real bat barely rebounds; the ball's own restitution does the work.
        restitution: 0.35,
        label: "bat",
      },
    );

    // Pin the handle to a fixed point in the world. length 0 = a pure pivot.
    scene.matter.add.worldConstraint(this.body, 0, 1, {
      pointA: this.pivot,
      pointB: { x: 0, y: -BAT_LENGTH / 2 },
    });
  }

  /**
   * One step of the swing controller.
   *
   * A proportional-derivative controller: torque toward the pointer, opposed by
   * a term proportional to current spin. Without the derivative term the bat
   * overshoots and oscillates around the target angle forever.
   */
  update(pointer: Phaser.Input.Pointer): void {
    const target = Math.atan2(
      pointer.worldY - this.pivot.y,
      pointer.worldX - this.pivot.x,
    ) - Math.PI / 2;

    // Shortest way round: without this the bat takes the long way past 180deg.
    let error = target - this.body.angle;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;

    const torque = error * SWING_TORQUE - this.body.angularVelocity * SWING_DAMPING;
    this.scene.matter.body.setAngularVelocity(
      this.body,
      this.body.angularVelocity + torque,
    );
  }

  /** Speed of the blade tip -- what actually decides how far the ball goes. */
  tipSpeed(): number {
    return Math.abs(this.body.angularVelocity) * BAT_LENGTH;
  }
}
