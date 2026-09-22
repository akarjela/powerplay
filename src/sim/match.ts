import type { Rng } from "./rng";
import type { Squad } from "./player";
import { simulateInnings, OVERS, BALLS_PER_OVER, WICKETS, oversOf } from "./innings";
import type { InningsResult, InningsSummary } from "./innings";

export interface MatchResult {
  home: Squad;
  away: Squad;
  tossWinner: Squad;
  tossDecision: "bat" | "field";
  first: InningsResult;
  second: InningsResult;

  winner: Squad | null;

  margin: string;
  summary: string;
}

export function simulateMatch(home: Squad, away: Squad, rng: Rng): MatchResult {
  const tossWinner = rng.chance(0.5) ? home : away;

  const tossDecision = rng.chance(0.75) ? "field" : "bat";

  const tossLoser = tossWinner === home ? away : home;
  const battingFirst = tossDecision === "bat" ? tossWinner : tossLoser;
  const battingSecond = battingFirst === home ? away : home;

  const first = simulateInnings(battingFirst, battingSecond, rng);
  const second = simulateInnings(battingSecond, battingFirst, rng, { target: first.runs + 1 });

  return { home, away, tossWinner, tossDecision, first, second, ...resultOf(first, second) };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function resultOf(first: InningsSummary, second: InningsSummary): {
  winner: Squad | null; margin: string; summary: string;
} {
  if (second.runs > first.runs) {
    const ballsLeft = OVERS * BALLS_PER_OVER - second.balls;
    const margin = `won by ${plural(WICKETS - second.wickets, "wicket")} (${plural(ballsLeft, "ball")} remaining)`;
    return {
      winner: second.squad,
      margin,
      summary: `${second.squad.name} ${margin}, chasing ${first.runs}.`,
    };
  }

  if (first.runs > second.runs) {
    const margin = `won by ${plural(first.runs - second.runs, "run")}`;
    return {
      winner: first.squad,
      margin,
      summary: `${first.squad.name} ${margin}, defending ${first.runs}.`,
    };
  }

  return {
    winner: null,
    margin: "",
    summary: `Tied. Both sides made ${first.runs}.`,
  };
}

export function netRunRateInnings(innings: Pick<InningsSummary, "runs" | "wickets" | "balls">): { runs: number; overs: number } {
  const allOut = innings.wickets >= WICKETS;
  return {
    runs: innings.runs,
    overs: allOut ? OVERS : innings.balls / BALLS_PER_OVER,
  };
}

export function scoreline(innings: Pick<InningsSummary, "runs" | "wickets" | "balls">): string {
  const wickets = innings.wickets >= WICKETS ? `${innings.runs}` : `${innings.runs}/${innings.wickets}`;
  return `${wickets}${innings.wickets >= WICKETS ? " all out" : ""} (${oversOf(innings.balls)})`;
}
