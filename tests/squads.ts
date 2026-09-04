import type { Rng } from "../src/sim/rng";
import type { Squad, Batter, Bowler } from "../src/sim/player";

const FIRST = ["Arjun", "Rohan", "Kabir", "Ishaan", "Vihaan", "Dev", "Aryan", "Neel", "Rudra", "Yash", "Manav"];
const LAST = ["Menon", "Iyer", "Bose", "Rao", "Sethi", "Kulkarni", "Nair", "Chawla", "Dutta", "Reddy", "Gill"];

const spread = (rng: Rng, centre: number, width: number) =>
  Math.max(5, Math.min(98, Math.round(centre + rng.range(-width, width))));

export function makeSquad(id: string, name: string, rng: Rng): Squad {
  const batters: Batter[] = [];
  const bowlers: Bowler[] = [];

  const surnames = LAST.slice();

  for (let position = 0; position < 11; position++) {
    const player = `${rng.pick(FIRST)} ${surnames.splice(rng.int(surnames.length), 1)[0]}`;
    const playerId = `${id}-${position}`;

    const battingCentre = position <= 5 ? 70 - position * 2 : position <= 7 ? 52 : 28;
    batters.push({
      id: playerId,
      name: player,
      power: spread(rng, battingCentre, 12),
      technique: spread(rng, battingCentre + 4, 12),
      aggression: spread(rng, position <= 1 ? 55 : position <= 5 ? 62 : 70, 15),
    });

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

export function makeLeague(rng: Rng): Squad[] {
  const cities = ["Mumbai", "Delhi", "Chennai", "Kolkata", "Bengaluru", "Hyderabad", "Jaipur", "Lucknow", "Ahmedabad", "Pune"];
  return cities.map((city, i) => makeSquad(`t${i}`, city, rng));
}
