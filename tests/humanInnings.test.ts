import { describe, expect, it } from "vitest";
import { HumanInnings } from "../src/game/humanInnings";
import { BALLS_PER_OVER, OVERS, WICKETS } from "../src/sim/innings";
import type { Outcome } from "../src/sim/types";
import { franchiseById } from "../src/data/franchises";

const dot: Outcome = { runs: 0, description: "" };
const six: Outcome = { runs: 6, description: "" };
const one: Outcome = { runs: 1, description: "" };
const out: Outcome = { runs: 0, wicket: "bowled", description: "" };
const wide: Outcome = { runs: 0, extra: "wide", description: "" };

const feed = (innings: HumanInnings, outcome: Outcome, times: number) => {
  for (let i = 0; i < times; i++) innings.record(outcome);
  return innings;
};

describe("the human innings", () => {
  it("ends at ten wickets", () => {
    const innings = feed(new HumanInnings(), out, WICKETS);
    expect(innings.complete).toBe(true);
    expect(innings.closedBecause).toBe("All out");
  });

  it("ends at twenty overs", () => {
    const innings = feed(new HumanInnings(), one, OVERS * BALLS_PER_OVER);
    expect(innings.complete).toBe(true);
    expect(innings.closedBecause).toBe("Innings complete");
    expect(innings.runs).toBe(120);
  });

  it("refuses to go past the end, which is the bug it exists to prevent", () => {
    const innings = feed(new HumanInnings(), out, WICKETS + 40);
    expect(innings.wickets).toBe(WICKETS);
    expect(innings.balls).toBe(WICKETS);
  });

  it("does not count a wide as a ball, but does count its run", () => {
    const innings = new HumanInnings();
    innings.record(wide);
    expect(innings.balls).toBe(0);
    expect(innings.runs).toBe(1);
  });

  it("writes overs as balls rather than decimals", () => {
    expect(feed(new HumanInnings(), one, 61).oversText).toBe("10.1");
    expect(new HumanInnings().oversText).toBe("0.0");
  });

  it("reports a run rate, and zero rather than NaN before the first ball", () => {
    expect(new HumanInnings().runRate).toBe(0);
    const innings = feed(new HumanInnings(), one, 6);
    expect(innings.runRate).toBeCloseTo(6);
  });

  it("drops the 10 from an all-out score, the way a scorecard does", () => {
    expect(feed(new HumanInnings(), one, 3).score).toBe("3/0");
    expect(feed(new HumanInnings(), out, WICKETS).score).toBe("0");
  });

  it("keeps the completed over on screen until the next ball is bowled", () => {
    const innings = feed(new HumanInnings(), dot, BALLS_PER_OVER);
    expect(innings.thisOver).toHaveLength(BALLS_PER_OVER);

    innings.record(six);
    expect(innings.thisOver.map((b) => b.label)).toEqual(["6"]);
  });

  it("marks each ball for the strip", () => {
    const innings = new HumanInnings();
    for (const outcome of [dot, one, six, wide, out]) innings.record(outcome);
    expect(innings.thisOver.map((b) => b.label)).toEqual(["•", "1", "6", "wd", "W"]);
    expect(innings.thisOver.map((b) => b.kind))
      .toEqual(["dot", "runs", "boundary", "extra", "wicket"]);
  });
});

describe("the human innings with a batting order and a target", () => {
  const squad = franchiseById("mum").squad;

  it("opens with the first two, rotates on odd runs, and swaps at the over", () => {
    const innings = new HumanInnings(squad);
    expect(innings.atTheCrease.map((l) => l.batter.name)).toEqual(["Rohit Sharma", "Ryan Rickelton"]);
    innings.record(one);
    expect(innings.atTheCrease[0].batter.name).toBe("Ryan Rickelton");
    innings.record(dot); innings.record(dot); innings.record(dot); innings.record(dot); innings.record(dot);

    expect(innings.atTheCrease[0].batter.name).toBe("Rohit Sharma");
  });

  it("sends the next man in when one is out, and scores each line", () => {
    const innings = new HumanInnings(squad);
    innings.record(six);
    innings.record(out);
    expect(innings.atTheCrease[0].batter.name).toBe("Will Jacks");
    const rohit = innings.battingLines.find((l) => l.batter.name === "Rohit Sharma")!;
    expect(rohit.runs).toBe(6);
    expect(rohit.balls).toBe(2);
    expect(rohit.sixes).toBe(1);
    expect(rohit.dismissal).toBe("bowled");
  });

  it("ends the moment a target is reached, and says what was required until then", () => {
    const innings = new HumanInnings(squad, 13);
    feed(innings, six, 2);
    expect(innings.complete).toBe(false);
    expect(innings.required).toEqual({ runs: 1, balls: 118 });
    expect(innings.requiredRate).toBeCloseTo(6 / 118, 5);
    innings.record(one);
    expect(innings.complete).toBe(true);
    expect(innings.won).toBe(true);
    expect(innings.closedBecause).toBe("Target reached");
    expect(innings.summary.won).toBe(true);
  });

  it("loses a chase that runs out of balls or wickets", () => {
    const short = feed(new HumanInnings(squad, 200), one, OVERS * BALLS_PER_OVER);
    expect(short.complete).toBe(true);
    expect(short.won).toBe(false);
    const collapsed = feed(new HumanInnings(squad, 200), out, WICKETS);
    expect(collapsed.won).toBe(false);
    expect(collapsed.summary.wickets).toBe(WICKETS);
  });

  it("has no summary without a squad", () => {
    expect(() => new HumanInnings().summary).toThrow(/squad/);
  });
});

describe("the over on the strip", () => {
  it("counts the over's runs, extras included, and numbers the over", () => {
    const innings = new HumanInnings();
    expect(innings.thisOverNumber).toBe(1);
    innings.record({ runs: 4, description: "four" });
    innings.record({ runs: 0, extra: "wide", description: "wide" });
    innings.record({ runs: 1, description: "one" });
    expect(innings.thisOverRuns).toBe(6);
    for (let i = 0; i < 4; i++) innings.record({ runs: 0, description: "dot" });

    expect(innings.thisOver.length).toBe(7);
    expect(innings.thisOverNumber).toBe(1);
    expect(innings.thisOverRuns).toBe(6);
    innings.record({ runs: 2, description: "two" });
    expect(innings.thisOver.length).toBe(1);
    expect(innings.thisOverNumber).toBe(2);
    expect(innings.thisOverRuns).toBe(2);
  });
});
