import { describe, expect, it } from "vitest";

import { BATTER_X, PX_PER_METRE } from "../src/game/config";
import { FIELD, catchableBy, metresDownfield, resolveGroundedBall } from "../src/game/physics/field";
import { countsAsBall, runsAgainstBowler } from "../src/sim/types";
import { GROUND_Y } from "../src/game/config";

/**
 * Outcome resolution is pure, so it is testable without a browser or a canvas.
 * The Phaser half -- swing feel -- is not, and is verified by playing. Keeping
 * the boundary between the two exactly here is the point of the architecture.
 */

const atMetres = (metres: number) => BATTER_X + metres * PX_PER_METRE;

describe("scoring a struck ball", () => {
  it("gives six for clearing the rope on the full", () => {
    expect(resolveGroundedBall(atMetres(72), true).runs).toBe(6);
  });

  it("gives four for reaching the rope along the ground", () => {
    const outcome = resolveGroundedBall(atMetres(70), false);
    expect(outcome.runs).toBe(4);
    expect(outcome.wicket).toBeUndefined();
  });

  it("scales runs with distance, and gives nothing for a defensive push", () => {
    expect(resolveGroundedBall(atMetres(4), false).runs).toBe(0);
    expect(resolveGroundedBall(atMetres(15), false).runs).toBe(1);
    expect(resolveGroundedBall(atMetres(32), false).runs).toBe(2);
    // The three threshold moved 45m -> 52m when the shot distribution was
    // measured: threes were coming out at 5% of shots against about 1% in real
    // T20, where they are rarer than sixes. 48m is now two.
    expect(resolveGroundedBall(atMetres(48), false).runs).toBe(2);
    expect(resolveGroundedBall(atMetres(55), false).runs).toBe(3);
  });

  it("never returns 5, which is not a score off the bat", () => {
    for (let d = 0; d <= 80; d += 1) {
      expect([0, 1, 2, 3, 4, 6]).toContain(resolveGroundedBall(atMetres(d), false).runs);
    }
  });
});

describe("catching", () => {
  const headHeight = GROUND_Y - 20;

  it("catches a ball reaching a fielder below head height", () => {
    const midOn = FIELD.find((f) => f.name === "mid-on")!;
    expect(catchableBy(atMetres(midOn.distance), headHeight, true)?.name).toBe("mid-on");
  });

  it("does not catch a ball that has bounced since the shot", () => {
    // The definition of a catch, and it was missing: 66% of every shot in the
    // game was a catch because a ball rolling past a fielder counted.
    const midOn = FIELD.find((f) => f.name === "mid-on")!;
    expect(catchableBy(atMetres(midOn.distance), headHeight, false)).toBeNull();
  });

  it("does not catch a ball skidding along the turf", () => {
    const midOn = FIELD.find((f) => f.name === "mid-on")!;
    // A rolling ball sits one radius up. That used to be a catch.
    expect(catchableBy(atMetres(midOn.distance), GROUND_Y - 6, true)).toBeNull();
  });

  it("lets a six sail over the fielder rather than being caught", () => {
    const longOn = FIELD.find((f) => f.name === "long-on")!;
    expect(catchableBy(atMetres(longOn.distance), GROUND_Y - 300, true)).toBeNull();
  });

  it("does not catch a ball that has already landed", () => {
    const midOff = FIELD.find((f) => f.name === "mid-off")!;
    expect(catchableBy(atMetres(midOff.distance), GROUND_Y, true)).toBeNull();
  });

  it("does not catch in the gaps between fielders", () => {
    expect(catchableBy(atMetres(38), headHeight, true)).toBeNull();
  });
});

describe("the sim seam", () => {
  it("counts a legal delivery and excludes a wide", () => {
    expect(countsAsBall({ runs: 1, description: "" })).toBe(true);
    expect(countsAsBall({ runs: 0, extra: "wide", description: "" })).toBe(false);
  });

  it("charges wides to the bowler but not byes", () => {
    expect(runsAgainstBowler({ runs: 0, extra: "wide", description: "" })).toBe(1);
    expect(runsAgainstBowler({ runs: 4, extra: "bye", description: "" })).toBe(0);
    expect(runsAgainstBowler({ runs: 4, description: "" })).toBe(4);
  });
});

describe("distance mapping", () => {
  it("measures from the striker's stumps", () => {
    expect(metresDownfield(BATTER_X)).toBe(0);
    expect(metresDownfield(atMetres(50))).toBeCloseTo(50);
  });
});
