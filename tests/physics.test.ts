import { describe, expect, it } from "vitest";

import { Headless, swing } from "./headless";
import { makeRng } from "../src/sim/rng";
import { bowl } from "../src/sim/delivery";
import type { Delivery, Length } from "../src/sim/delivery";
import { fieldFor } from "../src/game/physics/field";
import type { Stance } from "../src/game/config";
import type { Bowler } from "../src/sim/player";

/**
 * The physics path, measured.
 *
 * Everything else in `tests/` is about the pure simulation. This is the one
 * place the *game* -- the Matter world the player actually swings a bat in --
 * is played headlessly and its outcomes counted, which is how the direction
 * model was fitted and how the catch rate is kept honest.
 *
 * The player is deliberately dumb: a random stance, a random swing time, a
 * random aim past the ball. A cleverer player aimed at the contact angle and
 * reported the game unplayable; the broad sweep was the honest measurement.
 * The bands here are wide because that player is bad, not because the game is.
 *
 * Run with MEASURE=1 to print the tables.
 */

const RANA: Bowler = { id: "rana", name: "Rana", pace: 62, accuracy: 64, movement: 58, variation: 55 };
const STANCES: Stance[] = ["front", "back", "neutral"];
const LENGTHS: Length[] = ["yorker", "full", "good", "short"];

const measure = process.env.MEASURE === "1";
const log = (...args: unknown[]) => measure && console.log(...args);

interface Ball {
  delivery: Delivery;
  stance: Stance;
  played: ReturnType<Headless["play"]>;
}

function sweep(seed: string, balls: number): Ball[] {
  const world = new Headless();
  const rng = makeRng(seed);
  const field = fieldFor("middle");
  const out: Ball[] = [];

  for (let i = 0; i < balls; i++) {
    const delivery = bowl(RANA, "middle", rng);
    const stance = rng.pick(STANCES);
    // Pushes as well as slogs: a blade target of 5 degrees barely moves the
    // bat, 130 is a full swing through the line.
    const player = swing(stance, rng.range(260, 560), rng.range(5, 130));
    out.push({ delivery, stance, played: world.play(delivery, player, field, rng) });
  }
  return out;
}

const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
};
const share = (n: number, of: number) => (of ? n / of : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

describe("the physics path", () => {
  const balls = sweep("physics-sweep", 600);
  const legal = balls.filter((b) => !b.delivery.illegal);
  const struck = legal.filter((b) => b.played.contact);

  it("still bowls the ladder the footwork was built on", () => {
    // The four lengths must keep pitching in distinct places at the calibrated
    // pace; the whole read-the-bounce mechanic is this ordering.
    // Only balls that pitched before anything happened to them count; a
    // yorker met on the full has no pitch, and a struck ball never crosses
    // the pivot to have its arrival height read.
    const at138 = LENGTHS.map((length) => {
      const same = legal.filter((b) => b.delivery.length === length && Math.abs(b.delivery.speed - 138) < 6);
      return {
        length,
        pitched: median(same.map((b) => b.played.pitchedM).filter((m) => m > 0)),
        height: median(same.map((b) => b.played.heightAtBatPx).filter((h) => h > 0)),
      };
    });
    log("pitch ladder near 138kph:", at138);
    const [yorker, full, good, short] = at138.map((l) => l.pitched);
    expect(yorker).toBeLessThan(full);
    expect(full).toBeLessThan(good);
    expect(good).toBeLessThan(short);
  });

  it("makes contact often enough to be a game", () => {
    log(`contact on ${pct(share(struck.length, legal.length))} of legal balls`);
    expect(share(struck.length, legal.length)).toBeGreaterThan(0.35);
  });

  it("sends shots to both sides of the wicket, from the timing", () => {
    const bearings = struck.map((b) => b.played.bearing);
    const leg = bearings.filter((d) => d > 15).length;
    const off = bearings.filter((d) => d < -15).length;
    const straight = bearings.length - leg - off;
    log(`direction: leg ${pct(share(leg, bearings.length))}  straight ${pct(share(straight, bearings.length))}  off ${pct(share(off, bearings.length))}`);

    for (const length of LENGTHS) {
      const same = struck.filter((b) => b.delivery.length === length);
      log(`  ${length.padEnd(6)} contacts ${String(same.length).padStart(3)}  median ahead ${median(same.map((b) => b.played.contact!.aheadPx)).toFixed(1)}px  median bearing ${median(same.map((b) => b.played.bearing)).toFixed(0)}`);
    }

    // Neither side may be a rounding error, and neither may own the game.
    expect(share(leg, bearings.length)).toBeGreaterThan(0.2);
    expect(share(off, bearings.length)).toBeGreaterThan(0.2);
    expect(share(straight, bearings.length)).toBeGreaterThan(0.1);
  });

  it("plays early to leg and late to off", () => {
    // The direction model's one physical claim, checked against the engine
    // rather than against itself: for one length, earlier contact -> more leg.
    const good = struck.filter((b) => b.delivery.length === "good" && b.delivery.line === "stumps");
    const early = good.filter((b) => b.played.contact!.aheadPx > 28);
    const late = good.filter((b) => b.played.contact!.aheadPx < 4);
    log(`good length on the stumps: early(${early.length}) median bearing ${median(early.map((b) => b.played.bearing)).toFixed(0)}, late(${late.length}) ${median(late.map((b) => b.played.bearing)).toFixed(0)}`);
    if (early.length >= 5 && late.length >= 5) {
      expect(median(early.map((b) => b.played.bearing))).toBeGreaterThan(median(late.map((b) => b.played.bearing)));
    }
  });

  it("does not catch most of what is hit", () => {
    const outcomes = struck.map((b) => b.played.outcome);
    const caught = outcomes.filter((o) => o.wicket === "caught").length;
    const runs = [0, 1, 2, 3, 4, 6].map((r) => outcomes.filter((o) => !o.wicket && o.runs === r).length);
    log(`struck ${struck.length}: caught ${pct(share(caught, struck.length))}  runs 0:${runs[0]} 1:${runs[1]} 2:${runs[2]} 3:${runs[3]} 4:${runs[4]} 6:${runs[5]}`);
    log(`fielded: ${outcomes.filter((o) => o.description.includes("straight to") || o.description.includes("to ")).length}`);
    // Was 21% on the one-line field. Real cricket is nearer 5%; measured 4.8%
    // on this sweep and 9% when every swing is a slog, so the line sits above
    // the slogger and well under the old field.
    expect(share(caught, struck.length)).toBeLessThan(0.14);
    // And it must still be possible to be caught, or fielders are decoration.
    expect(caught).toBeGreaterThan(0);
  });

  it("scores a spread of runs rather than only boundaries", () => {
    const scoring = struck.filter((b) => !b.played.outcome.wicket);
    const singles = scoring.filter((b) => b.played.outcome.runs === 1 || b.played.outcome.runs === 2).length;
    const boundaries = scoring.filter((b) => b.played.outcome.runs >= 4).length;
    log(`ones and twos ${pct(share(singles, scoring.length))}, boundaries ${pct(share(boundaries, scoring.length))}`);
    // Measured: ones and twos 43% of scoring shots, boundaries 22%. Before
    // the outfield slowed a rolling ball, boundaries were 56% -- every ground
    // shot that found a gap reached the rope.
    expect(share(singles, scoring.length)).toBeGreaterThan(0.2);
    expect(share(boundaries, scoring.length)).toBeGreaterThan(0.05);
    expect(share(boundaries, scoring.length)).toBeLessThan(0.45);
  });

  it("bowls the batter who misses a straight one, and only sometimes", () => {
    const missed = legal.filter((b) => !b.played.contact);
    const bowled = missed.filter((b) => b.played.outcome.wicket === "bowled").length;
    log(`missed ${missed.length}: bowled ${pct(share(bowled, missed.length))}`);
    expect(share(bowled, missed.length)).toBeGreaterThan(0.05);
    expect(share(bowled, missed.length)).toBeLessThan(0.6);
  });

  it("scores wides and no-balls as extras, the way the simulation does", () => {
    const wides = balls.filter((b) => b.delivery.illegal === "wide");
    const noBalls = balls.filter((b) => b.delivery.illegal === "no-ball");
    log(`wides ${wides.length}, no-balls ${noBalls.length}`);
    for (const b of wides) {
      expect(b.played.outcome.extra).toBe("wide");
      expect(b.played.contact).toBeUndefined();
    }
    for (const b of noBalls) {
      expect(b.played.outcome.extra).toBe("no-ball");
      expect(b.played.outcome.wicket).toBeUndefined();
    }
  });

  it("resolves every ball inside three seconds", () => {
    const slowest = Math.max(...balls.map((b) => b.played.elapsedMs));
    log(`slowest ball ${slowest.toFixed(0)}ms`);
    expect(slowest).toBeLessThan(3000);
    expect(balls.some((b) => b.played.outcome.description === "harness timeout")).toBe(false);
  });
});
