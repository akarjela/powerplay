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

/**
 * How close, in metres, a fielder can reach to take a catch.
 *
 * Smaller than it looks like it should be, and the reason is the field's
 * dimensionality rather than a fielder's arms. Four fielders on a single line
 * with 2.2m of reach cover 17.6m of a 68m ground -- a quarter of everywhere a
 * ball can go -- and measured, that made a third of all shots a catch. A real
 * field spreads nine fielders over 360 degrees, where the same reach covers a
 * tiny fraction of the *area*. Until there is a second axis (track 3), the reach
 * is what has to absorb the difference.
 */
const CATCH_REACH = 1.2;
/** Above this height the ball is over a fielder's head. */
const CATCH_CEILING = 60;
/**
 * Below this the ball is skidding along the turf, and a fielder stops it rather
 * than catching it.
 *
 * Without a floor, a ball *rolling* along the ground was catchable: it sits one
 * radius up, 6px, which sat comfortably inside a band that only excluded balls
 * at or under ground level. Combined with the missing bounce test below, that
 * made 66% of every shot in the game a catch.
 */
const CATCH_FLOOR = 14;

export const metresDownfield = (x: number) => (x - BATTER_X) / PX_PER_METRE;

/**
 * Can a fielder take this, right now?
 *
 * Three conditions, and the first is the one that defines a catch in cricket:
 * the ball must not have touched the ground since it was struck. That test was
 * missing entirely. The scene did own a `hasBounced` flag, but it is set by the
 * *delivery* pitching -- which happens before you have played at the ball -- so
 * it was already true by the time anyone could have caught anything, and it was
 * never consulted here at all.
 *
 * Then the ball must be in the air rather than skidding, and below a fielder's
 * reach: a six sails over long-on rather than being caught, which falls out of
 * the ceiling check rather than needing a special case.
 */
export function catchableBy(x: number, y: number, onTheFull: boolean): Fielder | null {
  if (!onTheFull) return null;

  const height = GROUND_Y - y;
  if (height < CATCH_FLOOR || height > CATCH_CEILING) return null;

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
  // Deliberately conservative: real cricket rarely turns 40m into three, and
  // threes are about 1% of balls in T20 -- rarer than sixes.
  const runs: Runs = distance >= 52 ? 3 : distance >= 28 ? 2 : distance >= 11 ? 1 : 0;
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
