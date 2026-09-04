import { lbw, runOut, runOutChance } from "../src/game/physics/field";
import { describe, expect, it } from "vitest";

import { BATTER_X, GROUND_Y, PX_PER_METRE } from "../src/game/config";
import {
  RING, catchableBy, fieldFor, interceptedBy, judgeBall, metresDownfield, predictRest,
  resolveGroundedBall, rollingVelocity,
} from "../src/game/physics/field";
import type { BallState, Fielder } from "../src/game/physics/field";
import { countsAsBall, runsAgainstBowler } from "../src/sim/types";
import type { Phase } from "../src/sim/delivery";

const atMetres = (metres: number) => BATTER_X + metres * PX_PER_METRE;
const field = fieldFor("middle");
const named = (name: string): Fielder => {
  const fielder = field.find((f) => f.name === name);
  if (!fielder) throw new Error(`no ${name} in the middle-overs field`);
  return fielder;
};
const nobody: Fielder[] = [];

describe("the field settings", () => {
  it("puts nine men out in every phase", () => {
    for (const phase of ["powerplay", "middle", "death"] as Phase[]) {
      expect(fieldFor(phase)).toHaveLength(9);
    }
  });

  it("obeys the powerplay restriction: two outside the circle, then five", () => {
    const outside = (phase: Phase) => fieldFor(phase).filter((f) => f.distance > RING).length;
    expect(outside("powerplay")).toBeLessThanOrEqual(2);
    expect(outside("middle")).toBeLessThanOrEqual(5);
    expect(outside("death")).toBeLessThanOrEqual(5);

    expect(outside("middle")).toBeGreaterThanOrEqual(4);
  });

  it("covers both sides of the wicket", () => {
    for (const phase of ["powerplay", "middle", "death"] as Phase[]) {
      const f = fieldFor(phase);
      expect(f.some((p) => p.bearing > 30)).toBe(true);
      expect(f.some((p) => p.bearing < -30)).toBe(true);
    }
  });
});

describe("scoring a struck ball", () => {
  it("gives six for clearing the rope on the full", () => {
    expect(resolveGroundedBall(72, 0, true, 0, field).runs).toBe(6);
  });

  it("gives four for reaching the rope along the ground through a gap", () => {
    const outcome = resolveGroundedBall(70, 0, false, 0, field);
    expect(outcome.runs).toBe(4);
    expect(outcome.wicket).toBeUndefined();
  });

  it("scales runs with distance in the gaps, and gives nothing for a defensive push", () => {
    expect(resolveGroundedBall(4, 0, false, 0, nobody).runs).toBe(0);
    expect(resolveGroundedBall(15, 0, false, 0, nobody).runs).toBe(1);
    expect(resolveGroundedBall(32, 0, false, 0, nobody).runs).toBe(2);

    expect(resolveGroundedBall(48, 0, false, 0, nobody).runs).toBe(2);
    expect(resolveGroundedBall(58, 0, false, 0, nobody).runs).toBe(3);
  });

  it("never returns 5, which is not a score off the bat", () => {
    for (let d = 0; d <= 80; d += 1) {
      for (const bearing of [-120, -60, 0, 45, 90]) {
        expect([0, 1, 2, 3, 4, 6]).toContain(resolveGroundedBall(d, bearing, false, 0, field).runs);
      }
    }
  });

  it("is a dot straight to a ring fielder, however hard it was hit", () => {
    const midOff = named("mid-off");
    const outcome = resolveGroundedBall(68, midOff.bearing, false, 0, field);
    expect(outcome.runs).toBe(0);
    expect(outcome.description).toContain("mid-off");
  });

  it("is a single to a man in the deep", () => {
    const longOn = named("long-on");
    expect(resolveGroundedBall(70, longOn.bearing, false, 0, field).runs).toBe(1);
  });

  it("is not fielded by a man the ball was lofted over", () => {
    const midOff = named("mid-off");
    const pastHim = resolveGroundedBall(50, midOff.bearing - 12, false, 40, field);
    expect(pastHim.description).not.toContain("mid-off");
  });
});

describe("cutting a ball off", () => {
  it("lets the nearest man on the line take it", () => {
    const midOff = named("mid-off");
    expect(interceptedBy(0, 70, midOff.bearing, field)?.name).toBe("mid-off");
  });

  it("gives a deep fielder more ground to cover the further the ball travels", () => {
    const deepCover = named("deep cover");

    expect(interceptedBy(0, 68, deepCover.bearing + 12, field)?.name).toBe("deep cover");
    expect(interceptedBy(50, 68, deepCover.bearing + 12, field)).toBeNull();
  });

  it("finds nobody in a genuine gap", () => {
    expect(interceptedBy(30, 45, -72, field)).toBeNull();
  });
});

describe("catching", () => {
  const head = 20;

  it("catches a ball reaching a fielder below head height", () => {
    const midOn = named("mid-wicket");
    expect(catchableBy(midOn.distance, midOn.bearing, head, true, 0, field)?.name).toBe("mid-wicket");
  });

  it("does not catch a ball that has bounced since the shot", () => {
    const midOn = named("mid-wicket");
    expect(catchableBy(midOn.distance, midOn.bearing, head, false, 0, field)).toBeNull();
  });

  it("does not catch a ball skidding along the turf", () => {
    const midOn = named("mid-wicket");
    expect(catchableBy(midOn.distance, midOn.bearing, 6, true, 0, field)).toBeNull();
  });

  it("lets a six sail over the fielder rather than being caught", () => {
    const longOn = named("long-on");
    expect(catchableBy(longOn.distance, longOn.bearing, 300, true, 0, field)).toBeNull();
  });

  it("does not catch at the same distance on the wrong side of the ground", () => {
    const longOn = named("long-on");
    expect(catchableBy(longOn.distance, -40, head, true, 0, field)).toBeNull();
  });

  it("gives a fielder ground to cover while the ball is in the air", () => {
    const longOn = named("long-on");
    const sixMetresWide = longOn.bearing + (6 / longOn.distance) * (180 / Math.PI);
    expect(catchableBy(longOn.distance, sixMetresWide, head, true, 0, field)).toBeNull();
    expect(catchableBy(longOn.distance, sixMetresWide, head, true, 1500, field)?.name).toBe("long-on");
  });
});

describe("rolling", () => {
  it("slows a rolling ball toward a stop", () => {
    const slower = rollingVelocity(3);
    expect(slower).toBeLessThan(3);
    expect(slower).toBeGreaterThan(0);
    expect(rollingVelocity(-3)).toBeCloseTo(-slower);
    expect(rollingVelocity(0.0001)).toBe(0);
  });

  it("predicts a rest point that grows with speed and never shrinks the distance", () => {
    expect(predictRest(20, 0)).toBe(20);
    expect(predictRest(20, 2)).toBeGreaterThan(20);
    expect(predictRest(20, 4)).toBeGreaterThan(predictRest(20, 2));

    const twentyMps = 20 * (PX_PER_METRE / 60);
    expect(predictRest(0, twentyMps)).toBeGreaterThan(15);
    expect(predictRest(0, twentyMps)).toBeLessThan(45);
  });
});

describe("the judge", () => {
  const live = (over: Partial<BallState>): BallState => ({
    x: atMetres(10), y: GROUND_Y - 40, vx: -5, vy: 0,
    struck: false, bouncedAfterStrike: false, airborneMs: 0, bearing: 0, landingM: 0, field,
    ...over,
  });

  it("says nothing while the ball is still live", () => {
    expect(judgeBall(live({}))).toBeNull();
  });

  it("bowls a ball that hits the stumps, and not one that passes over them", () => {
    expect(judgeBall(live({ x: BATTER_X, y: GROUND_Y - 10 }))?.wicket).toBe("bowled");
    expect(judgeBall(live({ x: BATTER_X, y: GROUND_Y - 50 }))).toBeNull();
  });

  it("never bowls a wide, and scores it as one when it reaches the keeper", () => {
    expect(judgeBall(live({ x: BATTER_X, y: GROUND_Y - 10, illegal: "wide" }))).toBeNull();
    const called = judgeBall(live({ x: BATTER_X - 100, illegal: "wide" }));
    expect(called?.extra).toBe("wide");
    expect(countsAsBall(called!)).toBe(false);
    expect(runsAgainstBowler(called!)).toBe(1);
  });

  it("re-scores a no-ball: the extra on top, and the batter cannot be out", () => {
    const bowled = judgeBall(live({ x: BATTER_X, y: GROUND_Y - 10, illegal: "no-ball" }));
    expect(bowled?.wicket).toBeUndefined();
    expect(bowled?.extra).toBe("no-ball");
    expect(bowled?.description).toContain("No ball");
  });

  it("judges a struck ball the moment it is rolling, from where it will stop", () => {
    const rolling = judgeBall(live({
      struck: true, bouncedAfterStrike: true, x: atMetres(30), y: GROUND_Y - 6, vx: 1.2, vy: 0, landingM: 3,
    }));
    expect(rolling?.runs).toBe(2);
  });

  it("gives six over the rope on the full and four along the ground", () => {
    const over = judgeBall(live({ struck: true, x: atMetres(69), y: GROUND_Y - 100, vx: 5, vy: 1 }));
    expect(over?.runs).toBe(6);
    const along = judgeBall(live({
      struck: true, bouncedAfterStrike: true, x: atMetres(69), y: GROUND_Y - 6, vx: 3, vy: 0, landingM: 20,
    }));
    expect(along?.runs).toBe(4);
  });

  it("treats a ball hit backward as one behind square", () => {
    const behind = judgeBall(live({
      struck: true, bouncedAfterStrike: true, x: BATTER_X - 30 * PX_PER_METRE, y: GROUND_Y - 6,
      vx: -1, vy: 0, bearing: 20, landingM: 5,
    }));
    expect(behind?.description).toMatch(/fine leg/);
  });
});

describe("distance mapping", () => {
  it("measures from the striker's stumps", () => {
    expect(metresDownfield(BATTER_X)).toBe(0);
    expect(metresDownfield(atMetres(50))).toBeCloseTo(50);
  });
});

describe("lbw and the run-out roll", () => {
  it("is lbw, not bowled, when the batter is forward and beaten on the stumps", () => {
    const base = {
      x: BATTER_X, y: GROUND_Y - 10, vx: -5, vy: 0, struck: false, bouncedAfterStrike: false,
      airborneMs: 0, bearing: 0 as const, landingM: 0, field: fieldFor("middle"),
    };
    expect(judgeBall({ ...base, padded: true })?.wicket).toBe("lbw");
    expect(judgeBall({ ...base, padded: false })?.wicket).toBe("bowled");
    expect(judgeBall({ ...base })?.wicket).toBe("bowled");
    expect(lbw().runs).toBe(0);
  });

  it("only risks a run-out on a run, and takes the last run back", () => {
    expect(runOutChance(0)).toBe(0);
    expect(runOutChance(4)).toBe(0);
    expect(runOutChance(3)).toBeGreaterThan(runOutChance(2));
    expect(runOutChance(2)).toBeGreaterThan(runOutChance(1));
    const two = { runs: 2 as const, description: "two" };
    expect(runOut(two, 0.999)).toEqual(two);
    const out = runOut(two, 0);
    expect(out.wicket).toBe("run-out");
    expect(out.runs).toBe(1);
    expect(runOut({ runs: 0, wicket: "bowled", description: "b" }, 0).wicket).toBe("bowled");
    expect(runOut({ runs: 1, extra: "wide", description: "w" }, 0).wicket).toBeUndefined();
  });
});
