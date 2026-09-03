import { BALLS_PER_OVER, OVERS, WICKETS } from "../sim/innings";
import type { BattingLine, InningsSummary } from "../sim/innings";
import { countsAsBall } from "../sim/types";
import type { Outcome } from "../sim/types";
import type { Batter, Squad } from "../sim/player";

/**
 * The state of the innings you are batting.
 *
 * This exists because the scene did not have it. `MatchScene` counted runs and
 * wickets into two fields and never checked either against anything, so the
 * innings had no end: you could be 48 wickets down off 61 balls and it would
 * keep bowling. That is the exact failure the project was started to fix --
 * Little Master Cricket's endless innings with no consequence -- reproduced by
 * accident.
 *
 * It is deliberately pure and Phaser-free, so it can be tested without a
 * browser, and it takes its limits from `src/sim/innings.ts` rather than
 * declaring its own. A human innings and a simulated one must agree on what
 * twenty overs is, or the tournament will not add up.
 *
 * Given a squad it also keeps the batting order -- who is on strike, who is
 * out and how, each man's runs and balls -- with the same rotation rules the
 * simulation uses: odd runs swap the ends, so does the end of an over, and a
 * new batter takes the striker's end. Given a target it ends the moment the
 * target is passed and can say what is still required. `summary` is the
 * `InningsSummary` the result and the table read, the same shape the
 * simulation produces.
 */

export type BallMark = { label: string; kind: "dot" | "runs" | "boundary" | "wicket" | "extra" };

export class HumanInnings {
  runs = 0;
  wickets = 0;
  /** Legal balls bowled. */
  balls = 0;

  readonly squad?: Squad;
  /** Runs needed to win, when chasing. The innings ends the moment it is reached. */
  readonly target?: number;

  private striker?: Batter;
  private nonStriker?: Batter;
  private nextIn = 2;
  private readonly lines = new Map<string, BattingLine>();

  /** The current over so far, for the broadcast strip. Cleared as each over starts. */
  private over: BallMark[] = [];
  private overRuns = 0;
  /** 1-based; the over the strip is showing. */
  private overNumber = 1;

  constructor(squad?: Squad, target?: number) {
    this.squad = squad;
    this.target = target;
    if (squad) {
      this.striker = squad.batters[0];
      this.nonStriker = squad.batters[1];
    }
  }

  record(outcome: Outcome): void {
    if (this.complete) return;

    // A completed over is cleared when the *next* ball arrives rather than as
    // it finishes, so the strip still shows the over you just watched.
    if (this.balls > 0 && this.balls % BALLS_PER_OVER === 0 && this.over.length >= BALLS_PER_OVER) {
      this.over = [];
      this.overRuns = 0;
      this.overNumber = this.balls / BALLS_PER_OVER + 1;
    }

    const scored = outcome.runs + (outcome.extra === "wide" || outcome.extra === "no-ball" ? 1 : 0);
    this.runs += scored;
    this.overRuns += scored;
    if (outcome.wicket) this.wickets++;
    const legal = countsAsBall(outcome);
    if (legal) this.balls++;

    this.over.push(markFor(outcome));

    if (this.striker) {
      const line = this.lineFor(this.striker);
      if (legal) line.balls++;
      if (!outcome.extra) {
        line.runs += outcome.runs;
        if (outcome.runs === 4) line.fours++;
        if (outcome.runs === 6) line.sixes++;
      }
      if (outcome.wicket) {
        line.dismissal = outcome.wicket;
        line.how = outcome.description;
        this.striker = this.squad!.batters[this.nextIn++];
      } else if (outcome.runs % 2 === 1) {
        [this.striker, this.nonStriker] = [this.nonStriker, this.striker];
      }
      // Over up: the ends change.
      if (legal && this.balls % BALLS_PER_OVER === 0 && !this.complete) {
        [this.striker, this.nonStriker] = [this.nonStriker, this.striker];
      }
    }
  }

  get complete(): boolean {
    return this.wickets >= WICKETS
      || this.balls >= OVERS * BALLS_PER_OVER
      || (this.target !== undefined && this.runs >= this.target);
  }

  /** Chasing: did we get there? Undefined when there was no target. */
  get won(): boolean | undefined {
    return this.target === undefined ? undefined : this.runs >= this.target;
  }

  /** Why it ended, for the closing card. Empty while the innings is live. */
  get closedBecause(): string {
    if (this.target !== undefined && this.runs >= this.target) return "Target reached";
    if (this.wickets >= WICKETS) return "All out";
    if (this.balls >= OVERS * BALLS_PER_OVER) return "Innings complete";
    return "";
  }

  /** What is still needed, when chasing. */
  get required(): { runs: number; balls: number } | undefined {
    if (this.target === undefined) return undefined;
    return { runs: Math.max(0, this.target - this.runs), balls: OVERS * BALLS_PER_OVER - this.balls };
  }

  /** Runs per over still needed. Zero rather than NaN when there are no balls left. */
  get requiredRate(): number {
    const need = this.required;
    if (!need || need.balls === 0) return 0;
    return (need.runs / need.balls) * BALLS_PER_OVER;
  }

  /** "10.1" -- overs are balls, not decimals. */
  get oversText(): string {
    return `${Math.floor(this.balls / BALLS_PER_OVER)}.${this.balls % BALLS_PER_OVER}`;
  }

  /** Runs per over. Zero rather than NaN before a ball has been bowled. */
  get runRate(): number {
    return this.balls === 0 ? 0 : (this.runs / this.balls) * BALLS_PER_OVER;
  }

  get score(): string {
    return this.wickets >= WICKETS ? `${this.runs}` : `${this.runs}/${this.wickets}`;
  }

  get thisOver(): readonly BallMark[] {
    return this.over;
  }

  /** Runs off the over on the strip, extras included. */
  get thisOverRuns(): number {
    return this.overRuns;
  }

  /** The over on the strip, 1-based. Stays on a finished over until the next ball. */
  get thisOverNumber(): number {
    return this.overNumber;
  }

  /** The men at the crease, striker first. Empty without a squad. */
  get atTheCrease(): BattingLine[] {
    return [this.striker, this.nonStriker].filter((b): b is Batter => Boolean(b)).map((b) => this.lineFor(b));
  }

  /** Everyone who has batted, in order. */
  get battingLines(): BattingLine[] {
    return this.squad ? this.squad.batters.filter((b) => this.lines.has(b.id)).map((b) => this.lineFor(b)) : [];
  }

  /** The shape the result and the table read. Needs a squad. */
  get summary(): InningsSummary {
    if (!this.squad) throw new Error("an innings without a squad has no summary");
    return { squad: this.squad, runs: this.runs, wickets: this.wickets, balls: this.balls, won: this.won };
  }

  private lineFor(batter: Batter): BattingLine {
    let line = this.lines.get(batter.id);
    if (!line) {
      line = { batter, runs: 0, balls: 0, fours: 0, sixes: 0 };
      this.lines.set(batter.id, line);
    }
    return line;
  }
}

function markFor(outcome: Outcome): BallMark {
  if (outcome.wicket) return { label: "W", kind: "wicket" };
  if (outcome.extra) return { label: outcome.extra === "wide" ? "wd" : "nb", kind: "extra" };
  if (outcome.runs === 0) return { label: "•", kind: "dot" };
  if (outcome.runs >= 4) return { label: String(outcome.runs), kind: "boundary" };
  return { label: String(outcome.runs), kind: "runs" };
}
