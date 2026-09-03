import type { BallEvent, InningsResult } from "../../sim/innings";
import { BALLS_PER_OVER, OVERS, oversOf } from "../../sim/innings";
import { countsAsBall, runsAgainstBowler } from "../../sim/types";
import type { Outcome } from "../../sim/types";
import type { BallMark } from "../humanInnings";
import { el, hex, hudRoot } from "./dom";
import { clearMoment, showMoment } from "./moments";

/**
 * Their innings, watched.
 *
 * The model has already played it -- `simulateInnings` returned a full
 * ball-by-ball log the moment it was asked -- so this is a replay, paced
 * like a broadcast: a ball every few hundred milliseconds, a pause on a
 * wicket or a boundary, a breath at the end of an over, and the same
 * moments over the ground that your own innings gets. It can be run at
 * three times the speed or skipped outright; the result is the same either
 * way, because nothing here decides anything.
 */

export interface InningsViewSides {
  batting: { code: string; name: string; primary: number; secondary: number };
  bowling: { code: string; name: string };
  /** Set when this innings is a chase. */
  target?: number;
}

const BASE_MS = 420;

interface Tally {
  runs: number;
  balls: number;
}

export class InningsView {
  private readonly root: HTMLElement;
  private readonly n: Record<string, HTMLElement> = {};
  private readonly balls: HTMLElement;
  private readonly speedButton: HTMLButtonElement;
  private readonly log: readonly BallEvent[];
  private readonly result: InningsResult;
  private readonly sides: InningsViewSides;
  private readonly onDone: () => void;

  private index = 0;
  private fast = false;
  private timer?: number;
  private done = false;
  private readonly batters = new Map<string, Tally & { out?: string }>();
  private readonly bowlers = new Map<string, Tally & { wickets: number }>();
  private over: BallMark[] = [];
  private overRuns = 0;

  constructor(result: InningsResult, sides: InningsViewSides, onDone: () => void) {
    this.result = result;
    this.log = result.log;
    this.sides = sides;
    this.onDone = onDone;
    this.root = hudRoot();

    const scrim = el("div", "scrim watch");
    scrim.style.pointerEvents = "auto";
    const panel = el("div", "innings");
    panel.style.setProperty("--flag-primary", hex(sides.batting.primary));
    panel.style.setProperty("--flag-secondary", hex(sides.batting.secondary));

    const head = el("div", "head");
    this.n.code = el("span", "code", sides.batting.code);
    this.n.score = el("span", "score", "0/0");
    const overs = el("span", "overs");
    this.n.overs = el("span", "n", "0.0");
    overs.append(this.n.overs, el("span", "label", "overs"));
    this.n.chase = el("span", "chase");
    head.append(this.n.code, this.n.score, overs, this.n.chase);

    const body = el("div", "body");
    const batting = el("div", "col");
    batting.append(el("span", "label", `${sides.batting.name} batting`));
    this.n.striker = el("div", "row on");
    this.n.nonStriker = el("div", "row non");
    batting.append(this.n.striker, this.n.nonStriker);
    const bowling = el("div", "col");
    bowling.append(el("span", "label", `${sides.bowling.name} bowling`));
    this.n.bowler = el("div", "row on");
    this.n.overLabel = el("span", "label", "This over");
    this.balls = el("div", "balls");
    bowling.append(this.n.bowler, this.n.overLabel, this.balls);
    body.append(batting, bowling);

    this.n.call = el("div", "call-line", `${sides.bowling.name} take the field.`);

    const controls = el("div", "controls");
    this.speedButton = el("button", "ghost", "Speed 1×");
    this.speedButton.type = "button";
    this.speedButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.fast = !this.fast;
      this.speedButton.textContent = this.fast ? "Speed 3×" : "Speed 1×";
    });
    const skip = el("button", "primary", "Skip to the end");
    skip.type = "button";
    skip.addEventListener("click", (e) => {
      e.stopPropagation();
      this.finish();
    });
    controls.append(this.speedButton, skip);

    panel.append(head, body, this.n.call, controls);
    scrim.append(panel);
    this.root.append(scrim);
    requestAnimationFrame(() => scrim.classList.add("is-on"));
    this.n.scrim = scrim;

    this.render(undefined);
    this.timer = window.setTimeout(() => this.step(), 900);
  }

  private step(): void {
    if (this.done) return;
    const event = this.log[this.index];
    if (!event) {
      this.timer = window.setTimeout(() => this.finish(), 1400 / (this.fast ? 3 : 1));
      return;
    }
    this.index++;
    this.apply(event);
    this.render(event);

    const o = event.outcome;
    let wait = BASE_MS;
    if (o.wicket) wait = 1500;
    else if (o.runs >= 4) wait = 1100;
    if (countsAsBall(o) && event.ball === BALLS_PER_OVER) wait += 500;
    if (!this.fast) {
      if (o.wicket) showMoment({ kind: "wicket", how: o.description });
      else if (o.runs === 6) showMoment({ kind: "six" });
      else if (o.runs === 4) showMoment({ kind: "four" });
    }
    this.timer = window.setTimeout(() => this.step(), wait / (this.fast ? 3 : 1));
  }

  private apply(event: BallEvent): void {
    const o = event.outcome;
    const legal = countsAsBall(o);
    // A new over: clear the tracker once the next ball arrives.
    if (legal && event.ball === 1 && this.over.length > 0 && this.overIsDone()) {
      this.over = [];
      this.overRuns = 0;
    }
    this.over.push(markFor(o));
    this.overRuns += o.runs + (o.extra === "wide" || o.extra === "no-ball" ? 1 : 0);

    const b = this.tally(this.batters, event.striker.id, { runs: 0, balls: 0 });
    if (legal) b.balls++;
    if (!o.extra) b.runs += o.runs;
    if (o.wicket) b.out = o.description;

    const bowler = this.tally(this.bowlers, event.delivery.bowler.id, { runs: 0, balls: 0, wickets: 0 });
    if (legal) bowler.balls++;
    bowler.runs += runsAgainstBowler(o);
    if (o.wicket && o.wicket !== "run-out") bowler.wickets++;
  }

  private overIsDone(): boolean {
    return this.over.filter((m) => m.kind !== "extra").length >= BALLS_PER_OVER;
  }

  private tally<T>(map: Map<string, T>, id: string, blank: T): T {
    let t = map.get(id);
    if (!t) {
      t = blank;
      map.set(id, t);
    }
    return t;
  }

  private render(event: BallEvent | undefined): void {
    const runs = event?.runs ?? 0;
    const wickets = event?.wickets ?? 0;
    const balls = event ? this.legalBallsThrough(event) : 0;
    this.n.score.textContent = wickets >= 10 ? `${runs}` : `${runs}/${wickets}`;
    this.n.overs.textContent = oversOf(balls);

    if (this.sides.target !== undefined) {
      const need = Math.max(0, this.sides.target - runs);
      const left = OVERS * BALLS_PER_OVER - balls;
      const rrr = left > 0 ? ((need / left) * BALLS_PER_OVER).toFixed(2) : "—";
      this.n.chase.replaceChildren(el("span", "label", `Target ${this.sides.target}`), el("span", "big", `Need ${need} off ${left}`), el("span", "label", `rrr ${rrr}`));
    } else {
      const crr = balls ? ((runs / balls) * BALLS_PER_OVER).toFixed(2) : "0.00";
      this.n.chase.replaceChildren(el("span", "label", "Run rate"), el("span", "big", crr));
    }

    // The two at the crease: the striker of the last ball, and the other man
    // still in, which the log knows only by who has faced and not been out.
    const striker = event?.striker;
    const strikerTally = striker ? this.batters.get(striker.id) : undefined;
    const others = [...this.batters.entries()].filter(([id, t]) => id !== striker?.id && !t.out);
    const other = others[others.length - 1];
    const line = (node: HTMLElement, name: string | undefined, t: Tally | undefined, out?: string) => {
      node.replaceChildren();
      if (!name) return;
      node.append(el("span", "name", name), el("span", "r", `${t?.runs ?? 0}${out ? "" : "*"}`), el("span", "b", `(${t?.balls ?? 0})`));
      if (out) node.append(el("span", "how", out));
    };
    line(this.n.striker, striker?.name, strikerTally, strikerTally?.out);
    line(this.n.nonStriker, other ? this.result.batting.find((l) => l.batter.id === other[0])?.batter.name : undefined, other?.[1]);

    const bowler = event?.delivery.bowler;
    const bt = bowler ? this.bowlers.get(bowler.id) : undefined;
    this.n.bowler.replaceChildren();
    if (bowler && bt) {
      this.n.bowler.append(
        el("span", "name", bowler.name),
        el("span", "r", `${oversOf(bt.balls)}-${bt.runs}-${bt.wickets}`),
        el("span", "b", `${Math.round(event!.delivery.speed)} kph`),
      );
    }

    this.n.overLabel.textContent = event ? `Over ${event.over + 1}  ·  ${this.overRuns}` : "This over";
    const slots = Math.max(BALLS_PER_OVER, this.over.length);
    this.balls.replaceChildren(...Array.from({ length: slots }, (_, i) => {
      const mark = this.over[i];
      if (!mark) return el("span", "ball empty");
      const kind = mark.kind === "boundary" && mark.label === "6" ? "six" : mark.kind;
      return el("span", `ball ${kind}`, mark.label);
    }));

    if (event) this.n.call.textContent = event.outcome.description;
  }

  private legalBallsThrough(event: BallEvent): number {
    // The log's ball is the legal count within the over; a wide repeats it.
    return event.over * BALLS_PER_OVER + event.ball;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    window.clearTimeout(this.timer);
    clearMoment();
    this.n.scrim.remove();
    this.onDone();
  }

  destroy(): void {
    this.done = true;
    window.clearTimeout(this.timer);
    this.n.scrim?.remove();
  }
}

function markFor(outcome: Outcome): BallMark {
  if (outcome.wicket) return { label: "W", kind: "wicket" };
  if (outcome.extra === "wide" || outcome.extra === "no-ball") return { label: outcome.extra === "wide" ? "wd" : "nb", kind: "extra" };
  if (outcome.runs === 0) return { label: "•", kind: "dot" };
  if (outcome.runs >= 4) return { label: String(outcome.runs), kind: "boundary" };
  return { label: String(outcome.runs), kind: "runs" };
}
