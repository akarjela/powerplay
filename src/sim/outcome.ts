import type { Rng } from "./rng";
import type { Batter } from "./player";
import { unit } from "./player";
import type { Delivery, Length, Phase } from "./delivery";
import type { Outcome, Runs } from "./types";

/**
 * What happened to one ball, when the model played it rather than a human.
 *
 * The result is an `Outcome` -- the same type the physics path produces -- so
 * the scorecard cannot tell which of the two it is reading. That is the seam
 * the whole project rests on; see `types.ts`.
 *
 * A shot is two decisions on separate axes, and keeping them separate is what
 * lets the two batting attributes mean different things:
 *
 *   - **Footwork**, front or back, is a *read* of the delivery's length. The
 *     read can fail, and how often it fails is governed by `technique`. Getting
 *     it wrong is punished specifically rather than generally: back foot to a
 *     yorker is bowled, front foot to a short ball is a top edge.
 *   - **Commitment**, defend / rotate / attack, is how hard the batter goes,
 *     governed by `aggression`, the phase and the match situation.
 *
 * Both are chosen *before* the outcome is rolled, so a slog that goes for six
 * and a slog that gets caught came from the same decision. Then:
 *
 *   1. **Wicket.** The delivery's threat against technique, multiplied by the
 *      risk of the commitment and by how badly the footwork matched.
 *   2. **Runs.** Commitment picks the distribution; power, the delivery's
 *      latitude and the footwork match reshape it. Only reached if the batter
 *      survived.
 */

export type Commitment = "defend" | "rotate" | "attack";

export type Footwork = "front" | "back";

/**
 * One shot: which foot, and how hard.
 *
 * A struct rather than six flat archetype names, because the two axes are
 * driven by different attributes and every table below would otherwise have to
 * re-encode the cross product of them.
 */
export interface Shot {
  footwork: Footwork;
  commitment: Commitment;
}

export interface BallContext {
  phase: Phase;
  /** Wickets already lost, 0-9. A collapse should make batters play straighter. */
  wicketsDown: number;
  /** Balls this batter has faced. A new batter plays himself in and is vulnerable. */
  ballsFaced: number;
  /** Set when chasing. Falling behind forces risk that would otherwise be foolish. */
  required?: { runs: number; balls: number };
}

/** A par T20 rate. Chase pressure is measured against this, not against zero. */
const PAR_RUN_RATE = 8.5;

const PHASE_AGGRESSION: Record<Phase, number> = {
  powerplay: 1.15,
  middle: 0.85,
  death: 1.5,
};

/** [dot, 1, 2, 3, 4, 6] per commitment, before power, latitude and match reshape them. */
const RUN_WEIGHTS: Record<Commitment, number[]> = {
  defend: [0.600, 0.315, 0.045, 0.005, 0.030, 0.005],
  rotate: [0.265, 0.520, 0.105, 0.012, 0.080, 0.018],
  attack: [0.330, 0.225, 0.080, 0.010, 0.210, 0.145],
};

const RUN_VALUES: Runs[] = [0, 1, 2, 3, 4, 6];

/** Risk taken on, by commitment. The reason aggression costs something. */
const COMMITMENT_RISK: Record<Commitment, number> = { defend: 0.55, rotate: 1.0, attack: 1.95 };

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
const IDEAL_FOOT: Record<Length, Footwork> = {
  yorker: "front",
  full: "front",
  good: "front",
  short: "back",
};

/**
 * Reading the length is where `technique` lives.
 *
 * A tail-ender picks the right foot 70% of the time and a top-order player 96%,
 * which is the whole difference between them expressed as something you can
 * watch happen rather than a number on a wicket roll.
 */
const READ_FLOOR = 0.70;
const READ_RANGE = 0.26;

export function chooseFootwork(batter: Batter, delivery: Delivery, rng: Rng): Footwork {
  const ideal = IDEAL_FOOT[delivery.length];
  const readsIt = rng.chance(READ_FLOOR + READ_RANGE * unit(batter.technique));
  if (readsIt) return ideal;
  return ideal === "front" ? "back" : "front";
}

/**
 * How the footwork match modulates everything downstream.
 *
 * Each of these is *centred on the measured expected match*, 0.802 for an
 * average batter against the league's length mix, so every multiplier is 1.0 at
 * the mean. Adding the axis therefore changes the spread between a good batter
 * and a bad one without moving the league's averages, which is what let the
 * calibration bands hold through this change instead of touching off a tuning
 * spiral.
 *
 * If you change `LENGTH_MIX` in delivery.ts, re-measure the expected match and
 * re-centre these. They are not independent of it.
 */
const EXPECTED_MATCH = 0.802;
const MATCH_WICKET = { intercept: 1.0 + 1.15 * EXPECTED_MATCH, slope: 1.15 };
const MATCH_BOUNDARY = { intercept: 1.0 - 0.70 * EXPECTED_MATCH, slope: 0.70 };
const MATCH_DOT = { intercept: 1.0 + 0.45 * EXPECTED_MATCH, slope: 0.45 };

/**
 * Base chance of losing a wicket on a legal ball, before anything modifies it.
 * Tuned against the calibration test: an innings should lose 5-7 wickets, not
 * 3 and not 9.
 */
const BASE_WICKET_CHANCE = 0.044;

export function playBall(
  batter: Batter,
  delivery: Delivery,
  context: BallContext,
  rng: Rng,
): Outcome {
  if (delivery.illegal === "wide") {
    return { runs: 0, extra: "wide", description: "Wide, down the leg side." };
  }
  if (delivery.illegal === "no-ball") {
    return { runs: 0, extra: "no-ball", description: "No ball -- overstepped." };
  }

  return resolveShot(batter, delivery, chooseShot(batter, delivery, context, rng), context, rng);
}

/**
 * The two decisions, in the order a batter actually makes them: read the length
 * off the pitch, then decide how hard to go at it.
 */
export function chooseShot(
  batter: Batter,
  delivery: Delivery,
  context: BallContext,
  rng: Rng,
): Shot {
  return {
    footwork: chooseFootwork(batter, delivery, rng),
    commitment: chooseCommitment(batter, context, rng),
  };
}

/**
 * Resolve a shot that has already been chosen.
 *
 * Split out from `playBall` so a shot can be *supplied* rather than rolled --
 * which is how the physics game will feed a human's footwork through the same
 * model in M3, and how the tests force a specific mismatch.
 */
export function resolveShot(
  batter: Batter,
  delivery: Delivery,
  shot: Shot,
  context: BallContext,
  rng: Rng,
): Outcome {
  const match = matchQuality(shot.footwork, delivery.length);

  if (rng.chance(wicketChance(batter, delivery, shot, match, context))) {
    return dismissal(batter, delivery, shot, rng);
  }

  // A leg-side ball pushed at defensively runs away off the pad often enough to
  // be worth having, and it is the only thing that exercises the byes branch of
  // `runsAgainstBowler`.
  if (shot.commitment === "defend" && delivery.line === "leg" && rng.chance(0.03)) {
    return { runs: 1, extra: "leg-bye", description: "Leg bye, off the pad." };
  }

  return runsScored(batter, delivery, shot, match, rng);
}

/**
 * How hard the batter is going at this ball.
 *
 * Aggression is the batter's own bias; everything else is situation. Wickets in
 * hand matter most -- 8 down in the 18th over is the one time even a hitter
 * blocks -- and a chase that has drifted out of reach overrides all of it,
 * because there is no reward for a respectable defeat.
 */
export function chooseCommitment(batter: Batter, context: BallContext, rng: Rng): Commitment {
  const aggression = unit(batter.aggression);

  let attack = (0.16 + 0.48 * aggression) * PHASE_AGGRESSION[context.phase];

  // Wickets in hand buy risk; losing them takes it away.
  if (context.wicketsDown >= 8) attack *= 0.45;
  else if (context.wicketsDown >= 6) attack *= 0.70;
  else if (context.wicketsDown <= 2) attack *= 1.08;

  // A new batter plays himself in, whoever he is.
  if (context.ballsFaced < 5) attack *= 0.65;
  else if (context.ballsFaced < 12) attack *= 0.85;

  if (context.required) {
    const { runs, balls } = context.required;
    if (balls > 0) {
      const requiredRate = (runs / balls) * 6;
      // Two behind par is a nudge; six behind is a fire sale.
      attack *= Math.max(0.6, Math.min(2.2, 1 + (requiredRate - PAR_RUN_RATE) * 0.14));
    }
  }

  if (rng.chance(Math.min(0.92, attack))) return "attack";

  // Not attacking is not the same as blocking. A tight ball is defended; a
  // loose one is worked for one even when the batter was not looking to hit.
  return rng.chance(0.72 - 0.45 * delivered(context)) ? "rotate" : "defend";
}

/**
 * Rotating is easier the longer you have been in. Standing in for "settled",
 * which the model has no other way to express.
 */
const delivered = (context: BallContext) => (context.ballsFaced < 8 ? 0.55 : 0.15);

function wicketChance(
  batter: Batter,
  delivery: Delivery,
  shot: Shot,
  match: number,
  context: BallContext,
): number {
  const technique = unit(batter.technique);

  let chance = BASE_WICKET_CHANCE;
  chance *= 0.35 + 1.30 * delivery.threat;
  // Technique acts twice: directly here, and through the footwork read above.
  // This term used to be `1.45 - 0.90 * technique`, from when the read did not
  // exist. Measured, leaving it there put 4.50 wickets an innings between a
  // technique-92 side and a technique-12 one -- a tail-ender losing eight on his
  // own. Most of technique's effect belongs in the read, where it is legible as
  // playing the wrong shot rather than as an invisible multiplier.
  chance *= 1.30 - 0.55 * technique;
  chance *= COMMITMENT_RISK[shot.commitment];
  chance *= MATCH_WICKET.intercept - MATCH_WICKET.slope * match;
  if (context.ballsFaced < 5) chance *= 1.40;
  else if (context.ballsFaced < 12) chance *= 1.12;

  return Math.min(0.35, chance);
}

/**
 * Which way out.
 *
 * Driven by the ball and by the mistake, so the scorecard reads like cricket and
 * tells you what went wrong. Full and straight bowls people and traps them lbw,
 * a mistimed slog goes to a fielder, the keeper only gets a stumping off a slow
 * bowler against someone who had already committed -- and the two footwork
 * catastrophes each have their own signature. Stuck back to a ball at the base
 * of the stumps is bowled or lbw; stranded forward to one climbing past you is
 * caught off the glove or the shoulder of the bat.
 */
function dismissal(batter: Batter, delivery: Delivery, shot: Shot, rng: Rng): Outcome {
  const straight = delivery.line === "stumps" || delivery.line === "leg";
  const full = delivery.length === "yorker" || delivery.length === "full";
  const slow = delivery.speed < 125;

  const stuckBack = shot.footwork === "back" && full;
  const strandedForward = shot.footwork === "front" && delivery.length === "short";

  const weights = [
    stuckBack ? 0.75 : straight && full ? 0.42 : 0.10,          // bowled
    strandedForward ? 0.85 : shot.commitment === "attack" ? 0.62 : 0.40, // caught
    stuckBack ? 0.45 : straight ? 0.22 : 0.05,                  // lbw
    shot.commitment === "rotate" ? 0.06 : 0.02,                 // run-out
    slow && shot.commitment === "attack" ? 0.14 : 0.0,          // stumped
  ];

  switch (rng.weighted(weights)) {
    case 0:
      return { runs: 0, wicket: "bowled", description: `${batter.name} b ${delivery.bowler.name} -- through him.` };
    case 2:
      return { runs: 0, wicket: "lbw", description: `${batter.name} lbw ${delivery.bowler.name} -- plumb.` };
    case 3:
      return { runs: 0, wicket: "run-out", description: `${batter.name} run out -- hesitation at the striker's end.` };
    case 4:
      return { runs: 0, wicket: "stumped", description: `${batter.name} st. ${delivery.bowler.name} -- through the gate and gone.` };
    default:
      return { runs: 0, wicket: "caught", description: `${batter.name} c ${delivery.bowler.name} -- picked out the fielder.` };
  }
}

function runsScored(
  batter: Batter,
  delivery: Delivery,
  shot: Shot,
  match: number,
  rng: Rng,
): Outcome {
  const power = unit(batter.power);
  const weights = RUN_WEIGHTS[shot.commitment].slice();

  // Power and room both clear the rope; neither does it alone, and neither
  // helps at all if you are on the wrong foot.
  const boundary = (0.55 + 0.90 * power)
    * (0.70 + 0.60 * delivery.latitude)
    * (MATCH_BOUNDARY.intercept + MATCH_BOUNDARY.slope * match);
  weights[4] *= boundary;
  weights[5] *= boundary * (0.50 + 1.00 * power);

  // A ball with nowhere to hit it is a dot however good the batter is.
  weights[0] *= (0.75 + 0.50 * (1 - delivery.latitude))
    * (MATCH_DOT.intercept - MATCH_DOT.slope * match);

  const runs = RUN_VALUES[rng.weighted(weights)];
  return { runs, description: describe(runs, delivery) };
}

function describe(runs: Runs, delivery: Delivery): string {
  switch (runs) {
    case 0: return `Dot ball, ${delivery.length} length.`;
    case 6: return "Six! Into the crowd.";
    case 4: return "Four, beats the fielder.";
    case 1: return "One, worked away.";
    default: return `${runs} runs.`;
  }
}
