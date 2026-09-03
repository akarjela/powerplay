import { describe, expect, it } from "vitest";

import {
  MAX_BEARING, planDistance, planPosition, project, regionName, relativeToPath, shotBearing,
  travelledBearing,
} from "../src/game/physics/direction";
import type { Contact } from "../src/game/physics/direction";
import { BATTER_X, PX_PER_METRE } from "../src/game/config";

/**
 * The direction model, as arithmetic. Its one physical claim -- that meeting
 * the ball early sends it to leg and late to off -- is checked against the
 * real engine in physics.test.ts; here it is checked against itself.
 */

const contact = (over: Partial<Contact>): Contact => ({
  aheadPx: 13, length: "good", line: "stumps", spray: 0, ...over,
});

describe("where a shot goes", () => {
  it("goes straight from the neutral contact for each length, on a stumps line", () => {
    // Neutral contacts were measured as the median of a harness sweep; a
    // stumps line carries a small leg bias, so "straight" means within it.
    for (const [length, ahead] of [["yorker", 18], ["full", 9], ["good", 13], ["short", 14]] as const) {
      expect(Math.abs(shotBearing(contact({ length, aheadPx: ahead })))).toBeLessThan(10);
    }
  });

  it("sends an early contact to leg and a late one to off", () => {
    const early = shotBearing(contact({ aheadPx: 13 + 25 }));
    const late = shotBearing(contact({ aheadPx: 13 - 25 }));
    expect(early).toBeGreaterThan(30);
    expect(late).toBeLessThan(-30);
  });

  it("is monotone in the timing", () => {
    let previous = -Infinity;
    for (let ahead = -30; ahead <= 60; ahead += 5) {
      const bearing = shotBearing(contact({ aheadPx: ahead }));
      expect(bearing).toBeGreaterThanOrEqual(previous);
      previous = bearing;
    }
  });

  it("lets the line pull the shot toward its own side", () => {
    const leg = shotBearing(contact({ line: "leg" }));
    const wide = shotBearing(contact({ line: "wide-off" }));
    expect(leg).toBeGreaterThan(wide + 30);
  });

  it("never claims a direction behind the keeper", () => {
    expect(shotBearing(contact({ aheadPx: 500, spray: 1 }))).toBe(MAX_BEARING);
    expect(shotBearing(contact({ aheadPx: -500, spray: -1 }))).toBe(-MAX_BEARING);
  });

  it("scatters a little, and only a little", () => {
    const spread = shotBearing(contact({ spray: 1 })) - shotBearing(contact({ spray: -1 }));
    expect(spread).toBeGreaterThan(5);
    expect(spread).toBeLessThan(30);
  });
});

describe("a ball the physics sent backward", () => {
  it("is reflected behind square", () => {
    expect(travelledBearing(-10, 20)).toBe(160);
    expect(travelledBearing(-10, -40)).toBe(-140);
  });

  it("stays where it was if it was already behind square", () => {
    expect(travelledBearing(-10, 120)).toBe(120);
  });

  it("is left alone when the ball went forward", () => {
    expect(travelledBearing(30, 20)).toBe(20);
    expect(travelledBearing(30, 120)).toBe(120);
  });
});

describe("the plan", () => {
  it("puts a straight hit straight and a square hit square", () => {
    expect(planPosition(40, 0)).toEqual({ along: 40, across: 0 });
    const square = planPosition(40, 90);
    expect(square.along).toBeCloseTo(0);
    expect(square.across).toBeCloseTo(40);
  });

  it("measures the miss from a ball's path", () => {
    // A fielder 5m to the leg of a straight drive, 30m out.
    const { offLine, alongLine } = relativeToPath({ along: 30, across: 5 }, 0);
    expect(offLine).toBeCloseTo(5);
    expect(alongLine).toBeCloseTo(30);
    // The same fielder, seen from a drive aimed straight at him.
    const dead = relativeToPath({ along: 30, across: 5 }, (Math.atan2(5, 30) * 180) / Math.PI);
    expect(dead.offLine).toBeCloseTo(0);
  });

  it("knows how far apart two points are", () => {
    expect(planDistance({ along: 0, across: 0 }, { along: 3, across: 4 })).toBe(5);
  });
});

describe("the side-on screen", () => {
  it("projects the along component honestly and the across as a small cue", () => {
    const straight = project(40, 0);
    expect(straight.x).toBeCloseTo(BATTER_X + 40 * PX_PER_METRE);
    expect(straight.depthY).toBeCloseTo(0);

    // Deep square leg, 58m out, has to stay on the grass below the stands
    // (95px); deep point, 60m the other way, has to stay above the scoreboard
    // strip (58px). Those two edges are what the asymmetric cue is for.
    const leg = project(58, 90);
    expect(leg.x).toBeCloseTo(BATTER_X);
    expect(leg.depthY).toBeLessThan(0);
    expect(Math.abs(leg.depthY)).toBeLessThan(95);
    expect(leg.scale).toBeLessThan(1);

    const off = project(60, -90);
    expect(off.depthY).toBeGreaterThan(0);
    expect(off.depthY).toBeLessThan(58);
    expect(off.scale).toBeGreaterThan(1);
  });
});

describe("naming the region", () => {
  it("uses the conventional names for a right-hander", () => {
    expect(regionName(20, 60)).toBe("long-on");
    expect(regionName(20, 20)).toBe("mid-on");
    expect(regionName(-50, 60)).toBe("deep cover");
    expect(regionName(50, 20)).toBe("mid-wicket");
    expect(regionName(-88, 20)).toBe("point");
    expect(regionName(125, 50)).toBe("deep fine leg");
    expect(regionName(-125, 20)).toBe("third man");
  });
});
