/**
 * The seam between the physics game and the headless simulation.
 *
 * Nothing in this file may import Phaser. An `Outcome` is produced two ways --
 * by you hitting a ball, or by the model rolling one for an AI innings -- and
 * one scorecard implementation consumes both. If these paths ever grow separate
 * scoring code they will disagree about what happened, and the tournament stops
 * meaning anything. This type existing is what prevents that.
 */

export type Runs = 0 | 1 | 2 | 3 | 4 | 6;

export type Dismissal =
  | "bowled"
  | "caught"
  | "lbw"
  | "run-out"
  | "stumped";

export type Extra = "wide" | "no-ball" | "bye" | "leg-bye";

export interface Outcome {
  runs: Runs;
  wicket?: Dismissal;
  extra?: Extra;
  /** Human-readable, for commentary and for debugging a suspicious scorecard. */
  description: string;
}

/** Does this delivery count toward the six balls of an over? */
export function countsAsBall(outcome: Outcome): boolean {
  return outcome.extra !== "wide" && outcome.extra !== "no-ball";
}

/** Runs charged to the bowler, which excludes byes and leg-byes. */
export function runsAgainstBowler(outcome: Outcome): number {
  if (outcome.extra === "bye" || outcome.extra === "leg-bye") return 0;
  return outcome.runs + (outcome.extra === "wide" || outcome.extra === "no-ball" ? 1 : 0);
}
