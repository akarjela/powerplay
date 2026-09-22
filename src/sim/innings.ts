import type { Rng } from "./rng";
import type { Squad, Batter, Bowler } from "./player";
import { bowl, phaseOf } from "./delivery";
import type { Delivery } from "./delivery";
import { playBall } from "./outcome";
import type { Outcome, Dismissal } from "./types";
import { countsAsBall, runsAgainstBowler, teamRuns } from "./types";
import { emptyExtras, tallyExtra } from "./scorecard";
import type { Extras, FallOfWicket } from "./scorecard";

export const OVERS = 20;
export const BALLS_PER_OVER = 6;
export const WICKETS = 10;

export const MAX_OVERS_PER_BOWLER = OVERS / 5;

export interface BattingLine {
  batter: Batter;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;

  dismissal?: Dismissal;

  how?: string;

  bowler?: string;
}

export interface BowlingLine {
  bowler: Bowler;

  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
}

export interface BallEvent {
  over: number;

  ball: number;
  striker: Batter;
  bowler: Bowler;
  delivery: Delivery;
  outcome: Outcome;

  runs: number;
  wickets: number;
}

export interface InningsSummary {
  squad: Squad;
  runs: number;
  wickets: number;

  balls: number;

  won?: boolean;
}

export interface InningsResult extends InningsSummary {
  batting: BattingLine[];
  bowling: BowlingLine[];
  extras: Extras;
  fallOfWickets: FallOfWicket[];
  log: BallEvent[];
}

export interface InningsOptions {
  target?: number;
}

const batterRuns = (outcome: Outcome) => (outcome.extra ? 0 : outcome.runs);

export function simulateInnings(
  batting: Squad,
  bowling: Squad,
  rng: Rng,
  options: InningsOptions = {},
): InningsResult {
  if (batting.batters.length < 2) throw new Error(`${batting.name} needs at least two batters`);
  if (bowling.bowlers.length < OVERS / MAX_OVERS_PER_BOWLER) {
    throw new Error(`${bowling.name} has too few bowlers to fill ${OVERS} overs`);
  }

  const batLines = new Map<string, BattingLine>();
  const bowlLines = new Map<string, BowlingLine>();
  const log: BallEvent[] = [];

  const lineFor = (batter: Batter): BattingLine => {
    let line = batLines.get(batter.id);
    if (!line) {
      line = { batter, runs: 0, balls: 0, fours: 0, sixes: 0 };
      batLines.set(batter.id, line);
    }
    return line;
  };
  const figuresFor = (bowler: Bowler): BowlingLine => {
    let line = bowlLines.get(bowler.id);
    if (!line) {
      line = { bowler, balls: 0, runs: 0, wickets: 0, maidens: 0 };
      bowlLines.set(bowler.id, line);
    }
    return line;
  };

  let striker = batting.batters[0];
  let nonStriker = batting.batters[1];
  let nextIn = 2;
  lineFor(striker);
  lineFor(nonStriker);
  const extras = emptyExtras();
  const fallOfWickets: FallOfWicket[] = [];

  let runs = 0;
  let wickets = 0;
  let balls = 0;
  let won = false;
  let lastBowler: Bowler | null = null;

  const oversBowled = (b: Bowler) => Math.floor((bowlLines.get(b.id)?.balls ?? 0) / BALLS_PER_OVER);

  for (let over = 0; over < OVERS && wickets < WICKETS && !won; over++) {
    const bowler = chooseBowler(bowling.bowlers, oversBowled, lastBowler, rng);
    lastBowler = bowler;
    const figures = figuresFor(bowler);
    const phase = phaseOf(over);

    let legal = 0;
    let concededThisOver = 0;

    while (legal < BALLS_PER_OVER && wickets < WICKETS && !won) {
      const strikerLine = lineFor(striker);
      const delivery = bowl(bowler, phase, rng);
      const outcome = playBall(
        striker,
        delivery,
        {
          phase,
          wicketsDown: wickets,
          ballsFaced: strikerLine.balls,
          required: options.target !== undefined
            ? { runs: options.target - runs, balls: OVERS * BALLS_PER_OVER - balls }
            : undefined,
        },
        rng,
      );

      const scored = teamRuns(outcome);
      const conceded = runsAgainstBowler(outcome);
      runs += scored;
      tallyExtra(extras, outcome);
      concededThisOver += conceded;
      figures.runs += conceded;

      if (countsAsBall(outcome)) {
        legal++;
        balls++;
        figures.balls++;
        strikerLine.balls++;
      }

      const off = batterRuns(outcome);
      strikerLine.runs += off;
      if (!outcome.extra && outcome.runs === 4) strikerLine.fours++;
      if (!outcome.extra && outcome.runs === 6) strikerLine.sixes++;

      if (outcome.wicket) {
        wickets++;
        strikerLine.dismissal = outcome.wicket;
        strikerLine.how = outcome.description;
        if (chargeableToBowler(outcome.wicket)) {
          figures.wickets++;
          strikerLine.bowler = bowler.name;
        }
        fallOfWickets.push({ wicket: wickets, runs, batter: striker.id, name: striker.name, balls });
      }

      log.push({ over, ball: legal || 1, striker, bowler, delivery, outcome, runs, wickets });

      if (options.target !== undefined && runs >= options.target) {
        won = true;
        break;
      }

      if (outcome.wicket) {
        if (nextIn >= batting.batters.length || wickets >= WICKETS) break;
        striker = batting.batters[nextIn++];
        lineFor(striker);
      } else if (scored % 2 === 1) {
        [striker, nonStriker] = [nonStriker, striker];
      }
    }

    if (concededThisOver === 0 && legal === BALLS_PER_OVER) figures.maidens++;
    [striker, nonStriker] = [nonStriker, striker];
  }

  return {
    squad: batting,
    runs,
    wickets,
    balls,
    batting: batting.batters.filter((b) => batLines.has(b.id)).map((b) => lineFor(b)),
    bowling: bowling.bowlers.filter((b) => bowlLines.has(b.id)).map((b) => figuresFor(b)),
    extras,
    fallOfWickets,
    log,
    won: options.target !== undefined ? won : undefined,
  };
}

const chargeableToBowler = (dismissal: Dismissal) => dismissal !== "run-out";

export function chooseBowler(
  bowlers: Bowler[],
  oversBowled: (bowler: Bowler) => number,
  last: Bowler | null,
  rng: Rng,
): Bowler {
  const withinAllocation = bowlers.filter((b) => oversBowled(b) < MAX_OVERS_PER_BOWLER);
  const eligible = withinAllocation.filter((b) => b.id !== last?.id);
  const pool = eligible.length > 0 ? eligible : withinAllocation;
  if (pool.length === 0) throw new Error("no bowler left with overs in hand");

  return pool[rng.weighted(pool.map((b) => MAX_OVERS_PER_BOWLER - oversBowled(b)))];
}

export function oversOf(balls: number): string {
  return `${Math.floor(balls / BALLS_PER_OVER)}.${balls % BALLS_PER_OVER}`;
}

export function economyOf(line: BowlingLine): number {
  return line.balls === 0 ? 0 : (line.runs / line.balls) * BALLS_PER_OVER;
}

export function strikeRateOf(line: BattingLine): number {
  return line.balls === 0 ? 0 : (line.runs / line.balls) * 100;
}
