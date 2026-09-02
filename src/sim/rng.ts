/**
 * Seeded randomness for the simulation.
 *
 * Every roll the model makes comes from here, and an `Rng` is always passed in
 * as a parameter rather than reached for globally. That is what makes a season
 * reproducible: the same seed replays the same tournament, ball for ball, which
 * gives us shareable seeds and -- more immediately useful -- a calibration test
 * that fails on a real regression rather than on luck.
 *
 * Nothing in `src/sim/` may call `Math.random`. The crowd in the stadium may;
 * it is decoration and feeds nothing.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** One element, uniformly. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /**
   * An index into `weights`, chosen proportionally. Weights need not sum to 1
   * and must not be negative; this is how every outcome distribution is rolled.
   */
  weighted(weights: readonly number[]): number;
}

/**
 * mulberry32: 32 bits of state, one multiply-xorshift round. Fast, and good
 * enough for a game -- it passes gjrand's basic suite, which is far more than a
 * cricket score needs. Chosen over `Math.random` only for the seeding.
 */
export function makeRng(seed: number | string): Rng {
  let state = typeof seed === "string" ? hashString(seed) : seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    range: (min, max) => min + next() * (max - min),
    pick: (items) => {
      if (items.length === 0) throw new Error("pick() from an empty list");
      return items[Math.floor(next() * items.length)];
    },
    weighted: (weights) => {
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) throw new Error("weighted() needs at least one positive weight");

      let roll = next() * total;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll < 0) return i;
      }
      return weights.length - 1; // floating-point crumbs only
    },
  };

  return rng;
}

/** FNV-1a, so a season can be seeded with something memorable. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
