import type { Rng } from "./rng";
import type { Squad, Batter, Bowler } from "./player";
import { bowl, phaseOf } from "./delivery";
import type { Delivery } from "./delivery";
import { playBall } from "./outcome";
import type { Outcome, Dismissal } from "./types";
import { countsAsBall, runsAgainstBowler } from "./types";

/**
 * Twenty overs, resolved ball by ball.
 *
 * This module owns the *bookkeeping* -- strike rotation, the over, who is
 * allowed to bowl next, when the innings is over -- and delegates every
 * judgement about what happened to `outcome.ts`. The split matters because in
 * M3 a human's swing produces an `Outcome` too, and this loop must be able to
 * consume it without knowing the difference.
 */

export const OVERS = 20;
export const BALLS_PER_OVER = 6;
export const WICKETS = 10;
/** Law: no bowler may bowl more than a fifth of the innings. */
export const MAX_OVERS_PER_BOWLER = OVERS / 5;

export interface BattingLine {
  batter: Batter;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** Absent while not out. */
  dismissal?: Dismissal;
  /** The scorecard line, e.g. "c Sharma b Iyer". */
  how?: string;
}

export interface BowlingLine {
  bowler: Bowler;
  /** Legal deliveries. Overs are derived, because 17 balls is 2.5 overs. */
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
}

export interface BallEvent {
  /** 0-indexed over. */
  over: number;
  /** 1-indexed legal ball within the over; a wide repeats the previous number. */
  ball: number;
  striker: Batter;
  delivery: Delivery;
  outcome: Outcome;
  /** Team score immediately after this ball. */
  runs: number;
  wickets: number;
}

export interface InningsResult {
  squad: Squad;
  runs: number;
  wickets: number;
  /** Legal balls bowled. */
  balls: number;
  batting: BattingLine[];
  bowling: BowlingLine[];
  log: BallEvent[];
  /** Set when the innings ended by reaching a target rather than running out. */
  won?: boolean;
}

export interface InningsOptions {
  /** Runs needed to win. When set, the innings stops the moment it is reached. */
  target?: number;
}

/** Runs the batting side gets, which unlike the bowler's figures includes byes. */
const teamRuns = (outcome: Outcome) =>
  outcome.runs + (outcome.extra === "wide" || outcome.extra === "no-ball" ? 1 : 0);

/** Runs credited to the batter, which excludes everything the bat did not make. */
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
      runs += scored;
      concededThisOver += runsAgainstBowler(outcome);
      figures.runs += runsAgainstBowler(outcome);

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
        figures.wickets += chargeableToBowler(outcome.wicket) ? 1 : 0;
        strikerLine.dismissal = outcome.wicket;
        strikerLine.how = outcome.description;
      }

      log.push({ over, ball: legal || 1, striker, delivery, outcome, runs, wickets });

      if (options.target !== undefined && runs >= options.target) {
        won = true;
        break;
      }

      if (outcome.wicket) {
        if (nextIn >= batting.batters.length || wickets >= WICKETS) break;
        striker = batting.batters[nextIn++];
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
    log,
    won: options.target !== undefined ? won : undefined,
  };
}

/** A run-out is nobody's wicket. Everything else goes on the bowler's figures. */
const chargeableToBowler = (dismissal: Dismissal) => dismissal !== "run-out";

/**
 * Who bowls the next over.
 *
 * Two hard rules -- four overs each, and never two in a row -- and one soft
 * preference: whoever has the most overs left. That spreads an attack evenly
 * without needing a captain's model, and it guarantees the twenty overs can
 * always be filled. If the rules ever paint us into a corner the consecutive
 * rule yields first, because bowling out of the allocation would be illegal
 * while bowling back-to-back is merely unusual.
 *
 * Exported because the scene rotates the attack you face with the same rule:
 * a human innings and a simulated one must agree on who is allowed to bowl.
 */
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

/** "17.4", the way a scorecard writes it. */
export function oversOf(balls: number): string {
  return `${Math.floor(balls / BALLS_PER_OVER)}.${balls % BALLS_PER_OVER}`;
}

/** Runs per over. Returns 0 rather than NaN for a bowler who has not bowled. */
export function economyOf(line: BowlingLine): number {
  return line.balls === 0 ? 0 : (line.runs / line.balls) * BALLS_PER_OVER;
}

/** Runs per 100 balls. Returns 0 rather than NaN for a batter who did not face one. */
export function strikeRateOf(line: BattingLine): number {
  return line.balls === 0 ? 0 : (line.runs / line.balls) * 100;
}
