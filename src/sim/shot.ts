import type { Length } from "./delivery";

export type Footwork = "front" | "back";

export type Commitment = "defend" | "rotate" | "attack";

export interface Shot {
  footwork: Footwork;
  commitment: Commitment;
}

const MATCH: Record<Footwork, Record<Length, number>> = {
  front: { yorker: 0.85, full: 1.00, good: 0.72, short: 0.22 },
  back: { yorker: 0.12, full: 0.42, good: 0.82, short: 1.00 },
};

export const matchQuality = (footwork: Footwork, length: Length): number =>
  MATCH[footwork][length];

export const IDEAL_FOOT: Record<Length, Footwork> = {
  yorker: "front",
  full: "front",
  good: "front",
  short: "back",
};

export const playedTheRightFoot = (footwork: Footwork, length: Length): boolean =>
  IDEAL_FOOT[length] === footwork;
