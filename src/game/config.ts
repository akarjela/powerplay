/**
 * Scale, and the one place it is compromised.
 *
 * Field *distances* are true: PX_PER_METRE converts real cricket measurements,
 * so a boundary is genuinely 68m away and the run thresholds mean what they say.
 *
 * Gameplay *objects* are not, and cannot be. A cricket ball is 36mm across; at
 * any scale that fits a 68m ground on a screen it is a fraction of a pixel.
 * Matter cannot solve a sub-pixel body at 140kph -- it tunnels straight through
 * the bat -- and you could not see it if it could. So the bat and ball are sized
 * in pixels directly, exaggerated by roughly 4x, and that is a deliberate lie
 * stated here rather than a magic number hidden in a scene file.
 *
 * What stays honest: distances, speeds, and therefore every outcome.
 */

export const PX_PER_METRE = 14;

/**
 * Physics steps per second.
 *
 * 240, not the 60 you would reach for first. At 60Hz the blade tip of a full
 * swing travels ~22px per step -- wider than the ball (12px) and wider than the
 * blade itself -- so the bat teleports straight over the ball between steps and
 * makes no contact at any timing. Matter has no continuous collision detection,
 * so the fix is to make each step small enough that nothing can jump a gap.
 *
 * Everything below in per-step units derives from this. Change it and they all
 * move together.
 */
export const PHYSICS_FPS = 240;

/**
 * Matter normalises setVelocity, setAngularVelocity and frictionAir against a
 * 16.667ms base delta internally, so every per-step value below stays on this
 * base no matter what PHYSICS_FPS is. Rescaling them by hand double-counts --
 * doing so turned a 138kph delivery into a 34kph one.
 *
 * PHYSICS_FPS therefore buys collision resolution and nothing else, which is
 * exactly what it is for.
 */
const BASE_FPS = 60;

export const m = (metres: number) => metres * PX_PER_METRE;

/** Matter's setVelocity is px-per-step, not px-per-second. */
export const kph = (speed: number) => (speed * 1000 / 3600) * PX_PER_METRE / BASE_FPS;

// -- the ground, to the Laws of Cricket ------------------------------------

/** Law 6: 22 yards between the stumps. */
export const PITCH_LENGTH = m(20.12);
/** IPL grounds run roughly 65-75m straight. */
export const BOUNDARY = m(68);

// -- gameplay objects, exaggerated on purpose (see the header) -------------

export const BAT_LENGTH = 52;
export const BAT_WIDTH = 11;
export const BALL_RADIUS = 6;
export const STUMP_HEIGHT = 30;
export const STUMP_WIDTH = 8;

// -- scene layout ----------------------------------------------------------

export const CANVAS = { width: 1280, height: 720 };
/** Where the players stand. Leaves headroom above for a lofted six. */
export const GROUND_Y = 600;
/** The striker's stumps. Everything downfield is measured from here. */
/**
 * The far edge of the outfield, where the stands begin.
 *
 * A pure side-on view puts everything on one line, so a fielder at 18m appears
 * to be standing among the boundary hoardings. Lifting the stands above the
 * player line fakes just enough depth to read as an outfield, without pretending
 * to be a perspective projection.
 */
export const HORIZON_Y = GROUND_Y - 95;
export const BATTER_X = 160;
export const BOWLER_X = BATTER_X + PITCH_LENGTH;
/** How far the camera may travel before the boundary leaves the frame. */
export const MAX_SCROLL = BATTER_X + BOUNDARY + 120 - CANVAS.width;

// -- feel ------------------------------------------------------------------

/**
 * Peak swing speed, radians per physics step. A real batsman swings through
 * roughly 180 degrees in about 0.15s; at 60fps that is ~0.35 rad/step, so this
 * is deliberately in the same neighbourhood rather than an arbitrary number.
 *
 * The first version of this controller was far weaker, and the bat stalled 29
 * degrees short of the pointer because gravity's torque on the blade cancelled
 * it out. The ball arrives 0.55s after release; a bat that needs 0.5s to turn
 * 70 degrees cannot be swung at anything.
 */
export const MAX_SWING_SPEED = 0.42;
/** How hard the bat chases the pointer. Higher = twitchier, less lag, less skill. */
export const SWING_RESPONSE = 0.30;
/** Smooths the approach so the bat eases into the target instead of snapping. */
export const SWING_SMOOTHING = 0.45;

// -- the four lengths, as physics ------------------------------------------

/**
 * How each length is bowled, and why these numbers and not others.
 *
 * All of it measured by stepping the engine by hand -- never from screenshots,
 * because a backgrounded tab pauses requestAnimationFrame and the physics looks
 * broken when it is fine. Measured at 138kph:
 *
 * | length | pitches | at the bat | blade angle needed |
 * | ------ | ------- | ---------- | ------------------ |
 * | yorker |   1.8m  |     9px    | past vertical -- out of reach from a neutral pivot |
 * | full   |   4.3m  |    30px    | 52 degrees |
 * | good   |   7.5m  |    39px    | 64 degrees |
 * | short  |   9.4m  |    52px    | 79 degrees |
 *
 * That ladder is the point: each length asks for a visibly different bat, so
 * reading the bounce is worth something. The yorker being unreachable from a
 * neutral stance is deliberate -- it is what the front foot is *for*.
 *
 * Two things this cost, both found by measuring rather than assuming:
 *
 * A fixed aim per length does not survive a change of pace. At 148kph the
 * yorker and the full ball both arrived at 21px, and at 115kph the ordering
 * scrambled completely, because a slower ball carries less far before it
 * pitches. So the aim is solved per length *and* per speed: `aim` is the value
 * at the calibration pace and `aimPerKph` corrects it, both fitted to a binary
 * search over the real engine at 112 / 125 / 138 / 150kph.
 *
 * The bounce has to vary with the length, and that is a scale correction rather
 * than a claim about the ball. Vertical space near the batter is in figure
 * scale -- the bat and stumps are drawn about 4x life -- while the ball's flight
 * is in field scale, and a ball has further to travel after pitching short.
 * Holding restitution constant and simply digging the ball in harder makes it
 * arrive *lower* (23px, then 16px), because it has bounced and is already
 * falling by the time it reaches the bat.
 */
export interface DeliveryShape {
  /** Release height above the ground, in pixels. */
  releaseUp: number;
  /** Downward aim as a fraction of forward speed, at SHAPE_CALIBRATED_KPH. */
  aim: number;
  /** How much that aim must change per kph away from the calibration pace. */
  aimPerKph: number;
  restitution: number;
}

export const SHAPE_CALIBRATED_KPH = 138;

export const DELIVERY_SHAPE: Record<"yorker" | "full" | "good" | "short", DeliveryShape> = {
  yorker: { releaseUp: 150, aim: -0.019, aimPerKph: 0.0094, restitution: 0.70 },
  full: { releaseUp: 115, aim: -0.007, aimPerKph: 0.0076, restitution: 0.70 },
  good: { releaseUp: 90, aim: 0.083, aimPerKph: 0.0058, restitution: 0.70 },
  short: { releaseUp: 80, aim: 0.169, aimPerKph: 0.0051, restitution: 0.85 },
};

/**
 * The downward aim for a length at a given pace.
 *
 * Clamped at the bottom because a genuinely slow ball cannot be bowled as a
 * yorker -- below about 120kph the aim needed runs off the end of what the
 * trajectory can do and the ball lands fuller than intended. That is what a
 * slower-ball yorker does in real cricket too, so it is left as the behaviour
 * rather than special-cased.
 */
export function deliveryAim(shape: DeliveryShape, speedKph: number): number {
  return Math.max(-0.20, shape.aim + shape.aimPerKph * (speedKph - SHAPE_CALIBRATED_KPH));
}

// -- stance ----------------------------------------------------------------

/** Neutral is what you get when you commit to neither foot. */
export type Stance = "front" | "back" | "neutral";

/**
 * Where the bat's pivot sits. Everything about footwork is this and nothing
 * else -- the punishment is geometric rather than a lookup table.
 *
 * The blade is BAT_LENGTH from the pivot, so the lowest point it can reach is
 * (pivot height - 52). Against the arrival heights measured above:
 *
 *   front  pivot 54px up, blade reaches  2px -- the yorker at 9px is playable
 *   neutral      62px up,               10px -- the yorker is right on the edge
 *   back         68px up,               16px -- the yorker is unreachable
 *
 * and from the other end, the short ball at 47px wants the blade near
 * horizontal off the front foot (82 degrees) against a comfortable 66 off the
 * back. Nobody has to be told they played the wrong shot; the bat simply does
 * not arrive.
 *
 * Front foot also moves the pivot 20px down the wicket, so the ball is met
 * earlier. That is a timing change as well as a reach change, which is what
 * makes committing forward a real decision rather than a free extension.
 */
export const STANCE_OFFSET: Record<Stance, { x: number; y: number }> = {
  front: { x: 20, y: 8 },
  neutral: { x: 0, y: 0 },
  back: { x: -12, y: -6 },
};

/**
 * How fast the pivot travels to a new stance, per rendered frame.
 *
 * Deliberately not instant. At 0.22 a stance change is most of the way there in
 * about 150ms, against a ball that takes 533ms to arrive -- so changing your
 * mind after the ball has pitched does not get there in time. The commitment
 * cost is the same lag that makes the swing itself a skill, rather than a
 * separate rule bolted on.
 */
export const STANCE_RESPONSE = 0.22;

/** The striker's bat pivot when standing neutral. The one source of truth. */
export const PIVOT = { x: BATTER_X + 22, y: GROUND_Y - 62 };

/**
 * `drawBatsman` puts the glove this far right of the container's origin, so the
 * figure has to be drawn at PIVOT.x - this for the bat to be in his hands.
 *
 * The two were set independently before and disagreed by 8px. That was
 * invisible while both were static and would have read as the bat detaching
 * from the hands the moment the pivot started moving.
 */
export const GLOVE_LOCAL_X = 10;
