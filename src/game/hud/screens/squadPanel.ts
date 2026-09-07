import type { Franchise } from "../../../data/franchises";
import type { Batter, Bowler } from "../../../sim/player";
import { el, teamTint } from "../dom";

export function band(v: number): string {
  if (v >= 75) return "elite";
  if (v >= 55) return "good";
  if (v >= 40) return "fair";
  return "weak";
}

export function bowlerRole(pace: number): string {
  if (pace < 35) return "spin";
  if (pace > 70) return "fast";
  return "seam";
}

export function ratingCell(v: number | undefined): HTMLElement {
  const cell = el("span", "col");
  if (v !== undefined) {
    const bar = el("span", `bar ${band(v)}`);
    bar.style.setProperty("--v", `${v}%`);
    bar.title = String(v);
    cell.append(bar);
  }
  return cell;
}

export function squadPanel(f: Franchise, title: string, batting: boolean): HTMLElement {
  const panel = el("section", "panel squad");
  teamTint(panel, f.colours);
  const head = el("div", "panel-head");
  head.append(el("span", "label", title), el("span", "who", f.name));
  panel.append(head);

  const labels = batting ? ["Pow", "Tec", "Agg"] : ["Pace", "Acc", "Mov", "Var"];
  const table = el("div", `ratings cols-${labels.length}`);
  const header = el("div", "row head");
  header.append(el("span", "name"), el("span", "role"));
  for (const l of labels) header.append(el("span", "col", l));
  table.append(header);

  const rows: { name: string; values: number[]; role: string }[] = batting
    ? f.squad.batters.map((b: Batter, i) => ({
      name: `${i + 1}. ${b.name}`, values: [b.power, b.technique, b.aggression],
      role: f.squad.bowlers.some((w) => w.id === b.id) ? "all-rounder" : "",
    }))
    : [
      ...f.squad.bowlers.map((w: Bowler) => ({
        name: w.name, values: [w.pace, w.accuracy, w.movement, w.variation],
        role: bowlerRole(w.pace),
      })),
      ...f.squad.batters.filter((b) => !f.squad.bowlers.some((w) => w.id === b.id)).map((b) => ({
        name: b.name, values: [], role: "bat",
      })),
    ];

  for (const r of rows) {
    const row = el("div", "row");
    row.append(el("span", "name", r.name), el("span", "role", r.role));
    for (let i = 0; i < labels.length; i++) row.append(ratingCell(r.values[i]));
    table.append(row);
  }
  panel.append(table);
  return panel;
}
