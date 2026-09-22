import type { Length, Line } from "../../sim/delivery";

export type Bearing = number;

export interface PlanPoint {
  along: number;

  across: number;
}

export interface Contact {
  aheadPx: number;
  length: Length;
  line: Line;

  spray: number;
}

const NEUTRAL_AHEAD: Record<Length, number> = {
  yorker: 18,
  full: 9,
  good: 13,
  short: 14,
};

const DEGREES_PER_PX = 1.8;

const LINE_BIAS: Record<Line, number> = {
  leg: 22,
  stumps: 6,
  off: -8,
  "wide-off": -24,
};

const SPRAY = 10;

export const MAX_BEARING = 135;

export function shotBearing(contact: Contact): Bearing {
  const timing = (contact.aheadPx - NEUTRAL_AHEAD[contact.length]) * DEGREES_PER_PX;
  const bearing = timing + LINE_BIAS[contact.line] + contact.spray * SPRAY;
  return Math.max(-MAX_BEARING, Math.min(MAX_BEARING, bearing));
}

export function travelledBearing(downfieldM: number, bearing: Bearing): Bearing {
  if (downfieldM >= 0 || Math.abs(bearing) >= 90) return bearing;
  const sign = bearing >= 0 ? 1 : -1;
  return sign * (180 - Math.abs(bearing));
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function planPosition(distanceM: number, bearing: Bearing): PlanPoint {
  const radians = toRadians(bearing);
  return { along: distanceM * Math.cos(radians), across: distanceM * Math.sin(radians) };
}

export function planDistance(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(a.along - b.along, a.across - b.across);
}

export function relativeToPath(point: PlanPoint, bearing: Bearing): { offLine: number; alongLine: number } {
  const radians = toRadians(bearing);
  const dirAlong = Math.cos(radians);
  const dirAcross = Math.sin(radians);
  return {
    alongLine: point.along * dirAlong + point.across * dirAcross,
    offLine: Math.abs(point.across * dirAlong - point.along * dirAcross),
  };
}

interface Region {
  within: number;
  legDeep: string;
  legNear: string;
  offDeep: string;
  offNear: string;
}

const STRAIGHT = "straight back past the bowler";

const REGIONS: readonly Region[] = [
  { within: 12, legDeep: "long-on", legNear: STRAIGHT, offDeep: "long-off", offNear: STRAIGHT },
  { within: 35, legDeep: "long-on", legNear: "mid-on", offDeep: "long-off", offNear: "mid-off" },
  { within: 65, legDeep: "deep mid-wicket", legNear: "mid-wicket", offDeep: "deep cover", offNear: "cover" },
  { within: 100, legDeep: "deep square leg", legNear: "square leg", offDeep: "deep point", offNear: "point" },
  { within: Infinity, legDeep: "deep fine leg", legNear: "fine leg", offDeep: "deep third man", offNear: "third man" },
];

export function regionName(bearing: Bearing, distanceM: number): string {
  const deep = distanceM >= 40;
  const angle = Math.abs(bearing);
  const region = REGIONS.find((r) => angle <= r.within)!;

  if (bearing >= 0) return deep ? region.legDeep : region.legNear;
  return deep ? region.offDeep : region.offNear;
}
