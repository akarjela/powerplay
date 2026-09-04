import {
  AIR_DRAG_PER_FRAME, BALL_RADIUS, BATTER_X, BOUNDARY, GROUND_Y, KEEPER_X, PX_PER_METRE,
  ROLL_DECEL, SETTLED_SPEED, STUMP_HEIGHT, STUMP_WIDTH,
} from "../config";
import type { Outcome, Runs } from "../../sim/types";
import type { Phase } from "../../sim/delivery";
import { planDistance, planPosition, regionName, relativeToPath, travelledBearing } from "./direction";
import type { Bearing } from "./direction";

export interface Fielder {
  name: string;

  bearing: Bearing;

  distance: number;
}

export const RING = 27.4;

const POWERPLAY: Fielder[] = [
  { name: "mid-off", bearing: -24, distance: 27 },
  { name: "extra cover", bearing: -46, distance: 27 },
  { name: "cover point", bearing: -66, distance: 26 },
  { name: "point", bearing: -86, distance: 25 },
  { name: "third man", bearing: -128, distance: 55 },
  { name: "mid-on", bearing: 24, distance: 27 },
  { name: "mid-wicket", bearing: 50, distance: 27 },
  { name: "square leg", bearing: 84, distance: 25 },
  { name: "fine leg", bearing: 130, distance: 52 },
];

const MIDDLE: Fielder[] = [
  { name: "long-off", bearing: -18, distance: 62 },
  { name: "mid-off", bearing: -28, distance: 26 },
  { name: "deep cover", bearing: -58, distance: 60 },
  { name: "point", bearing: -84, distance: 24 },
  { name: "short third man", bearing: -128, distance: 22 },
  { name: "long-on", bearing: 18, distance: 62 },
  { name: "mid-wicket", bearing: 46, distance: 24 },
  { name: "deep mid-wicket", bearing: 52, distance: 60 },
  { name: "deep square leg", bearing: 90, distance: 58 },
];

const DEATH: Fielder[] = [
  { name: "long-off", bearing: -15, distance: 64 },
  { name: "extra cover", bearing: -42, distance: 24 },
  { name: "sweeper cover", bearing: -62, distance: 60 },
  { name: "point", bearing: -86, distance: 22 },
  { name: "short third man", bearing: -128, distance: 22 },
  { name: "long-on", bearing: 15, distance: 64 },
  { name: "mid-wicket", bearing: 48, distance: 22 },
  { name: "deep mid-wicket", bearing: 50, distance: 62 },
  { name: "deep square leg", bearing: 88, distance: 60 },
];

const FIELDS: Record<Phase, Fielder[]> = { powerplay: POWERPLAY, middle: MIDDLE, death: DEATH };

export function fieldFor(phase: Phase): Fielder[] {
  return FIELDS[phase];
}

const CATCH_REACH = 2.4;

const CATCH_RUN = 4.0;
const MAX_CATCH_REACH = 10;

const CATCH_CEILING = 60;

const CATCH_FLOOR = 14;

const STOP_REACH = 3.0;

const STOP_RUN = 0.18;
const MAX_STOP_REACH = 14;

export const metresDownfield = (x: number) => (x - BATTER_X) / PX_PER_METRE;
const BOUNDARY_M = BOUNDARY / PX_PER_METRE;

export function catchableBy(
  distanceM: number,
  bearing: Bearing,
  height: number,
  onTheFull: boolean,
  airborneMs: number,
  field: Fielder[],
): Fielder | null {
  if (!onTheFull) return null;
  if (height < CATCH_FLOOR || height > CATCH_CEILING) return null;

  const reach = Math.min(MAX_CATCH_REACH, CATCH_REACH + CATCH_RUN * (airborneMs / 1000));
  const ball = planPosition(distanceM, bearing);
  return field.find((f) => planDistance(ball, planPosition(f.distance, f.bearing)) <= reach) ?? null;
}

export function interceptedBy(
  landingM: number,
  restM: number,
  bearing: Bearing,
  field: Fielder[],
): Fielder | null {
  const candidates = field
    .map((fielder) => ({ fielder, ...relativeToPath(planPosition(fielder.distance, fielder.bearing), bearing) }))
    .filter(({ offLine, alongLine }) => {
      const reach = Math.min(MAX_STOP_REACH, STOP_REACH + STOP_RUN * Math.max(0, alongLine - landingM));
      return offLine <= reach && alongLine >= landingM - 2 && alongLine <= restM + STOP_REACH;
    })
    .sort((a, b) => a.alongLine - b.alongLine);
  return candidates[0]?.fielder ?? null;
}

const PX_PER_STEP_PER_MPS = PX_PER_METRE / 60;

const ROLL_DECEL_PER_FRAME = (ROLL_DECEL / 60) * PX_PER_STEP_PER_MPS;

export function isRolling(y: number, vy: number): boolean {
  return y >= GROUND_Y - BALL_RADIUS - 20 && Math.abs(vy) < 2.5;
}

export function rollingVelocity(vx: number): number {
  const slower = Math.abs(vx) - ROLL_DECEL_PER_FRAME;
  return slower <= 0 ? 0 : Math.sign(vx) * slower;
}

export function predictRest(distanceM: number, vx: number): number {
  let v = Math.abs(vx);
  let px = 0;
  for (let frame = 0; frame < 2000 && v > 0.01; frame++) {
    v = rollingVelocity(v * AIR_DRAG_PER_FRAME);
    px += v;
  }
  return distanceM + px / PX_PER_METRE;
}

export function resolveGroundedBall(
  restM: number,
  bearing: Bearing,
  clearedRopeOnTheFull: boolean,
  landingM: number,
  field: Fielder[],
): Outcome {
  const region = regionName(bearing, restM);

  if (clearedRopeOnTheFull) {
    return { runs: 6, description: `Six! ${Math.round(restM)}m, over ${region}.` };
  }

  const fielder = interceptedBy(landingM, restM, bearing, field);
  if (fielder) {
    const runs: Runs = fielder.distance > RING ? 1 : 0;
    return {
      runs,
      description: runs === 0 ? `No run, straight to ${fielder.name}.` : `One, to ${fielder.name}.`,
    };
  }

  if (restM >= BOUNDARY_M) {
    return { runs: 4, description: `Four, through ${region}.` };
  }

  const runs: Runs = restM >= 55 ? 3 : restM >= 28 ? 2 : restM >= 11 ? 1 : 0;
  return {
    runs,
    description: runs === 0 ? "No run." : `${runs === 1 ? "One" : runs === 2 ? "Two" : "Three"}, into the gap at ${region}.`,
  };
}

export function caught(fielder: Fielder): Outcome {
  return { runs: 0, wicket: "caught", description: `Caught at ${fielder.name}!` };
}

export function bowled(): Outcome {
  return { runs: 0, wicket: "bowled", description: "Bowled him! Through the gate." };
}

export function lbw(): Outcome {
  return { runs: 0, wicket: "lbw", description: "Struck on the pad, and that is plumb. LBW." };
}

export function runOutChance(runs: number): number {
  if (runs === 1) return 0.002;
  if (runs === 2) return 0.010;
  if (runs === 3) return 0.035;
  return 0;
}

export function runOut(outcome: Outcome, roll: number): Outcome {
  if (outcome.wicket || outcome.extra === "wide" || outcome.extra === "no-ball") return outcome;
  if (roll >= runOutChance(outcome.runs)) return outcome;
  const completed = (outcome.runs - 1) as Outcome["runs"];
  return {
    ...outcome,
    runs: completed,
    wicket: "run-out",
    description: `Run out! Sent back for the ${outcome.runs === 1 ? "single" : outcome.runs === 2 ? "second" : "third"} and never made it.`,
  };
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  struck: boolean;

  bouncedAfterStrike: boolean;

  airborneMs: number;
  bearing: Bearing;

  landingM: number;
  field: Fielder[];

  padded?: boolean;

  illegal?: "wide" | "no-ball";
}

const WIDE: Outcome = { runs: 0, extra: "wide", description: "Wide. Called and signalled." };

export function judgeBall(ball: BallState): Outcome | null {
  const downfield = metresDownfield(ball.x);

  if (!ball.struck) {
    const overTheStumps = Math.abs(ball.x - BATTER_X) <= STUMP_WIDTH;
    if (ball.illegal !== "wide" && overTheStumps && ball.y > GROUND_Y - STUMP_HEIGHT) {
      return withExtra(ball.padded ? lbw() : bowled(), ball.illegal);
    }
    if (ball.x < KEEPER_X) {
      if (ball.illegal === "wide") return WIDE;
      return withExtra({ runs: 0, description: "Beaten -- through to the keeper." }, ball.illegal);
    }
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < SETTLED_SPEED && ball.y >= GROUND_Y - BALL_RADIUS - 2) {
      return ball.illegal === "wide" ? WIDE : withExtra({ runs: 0, description: "Beaten, no shot." }, ball.illegal);
    }
    return null;
  }

  const radial = Math.abs(downfield);
  const bearing = travelledBearing(downfield, ball.bearing);
  const onTheFull = !ball.bouncedAfterStrike;

  const fielder = catchableBy(radial, bearing, GROUND_Y - ball.y, onTheFull, ball.airborneMs, ball.field);
  if (fielder && ball.vy > 0) return withExtra(caught(fielder), ball.illegal);

  if (onTheFull && radial >= BOUNDARY_M) {
    return withExtra(resolveGroundedBall(radial, bearing, true, ball.landingM, ball.field), ball.illegal);
  }

  const bobbling = ball.bouncedAfterStrike && ball.airborneMs > 1800;
  const rolling = ball.bouncedAfterStrike && (isRolling(ball.y, ball.vy) || bobbling);
  const speed = Math.hypot(ball.vx, ball.vy);
  const settled = speed < SETTLED_SPEED && ball.y >= GROUND_Y - BALL_RADIUS - 2;
  if (!rolling && !settled && radial < BOUNDARY_M) return null;

  const rest = rolling ? predictRest(radial, ball.vx) : radial;
  return withExtra(
    resolveGroundedBall(rest, bearing, false, Math.abs(ball.landingM), ball.field),
    ball.illegal,
  );
}

function withExtra(outcome: Outcome, illegal: BallState["illegal"]): Outcome {
  if (illegal !== "no-ball") return outcome;
  const { wicket: _voided, ...rest } = outcome;
  return {
    ...rest,
    extra: "no-ball",
    description: `No ball! ${outcome.wicket ? "Not out -- overstepped. " : ""}${outcome.description}`,
  };
}
