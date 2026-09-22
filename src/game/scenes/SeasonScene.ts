import Phaser from "phaser";

import { franchiseById, franchiseIn } from "../../data/franchises";
import { loadSeason, saveSeason, clearSeason } from "../season/store";
import {
  fate, fixtureById, involvesYou, isOver, nextFixture, playoffs, recordResult, resultFor, simulateFixture,
} from "../../sim/tournament";
import type { Fixture, Played, Season } from "../../sim/tournament";
import { makeRng } from "../../sim/rng";
import { hideFate, showFate } from "../hud/fateCard";
import { hideScoresheet, showScoresheet } from "../hud/scoresheet";
import type { ScoresheetSide } from "../hud/scoresheet";
import { STAGE_NAME, SeasonScreen } from "../hud/screens/seasonScreen";

export class SeasonScene extends Phaser.Scene {
  private season!: Season;
  private screen?: SeasonScreen;

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
    this.cameras.main.setBackgroundColor("#05070c");
    this.screen = new SeasonScreen({
      onPlay: (fixture) => this.play(fixture),
      onSimulate: (fixtures) => this.simulate(fixtures),
      onSimulateToYou: () => this.simulateToYou(),
      onTeams: () => this.scene.start("select"),
      onNewSeason: () => {
        clearSeason();
        this.scene.start("select");
      },
      onScoresheet: (played) => this.scoresheet(played),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      hideFate();
      hideScoresheet();
      this.screen?.destroy();
      this.screen = undefined;
    });
    this.render();

    this.time.delayedCall(30, () => this.tell());
  }

  private render(): void {
    this.screen?.render(this.season);
  }

  private tell(): void {
    const outcome = fate(this.season);
    if (!outcome || this.season.told === outcome.kind) return;
    this.season = { ...this.season, told: outcome.kind };
    saveSeason(this.season);
    const you = franchiseById(this.season.you);
    const beatenBy = (stage: "final" | "eliminator" | "qualifier2") => {
      const f = playoffs(this.season).find((x) => x.stage === stage);
      if (!f) return undefined;
      const other = f.home === this.season.you ? f.away : f.home;
      return resultFor(this.season, f.id) ? franchiseById(other).name : undefined;
    };
    let by: string | undefined;
    if (outcome.kind === "runner-up") by = beatenBy("final");
    else if (outcome.kind === "eliminated" && outcome.stage !== "league") by = beatenBy(outcome.stage);

    const finished = outcome.kind === "champion" || outcome.kind === "runner-up" || isOver(this.season);

    showFate({
      fate: outcome,
      team: { name: you.name, primary: you.colours.primary, secondary: you.colours.secondary },
      by,
      onClose: () => this.render(),
      onNewSeason: finished ? () => { clearSeason(); this.scene.start("select"); } : undefined,
    });
  }

  private scoresheet(played: Played): void {
    if (!played.sheets) return;
    const fixture = fixtureById(this.season, played.fixtureId);
    const side = (id: string): ScoresheetSide => {
      const f = franchiseById(id);
      return { id: f.id, code: f.code, name: f.name, primary: f.colours.primary, secondary: f.colours.secondary };
    };
    const first = { sheet: played.sheets.first, batting: side(played.first.squad), bowling: side(played.second.squad) };
    const second = { sheet: played.sheets.second, batting: side(played.second.squad), bowling: side(played.first.squad), target: played.first.runs + 1 };
    const mine = involvesYou(this.season, fixture);
    const stage = fixture.stage === "league" ? `Round ${fixture.round}` : STAGE_NAME[fixture.stage];
    showScoresheet({
      title: `${stage}: ${franchiseById(fixture.home).name} v ${franchiseById(fixture.away).name}`,
      result: played.summary,
      innings: [first, second],
      you: this.season.you,
      tone: mine ? (played.winner === this.season.you ? "won" : played.winner ? "lost" : "neutral") : undefined,
      actions: [{ label: "Close", primary: true, onPick: () => undefined }],
    });
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
      season = recordResult(season, simulateFixture(fixture, (id) => franchiseIn(season, id).squad, rng));
    }
    this.season = season;
    saveSeason(season);
    this.render();
    this.tell();
  }

  private simulateToYou(): void {
    for (let guard = 0; guard < 60; guard++) {
      const fixture = nextFixture(this.season);
      if (!fixture || involvesYou(this.season, fixture)) break;
      this.simulate([fixture]);
    }
  }
}
