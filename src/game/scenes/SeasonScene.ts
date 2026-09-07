import Phaser from "phaser";

import { franchiseById, franchiseIn } from "../../data/franchises";
import { loadSeason, saveSeason, clearSeason } from "../season/store";
import {
  fate, involvesYou, isOver, nextFixture, playoffs, recordResult, resultFor, simulateFixture,
} from "../../sim/tournament";
import type { Fixture, Season } from "../../sim/tournament";
import { makeRng } from "../../sim/rng";
import { hideFate, showFate } from "../hud/fateCard";
import { SeasonScreen } from "../hud/screens/seasonScreen";

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
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      hideFate();
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
