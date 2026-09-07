import type { Season } from "../../sim/tournament";
import type { Auction } from "../../sim/auction";

const KEY = "powerplay.season.v1";
const AUCTION_KEY = "powerplay.auction.v1";

export function loadSeason(): Season | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Season>;
    if (!parsed || !Array.isArray(parsed.league) || !Array.isArray(parsed.results) || typeof parsed.you !== "string") {
      return null;
    }
    return parsed as Season;
  } catch {
    return null;
  }
}

export function saveSeason(season: Season): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(season));
  } catch {
  }
}

export function clearSeason(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
  }
}

export function loadAuction(): Auction | null {
  try {
    const raw = window.localStorage.getItem(AUCTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Auction>;
    if (!parsed || !Array.isArray(parsed.pool) || !Array.isArray(parsed.squads) || typeof parsed.you !== "string" || typeof parsed.lot !== "number") {
      return null;
    }
    return parsed as Auction;
  } catch {
    return null;
  }
}

export function saveAuction(auction: Auction): void {
  try {
    window.localStorage.setItem(AUCTION_KEY, JSON.stringify(auction));
  } catch {
  }
}

export function clearAuction(): void {
  try {
    window.localStorage.removeItem(AUCTION_KEY);
  } catch {
  }
}
