import type { Length, Line } from "../../sim/delivery";

/**
 * The second axis.
 *
 * The physics is side-on: the ball has a distance downfield and a height, and
 * nothing else. That was enough for a game with four fielders in a row and no
 * leg side, and it is not enough for cricket, where the whole art of batting
 * is putting the ball where the fielders are not. This module invents the
 * coordinate the physics does not have -- a *bearing* -- and everything about
 * field placement, gaps, and "playing it late" hangs off it.
 *
 * Conventions, for a right-hander:
 *
 *   - Bearing is in degrees. 0 is straight back past the bowler. Positive is
 *     the leg side, negative the off side. +-90 is square of the wicket and
 *     anything past that is behind square: fine leg one way, third man the
 *     other.
 *   - The physics' distance downfield is treated as the ball's *radial*
 *     distance along that bearing. A 40m hit at 60 degrees lands 40m from the
 *     bat, out at deep mid-wicket, and 20m of it shows on the side-on screen.
 *
 * Pure. Numbers in, numbers out; the scene reads a Matter body and the harness
 * reads the same fields from the same engine.
 */

/** Degrees from straight. Positive is leg side. */
export type Bearing = number;

/** Where in the plan view something is, in metres from the striker's stumps. */
export interface PlanPoint {
  /** Toward the bowler. */
  along: number;
  /** Toward the leg side. */
  across: number;
}

// -- the direction model -----------------------------------------------------

/**
 * Where on the arc the bat met the ball, and how that becomes a direction.
 *
 * Play the ball early -- out in front, the blade already through the line --
 * and a right-hander drags it to leg: the face has closed. Play it late, under
 * the eyes or behind them, and the open face steers it to the off side. That is
 * the only physical fact this model needs, and it comes straight from the
 * collision: how far in front of the pivot the ball was when the bat struck it.
 *
 * "In front" is relative to the length. A full ball is *meant* to be met well
 * in front, a short one closer to the body, so the neutral point -- the contact
 * that goes straight -- is per length. These were measured by sweeping the
 * headless harness over swing timings and taking the median contact for each
 * length; see `tests/physics.test.ts`.
 */
export interface Contact {
  /** Pixels in front of the bat's pivot at the moment of contact. */
  aheadPx: number;
  length: Length;
  line: Line;
  /** Uniform in [-1, 1), from the scene's seeded rng. Never `Math.random`. */
  spray: number;
}

/**
 * Contact, in pixels ahead of the pivot, that sends each length straight.
 * Measured medians over the harness sweep at the calibration pace.
 */
const NEUTRAL_AHEAD: Record<Length, number> = {
  yorker: 18,
  full: 9,
  good: 13,
  short: 14,
};

/**
 * How much a pixel of timing turns the shot. 1.8 puts a ball met 25px early --
 * a genuinely early swing -- at 45 degrees, which is mid-wicket; 25px late is
 * cover. The corners of the blade's reach get to square, and only spray and a
 * leg-side line get behind it.
 */
const DEGREES_PER_PX = 1.8;

/**
 * The line moves the shot the way it does in cricket: a ball on leg stump is
 * hard to hit anywhere but leg, and one wide of off is hard to hit anywhere but
 * off. Modest, so timing still dominates.
 */
const LINE_BIAS: Record<Line, number> = {
  leg: 22,
  stumps: 6,
  off: -8,
  "wide-off": -24,
};

/** Degrees of scatter either side, so two identical contacts are not identical shots. */
const SPRAY = 10;

/** Behind this is the keeper's, and the physics has nothing to say about it. */
export const MAX_BEARING = 135;

export function shotBearing(contact: Contact): Bearing {
  const timing = (contact.aheadPx - NEUTRAL_AHEAD[contact.length]) * DEGREES_PER_PX;
  const bearing = timing + LINE_BIAS[contact.line] + contact.spray * SPRAY;
  return Math.max(-MAX_BEARING, Math.min(MAX_BEARING, bearing));
}

/**
 * The bearing a ball actually travelled on, given which way the physics sent it.
 *
 * The side-on engine only knows forward and back. When the bat sends the ball
 * *backward* -- a top edge, a late deflection -- that is a ball behind square
 * whatever the timing model said, so a bearing in front of square is reflected
 * behind it: mid-on becomes very fine leg, cover becomes third man. A bearing
 * already behind square is left alone. Forward balls keep their bearing.
 */
export function travelledBearing(downfieldM: number, bearing: Bearing): Bearing {
  if (downfieldM >= 0 || Math.abs(bearing) >= 90) return bearing;
  const sign = bearing >= 0 ? 1 : -1;
  return sign * (180 - Math.abs(bearing));
}

// -- geometry ----------------------------------------------------------------

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Radial distance and bearing to a point on the ground plan. */
export function planPosition(distanceM: number, bearing: Bearing): PlanPoint {
  const radians = toRadians(bearing);
  return { along: distanceM * Math.cos(radians), across: distanceM * Math.sin(radians) };
}

export function planDistance(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(a.along - b.along, a.across - b.across);
}

/**
 * How far a point sits from the line a ball is travelling along, and how far
 * along that line it is. Used to ask whether a rolling ball passes within a
 * fielder's reach: `offLine` is the miss, `alongLine` where on the ball's path
 * the nearest approach happens.
 */
export function relativeToPath(point: PlanPoint, bearing: Bearing): { offLine: number; alongLine: number } {
  const radians = toRadians(bearing);
  const dirAlong = Math.cos(radians);
  const dirAcross = Math.sin(radians);
  return {
    alongLine: point.along * dirAlong + point.across * dirAcross,
    offLine: Math.abs(point.across * dirAlong - point.along * dirAcross),
  };
}

// -- naming ------------------------------------------------------------------

/**
 * The fielding position a ball went to, so a scorecard can say "caught at
 * deep mid-wicket" rather than "caught at fielder 4". Bands are the
 * conventional ones for a right-hander; "deep" starts where the ring ends.
 */
export function regionName(bearing: Bearing, distanceM: number): string {
  const deep = distanceM >= 40;
  const leg = bearing >= 0;
  const angle = Math.abs(bearing);

  if (angle <= 12) return deep ? (leg ? "long-on" : "long-off") : "straight back past the bowler";
  if (angle <= 35) return leg ? (deep ? "long-on" : "mid-on") : deep ? "long-off" : "mid-off";
  if (angle <= 65) return leg ? (deep ? "deep mid-wicket" : "mid-wicket") : deep ? "deep cover" : "cover";
  if (angle <= 100) return leg ? (deep ? "deep square leg" : "square leg") : deep ? "deep point" : "point";
  return leg ? (deep ? "deep fine leg" : "fine leg") : deep ? "deep third man" : "third man";
}
