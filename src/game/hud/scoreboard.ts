import type { BallMark } from "../humanInnings";
import type { Stance } from "../config";
import { ballChip, el, hex, hudRoot } from "./dom";

export interface ScoreboardModel {
  team: { code: string; primary: number; secondary: number };
  opponent: string;
  runs: number;
  wickets: number;
  allOut: boolean;
  overs: string;
  runRate: number;
  phase: string;

  target?: number;
  need?: { runs: number; balls: number };
  requiredRate?: number;

  projected?: number;

  par?: number;
  batters: { name: string; runs: number; balls: number; strikeRate: number; onStrike: boolean }[];
  over: { number: number; balls: readonly BallMark[]; runs: number };
  bowler?: { name: string; overs: string; maidens: number; runs: number; wickets: number; economy: number; speedKph?: number };
  action: { label: string; enabled: boolean; waiting: boolean };
  stance: Stance;
}

const STANCE_TEXT: Record<Stance, string> = { front: "Front foot", back: "Back foot", neutral: "No stance" };
const BALLS_SHOWN = 6;

const fmt2 = (n: number) => n.toFixed(2);
const surname = (name: string) => name.split(" ").pop() ?? name;

export class Scoreboard {
  private readonly root: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly call: HTMLElement;
  private callTimer?: number;
  private lastBallCount = 0;

  private readonly n: Record<string, HTMLElement> = {};
  private readonly rates: HTMLElement;
  private readonly axis: HTMLElement;
  private readonly balls: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly foot: HTMLElement;
  private readonly rowOn: HTMLElement;
  private readonly rowNon: HTMLElement;

  constructor(onAction: () => void) {
    this.root = hudRoot();
    const strip = el("div", "strip");
    this.strip = strip;

    strip.appendChild(el("div", "cell flag"));

    const score = el("div", "cell score");
    this.n.code = el("span", "code");
    this.n.runs = el("span", "runs");
    const overs = el("span", "overs");
    this.n.overs = el("span", "n");
    overs.append(this.n.overs, el("span", "label", "overs"));
    score.append(this.n.code, this.n.runs, overs);
    strip.appendChild(score);

    const chase = el("div", "cell chase");
    this.n.chaseLabel = el("span", "label");
    this.n.chaseBig = el("span", "big");
    this.n.chaseSub = el("span", "dim");
    chase.append(this.n.chaseLabel, this.n.chaseBig, this.n.chaseSub);
    strip.appendChild(chase);

    this.rates = el("div", "cell rates");
    this.n.ratesLabel = el("span", "label", "Run rate");
    this.axis = el("div", "axis");
    this.axis.append(el("div", "crr"), el("div", "gap"), el("div", "rrr"));
    const row = el("div", "row");
    const crr = el("span");
    this.n.crr = el("span", "fig");
    crr.append(this.n.crr, el("span", "label", " crr"));
    this.n.diff = el("span", "diff");
    const rrr = el("span");
    this.n.rrr = el("span", "fig");
    this.n.rrrLabel = el("span", "label", " rrr");
    rrr.append(this.n.rrr, this.n.rrrLabel);
    row.append(crr, this.n.diff, rrr);
    this.rates.append(this.n.ratesLabel, this.axis, row);
    strip.appendChild(this.rates);

    const batters = el("div", "cell batters");
    this.rowOn = this.batterRow("on");
    this.rowNon = this.batterRow("non");
    batters.append(this.rowOn, this.rowNon);
    strip.appendChild(batters);

    const over = el("div", "cell over");
    const head = el("div", "head");
    this.n.overLabel = el("span", "label", "This over");
    this.n.overRuns = el("span", "fig");
    head.append(this.n.overLabel, this.n.overRuns);
    this.balls = el("div", "balls");
    over.append(head, this.balls);
    strip.appendChild(over);

    const bowler = el("div", "cell bowler");
    this.n.bowlerName = el("span", "name");
    this.n.bowlerFigs = el("span", "figs");
    const sub = el("div", "sub");
    this.n.econ = el("span", "label econ");
    this.n.speed = el("span", "label");
    sub.append(this.n.econ, this.n.speed);
    bowler.append(this.n.bowlerName, this.n.bowlerFigs, sub);
    strip.appendChild(bowler);

    const action = el("div", "cell action");
    this.button = el("button");
    this.button.type = "button";
    this.button.addEventListener("click", (e) => {
      e.stopPropagation();
      onAction();
    });
    const stance = el("div", "stance");
    this.foot = el("span", "foot");
    stance.append(this.foot, el("span", "keys", "← back  → front"));
    action.append(this.button, stance);
    strip.appendChild(action);

    this.call = el("div", "call");

    this.root.append(strip, this.call);
    requestAnimationFrame(() => strip.classList.add("is-on"));
  }

  private batterRow(kind: "on" | "non"): HTMLElement {
    const row = el("div", `row ${kind}`);
    row.append(el("span", "mark"), el("span", "name"), el("span", "r"), el("span", "b"), el("span", "sr"));
    return row;
  }

  render(m: ScoreboardModel): void {
    const s = this.strip.style;
    s.setProperty("--flag-primary", hex(m.team.primary));
    s.setProperty("--flag-secondary", hex(m.team.secondary));

    this.n.code.textContent = m.team.code;
    this.n.runs.textContent = m.allOut ? `${m.runs}` : `${m.runs}/${m.wickets}`;
    this.n.overs.textContent = m.overs;

    if (m.need && m.target !== undefined) {
      this.n.chaseLabel.textContent = `Target ${m.target}`;
      this.n.chaseBig.replaceChildren("Need ", strong(String(m.need.runs)), " off ", strong(String(m.need.balls)));
      this.n.chaseSub.textContent = m.need.balls === 1 ? "last ball" : `v ${m.opponent}`;
    } else {
      this.n.chaseLabel.textContent = `v ${m.opponent}`;
      this.n.chaseBig.replaceChildren("On for ", strong(String(m.projected ?? 0)));
      this.n.chaseSub.textContent = m.phase;
    }

    const rrr = m.requiredRate ?? m.par;
    const isPar = m.requiredRate === undefined && m.par !== undefined;
    const ceiling = Math.max(12, m.runRate + 1, (rrr ?? 0) + 2);
    const pct = (v: number) => `${Math.min(100, (v / ceiling) * 100).toFixed(1)}%`;
    const a = this.axis.style;
    a.setProperty("--crr", pct(m.runRate));
    this.n.crr.textContent = fmt2(m.runRate);
    this.rates.classList.remove("is-ahead", "is-behind", "is-pressure");
    this.axis.classList.toggle("par", isPar);
    if (rrr !== undefined) {
      const lo = Math.min(m.runRate, rrr);
      const hi = Math.max(m.runRate, rrr);
      const ahead = m.runRate >= rrr;
      a.setProperty("--rrr", pct(rrr));
      a.setProperty("--gap-left", pct(lo));
      a.setProperty("--gap-width", `${Math.min(100, ((hi - lo) / ceiling) * 100).toFixed(1)}%`);
      a.setProperty("--gap-colour", ahead ? "var(--ahead)" : "var(--behind)");
      this.n.rrr.textContent = fmt2(rrr);
      this.n.rrrLabel.textContent = isPar ? " par" : " rrr";
      const diff = m.runRate - rrr;
      this.n.diff.textContent = `${diff >= 0 ? "+" : "−"}${fmt2(Math.abs(diff))}`;
      this.rates.classList.add(ahead ? "is-ahead" : "is-behind");
      const pressure = !isPar && rrr > 12;
      this.rates.classList.toggle("is-pressure", pressure);
      this.n.ratesLabel.textContent = pressure ? "Pressure" : isPar ? "Against par" : "Run rate";
    } else {
      this.n.diff.textContent = "";
      this.n.rrr.textContent = "";
      this.n.rrrLabel.textContent = "";
      this.n.ratesLabel.textContent = "Run rate";
    }

    fillBatter(this.rowOn, m.batters.find((b) => b.onStrike));
    fillBatter(this.rowNon, m.batters.find((b) => !b.onStrike));

    this.n.overLabel.textContent = `Over ${m.over.number}`;
    this.n.overRuns.textContent = String(m.over.runs);
    const marks = m.over.balls;
    const slots = Math.max(BALLS_SHOWN, marks.length);
    this.balls.replaceChildren(...Array.from({ length: slots }, (_, i) => {
      const mark = marks[i];
      if (!mark) return el("span", "ball empty");
      const node = ballChip(mark);
      if (i === marks.length - 1 && marks.length !== this.lastBallCount) node.classList.add("new");
      return node;
    }));
    this.lastBallCount = marks.length;

    if (m.bowler) {
      const b = m.bowler;
      this.n.bowlerName.textContent = b.name;
      this.n.bowlerFigs.textContent = `${b.overs}-${b.maidens}-${b.runs}-${b.wickets}`;
      this.n.econ.textContent = `econ ${fmt2(b.economy)}`;
      this.n.speed.textContent = b.speedKph ? `${Math.round(b.speedKph)} kph` : "";
    } else {
      this.n.bowlerName.textContent = "";
      this.n.bowlerFigs.textContent = "—";
      this.n.econ.textContent = "";
      this.n.speed.textContent = "";
    }

    this.button.textContent = m.action.label;
    this.button.disabled = !m.action.enabled;
    this.button.classList.toggle("is-waiting", m.action.waiting && m.action.enabled);
    this.foot.textContent = STANCE_TEXT[m.stance];
    this.foot.className = `foot ${m.stance}`;
  }

  setVisible(visible: boolean): void {
    this.strip.classList.toggle("is-on", visible);
    if (!visible) this.call.classList.remove("is-on");
  }

  say(text: string, kind: "" | "four" | "six" | "wicket" = "", ms = 1600): void {
    window.clearTimeout(this.callTimer);
    this.call.textContent = text;
    this.call.className = `call is-on ${kind}`;
    this.callTimer = window.setTimeout(() => this.call.classList.remove("is-on"), ms);
  }

  destroy(): void {
    window.clearTimeout(this.callTimer);
    this.strip.remove();
    this.call.remove();
  }
}

function strong(text: string): HTMLElement {
  return el("b", undefined, text);
}

function fillBatter(row: HTMLElement, b?: ScoreboardModel["batters"][number]): void {
  const [, name, r, balls, sr] = Array.from(row.children) as HTMLElement[];
  if (!b) {
    name.textContent = "";
    r.textContent = "";
    balls.textContent = "";
    sr.textContent = "";
    return;
  }
  name.textContent = surname(b.name);
  r.textContent = `${b.runs}${b.onStrike ? "*" : ""}`;
  balls.textContent = `(${b.balls})`;
  sr.textContent = `sr ${b.strikeRate.toFixed(0)}`;
}
