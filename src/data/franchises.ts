import type { Batter, Bowler, Squad } from "../sim/player";
import type { Season } from "../sim/tournament";

export interface Franchise {
  id: string;

  code: string;
  city: string;
  name: string;
  ground: string;
  colours: { primary: number; secondary: number };
  squad: Squad;
}

type Row =
  | readonly [string, number, number, number]
  | readonly [string, number, number, number, number, number, number, number];

function squadOf(id: string, name: string, rows: readonly Row[]): Squad {
  const batters: Batter[] = [];
  const bowlers: Bowler[] = [];
  rows.forEach((row, index) => {
    const playerId = `${id}-${index + 1}`;
    const [player, power, technique, aggression] = row;
    batters.push({ id: playerId, name: player, power, technique, aggression });
    if (row.length === 8) {
      const [, , , , pace, accuracy, movement, variation] = row;
      bowlers.push({ id: playerId, name: player, pace, accuracy, movement, variation });
    }
  });
  return { id, name, batters, bowlers };
}

function franchise(
  id: string,
  code: string,
  city: string,
  name: string,
  ground: string,
  colours: { primary: number; secondary: number },
  rows: readonly Row[],
): Franchise {
  return { id, code, city, name, ground, colours, squad: squadOf(id, name, rows) };
}

export const FRANCHISES: readonly Franchise[] = [

  franchise("mum", "MUM", "Mumbai", "Mumbai Mariners", "Marine Lines Oval", { primary: 0x0b2a5b, secondary: 0xf2b632 }, [
    ["Rohit Sharma", 78, 78, 62],
    ["Ryan Rickelton", 70, 74, 58],
    ["Will Jacks", 76, 66, 72, 24, 62, 52, 60],
    ["Suryakumar Yadav", 80, 78, 70],
    ["Tilak Varma", 72, 74, 60],
    ["Hardik Pandya", 78, 62, 74, 74, 62, 66, 60],
    ["Naman Dhir", 62, 54, 68],
    ["Corbin Bosch", 48, 40, 70, 76, 64, 66, 58],
    ["Deepak Chahar", 30, 32, 70, 70, 76, 74, 62],
    ["Trent Boult", 22, 24, 72, 82, 70, 80, 64],
    ["Jasprit Bumrah", 20, 22, 70, 84, 84, 82, 78],
  ]),

  franchise("del", "DEL", "Delhi", "Delhi Sentinels", "Ridge Road Ground", { primary: 0xb91c1c, secondary: 0x94a3b8 }, [
    ["KL Rahul", 68, 84, 50],
    ["Prithvi Shaw", 76, 70, 70],
    ["Pathum Nissanka", 64, 76, 52],
    ["Nitish Rana", 70, 68, 64],
    ["Tristan Stubbs", 76, 66, 72],
    ["Karun Nair", 58, 66, 54],
    ["Axar Patel", 62, 60, 66, 26, 78, 60, 64],
    ["Kuldeep Yadav", 28, 30, 70, 22, 76, 78, 82],
    ["Mitchell Starc", 40, 34, 74, 84, 66, 78, 62],
    ["Lungi Ngidi", 26, 26, 70, 80, 74, 72, 60],
    ["Mukesh Kumar", 18, 22, 68, 70, 76, 66, 58],
  ]),

  franchise("che", "CHE", "Chennai", "Chennai Cyclones", "Marina Coastal Stadium", { primary: 0xf5c518, secondary: 0x0f766e }, [
    ["Sanju Samson", 76, 74, 66],
    ["Ayush Mhatre", 66, 70, 64],
    ["Ruturaj Gaikwad", 64, 84, 46],
    ["Shivam Dube", 84, 58, 78, 44, 58, 52, 54],
    ["Dewald Brevis", 78, 64, 74, 22, 56, 54, 62],
    ["MS Dhoni", 72, 66, 68],
    ["Prashant Veer", 46, 48, 62, 24, 70, 62, 66],
    ["Matt Henry", 34, 30, 70, 76, 74, 74, 58],
    ["Noor Ahmad", 24, 26, 70, 20, 76, 72, 80],
    ["Anshul Kamboj", 28, 30, 68, 70, 76, 70, 60],
    ["Mukesh Choudhary", 18, 22, 68, 72, 68, 70, 56],
  ]),

  franchise("kol", "KOL", "Kolkata", "Kolkata Monarchs", "Maidan Park", { primary: 0x6d28d9, secondary: 0xfbbf24 }, [
    ["Ajinkya Rahane", 60, 80, 50],
    ["Finn Allen", 82, 62, 80],
    ["Angkrish Raghuvanshi", 66, 72, 60],
    ["Rahul Tripathi", 70, 70, 64],
    ["Cameron Green", 76, 70, 66, 74, 62, 64, 56],
    ["Tim Seifert", 72, 62, 74],
    ["Ramandeep Singh", 70, 52, 78, 52, 54, 50, 58],
    ["Sunil Narine", 66, 44, 82, 20, 80, 70, 78],
    ["Varun Chakravarthy", 22, 24, 70, 24, 78, 74, 84],
    ["Vaibhav Arora", 24, 26, 70, 74, 74, 72, 60],
    ["Umran Malik", 20, 20, 72, 88, 62, 70, 52],
  ]),

  franchise("blr", "BLR", "Bengaluru", "Bengaluru Blazers", "Cubbon Fields", { primary: 0x9f1239, secondary: 0x111827 }, [
    ["Phil Salt", 80, 70, 76],
    ["Virat Kohli", 78, 88, 60],
    ["Devdutt Padikkal", 68, 76, 54],
    ["Rajat Patidar", 78, 74, 66],
    ["Jitesh Sharma", 72, 62, 72],
    ["Tim David", 84, 56, 82],
    ["Krunal Pandya", 64, 62, 62, 24, 74, 60, 62],
    ["Romario Shepherd", 68, 46, 76, 74, 60, 62, 56],
    ["Bhuvneshwar Kumar", 30, 34, 66, 68, 84, 82, 68],
    ["Josh Hazlewood", 24, 26, 70, 80, 80, 78, 58],
    ["Suyash Sharma", 18, 22, 68, 22, 70, 68, 76],
  ]),

  franchise("hyd", "HYD", "Hyderabad", "Hyderabad Falcons", "Charminar Stadium", { primary: 0xea580c, secondary: 0x1c1917 }, [
    ["Travis Head", 84, 68, 82],
    ["Abhishek Sharma", 80, 64, 80, 22, 60, 50, 58],
    ["Ishan Kishan", 72, 70, 66],
    ["Nitish Kumar Reddy", 66, 64, 62, 66, 62, 60, 56],
    ["Heinrich Klaasen", 82, 70, 76],
    ["Liam Livingstone", 76, 58, 78, 26, 62, 56, 64],
    ["Aniket Verma", 62, 52, 70],
    ["Pat Cummins", 40, 38, 70, 82, 78, 78, 62],
    ["Harshal Patel", 30, 32, 68, 68, 74, 70, 82],
    ["Jaydev Unadkat", 24, 26, 68, 72, 78, 74, 64],
    ["Zeeshan Ansari", 18, 22, 68, 22, 72, 68, 74],
  ]),

  franchise("jai", "JAI", "Jaipur", "Jaipur Maharajas", "Amber Fort Ground", { primary: 0xdb2777, secondary: 0x1d4ed8 }, [
    ["Yashasvi Jaiswal", 78, 78, 70],
    ["Vaibhav Sooryavanshi", 86, 62, 88],
    ["Riyan Parag", 72, 64, 70, 26, 60, 52, 62],
    ["Shimron Hetmyer", 78, 60, 76],
    ["Dhruv Jurel", 62, 70, 58],
    ["Ravindra Jadeja", 68, 66, 66, 24, 84, 68, 66],
    ["Donovan Ferreira", 70, 50, 78],
    ["Jofra Archer", 34, 32, 72, 86, 78, 82, 70],
    ["Nandre Burger", 22, 24, 70, 80, 70, 74, 58],
    ["Sandeep Sharma", 20, 24, 68, 68, 78, 72, 62],
    ["Ravi Bishnoi", 18, 22, 68, 24, 74, 70, 80],
  ]),

  franchise("lko", "LKO", "Lucknow", "Lucknow Nawabs", "Gomti Riverside", { primary: 0x0891b2, secondary: 0x166534 }, [
    ["Mitchell Marsh", 80, 68, 76, 62, 56, 58, 50],
    ["Aiden Markram", 70, 76, 60],
    ["Nicholas Pooran", 84, 60, 82],
    ["Rishabh Pant", 80, 70, 78],
    ["Ayush Badoni", 62, 64, 62],
    ["Abdul Samad", 68, 48, 76],
    ["Shahbaz Ahmed", 50, 50, 62, 22, 70, 60, 62],
    ["Mohammed Shami", 26, 28, 68, 78, 78, 80, 62],
    ["Avesh Khan", 22, 24, 70, 80, 66, 70, 58],
    ["Prince Yadav", 18, 22, 68, 76, 70, 72, 56],
    ["Digvesh Rathi", 16, 20, 66, 20, 74, 66, 76],
  ]),

  franchise("amd", "AMD", "Ahmedabad", "Ahmedabad Kites", "Sabarmati Bowl", { primary: 0xf97316, secondary: 0x1e3a8a }, [
    ["Shubman Gill", 76, 84, 58],
    ["Sai Sudharsan", 66, 82, 52],
    ["Jos Buttler", 82, 72, 74],
    ["Washington Sundar", 62, 64, 60, 22, 76, 60, 64],
    ["Shahrukh Khan", 78, 50, 80],
    ["Glenn Phillips", 72, 58, 74, 24, 62, 56, 60],
    ["Rahul Tewatia", 64, 52, 74, 22, 62, 54, 66],
    ["Rashid Khan", 44, 36, 76, 24, 84, 80, 86],
    ["Kagiso Rabada", 28, 26, 70, 84, 76, 78, 62],
    ["Mohammed Siraj", 20, 22, 68, 80, 74, 76, 60],
    ["Prasidh Krishna", 18, 20, 68, 78, 70, 72, 56],
  ]),

  franchise("pun", "PUN", "Mohali", "Punjab Panthers", "Mullanpur Meadow", { primary: 0xd91e2a, secondary: 0xe5e7eb }, [
    ["Priyansh Arya", 78, 62, 78],
    ["Prabhsimran Singh", 76, 68, 74],
    ["Shreyas Iyer", 74, 80, 62],
    ["Nehal Wadhera", 66, 72, 58],
    ["Shashank Singh", 74, 58, 78],
    ["Marcus Stoinis", 74, 60, 72, 62, 60, 58, 54],
    ["Azmatullah Omarzai", 70, 54, 74, 70, 60, 62, 56],
    ["Marco Jansen", 56, 48, 68, 80, 72, 78, 60],
    ["Xavier Bartlett", 26, 28, 68, 74, 76, 74, 62],
    ["Arshdeep Singh", 20, 22, 68, 76, 80, 78, 66],
    ["Yuzvendra Chahal", 16, 20, 66, 20, 74, 72, 84],
  ]),
];

/**
 * Legends of the league, in the auction pool only. They belong to no side,
 * so they carry a badge of their own and never appear in the authored
 * elevens or the quick-match team list.
 */
export const LEGENDS: Franchise = franchise("leg", "LEG", "The Hall", "Legends", "The Pavilion", { primary: 0xb8860b, secondary: 0x1c1917 }, [
  ["AB de Villiers", 84, 88, 72],
  ["Chris Gayle", 94, 64, 86],
  ["Sachin Tendulkar", 72, 92, 50],
  ["Virender Sehwag", 86, 74, 88],
  ["Adam Gilchrist", 84, 76, 78],
  ["Brendon McCullum", 84, 68, 84],
  ["David Warner", 82, 80, 72],
  ["Suresh Raina", 76, 78, 66, 24, 62, 50, 58],
  ["Yuvraj Singh", 84, 72, 74, 36, 64, 50, 62],
  ["Kieron Pollard", 86, 58, 82, 62, 58, 56, 54],
  ["Andre Russell", 92, 54, 88, 78, 58, 62, 60],
  ["Dwayne Bravo", 66, 56, 72, 58, 74, 64, 88],
  ["Harbhajan Singh", 30, 32, 70, 22, 82, 76, 72],
  ["Shane Warne", 30, 32, 70, 20, 84, 82, 90],
  ["Lasith Malinga", 18, 20, 70, 84, 82, 76, 84],
  ["Dale Steyn", 22, 24, 70, 88, 80, 86, 62],
]);

export function franchiseById(id: string): Franchise {
  const found = id === LEGENDS.id ? LEGENDS : FRANCHISES.find((f) => f.id === id);
  if (!found) throw new Error(`no franchise "${id}"`);
  return found;
}

export const LEAGUE: readonly Squad[] = FRANCHISES.map((f) => f.squad);

export function franchiseIn(season: Pick<Season, "rosters"> | null | undefined, id: string): Franchise {
  const f = franchiseById(id);
  const roster = season?.rosters?.[id];
  return roster ? { ...f, squad: roster } : f;
}
