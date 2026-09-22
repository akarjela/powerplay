import { franchiseById, franchiseIn } from "../../../data/franchises";
import type { Franchise } from "../../../data/franchises";
import { oversOf } from "../../../sim/innings";
import {
  caps, champion, involvesYou, isOver, nextFixture, playoffs, standings,
} from "../../../sim/tournament";
import type { Fixture, Played, Season } from "../../../sim/tournament";
import { button, el, hudRoot, ordinal, teamTint, trophyMark } from "../dom";
import { squadPanel } from "./squadPanel";

export interface SeasonScreenHandlers {
  onPlay: (fixture: Fixture) => void;
  onSimulate: (fixtures: Fixture[]) => void;
  onSimulateToYou: () => void;
  onTeams: () => void;
  onNewSeason: () => void;
  onScoresheet: (played: Played) => void;
}

export const STAGE_NAME: Record<Fixture["stage"], string> = {
  league: "League", qualifier1: "Qualifier 1", eliminator: "Eliminator", qualifier2: "Qualifier 2", final: "Final",
};

export class SeasonScreen {
  private readonly screen: HTMLElement;
  private readonly body: HTMLElement;
  private readonly handlers: SeasonScreenHandlers;

  constructor(handlers: SeasonScreenHandlers) {
    this.handlers = handlers;
    this.screen = el("div", "screen season");
    this.body = el("div", "season-body");
    this.screen.append(this.body);
    hudRoot().append(this.screen);
    requestAnimationFrame(() => this.screen.classList.add("is-on"));
  }

  render(season: Season): void {
    const you = franchiseById(season.you);
    teamTint(this.screen, you.colours);
    this.screen.classList.add("is-tinted");
    this.body.replaceChildren();

    const head = el("header", "screen-head");
    const mark = el("div", "wordmark");
    mark.append(trophyMark("mark"), el("span", undefined, "Season"));
    head.append(mark);
    head.append(el("div", "who", you.name));
    head.append(button("ghost", "Teams", () => this.handlers.onTeams()));
    this.body.append(head);

    const grid = el("div", "season-grid");
    const left = el("div", "season-col");
    const right = el("div", "season-col");
    left.append(this.table(season), this.capsPanel(season));
    if (season.rosters) left.append(squadPanel(franchiseIn(season, season.you), "Your eleven, from the auction", true));
    right.append(this.fixturePanel(season), this.results(season));
    grid.append(left, right);
    this.body.append(grid);
  }

  private table(season: Season): HTMLElement {
    const panel = el("section", "panel table");
    const rows = standings(season);
    const t = el("div", "standings");
    const head = el("div", "row head");
    for (const [cls, text] of [["pos", "#"], ["team", "Team"], ["n", "P"], ["n", "W"], ["n", "L"], ["n", "T"], ["pts", "Pts"], ["nrr", "NRR"]]) head.append(el("span", cls, text));
    t.append(head);
    rows.forEach((row, i) => {
      const f = franchiseById(row.squad);
      const r = el("div", `row ${row.squad === season.you ? "is-you" : ""} ${i < 4 ? "is-top" : ""}`);
      teamTint(r, f.colours);
      const team = el("span", "team");
      team.append(el("span", "flag"), el("span", "code", f.code), el("span", "name", f.name));
      r.append(
        el("span", "pos", String(i + 1)),
        team,
        el("span", "n", String(row.played)),
        el("span", "n", String(row.won)),
        el("span", "n", String(row.lost)),
        el("span", "n", String(row.tied)),
        el("span", "pts", String(row.points)),
        el("span", `nrr ${row.nrr >= 0 ? "up" : "down"}`, `${row.nrr >= 0 ? "+" : "−"}${Math.abs(row.nrr).toFixed(3)}`),
      );
      t.append(r);
    });
    panel.append(t);
    panel.append(el("p", "note", "Top four go to the playoffs. Two points a win, one a tie; net run rate splits ties."));
    return panel;
  }

  private championPanel(season: Season): HTMLElement {
    const winner = franchiseById(champion(season)!);
    const place = standings(season).findIndex((s) => s.squad === season.you) + 1;
    const panel = el("section", "panel fixture is-over");
    teamTint(panel, winner.colours);
    panel.append(trophyMark("trophy small"));
    panel.append(
      el("span", "label gold", "Champions"),
      el("div", "big", winner.name),
      el("div", "line", winner.id === season.you ? "Your season. Take a bow." : `${franchiseById(season.you).name} finished ${ordinal(place)} in the league.`),
    );
    const row = el("div", "actions");
    row.append(button("primary", "New season", () => this.handlers.onNewSeason()));
    panel.append(row);
    return panel;
  }

  private fixturePanel(season: Season): HTMLElement {
    if (isOver(season)) return this.championPanel(season);

    const panel = el("section", "panel fixture");
    const fixture = nextFixture(season)!;
    const home = franchiseById(fixture.home);
    const away = franchiseById(fixture.away);
    const yours = involvesYou(season, fixture);

    panel.append(el("span", "label", fixture.stage === "league" ? `Round ${fixture.round} of 9` : STAGE_NAME[fixture.stage]));
    panel.append(el("div", "sub", yours ? "Your next match" : "Next match"));
    const bug = (f: Franchise): HTMLElement => {
      const node = el("div", `bug ${f.id === season.you ? "is-you" : ""}`);
      teamTint(node, f.colours);
      node.append(el("span", "code", f.code), el("span", "name", f.name));
      return node;
    };
    const tie = el("div", "tie");
    tie.append(bug(home), el("span", "v", "v"), bug(away));
    panel.append(tie);
    panel.append(el("div", "line", `at ${home.ground}`));

    const row = el("div", "actions");
    if (yours) {
      row.append(
        button("primary", "Play", () => this.handlers.onPlay(fixture)),
        button("ghost", "Simulate instead", () => this.handlers.onSimulate([fixture])),
      );
    } else {
      row.append(
        button("primary", "Simulate", () => this.handlers.onSimulate([fixture])),
        button("ghost", "Sim to my next match", () => this.handlers.onSimulateToYou()),
      );
    }
    panel.append(row);

    if (fixture.stage !== "league") {
      const bracket = el("div", "bracket");
      for (const f of playoffs(season)) {
        bracket.append(el("span", "leg", `${STAGE_NAME[f.stage]}: ${franchiseById(f.home).code} v ${franchiseById(f.away).code}`));
      }
      panel.append(bracket);
    }
    return panel;
  }

  private results(season: Season): HTMLElement {
    const panel = el("section", "panel results");
    panel.append(el("span", "label", "Results"));
    const list = season.results.slice(-6).reverse();
    if (list.length === 0) panel.append(el("p", "note", "Nothing played yet."));
    for (const r of list) {
      const a = franchiseById(r.first.squad);
      const b = franchiseById(r.second.squad);
      const mine = r.first.squad === season.you || r.second.squad === season.you;
      const item = el("div", `result ${mine ? "is-you" : ""}`);
      const line = el("div", "scoreline");
      line.append(
        el("span", "code", a.code), el("span", "score", `${r.first.runs}/${r.first.wickets}`), el("span", "ov", `(${oversOf(r.first.balls)})`),
        el("span", "code", b.code), el("span", "score", `${r.second.runs}/${r.second.wickets}`), el("span", "ov", `(${oversOf(r.second.balls)})`),
      );
      const foot = el("div", "foot");
      foot.append(el("div", "summary", r.summary));
      if (r.sheets) foot.append(button("star", "Scoresheet", () => this.handlers.onScoresheet(r)));
      item.append(line, foot);
      panel.append(item);
    }
    return panel;
  }

  private capsPanel(season: Season): HTMLElement {
    const { orange, purple } = caps(season);
    const panel = el("section", "panel caps");
    const list = (kind: "orange" | "purple", title: string, rows: HTMLElement[]) => {
      const col = el("div", `cap ${kind}`);
      const head = el("div", "cap-head");
      head.append(el("span", "cap-icon"), el("span", "label", title));
      col.append(head);
      if (rows.length === 0) col.append(el("p", "note", "Nobody yet."));
      for (const r of rows) col.append(r);
      return col;
    };
    const row = (i: number, name: string, squad: string, fig: string, sub: string, you: boolean) => {
      const r = el("div", `cap-row ${you ? "is-you" : ""}`);
      const f = franchiseById(squad);
      teamTint(r, f.colours);
      r.append(el("span", "pos", String(i + 1)), el("span", "flag"), el("span", "name", name), el("span", "code", f.code), el("span", "fig", fig), el("span", "sub", sub));
      return r;
    };
    panel.append(
      list("orange", "Orange cap", orange.map((t, i) => row(i, t.name, t.squad, String(t.runs), `${t.innings} inn · sr ${t.balls ? ((t.runs / t.balls) * 100).toFixed(0) : "—"}`, t.squad === season.you))),
      list("purple", "Purple cap", purple.map((t, i) => row(i, t.name, t.squad, String(t.wickets), `${oversOf(t.balls)} ov · econ ${t.balls ? ((t.runs / t.balls) * 6).toFixed(2) : "—"}`, t.squad === season.you))),
    );
    return panel;
  }

  destroy(): void {
    this.screen.remove();
  }
}
