import { BATTER_X, BOUNDARY, GROUND_Y, PX_PER_METRE } from "../config";
import type { Outcome, Runs } from "../../sim/types";

/**
 * Turns a ball's flight into a cricket result.
 *
 * Kept as pure functions over positions rather than Phaser callbacks so the
 * mapping can be reasoned about and, later, tested. The scene watches the ball
 * and asks this module what happened; it never decides for itself.
 */

export interface Fielder {
  name: string;
  /** Metres downfield from the striker's stumps. */
  distance: number;
}

/**
 * A straight-ish field, side-on. Distances are roughly where these positions
 * actually stand, which is what makes the risk/reward legible: clear mid-off and
 * you are safe until long-off at 55m.
 */
export const FIELD: Fielder[] = [
  { name: "mid-on", distance: 18 },
  { name: "mid-off", distance: 24 },
  { name: "long-on", distance: 52 },
  { name: "long-off", distance: 58 },
];

/** How close, in metres, a fielder can reach to take a catch. */
const CATCH_REACH = 2.2;
/** Above this height the ball is over a fielder's head. */
const CATCH_CEILING = 46;

export const metresDownfield = (x: number) => (x - BATTER_X) / PX_PER_METRE;

/**
 * Can a fielder take this, right now?
 *
 * Called every frame while the ball is airborne. The ball must be within reach
 * horizontally and low enough to grab -- a six sails over long-on rather than
 * being caught by them, which falls out of the ceiling check rather than needing
 * a special case.
 */
export function catchableBy(x: number, y: number): Fielder | null {
  if (y > GROUND_Y - 1) return null;
  if (GROUND_Y - y > CATCH_CEILING) return null;

  const distance = metresDownfield(x);
  return FIELD.find((f) => Math.abs(f.distance - distance) <= CATCH_REACH) ?? null;
}

/** Runs for a ball that finished without being caught. */
export function resolveGroundedBall(x: number, clearedRopeOnTheFull: boolean): Outcome {
  const distance = metresDownfield(x);
  const boundaryMetres = BOUNDARY / PX_PER_METRE;

  if (clearedRopeOnTheFull) {
    return { runs: 6, description: `Six! ${Math.round(distance)}m, over the rope on the full.` };
  }
  if (distance >= boundaryMetres) {
    return { runs: 4, description: "Four, along the ground to the rope." };
  }

  // Running between the wickets is not simulated yet, so distance stands in for
  // it. Deliberately conservative: real cricket rarely turns 40m into three.
  const runs: Runs = distance >= 45 ? 3 : distance >= 28 ? 2 : distance >= 11 ? 1 : 0;
  return {
    runs,
    description: runs === 0 ? "No run." : `${runs} run${runs > 1 ? "s" : ""}.`,
  };
}

export function caught(fielder: Fielder): Outcome {
  return { runs: 0, wicket: "caught", description: `Caught at ${fielder.name}!` };
}

export function bowled(): Outcome {
  return { runs: 0, wicket: "bowled", description: "Bowled him! Through the gate." };
}
