import type { Rng } from "./rng";
import type { Batter } from "./player";
import { unit } from "./player";
import type { Delivery, Phase } from "./delivery";
import type { Outcome, Runs } from "./types";

/**
 * What happened to one ball, when the model played it rather than a human.
 *
 * The result is an `Outcome` -- the same type the physics path produces -- so
 * the scorecard cannot tell which of the two it is reading. That is the seam
 * the whole project rests on; see `types.ts`.
 *
 * The model runs in three steps, and they are separate on purpose:
 *
 *   1. **Intent.** What was the batter trying to do? This is where aggression,
 *      the phase and the match situation get their say, and it is decided
 *      *before* the outcome, so a slog that goes for six and a slog that gets
 *      caught came from the same decision.
 *   2. **Wicket.** Intent multiplies the delivery's threat against technique.
 *      Attacking roughly doubles the risk, which is what makes aggression a
 *      trade rather than a free upgrade.
 *   3. **Runs.** Intent picks the distribution; power and the delivery's
 *      latitude reshape it. Only reached if the batter survived.
 */

export type Intent = "defend" | "rotate" | "attack";

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

/** [dot, 1, 2, 3, 4, 6] for each intent, before power and latitude reshape them. */
const RUN_WEIGHTS: Record<Intent, number[]> = {
  defend: [0.600, 0.315, 0.045, 0.005, 0.030, 0.005],
  rotate: [0.265, 0.520, 0.105, 0.012, 0.080, 0.018],
  attack: [0.330, 0.225, 0.080, 0.010, 0.210, 0.145],
};

const RUN_VALUES: Runs[] = [0, 1, 2, 3, 4, 6];

/** Risk taken on, by intent. The reason aggression costs something. */
const INTENT_RISK: Record<Intent, number> = { defend: 0.55, rotate: 1.0, attack: 1.95 };

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

  const intent = chooseIntent(batter, context, rng);

  if (rng.chance(wicketChance(batter, delivery, intent, context))) {
    return dismissal(batter, delivery, intent, rng);
  }

  // A leg-side ball pushed at defensively runs away off the pad often enough to
  // be worth having, and it is the only thing that exercises the byes branch of
  // `runsAgainstBowler`.
  if (intent === "defend" && delivery.line === "leg" && rng.chance(0.03)) {
    return { runs: 1, extra: "leg-bye", description: "Leg bye, off the pad." };
  }

  return runsScored(batter, delivery, intent, rng);
}

/**
 * How the batter is playing this ball.
 *
 * Aggression is the batter's own bias; everything else is situation. Wickets in
 * hand matter most -- 8 down in the 18th over is the one time even a hitter
 * blocks -- and a chase that has drifted out of reach overrides all of it,
 * because there is no reward for a respectable defeat.
 */
export function chooseIntent(batter: Batter, context: BallContext, rng: Rng): Intent {
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
  intent: Intent,
  context: BallContext,
): number {
  const technique = unit(batter.technique);

  let chance = BASE_WICKET_CHANCE;
  chance *= 0.35 + 1.30 * delivery.threat;
  chance *= 1.45 - 0.90 * technique;
  chance *= INTENT_RISK[intent];
  if (context.ballsFaced < 5) chance *= 1.40;
  else if (context.ballsFaced < 12) chance *= 1.12;

  return Math.min(0.35, chance);
}

/**
 * Which way out.
 *
 * Driven by the ball rather than rolled flat, so the scorecard reads like
 * cricket: full and straight bowls people and traps them lbw, a mistimed slog
 * goes to a fielder, and the keeper only gets a stumping off a slow bowler
 * against someone who had already committed.
 */
function dismissal(batter: Batter, delivery: Delivery, intent: Intent, rng: Rng): Outcome {
  const straight = delivery.line === "stumps" || delivery.line === "leg";
  const full = delivery.length === "yorker" || delivery.length === "full";
  const slow = delivery.speed < 125;

  const weights = [
    straight && full ? 0.42 : 0.10,                   // bowled
    intent === "attack" ? 0.62 : 0.40,                // caught
    straight ? 0.22 : 0.05,                           // lbw
    intent === "rotate" ? 0.06 : 0.02,                // run-out
    slow && intent === "attack" ? 0.14 : 0.0,         // stumped
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

function runsScored(batter: Batter, delivery: Delivery, intent: Intent, rng: Rng): Outcome {
  const power = unit(batter.power);
  const weights = RUN_WEIGHTS[intent].slice();

  // Power and room both clear the rope; neither does it alone.
  const boundary = (0.55 + 0.90 * power) * (0.70 + 0.60 * delivery.latitude);
  weights[4] *= boundary;
  weights[5] *= boundary * (0.50 + 1.00 * power);

  // A ball with nowhere to hit it is a dot however good the batter is.
  weights[0] *= 0.75 + 0.50 * (1 - delivery.latitude);

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
