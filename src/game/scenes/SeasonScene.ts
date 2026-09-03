import Phaser from "phaser";

import { CANVAS } from "../config";
import { franchiseById } from "../../data/franchises";
import { loadSeason, saveSeason, clearSeason } from "../season/store";
import {
  champion, involvesYou, isOver, nextFixture, playoffs, recordResult, simulateFixture, standings,
} from "../../sim/tournament";
import type { Fixture, Season } from "../../sim/tournament";
import { makeRng } from "../../sim/rng";
import { oversOf } from "../../sim/innings";

/**
 * The season, between matches.
 *
 * The table on the left, the fixture in hand on the right. A fixture of yours
 * is played with a bat; anyone else's is resolved by the model on the spot.
 * "Sim to my next match" runs the others until it is your turn, which is what
 * a tournament round looks like from the inside: your game, and four results
 * that were decided while you played it.
 */

const FONT = "system-ui, -apple-system, Segoe UI, sans-serif";
const STAGE_NAME: Record<Fixture["stage"], string> = {
  league: "League", qualifier1: "Qualifier 1", eliminator: "Eliminator", qualifier2: "Qualifier 2", final: "Final",
};

export class SeasonScene extends Phaser.Scene {
  private season!: Season;
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super("season");
  }

  create(): void {
    const season = loadSeason();
    if (!season) {
      this.scene.start("select");
      return;
    }
    this.season = season;
    this.add.rectangle(0, 0, CANVAS.width, CANVAS.height, 0x08111f).setOrigin(0);
    this.add.rectangle(0, 0, CANVAS.width, 6, franchiseById(season.you).colours.primary).setOrigin(0);
    this.root = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.root.removeAll(true);
    const you = franchiseById(this.season.you);

    this.text(40, 22, "SEASON", { fontSize: "30px", color: "#ffffff", fontStyle: "bold", letterSpacing: 4 });
    this.text(215, 36, you.name, { fontSize: "15px", color: "#94a3b8" }).setOrigin(0, 0.5);

    this.table();
    this.fixturePanel();
    this.recent();

    this.button(CANVAS.width - 40 - 130, 22, 130, 36, "TEAMS", 0x1e293b, "#e2e8f0", () => this.scene.start("select"));
  }

  private table(): void {
    const x = 40;
    const y = 80;
    const rows = standings(this.season);
    const cols = [
      ["#", 0], ["Team", 34], ["P", 300], ["W", 340], ["L", 380], ["T", 420], ["Pts", 466], ["NRR", 528],
    ] as const;

    this.root.add(this.add.rectangle(x, y, 600, 30 + rows.length * 32 + 12, 0x0c1730).setOrigin(0).setStrokeStyle(1, 0x1e293b));
    for (const [label, dx] of cols) {
      this.text(x + 16 + dx, y + 10, label, { fontSize: "11px", color: "#64748b", fontStyle: "bold" });
    }

    rows.forEach((row, i) => {
      const ry = y + 34 + i * 32;
      const f = franchiseById(row.squad);
      const mine = row.squad === this.season.you;
      const top4 = i < 4;
      if (mine) this.root.add(this.add.rectangle(x + 2, ry - 4, 596, 30, 0x162544).setOrigin(0));
      if (top4) this.root.add(this.add.rectangle(x + 2, ry - 4, 4, 30, 0xfbbf24).setOrigin(0));
      this.root.add(this.add.rectangle(x + 16 + 34, ry + 2, 6, 18, f.colours.primary).setOrigin(0));
      this.text(x + 16, ry + 3, String(i + 1), { fontSize: "13px", color: "#94a3b8" });
      this.text(x + 16 + 46, ry + 2, `${f.code}  ${f.name}`, { fontSize: "14px", color: mine ? "#fbbf24" : "#e2e8f0", fontStyle: mine ? "bold" : "normal" });
      this.text(x + 16 + 300, ry + 3, String(row.played), { fontSize: "13px", color: "#cbd5e1" });
      this.text(x + 16 + 340, ry + 3, String(row.won), { fontSize: "13px", color: "#cbd5e1" });
      this.text(x + 16 + 380, ry + 3, String(row.lost), { fontSize: "13px", color: "#cbd5e1" });
      this.text(x + 16 + 420, ry + 3, String(row.tied), { fontSize: "13px", color: "#cbd5e1" });
      this.text(x + 16 + 466, ry + 2, String(row.points), { fontSize: "15px", color: "#ffffff", fontStyle: "bold" });
      this.text(x + 16 + 528, ry + 3, `${row.nrr >= 0 ? "+" : ""}${row.nrr.toFixed(3)}`, { fontSize: "13px", color: row.nrr >= 0 ? "#86efac" : "#fca5a5" });
    });
    this.text(x, y + 34 + rows.length * 32 + 4, "Top four go to the playoffs. Two points a win, one a tie; net run rate splits ties.", { fontSize: "11px", color: "#475569" });
  }

  private fixturePanel(): void {
    const x = 680;
    const y = 80;
    const w = CANVAS.width - 40 - x;
    this.root.add(this.add.rectangle(x, y, w, 250, 0x0c1730).setOrigin(0).setStrokeStyle(1, 0x1e293b));

    if (isOver(this.season)) {
      const winner = franchiseById(champion(this.season)!);
      this.root.add(this.add.rectangle(x, y, w, 250, winner.colours.primary, 0.25).setOrigin(0));
      this.text(x + 24, y + 22, "CHAMPIONS", { fontSize: "13px", color: "#fbbf24", fontStyle: "bold", letterSpacing: 3 });
      this.text(x + 24, y + 48, winner.name, { fontSize: "30px", color: "#ffffff", fontStyle: "bold" });
      const yours = winner.id === this.season.you;
      this.text(x + 24, y + 96, yours ? "Your season. Take a bow." : `${franchiseById(this.season.you).name} finished ${this.finishText()}.`, { fontSize: "14px", color: "#cbd5e1" });
      this.button(x + 24, y + 180, 200, 44, "NEW SEASON", 0xfbbf24, "#08111f", () => { clearSeason(); this.scene.start("select"); });
      return;
    }

    const fixture = nextFixture(this.season)!;
    const home = franchiseById(fixture.home);
    const away = franchiseById(fixture.away);
    const yours = involvesYou(this.season, fixture);

    this.text(x + 24, y + 18, fixture.stage === "league" ? `ROUND ${fixture.round} OF 9` : STAGE_NAME[fixture.stage].toUpperCase(), { fontSize: "12px", color: "#64748b", fontStyle: "bold", letterSpacing: 2 });
    this.text(x + 24, y + 42, yours ? "Your next match" : "Next match", { fontSize: "13px", color: "#94a3b8" });

    this.root.add(this.add.rectangle(x + 24, y + 72, 10, 40, home.colours.primary).setOrigin(0));
    this.text(x + 44, y + 70, home.name, { fontSize: "20px", color: fixture.home === this.season.you ? "#fbbf24" : "#ffffff", fontStyle: "bold" });
    this.text(x + 44, y + 94, "v", { fontSize: "12px", color: "#64748b" });
    this.root.add(this.add.rectangle(x + 24, y + 116, 10, 40, away.colours.primary).setOrigin(0));
    this.text(x + 44, y + 114, away.name, { fontSize: "20px", color: fixture.away === this.season.you ? "#fbbf24" : "#ffffff", fontStyle: "bold" });
    this.text(x + 44, y + 140, `at ${home.ground}`, { fontSize: "11px", color: "#64748b" });

    if (yours) {
      this.button(x + 24, y + 186, 180, 44, "PLAY  ▶", 0xfbbf24, "#08111f", () => this.play(fixture));
    } else {
      this.button(x + 24, y + 186, 180, 44, "SIMULATE", 0x38bdf8, "#08111f", () => this.simulate([fixture]));
      this.button(x + 216, y + 186, 230, 44, "SIM TO MY NEXT MATCH", 0x1e293b, "#e2e8f0", () => this.simulateToYou());
    }

    if (fixture.stage !== "league") {
      const bracket = playoffs(this.season).map((f) => `${STAGE_NAME[f.stage]}: ${franchiseById(f.home).code} v ${franchiseById(f.away).code}`).join("   ·   ");
      this.text(x + 24, y + 160, bracket, { fontSize: "11px", color: "#94a3b8" });
    }
  }

  /** The last five results, newest first. */
  private recent(): void {
    const x = 680;
    const y = 350;
    const w = CANVAS.width - 40 - x;
    const results = this.season.results.slice(-6).reverse();
    this.root.add(this.add.rectangle(x, y, w, 300, 0x0c1730).setOrigin(0).setStrokeStyle(1, 0x1e293b));
    this.text(x + 24, y + 14, "RESULTS", { fontSize: "12px", color: "#64748b", fontStyle: "bold", letterSpacing: 2 });
    if (results.length === 0) {
      this.text(x + 24, y + 44, "Nothing played yet.", { fontSize: "13px", color: "#475569" });
    }
    results.forEach((r, i) => {
      const ry = y + 42 + i * 42;
      const a = franchiseById(r.first.squad);
      const b = franchiseById(r.second.squad);
      const mine = r.first.squad === this.season.you || r.second.squad === this.season.you;
      this.text(x + 24, ry, `${a.code} ${r.first.runs}/${r.first.wickets} (${oversOf(r.first.balls)})   ${b.code} ${r.second.runs}/${r.second.wickets} (${oversOf(r.second.balls)})`, {
        fontSize: "13px", color: mine ? "#fbbf24" : "#e2e8f0", fontStyle: "bold",
      });
      this.text(x + 24, ry + 18, r.summary, { fontSize: "11px", color: "#94a3b8" });
    });
  }

  private finishText(): string {
    const place = standings(this.season).findIndex((s) => s.squad === this.season.you) + 1;
    const suffix = place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th";
    return `${place}${suffix} in the league`;
  }

  private play(fixture: Fixture): void {
    const bat = this.season.you;
    const bowl = fixture.home === bat ? fixture.away : fixture.home;
    this.scene.start("match", { bat, bowl, fixtureId: fixture.id });
  }

  private simulate(fixtures: Fixture[]): void {
    let season = this.season;
    for (const fixture of fixtures) {
      const rng = makeRng(`${season.seed}:${fixture.id}`);
      season = recordResult(season, simulateFixture(fixture, (id) => franchiseById(id).squad, rng));
    }
    this.season = season;
    saveSeason(season);
    this.render();
  }

  private simulateToYou(): void {
    for (let guard = 0; guard < 60; guard++) {
      const fixture = nextFixture(this.season);
      if (!fixture || involvesYou(this.season, fixture)) break;
      this.simulate([fixture]);
    }
  }

  private text(x: number, y: number, value: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, value, { fontFamily: FONT, ...style });
    this.root.add(t);
    return t;
  }

  private button(x: number, y: number, w: number, h: number, label: string, fill: number, colour: string, onClick: () => void): void {
    const frame = this.add.rectangle(x, y, w, h, fill).setOrigin(0).setInteractive({ useHandCursor: true });
    const text = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: "15px", color: colour, fontStyle: "bold" }).setOrigin(0.5);
    frame.on("pointerover", () => frame.setAlpha(0.85));
    frame.on("pointerout", () => frame.setAlpha(1));
    frame.on("pointerdown", onClick);
    this.root.add([frame, text]);
  }
}
