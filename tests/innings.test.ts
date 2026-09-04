import { describe, expect, it } from "vitest";
import { makeRng } from "../src/sim/rng";
import type { Squad, Batter, Bowler } from "../src/sim/player";
import { averageBatter, averageBowler } from "../src/sim/player";
import {
  simulateInnings,
  oversOf,
  economyOf,
  strikeRateOf,
  OVERS,
  BALLS_PER_OVER,
  WICKETS,
  MAX_OVERS_PER_BOWLER,
} from "../src/sim/innings";
import type { InningsResult } from "../src/sim/innings";
import { simulateMatch, netRunRateInnings, scoreline } from "../src/sim/match";
import { runsAgainstBowler } from "../src/sim/types";
import { makeLeague, makeSquad } from "./squads";

const league = makeLeague(makeRng("test-league"));

function uniformSquad(id: string, batter: Partial<Batter>, bowler: Partial<Bowler>): Squad {
  return {
    id,
    name: id,
    batters: Array.from({ length: 11 }, (_, i) => ({ ...averageBatter(`${id}-b${i}`), ...batter })),
    bowlers: Array.from({ length: 6 }, (_, i) => ({ ...averageBowler(`${id}-w${i}`), ...bowler })),
  };
}

describe("the innings loop", () => {
  const innings = simulateInnings(league[0], league[1], makeRng("innings"));

  it("stops at twenty overs and ten wickets", () => {
    expect(innings.balls).toBeLessThanOrEqual(OVERS * BALLS_PER_OVER);
    expect(innings.wickets).toBeLessThanOrEqual(WICKETS);
  });

  it("adds up: batters plus extras equals the team total", () => {
    const offTheBat = innings.batting.reduce((sum, b) => sum + b.runs, 0);
    const extras = innings.log.reduce(
      (sum, ball) =>
        sum + (ball.outcome.extra ? ball.outcome.runs + (ball.outcome.extra === "wide" || ball.outcome.extra === "no-ball" ? 1 : 0) : 0),
      0,
    );
    expect(offTheBat + extras).toBe(innings.runs);
  });

  it("adds up: bowlers' runs plus byes equals the team total", () => {
    const charged = innings.bowling.reduce((sum, b) => sum + b.runs, 0);
    const byes = innings.log.reduce(
      (sum, ball) => sum + (ball.outcome.extra === "bye" || ball.outcome.extra === "leg-bye" ? ball.outcome.runs : 0),
      0,
    );
    expect(charged + byes).toBe(innings.runs);
  });

  it("adds up: bowlers' wickets plus run-outs equals wickets lost", () => {
    const toBowlers = innings.bowling.reduce((sum, b) => sum + b.wickets, 0);
    const runOuts = innings.log.filter((ball) => ball.outcome.wicket === "run-out").length;
    expect(toBowlers + runOuts).toBe(innings.wickets);
  });

  it("does not credit a run-out to the bowler", () => {
    const runOuts = innings.log.filter((b) => b.outcome.wicket === "run-out").length;
    const dismissed = innings.batting.filter((b) => b.dismissal === "run-out").length;
    expect(dismissed).toBe(runOuts);
  });

  it("counts balls faced without counting wides", () => {
    const faced = innings.batting.reduce((sum, b) => sum + b.balls, 0);
    expect(faced).toBe(innings.balls);
    expect(innings.log.filter((b) => b.outcome.extra === "wide").length).toBeGreaterThan(0);
  });

  it("counts fours and sixes off the bat only", () => {
    const fours = innings.batting.reduce((s, b) => s + b.fours, 0);
    const logged = innings.log.filter((b) => !b.outcome.extra && b.outcome.runs === 4).length;
    expect(fours).toBe(logged);
  });

  it("never sends out more batters than were dismissed, plus two at the crease", () => {
    expect(innings.batting.length).toBeLessThanOrEqual(innings.wickets + 2);
  });

  it("charges the bowler for a wide but not for a leg bye", () => {
    expect(runsAgainstBowler({ runs: 0, extra: "wide", description: "" })).toBe(1);
    expect(runsAgainstBowler({ runs: 1, extra: "leg-bye", description: "" })).toBe(0);
  });
});

describe("the bowling allocation", () => {
  const innings = simulateInnings(league[2], league[3], makeRng("overs"));

  it("gives nobody more than a fifth of the innings", () => {
    for (const line of innings.bowling) {
      expect(line.balls).toBeLessThanOrEqual(MAX_OVERS_PER_BOWLER * BALLS_PER_OVER);
    }
  });

  it("never lets a bowler bowl two overs in a row", () => {
    const perOver = new Map<number, string>();
    for (const ball of innings.log) perOver.set(ball.over, ball.delivery.bowler.id);

    const sequence = [...perOver.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id);
    for (let i = 1; i < sequence.length; i++) expect(sequence[i]).not.toBe(sequence[i - 1]);
  });

  it("fills all twenty overs when nobody is dismissed early", () => {
    const wall = uniformSquad("wall", { technique: 100, aggression: 0 }, {});
    const gentle = uniformSquad("gentle", {}, { accuracy: 0, movement: 0, pace: 0 });
    const full = simulateInnings(wall, gentle, makeRng("full"));
    expect(full.balls).toBe(OVERS * BALLS_PER_OVER);
  });

  it("refuses a squad that cannot legally fill the overs", () => {
    const short: Squad = { ...league[0], bowlers: league[0].bowlers.slice(0, 3) };
    expect(() => simulateInnings(league[1], short, makeRng("short"))).toThrow(/too few bowlers/);
  });
});

describe("attributes changing the cricket", () => {
  const meanScore = (batting: Squad, bowling: Squad, seed: string) => {
    const rng = makeRng(seed);
    const scores = Array.from({ length: 40 }, () => simulateInnings(batting, bowling, rng).runs);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  const attack = uniformSquad("attack", {}, {});

  it("scores more with more powerful batters", () => {
    const strong = meanScore(uniformSquad("strong", { power: 92 }, {}), attack, "power");
    const weak = meanScore(uniformSquad("weak", { power: 12 }, {}), attack, "power");
    expect(strong).toBeGreaterThan(weak + 20);
  });

  it("loses fewer wickets with better technique", () => {
    const rng = makeRng("technique");
    const solid = Array.from({ length: 40 }, () =>
      simulateInnings(uniformSquad("solid", { technique: 92 }, {}), attack, rng).wickets);
    const loose = Array.from({ length: 40 }, () =>
      simulateInnings(uniformSquad("loose", { technique: 12 }, {}), attack, rng).wickets);
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const margin = mean(loose) - mean(solid);
    expect(margin).toBeGreaterThan(1);

    expect(margin).toBeLessThan(4);
  });

  it("concedes fewer runs with a better attack", () => {
    const batting = uniformSquad("batting", {}, {});
    const good = meanScore(batting, uniformSquad("good", {}, { accuracy: 92, movement: 92 }), "attack");
    const poor = meanScore(batting, uniformSquad("poor", {}, { accuracy: 12, movement: 12 }), "attack");
    expect(good).toBeLessThan(poor - 15);
  });

  it("concedes more extras with a less accurate attack", () => {
    const batting = uniformSquad("batting", {}, {});
    const extrasFrom = (accuracy: number) => {
      const rng = makeRng("extras");
      return Array.from({ length: 20 }, () =>
        simulateInnings(batting, uniformSquad(`a${accuracy}`, {}, { accuracy }), rng)
          .log.filter((b) => b.outcome.extra === "wide").length,
      ).reduce((a, b) => a + b, 0);
    };
    expect(extrasFrom(10)).toBeGreaterThan(extrasFrom(90));
  });
});

describe("a whole match", () => {
  it("replays identically from the same seed", () => {
    const play = () => {
      const teams = makeLeague(makeRng("replay-squads"));
      return simulateMatch(teams[0], teams[1], makeRng("replay"));
    };
    const a = play();
    const b = play();

    expect(b.summary).toBe(a.summary);
    expect(b.first.runs).toBe(a.first.runs);
    expect(b.second.runs).toBe(a.second.runs);

    expect(b.first.log.map(describeBall)).toEqual(a.first.log.map(describeBall));
    expect(b.second.log.map(describeBall)).toEqual(a.second.log.map(describeBall));
  });

  it("stops the chase the moment the target is passed", () => {
    const teams = makeLeague(makeRng("chase-squads"));
    for (const seed of ["c1", "c2", "c3", "c4", "c5"]) {
      const match = simulateMatch(teams[4], teams[5], makeRng(seed));
      if (!match.second.won) continue;

      expect(match.second.runs).toBeGreaterThan(match.first.runs);

      const beforeLast = match.second.log[match.second.log.length - 2];
      if (beforeLast) expect(beforeLast.runs).toBeLessThanOrEqual(match.first.runs);
    }
  });

  it("names exactly one winner, or none", () => {
    const teams = makeLeague(makeRng("winner-squads"));
    const match = simulateMatch(teams[6], teams[7], makeRng("winner"));

    if (match.winner === null) {
      expect(match.first.runs).toBe(match.second.runs);
    } else {
      expect([match.home.id, match.away.id]).toContain(match.winner.id);
      expect(match.first.runs).not.toBe(match.second.runs);
    }
  });

  it("charges a side bowled out the full twenty overs for net run rate", () => {
    const collapsed = { wickets: WICKETS, runs: 90, balls: 84 } as InningsResult;
    expect(netRunRateInnings(collapsed)).toEqual({ runs: 90, overs: OVERS });

    const survived = { wickets: 6, runs: 180, balls: 120 } as InningsResult;
    expect(netRunRateInnings(survived)).toEqual({ runs: 180, overs: 20 });
  });
});

describe("scorecard formatting", () => {
  it("writes overs in balls, not decimals", () => {
    expect(oversOf(0)).toBe("0.0");
    expect(oversOf(17)).toBe("2.5");
    expect(oversOf(120)).toBe("20.0");
  });

  it("marks an all-out side rather than writing 10 wickets", () => {
    expect(scoreline({ runs: 90, wickets: WICKETS, balls: 84 } as InningsResult)).toBe("90 all out (14.0)");
    expect(scoreline({ runs: 180, wickets: 4, balls: 120 } as InningsResult)).toBe("180/4 (20.0)");
  });

  it("returns zero rather than NaN for a player who did nothing", () => {
    const bowler = makeSquad("x", "x", makeRng("x")).bowlers[0];
    expect(economyOf({ bowler, balls: 0, runs: 0, wickets: 0, maidens: 0 })).toBe(0);
    expect(strikeRateOf({ batter: averageBatter("y"), runs: 0, balls: 0, fours: 0, sixes: 0 })).toBe(0);
  });
});

const describeBall = (ball: { outcome: { description: string }; runs: number }) =>
  `${ball.runs} ${ball.outcome.description}`;
