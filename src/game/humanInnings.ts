import { BALLS_PER_OVER, OVERS, WICKETS } from "../sim/innings";
import type { BattingLine, InningsSummary } from "../sim/innings";
import { countsAsBall } from "../sim/types";
import type { Outcome } from "../sim/types";
import type { Batter, Squad } from "../sim/player";

export type BallMark = { label: string; kind: "dot" | "runs" | "boundary" | "wicket" | "extra" };

export class HumanInnings {
  runs = 0;
  wickets = 0;

  balls = 0;

  readonly squad?: Squad;

  readonly target?: number;

  private striker?: Batter;
  private nonStriker?: Batter;
  private nextIn = 2;
  private readonly lines = new Map<string, BattingLine>();

  private over: BallMark[] = [];
  private overRuns = 0;

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

  get won(): boolean | undefined {
    return this.target === undefined ? undefined : this.runs >= this.target;
  }

  get closedBecause(): string {
    if (this.target !== undefined && this.runs >= this.target) return "Target reached";
    if (this.wickets >= WICKETS) return "All out";
    if (this.balls >= OVERS * BALLS_PER_OVER) return "Innings complete";
    return "";
  }

  get required(): { runs: number; balls: number } | undefined {
    if (this.target === undefined) return undefined;
    return { runs: Math.max(0, this.target - this.runs), balls: OVERS * BALLS_PER_OVER - this.balls };
  }

  get requiredRate(): number {
    const need = this.required;
    if (!need || need.balls === 0) return 0;
    return (need.runs / need.balls) * BALLS_PER_OVER;
  }

  get oversText(): string {
    return `${Math.floor(this.balls / BALLS_PER_OVER)}.${this.balls % BALLS_PER_OVER}`;
  }

  get runRate(): number {
    return this.balls === 0 ? 0 : (this.runs / this.balls) * BALLS_PER_OVER;
  }

  get score(): string {
    return this.wickets >= WICKETS ? `${this.runs}` : `${this.runs}/${this.wickets}`;
  }

  get thisOver(): readonly BallMark[] {
    return this.over;
  }

  get thisOverRuns(): number {
    return this.overRuns;
  }

  get thisOverNumber(): number {
    return this.overNumber;
  }

  get atTheCrease(): BattingLine[] {
    return [this.striker, this.nonStriker].filter((b): b is Batter => Boolean(b)).map((b) => this.lineFor(b));
  }

  get battingLines(): BattingLine[] {
    return this.squad ? this.squad.batters.filter((b) => this.lines.has(b.id)).map((b) => this.lineFor(b)) : [];
  }

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
