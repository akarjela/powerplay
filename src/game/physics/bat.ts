import Phaser from "phaser";

import { BAT_BODY, BAT_CATEGORY, BAT_LENGTH, BAT_WIDTH } from "../config";
import type { Stance } from "../config";
import { nextAngularVelocity, settlePivot, swingTarget } from "./swing";
import type { Point } from "./swing";

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
 *
 * It also *stands somewhere*. The pivot moves with the batter's stance, and
 * because Matter re-reads a constraint's `pointA` on every solver step, moving
 * it is a live change with no teardown. That is the whole footwork mechanic:
 * back foot lifts the pivot out of a yorker's reach, front foot drops it into
 * one, and neither needs the outcome model's permission.
 *
 * The arithmetic of the swing lives in `swing.ts`, shared with the headless
 * harness; this class is the Phaser wiring around it.
 */
export class Bat {
  readonly body: MatterJS.BodyType;
  private readonly scene: Phaser.Scene;
  /**
   * Mutated in place, never reassigned. Matter's `Constraint.create` returns the
   * options object itself, so this is the very same object the solver reads as
   * `pointA` -- which is what lets the pivot move without rebuilding anything.
   */
  private readonly pivot: { x: number; y: number };
  private readonly home: { x: number; y: number };
  private stance: Stance = "neutral";

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
        // A batsman holds the bat up. Letting gravity pull the blade down means
        // the swing controller spends its whole budget fighting it, and stalls
        // partway to the pointer -- which is exactly what it used to do.
        ignoreGravity: true,
        // Its own category, so a wide can be told not to collide with it.
        collisionFilter: { category: BAT_CATEGORY, mask: 0xffffffff, group: 0 },
      },
    );

    // Pin the handle to a fixed point in the world. length 0 = a pure pivot.
    scene.matter.add.worldConstraint(this.body, 0, 1, {
      pointA: this.pivot,
      pointB: { x: 0, y: -BAT_LENGTH / 2 },
    });
  }

  /** Commit to a foot. Takes effect over ~150ms, not instantly; see STANCE_RESPONSE. */
  setStance(stance: Stance): void {
    this.stance = stance;
  }


  /** Where the pivot currently is, so the batsman can be drawn holding the bat. */
  get pivotPoint(): { x: number; y: number } {
    return this.pivot;
  }

  /**
   * One step of the swing controller. See `swing.ts` for why it is shaped this
   * way. `pointer` is in the physics plane -- the scene maps the screen
   * pointer back through the camera before calling this.
   */
  update(pointer: Point): void {
    settlePivot(this.pivot, this.home, this.stance);
    const target = swingTarget(pointer, this.pivot);
    this.scene.matter.body.setAngularVelocity(
      this.body,
      nextAngularVelocity(this.body.angle, this.body.angularVelocity, target),
    );
  }

  /** Speed of the blade tip -- what actually decides how far the ball goes. */
  tipSpeed(): number {
    return Math.abs(this.body.angularVelocity) * BAT_LENGTH;
  }
}
