export interface Rng {
  next(): number;

  int(n: number): number;

  chance(p: number): boolean;

  range(min: number, max: number): number;

  pick<T>(items: readonly T[]): T;

  weighted(weights: readonly number[]): number;
}

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
      return weights.length - 1;
    },
  };

  return rng;
}

function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
