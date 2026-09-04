import type { Rng } from "./rng";
import type { Bowler } from "./player";
import { unit } from "./player";

export type Length = "yorker" | "full" | "good" | "short";
export type Line = "wide-off" | "off" | "stumps" | "leg";

export type Phase = "powerplay" | "middle" | "death";

export function phaseOf(over: number): Phase {
  if (over < 6) return "powerplay";
  if (over < 16) return "middle";
  return "death";
}

export interface Delivery {
  bowler: Bowler;

  speed: number;
  length: Length;
  line: Line;

  deviation: number;

  threat: number;

  latitude: number;

  illegal?: "wide" | "no-ball";
}

const LENGTH_MIX: Record<Phase, number[]> = {
  powerplay: [0.08, 0.22, 0.45, 0.25],
  middle: [0.10, 0.18, 0.47, 0.25],

  death: [0.38, 0.20, 0.22, 0.20],
};

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

export function bowl(bowler: Bowler, phase: Phase, rng: Rng): Delivery {
  const accuracy = unit(bowler.accuracy);
  const pace = unit(bowler.pace);
  const movement = unit(bowler.movement);
  const variation = unit(bowler.variation);

  const wideChance = (0.055 - 0.040 * accuracy) * (phase === "death" ? 1.5 : 1);
  if (rng.chance(wideChance)) {
    return blankDelivery(bowler, speedOf(pace, variation, phase, rng), "wide");
  }
  if (rng.chance(0.006 - 0.004 * accuracy)) {
    return blankDelivery(bowler, speedOf(pace, variation, phase, rng), "no-ball");
  }

  const plan = LENGTH_MIX[phase];
  const length = LENGTHS[rng.weighted(plan.map((w) => w * accuracy + 0.25 * (1 - accuracy)))];

  const line = rng.weighted([
    0.10 + 0.10 * (1 - accuracy),
    0.30 + 0.15 * accuracy,
    0.25 + 0.20 * accuracy,
    0.20 * (1 - accuracy) + 0.08,
  ]);

  const deviation = movement * rng.range(0.2, 1.0);
  const speed = speedOf(pace, variation, phase, rng);

  const lengthTrait = LENGTH_TRAITS[length];
  const lineTrait = LINE_TRAITS[LINES[line]];

  const threat = clamp01(
    0.40 * (0.5 * lengthTrait.threat + 0.5 * lineTrait.threat) +
      0.38 * deviation +
      0.12 * pace +
      0.08 * variation * rng.next(),
  );

  const latitude = clamp01(
    (0.55 * lengthTrait.latitude + 0.45 * lineTrait.latitude) * (1.40 - 0.75 * accuracy),
  );

  return { bowler, speed, length, line: LINES[line], deviation, threat, latitude };
}

function speedOf(pace: number, variation: number, phase: Phase, rng: Rng): number {
  const base = 118 + 34 * pace + rng.range(-4, 4);
  const slowerBallChance = variation * (phase === "death" ? 0.28 : 0.10);
  return rng.chance(slowerBallChance) ? base - rng.range(12, 26) : base;
}

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
