import { describe, expect, it } from "vitest";
import { makeRng } from "../src/sim/rng";
import { averageBatter, averageBowler } from "../src/sim/player";
import type { Delivery, Length } from "../src/sim/delivery";
import {
  chooseFootwork, matchQuality, resolveShot,
} from "../src/sim/outcome";
import type { BallContext, Footwork, Shot } from "../src/sim/outcome";

/**
 * The footwork axis, tested directly rather than through a season.
 *
 * The calibration bands cannot see any of this. Every match multiplier is
 * centred on the expected match, so a *dead* footwork axis produces exactly the
 * same league averages as a live one -- the spread changes and the mean does
 * not. That is the same blind spot that let bowling attributes go nearly inert
 * until an A/B against extreme squads exposed it, so these are A/Bs.
 */

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

/** Play the same ball many times on a given foot, and count what happened. */
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
    // Either foot survives a good length, which is why a misread there is cheap.
    expect(matchQuality("front", "good")).toBeGreaterThan(0.6);
    expect(matchQuality("back", "good")).toBeGreaterThan(0.6);
  });

  it("costs wickets when the footwork is wrong", () => {
    // The test that fails if the axis ever goes dead.
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
    // Measured at ~12 points apart (72% against 59%); the threshold sits under
    // that rather than over it. Guessing this number first is how the last two
    // A/B tests in this repo failed while the model was correct.
    expect(shareBack).toBeGreaterThan(shareFront + 0.08);
    // It should be the majority way out, not a rare flourish.
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
    // A batter who reads perfectly should still pick opposite feet for these.
    expect(readRate(100, "yorker", "front")).toBeGreaterThan(0.9);
    expect(readRate(100, "short", "back")).toBeGreaterThan(0.9);
  });
});
