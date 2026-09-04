import { describe, it, expect } from "vitest";
import { makeRng } from "../src/sim/rng";
import { simulateMatch } from "../src/sim/match";
import { OVERS, BALLS_PER_OVER } from "../src/sim/innings";
import { makeLeague } from "./squads";
import { playedTheRightFoot } from "../src/sim/shot";

const SEEDS = ["powerplay-2026", "monsoon", "floodlights"];

function season(seed: string) {
  const rng = makeRng(seed);
  const teams = makeLeague(makeRng(`${seed}-squads`));

  const innings = [];
  for (let home = 0; home < teams.length; home++) {
    for (let away = home + 1; away < teams.length; away++) {
      const match = simulateMatch(teams[home], teams[away], rng);
      innings.push(match.first, match.second);
    }
  }
  return innings;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe("season calibration", () => {
  const innings = SEEDS.flatMap(season);

  const firstInnings = innings.filter((_, i) => i % 2 === 0);

  it("plays a full single round robin in each season", () => {
    expect(innings.length).toBe(SEEDS.length * 45 * 2);
  });

  it("makes plausible first-innings totals", () => {
    const totals = firstInnings.map((i) => i.runs);
    expect(mean(totals)).toBeGreaterThan(150);
    expect(mean(totals)).toBeLessThan(200);

    expect(Math.min(...totals)).toBeGreaterThan(30);

    expect(totals.filter((t) => t < 50).length / totals.length).toBeLessThan(0.03);
    expect(Math.max(...totals)).toBeLessThan(280);
  });

  it("loses a plausible number of wickets", () => {
    expect(mean(firstInnings.map((i) => i.wickets))).toBeGreaterThan(4);
    expect(mean(firstInnings.map((i) => i.wickets))).toBeLessThan(8);
  });

  it("bats at a plausible strike rate", () => {
    const runs = firstInnings.reduce((sum, i) => sum + i.runs, 0);
    const balls = firstInnings.reduce((sum, i) => sum + i.balls, 0);
    const strikeRate = (runs / balls) * 100;
    expect(strikeRate).toBeGreaterThan(120);
    expect(strikeRate).toBeLessThan(160);
  });

  it("bowls at a plausible economy", () => {
    const lines = innings.flatMap((i) => i.bowling);
    const runs = lines.reduce((sum, l) => sum + l.runs, 0);
    const balls = lines.reduce((sum, l) => sum + l.balls, 0);
    const economy = (runs / balls) * BALLS_PER_OVER;
    expect(economy).toBeGreaterThan(6);
    expect(economy).toBeLessThan(10);
  });

  it("hits boundaries at roughly the right rate", () => {
    const fours = innings.reduce((s, i) => s + i.batting.reduce((t, b) => t + b.fours, 0), 0);
    const sixes = innings.reduce((s, i) => s + i.batting.reduce((t, b) => t + b.sixes, 0), 0);
    const balls = innings.reduce((s, i) => s + i.balls, 0);

    expect(fours / balls).toBeGreaterThan(0.07);
    expect(fours / balls).toBeLessThan(0.16);
    expect(sixes / balls).toBeGreaterThan(0.025);
    expect(sixes / balls).toBeLessThan(0.09);
  });

  it("does not run away with extras", () => {
    const extras = innings.reduce(
      (sum, i) => sum + i.log.filter((b) => b.outcome.extra).length,
      0,
    );
    const perInnings = extras / innings.length;
    expect(perInnings).toBeGreaterThan(1);
    expect(perInnings).toBeLessThan(12);
  });

  it("does not decide every match the same way", () => {
    const chased = innings.filter((i, idx) => idx % 2 === 1 && i.won).length;
    const share = chased / (SEEDS.length * 45);
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.75);
  });

  it("plays the wrong foot often enough to matter, and not so often it is noise", () => {
    const balls = innings.flatMap((i) => i.log).filter((b) => b.outcome.shot);
    const wrong = balls.filter(
      (b) => !playedTheRightFoot(b.outcome.shot!.footwork, b.delivery.length),
    );

    const share = wrong.length / balls.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.20);
  });

  it("loses a real share of its wickets to the wrong foot, but not most of them", () => {
    const balls = innings.flatMap((i) => i.log).filter((b) => b.outcome.shot);
    const wickets = balls.filter((b) => b.outcome.wicket);
    const misread = wickets.filter(
      (b) => !playedTheRightFoot(b.outcome.shot!.footwork, b.delivery.length),
    );

    const share = misread.length / wickets.length;
    expect(share).toBeGreaterThan(0.10);
    expect(share).toBeLessThan(0.35);
  });

  it("finishes almost every innings inside twenty overs", () => {
    const overlong = innings.filter((i) => i.balls > OVERS * BALLS_PER_OVER);
    expect(overlong).toHaveLength(0);
  });
});
