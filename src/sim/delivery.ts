import type { Rng } from "./rng";
import type { Bowler } from "./player";
import { unit } from "./player";

/**
 * One ball, before anyone has played at it.
 *
 * Kept separate from the outcome on purpose. A delivery is a fact about what
 * the bowler did -- 142kph, back of a length, angled across -- and it exists
 * whether the batter middles it, misses it, or (in M3) a human swings a bat at
 * it on screen. The physics game will render *this*, so the attack a player
 * faces visibly changes with the bowler's attributes rather than being a
 * hardcoded seamer.
 */

export type Length = "yorker" | "full" | "good" | "short";
export type Line = "wide-off" | "off" | "stumps" | "leg";

/** Which stretch of the innings. Bowlers and batters both behave differently in each. */
export type Phase = "powerplay" | "middle" | "death";

export function phaseOf(over: number): Phase {
  if (over < 6) return "powerplay";
  if (over < 16) return "middle";
  return "death";
}

export interface Delivery {
  bowler: Bowler;
  /** kph, as bowled. The physics game converts this with `kph()` from config. */
  speed: number;
  length: Length;
  line: Line;
  /** Lateral deviation off the pitch or in the air, 0-1. Swing and seam. */
  deviation: number;
  /**
   * How dangerous this ball is, 0-1. Feeds the wicket roll and nothing else.
   * A jaffa is high threat *and* low latitude; a slower ball misread is high
   * threat but generous if the batter picks it.
   */
  threat: number;
  /**
   * How much freedom the batter has to score, 0-1. Feeds the run weights.
   * A wide half-volley is high latitude however fast it was bowled.
   */
  latitude: number;
  /** Set when the ball was never legal. The batter is not consulted about these. */
  illegal?: "wide" | "no-ball";
}

/** Length by phase, before accuracy pulls it toward the one that was intended. */
const LENGTH_INTENT: Record<Phase, Length> = {
  powerplay: "good",
  middle: "good",
  death: "yorker",
};

/** How much room each length gives the batter, and how often it threatens. */
const LENGTH_TRAITS: Record<Length, { latitude: number; threat: number }> = {
  yorker: { latitude: 0.20, threat: 0.55 },
  full: { latitude: 0.70, threat: 0.50 },
  good: { latitude: 0.35, threat: 0.60 },
  short: { latitude: 0.60, threat: 0.40 },
};

const LINE_TRAITS: Record<Line, { latitude: number; threat: number }> = {
  "wide-off": { latitude: 0.75, threat: 0.25 },
  off: { latitude: 0.45, threat: 0.60 },
  stumps: { latitude: 0.30, threat: 0.70 },
  leg: { latitude: 0.65, threat: 0.30 },
};

const LENGTHS: Length[] = ["yorker", "full", "good", "short"];
const LINES: Line[] = ["wide-off", "off", "stumps", "leg"];

/**
 * Bowl one.
 *
 * Accuracy is the spine of this function: it decides how often the ball lands
 * where it was aimed, how often it strays wide, and therefore both how many
 * extras a bowler concedes and how many free hits the batter is handed. Pace
 * sets the speed band; movement and variation sharpen the threat once the ball
 * is already in a good area, which is why a fast innacurate bowler goes for
 * runs and a slow accurate one does not.
 */
export function bowl(bowler: Bowler, phase: Phase, rng: Rng): Delivery {
  const accuracy = unit(bowler.accuracy);
  const pace = unit(bowler.pace);
  const movement = unit(bowler.movement);
  const variation = unit(bowler.variation);

  // A wide is a miss so large it was never playable. Accuracy is most of it;
  // the death is where bowlers try the yorker and miss by a foot outside off.
  const wideChance = (0.055 - 0.040 * accuracy) * (phase === "death" ? 1.5 : 1);
  if (rng.chance(wideChance)) {
    return blankDelivery(bowler, speedOf(pace, variation, phase, rng), "wide");
  }
  if (rng.chance(0.006 - 0.004 * accuracy)) {
    return blankDelivery(bowler, speedOf(pace, variation, phase, rng), "no-ball");
  }

  const intended = LENGTH_INTENT[phase];
  const length = rng.chance(0.30 + 0.55 * accuracy) ? intended : rng.pick(LENGTHS);
  // Accurate bowlers live at the stumps and just outside off; loose ones drift.
  const line = rng.weighted([
    0.10 + 0.10 * (1 - accuracy), // wide-off
    0.30 + 0.15 * accuracy,       // off
    0.25 + 0.20 * accuracy,       // stumps
    0.20 * (1 - accuracy) + 0.08, // leg
  ]);

  const deviation = movement * rng.range(0.2, 1.0);
  const speed = speedOf(pace, variation, phase, rng);

  const lengthTrait = LENGTH_TRAITS[length];
  const lineTrait = LINE_TRAITS[LINES[line]];

  // Threat is where the ball landed, plus what the bowler did to it. Movement
  // carries the most weight of the three by some way: the areas alone are too
  // narrow a band to separate an elite attack from a poor one, and the first
  // version of this leaned on them so heavily that a 92-accuracy attack and a
  // 12-accuracy attack differed by 8% of an innings. Pace matters least, which
  // is the honest reading of T20 cricket.
  const threat = clamp01(
    0.40 * (0.5 * lengthTrait.threat + 0.5 * lineTrait.threat) +
      0.38 * deviation +
      0.12 * pace +
      0.08 * variation * rng.next(),
  );

  // Latitude is the area again, but a good bowler tightens even a poor ball.
  const latitude = clamp01(
    (0.55 * lengthTrait.latitude + 0.45 * lineTrait.latitude) * (1.40 - 0.75 * accuracy),
  );

  return { bowler, speed, length, line: LINES[line], deviation, threat, latitude };
}

/**
 * kph. Pace 50 is a 135kph seamer, pace 0 a 118kph spinner, pace 100 a 152kph
 * quick. Variation buys the slower ball, which shows up mostly at the death.
 */
function speedOf(pace: number, variation: number, phase: Phase, rng: Rng): number {
  const base = 118 + 34 * pace + rng.range(-4, 4);
  const slowerBallChance = variation * (phase === "death" ? 0.28 : 0.10);
  return rng.chance(slowerBallChance) ? base - rng.range(12, 26) : base;
}

/**
 * A wide or a no-ball. It carries a speed so the scene has something to render,
 * and neutral threat and latitude that no one reads -- the innings scores these
 * from the `illegal` field before the batter is consulted.
 */
function blankDelivery(bowler: Bowler, speed: number, illegal: "wide" | "no-ball"): Delivery {
  return {
    bowler,
    speed,
    length: "good",
    line: illegal === "wide" ? "wide-off" : "stumps",
    deviation: 0,
    threat: 0,
    latitude: 0,
    illegal,
  };
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
