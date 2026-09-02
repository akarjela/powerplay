import type { Length } from "./delivery";

/**
 * What a shot *is*, shared by both paths.
 *
 * This is deliberately separate from `outcome.ts`. That file also contains the
 * model of how an AI batter *decides* -- aggression, the phase, the required
 * rate -- and the physics game needs none of it: a human decides by pressing a
 * key. M3's `bridge.ts` imports this file and nothing else, so a human's shot
 * and a rolled one are the same kind of thing without the scene inheriting a
 * situational decision model it has no use for.
 */

export type Footwork = "front" | "back";

export type Commitment = "defend" | "rotate" | "attack";

/**
 * One shot: which foot, and how hard.
 *
 * A struct rather than six flat archetype names. The two axes are read by
 * different code against different things -- footwork against the delivery's
 * length, commitment against the run weights -- so fusing them would force every
 * table to re-encode the cross product. Archetype names like "pull" or "cut"
 * would also claim a leg side and an off side the model does not have; the view
 * is side-on until track 3, and this says only what is actually known.
 */
export interface Shot {
  footwork: Footwork;
  commitment: Commitment;
}

/**
 * How well the footwork matched the length, 0..1.
 *
 * The two catastrophes are the corners. Back foot to a yorker is 0.12: you are
 * playing from the crease at a ball aimed at its base and there is nothing you
 * can do. Front foot to a short ball is 0.22: committed forward, the ball climbs
 * past the edge. A good length is deliberately forgiving on both feet, because
 * in cricket it genuinely is -- which makes a misread there cheap and a misread
 * at either extreme expensive.
 */
const MATCH: Record<Footwork, Record<Length, number>> = {
  front: { yorker: 0.85, full: 1.00, good: 0.72, short: 0.22 },
  back: { yorker: 0.12, full: 0.42, good: 0.82, short: 1.00 },
};

export const matchQuality = (footwork: Footwork, length: Length): number =>
  MATCH[footwork][length];

/** The foot the ball asks for. Anything else is a misread. */
export const IDEAL_FOOT: Record<Length, Footwork> = {
  yorker: "front",
  full: "front",
  good: "front",
  short: "back",
};

export const playedTheRightFoot = (footwork: Footwork, length: Length): boolean =>
  IDEAL_FOOT[length] === footwork;
