import { describe, expect, it } from "vitest";
import { makeRng } from "../src/sim/rng";
import { simulateInnings, WICKETS } from "../src/sim/innings";
import { simulateFixture, createSeason, nextFixture, recordResult } from "../src/sim/tournament";
import { emptyExtras, howOut, sheetOf, tallyExtra, totalExtras } from "../src/sim/scorecard";
import { LEAGUE, franchiseById } from "../src/data/franchises";
import { makeLeague } from "./squads";

const league = makeLeague(makeRng("sheet-league"));

describe("the scoresheet of a simulated innings", () => {
  const innings = simulateInnings(league[0], league[1], makeRng("sheet"));
  const sheet = sheetOf(innings);

  it("carries the squad and the scoreline", () => {
    expect(sheet.squad).toBe(league[0].id);
    expect(sheet.runs).toBe(innings.runs);
    expect(sheet.wickets).toBe(innings.wickets);
    expect(sheet.balls).toBe(innings.balls);
  });

  it("lists everyone: those who batted in order, and those who did not", () => {
    const ids = [...sheet.batting.map((b) => b.id), ...sheet.didNotBat.map((b) => b.id)];
    expect(ids).toEqual(league[0].batters.map((b) => b.id));
    expect(sheet.batting.length).toBeLessThanOrEqual(sheet.wickets + 2);
    expect(sheet.batting.length).toBeGreaterThanOrEqual(Math.min(11, sheet.wickets + 2));
  });

  it("adds up: runs off the bat plus extras is the total", () => {
    const offTheBat = sheet.batting.reduce((n, b) => n + b.runs, 0);
    expect(offTheBat + totalExtras(sheet.extras)).toBe(sheet.runs);
  });

  it("records a fall of wickets that climbs, one entry a wicket, each naming a dismissed batter", () => {
    expect(sheet.fallOfWickets).toHaveLength(sheet.wickets);
    sheet.fallOfWickets.forEach((f, i) => {
      expect(f.wicket).toBe(i + 1);
      if (i > 0) expect(f.runs).toBeGreaterThanOrEqual(sheet.fallOfWickets[i - 1].runs);
      expect(f.runs).toBeLessThanOrEqual(sheet.runs);
      const line = sheet.batting.find((b) => b.id === f.batter)!;
      expect(line.dismissal).toBeDefined();
      expect(f.name).toBe(line.name);
    });
  });

  it("names the bowler on every dismissal that is his", () => {
    for (const b of sheet.batting) {
      if (!b.dismissal) continue;
      if (b.dismissal === "run-out") expect(b.bowler).toBeUndefined();
      else expect(innings.bowling.some((w) => w.bowler.name === b.bowler)).toBe(true);
    }
  });

  it("copies the bowling figures", () => {
    expect(sheet.bowling.map((w) => [w.id, w.balls, w.runs, w.wickets, w.maidens]))
      .toEqual(innings.bowling.map((w) => [w.bowler.id, w.balls, w.runs, w.wickets, w.maidens]));
  });

  it("is plain data that survives JSON", () => {
    expect(JSON.parse(JSON.stringify(sheet))).toEqual(sheet);
  });
});

describe("extras", () => {
  it("count a wide and a no-ball as one plus whatever was run, and byes as the runs", () => {
    const extras = emptyExtras();
    tallyExtra(extras, { runs: 0, extra: "wide", description: "" });
    tallyExtra(extras, { runs: 4, extra: "no-ball", description: "" });
    tallyExtra(extras, { runs: 2, extra: "bye", description: "" });
    tallyExtra(extras, { runs: 1, extra: "leg-bye", description: "" });
    tallyExtra(extras, { runs: 4, description: "" });
    expect(extras).toEqual({ wides: 1, noBalls: 5, byes: 2, legByes: 1 });
    expect(totalExtras(extras)).toBe(9);
  });
});

describe("how a batter was out", () => {
  it("reads like a scorecard", () => {
    expect(howOut({})).toBe("not out");
    expect(howOut({ dismissal: "bowled", bowler: "Bhatia" })).toBe("b Bhatia");
    expect(howOut({ dismissal: "caught", bowler: "Bhatia" })).toBe("ct b Bhatia");
    expect(howOut({ dismissal: "lbw", bowler: "Bhatia" })).toBe("lbw b Bhatia");
    expect(howOut({ dismissal: "stumped", bowler: "Bhatia" })).toBe("st b Bhatia");
    expect(howOut({ dismissal: "run-out" })).toBe("run out");
  });
});

describe("a season result", () => {
  it("carries a full scoresheet of both innings", () => {
    const season = createSeason(LEAGUE.map((s) => s.id), "mum", "sheets");
    const fixture = nextFixture(season)!;
    const played = simulateFixture(fixture, (id) => franchiseById(id).squad, makeRng("sheets"));
    expect(played.sheets).toBeDefined();
    expect(played.sheets!.first.squad).toBe(played.first.squad);
    expect(played.sheets!.second.runs).toBe(played.second.runs);
    expect(played.sheets!.first.batting.length + played.sheets!.first.didNotBat.length).toBe(11);
    expect(recordResult(season, played).results[0].sheets).toBe(played.sheets);
  });
});

describe("an all-out innings", () => {
  it("has ten wickets on the sheet and one man not out", () => {
    const cases = Array.from({ length: 30 }, (_, i) => simulateInnings(league[3], league[4], makeRng(`allout-${i}`)))
      .filter((inn) => inn.wickets >= WICKETS);
    expect(cases.length).toBeGreaterThan(0);
    for (const inn of cases) {
      const sheet = sheetOf(inn);
      expect(sheet.batting).toHaveLength(11);
      expect(sheet.didNotBat).toHaveLength(0);
      expect(sheet.batting.filter((b) => !b.dismissal)).toHaveLength(1);
      expect(sheet.fallOfWickets).toHaveLength(WICKETS);
    }
  });
});
