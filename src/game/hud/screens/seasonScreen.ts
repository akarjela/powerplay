import { franchiseById } from "../../../data/franchises";
import { oversOf } from "../../../sim/innings";
import {
  champion, involvesYou, isOver, nextFixture, playoffs, standings,
} from "../../../sim/tournament";
import type { Fixture, Season } from "../../../sim/tournament";
import { el, hex, hudRoot } from "../dom";

/**
 * The season, between matches: the table, the fixture in hand, the results.
 * A fixture of yours is played with a bat or simulated instead; anyone
 * else's is resolved by the model on the spot. DOM, on the design system.
 */

export interface SeasonScreenHandlers {
  onPlay: (fixture: Fixture) => void;
  onSimulate: (fixtures: Fixture[]) => void;
  onSimulateToYou: () => void;
  onTeams: () => void;
  onNewSeason: () => void;
}

const STAGE_NAME: Record<Fixture["stage"], string> = {
  league: "League", qualifier1: "Qualifier 1", eliminator: "Eliminator", qualifier2: "Qualifier 2", final: "Final",
};
const ORDINAL = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

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
    this.screen.style.setProperty("--flag-primary", hex(you.colours.primary));
    this.screen.style.setProperty("--flag-secondary", hex(you.colours.secondary));
    this.body.replaceChildren();

    const head = el("header", "screen-head");
    head.append(el("div", "wordmark", "Season"));
    head.append(el("div", "who", you.name));
    const teams = el("button", "ghost", "Teams");
    teams.type = "button";
    teams.addEventListener("click", () => this.handlers.onTeams());
    head.append(teams);
    this.body.append(head);

    const grid = el("div", "season-grid");
    grid.append(this.table(season), this.fixturePanel(season), this.results(season));
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
      r.style.setProperty("--flag-primary", hex(f.colours.primary));
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

  private fixturePanel(season: Season): HTMLElement {
    const panel = el("section", "panel fixture");

    if (isOver(season)) {
      const winner = franchiseById(champion(season)!);
      panel.classList.add("is-over");
      panel.style.setProperty("--flag-primary", hex(winner.colours.primary));
      panel.style.setProperty("--flag-secondary", hex(winner.colours.secondary));
      panel.append(el("span", "label gold", "Champions"));
      panel.append(el("div", "big", winner.name));
      const place = standings(season).findIndex((s) => s.squad === season.you) + 1;
      panel.append(el("div", "line", winner.id === season.you ? "Your season. Take a bow." : `${franchiseById(season.you).name} finished ${ORDINAL(place)} in the league.`));
      const row = el("div", "actions");
      const fresh = el("button", "primary", "New season");
      fresh.type = "button";
      fresh.addEventListener("click", () => this.handlers.onNewSeason());
      row.append(fresh);
      panel.append(row);
      return panel;
    }

    const fixture = nextFixture(season)!;
    const home = franchiseById(fixture.home);
    const away = franchiseById(fixture.away);
    const yours = involvesYou(season, fixture);

    panel.append(el("span", "label", fixture.stage === "league" ? `Round ${fixture.round} of 9` : STAGE_NAME[fixture.stage]));
    panel.append(el("div", "sub", yours ? "Your next match" : "Next match"));
    const tie = el("div", "tie");
    for (const [f, side] of [[home, "home"], [away, "away"]] as const) {
      const bug = el("div", `bug ${f.id === season.you ? "is-you" : ""}`);
      bug.style.setProperty("--flag-primary", hex(f.colours.primary));
      bug.style.setProperty("--flag-secondary", hex(f.colours.secondary));
      bug.append(el("span", "flag"), el("span", "code", f.code), el("span", "name", f.name));
      if (side === "home") tie.append(bug, el("span", "v", "v"));
      else tie.append(bug);
    }
    panel.append(tie);
    panel.append(el("div", "line", `at ${home.ground}`));

    const row = el("div", "actions");
    if (yours) {
      const play = el("button", "primary", "Play");
      play.type = "button";
      play.addEventListener("click", () => this.handlers.onPlay(fixture));
      const sim = el("button", "ghost", "Simulate instead");
      sim.type = "button";
      sim.addEventListener("click", () => this.handlers.onSimulate([fixture]));
      row.append(play, sim);
    } else {
      const sim = el("button", "primary", "Simulate");
      sim.type = "button";
      sim.addEventListener("click", () => this.handlers.onSimulate([fixture]));
      const toYou = el("button", "ghost", "Sim to my next match");
      toYou.type = "button";
      toYou.addEventListener("click", () => this.handlers.onSimulateToYou());
      row.append(sim, toYou);
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
      item.append(line, el("div", "summary", r.summary));
      panel.append(item);
    }
    return panel;
  }

  destroy(): void {
    this.screen.remove();
  }
}
