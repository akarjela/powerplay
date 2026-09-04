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

export function regionName(bearing: Bearing, distanceM: number): string {
  const deep = distanceM >= 40;
  const leg = bearing >= 0;
  const angle = Math.abs(bearing);

  if (angle <= 12) return deep ? (leg ? "long-on" : "long-off") : "straight back past the bowler";
  if (angle <= 35) return leg ? (deep ? "long-on" : "mid-on") : deep ? "long-off" : "mid-off";
  if (angle <= 65) return leg ? (deep ? "deep mid-wicket" : "mid-wicket") : deep ? "deep cover" : "cover";
  if (angle <= 100) return leg ? (deep ? "deep square leg" : "square leg") : deep ? "deep point" : "point";
  return leg ? (deep ? "deep fine leg" : "fine leg") : deep ? "deep third man" : "third man";
}
