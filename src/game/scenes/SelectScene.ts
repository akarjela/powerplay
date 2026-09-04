import Phaser from "phaser";

import { LEAGUE } from "../../data/franchises";
import { createSeason } from "../../sim/tournament";
import { clearSeason, loadSeason, saveSeason } from "../season/store";
import { TeamScreen } from "../hud/screens/teamScreen";

/**
 * The team screen. The page itself is DOM (`hud/screens/teamScreen.ts`);
 * this scene is the ground behind it and the way into the others.
 */
export class SelectScene extends Phaser.Scene {
  private screen?: TeamScreen;

  constructor() {
    super("select");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#05070c");
    this.screen = new TeamScreen({
      savedSeason: () => loadSeason(),
      onQuickMatch: (bat, bowl) => this.scene.start("match", { bat: bat.id, bowl: bowl.id }),
      onNewSeason: (you) => {
        saveSeason(createSeason(LEAGUE.map((s) => s.id), you.id, `season-${Date.now()}`));
        this.scene.start("season");
      },
      onContinueSeason: () => this.scene.start("season"),
      onAbandonSeason: () => clearSeason(),
    }, loadSeason() ? "season" : "quick");
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.screen?.destroy();
      this.screen = undefined;
    });
  }
}
