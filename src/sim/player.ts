export type Rating = number;

export interface Batter {
  id: string;
  name: string;

  power: Rating;

  technique: Rating;

  aggression: Rating;
}

export interface Bowler {
  id: string;
  name: string;

  pace: Rating;

  accuracy: Rating;

  movement: Rating;

  variation: Rating;
}

export interface Squad {
  id: string;
  name: string;

  batters: Batter[];

  bowlers: Bowler[];
}

export const unit = (rating: Rating) => Math.max(0, Math.min(100, rating)) / 100;

export function averageBatter(id: string, name = id): Batter {
  return { id, name, power: 50, technique: 50, aggression: 50 };
}

export function averageBowler(id: string, name = id): Bowler {
  return { id, name, pace: 50, accuracy: 50, movement: 50, variation: 50 };
}
