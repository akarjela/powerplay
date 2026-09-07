import Phaser from "phaser";

import { FRANCHISES, LEAGUE } from "../../data/franchises";
import { createAuction, poolFrom } from "../../sim/auction";
import { createSeason } from "../../sim/tournament";
import { clearAuction, clearSeason, loadAuction, loadSeason, saveAuction, saveSeason } from "../season/store";
import { TeamScreen } from "../hud/screens/teamScreen";

export class SelectScene extends Phaser.Scene {
  private screen?: TeamScreen;

  constructor() {
    super("select");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#05070c");
    const ids = LEAGUE.map((s) => s.id);
    this.screen = new TeamScreen({
      savedSeason: () => loadSeason(),
      onQuickMatch: (bat, bowl) => this.scene.start("match", { bat: bat.id, bowl: bowl.id }),
      onNewSeason: (you) => {
        saveSeason(createSeason(ids, you.id, `season-${Date.now()}`));
        this.scene.start("season");
      },
      onContinueSeason: () => this.scene.start("season"),
      onAbandonSeason: () => clearSeason(),
      savedAuction: () => loadAuction(),
      onNewAuction: (you) => {
        saveAuction(createAuction(poolFrom(FRANCHISES), ids, you.id, `auction-${Date.now()}`));
        this.scene.start("auction");
      },
      onContinueAuction: () => this.scene.start("auction"),
      onAbandonAuction: () => clearAuction(),
    }, loadAuction() ? "auction" : loadSeason() ? "season" : "quick");
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.screen?.destroy();
      this.screen = undefined;
    });
  }
}
