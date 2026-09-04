import { describe, expect, it } from "vitest";
import { makeRng } from "../src/sim/rng";
import { averageBatter, averageBowler } from "../src/sim/player";
import type { Delivery, Length } from "../src/sim/delivery";
import { bowl, phaseOf } from "../src/sim/delivery";
import { makeLeague } from "./squads";
import { chooseFootwork, resolveShot, EXPECTED_MATCH } from "../src/sim/outcome";
import type { BallContext } from "../src/sim/outcome";
import { matchQuality } from "../src/sim/shot";
import type { Footwork, Shot } from "../src/sim/shot";

const delivery = (length: Length, over: Partial<Delivery> = {}): Delivery => ({
  bowler: averageBowler("b", "Rana"),
  speed: 138,
  length,
  line: "stumps",
  deviation: 0.4,
  threat: 0.5,
  latitude: 0.45,
  ...over,
});

const context: BallContext = { phase: "middle", wicketsDown: 2, ballsFaced: 20 };

function tally(length: Length, footwork: Footwork, seed: string, rolls = 20_000) {
  const rng = makeRng(seed);
  const batter = averageBatter("a", "Batter");
  const shot: Shot = { footwork, commitment: "rotate" };
  const counts = { wickets: 0, bowledOrLbw: 0, caught: 0, runs: 0, boundaries: 0 };

  for (let i = 0; i < rolls; i++) {
    const outcome = resolveShot(batter, delivery(length), shot, context, rng);
    if (outcome.wicket) {
      counts.wickets++;
      if (outcome.wicket === "bowled" || outcome.wicket === "lbw") counts.bowledOrLbw++;
      if (outcome.wicket === "caught") counts.caught++;
    }
    counts.runs += outcome.runs;
    if (outcome.runs >= 4) counts.boundaries++;
  }
  return counts;
}

describe("the footwork match", () => {
  it("scores the corners as catastrophes and a good length as forgiving", () => {
    expect(matchQuality("back", "yorker")).toBeLessThan(0.2);
    expect(matchQuality("front", "short")).toBeLessThan(0.3);

    expect(matchQuality("front", "good")).toBeGreaterThan(0.6);
    expect(matchQuality("back", "good")).toBeGreaterThan(0.6);
  });

  it("costs wickets when the footwork is wrong", () => {
    const right = tally("yorker", "front", "wicket-ab");
    const wrong = tally("yorker", "back", "wicket-ab");
    expect(wrong.wickets).toBeGreaterThan(right.wickets * 1.5);
  });

  it("costs runs when the footwork is wrong", () => {
    const right = tally("short", "back", "runs-ab");
    const wrong = tally("short", "front", "runs-ab");
    expect(wrong.runs).toBeLessThan(right.runs * 0.85);
    expect(wrong.boundaries).toBeLessThan(right.boundaries * 0.8);
  });
});

describe("the punishment fits the mistake", () => {
  it("bowls or traps the batter who stayed back to a yorker", () => {
    const back = tally("yorker", "back", "stuck");
    const front = tally("yorker", "front", "stuck");
    const shareBack = back.bowledOrLbw / back.wickets;
    const shareFront = front.bowledOrLbw / front.wickets;

    expect(shareBack).toBeGreaterThan(shareFront + 0.08);

    expect(shareBack).toBeGreaterThan(0.5);
  });

  it("catches the batter who committed forward to a short ball", () => {
    const front = tally("short", "front", "stranded");
    const back = tally("short", "back", "stranded");
    expect(front.caught / front.wickets).toBeGreaterThan(back.caught / back.wickets + 0.1);
  });
});

describe("reading the length", () => {
  const readRate = (technique: number, length: Length, ideal: Footwork) => {
    const rng = makeRng("read");
    const batter = { ...averageBatter("r"), technique };
    let correct = 0;
    for (let i = 0; i < 20_000; i++) {
      if (chooseFootwork(batter, delivery(length), rng) === ideal) correct++;
    }
    return correct / 20_000;
  };

  it("is what technique buys", () => {
    const good = readRate(92, "short", "back");
    const poor = readRate(12, "short", "back");
    expect(good).toBeGreaterThan(0.9);
    expect(poor).toBeLessThan(0.8);
    expect(good).toBeGreaterThan(poor + 0.15);
  });

  it("goes forward to a yorker and back to a short ball", () => {
    expect(readRate(100, "yorker", "front")).toBeGreaterThan(0.9);
    expect(readRate(100, "short", "back")).toBeGreaterThan(0.9);
  });
});

describe("the calibration constant the whole model is centred on", () => {
  it("still matches what the delivery model actually produces", () => {
    const rng = makeRng("expected");
    const teams = makeLeague(makeRng("expected-squads"));
    const batter = averageBatter("x");

    let sum = 0;
    let balls = 0;

    for (let i = 0, over = 0; i < 60_000; i++, over = (over + 1) % 20) {
      const delivery = bowl(teams[i % 10].bowlers[i % 6], phaseOf(over), rng);
      if (delivery.illegal) continue;
      sum += matchQuality(chooseFootwork(batter, delivery, rng), delivery.length);
      balls++;
    }

    expect(Math.abs(sum / balls - EXPECTED_MATCH)).toBeLessThan(0.02);
  });
});
