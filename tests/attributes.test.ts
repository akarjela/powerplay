import { describe, expect, it } from "vitest";

import { Headless, swing } from "./headless";
import { makeRng } from "../src/sim/rng";
import { bowl } from "../src/sim/delivery";
import { fieldFor } from "../src/game/physics/field";
import { batSpeedFactor, contactDamping, nextAngularVelocity, powerFactor } from "../src/game/physics/swing";
import { MAX_SWING_SPEED } from "../src/game/config";
import type { Stance } from "../src/game/config";
import type { Bowler } from "../src/sim/player";

const RANA: Bowler = { id: "rana", name: "Rana", pace: 62, accuracy: 64, movement: 58, variation: 55 };
const STANCES: Stance[] = ["front", "back", "neutral"];
const measure = process.env.MEASURE === "1";

function sweep(seed: string, balls: number, power: number, technique = 0.5) {
  const world = new Headless();
  const rng = makeRng(seed);
  const field = fieldFor("middle");
  const out = [];
  for (let i = 0; i < balls; i++) {
    const delivery = bowl(RANA, "middle", rng);
    const stance = rng.pick(STANCES);
    const player = { ...swing(stance, rng.range(260, 560), rng.range(5, 130)), power, technique };
    const played = world.play(delivery, player, field, rng);
    if (!delivery.illegal) out.push(played);
  }
  return out;
}

const share = (n: number, of: number) => (of ? n / of : 0);

describe("attributes in the physics", () => {
  it("are centred on the average batter", () => {
    expect(powerFactor(0.5)).toBeCloseTo(1, 9);
    expect(batSpeedFactor(0.5)).toBeCloseTo(1, 9);
    expect(batSpeedFactor(0)).toBeCloseTo(0.7, 9);
    expect(batSpeedFactor(1)).toBeCloseTo(1.1, 9);
    expect(contactDamping(MAX_SWING_SPEED)).toBeCloseTo(1.0, 9);
    expect(contactDamping(0)).toBeCloseTo(0.55, 9);

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

    expect(a.boundaries).toBeGreaterThan(b.boundaries + 0.02);
    expect(a.sixes).toBeGreaterThan(b.sixes);
    expect(a.runsPerBall).toBeGreaterThan(b.runsPerBall + 0.08);
    expect(a.contact).toBe(b.contact);
  });
});

describe("technique as the speed of the bat", () => {
  const sharp = sweep("tech-sweep", 500, 0.5, 0.92);
  const slow = sweep("tech-sweep", 500, 0.5, 0.12);

  const stats = (label: string, xs: typeof sharp) => ({
    label,
    contact: share(xs.filter((p) => p.contact).length, xs.length),
    bowled: share(xs.filter((p) => p.outcome.wicket === "bowled" || p.outcome.wicket === "lbw").length, xs.length),
    boundaries: share(xs.filter((p) => p.outcome.runs >= 4).length, xs.length),
    runsPerBall: xs.reduce((a, p) => a + p.outcome.runs, 0) / xs.length,
    wickets: share(xs.filter((p) => p.outcome.wicket).length, xs.length),
    effort: xs.reduce((a, p) => a + p.effort, 0) / xs.length,
  });

  it("prints the A/B", () => {
    if (measure) console.table([stats("technique 92", sharp), stats("technique 12", slow)]);
    expect(sharp.length).toBeGreaterThan(450);
  });

  const framesToReach = (speed: number) => {
    let angle = 0;
    let velocity = 0;
    const target = Math.PI / 2;
    for (let frame = 1; frame < 200; frame++) {
      velocity = nextAngularVelocity(angle, velocity, target, speed);
      angle += velocity;
      if (Math.abs(target - angle) < 0.05) return frame;
    }
    return 200;
  };

  it("a slow bat takes longer to reach the pointer", () => {
    const sharp = framesToReach(batSpeedFactor(0.92));
    const average = framesToReach(1);
    const slow = framesToReach(batSpeedFactor(0.12));
    expect(slow).toBeGreaterThan(average);
    expect(sharp).toBeLessThanOrEqual(average);
    expect(slow - sharp).toBeGreaterThanOrEqual(3);
  });

  it("a slow bat scores less without missing more", () => {
    const a = stats("", sharp);
    const b = stats("", slow);
    expect(b.contact).toBeGreaterThanOrEqual(a.contact - 0.01);
    expect(a.runsPerBall).toBeGreaterThan(b.runsPerBall + 0.15);
    expect(a.boundaries).toBeGreaterThan(b.boundaries + 0.03);
  });
});
