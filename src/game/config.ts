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

/** Frames per second Matter is stepped at, for velocity conversion. */
const FPS = 60;

export const m = (metres: number) => metres * PX_PER_METRE;

/** Matter's setVelocity is px-per-step, not px-per-second. */
export const kph = (speed: number) => (speed * 1000 / 3600) * PX_PER_METRE / FPS;

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
/** Leaves ~14m of headroom above the ground, which a lofted six needs. */
export const GROUND_Y = 640;
/** The striker's stumps. Everything downfield is measured from here. */
export const BATTER_X = 160;
export const BOWLER_X = BATTER_X + PITCH_LENGTH;
/** How far the camera may travel before the boundary leaves the frame. */
export const MAX_SCROLL = BATTER_X + BOUNDARY + 120 - CANVAS.width;

// -- feel ------------------------------------------------------------------

/**
 * The single number deciding whether the bat feels heavy or twitchy. It wants
 * tuning by playing, not by reasoning -- there is no test for it.
 */
export const SWING_TORQUE = 0.012;
/** Opposes the torque so the bat settles instead of oscillating. */
export const SWING_DAMPING = 0.14;
