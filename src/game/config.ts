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
