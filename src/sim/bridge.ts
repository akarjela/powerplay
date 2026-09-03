import type { Delivery } from "./delivery";
import { IDEAL_FOOT, playedTheRightFoot } from "./shot";
import type { Commitment, Footwork, Shot } from "./shot";
import type { Outcome } from "./types";

/**
 * The bridge: what a human did with the bat, as the shot the model would
 * have rolled.
 *
 * The physics path already produces an `Outcome` -- `judgeBall` in field.ts
 * says what the ball was worth -- but it left `Outcome.shot` undefined, so
 * the scorecard could explain a rolled dismissal and not yours, and nothing
 * could ask whether the two paths value a ball the same way. This fills the
 * gap from the two things the scene actually knows about the player:
 *
 *   - **Footwork** is the stance key. Front is front, back is back, and no
 *     stance is played from the crease, which is back foot. The physics has
 *     already punished a neutral batter geometrically (the reach table in
 *     config.ts); this is only the name for what happened.
 *   - **Commitment** is how hard the blade swung while the ball was live, as
 *     a fraction of the cap. A push is a defence, a swing is a rotation, a
 *     full swing is an attack. The thresholds were set from the harness's
 *     sweep (`tests/bridge.test.ts` prints the distribution): a blade target
 *     of 5 degrees peaks under 0.2, a 130-degree slog saturates the cap.
 *
 * Pure. Imports nothing from the game; the scene and the harness hand in
 * numbers. `bridge` never changes runs, wickets or extras -- the judge has
 * spoken -- it only attaches the shot and, on a dismissal, says which foot.
 */

export interface Play {
  stance: "front" | "back" | "neutral";
  /** Peak blade speed while the ball was live, 0..1 of MAX_SWING_SPEED. */
  effort: number;
}

/** Below this the blade barely moved: a block. Above ATTACK it was a full swing. */
export const DEFEND_BELOW = 0.30;
export const ATTACK_FROM = 0.72;

export function footworkOf(stance: Play["stance"]): Footwork {
  return stance === "front" ? "front" : "back";
}

export function commitmentOf(effort: number): Commitment {
  if (effort < DEFEND_BELOW) return "defend";
  if (effort < ATTACK_FROM) return "rotate";
  return "attack";
}

export function shotFromPlay(play: Play): Shot {
  return { footwork: footworkOf(play.stance), commitment: commitmentOf(play.effort) };
}

/**
 * Attach the shot to a judged ball. A wide or a no-ball never consulted the
 * batter, so it carries no shot, as on the simulated side. A dismissal gains
 * the read that caused it, in the model's own terms, so the scorecard can say
 * "back foot to a yorker" whichever path produced the wicket.
 */
export function bridge(outcome: Outcome, delivery: Delivery, play: Play): Outcome {
  if (outcome.extra === "wide" || outcome.extra === "no-ball") return outcome;
  const shot = shotFromPlay(play);
  if (!outcome.wicket) return { ...outcome, shot };
  return { ...outcome, shot, description: `${outcome.description} ${readOf(shot, delivery)}` };
}

/** "Back foot to a yorker." or "Right foot, beaten anyway." */
export function readOf(shot: Shot, delivery: Delivery): string {
  const foot = shot.footwork === "front" ? "Front" : "Back";
  if (playedTheRightFoot(shot.footwork, delivery.length)) return `${foot} foot, the right read; beaten anyway.`;
  const article = delivery.length === "yorker" ? "a yorker" : `a ${delivery.length} ball`;
  return `${foot} foot to ${article}; it wanted the ${IDEAL_FOOT[delivery.length]}.`;
}
