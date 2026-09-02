import { BALLS_PER_OVER, OVERS, WICKETS } from "../sim/innings";
import { countsAsBall } from "../sim/types";
import type { Outcome } from "../sim/types";

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
 */

export type BallMark = { label: string; kind: "dot" | "runs" | "boundary" | "wicket" | "extra" };

export class HumanInnings {
  runs = 0;
  wickets = 0;
  /** Legal balls bowled. */
  balls = 0;

  /** The current over so far, for the broadcast strip. Cleared as each over starts. */
  private over: BallMark[] = [];

  record(outcome: Outcome): void {
    if (this.complete) return;

    // A completed over is cleared when the *next* ball arrives rather than as
    // it finishes, so the strip still shows the over you just watched.
    if (this.balls > 0 && this.balls % BALLS_PER_OVER === 0 && this.over.length >= BALLS_PER_OVER) {
      this.over = [];
    }

    this.runs += outcome.runs + (outcome.extra === "wide" || outcome.extra === "no-ball" ? 1 : 0);
    if (outcome.wicket) this.wickets++;
    if (countsAsBall(outcome)) this.balls++;

    this.over.push(markFor(outcome));
  }

  get complete(): boolean {
    return this.wickets >= WICKETS || this.balls >= OVERS * BALLS_PER_OVER;
  }

  /** Why it ended, for the closing card. Empty while the innings is live. */
  get closedBecause(): string {
    if (this.wickets >= WICKETS) return "All out";
    if (this.balls >= OVERS * BALLS_PER_OVER) return "Innings complete";
    return "";
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
}

function markFor(outcome: Outcome): BallMark {
  if (outcome.wicket) return { label: "W", kind: "wicket" };
  if (outcome.extra) return { label: outcome.extra === "wide" ? "wd" : "nb", kind: "extra" };
  if (outcome.runs === 0) return { label: "•", kind: "dot" };
  if (outcome.runs >= 4) return { label: String(outcome.runs), kind: "boundary" };
  return { label: String(outcome.runs), kind: "runs" };
}
