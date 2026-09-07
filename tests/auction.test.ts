import { describe, expect, it } from "vitest";

import {
  MIN_BOWLERS, PURSE, SQUAD_SIZE, TIERS, baseOf, bid, ceiling, createAuction, currentLot, finish, isStarred, nextPrice, open, overall,
  owned, pass, passAll, poolFrom, rosters, skipToStar, star, tierOf, toSquad, worth, youCanBid,
} from "../src/sim/auction";
import type { Auction, PoolPlayer } from "../src/sim/auction";
import { FRANCHISES, franchiseById } from "../src/data/franchises";
import { createSeason, nextFixture, recordResult, simulateFixture, standings } from "../src/sim/tournament";
import { makeRng } from "../src/sim/rng";
import { simulateMatch } from "../src/sim/match";

const IDS = FRANCHISES.map((f) => f.id);
const POOL = poolFrom(FRANCHISES);
const measure = process.env.MEASURE === "1";

const fresh = (seed = "auction-test") => open(createAuction(POOL, IDS, "mum", seed));

const valid = (a: Auction) => {
  for (const id of a.squads) expect(owned(a, id)).toHaveLength(SQUAD_SIZE);
  for (const id of a.squads) expect(a.purse[id]).toBeGreaterThanOrEqual(0);
  expect(Object.keys(a.sold)).toHaveLength(POOL.length);
};

describe("the pool", () => {
  it("holds every authored player once, and lots run marquee first", () => {
    expect(POOL).toHaveLength(110);
    expect(new Set(POOL.map((p) => p.id)).size).toBe(110);
    const a = fresh();
    const tiers = a.pool.map((p) => TIERS.indexOf(tierOf(p)));
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1]);
    expect(tierOf(a.pool[0]).name).toBe("Marquee");
  });

  it("prices by overall, base in tiers", () => {
    const sorted = POOL.slice().sort((x, y) => overall(y) - overall(x));
    for (let i = 1; i < sorted.length; i++) {
      expect(worth(sorted[i])).toBeLessThanOrEqual(worth(sorted[i - 1]) + 1e-9);
      expect(baseOf(sorted[i])).toBeLessThanOrEqual(baseOf(sorted[i - 1]));
    }
    const counts = TIERS.map((t) => POOL.filter((p) => tierOf(p) === t).length);
    if (measure) console.table(TIERS.map((t, i) => ({ tier: t.name, base: t.base, players: counts[i] })));
    for (const c of counts) expect(c).toBeGreaterThan(5);
    const total = POOL.reduce((sum, p) => sum + worth(p), 0);
    if (measure) console.log(`pool worth ${total.toFixed(0)} cr against purses of ${PURSE * IDS.length}`);
  });

  it("is deterministic on the seed", () => {
    expect(fresh("a").pool.map((p) => p.id)).toEqual(fresh("a").pool.map((p) => p.id));
    expect(fresh("a").pool.map((p) => p.id)).not.toEqual(fresh("b").pool.map((p) => p.id));
  });
});

describe("a lot", () => {
  it("passed with no bid goes to the AI with the highest ceiling, at or above base", () => {
    const a = fresh();
    const lot = currentLot(a)!;
    const b = pass(a);
    const sale = b.sold[lot.id];
    expect(sale).toBeDefined();
    expect(sale.to).not.toBe("mum");
    expect(sale.price).toBeGreaterThanOrEqual(baseOf(lot));
    expect(sale.price).toBeLessThanOrEqual(ceiling(a, sale.to, lot) + 1e-9);
    expect(b.purse[sale.to]).toBeCloseTo(PURSE - sale.price, 9);
    expect(b.lot).toBe(1);
    expect(b.last).toEqual({ player: lot.id, sale });
  });

  it("bid on by you is either yours or raised by one increment", () => {
    const a = fresh();
    const lot = currentLot(a)!;
    const base = baseOf(lot);
    expect(youCanBid(a).ok).toBe(true);
    expect(nextPrice(a)).toBe(base);
    const b = bid(a);
    if (b.lot === a.lot) {
      expect(b.holder).not.toBe("mum");
      expect(b.price).toBeCloseTo(base + 0.25, 9);
      expect(youCanBid(b).ok).toBe(true);
      const c = pass(b);
      expect(c.sold[lot.id]).toEqual({ to: b.holder, price: b.price });
    } else {
      expect(b.sold[lot.id]).toEqual({ to: "mum", price: base });
    }
  });

  it("can be won by bidding until the AI stop", () => {
    let a = fresh();
    const lot = currentLot(a)!;
    for (let guard = 0; guard < 100 && a.lot === 0; guard++) a = bid(a);
    expect(a.sold[lot.id].to).toBe("mum");
    expect(a.purse.mum).toBeCloseTo(PURSE - a.sold[lot.id].price, 9);
    expect(a.sold[lot.id].price).toBeGreaterThan(baseOf(lot));
  });

  it("refuses a bid you cannot afford while filling the squad", () => {
    const a = fresh();
    const broke: Auction = { ...a, purse: { ...a.purse, mum: 2.5 } };
    expect(youCanBid(broke).ok).toBe(false);
    expect(bid(broke)).toBe(broke);
  });
});

describe("a whole auction", () => {
  const done = passAll(fresh());

  it("fills every side to eleven with the purse never negative", () => {
    expect(done.stage).toBe("done");
    valid(done);
  });

  it("leaves nobody without an attack", () => {
    const r = rosters(done, (id) => franchiseById(id).name);
    for (const id of done.squads) {
      expect(r[id].batters).toHaveLength(SQUAD_SIZE);
      expect(r[id].bowlers.length).toBeGreaterThanOrEqual(MIN_BOWLERS);
    }
  });

  it("prints what the AI paid", () => {
    const rows = done.squads.map((id) => {
      const mine = owned(done, id);
      return {
        side: id,
        spent: (PURSE - done.purse[id]).toFixed(2),
        bowlers: mine.filter((p) => p.bowler).length,
        strength: (mine.reduce((s, p) => s + overall(p), 0) / mine.length).toFixed(1),
      };
    });
    const dear = Object.entries(done.sold).sort((x, y) => y[1].price - x[1].price).slice(0, 5)
      .map(([id, s]) => ({ player: POOL.find((p) => p.id === id)!.name, to: s.to, price: s.price }));
    if (measure) {
      console.table(rows);
      console.table(dear);
      console.log(`${done.filled.length} players filled after the last lot`);
    }
    const spends = rows.filter((r) => r.side !== "mum").map((r) => Number(r.spent));
    expect(Math.min(...spends)).toBeGreaterThan(35);
    expect(Math.max(...spends)).toBeLessThan(80);
    expect(dear[0].price).toBeGreaterThan(5);
    expect(dear[0].price).toBeLessThan(14);
    expect(done.filled.length).toBeLessThan(25);
  });

  it("a sensible bidder builds a side as strong as the room's", () => {
    let a = fresh("sensible");
    for (let guard = 0; guard < 2000 && a.stage === "bidding"; guard++) {
      const lot = currentLot(a)!;
      const mine = owned(a, "mum");
      const slots = SQUAD_SIZE - mine.length;
      const bowlers = mine.filter((p) => p.bowler).length;
      const wants = slots > 0 && (lot.bowler || slots > MIN_BOWLERS - bowlers);
      if (wants && youCanBid(a).ok && nextPrice(a) <= worth(lot) * 1.35) a = bid(a);
      else a = pass(a);
    }
    valid(a);
    const strength = (id: string) => owned(a, id).reduce((s, p) => s + overall(p), 0) / SQUAD_SIZE;
    const others = a.squads.filter((id) => id !== "mum").map(strength);
    const rows = a.squads.map((id) => ({ side: id, spent: (PURSE - a.purse[id]).toFixed(2), strength: strength(id).toFixed(1), bought: owned(a, id).filter((p) => !a.filled.includes(p.id)).length }));
    if (measure) console.table(rows);
    expect(strength("mum")).toBeGreaterThan(Math.max(...others));
    expect(PURSE - a.purse.mum).toBeGreaterThan(60);
    expect(PURSE - a.purse.mum).toBeLessThan(PURSE);
  });

  it("is deterministic on the seed", () => {
    expect(passAll(fresh("x")).sold).toEqual(passAll(fresh("x")).sold);
    expect(passAll(fresh("x")).sold).not.toEqual(passAll(fresh("y")).sold);
  });

  it("lets you buy a watchlist by skipping to it", () => {
    let a = fresh("watch");
    const wanted = a.pool.filter((_, i) => i % 9 === 0).slice(0, 8).map((p) => p.id);
    for (const id of wanted) a = star(a, id);
    expect(isStarred(a, wanted[0])).toBe(true);
    const bought: string[] = [];
    for (let guard = 0; guard < 400 && a.stage === "bidding"; guard++) {
      a = skipToStar(a);
      const lot = currentLot(a);
      if (!lot) break;
      if (isStarred(a, lot.id) && youCanBid(a).ok && nextPrice(a) <= 12) {
        a = bid(a);
        if (a.sold[lot.id]?.to === "mum") bought.push(lot.id);
      } else {
        a = pass(a);
      }
    }
    expect(a.stage).toBe("done");
    valid(a);
    expect(bought.length).toBeGreaterThan(0);
    for (const id of bought) expect(a.sold[id].to).toBe("mum");
    expect(owned(a, "mum")).toHaveLength(SQUAD_SIZE);
  });
});

describe("squads from an auction", () => {
  const players = (ids: string[]) => ids.map((id) => POOL.find((p) => p.id === id)!);

  it("bat in order of batting value, bowlers at the tail", () => {
    const squad = toSquad(owned(passAll(fresh()), "che"), "che", "Chennai");
    const values = squad.batters.map((b) => 0.55 * b.power + 0.45 * b.technique);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
  });

  it("makes part-timers when an eleven is short of bowlers", () => {
    const bats = POOL.filter((p) => !p.bowler).slice(0, 9);
    const bowls = POOL.filter((p) => p.bowler).slice(0, 2);
    const squad = toSquad(players([...bats, ...bowls].map((p) => p.id)), "x", "X");
    expect(squad.bowlers).toHaveLength(MIN_BOWLERS);
    expect(squad.bowlers.slice(2).every((w) => w.pace < 45 && w.movement < 30)).toBe(true);
  });

  it("finishing a half-done auction still fills everyone", () => {
    let a = fresh("half");
    for (let i = 0; i < 40; i++) a = pass(a);
    valid(finish(a));
  });

  it("play a season", () => {
    const done = passAll(fresh("season"));
    const r = rosters(done, (id) => franchiseById(id).name);
    let season = { ...createSeason(IDS, "mum", "auction-season"), rosters: r };
    const rng = makeRng("auction-season");
    for (let guard = 0; guard < 60; guard++) {
      const fixture = nextFixture(season);
      if (!fixture) break;
      season = recordResult(season, simulateFixture(fixture, (id) => season.rosters![id], rng));
    }
    expect(standings(season)[0].played).toBe(9);
    const m = simulateMatch(r.mum, r.che, makeRng("m"));
    expect(m.first.runs).toBeGreaterThan(50);
  });
});

export type { PoolPlayer };
