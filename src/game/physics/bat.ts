import Phaser from "phaser";

import { BAT_LENGTH, BAT_WIDTH, MAX_SWING_SPEED, SWING_RESPONSE, SWING_SMOOTHING } from "../config";

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
        // Heavy relative to the ball so a middled shot transfers energy to the
        // ball rather than the ball knocking the blade aside.
        density: 0.05,
        frictionAir: 0,
        // A real bat barely rebounds; the ball's own restitution does the work.
        restitution: 0.35,
        label: "bat",
        // A batsman holds the bat up. Letting gravity pull the blade down means
        // the swing controller spends its whole budget fighting it, and stalls
        // partway to the pointer -- which is exactly what it used to do.
        ignoreGravity: true,
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
   * Velocity-targeting rather than torque-summing. The bat aims for an angular
   * velocity proportional to how far it is from the pointer, capped at
   * MAX_SWING_SPEED, and eases toward that target rather than snapping to it.
   *
   * The cap is what makes the bat feel like an object with weight, and it is
   * where the skill lives: past a certain angle you simply cannot get there in
   * time, so a late swing misses. The earlier version summed torque against a
   * damping term, which sounds equivalent and is not -- with gravity acting on
   * the blade it had a stall point it could never rotate past.
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

    const wanted = Phaser.Math.Clamp(
      error * SWING_RESPONSE,
      -MAX_SWING_SPEED,
      MAX_SWING_SPEED,
    );

    this.scene.matter.body.setAngularVelocity(
      this.body,
      Phaser.Math.Linear(this.body.angularVelocity, wanted, SWING_SMOOTHING),
    );
  }

  /** Speed of the blade tip -- what actually decides how far the ball goes. */
  tipSpeed(): number {
    return Math.abs(this.body.angularVelocity) * BAT_LENGTH;
  }
}
