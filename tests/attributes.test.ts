import { describe, expect, it } from "vitest";

import { Headless, swing } from "./headless";
import { makeRng } from "../src/sim/rng";
import { bowl } from "../src/sim/delivery";
import { fieldFor } from "../src/game/physics/field";
import { contactDamping, powerFactor } from "../src/game/physics/swing";
import { MAX_SWING_SPEED } from "../src/game/config";
import type { Stance } from "../src/game/config";
import type { Bowler } from "../src/sim/player";

/**
 * Your batters' power at the crease, measured through the harness.
 *
 * Same sweep as physics.test.ts -- the random player, the same seed for each
 * side of the A/B so the deliveries and the swings are identical and only
 * the batter differs. Power should move the boundary rate and nothing should
 * move at average, because the whole physics was tuned there. Technique was
 * tried two ways and measured inert or wrong; the story is in swing.ts.
 * MEASURE=1 prints the table.
 */

const RANA: Bowler = { id: "rana", name: "Rana", pace: 62, accuracy: 64, movement: 58, variation: 55 };
const STANCES: Stance[] = ["front", "back", "neutral"];
const measure = process.env.MEASURE === "1";

function sweep(seed: string, balls: number, power: number) {
  const world = new Headless();
  const rng = makeRng(seed);
  const field = fieldFor("middle");
  const out = [];
  for (let i = 0; i < balls; i++) {
    const delivery = bowl(RANA, "middle", rng);
    const stance = rng.pick(STANCES);
    const player = { ...swing(stance, rng.range(260, 560), rng.range(5, 130)), power };
    const played = world.play(delivery, player, field, rng);
    if (!delivery.illegal) out.push(played);
  }
  return out;
}

const share = (n: number, of: number) => (of ? n / of : 0);

describe("attributes in the physics", () => {
  it("are centred on the average batter", () => {
    expect(powerFactor(0.5)).toBeCloseTo(1, 9);
    expect(contactDamping(MAX_SWING_SPEED)).toBeCloseTo(1.0, 9);
    expect(contactDamping(0)).toBeCloseTo(0.55, 9);
    // A block stays a block whoever plays it, near enough.
    expect(contactDamping(0, 1)).toBeLessThan(0.65);
  });

  const strong = sweep("attr-sweep", 500, 0.92);
  const weak = sweep("attr-sweep", 500, 0.12);

  const stats = (label: string, xs: typeof strong) => ({
    label,
    contact: share(xs.filter((p) => p.contact).length, xs.length),
    boundaries: share(xs.filter((p) => p.outcome.runs >= 4).length, xs.length),
    sixes: share(xs.filter((p) => p.outcome.runs === 6).length, xs.length),
    runsPerBall: xs.reduce((a, p) => a + p.outcome.runs, 0) / xs.length,
    wickets: share(xs.filter((p) => p.outcome.wicket).length, xs.length),
  });

  it("prints the A/B", () => {
    if (measure) console.table([stats("power 92", strong), stats("power 12", weak)]);
    expect(strong.length).toBeGreaterThan(450);
  });

  it("power clears the rope more often, and meets the ball no more often", () => {
    const a = stats("", strong);
    const b = stats("", weak);
    // Measured: boundaries 21.1% against 17.0%, sixes 3.5% against 2.3%,
    // 1.49 runs a ball against 1.32. Contact is identical by construction:
    // power acts after the bat has met the ball.
    expect(a.boundaries).toBeGreaterThan(b.boundaries + 0.02);
    expect(a.sixes).toBeGreaterThan(b.sixes);
    expect(a.runsPerBall).toBeGreaterThan(b.runsPerBall + 0.08);
    expect(a.contact).toBe(b.contact);
  });
});
