import type { Batter, Bowler, Squad } from "../sim/player";

/**
 * The ten franchises.
 *
 * Fictional names on real cities. Real IPL franchise names and player
 * likenesses are licensed, and this is meant to be publishable, so nothing
 * here is anyone. The names were chosen to avoid existing Indian sports
 * franchises as far as a reasonable check allows; they have not been cleared
 * against a trademark register, and should be before anything ships.
 *
 * Squads are the shape `src/sim/player.ts` reads: eleven in batting order, six
 * of whom bowl. The attributes were authored inside the ranges the generated
 * calibration league draws from -- a top order in the 60s and 70s, a tail in
 * the 20s, specialists around 70-80 with the ball -- so the season bands that
 * hold for the generated league hold for these too. `tests/franchises.test.ts`
 * checks that, and that no side is either hopeless or unbeatable.
 *
 * Each side has a character you should be able to feel from the crease:
 * Chennai's spinners give you nothing to hit, Hyderabad's quicks get you out,
 * Bengaluru's attack is there to be hit and their batting does the same to you.
 */

export interface Franchise {
  id: string;
  /** Three letters, for the scoreboard. */
  code: string;
  city: string;
  name: string;
  ground: string;
  colours: { primary: number; secondary: number };
  squad: Squad;
}

/**
 * One player, compactly: name, power, technique, aggression -- and, for those
 * who bowl, pace, accuracy, movement, variation.
 */
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
  // Power at the top and two genuine quicks. The side everyone wants to be.
  franchise("mum", "MUM", "Mumbai", "Mumbai Mariners", "Marine Lines Oval", { primary: 0x0b2a5b, secondary: 0xf2b632 }, [
    ["Arjun Malhotra", 74, 76, 58],
    ["Devansh Pillai", 70, 80, 52],
    ["Callum Whitlock", 78, 74, 62],
    ["Riyaan Sheikh", 82, 70, 68],
    ["Tarun Bhagat", 72, 66, 70, 45, 60, 55, 62],
    ["Jonah Mbeki", 76, 60, 78, 72, 58, 60, 52],
    ["Kiaan Vora", 58, 56, 66],
    ["Harsh Rathore", 40, 42, 70, 78, 70, 72, 60],
    ["Siddharth Menon", 30, 34, 72, 22, 78, 74, 70],
    ["Liam Farrow", 26, 24, 72, 82, 66, 76, 64],
    ["Om Trivedi", 18, 22, 70, 30, 74, 68, 66],
  ]),
  // Balanced, and a little dull for it. Wins the games it should.
  franchise("del", "DEL", "Delhi", "Delhi Sentinels", "Ridge Road Ground", { primary: 0xb91c1c, secondary: 0x94a3b8 }, [
    ["Yuvraj Chopra", 68, 78, 50],
    ["Nikhil Bedi", 64, 74, 54],
    ["Aarav Sehgal", 72, 76, 60],
    ["Marcus Delacroix", 80, 62, 76, 60, 52, 58, 50],
    ["Pranav Dixit", 66, 70, 62],
    ["Ravi Anand", 60, 62, 64, 48, 64, 60, 66],
    ["Zaid Qureshi", 56, 58, 66],
    ["Tejas Kamble", 42, 40, 68, 70, 74, 70, 62],
    ["Ewan Sutherland", 34, 36, 68, 76, 72, 74, 60],
    ["Vikrant Sahu", 24, 30, 70, 26, 76, 72, 68],
    ["Gaurav Thakur", 20, 22, 70, 74, 68, 66, 58],
  ]),
  // Spin, accuracy, and a top order that does not get out. Slow, and hard to beat.
  franchise("che", "CHE", "Chennai", "Chennai Cyclones", "Marina Coastal Stadium", { primary: 0xf5c518, secondary: 0x0f766e }, [
    ["Rahul Narayanan", 62, 84, 44],
    ["Keshav Iyer", 60, 82, 48],
    ["Rory Blackwood", 70, 78, 56],
    ["Vignesh Subramaniam", 74, 76, 58],
    ["Faizan Ali", 68, 70, 62, 40, 70, 62, 66],
    ["Dwayne Cassell", 78, 62, 74, 34, 66, 70, 72],
    ["Sanjay Krishnan", 54, 62, 58],
    ["Balaji Rao", 36, 40, 66, 18, 84, 78, 76],
    ["Adithya Venkatesh", 30, 38, 64, 24, 80, 74, 72],
    ["Mohammed Irfan", 28, 28, 68, 66, 76, 66, 60],
    ["Praveen Selvam", 20, 26, 66, 14, 82, 70, 74],
  ]),
  // Hitters, all the way down, and a bowling attack that bleeds. Never a dull game.
  franchise("kol", "KOL", "Kolkata", "Kolkata Monarchs", "Maidan Park", { primary: 0x6d28d9, secondary: 0xfbbf24 }, [
    ["Sourav Dutta", 70, 68, 66],
    ["Tanmay Ghosh", 66, 64, 70],
    ["Jarrod Kingsley", 84, 66, 78],
    ["Abhimanyu Sen", 76, 70, 68],
    ["Kwame Osei-Tutu", 82, 58, 82, 62, 50, 56, 58],
    ["Nitin Banerjee", 64, 60, 72, 44, 58, 56, 64],
    ["Debashish Roy", 56, 54, 70],
    ["Ankit Mondal", 40, 38, 74, 72, 62, 66, 60],
    ["Sohail Khan", 30, 30, 74, 80, 60, 70, 56],
    ["Ritwik Chatterjee", 26, 28, 72, 24, 70, 66, 70],
    ["Pieter van Wyk", 22, 24, 72, 76, 66, 62, 58],
  ]),
  // The best batting line-up in the league, and the worst attack. 200 plays 200.
  franchise("blr", "BLR", "Bengaluru", "Bengaluru Blazers", "Cubbon Fields", { primary: 0x9f1239, secondary: 0x111827 }, [
    ["Karthik Shetty", 76, 80, 56],
    ["Aditya Hegde", 72, 74, 58],
    ["Daniel Okafor", 84, 70, 66],
    ["Manish Gowda", 78, 72, 64],
    ["Ishaan Kulkarni", 74, 68, 66],
    ["Ben Hartley", 70, 62, 70, 56, 56, 54, 58],
    ["Rohit Pai", 60, 60, 64],
    ["Vishal Naik", 44, 40, 70, 48, 60, 58, 64],
    ["Shreyas Bhat", 30, 34, 70, 70, 58, 60, 56],
    ["Akash Poojary", 26, 28, 70, 20, 66, 62, 64],
    ["Travis Mulder", 28, 26, 72, 74, 62, 64, 54],
  ]),
  // The attack. Express pace, a spinner who turns it square, and a batting
  // order that only needs 150.
  franchise("hyd", "HYD", "Hyderabad", "Hyderabad Falcons", "Charminar Stadium", { primary: 0xea580c, secondary: 0x1c1917 }, [
    ["Sameer Baig", 68, 78, 52],
    ["Nakul Reddy", 66, 76, 56],
    ["Aiden Roux", 76, 72, 62],
    ["Vamsi Krishna", 72, 74, 60],
    ["Ahmed Hussain", 62, 64, 62, 52, 68, 66, 64],
    ["Tom Ashcroft", 62, 58, 66, 68, 70, 72, 62],
    ["Lokesh Yadav", 52, 56, 60],
    ["Rehan Mirza", 36, 36, 70, 84, 78, 82, 66],
    ["Sathvik Goud", 30, 32, 68, 22, 84, 80, 78],
    ["Farhan Shaikh", 24, 26, 70, 78, 80, 78, 70],
    ["Hemant Chary", 18, 22, 68, 28, 82, 76, 74],
  ]),
  // Young, brave, and inconsistent. Beats anyone on their day.
  franchise("jai", "JAI", "Jaipur", "Jaipur Maharajas", "Amber Fort Ground", { primary: 0xdb2777, secondary: 0x1d4ed8 }, [
    ["Lakshya Rathore", 66, 62, 68],
    ["Dhruv Choudhary", 58, 70, 56],
    ["Kieran Doyle", 74, 64, 72],
    ["Mahipal Singh", 70, 60, 74],
    ["Sahil Meena", 64, 58, 70, 58, 56, 60, 62],
    ["Jesse Whitaker", 68, 56, 72, 66, 62, 64, 66],
    ["Karan Bishnoi", 50, 52, 68],
    ["Naveen Jangid", 38, 34, 72, 76, 60, 68, 64],
    ["Anmol Sharma", 28, 30, 72, 20, 68, 72, 74],
    ["Shubham Verma", 24, 26, 70, 72, 64, 70, 58],
    ["Yash Saini", 20, 22, 70, 26, 66, 64, 70],
  ]),
  // Technique and patience. Grinds out 160 and defends it with line and length.
  franchise("lko", "LKO", "Lucknow", "Lucknow Nawabs", "Gomti Riverside", { primary: 0x0891b2, secondary: 0x166534 }, [
    ["Avinash Tiwari", 60, 84, 40],
    ["Mohit Srivastava", 58, 80, 46],
    ["Hamza Farooqui", 66, 78, 52],
    ["Nathan Pretorius", 72, 76, 58],
    ["Anurag Mishra", 62, 72, 56, 42, 72, 60, 64],
    ["Deepak Yadav", 60, 66, 60, 50, 70, 62, 62],
    ["Shivam Pandey", 52, 62, 54],
    ["Junaid Ansari", 34, 40, 62, 68, 80, 70, 66],
    ["Cormac Byrne", 30, 34, 64, 72, 78, 72, 62],
    ["Rohan Kashyap", 24, 30, 62, 22, 82, 70, 72],
    ["Piyush Gupta", 20, 24, 64, 30, 78, 68, 70],
  ]),
  // Pace, pace, pace. Four seamers who bowl 140 and a top order that keeps up.
  franchise("amd", "AMD", "Ahmedabad", "Ahmedabad Kites", "Sabarmati Bowl", { primary: 0xf97316, secondary: 0x1e3a8a }, [
    ["Jay Patel", 68, 74, 54],
    ["Parth Desai", 64, 72, 56],
    ["Lachlan Reid", 76, 70, 64],
    ["Nirav Shah", 70, 68, 62],
    ["Kunal Solanki", 62, 62, 66, 66, 62, 64, 58],
    ["Sipho Ndlovu", 66, 58, 70, 80, 66, 72, 60],
    ["Meet Chauhan", 54, 58, 62],
    ["Harshil Joshi", 38, 36, 70, 86, 70, 78, 64],
    ["Dhaval Parmar", 30, 34, 68, 82, 72, 74, 60],
    ["Umesh Rabari", 24, 28, 68, 20, 74, 68, 72],
    ["Bhavik Gohil", 18, 22, 68, 78, 68, 70, 62],
  ]),
  // One star and ten triers. The side you pick for a hard season.
  franchise("pun", "PUN", "Pune", "Pune Pioneers", "Deccan Gymkhana", { primary: 0x7f1d1d, secondary: 0xf8fafc }, [
    ["Omkar Deshmukh", 58, 64, 54],
    ["Sarthak Jadhav", 54, 62, 56],
    ["Aniket Pawar", 88, 78, 66],
    ["Ryan Castellano", 62, 58, 64],
    ["Pratik Bhosale", 58, 58, 64, 54, 58, 58, 60],
    ["Nikhil Sawant", 56, 54, 66, 46, 60, 56, 62],
    ["Swapnil Kale", 50, 52, 62],
    ["Vaibhav Shinde", 36, 34, 70, 70, 64, 64, 58],
    ["Ajinkya Patil", 28, 30, 70, 24, 70, 66, 68],
    ["Josh Fenwick", 26, 26, 70, 74, 62, 66, 56],
    ["Tushar More", 20, 22, 68, 26, 68, 62, 66],
  ]),
];

export function franchiseById(id: string): Franchise {
  const found = FRANCHISES.find((f) => f.id === id);
  if (!found) throw new Error(`no franchise "${id}"`);
  return found;
}

/** Every squad, for anything that wants a league rather than a franchise. */
export const LEAGUE: readonly Squad[] = FRANCHISES.map((f) => f.squad);
