import type { Season } from "../../sim/tournament";

/**
 * The one season in progress, kept in localStorage so a reload does not end
 * it. Plain JSON of a `Season`; nothing else is persisted. Reading tolerates
 * anything -- a missing key, a blocked storage, a shape from an older build --
 * and answers with null, which the select screen reads as "no season".
 */

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
    // Storage blocked or full: the season lives for this page only.
  }
}

export function clearSeason(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear, or nowhere to clear it from.
  }
}
