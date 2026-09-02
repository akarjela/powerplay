import { describe, expect, it } from "vitest";
import { makeRng } from "../src/sim/rng";

describe("seeded randomness", () => {
  it("replays exactly from the same seed", () => {
    const a = Array.from({ length: 50 }, () => makeRng("monsoon").next());
    const b = Array.from({ length: 50 }, () => makeRng("monsoon").next());
    expect(a).toEqual(b);

    const first = makeRng(7);
    const second = makeRng(7);
    expect(Array.from({ length: 20 }, () => first.int(100)))
      .toEqual(Array.from({ length: 20 }, () => second.int(100)));
  });

  it("gives different streams for different seeds", () => {
    const a = makeRng("monsoon");
    const b = makeRng("floodlights");
    const drawn = Array.from({ length: 20 }, () => a.next() === b.next());
    expect(drawn.every(Boolean)).toBe(false);
  });

  it("stays inside its bounds", () => {
    const rng = makeRng(1);
    for (let i = 0; i < 2000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(rng.int(6)).toBeLessThan(6);
      expect(rng.range(10, 20)).toBeGreaterThanOrEqual(10);
    }
  });

  it("respects weights", () => {
    const rng = makeRng("weights");
    const counts = [0, 0, 0];
    for (let i = 0; i < 30_000; i++) counts[rng.weighted([1, 3, 6])]++;

    // 10/30/60, with room for sampling noise.
    expect(counts[0] / 30_000).toBeCloseTo(0.10, 1);
    expect(counts[1] / 30_000).toBeCloseTo(0.30, 1);
    expect(counts[2] / 30_000).toBeCloseTo(0.60, 1);
  });

  it("never picks a zero-weight option", () => {
    const rng = makeRng("zero");
    for (let i = 0; i < 5000; i++) expect(rng.weighted([1, 0, 1])).not.toBe(1);
  });

  it("refuses an empty or impossible draw rather than returning undefined", () => {
    const rng = makeRng(1);
    expect(() => rng.pick([])).toThrow();
    expect(() => rng.weighted([0, 0])).toThrow();
  });
});
