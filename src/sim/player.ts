/**
 * Players, as the numbers the simulation actually reads.
 *
 * Every attribute is 0-100 and means one specific thing, because the whole
 * point of the sim-depth decision was to avoid a single overall rating. A
 * batter with power 90 and technique 40 should play visibly differently from
 * the reverse -- more sixes, more often out -- and that only happens if the
 * model consults the two separately.
 *
 * The squads that fill these in arrive in M3. This file is the shape they take.
 */

/** 0-100, where 50 is a league-average player and 85+ is a star. */
export type Rating = number;

export interface Batter {
  id: string;
  name: string;
  /** Clearing the rope. Drives the four and six weights, nothing else. */
  power: Rating;
  /** Not getting out. The direct counterweight to a bowler's threat. */
  technique: Rating;
  /** How readily they take the risk. Shifts intent, which moves runs *and* wickets. */
  aggression: Rating;
}

export interface Bowler {
  id: string;
  name: string;
  /** Sets the delivery's speed band in kph. 50 is roughly 132kph. */
  pace: Rating;
  /** Hitting the intended length and line. Suppresses extras and free boundaries. */
  accuracy: Rating;
  /** Swing, seam and turn. The wicket-taking attribute. */
  movement: Rating;
  /** Slower balls, yorkers, the ball that is not the one before it. Punishes settled batters. */
  variation: Rating;
}

export interface Squad {
  id: string;
  name: string;
  /** In batting order. The first eleven bat; the sim never goes past the list. */
  batters: Batter[];
  /** Anyone who may be given an over. At least five, or the over allocation cannot be filled. */
  bowlers: Bowler[];
}

/** Maps a 0-100 rating onto [0, 1], which is the form every formula wants. */
export const unit = (rating: Rating) => Math.max(0, Math.min(100, rating)) / 100;

/**
 * A generic player, for tests and for the placeholder attack the physics game
 * faces before real squads land. Deliberately mid: every attribute 50.
 */
export function averageBatter(id: string, name = id): Batter {
  return { id, name, power: 50, technique: 50, aggression: 50 };
}

export function averageBowler(id: string, name = id): Bowler {
  return { id, name, pace: 50, accuracy: 50, movement: 50, variation: 50 };
}
