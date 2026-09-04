import { describe, expect, it } from "vitest";

import {
  champion, createSeason, fate, involvesYou, isOver, leagueComplete, nextFixture, playedFrom, playoffWinner, playoffs, recordResult, resultFor, simulateFixture, standings,
} from "../src/sim/tournament";
import type { Played, Season } from "../src/sim/tournament";
import { LEAGUE, franchiseById } from "../src/data/franchises";
import { makeRng } from "../src/sim/rng";
import { OVERS, BALLS_PER_OVER, WICKETS } from "../src/sim/innings";

const IDS = LEAGUE.map((s) => s.id);
const squadById = (id: string) => franchiseById(id).squad;

const fresh = () => createSeason(IDS, "mum", "season-test");

function playOut(season: Season, seed = "playout"): Season {
  const rng = makeRng(seed);
  let s = season;
  for (let guard = 0; guard < 60; guard++) {
    const fixture = nextFixture(s);
    if (!fixture) break;
    s = recordResult(s, simulateFixture(fixture, squadById, rng));
  }
  return s;
}

const line = (squad: string, runs: number, wickets = 5, balls = OVERS * BALLS_PER_OVER) => ({ squad, runs, wickets, balls });

describe("the fixture list", () => {
  const season = fresh();

  it("is a single round robin: 45 matches, nine each", () => {
    expect(season.league).toHaveLength(45);
    for (const id of IDS) {
      const games = season.league.filter((f) => f.home === id || f.away === id);
      expect(games).toHaveLength(9);
      const opponents = new Set(games.map((f) => (f.home === id ? f.away : f.home)));
      expect(opponents.size).toBe(9);
    }
  });

  it("puts every side on the park once a round", () => {
    for (let round = 1; round <= 9; round++) {
      const games = season.league.filter((f) => f.round === round);
      expect(games).toHaveLength(5);
      const sides = games.flatMap((f) => [f.home, f.away]);
      expect(new Set(sides).size).toBe(10);
    }
  });

  it("gives everyone some home games", () => {
    for (const id of IDS) {
      expect(season.league.filter((f) => f.home === id).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("refuses an odd league and an outsider", () => {
    expect(() => createSeason(IDS.slice(0, 9), "mum", "x")).toThrow(/even/);
    expect(() => createSeason(IDS, "csk", "x")).toThrow(/not in the season/);
  });

  it("knows which fixtures are yours", () => {
    const mine = season.league.filter((f) => involvesYou(season, f));
    expect(mine).toHaveLength(9);
    expect(nextFixture(season)?.round).toBe(1);
  });
});

describe("the table", () => {
  it("awards two for a win, one each for a tie, and sorts by points then net run rate", () => {
    let season = fresh();
    const [m1, m2] = season.league.filter((f) => f.round === 1);

    season = recordResult(season, {
      fixtureId: m1.id, first: line(m1.home, 180), second: line(m1.away, 140), winner: m1.home, summary: "",
    });

    season = recordResult(season, {
      fixtureId: m2.id, first: line(m2.home, 150), second: line(m2.away, 150), winner: null, summary: "",
    });

    const table = standings(season);
    const row = (id: string) => table.find((r) => r.squad === id)!;
    expect(row(m1.home).points).toBe(2);
    expect(row(m1.away).points).toBe(0);
    expect(row(m2.home).points).toBe(1);
    expect(row(m2.away).points).toBe(1);
    expect(row(m1.home).nrr).toBeCloseTo(2);
    expect(row(m1.away).nrr).toBeCloseTo(-2);
    expect(table[0].squad).toBe(m1.home);
    expect(table[table.length - 1].squad).toBe(m1.away);
  });

  it("charges a side bowled out the full twenty overs", () => {
    let season = fresh();
    const m = season.league[0];

    season = recordResult(season, {
      fixtureId: m.id, first: line(m.home, 160), second: line(m.away, 80, WICKETS, 60), winner: m.home, summary: "",
    });
    const away = standings(season).find((r) => r.squad === m.away)!;
    expect(away.nrr).toBeCloseTo(80 / 20 - 160 / 20);
  });

  it("refuses to record the same fixture twice", () => {
    let season = fresh();
    const m = season.league[0];
    const played: Played = { fixtureId: m.id, first: line(m.home, 1), second: line(m.away, 2), winner: m.away, summary: "" };
    season = recordResult(season, played);
    expect(() => recordResult(season, played)).toThrow(/already/);
  });
});

describe("the playoffs", () => {
  it("do not exist until the league is done, then seed 1v2 and 3v4", () => {
    let season = fresh();
    expect(playoffs(season)).toHaveLength(0);
    const rng = makeRng("league-only");
    for (const f of season.league) season = recordResult(season, simulateFixture(f, squadById, rng));
    expect(leagueComplete(season)).toBe(true);

    const table = standings(season).map((s) => s.squad);
    const [q1, elim] = playoffs(season);
    expect(q1.stage).toBe("qualifier1");
    expect([q1.home, q1.away]).toEqual([table[0], table[1]]);
    expect(elim.stage).toBe("eliminator");
    expect([elim.home, elim.away]).toEqual([table[2], table[3]]);
    expect(nextFixture(season)?.id).toBe("qualifier1");
  });

  it("run the bracket to a champion: Q1 winner meets the Q2 winner", () => {
    const season = playOut(fresh());
    expect(isOver(season)).toBe(true);
    const final = playoffs(season).find((f) => f.stage === "final")!;
    const q1 = playoffs(season).find((f) => f.stage === "qualifier1")!;
    const q1Played = season.results.find((r) => r.fixtureId === "qualifier1")!;
    expect([final.home, final.away]).toContain(playoffWinner(season, q1, q1Played));
    expect([final.home, final.away]).toContain(champion(season));
    expect(nextFixture(season)).toBeNull();

    expect(season.results).toHaveLength(45 + 4);
  });

  it("send the higher-placed side through a tied playoff", () => {
    let season = fresh();
    const rng = makeRng("tied-q1");
    for (const f of season.league) season = recordResult(season, simulateFixture(f, squadById, rng));
    const [q1] = playoffs(season);
    const tied: Played = { fixtureId: q1.id, first: line(q1.home, 150), second: line(q1.away, 150), winner: null, summary: "" };
    expect(playoffWinner(season, q1, tied)).toBe(q1.home);
  });
});

describe("a result from summaries", () => {
  it("reads the same whether you batted or the model did", () => {
    const season = fresh();
    const f = season.league[0];
    const home = squadById(f.home);
    const away = squadById(f.away);
    const played = playedFrom(
      f,
      { squad: home, runs: 170, wickets: 6, balls: 120 },
      { squad: away, runs: 171, wickets: 4, balls: 115, won: true },
    );
    expect(played.winner).toBe(away.id);
    expect(played.summary).toMatch(/won by 6 wickets/);
  });
});

describe("a whole season", () => {
  it("replays identically from its seed", () => {
    const a = playOut(fresh(), "replay");
    const b = playOut(fresh(), "replay");
    expect(a.results.map((r) => r.summary)).toEqual(b.results.map((r) => r.summary));
    expect(champion(a)).toBe(champion(b));
  });
});

describe("your fate", () => {
  function playAll(you: string, seed: string, until?: (s: Season) => boolean): Season {
    let season = createSeason(IDS, you, seed);
    for (let guard = 0; guard < 80; guard++) {
      if (until?.(season)) break;
      const f = nextFixture(season);
      if (!f) break;
      season = recordResult(season, simulateFixture(f, squadById, makeRng(`${seed}:${f.id}`)));
    }
    return season;
  }

  it("is nothing while the league is open", () => {
    expect(fate(createSeason(IDS, "mum", "fate"))).toBeNull();
  });

  it("names the champion, the runner-up, and where everyone else went out", () => {
    const done = playAll("mum", "fate-season");
    const winner = champion(done)!;
    expect(fate({ ...done, you: winner })).toEqual({ kind: "champion" });
    const finalF = playoffs(done).find((f) => f.stage === "final")!;
    const loser = finalF.home === winner ? finalF.away : finalF.home;
    expect(fate({ ...done, you: loser })).toEqual({ kind: "runner-up" });
    const bottom = standings(done)[9].squad;
    expect(fate({ ...done, you: bottom })).toMatchObject({ kind: "eliminated", stage: "league", place: 10 });
    const elim = playoffs(done).find((f) => f.stage === "eliminator")!;
    const elimLoser = playoffWinner(done, elim, resultFor(done, elim.id)!) === elim.home ? elim.away : elim.home;
    const q2 = playoffs(done).find((f) => f.stage === "qualifier2")!;
    const q2Loser = playoffWinner(done, q2, resultFor(done, q2.id)!) === q2.home ? q2.away : q2.home;
    expect(fate({ ...done, you: elimLoser })).toMatchObject({ kind: "eliminated", stage: "eliminator" });
    expect(fate({ ...done, you: q2Loser })).toMatchObject({ kind: "eliminated", stage: "qualifier2" });
  });

  it("knows a fifth-placed side is out the moment the league ends", () => {
    const atLeagueEnd = playAll("mum", "fate-fifth", (s) => leagueComplete(s));
    const fifth = standings(atLeagueEnd)[4].squad;
    expect(fate({ ...atLeagueEnd, you: fifth })).toMatchObject({ kind: "eliminated", stage: "league", place: 5 });
    const fourth = standings(atLeagueEnd)[3].squad;
    expect(fate({ ...atLeagueEnd, you: fourth })).toBeNull();
  });
});
