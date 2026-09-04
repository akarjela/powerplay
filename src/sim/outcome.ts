import type { Rng } from "./rng";
import type { Batter } from "./player";
import { unit } from "./player";
import type { Delivery, Phase } from "./delivery";
import { IDEAL_FOOT, matchQuality } from "./shot";
import type { Commitment, Footwork, Shot } from "./shot";
import type { Outcome, Runs } from "./types";

export interface BallContext {
  phase: Phase;

  wicketsDown: number;

  ballsFaced: number;

  required?: { runs: number; balls: number };
}

const PAR_RUN_RATE = 8.5;

const PHASE_AGGRESSION: Record<Phase, number> = {
  powerplay: 1.15,
  middle: 0.85,
  death: 1.5,
};

const RUN_WEIGHTS: Record<Commitment, number[]> = {
  defend: [0.600, 0.315, 0.045, 0.005, 0.030, 0.005],
  rotate: [0.265, 0.520, 0.105, 0.012, 0.080, 0.018],
  attack: [0.330, 0.225, 0.080, 0.010, 0.210, 0.145],
};

const RUN_VALUES: Runs[] = [0, 1, 2, 3, 4, 6];

const COMMITMENT_RISK: Record<Commitment, number> = { defend: 0.55, rotate: 1.0, attack: 1.95 };

const READ_FLOOR = 0.70;
const READ_RANGE = 0.26;

export function chooseFootwork(batter: Batter, delivery: Delivery, rng: Rng): Footwork {
  const ideal = IDEAL_FOOT[delivery.length];
  const readsIt = rng.chance(READ_FLOOR + READ_RANGE * unit(batter.technique));
  if (readsIt) return ideal;
  return ideal === "front" ? "back" : "front";
}

export const EXPECTED_MATCH = 0.802;
const MATCH_WICKET = { intercept: 1.0 + 1.15 * EXPECTED_MATCH, slope: 1.15 };
const MATCH_BOUNDARY = { intercept: 1.0 - 0.70 * EXPECTED_MATCH, slope: 0.70 };
const MATCH_DOT = { intercept: 1.0 + 0.45 * EXPECTED_MATCH, slope: 0.45 };

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

export function resolveShot(
  batter: Batter,
  delivery: Delivery,
  shot: Shot,
  context: BallContext,
  rng: Rng,
): Outcome {
  const match = matchQuality(shot.footwork, delivery.length);

  if (rng.chance(wicketChance(batter, delivery, shot, match, context))) {
    return { ...dismissal(batter, delivery, shot, rng), shot };
  }

  if (shot.commitment === "defend" && delivery.line === "leg" && rng.chance(0.03)) {
    return { runs: 1, extra: "leg-bye", shot, description: "Leg bye, off the pad." };
  }

  return { ...runsScored(batter, delivery, shot, match, rng), shot };
}

export function chooseCommitment(batter: Batter, context: BallContext, rng: Rng): Commitment {
  const aggression = unit(batter.aggression);

  let attack = (0.16 + 0.48 * aggression) * PHASE_AGGRESSION[context.phase];

  if (context.wicketsDown >= 8) attack *= 0.45;
  else if (context.wicketsDown >= 6) attack *= 0.70;
  else if (context.wicketsDown <= 2) attack *= 1.08;

  if (context.ballsFaced < 5) attack *= 0.65;
  else if (context.ballsFaced < 12) attack *= 0.85;

  if (context.required) {
    const { runs, balls } = context.required;
    if (balls > 0) {
      const requiredRate = (runs / balls) * 6;

      attack *= Math.max(0.6, Math.min(2.2, 1 + (requiredRate - PAR_RUN_RATE) * 0.14));
    }
  }

  if (rng.chance(Math.min(0.92, attack))) return "attack";

  return rng.chance(0.72 - 0.45 * delivered(context)) ? "rotate" : "defend";
}

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

  chance *= 1.30 - 0.55 * technique;
  chance *= COMMITMENT_RISK[shot.commitment];
  chance *= MATCH_WICKET.intercept - MATCH_WICKET.slope * match;
  if (context.ballsFaced < 5) chance *= 1.40;
  else if (context.ballsFaced < 12) chance *= 1.12;

  return Math.min(0.35, chance);
}

function dismissal(batter: Batter, delivery: Delivery, shot: Shot, rng: Rng): Outcome {
  const straight = delivery.line === "stumps" || delivery.line === "leg";
  const full = delivery.length === "yorker" || delivery.length === "full";
  const slow = delivery.speed < 125;

  const stuckBack = shot.footwork === "back" && full;
  const strandedForward = shot.footwork === "front" && delivery.length === "short";

  const weights = [
    stuckBack ? 0.75 : straight && full ? 0.42 : 0.10,
    strandedForward ? 0.85 : shot.commitment === "attack" ? 0.62 : 0.40,
    stuckBack ? 0.45 : straight ? 0.22 : 0.05,
    shot.commitment === "rotate" ? 0.06 : 0.02,
    slow && shot.commitment === "attack" ? 0.14 : 0.0,
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

  const boundary = (0.55 + 0.90 * power)
    * (0.70 + 0.60 * delivery.latitude)
    * (MATCH_BOUNDARY.intercept + MATCH_BOUNDARY.slope * match);
  weights[4] *= boundary;
  weights[5] *= boundary * (0.50 + 1.00 * power);

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
