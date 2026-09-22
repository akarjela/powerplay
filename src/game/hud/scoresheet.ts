import { BALLS_PER_OVER, WICKETS, oversOf } from "../../sim/innings";
import { howOut, totalExtras } from "../../sim/scorecard";
import type { Scoresheet, SheetBatting, SheetBowling } from "../../sim/scorecard";
import type { Franchise } from "../../data/franchises";
import { button, el, fmt2, hex, hudRoot, ordinal, surname } from "./dom";

export interface ScoresheetSide {
  id: string;
  code: string;
  name: string;
  primary: number;
  secondary: number;
}

export function scoresheetSide(f: Franchise): ScoresheetSide {
  return { id: f.id, code: f.code, name: f.name, primary: f.colours.primary, secondary: f.colours.secondary };
}

export interface ScoresheetInnings {
  sheet: Scoresheet;
  batting: ScoresheetSide;
  bowling: ScoresheetSide;
  target?: number;
}

export interface ScoresheetSpec {
  title: string;
  result: string;
  innings: ScoresheetInnings[];
  you?: string;
  tone?: "won" | "lost" | "neutral";
  actions: { label: string; primary?: boolean; onPick: () => void }[];
}

let current: HTMLElement | undefined;

const rate = (runs: number, balls: number) => (balls === 0 ? 0 : (runs / balls) * BALLS_PER_OVER);
const strikeRate = (b: Pick<SheetBatting, "runs" | "balls">) => (b.balls === 0 ? 0 : (b.runs / b.balls) * 100);
const economy = (w: Pick<SheetBowling, "runs" | "balls">) => rate(w.runs, w.balls);
const score = (s: Scoresheet) => (s.wickets >= WICKETS ? `${s.runs}` : `${s.runs}/${s.wickets}`);

export function showScoresheet(spec: ScoresheetSpec): void {
  hideScoresheet();
  const scrim = el("div", "scrim sheet");
  scrim.style.pointerEvents = "auto";
  scrim.addEventListener("click", (e) => e.stopPropagation());
  const panel = el("div", `scoresheet ${spec.tone ?? ""}`);
  const lead = spec.innings[0]?.batting;
  if (lead) {
    panel.style.setProperty("--flag-primary", hex(lead.primary));
    panel.style.setProperty("--flag-secondary", hex(lead.secondary));
  }

  const head = el("div", "head");
  const titles = el("div", "titles");
  titles.append(el("div", "eyebrow", "Scoresheet"), el("div", "title", spec.title), el("div", "result", spec.result));
  head.append(titles);
  const lines = el("div", "scorelines");
  for (const inn of spec.innings) {
    const line = el("div", `scoreline ${inn.batting.id === spec.you ? "is-you" : ""}`);
    line.style.setProperty("--flag-primary", hex(inn.batting.primary));
    line.append(
      el("span", "flag"),
      el("span", "code", inn.batting.code),
      el("span", "score", score(inn.sheet)),
      el("span", "ov", `${oversOf(inn.sheet.balls)} ov`),
    );
    lines.append(line);
  }
  head.append(lines);
  panel.append(head);

  const sheets = el("div", "sheets");
  spec.innings.forEach((inn, i) => sheets.append(inningsBlock(inn, i + 1, spec.you)));
  panel.append(sheets);

  const actions = el("div", "actions");
  for (const action of spec.actions) {
    actions.append(button(action.primary ? "primary" : "ghost", action.label, (e) => {
      e.stopPropagation();
      hideScoresheet();
      action.onPick();
    }));
  }
  panel.append(actions);

  scrim.append(panel);
  hudRoot().appendChild(scrim);
  current = scrim;
  requestAnimationFrame(() => scrim.classList.add("is-on"));
}

export function hideScoresheet(): void {
  current?.remove();
  current = undefined;
}

function inningsBlock(inn: ScoresheetInnings, number: number, you?: string): HTMLElement {
  const { sheet, batting, bowling } = inn;
  const block = el("section", `inn ${batting.id === you ? "is-you" : ""}`);
  block.style.setProperty("--flag-primary", hex(batting.primary));
  block.style.setProperty("--flag-secondary", hex(batting.secondary));

  const head = el("div", "inn-head");
  const who = el("div", "who");
  who.append(el("span", "code", batting.code), el("span", "name", `${batting.name} batting`));
  const label = `${ordinal(number)} innings${inn.target !== undefined ? ` · target ${inn.target}` : ""}`;
  who.append(el("span", "label", label));
  const total = el("div", "total");
  total.append(el("span", "score", score(sheet)), el("span", "ov", `${oversOf(sheet.balls)} ov`));
  head.append(who, total);
  block.append(head);

  const bat = el("div", "grid bat");
  bat.append(row("head", ["Batter", "", "R", "B", "4s", "6s", "SR"]));
  const top = Math.max(0, ...sheet.batting.map((b) => b.runs));
  for (const b of sheet.batting) {
    const r = row(`${b.dismissal ? "out" : "in"} ${b.runs === top && top > 0 ? "is-top" : ""}`, [
      b.name, howOut(b), String(b.runs), String(b.balls), String(b.fours), String(b.sixes), strikeRate(b).toFixed(1),
    ]);
    if (!b.dismissal) r.children[1].classList.add("not-out");
    bat.append(r);
  }
  const extras = sheet.extras;
  const parts = [
    ["wd", extras.wides], ["nb", extras.noBalls], ["b", extras.byes], ["lb", extras.legByes],
  ].filter(([, n]) => (n as number) > 0).map(([k, n]) => `${k} ${n}`).join(", ");
  const extrasRow = row("extras", ["Extras", parts || "none", String(totalExtras(extras)), "", "", "", ""]);
  bat.append(extrasRow);
  const closed = sheet.wickets >= WICKETS ? "all out" : `${sheet.wickets} wkt${sheet.wickets === 1 ? "" : "s"}`;
  bat.append(row("total", ["Total", `${closed}, ${oversOf(sheet.balls)} ov, rr ${fmt2(rate(sheet.runs, sheet.balls))}`, String(sheet.runs), "", "", "", ""]));
  block.append(bat);

  if (sheet.didNotBat.length > 0) {
    const dnb = el("div", "dnb");
    dnb.append(el("span", "label", "Did not bat"), el("span", "names", sheet.didNotBat.map((b) => b.name).join(", ")));
    block.append(dnb);
  }

  if (sheet.fallOfWickets.length > 0) {
    const fow = el("div", "fow");
    fow.append(el("span", "label", "Fall of wickets"));
    const list = el("div", "falls");
    for (const f of sheet.fallOfWickets) {
      const item = el("span", "fall");
      item.append(el("b", undefined, `${f.wicket}-${f.runs}`), el("span", undefined, ` ${surname(f.name)}, ${oversOf(f.balls)}`));
      list.append(item);
    }
    fow.append(list);
    block.append(fow);
  }

  const bowl = el("div", "grid bowl");
  bowl.append(el("div", "grid-label", `${bowling.name} bowling`));
  bowl.append(row("head", ["Bowler", "O", "M", "R", "W", "Econ"]));
  const best = sheet.bowling.slice().sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
  for (const w of sheet.bowling) {
    bowl.append(row(w === best && w.wickets > 0 ? "is-top" : "", [
      w.name, oversOf(w.balls), String(w.maidens), String(w.runs), String(w.wickets), fmt2(economy(w)),
    ]));
  }
  block.append(bowl);

  return block;
}

function row(className: string, cells: string[]): HTMLElement {
  const r = el("div", `row ${className}`);
  cells.forEach((text, i) => r.append(el("span", cellClass(i, cells.length), text)));
  return r;
}

function cellClass(index: number, count: number): string {
  if (index === 0) return "name";
  if (index === 1 && count === 7) return "how";
  return "n";
}
