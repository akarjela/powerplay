import type { Season } from "../../sim/tournament";

const KEY = "powerplay.season.v1";

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
