import { planDistance } from "./direction";
import type { PlanPoint } from "./direction";
import type { Fielder } from "./field";

/**
 * Fielders who move. Pure arithmetic on the plan, in metres; the scene
 * projects the result. The judge in field.ts still decides every ball from
 * the fielders' *set* positions -- what happens here is what you see, not
 * what counts, so the harness's measurements stand.
 */

/** How fast a fielder runs at a ball, metres a second. */
export const CHASE_SPEED = 6.5;
/** And how fast he walks back to his spot. */
export const RETURN_SPEED = 3.5;

/** The nearest fielder to a point on the plan. Null for an empty field. */
export function nearestTo(point: PlanPoint, field: readonly { fielder: Fielder; at: PlanPoint }[]): Fielder | null {
  let best: Fielder | null = null;
  let bestD = Infinity;
  for (const f of field) {
    const d = planDistance(point, f.at);
    if (d < bestD) {
      bestD = d;
      best = f.fielder;
    }
  }
  return best;
}

/** One frame of running toward a target, without overshooting it. */
export function stepToward(from: PlanPoint, to: PlanPoint, speedMps: number, dtMs: number): PlanPoint {
  const d = planDistance(from, to);
  const step = speedMps * (dtMs / 1000);
  if (d <= step || d === 0) return { along: to.along, across: to.across };
  const t = step / d;
  return { along: from.along + (to.along - from.along) * t, across: from.across + (to.across - from.across) * t };
}
