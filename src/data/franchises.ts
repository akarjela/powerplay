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
    ["Rohit Saxena", 74, 76, 58],
    ["Ishan Kumar", 70, 80, 52],
    ["Suryakumar Joshi", 78, 74, 62],
    ["Tilak Reddy", 82, 70, 68],
    ["Krunal Pandit", 72, 66, 70, 45, 60, 55, 62],
    ["Kieron Phillips", 76, 60, 78, 72, 58, 60, 52],
    ["Tim Dawson", 58, 56, 66],
    ["Jasprit Bhatia", 40, 42, 70, 78, 70, 72, 60],
    ["Piyush Chandra", 30, 34, 72, 22, 78, 74, 70],
    ["Trent Baxter", 26, 24, 72, 82, 66, 76, 64],
    ["Karn Mishra", 18, 22, 70, 30, 74, 68, 66],
  ]),

  franchise("del", "DEL", "Delhi", "Delhi Sentinels", "Ridge Road Ground", { primary: 0xb91c1c, secondary: 0x94a3b8 }, [
    ["Prithvi Sahni", 68, 78, 50],
    ["Shikhar Duggal", 64, 74, 54],
    ["Shreyas Malhotra", 72, 76, 60],
    ["Mitchell Mason", 80, 62, 76, 60, 52, 58, 50],
    ["Rishabh Chauhan", 66, 70, 62],
    ["Axar Chaudhary", 60, 62, 64, 48, 64, 60, 66],
    ["Tristan Sterling", 56, 58, 66],
    ["Anrich Nel", 42, 40, 68, 70, 74, 70, 62],
    ["Kagiso Mokoena", 34, 36, 68, 76, 72, 74, 60],
    ["Kuldeep Rana", 24, 30, 70, 26, 76, 72, 68],
    ["Ishant Rawat", 20, 22, 70, 74, 68, 66, 58],
  ]),

  franchise("che", "CHE", "Chennai", "Chennai Cyclones", "Marina Coastal Stadium", { primary: 0xf5c518, secondary: 0x0f766e }, [
    ["Ruturaj Deshpande", 62, 84, 44],
    ["Faf van Rooyen", 60, 82, 48],
    ["Devon Cornwell", 70, 78, 56],
    ["Ambati Sekhar", 74, 76, 58],
    ["Ravindra Jaiswal", 68, 70, 62, 40, 70, 62, 66],
    ["Dwayne Baptiste", 78, 62, 74, 34, 66, 70, 72],
    ["Mahendra Sethi", 54, 62, 58],
    ["Ravichandran Anand", 36, 40, 66, 18, 84, 78, 76],
    ["Moeen Aslam", 30, 38, 64, 24, 80, 74, 72],
    ["Deepak Chaurasia", 28, 28, 68, 66, 76, 66, 60],
    ["Imran Tariq", 20, 26, 66, 14, 82, 70, 74],
  ]),

  franchise("kol", "KOL", "Kolkata", "Kolkata Monarchs", "Maidan Park", { primary: 0x6d28d9, secondary: 0xfbbf24 }, [
    ["Phil Sanders", 70, 68, 66],
    ["Gautam Bhasin", 66, 64, 70],
    ["Nitish Roy", 84, 66, 78],
    ["Venkatesh Iyengar", 76, 70, 68],
    ["Andre Rowe", 82, 58, 82, 62, 50, 56, 58],
    ["Sunil Nadeem", 64, 60, 72, 44, 58, 56, 64],
    ["Rinku Yadav", 56, 54, 70],
    ["Harshit Rajput", 40, 38, 74, 72, 62, 66, 60],
    ["Pat Cullen", 30, 30, 74, 80, 60, 70, 56],
    ["Varun Chatterjee", 26, 28, 72, 24, 70, 66, 70],
    ["Lockie Farrell", 22, 24, 72, 76, 66, 62, 58],
  ]),

  franchise("blr", "BLR", "Bengaluru", "Bengaluru Blazers", "Cubbon Fields", { primary: 0x9f1239, secondary: 0x111827 }, [
    ["Virat Singh", 76, 80, 56],
    ["Devdutt Hegde", 72, 74, 58],
    ["AB de Klerk", 84, 70, 66],
    ["Rajat Gowda", 78, 72, 64],
    ["Dinesh Kumar", 74, 68, 66],
    ["Glenn Mackenzie", 70, 62, 70, 56, 56, 54, 58],
    ["Anuj Pai", 60, 60, 64],
    ["Shahbaz Alam", 44, 40, 70, 48, 60, 58, 64],
    ["Mohammed Shakeel", 30, 34, 70, 70, 58, 60, 56],
    ["Yuzvendra Choudhary", 26, 28, 70, 20, 66, 62, 64],
    ["Josh Hadley", 28, 26, 72, 74, 62, 64, 54],
  ]),

  franchise("hyd", "HYD", "Hyderabad", "Hyderabad Falcons", "Charminar Stadium", { primary: 0xea580c, secondary: 0x1c1917 }, [
    ["Travis Hale", 68, 78, 52],
    ["Abhishek Reddy", 66, 76, 56],
    ["Aiden Marlow", 76, 72, 62],
    ["Heinrich Kruger", 72, 74, 60],
    ["Nitish Varma", 62, 64, 62, 52, 68, 66, 64],
    ["Marco Jonker", 62, 58, 66, 68, 70, 72, 62],
    ["Rahul Tewari", 52, 56, 60],
    ["Umran Mirza", 36, 36, 70, 84, 78, 82, 66],
    ["Rashid Karimi", 30, 32, 68, 22, 84, 80, 78],
    ["Bhuvneshwar Kaushik", 24, 26, 70, 78, 80, 78, 70],
    ["Washington Selvam", 18, 22, 68, 28, 82, 76, 74],
  ]),

  franchise("jai", "JAI", "Jaipur", "Jaipur Maharajas", "Amber Fort Ground", { primary: 0xdb2777, secondary: 0x1d4ed8 }, [
    ["Yashasvi Rathore", 66, 62, 68],
    ["Jos Barlow", 58, 70, 56],
    ["Sanju Sampath", 74, 64, 72],
    ["Shimron Haynes", 70, 60, 74],
    ["Riyan Meena", 64, 58, 70, 58, 56, 60, 62],
    ["Ben Stoddart", 68, 56, 72, 66, 62, 64, 66],
    ["Dhruv Bishnoi", 50, 52, 68],
    ["Jofra Alleyne", 38, 34, 72, 76, 60, 68, 64],
    ["Shane Wakefield", 28, 30, 72, 20, 68, 72, 74],
    ["Sandeep Verma", 24, 26, 70, 72, 64, 70, 58],
    ["Adam Zander", 20, 22, 70, 26, 66, 64, 70],
  ]),

  franchise("lko", "LKO", "Lucknow", "Lucknow Nawabs", "Gomti Riverside", { primary: 0x0891b2, secondary: 0x166534 }, [
    ["Lokesh Tiwari", 60, 84, 40],
    ["Quinton du Toit", 58, 80, 46],
    ["Nicholas Powell", 66, 78, 52],
    ["Kyle Marshall", 72, 76, 58],
    ["Ayush Bhatnagar", 62, 72, 56, 42, 72, 60, 64],
    ["Marcus Stone", 60, 66, 60, 50, 70, 62, 62],
    ["Deepak Pandey", 52, 62, 54],
    ["Mohsin Ansari", 34, 40, 62, 68, 80, 70, 66],
    ["Mark Woodward", 30, 34, 64, 72, 78, 72, 62],
    ["Ravi Kashyap", 24, 30, 62, 22, 82, 70, 72],
    ["Amit Gupta", 20, 24, 64, 30, 78, 68, 70],
  ]),

  franchise("amd", "AMD", "Ahmedabad", "Ahmedabad Kites", "Sabarmati Bowl", { primary: 0xf97316, secondary: 0x1e3a8a }, [
    ["Shubman Patel", 68, 74, 54],
    ["Sai Desai", 64, 72, 56],
    ["David Milner", 76, 70, 64],
    ["Wriddhiman Shah", 70, 68, 62],
    ["Rahul Solanki", 62, 62, 66, 66, 62, 64, 58],
    ["Hardik Pandit", 66, 58, 70, 80, 66, 72, 60],
    ["Vijay Chauhan", 54, 58, 62],
    ["Mohammed Shamim", 38, 36, 70, 86, 70, 78, 64],
    ["Umesh Parmar", 30, 34, 68, 82, 72, 74, 60],
    ["Jayant Rabari", 24, 28, 68, 20, 74, 68, 72],
    ["Yash Gohil", 18, 22, 68, 78, 68, 70, 62],
  ]),

  franchise("pun", "PUN", "Pune", "Pune Pioneers", "Deccan Gymkhana", { primary: 0x7f1d1d, secondary: 0xf8fafc }, [
    ["Ajinkya Deshmukh", 58, 64, 54],
    ["Manoj Jadhav", 54, 62, 56],
    ["Steve Sinclair", 88, 78, 66],
    ["Kevin Pearson", 62, 58, 64],
    ["Dan Christensen", 58, 58, 64, 54, 58, 58, 60],
    ["Thisara Fernando", 56, 54, 66, 46, 60, 56, 62],
    ["Kedar Kale", 50, 52, 62],
    ["Shardul Shinde", 36, 34, 70, 70, 64, 64, 58],
    ["Ankit Patil", 28, 30, 70, 24, 70, 66, 68],
    ["Jaydev Upadhyay", 26, 26, 70, 74, 62, 66, 56],
    ["Murugan Aswath", 20, 22, 68, 26, 68, 62, 66],
  ]),
];

export function franchiseById(id: string): Franchise {
  const found = FRANCHISES.find((f) => f.id === id);
  if (!found) throw new Error(`no franchise "${id}"`);
  return found;
}

export const LEAGUE: readonly Squad[] = FRANCHISES.map((f) => f.squad);

export function franchiseIn(season: Pick<Season, "rosters"> | null | undefined, id: string): Franchise {
  const f = franchiseById(id);
  const roster = season?.rosters?.[id];
  return roster ? { ...f, squad: roster } : f;
}
