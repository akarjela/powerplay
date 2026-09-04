import Phaser from "phaser";

import { franchiseById } from "../../data/franchises";
import { loadSeason, saveSeason, clearSeason } from "../season/store";
import {
  fate, involvesYou, isOver, nextFixture, playoffs, recordResult, resultFor, simulateFixture,
} from "../../sim/tournament";
import type { Fixture, Season } from "../../sim/tournament";
import { makeRng } from "../../sim/rng";
import { hideFate, showFate } from "../hud/fateCard";
import { SeasonScreen } from "../hud/screens/seasonScreen";

/**
 * The season, between matches. The page is DOM (`hud/screens/seasonScreen.ts`);
 * this scene owns the saved season, resolves fixtures, and tells you your
 * fate once.
 */
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
    // A tick later, so a restart's shutdown of the previous instance can
    // never hide a card this one has just shown.
    this.time.delayedCall(30, () => this.tell());
  }

  private render(): void {
    this.screen?.render(this.season);
  }

  /**
   * The end of your season, once. A trophy if you won it; a card if you were
   * beaten in the final or knocked out. Remembered on the season so a reload
   * does not say it again.
   */
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
    showFate({
      fate: outcome,
      team: { name: you.name, primary: you.colours.primary, secondary: you.colours.secondary },
      by: outcome.kind === "runner-up" ? beatenBy("final") : outcome.kind === "eliminated" && outcome.stage !== "league" ? beatenBy(outcome.stage) : undefined,
      onClose: () => this.render(),
      onNewSeason: outcome.kind === "champion" || outcome.kind === "runner-up" || isOver(this.season)
        ? () => { clearSeason(); this.scene.start("select"); }
        : undefined,
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
      season = recordResult(season, simulateFixture(fixture, (id) => franchiseById(id).squad, rng));
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
