import type { Dismissal, Outcome } from "./types";
import type { BattingLine, BowlingLine, InningsResult } from "./innings";
import type { Batter, Squad } from "./player";

export interface Extras {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
}

export const emptyExtras = (): Extras => ({ wides: 0, noBalls: 0, byes: 0, legByes: 0 });

export function tallyExtra(extras: Extras, outcome: Outcome): void {
  switch (outcome.extra) {
    case "wide": extras.wides += 1 + outcome.runs; break;
    case "no-ball": extras.noBalls += 1 + outcome.runs; break;
    case "bye": extras.byes += outcome.runs; break;
    case "leg-bye": extras.legByes += outcome.runs; break;
  }
}

export const totalExtras = (e: Extras) => e.wides + e.noBalls + e.byes + e.legByes;

export interface FallOfWicket {
  wicket: number;
  runs: number;
  batter: string;
  name: string;
  balls: number;
}

export interface SheetBatting {
  id: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal?: Dismissal;
  bowler?: string;
}

export interface SheetBowling {
  id: string;
  name: string;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
}

export interface Scoresheet {
  squad: string;
  runs: number;
  wickets: number;
  balls: number;
  batting: SheetBatting[];
  didNotBat: { id: string; name: string }[];
  extras: Extras;
  fallOfWickets: FallOfWicket[];
  bowling: SheetBowling[];
}

export interface SheetParts {
  squad: Squad;
  runs: number;
  wickets: number;
  balls: number;
  batting: BattingLine[];
  bowling: BowlingLine[];
  extras: Extras;
  fallOfWickets: FallOfWicket[];
}

export function sheetFrom(parts: SheetParts): Scoresheet {
  const batted = new Set(parts.batting.map((l) => l.batter.id));
  return {
    squad: parts.squad.id,
    runs: parts.runs,
    wickets: parts.wickets,
    balls: parts.balls,
    batting: parts.batting.map((l) => {
      const line: SheetBatting = {
        id: l.batter.id, name: l.batter.name, runs: l.runs, balls: l.balls, fours: l.fours, sixes: l.sixes,
      };
      if (l.dismissal) line.dismissal = l.dismissal;
      if (l.bowler) line.bowler = l.bowler;
      return line;
    }),
    didNotBat: parts.squad.batters.filter((b: Batter) => !batted.has(b.id)).map((b) => ({ id: b.id, name: b.name })),
    extras: { ...parts.extras },
    fallOfWickets: parts.fallOfWickets.map((f) => ({ ...f })),
    bowling: parts.bowling.map((w) => ({
      id: w.bowler.id, name: w.bowler.name, balls: w.balls, maidens: w.maidens, runs: w.runs, wickets: w.wickets,
    })),
  };
}

export const sheetOf = (innings: InningsResult): Scoresheet => sheetFrom(innings);

export function howOut(line: Pick<SheetBatting, "dismissal" | "bowler">): string {
  switch (line.dismissal) {
    case undefined: return "not out";
    case "bowled": return `b ${line.bowler ?? ""}`.trim();
    case "caught": return `ct b ${line.bowler ?? ""}`.trim();
    case "lbw": return `lbw b ${line.bowler ?? ""}`.trim();
    case "stumped": return `st b ${line.bowler ?? ""}`.trim();
    case "run-out": return "run out";
  }
}
