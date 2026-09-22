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
    ["Rohit Shinde", 78, 78, 62],
    ["Ryan Roux", 70, 74, 58],
    ["Will Jarvis", 76, 66, 72, 24, 62, 52, 60],
    ["Suryakumar Yende", 80, 78, 70],
    ["Tilak Vemula", 72, 74, 60],
    ["Hardik Parikh", 78, 62, 74, 74, 62, 66, 60],
    ["Naman Dua", 62, 54, 68],
    ["Corbin Botha", 48, 40, 70, 76, 64, 66, 58],
    ["Deepak Chauhan", 30, 32, 70, 70, 76, 74, 62],
    ["Trent Barlow", 22, 24, 72, 82, 70, 80, 64],
    ["Jasprit Bhatia", 20, 22, 70, 84, 84, 82, 78],
  ]),

  franchise("del", "DEL", "Delhi", "Delhi Sentinels", "Ridge Road Ground", { primary: 0xb91c1c, secondary: 0x94a3b8 }, [
    ["KL Raghav", 68, 84, 50],
    ["Prithvi Shetty", 76, 70, 70],
    ["Pathum Nanayakkara", 64, 76, 52],
    ["Nitish Rastogi", 70, 68, 64],
    ["Tristan Steenkamp", 76, 66, 72],
    ["Karun Nayak", 58, 66, 54],
    ["Axar Parmar", 62, 60, 66, 26, 78, 60, 64],
    ["Kuldeep Yogi", 28, 30, 70, 22, 76, 78, 82],
    ["Mitchell Stevens", 40, 34, 74, 84, 66, 78, 62],
    ["Lungi Nkosi", 26, 26, 70, 80, 74, 72, 60],
    ["Mukesh Khandelwal", 18, 22, 68, 70, 76, 66, 58],
  ]),

  franchise("che", "CHE", "Chennai", "Chennai Cyclones", "Marina Coastal Stadium", { primary: 0xf5c518, secondary: 0x0f766e }, [
    ["Sanju Sebastian", 76, 74, 66],
    ["Ayush Mane", 66, 70, 64],
    ["Ruturaj Gore", 64, 84, 46],
    ["Shivam Deshpande", 84, 58, 78, 44, 58, 52, 54],
    ["Dewald Brink", 78, 64, 74, 22, 56, 54, 62],
    ["MS Deshmukh", 72, 66, 68],
    ["Prashant Vohra", 46, 48, 62, 24, 70, 62, 66],
    ["Matt Holden", 34, 30, 70, 76, 74, 74, 58],
    ["Noor Akbar", 24, 26, 70, 20, 76, 72, 80],
    ["Anshul Kapoor", 28, 30, 68, 70, 76, 70, 60],
    ["Mukesh Chandel", 18, 22, 68, 72, 68, 70, 56],
  ]),

  franchise("kol", "KOL", "Kolkata", "Kolkata Monarchs", "Maidan Park", { primary: 0x6d28d9, secondary: 0xfbbf24 }, [
    ["Ajinkya Raut", 60, 80, 50],
    ["Finn Ashby", 82, 62, 80],
    ["Angkrish Rathod", 66, 72, 60],
    ["Rahul Tandon", 70, 70, 64],
    ["Cameron Grant", 76, 70, 66, 74, 62, 64, 56],
    ["Tim Sutherland", 72, 62, 74],
    ["Ramandeep Sohal", 70, 52, 78, 52, 54, 50, 58],
    ["Sunil Nandlall", 66, 44, 82, 20, 80, 70, 78],
    ["Varun Chandrasekhar", 22, 24, 70, 24, 78, 74, 84],
    ["Vaibhav Agarwal", 24, 26, 70, 74, 74, 72, 60],
    ["Umran Mir", 20, 20, 72, 88, 62, 70, 52],
  ]),

  franchise("blr", "BLR", "Bengaluru", "Bengaluru Blazers", "Cubbon Fields", { primary: 0x9f1239, secondary: 0x111827 }, [
    ["Phil Sanders", 80, 70, 76],
    ["Virat Kapadia", 78, 88, 60],
    ["Devdutt Pai", 68, 76, 54],
    ["Rajat Pathak", 78, 74, 66],
    ["Jitesh Solanki", 72, 62, 72],
    ["Tim Dawson", 84, 56, 82],
    ["Krunal Parikh", 64, 62, 62, 24, 74, 60, 62],
    ["Romario Spencer", 68, 46, 76, 74, 60, 62, 56],
    ["Bhuvneshwar Kashyap", 30, 34, 66, 68, 84, 82, 68],
    ["Josh Harding", 24, 26, 70, 80, 80, 78, 58],
    ["Suyash Sawant", 18, 22, 68, 22, 70, 68, 76],
  ]),

  franchise("hyd", "HYD", "Hyderabad", "Hyderabad Falcons", "Charminar Stadium", { primary: 0xea580c, secondary: 0x1c1917 }, [
    ["Travis Hughes", 84, 68, 82],
    ["Abhishek Saxena", 80, 64, 80, 22, 60, 50, 58],
    ["Ishan Kulkarni", 72, 70, 66],
    ["Nitish Kumar Rao", 66, 64, 62, 66, 62, 60, 56],
    ["Heinrich Kruger", 82, 70, 76],
    ["Liam Lawson", 76, 58, 78, 26, 62, 56, 64],
    ["Aniket Vyas", 62, 52, 70],
    ["Pat Collins", 40, 38, 70, 82, 78, 78, 62],
    ["Harshal Panchal", 30, 32, 68, 68, 74, 70, 82],
    ["Jaydev Upadhyay", 24, 26, 68, 72, 78, 74, 64],
    ["Zeeshan Aziz", 18, 22, 68, 22, 72, 68, 74],
  ]),

  franchise("jai", "JAI", "Jaipur", "Jaipur Maharajas", "Amber Fort Ground", { primary: 0xdb2777, secondary: 0x1d4ed8 }, [
    ["Yashasvi Jain", 78, 78, 70],
    ["Vaibhav Sonawane", 86, 62, 88],
    ["Riyan Phukan", 72, 64, 70, 26, 60, 52, 62],
    ["Shimron Hinds", 78, 60, 76],
    ["Dhruv Joshi", 62, 70, 58],
    ["Ravindra Jadhav", 68, 66, 66, 24, 84, 68, 66],
    ["Donovan Fourie", 70, 50, 78],
    ["Jofra Ashford", 34, 32, 72, 86, 78, 82, 70],
    ["Nandre Bester", 22, 24, 70, 80, 70, 74, 58],
    ["Sandeep Saini", 20, 24, 68, 68, 78, 72, 62],
    ["Ravi Bhargava", 18, 22, 68, 24, 74, 70, 80],
  ]),

  franchise("lko", "LKO", "Lucknow", "Lucknow Nawabs", "Gomti Riverside", { primary: 0x0891b2, secondary: 0x166534 }, [
    ["Mitchell Morgan", 80, 68, 76, 62, 56, 58, 50],
    ["Aiden Marais", 70, 76, 60],
    ["Nicholas Persaud", 84, 60, 82],
    ["Rishabh Pandit", 80, 70, 78],
    ["Ayush Bhatt", 62, 64, 62],
    ["Abdul Saleem", 68, 48, 76],
    ["Shahbaz Alam", 50, 50, 62, 22, 70, 60, 62],
    ["Mohammed Shaikh", 26, 28, 68, 78, 78, 80, 62],
    ["Avesh Khatri", 22, 24, 70, 80, 66, 70, 58],
    ["Prince Yashpal", 18, 22, 68, 76, 70, 72, 56],
    ["Digvesh Rawat", 16, 20, 66, 20, 74, 66, 76],
  ]),

  franchise("amd", "AMD", "Ahmedabad", "Ahmedabad Kites", "Sabarmati Bowl", { primary: 0xf97316, secondary: 0x1e3a8a }, [
    ["Shubman Grewal", 76, 84, 58],
    ["Sai Subramanian", 66, 82, 52],
    ["Jos Barrett", 82, 72, 74],
    ["Washington Srinivasan", 62, 64, 60, 22, 76, 60, 64],
    ["Shahrukh Kazi", 78, 50, 80],
    ["Glenn Parker", 72, 58, 74, 24, 62, 56, 60],
    ["Rahul Tomar", 64, 52, 74, 22, 62, 54, 66],
    ["Rashid Karimi", 44, 36, 76, 24, 84, 80, 86],
    ["Kagiso Radebe", 28, 26, 70, 84, 76, 78, 62],
    ["Mohammed Sarwar", 20, 22, 68, 80, 74, 76, 60],
    ["Prasidh Kamath", 18, 20, 68, 78, 70, 72, 56],
  ]),

  franchise("pun", "PUN", "Mohali", "Punjab Panthers", "Mullanpur Meadow", { primary: 0xd91e2a, secondary: 0xe5e7eb }, [
    ["Priyansh Anand", 78, 62, 78],
    ["Prabhsimran Sekhon", 76, 68, 74],
    ["Shreyas Iyengar", 74, 80, 62],
    ["Nehal Wadhwa", 66, 72, 58],
    ["Shashank Suri", 74, 58, 78],
    ["Marcus Stanton", 74, 60, 72, 62, 60, 58, 54],
    ["Azmatullah Osmani", 70, 54, 74, 70, 60, 62, 56],
    ["Marco Joubert", 56, 48, 68, 80, 72, 78, 60],
    ["Xavier Bennett", 26, 28, 68, 74, 76, 74, 62],
    ["Arshdeep Sandhu", 20, 22, 68, 76, 80, 78, 66],
    ["Yuzvendra Chaudhary", 16, 20, 66, 20, 74, 72, 84],
  ]),
];

/**
 * Legends of the league, in the auction pool only. They belong to no side,
 * so they carry a badge of their own and never appear in the authored
 * elevens or the quick-match team list.
 */
export const LEGENDS: Franchise = franchise("leg", "LEG", "The Hall", "Legends", "The Pavilion", { primary: 0xb8860b, secondary: 0x1c1917 }, [
  ["AB de Vos", 84, 88, 72],
  ["Chris Garvey", 94, 64, 86],
  ["Sachin Thakur", 72, 92, 50],
  ["Virender Sethi", 86, 74, 88],
  ["Adam Gilmore", 84, 76, 78],
  ["Brendon McKenzie", 84, 68, 84],
  ["David Walsh", 82, 80, 72],
  ["Suresh Rawal", 76, 78, 66, 24, 62, 50, 58],
  ["Yuvraj Sangha", 84, 72, 74, 36, 64, 50, 62],
  ["Kieron Payne", 86, 58, 82, 62, 58, 56, 54],
  ["Andre Roberts", 92, 54, 88, 78, 58, 62, 60],
  ["Dwayne Brooks", 66, 56, 72, 58, 74, 64, 88],
  ["Harbhajan Sidhu", 30, 32, 70, 22, 82, 76, 72],
  ["Shane Whitfield", 30, 32, 70, 20, 84, 82, 90],
  ["Lasith Munasinghe", 18, 20, 70, 84, 82, 76, 84],
  ["Dale Strauss", 22, 24, 70, 88, 80, 86, 62],
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
