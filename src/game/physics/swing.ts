import {
  MAX_SWING_SPEED, STANCE_OFFSET, STANCE_RESPONSE, SWING_RESPONSE, SWING_SMOOTHING,
} from "../config";
import type { Stance } from "../config";

/**
 * The swing controller, as arithmetic.
 *
 * `bat.ts` owns the Matter body and the constraint; this owns the decision of
 * what angular velocity to ask for. It is split out so the headless harness in
 * `tests/headless.ts` can swing the *same* bat the player does -- a harness
 * with its own approximation of the controller measures a different game, and
 * three of this project's false verdicts came from a harness that aimed wrong.
 *
 * Nothing here touches Phaser. It takes numbers and returns numbers.
 */

export interface Point {
  x: number;
  y: number;
}

/** Where the pivot is heading this frame. Mutates and returns `pivot`. */
export function settlePivot(pivot: Point, home: Point, stance: Stance): Point {
  const offset = STANCE_OFFSET[stance];
  pivot.x += (home.x + offset.x - pivot.x) * STANCE_RESPONSE;
  pivot.y += (home.y + offset.y - pivot.y) * STANCE_RESPONSE;
  return pivot;
}

/** The body angle at which the blade points from the pivot at the pointer. */
export function swingTarget(pointer: Point, pivot: Point): number {
  return Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) - Math.PI / 2;
}

/**
 * The angular velocity to set this frame.
 *
 * Velocity-targeting rather than torque-summing. The bat aims for an angular
 * velocity proportional to how far it is from the target, capped at
 * MAX_SWING_SPEED, and eases toward that rather than snapping to it. The cap is
 * where the skill lives: past a certain angle you cannot get there in time.
 */
export function nextAngularVelocity(angle: number, angularVelocity: number, target: number): number {
  // Shortest way round: without this the bat takes the long way past 180deg.
  let error = target - angle;
  while (error > Math.PI) error -= Math.PI * 2;
  while (error < -Math.PI) error += Math.PI * 2;

  const wanted = Math.max(-MAX_SWING_SPEED, Math.min(MAX_SWING_SPEED, error * SWING_RESPONSE));
  return angularVelocity + (wanted - angularVelocity) * SWING_SMOOTHING;
}

/**
 * Soft hands.
 *
 * Matter resolves a contact with the *larger* of the two restitutions, and the
 * ball's has to be 0.7 for the bounce off the pitch to be right -- so a bat
 * that was barely moving still returned a 138kph delivery at 70% of its speed,
 * and measured, a defensive push reached the rope 22% of the time. A real
 * block does not, because the hands give. This scales the ball's speed off the
 * bat by how fast the blade was travelling at contact: a full swing keeps all
 * of it, a dead bat keeps just over half. Applied by the scene and the harness
 * on the frame after the collision, since the solver runs after the event.
 */
export function contactDamping(angularVelocityAtContact: number, power = 0.5): number {
  const effort = Math.min(1, Math.abs(angularVelocityAtContact) / MAX_SWING_SPEED);
  return (0.55 + 0.45 * effort) * powerFactor(power);
}

/**
 * Where a batter's power reaches the bat.
 *
 * Centred on the average batter (0.5), so every number measured about the
 * swing before attributes existed still holds for an average player, and the
 * harness's tables did not move. Power scales the ball's speed off the bat: a
 * power-100 batter gets 15% more out of the same swing than average, a
 * tail-ender 15% less, and since carry goes with the square of speed that is
 * a third of the distance either way. Measured over the harness's sweep
 * (`tests/attributes.test.ts`): power 92 against 12 is 21% boundaries against
 * 17%, sixes 3.5% against 2.3%, 1.49 runs a ball against 1.32.
 *
 * Technique is deliberately *not* here. It was tried two ways and measured
 * both times. As the width of the blade it did nothing, because in a side-on
 * world that dimension is the blade's thickness and the ball never cared. As
 * the hands -- how hard the bat chases the pointer -- it moved boundaries
 * like a second power and wickets the wrong way (9.9% against 7.7%), because
 * a quicker bat is a faster bat at contact and nothing else. On the physics
 * path, not getting out is the player's own timing and footwork; that *is*
 * the technique, and it is not for sale in a number.
 */
export function powerFactor(power: number): number {
  return 0.85 + 0.3 * Math.max(0, Math.min(1, power));
}
