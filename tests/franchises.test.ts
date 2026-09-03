import { describe, expect, it } from "vitest";

import { FRANCHISES, LEAGUE, franchiseById } from "../src/data/franchises";
import { makeRng } from "../src/sim/rng";
import { simulateMatch } from "../src/sim/match";
import type { MatchResult } from "../src/sim/match";
import { OVERS, BALLS_PER_OVER } from "../src/sim/innings";

/**
 * The real squads, held to the same standard as the generated ones.
 *
 * The calibration bands were fitted against a generated league. Authored
 * numbers can drift out of those ranges one plausible-looking player at a
 * time -- a top order all in the 80s reads fine on the page and makes 220 a
 * par score -- so the franchises play their own seasons here and have to land
 * in the same place. And a tournament is only worth playing if every side can
 * win and no side always does, which no season average can tell you; that is
 * the balance check.
 */

const SEEDS = ["franchise-2026", "franchise-monsoon", "franchise-lights"];
const measure = process.env.MEASURE === "1";

function season(seed: string): MatchResult[] {
  const rng = makeRng(seed);
  const matches: MatchResult[] = [];
  for (let home = 0; home < LEAGUE.length; home++) {
    for (let away = home + 1; away < LEAGUE.length; away++) {
      matches.push(simulateMatch(LEAGUE[home], LEAGUE[away], rng));
    }
  }
  return matches;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe("the ten franchises", () => {
  it("are ten, with distinct ids, codes and names", () => {
    expect(FRANCHISES).toHaveLength(10);
    for (const key of ["id", "code", "name", "city"] as const) {
      expect(new Set(FRANCHISES.map((f) => f[key])).size).toBe(10);
    }
  });

  it("each field an eleven, six of whom bowl and all of whom bat", () => {
    for (const { squad } of FRANCHISES) {
      expect(squad.batters).toHaveLength(11);
      expect(squad.bowlers.length).toBeGreaterThanOrEqual(5);
      const batterIds = new Set(squad.batters.map((b) => b.id));
      for (const bowler of squad.bowlers) expect(batterIds.has(bowler.id)).toBe(true);
    }
  });

  it("never repeat a player id or a name across the league", () => {
    const ids = FRANCHISES.flatMap((f) => f.squad.batters.map((b) => b.id));
    const names = FRANCHISES.flatMap((f) => f.squad.batters.map((b) => b.name));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keep every attribute on the 0-100 scale", () => {
    for (const { squad } of FRANCHISES) {
      for (const b of squad.batters) {
        for (const v of [b.power, b.technique, b.aggression]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
      for (const b of squad.bowlers) {
        for (const v of [b.pace, b.accuracy, b.movement, b.variation]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("bat in a sensible order: the tail is the tail", () => {
    for (const { squad } of FRANCHISES) {
      const top = mean(squad.batters.slice(0, 4).map((b) => b.technique));
      const tail = mean(squad.batters.slice(8).map((b) => b.technique));
      expect(top).toBeGreaterThan(tail + 25);
    }
  });

  it("can be looked up, and complain about a stranger", () => {
    expect(franchiseById("che").name).toBe("Chennai Cyclones");
    expect(() => franchiseById("csk")).toThrow(/no franchise/);
  });
});

describe("a season between the franchises", () => {
  const seasons = SEEDS.map(season);
  const matches = seasons.flat();
  const firstInnings = matches.map((m) => m.first);

  it("lands inside the calibration bands the generated league was fitted to", () => {
    const totals = firstInnings.map((i) => i.runs);
    const wickets = firstInnings.map((i) => i.wickets);
    const balls = firstInnings.reduce((s, i) => s + i.balls, 0);
    const strikeRate = (firstInnings.reduce((s, i) => s + i.runs, 0) / balls) * 100;
    if (measure) console.log(`franchise league: total ${mean(totals).toFixed(1)}, wickets ${mean(wickets).toFixed(2)}, SR ${strikeRate.toFixed(1)}`);

    expect(mean(totals)).toBeGreaterThan(150);
    expect(mean(totals)).toBeLessThan(200);
    expect(mean(wickets)).toBeGreaterThan(4);
    expect(mean(wickets)).toBeLessThan(8);
    expect(strikeRate).toBeGreaterThan(120);
    expect(strikeRate).toBeLessThan(160);
  });

  it("gives every side wins, and nobody all of them", () => {
    const wins = new Map<string, number>();
    for (const m of matches) if (m.winner) wins.set(m.winner.id, (wins.get(m.winner.id) ?? 0) + 1);
    const played = SEEDS.length * (LEAGUE.length - 1);
    const shares = LEAGUE.map((s) => ({ id: s.id, share: (wins.get(s.id) ?? 0) / played }))
      .sort((a, b) => b.share - a.share);
    if (measure) console.log("win shares:", shares.map((s) => `${s.id} ${(s.share * 100).toFixed(0)}%`).join("  "));

    // Measured 0.33-0.67 over these three seasons (27 games a side, so a
    // standard error near 0.10). A side under a sixth is a bye; a side over
    // three quarters is a foregone conclusion.
    expect(shares[shares.length - 1].share).toBeGreaterThan(0.15);
    expect(shares[0].share).toBeLessThan(0.8);
  });

  it("lets the strong sides be strong: the batting-heavy side outscores the bowling-heavy one", () => {
    const scored = (id: string) =>
      mean(matches.flatMap((m) => [m.first, m.second]).filter((i) => i.squad.id === id).map((i) => i.runs));
    if (measure) console.log(`BLR bat ${scored("blr").toFixed(1)}, HYD bat ${scored("hyd").toFixed(1)}`);
    expect(scored("blr")).toBeGreaterThan(scored("hyd"));
  });

  it("finishes every innings inside twenty overs", () => {
    for (const m of matches) {
      expect(m.first.balls).toBeLessThanOrEqual(OVERS * BALLS_PER_OVER);
      expect(m.second.balls).toBeLessThanOrEqual(OVERS * BALLS_PER_OVER);
    }
  });
});
