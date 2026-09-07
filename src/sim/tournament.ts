import type { Rng } from "./rng";
import type { Squad } from "./player";
import { simulateMatch, netRunRateInnings, resultOf } from "./match";
import type { InningsResult, InningsSummary } from "./innings";

export type Stage = "league" | "qualifier1" | "eliminator" | "qualifier2" | "final";

export interface Fixture {
  id: string;
  stage: Stage;

  round: number;
  home: string;
  away: string;
}

export interface InningsLine {
  squad: string;
  runs: number;
  wickets: number;
  balls: number;
}

export interface PlayerRuns {
  id: string;
  name: string;
  squad: string;
  runs: number;
  balls: number;
}

export interface PlayerWickets {
  id: string;
  name: string;
  squad: string;
  wickets: number;
  runs: number;
  balls: number;
}

export interface InningsCard {
  batting: PlayerRuns[];
  bowling: PlayerWickets[];
}

export interface Played {
  fixtureId: string;
  first: InningsLine;
  second: InningsLine;
  cards?: { first: InningsCard; second: InningsCard };

  winner: string | null;
  summary: string;
}

export interface Season {
  seed: string;

  squads: string[];

  you: string;
  league: Fixture[];
  results: Played[];

  told?: Fate["kind"];

  rosters?: Record<string, Squad>;
}

export interface Standing {
  squad: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  runsFor: number;
  oversFor: number;
  runsAgainst: number;
  oversAgainst: number;
  nrr: number;
}

export const POINTS = { win: 2, tie: 1, loss: 0 } as const;

export function createSeason(squadIds: string[], you: string, seed: string): Season {
  if (squadIds.length % 2 !== 0) throw new Error("a round robin needs an even number of sides");
  if (!squadIds.includes(you)) throw new Error(`"${you}" is not in the season`);

  const n = squadIds.length;
  const rotating = squadIds.slice(1);
  const league: Fixture[] = [];
  const homeGames = new Map(squadIds.map((id) => [id, 0]));

  for (let round = 0; round < n - 1; round++) {
    const ring = [squadIds[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      const home = homeGames.get(a)! <= homeGames.get(b)! ? a : b;
      const away = home === a ? b : a;
      homeGames.set(home, homeGames.get(home)! + 1);
      league.push({ id: `r${round + 1}-m${i + 1}`, stage: "league", round: round + 1, home, away });
    }
    rotating.unshift(rotating.pop()!);
  }

  return { seed, squads: squadIds.slice(), you, league, results: [] };
}

export function recordResult(season: Season, played: Played): Season {
  if (season.results.some((r) => r.fixtureId === played.fixtureId)) {
    throw new Error(`fixture ${played.fixtureId} already has a result`);
  }
  return { ...season, results: [...season.results, played] };
}

export const resultFor = (season: Season, fixtureId: string) => season.results.find((r) => r.fixtureId === fixtureId);

export function standings(season: Season): Standing[] {
  const rows = new Map<string, Standing>(season.squads.map((squad) => [squad, {
    squad, played: 0, won: 0, lost: 0, tied: 0, points: 0,
    runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0, nrr: 0,
  }]));

  for (const fixture of season.league) {
    const played = resultFor(season, fixture.id);
    if (!played) continue;
    for (const [line, other] of [[played.first, played.second], [played.second, played.first]] as const) {
      const row = rows.get(line.squad)!;
      const forRate = netRunRateInnings(line);
      const againstRate = netRunRateInnings(other);
      row.played++;
      row.runsFor += forRate.runs;
      row.oversFor += forRate.overs;
      row.runsAgainst += againstRate.runs;
      row.oversAgainst += againstRate.overs;
      if (played.winner === null) {
        row.tied++;
        row.points += POINTS.tie;
      } else if (played.winner === line.squad) {
        row.won++;
        row.points += POINTS.win;
      } else {
        row.lost++;
      }
    }
  }

  for (const row of rows.values()) {
    const forRate = row.oversFor > 0 ? row.runsFor / row.oversFor : 0;
    const againstRate = row.oversAgainst > 0 ? row.runsAgainst / row.oversAgainst : 0;
    row.nrr = forRate - againstRate;
  }

  return [...rows.values()].sort((a, b) => b.points - a.points || b.nrr - a.nrr || b.won - a.won || a.squad.localeCompare(b.squad));
}

export const leagueComplete = (season: Season) => season.league.every((f) => resultFor(season, f.id));

export function playoffs(season: Season): Fixture[] {
  if (!leagueComplete(season)) return [];
  const table = standings(season);
  const [first, second, third, fourth] = table.map((s) => s.squad);

  const q1: Fixture = { id: "qualifier1", stage: "qualifier1", round: 0, home: first, away: second };
  const elim: Fixture = { id: "eliminator", stage: "eliminator", round: 0, home: third, away: fourth };
  const fixtures = [q1, elim];

  const q1Result = resultFor(season, q1.id);
  const elimResult = resultFor(season, elim.id);
  if (!q1Result || !elimResult) return fixtures;

  const q1Winner = playoffWinner(season, q1, q1Result);
  const q1Loser = q1Winner === q1.home ? q1.away : q1.home;
  const elimWinner = playoffWinner(season, elim, elimResult);
  const q2: Fixture = { id: "qualifier2", stage: "qualifier2", round: 0, home: q1Loser, away: elimWinner };
  fixtures.push(q2);

  const q2Result = resultFor(season, q2.id);
  if (!q2Result) return fixtures;
  const final: Fixture = { id: "final", stage: "final", round: 0, home: q1Winner, away: playoffWinner(season, q2, q2Result) };
  fixtures.push(final);
  return fixtures;
}

export function playoffWinner(season: Season, fixture: Fixture, played: Played): string {
  if (played.winner) return played.winner;
  const order = standings(season).map((s) => s.squad);
  return order.indexOf(fixture.home) < order.indexOf(fixture.away) ? fixture.home : fixture.away;
}

export const allFixtures = (season: Season): Fixture[] => [...season.league, ...playoffs(season)];

export function nextFixture(season: Season): Fixture | null {
  return allFixtures(season).find((f) => !resultFor(season, f.id)) ?? null;
}

export function fixtureById(season: Season, id: string): Fixture {
  const fixture = allFixtures(season).find((f) => f.id === id);
  if (!fixture) throw new Error(`no fixture "${id}"`);
  return fixture;
}

export function champion(season: Season): string | null {
  const final = playoffs(season).find((f) => f.stage === "final");
  if (!final) return null;
  const played = resultFor(season, final.id);
  return played ? playoffWinner(season, final, played) : null;
}

export const isOver = (season: Season) => champion(season) !== null;

export const involvesYou = (season: Season, fixture: Fixture) =>
  fixture.home === season.you || fixture.away === season.you;

export function simulateFixture(
  fixture: Fixture,
  squadById: (id: string) => Squad,
  rng: Rng,
): Played {
  const match = simulateMatch(squadById(fixture.home), squadById(fixture.away), rng);
  return {
    fixtureId: fixture.id,
    first: lineOf(match.first),
    second: lineOf(match.second),
    cards: { first: cardOf(match.first, match.second.squad.id), second: cardOf(match.second, match.first.squad.id) },
    winner: match.winner?.id ?? null,
    summary: match.summary,
  };
}

export function playedFrom(
  fixture: Fixture,
  first: InningsSummary,
  second: InningsSummary,
  cards?: { first: InningsCard; second: InningsCard },
): Played {
  const result = resultOf(first, second);
  return {
    fixtureId: fixture.id,
    first: lineOf(first),
    second: lineOf(second),
    cards,
    winner: result.winner?.id ?? null,
    summary: result.summary,
  };
}

export function cardOf(innings: InningsResult, bowlingSquad: string): InningsCard {
  return {
    batting: innings.batting.filter((l) => l.balls > 0 || l.runs > 0).map((l) => ({
      id: l.batter.id, name: l.batter.name, squad: innings.squad.id, runs: l.runs, balls: l.balls,
    })),
    bowling: innings.bowling.filter((l) => l.balls > 0).map((l) => ({
      id: l.bowler.id, name: l.bowler.name, squad: bowlingSquad, wickets: l.wickets, runs: l.runs, balls: l.balls,
    })),
  };
}

export interface CapHolders {
  orange: (PlayerRuns & { innings: number })[];
  purple: (PlayerWickets & { innings: number })[];
}

export function caps(season: Season, top = 5): CapHolders {
  const runs = new Map<string, PlayerRuns & { innings: number }>();
  const wickets = new Map<string, PlayerWickets & { innings: number }>();
  for (const played of season.results) {
    if (!played.cards) continue;
    for (const card of [played.cards.first, played.cards.second]) {
      for (const b of card.batting) {
        const t = runs.get(b.id) ?? { ...b, runs: 0, balls: 0, innings: 0 };
        t.runs += b.runs;
        t.balls += b.balls;
        t.innings += 1;
        runs.set(b.id, t);
      }
      for (const w of card.bowling) {
        const t = wickets.get(w.id) ?? { ...w, wickets: 0, runs: 0, balls: 0, innings: 0 };
        t.wickets += w.wickets;
        t.runs += w.runs;
        t.balls += w.balls;
        t.innings += 1;
        wickets.set(w.id, t);
      }
    }
  }
  const orange = [...runs.values()]
    .filter((t) => t.runs > 0)
    .sort((a, b) => b.runs - a.runs || b.runs / Math.max(1, b.balls) - a.runs / Math.max(1, a.balls))
    .slice(0, top);
  const purple = [...wickets.values()]
    .filter((t) => t.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs / Math.max(1, a.balls) - b.runs / Math.max(1, b.balls))
    .slice(0, top);
  return { orange, purple };
}

const lineOf = (innings: InningsSummary): InningsLine => ({
  squad: innings.squad.id, runs: innings.runs, wickets: innings.wickets, balls: innings.balls,
});

export type Fate =
  | { kind: "champion" }
  | { kind: "runner-up" }
  | { kind: "eliminated"; stage: "league" | "eliminator" | "qualifier2"; place: number };

export function fate(season: Season): Fate | null {
  const you = season.you;
  const winner = champion(season);
  if (winner === you) return { kind: "champion" };
  const place = standings(season).findIndex((s) => s.squad === you) + 1;
  const bracket = playoffs(season);
  if (bracket.length === 0) return null;

  const final = bracket.find((f) => f.stage === "final");
  if (final && (final.home === you || final.away === you)) {
    return winner ? { kind: "runner-up" } : null;
  }
  for (const stage of ["eliminator", "qualifier2"] as const) {
    const f = bracket.find((x) => x.stage === stage);
    if (!f || (f.home !== you && f.away !== you)) continue;
    const played = resultFor(season, f.id);
    if (played && playoffWinner(season, f, played) !== you) return { kind: "eliminated", stage, place };
  }
  const inBracket = bracket.some((f) => f.home === you || f.away === you);
  if (!inBracket && place > 4) return { kind: "eliminated", stage: "league", place };
  return null;
}
