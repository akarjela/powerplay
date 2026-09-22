import type { Shot } from "./shot";

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

  shot?: Shot;

  description: string;
}

export function countsAsBall(outcome: Outcome): boolean {
  return outcome.extra !== "wide" && outcome.extra !== "no-ball";
}

export function teamRuns(outcome: Outcome): number {
  return outcome.runs + (outcome.extra === "wide" || outcome.extra === "no-ball" ? 1 : 0);
}

export function runsAgainstBowler(outcome: Outcome): number {
  if (outcome.extra === "bye" || outcome.extra === "leg-bye") return 0;
  return teamRuns(outcome);
}
