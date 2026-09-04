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
/**
 * The simulated volume runs from here to WORLD_WIDTH. It used to start at the
 * left edge of the canvas, which was fine while every shot went forward; a
 * glance to fine leg goes *behind* the batter, so there has to be ground there
 * for it to land on and a wall far enough back that it does not rebound into
 * the frame.
 */
export const WORLD_LEFT = -m(45);
export const WORLD_WIDTH = BATTER_X + BOUNDARY + 400;
/** Behind this the ball is the keeper's and the delivery is over. */
export const KEEPER_X = BATTER_X - m(2);
/** Balls settle slowly; stop waiting once one is clearly finished. */
export const SETTLED_SPEED = 0.35;

// -- the bodies -------------------------------------------------------------

/**
 * Every Matter body the game builds, in one place, so the headless harness in
 * `tests/headless.ts` constructs the *same* world the scene does. Two copies of
 * these numbers would drift, and a harness that measures a slightly different
 * game is worse than no harness.
 *
 * Real g at this scale is ~78 px/s^2; Matter's `y` is a multiplier on its own
 * internal step, so GRAVITY_Y is empirical -- tuned so a lofted drive travels a
 * believable distance.
 */
export const GRAVITY_Y = 1.15;
/** A cricket ball off a hard pitch keeps a good deal of pace. */
export const GROUND_BODY = { friction: 0.75, restitution: 0.42 } as const;
export const BALL_BODY = { friction: 0.04, frictionAir: 0.006, density: 0.008 } as const;
/**
 * Heavy relative to the ball so a middled shot transfers energy to the ball
 * rather than the ball knocking the blade aside. A real bat barely rebounds;
 * the ball's own restitution does the work.
 */
export const BAT_BODY = { density: 0.05, restitution: 0.35, frictionAir: 0 } as const;

/**
 * How hard the outfield slows a rolling ball, metres per second squared.
 *
 * Matter has friction and air drag and no rolling resistance, so a struck ball
 * that stopped bouncing decayed exponentially and, in practice, never stopped:
 * measured, *every* ground shot that found a gap reached the rope, and the
 * median shot in a random sweep finished at 68m. The one-line field's catch
 * rate had been hiding it. A real outfield takes something like 4-6 m/s^2 out
 * of a ball, but Matter's air drag is already doing most of that here -- at
 * 20 m/s the `frictionAir` above is worth 7 m/s^2 on its own -- so this is the
 * remainder, not the whole. Measured: a ball leaving the bat along the ground
 * at 20 m/s now stops at about 25m. It is applied once a rendered frame, by
 * the scene and the harness alike, through `rollingVelocity()` in field.ts.
 */
export const ROLL_DECEL = 3.5;
/** Air drag per base frame -- the `frictionAir` above, as the factor Matter applies at 60Hz. */
export const AIR_DRAG_PER_FRAME = 1 - BALL_BODY.frictionAir;
/**
 * The bat's collision category. Everything else is Matter's default (1). A
 * wide is a ball the batter cannot reach, and the side-on physics has no
 * sideways to put it -- so it is bowled with a mask that excludes this bit and
 * passes through the blade. That is the honest rendering of "too wide to
 * play", short of a third axis.
 */
export const BAT_CATEGORY = 0x0002;
export const WIDE_BALL_MASK = 0xffffffff & ~BAT_CATEGORY;

// -- the camera --------------------------------------------------------------

/**
 * A real camera, high and square of the wicket on the off side.
 *
 * World coordinates are pixels: X along the pitch toward the bowler (the
 * physics' own x, measured from the striker's stumps), Y up (the physics' y,
 * flipped), Z across toward the leg side (invented by direction.ts; the
 * physics has no such axis). The camera sits 80m out on the off side and 24m
 * up, looking at a point over the pitch, so the pitch runs parallel to the
 * image plane: the delivery, the bounce and the whole arc of the bat are seen
 * square-on with no foreshortening, exactly as the side-on game showed them,
 * scaled by about 0.93. Depth is the leg side. Square leg is genuinely far and
 * small, point near and large, the rope a curve.
 *
 * The side-on view with a vertical "depth cue" that preceded this put square
 * leg on the batter's toes. A camera is the honest version of that cue.
 *
 * It looks dead level and the frame is shifted down instead -- a shift lens,
 * the way architectural photographs keep verticals vertical. Tilting the
 * camera down would tilt the bat's plane away from the screen by the same
 * angle, foreshortening the swing by a few percent and making the pointer
 * mapping approximate. Level, the plane is exactly parallel: the pointer maps
 * back onto the bat exactly, and every vertical in the world is vertical on
 * screen. `principal` is where the optical axis meets the canvas, and it is
 * the horizon.
 *
 * Fixed, not panning: with this focal length the frame runs from 25m behind
 * the batter to the straight rope at the pitch's depth, so nothing that
 * matters leaves it. Deep point and third man are behind the camera and are
 * on the radar only.
 */
export const CAMERA = {
  position: { x: m(24), y: m(24), z: -m(80) },
  lookAt: { x: m(24), y: m(24), z: 0 },
  principal: { x: CANVAS.width / 2, y: 118 },
  focal: 1088,
} as const;

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
 *
 * Negative: the hands sit a touch behind the body's centre, by the back hip,
 * which is where a batter in his stance holds them -- and it stands the
 * figure a stride in front of the stumps (his feet at 13-27px from them)
 * so they show behind him from square of the wicket. The pivot itself is
 * physics and does not move.
 */
export const GLOVE_LOCAL_X = -4;
