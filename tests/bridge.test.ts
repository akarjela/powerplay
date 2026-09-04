import { describe, expect, it } from "vitest";

import { Headless, swing } from "./headless";
import { makeRng } from "../src/sim/rng";
import { bowl } from "../src/sim/delivery";
import { averageBatter } from "../src/sim/player";
import { resolveShot } from "../src/sim/outcome";
import { bridge, commitmentOf, footworkOf, shotFromPlay } from "../src/sim/bridge";
import type { Commitment } from "../src/sim/shot";
import { fieldFor } from "../src/game/physics/field";
import type { Stance } from "../src/game/config";
import type { Bowler } from "../src/sim/player";
import type { Outcome } from "../src/sim/types";

const RANA: Bowler = { id: "rana", name: "Rana", pace: 62, accuracy: 64, movement: 58, variation: 55 };
const STANCES: Stance[] = ["front", "back", "neutral"];
const measure = process.env.MEASURE === "1";
const log = (...args: unknown[]) => measure && console.log(...args);

interface Pair {
  stance: Stance;
  effort: number;
  physics: Outcome;
  model: Outcome;
}

function pairs(seed: string, balls: number): Pair[] {
  const world = new Headless();
  const rng = makeRng(seed);
  const field = fieldFor("middle");
  const batter = averageBatter("avg", "Average");
  const out: Pair[] = [];
  for (let i = 0; i < balls; i++) {
    const delivery = bowl(RANA, "middle", rng);
    const stance = rng.pick(STANCES);
    const player = swing(stance, rng.range(260, 560), rng.range(5, 130));
    const played = world.play(delivery, player, field, rng);
    const play = { stance, effort: played.effort };
    const physics = bridge(played.outcome, delivery, play);
    if (delivery.illegal) continue;
    const model = resolveShot(batter, delivery, shotFromPlay(play), { phase: "middle", wicketsDown: 3, ballsFaced: 20 }, rng);
    out.push({ stance, effort: played.effort, physics, model });
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const share = (xs: Outcome[], f: (o: Outcome) => boolean) => (xs.length ? xs.filter(f).length / xs.length : NaN);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

describe("the bridge", () => {
  it("names the foot and the commitment from what the player did", () => {
    expect(footworkOf("front")).toBe("front");
    expect(footworkOf("back")).toBe("back");

    expect(footworkOf("neutral")).toBe("back");
    expect(commitmentOf(0)).toBe("defend");
    expect(commitmentOf(0.5)).toBe("rotate");
    expect(commitmentOf(1)).toBe("attack");
  });

  it("attaches a shot to every legal ball and none to an extra", () => {
    const rng = makeRng("bridge-shot");
    const delivery = bowl(RANA, "middle", rng);
    const legal = { ...delivery, illegal: undefined };
    const play = { stance: "front" as const, effort: 0.9 };
    expect(bridge({ runs: 4, description: "four" }, legal, play).shot).toEqual({ footwork: "front", commitment: "attack" });
    expect(bridge({ runs: 0, extra: "wide", description: "wide" }, { ...legal, illegal: "wide" }, play).shot).toBeUndefined();
    const out = bridge({ runs: 0, wicket: "bowled", description: "Bowled!" }, { ...legal, length: "yorker" }, { stance: "back", effort: 0.1 });
    expect(out.wicket).toBe("bowled");
    expect(out.runs).toBe(0);
    expect(out.description).toContain("Back foot to a yorker");
  });
});

describe("the two paths value a ball alike", () => {
  const all = pairs(process.env.BRIDGE_SEED ?? "bridge-sweep", Number(process.env.BRIDGE_BALLS ?? 1200));
  const physics = all.map((p) => p.physics);
  const model = all.map((p) => p.model);

  const table = (label: string, xs: Outcome[]) => ({
    label,
    balls: xs.length,
    runsPerBall: mean(xs.map((o) => o.runs)).toFixed(3),
    dots: pct(share(xs, (o) => o.runs === 0 && !o.wicket)),
    boundaries: pct(share(xs, (o) => o.runs >= 4)),
    wickets: pct(share(xs, (o) => Boolean(o.wicket))),
  });

  it("prints the comparison", () => {
    log("effort quantiles", [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => {
      const s = all.map((p) => p.effort).sort((a, b) => a - b);
      return `${q}: ${s[Math.floor(q * s.length)].toFixed(2)}`;
    }).join("  "));
    log("commitments", (["defend", "rotate", "attack"] as Commitment[]).map((c) => `${c} ${pct(share(physics, (o) => o.shot?.commitment === c))}`).join("  "));
    console.table([table("physics", physics), table("model", model)]);
    for (const c of ["defend", "rotate", "attack"] as Commitment[]) {
      const idx = all.map((p, i) => (p.physics.shot?.commitment === c ? i : -1)).filter((i) => i >= 0);
      console.table([
        table(`physics/${c}`, idx.map((i) => physics[i])),
        table(`model/${c}`, idx.map((i) => model[i])),
      ]);
    }
    expect(all.length).toBeGreaterThan(500);
  });

  it("gives every legal physics ball a shot", () => {
    expect(physics.every((o) => o.shot !== undefined)).toBe(true);
  });

  it("puts the random player's efforts across all three commitments", () => {
    for (const c of ["defend", "rotate", "attack"] as Commitment[]) {
      expect(share(physics, (o) => o.shot?.commitment === c)).toBeGreaterThan(0.12);
    }
  });

  it("values a ball in the same neighbourhood in aggregate", () => {
    const ratio = mean(physics.map((o) => o.runs)) / mean(model.map((o) => o.runs));
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.6);
    const wicketGap = Math.abs(share(physics, (o) => Boolean(o.wicket)) - share(model, (o) => Boolean(o.wicket)));
    expect(wicketGap).toBeLessThan(0.08);
    const boundaryGap = Math.abs(share(physics, (o) => o.runs >= 4) - share(model, (o) => o.runs >= 4));
    expect(boundaryGap).toBeLessThan(0.12);
  });

  it("ranks the commitments the same way on both paths", () => {
    const by = (xs: Outcome[], c: Commitment) => all.map((p, i) => (p.physics.shot?.commitment === c ? xs[i] : null)).filter((o): o is Outcome => o !== null);
    for (const xs of [physics, model]) {
      const runs = (["defend", "rotate", "attack"] as Commitment[]).map((c) => mean(by(xs, c).map((o) => o.runs)));
      expect(runs[0]).toBeLessThan(runs[1]);
      expect(runs[1]).toBeLessThan(runs[2]);
      const wickets = (["defend", "attack"] as Commitment[]).map((c) => share(by(xs, c), (o) => Boolean(o.wicket)));
      expect(wickets[0]).toBeLessThan(wickets[1]);
    }
  });
});
