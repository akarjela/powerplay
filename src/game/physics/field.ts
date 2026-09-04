import {
  AIR_DRAG_PER_FRAME, BALL_RADIUS, BATTER_X, BOUNDARY, GROUND_Y, KEEPER_X, PX_PER_METRE,
  ROLL_DECEL, SETTLED_SPEED, STUMP_HEIGHT, STUMP_WIDTH,
} from "../config";
import type { Outcome, Runs } from "../../sim/types";
import type { Phase } from "../../sim/delivery";
import { planDistance, planPosition, regionName, relativeToPath, travelledBearing } from "./direction";
import type { Bearing } from "./direction";

/**
 * Turns a ball's flight into a cricket result.
 *
 * Kept as pure functions over positions rather than Phaser callbacks so the
 * mapping can be reasoned about and tested. The scene watches the ball and asks
 * this module what happened; it never decides for itself -- and neither does
 * the headless harness, which calls exactly the same `judgeBall`. One judge,
 * two callers, so a measurement of the game is a measurement of the game.
 */

export interface Fielder {
  name: string;
  /** Degrees from straight; positive is the leg side. See direction.ts. */
  bearing: Bearing;
  /** Metres from the striker's stumps. */
  distance: number;
}

/**
 * The 30-yard circle. Inside it is the ring; outside it is the deep, and the
 * powerplay caps how many fielders may be out there.
 */
export const RING = 27.4;

/**
 * Three fields, one a phase.
 *
 * This is the thing the second axis was for. Four fielders on a line could not
 * express a field *setting*; nine on a plan can, and the settings follow the
 * Laws: overs 1-6 allow two men outside the circle, the rest five. So the
 * powerplay is a ring of seven with third man and fine leg back -- clear the
 * infield and the boundary is yours -- and the middle and death overs put the
 * sweepers out and dare you to find the gaps between them.
 *
 * Positions are conventional ones for a right-hander, at conventional depths.
 * The in-and-out pairs on one line (mid-off under long-off) are deliberate and
 * common: they take the drive and the lofted drive with the same two men.
 */
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

// -- reach -------------------------------------------------------------------

/**
 * A fielder's reach standing still, in metres, for a catch. This was 1.2m --
 * smaller than a fielder's arms -- because four fielders on a single line
 * covered a quarter of everywhere a ball could go and the reach was the only
 * thing absorbing that. On a plan, the number can mean what it says.
 */
const CATCH_REACH = 2.4;
/** And how far they run for one, metres a second, while the ball is in the air. */
const CATCH_RUN = 4.0;
const MAX_CATCH_REACH = 10;
/** Above this height the ball is over a fielder's head. */
const CATCH_CEILING = 60;
/**
 * Below this the ball is skidding along the turf, and a fielder stops it rather
 * than catching it. Without a floor a *rolling* ball was catchable -- it sits
 * one radius up -- and that made 66% of every shot in the game a catch.
 */
const CATCH_FLOOR = 14;

/**
 * Reach for a ball along the ground: what they cover standing still, plus what
 * they run while the ball travels to them. Measured with a fixed 4m reach,
 * five men in the deep stopped almost nothing and every ground shot in a gap
 * was four; fielders move, and the further away the ball lands the longer
 * they have to move.
 */
const STOP_REACH = 3.0;
/** Metres of lateral ground covered per metre the ball still has to travel to reach them. */
const STOP_RUN = 0.18;
const MAX_STOP_REACH = 14;

export const metresDownfield = (x: number) => (x - BATTER_X) / PX_PER_METRE;
const BOUNDARY_M = BOUNDARY / PX_PER_METRE;

/**
 * Can a fielder take this, right now?
 *
 * Three conditions, and the first is the one that defines a catch in cricket:
 * the ball must not have touched the ground since it was struck. Then it must
 * be in the air rather than skidding, and below a fielder's reach -- a six sails
 * over long-on rather than being caught, which falls out of the ceiling check.
 * And it has to be *near* the fielder on the plan, allowing for the ground
 * they can cover in the time the ball has been up.
 */
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

/**
 * The fielder who cuts off a ball along the ground, if anyone does.
 *
 * A ball rolls from where it landed to where it would stop, and any fielder
 * who can get to that path collects it -- so a lofted shot over mid-on is not
 * fielded by mid-on, and a firm push straight to him is. A fielder just beyond
 * where the ball would have stopped still gets it: they walk in.
 */
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

// -- rolling -----------------------------------------------------------------

/** 1 m/s, in Matter's px-per-base-step. */
const PX_PER_STEP_PER_MPS = PX_PER_METRE / 60;
/** How much ROLL_DECEL takes off a rolling ball's speed each rendered frame. */
const ROLL_DECEL_PER_FRAME = (ROLL_DECEL / 60) * PX_PER_STEP_PER_MPS;

/**
 * Is the ball on the turf, or as good as?
 *
 * Generous about small hops on purpose. Matter resolves a 0.7-restitution ball
 * against the ground as an endless series of shrinking bounces rather than a
 * roll, and a strict "on the ground and still" test watched one bobble in
 * place at 52m for six seconds. A ball hopping a few pixels is a ball a
 * fielder picks up; treat it as rolling.
 */
export function isRolling(y: number, vy: number): boolean {
  return y >= GROUND_Y - BALL_RADIUS - 20 && Math.abs(vy) < 2.5;
}

/** The velocity a rolling ball should have next frame. Applied by scene and harness alike. */
export function rollingVelocity(vx: number): number {
  const slower = Math.abs(vx) - ROLL_DECEL_PER_FRAME;
  return slower <= 0 ? 0 : Math.sign(vx) * slower;
}

/**
 * Where a rolling ball will stop, in radial metres, given where it is and how
 * fast it is going. Steps the same two laws the ball is actually subject to --
 * the drag Matter applies and the deceleration `rollingVelocity` applies -- so
 * the prediction and the physics agree to within a frame. This is what lets a
 * ball be judged the moment it is rolling rather than the several seconds
 * later it would take to stop, which is how broadcast calls it too.
 *
 * Matter's velocity is normalised to its 16.667ms base delta, so a velocity is
 * pixels per *rendered frame* whatever PHYSICS_FPS is. The first version of
 * this multiplied by the four physics steps in a frame and predicted every
 * firm ground shot to the rope; the unit test caught it at 88m for 20 m/s.
 */
export function predictRest(distanceM: number, vx: number): number {
  let v = Math.abs(vx);
  let px = 0;
  for (let frame = 0; frame < 2000 && v > 0.01; frame++) {
    v = rollingVelocity(v * AIR_DRAG_PER_FRAME);
    px += v;
  }
  return distanceM + px / PX_PER_METRE;
}

// -- scoring -----------------------------------------------------------------

/** Runs for a ball that finished, or will finish, on the ground without being caught. */
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
    // Straight to a man in the ring is a dot -- that is what the ring is for.
    // To a man in the deep they take one, because he has the whole outfield
    // to walk it in from. Twos come from the gaps, not from hitting fielders.
    const runs: Runs = fielder.distance > RING ? 1 : 0;
    return {
      runs,
      description: runs === 0 ? `No run, straight to ${fielder.name}.` : `One, to ${fielder.name}.`,
    };
  }

  if (restM >= BOUNDARY_M) {
    return { runs: 4, description: `Four, through ${region}.` };
  }

  // Running between the wickets is not simulated, so distance stands in for
  // it. Deliberately conservative: threes are about 1% of balls in T20, and
  // measured at 52m they were 6% of shots, so the line sits at 55.
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

/**
 * The chance a run is a run-out, per ball, given how many were attempted.
 *
 * The physics has no running in it -- the judge says how many a shot was
 * worth from where it finished -- so a run-out is the one dismissal that
 * has to be a roll. A single is safe; a two is a call; a three is a risk.
 * Set so run-outs are about the share of wickets they are on the simulated
 * side (a few percent): measured over the harness's sweep, 0.4% of balls.
 * The scene and the harness roll it the same way, through `runOut`.
 */
export function runOutChance(runs: number): number {
  if (runs === 1) return 0.002;
  if (runs === 2) return 0.010;
  if (runs === 3) return 0.035;
  return 0;
}

/**
 * The run-out, if the roll says so: the last run is not completed, the
 * batter is gone, and the runs already crossed stand. Only a struck ball
 * with runs on it can be one.
 */
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

// -- the judge ---------------------------------------------------------------

/** Everything the judge needs to know about the ball, read once a frame. */
export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  struck: boolean;
  /** Has it touched the ground since the shot? Decides a catch, and six against four. */
  bouncedAfterStrike: boolean;
  /** Milliseconds since the bat struck it. Zero before that. */
  airborneMs: number;
  bearing: Bearing;
  /** Radial metres where the struck ball first touched down. Zero until it has. */
  landingM: number;
  field: Fielder[];
  /**
   * The batter is forward: the pad is between the ball and the stumps. A ball
   * that would have hit them is lbw rather than bowled. The physics has no
   * pad; the stance is the honest stand-in, and it is the same read the
   * simulation makes when it calls a front-foot miss on a full ball lbw.
   */
  padded?: boolean;
  /** A delivery that was never legal. The bat cannot reach a wide; a no-ball is played. */
  illegal?: "wide" | "no-ball";
}

const WIDE: Outcome = { runs: 0, extra: "wide", description: "Wide. Called and signalled." };

/**
 * What happened to this ball, if it has happened yet.
 *
 * Called once a rendered frame by the scene, and once a frame by the harness.
 * Returns null while the ball is still live. The order matters: bowled is
 * checked before the keeper, a catch before the rope, and a rolling or
 * departed ball last.
 *
 * The physics only knows forward and back. A ball the bat sends *backward* --
 * a top edge, a late deflection -- is a ball that went behind square, so its
 * bearing is mirrored past 90 degrees and its distance taken as radial. That
 * is what puts fine leg and third man in the game.
 */
export function judgeBall(ball: BallState): Outcome | null {
  const downfield = metresDownfield(ball.x);

  if (!ball.struck) {
    // The stumps are a box, not a half-plane. This used to test only the near
    // edge, so a ball that passed over them and dropped on its way to the
    // keeper was bowled several frames after it had gone by.
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

  // Six is "over the rope without bouncing *after the shot*". This used to
  // read a flag set when the delivery pitched, so the only sixes in the game
  // were yorkers hit before they landed.
  if (onTheFull && radial >= BOUNDARY_M) {
    return withExtra(resolveGroundedBall(radial, bearing, true, ball.landingM, ball.field), ball.illegal);
  }

  // A ball is judged as soon as it is rolling. One that has bounced and is
  // still bobbling toward the rope after this long gets the same treatment:
  // Matter can keep a 0.85-restitution ball hopping for seconds, and nobody
  // waits for that on television either.
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

/**
 * A no-ball is played like any other delivery and then re-scored: one extra on
 * top, the ball not counted, and the batter cannot be out to it. That is the
 * same rule `playBall` applies on the simulated side, so a season's extras
 * column means the same thing whichever path produced it.
 */
function withExtra(outcome: Outcome, illegal: BallState["illegal"]): Outcome {
  if (illegal !== "no-ball") return outcome;
  const { wicket: _voided, ...rest } = outcome;
  return {
    ...rest,
    extra: "no-ball",
    description: `No ball! ${outcome.wicket ? "Not out -- overstepped. " : ""}${outcome.description}`,
  };
}
