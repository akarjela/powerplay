import { describe, expect, it } from "vitest";

import { CHASE_SPEED, nearestTo, stepToward } from "../src/game/physics/chase";
import { fieldFor } from "../src/game/physics/field";
import { planPosition } from "../src/game/physics/direction";

describe("fielders who move", () => {
  const field = fieldFor("middle").map((fielder) => ({ fielder, at: planPosition(fielder.distance, fielder.bearing) }));

  it("picks the nearest man to the ball", () => {
    expect(nearestTo(planPosition(60, 18), field)?.name).toBe("long-on");
    expect(nearestTo(planPosition(24, -84), field)?.name).toBe("point");
    expect(nearestTo({ along: 0, across: 0 }, [])).toBeNull();
  });

  it("runs at the ball at a fielder's pace and stops on it", () => {
    const from = { along: 0, across: 0 };
    const to = { along: 30, across: 0 };
    const after = stepToward(from, to, CHASE_SPEED, 1000);
    expect(after.along).toBeCloseTo(6.5, 6);
    expect(after.across).toBe(0);
    // Never past it.
    expect(stepToward({ along: 29.9, across: 0 }, to, CHASE_SPEED, 1000)).toEqual(to);
    expect(stepToward(to, to, CHASE_SPEED, 16)).toEqual(to);
  });
});
