import type { Season } from "../../sim/tournament";
import type { Auction } from "../../sim/auction";

const KEY = "powerplay.season.v1";
const AUCTION_KEY = "powerplay.auction.v1";

function read<T>(key: string, isValid: (parsed: Partial<T>) => boolean): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<T>;
    return parsed && isValid(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
  }
}

export function loadSeason(): Season | null {
  return read<Season>(KEY, (s) =>
    Array.isArray(s.league) && Array.isArray(s.results) && typeof s.you === "string");
}

export function saveSeason(season: Season): void {
  write(KEY, season);
}

export function clearSeason(): void {
  remove(KEY);
}

export function loadAuction(): Auction | null {
  return read<Auction>(AUCTION_KEY, (a) =>
    Array.isArray(a.pool) && Array.isArray(a.squads) && typeof a.you === "string" && typeof a.lot === "number");
}

export function saveAuction(auction: Auction): void {
  write(AUCTION_KEY, auction);
}

export function clearAuction(): void {
  remove(AUCTION_KEY);
}
