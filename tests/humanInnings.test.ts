import { describe, expect, it } from "vitest";
import { HumanInnings } from "../src/game/humanInnings";
import { BALLS_PER_OVER, OVERS, WICKETS } from "../src/sim/innings";
import type { Outcome } from "../src/sim/types";

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
    // The scene used to accept an eleventh wicket, and a forty-eighth.
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
