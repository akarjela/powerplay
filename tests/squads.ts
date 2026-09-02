import type { Rng } from "../src/sim/rng";
import type { Squad, Batter, Bowler } from "../src/sim/player";

/**
 * Plausible squads, generated rather than authored.
 *
 * Real squad data lands in M3. What the calibration test needs before then is a
 * league whose spread of players is roughly right -- top-order specialists, a
 * couple of allrounders, a tail that cannot bat -- because calibrating against
 * eleven identical average players would tune the model for a league that will
 * never exist.
 */

const FIRST = ["Arjun", "Rohan", "Kabir", "Ishaan", "Vihaan", "Dev", "Aryan", "Neel", "Rudra", "Yash", "Manav"];
const LAST = ["Menon", "Iyer", "Bose", "Rao", "Sethi", "Kulkarni", "Nair", "Chawla", "Dutta", "Reddy", "Gill"];

const spread = (rng: Rng, centre: number, width: number) =>
  Math.max(5, Math.min(98, Math.round(centre + rng.range(-width, width))));

export function makeSquad(id: string, name: string, rng: Rng): Squad {
  const batters: Batter[] = [];
  const bowlers: Bowler[] = [];
  // A scorecard with two identically named players is unreadable, and it looks
  // like a bug in the sim rather than in the fixture. Draw without replacement.
  const surnames = LAST.slice();

  for (let position = 0; position < 11; position++) {
    const player = `${rng.pick(FIRST)} ${surnames.splice(rng.int(surnames.length), 1)[0]}`;
    const playerId = `${id}-${position}`;

    // Batting quality falls off down the order, steeply after seven.
    const battingCentre = position <= 5 ? 70 - position * 2 : position <= 7 ? 52 : 28;
    batters.push({
      id: playerId,
      name: player,
      power: spread(rng, battingCentre, 12),
      technique: spread(rng, battingCentre + 4, 12),
      aggression: spread(rng, position <= 1 ? 55 : position <= 5 ? 62 : 70, 15),
    });

    // Six through eleven bowl: two allrounders and four specialists.
    if (position >= 5) {
      const bowlingCentre = position >= 8 ? 72 : 58;
      bowlers.push({
        id: playerId,
        name: player,
        pace: spread(rng, 55, 25),
        accuracy: spread(rng, bowlingCentre, 12),
        movement: spread(rng, bowlingCentre, 14),
        variation: spread(rng, bowlingCentre - 4, 14),
      });
    }
  }

  return { id, name, batters, bowlers };
}

/** The ten franchises, as placeholders. Real ones -- and real cities -- in M4. */
export function makeLeague(rng: Rng): Squad[] {
  const cities = ["Mumbai", "Delhi", "Chennai", "Kolkata", "Bengaluru", "Hyderabad", "Jaipur", "Lucknow", "Ahmedabad", "Pune"];
  return cities.map((city, i) => makeSquad(`t${i}`, city, rng));
}
