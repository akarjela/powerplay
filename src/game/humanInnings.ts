import { BALLS_PER_OVER, OVERS, WICKETS } from "../sim/innings";
import type { BattingLine, BowlingLine, InningsSummary } from "../sim/innings";
import { countsAsBall, runsAgainstBowler, teamRuns } from "../sim/types";
import type { Outcome } from "../sim/types";
import type { Batter, Bowler, Squad } from "../sim/player";
import { emptyExtras, sheetFrom, tallyExtra } from "../sim/scorecard";
import type { Extras, FallOfWicket, Scoresheet } from "../sim/scorecard";

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
  private readonly figures = new Map<string, BowlingLine>();
  readonly extras: Extras = emptyExtras();
  readonly fallOfWickets: FallOfWicket[] = [];

  private over: BallMark[] = [];
  private overRuns = 0;
  private overConceded = 0;

  private overNumber = 1;

  constructor(squad?: Squad, target?: number) {
    this.squad = squad;
    this.target = target;
    if (squad) {
      this.striker = squad.batters[0];
      this.nonStriker = squad.batters[1];
      this.lineFor(this.striker);
      this.lineFor(this.nonStriker);
    }
  }

  record(outcome: Outcome, bowler?: Bowler): void {
    if (this.complete) return;

    if (this.balls > 0 && this.balls % BALLS_PER_OVER === 0 && this.over.length >= BALLS_PER_OVER) {
      this.over = [];
      this.overRuns = 0;
      this.overConceded = 0;
      this.overNumber = this.balls / BALLS_PER_OVER + 1;
    }

    const scored = teamRuns(outcome);
    this.runs += scored;
    this.overRuns += scored;
    tallyExtra(this.extras, outcome);
    if (outcome.wicket) this.wickets++;
    const legal = countsAsBall(outcome);
    if (legal) this.balls++;

    this.over.push(markFor(outcome));

    if (bowler) {
      const figures = this.bowlingLineFor(bowler);
      const conceded = runsAgainstBowler(outcome);
      if (legal) figures.balls++;
      figures.runs += conceded;
      this.overConceded += conceded;
      if (outcome.wicket && outcome.wicket !== "run-out") figures.wickets++;
      if (legal && figures.balls % BALLS_PER_OVER === 0 && this.overConceded === 0) figures.maidens++;
    }

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
        if (bowler && outcome.wicket !== "run-out") line.bowler = bowler.name;
        this.fallOfWickets.push({
          wicket: this.wickets, runs: this.runs, batter: this.striker.id, name: this.striker.name, balls: this.balls,
        });
        this.striker = this.squad!.batters[this.nextIn++];
        if (this.striker) this.lineFor(this.striker);
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

  get allOut(): boolean {
    return this.wickets >= WICKETS;
  }

  get score(): string {
    return this.allOut ? `${this.runs}` : `${this.runs}/${this.wickets}`;
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

  get bowlingLines(): BowlingLine[] {
    return [...this.figures.values()];
  }

  bowlingLineFor(bowler: Bowler): BowlingLine {
    let line = this.figures.get(bowler.id);
    if (!line) {
      line = { bowler, balls: 0, runs: 0, wickets: 0, maidens: 0 };
      this.figures.set(bowler.id, line);
    }
    return line;
  }

  oversBowled(bowler: Bowler): number {
    return Math.floor((this.figures.get(bowler.id)?.balls ?? 0) / BALLS_PER_OVER);
  }

  get summary(): InningsSummary {
    if (!this.squad) throw new Error("an innings without a squad has no summary");
    return { squad: this.squad, runs: this.runs, wickets: this.wickets, balls: this.balls, won: this.won };
  }

  get sheet(): Scoresheet {
    if (!this.squad) throw new Error("an innings without a squad has no scoresheet");
    return sheetFrom({
      squad: this.squad,
      runs: this.runs,
      wickets: this.wickets,
      balls: this.balls,
      batting: this.battingLines,
      bowling: this.bowlingLines,
      extras: this.extras,
      fallOfWickets: this.fallOfWickets,
    });
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
