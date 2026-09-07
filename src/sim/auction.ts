import type { Batter, Bowler, Squad } from "./player";
import { makeRng } from "./rng";

export const PURSE = 100;
export const SQUAD_SIZE = 11;
export const MIN_BOWLERS = 5;
export const MIN_BASE = 0.2;

export interface PoolPlayer {
  id: string;
  name: string;
  from: string;
  batter: Batter;
  bowler?: Bowler;
  tier: string;
  base: number;
}

export interface Sale {
  to: string;
  price: number;
}

export type AuctionStage = "watch" | "bidding" | "done";

export interface LastLot {
  player: string;
  sale: Sale | null;
}

export interface Auction {
  seed: string;
  you: string;
  squads: string[];
  purse: Record<string, number>;
  pool: PoolPlayer[];
  lot: number;
  price: number | null;
  holder: string | null;
  sold: Record<string, Sale>;
  watch: string[];
  filled: string[];
  stage: AuctionStage;
  last?: LastLot;
}

export const battingValue = (b: Batter) => 0.55 * b.power + 0.45 * b.technique;
export const bowlingValue = (w: Bowler) => 0.3 * w.pace + 0.25 * w.accuracy + 0.3 * w.movement + 0.15 * w.variation;

export function overall(p: PoolPlayer): number {
  const bat = battingValue(p.batter);
  const bowl = p.bowler ? bowlingValue(p.bowler) : 0;
  const best = Math.max(bat, bowl);
  const other = Math.min(bat, bowl);
  return Math.min(100, best + Math.max(0, other - 40) * 0.2);
}

export function worth(p: PoolPlayer): number {
  const o = Math.max(0, Math.min(100, overall(p))) / 100;
  return MIN_BASE + 11 * Math.pow(o, 2.4);
}

export interface Tier {
  name: string;
  base: number;
  share: number;
}

export const TIERS: readonly Tier[] = [
  { name: "Marquee", base: 2.0, share: 0.15 },
  { name: "Frontline", base: 1.5, share: 0.25 },
  { name: "Core", base: 1.0, share: 0.3 },
  { name: "Squad", base: 0.5, share: 0.2 },
  { name: "Reserve", base: MIN_BASE, share: 0.1 },
];

export const tierOf = (p: PoolPlayer): Tier => TIERS.find((t) => t.name === p.tier) ?? TIERS[TIERS.length - 1];

export const baseOf = (p: PoolPlayer) => p.base;

export const SHARE_CAP = 2.5;

export function roleOf(p: PoolPlayer): "bat" | "bowl" | "all-rounder" {
  if (!p.bowler) return "bat";
  return battingValue(p.batter) >= 50 ? "all-rounder" : "bowl";
}

export function increment(price: number): number {
  if (price < 5) return 0.25;
  if (price < 10) return 0.5;
  return 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function poolFrom(sides: readonly { id: string; squad: Squad }[]): PoolPlayer[] {
  const pool: PoolPlayer[] = [];
  for (const side of sides) {
    for (const batter of side.squad.batters) {
      const bowler = side.squad.bowlers.find((w) => w.id === batter.id);
      pool.push({ id: batter.id, name: batter.name, from: side.id, batter, bowler, tier: "", base: MIN_BASE });
    }
  }
  const ranked = pool.slice().sort((x, y) => overall(y) - overall(x));
  let from = 0;
  for (const tier of TIERS) {
    const to = tier === TIERS[TIERS.length - 1] ? ranked.length : from + Math.round(ranked.length * tier.share);
    for (const p of ranked.slice(from, to)) {
      p.tier = tier.name;
      p.base = tier.base;
    }
    from = to;
  }
  return pool;
}

export function createAuction(pool: PoolPlayer[], squads: string[], you: string, seed: string): Auction {
  if (!squads.includes(you)) throw new Error(`"${you}" is not in the auction`);
  if (pool.length < squads.length * SQUAD_SIZE) {
    throw new Error(`a pool of ${pool.length} cannot fill ${squads.length} sides of ${SQUAD_SIZE}`);
  }
  const rng = makeRng(`${seed}:lots`);
  const ordered: PoolPlayer[] = [];
  for (const tier of TIERS) {
    const set = pool.filter((p) => tierOf(p) === tier);
    for (let i = set.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [set[i], set[j]] = [set[j], set[i]];
    }
    ordered.push(...set);
  }
  return {
    seed,
    you,
    squads: squads.slice(),
    purse: Object.fromEntries(squads.map((id) => [id, PURSE])),
    pool: ordered,
    lot: 0,
    price: null,
    holder: null,
    sold: {},
    watch: [],
    filled: [],
    stage: "watch",
  };
}

export const currentLot = (a: Auction): PoolPlayer | null => (a.stage === "bidding" ? a.pool[a.lot] ?? null : null);

export const owned = (a: Auction, squad: string): PoolPlayer[] => a.pool.filter((p) => a.sold[p.id]?.to === squad);

export const spent = (a: Auction, squad: string): number => round2(PURSE - a.purse[squad]);

export function nextPrice(a: Auction): number {
  const lot = currentLot(a);
  if (!lot) return 0;
  return a.price === null ? baseOf(lot) : round2(a.price + increment(a.price));
}

export function need(a: Auction, squad: string, player: PoolPlayer): number {
  const mine = owned(a, squad);
  if (mine.length >= SQUAD_SIZE) return 0;
  const slotsLeft = SQUAD_SIZE - mine.length;
  const bowlers = mine.filter((p) => p.bowler).length;
  const bowlersShort = Math.max(0, MIN_BOWLERS - bowlers);
  if (!player.bowler && slotsLeft <= bowlersShort) return 0;

  let n = 1;
  if (player.bowler) {
    if (bowlersShort > 0) n = 1.15;
    else if (bowlers >= 7) n = 0.5;
  }
  const bat = battingValue(player.batter);
  const tops = mine.filter((p) => battingValue(p.batter) >= 60).length;
  if (bat >= 60) {
    if (tops < 4) n = Math.max(n, 1.15);
    else if (tops >= 6) n = Math.min(n, 0.7);
  }
  return n;
}

export function ceiling(a: Auction, squad: string, player: PoolPlayer, lot = a.lot): number {
  const n = need(a, squad, player);
  if (n === 0) return 0;
  const slotsLeft = SQUAD_SIZE - owned(a, squad).length;
  const affordable = a.purse[squad] - (slotsLeft - 1) * MIN_BASE;
  const share = (a.purse[squad] / slotsLeft) * SHARE_CAP;
  const noise = makeRng(`${a.seed}:${lot}:${squad}`).range(0.85, 1.15);
  return Math.max(0, Math.min(worth(player) * n * noise, affordable, share));
}

export function youCanBid(a: Auction): { ok: boolean; why?: string } {
  const lot = currentLot(a);
  if (!lot) return { ok: false, why: "No lot is open." };
  if (a.holder === a.you) return { ok: false, why: "You hold the bid." };
  const mine = owned(a, a.you);
  if (mine.length >= SQUAD_SIZE) return { ok: false, why: "Your squad is full." };
  const price = nextPrice(a);
  const slotsLeft = SQUAD_SIZE - mine.length;
  if (price > a.purse[a.you] - (slotsLeft - 1) * MIN_BASE) return { ok: false, why: "You cannot afford it and still fill your squad." };
  return { ok: true };
}

const aiSides = (a: Auction) => a.squads.filter((id) => id !== a.you);

function sell(a: Auction, player: PoolPlayer, sale: Sale | null): Auction {
  const sold = { ...a.sold };
  const purse = { ...a.purse };
  if (sale) {
    sold[player.id] = sale;
    purse[sale.to] = round2(purse[sale.to] - sale.price);
  }
  const next: Auction = { ...a, sold, purse, lot: a.lot + 1, price: null, holder: null, last: { player: player.id, sale } };
  const everyoneFull = next.squads.every((id) => owned(next, id).length >= SQUAD_SIZE);
  return next.lot >= next.pool.length || everyoneFull ? finish(next) : next;
}

export function bid(a: Auction): Auction {
  const lot = currentLot(a);
  if (!lot || !youCanBid(a).ok) return a;
  const price = nextPrice(a);
  const mine: Auction = { ...a, price, holder: a.you };
  const raise = round2(price + increment(price));
  const rival = aiSides(a)
    .map((id) => ({ id, ceiling: ceiling(a, id, lot) }))
    .filter((c) => c.ceiling >= raise)
    .sort((x, y) => y.ceiling - x.ceiling)[0];
  if (rival) return { ...mine, price: raise, holder: rival.id };
  return sell(mine, lot, { to: a.you, price });
}

export function pass(a: Auction): Auction {
  const lot = currentLot(a);
  if (!lot) return a;
  if (a.holder && a.price !== null) return sell(a, lot, { to: a.holder, price: a.price });

  const base = baseOf(lot);
  const bidders = aiSides(a)
    .map((id) => ({ id, ceiling: ceiling(a, id, lot) }))
    .filter((c) => c.ceiling >= base)
    .sort((x, y) => y.ceiling - x.ceiling);
  if (bidders.length === 0) return sell(a, lot, null);

  let holder = bidders[0];
  let price = base;
  for (let guard = 0; guard < 200; guard++) {
    const raise = round2(price + increment(price));
    const rival = bidders.find((c) => c.id !== holder.id && c.ceiling >= raise);
    if (!rival) break;
    holder = rival;
    price = raise;
  }
  return sell(a, lot, { to: holder.id, price });
}

export function open(a: Auction): Auction {
  return a.stage === "watch" ? { ...a, stage: "bidding" } : a;
}

export function star(a: Auction, id: string): Auction {
  const watch = a.watch.includes(id) ? a.watch.filter((w) => w !== id) : [...a.watch, id];
  return { ...a, watch };
}

export const isStarred = (a: Auction, id: string) => a.watch.includes(id);

export function skipToStar(a: Auction): Auction {
  let s = a;
  for (let guard = 0; guard < s.pool.length + 1; guard++) {
    const lot = currentLot(s);
    if (!lot) break;
    if (isStarred(s, lot.id) && s.holder !== s.you) break;
    s = pass(s);
  }
  return s;
}

export function passAll(a: Auction): Auction {
  let s = a;
  for (let guard = 0; guard < s.pool.length + 1 && currentLot(s); guard++) s = pass(s);
  return s;
}

export function finish(a: Auction): Auction {
  const sold = { ...a.sold };
  const purse = { ...a.purse };
  const filled = [...a.filled];
  const count = (squad: string) => a.pool.filter((p) => sold[p.id]?.to === squad).length;
  const bowlersOf = (squad: string) => a.pool.filter((p) => sold[p.id]?.to === squad && p.bowler).length;
  const unsold = () => a.pool.filter((p) => !sold[p.id]).sort((x, y) => worth(y) - worth(x));
  const give = (p: PoolPlayer, squad: string) => {
    sold[p.id] = { to: squad, price: baseOf(p) };
    purse[squad] = Math.max(0, round2(purse[squad] - baseOf(p)));
    filled.push(p.id);
  };

  for (const squad of a.squads) {
    while (count(squad) < SQUAD_SIZE && bowlersOf(squad) < MIN_BOWLERS) {
      const p = unsold().find((x) => x.bowler);
      if (!p) break;
      give(p, squad);
    }
  }
  for (let guard = 0; guard < a.pool.length; guard++) {
    const left = unsold();
    if (left.length === 0) break;
    const short = a.squads.slice().sort((x, y) => count(x) - count(y))[0];
    if (count(short) >= SQUAD_SIZE) break;
    give(left[0], short);
  }
  return { ...a, sold, purse, filled, stage: "done", price: null, holder: null };
}

export const PART_TIMER: Omit<Bowler, "id" | "name"> = { pace: 38, accuracy: 34, movement: 22, variation: 28 };

export function toSquad(players: PoolPlayer[], id: string, name: string): Squad {
  const batters = players
    .slice()
    .sort((x, y) => battingValue(y.batter) - battingValue(x.batter))
    .map((p) => p.batter);
  const bowlers = players.filter((p) => p.bowler).map((p) => p.bowler!)
    .sort((x, y) => bowlingValue(y) - bowlingValue(x));
  const partTimers = players
    .filter((p) => !p.bowler)
    .sort((x, y) => battingValue(x.batter) - battingValue(y.batter))
    .slice(0, Math.max(0, MIN_BOWLERS - bowlers.length))
    .map((p) => ({ id: p.id, name: p.name, ...PART_TIMER }));
  return { id, name, batters, bowlers: [...bowlers, ...partTimers] };
}

export function rosters(a: Auction, nameOf: (id: string) => string): Record<string, Squad> {
  if (a.stage !== "done") throw new Error("the auction is not over");
  return Object.fromEntries(a.squads.map((id) => [id, toSquad(owned(a, id), id, nameOf(id))]));
}

export const upcoming = (a: Auction, n: number): PoolPlayer[] =>
  a.stage === "bidding" ? a.pool.slice(a.lot + 1, a.lot + 1 + n) : a.stage === "watch" ? a.pool.slice(0, n) : [];
