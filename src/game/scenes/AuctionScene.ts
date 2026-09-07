import Phaser from "phaser";

import { LEAGUE, franchiseById } from "../../data/franchises";
import { rosters } from "../../sim/auction";
import { createSeason } from "../../sim/tournament";
import { clearAuction, loadAuction, saveAuction, saveSeason } from "../season/store";
import { AuctionScreen } from "../hud/screens/auctionScreen";

export class AuctionScene extends Phaser.Scene {
  private screen?: AuctionScreen;

  constructor() {
    super("auction");
  }

  create(): void {
    const auction = loadAuction();
    if (!auction) {
      this.scene.start("select");
      return;
    }
    this.cameras.main.setBackgroundColor("#05070c");
    this.screen = new AuctionScreen(auction, {
      onChange: (a) => saveAuction(a),
      onStartSeason: (a) => {
        const season = createSeason(LEAGUE.map((s) => s.id), a.you, `season-${Date.now()}`);
        saveSeason({ ...season, rosters: rosters(a, (id) => franchiseById(id).name) });
        clearAuction();
        this.scene.start("season");
      },
      onTeams: () => this.scene.start("select"),
      onAbandon: () => {
        clearAuction();
        this.scene.start("select");
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.screen?.destroy();
      this.screen = undefined;
    });
  }
}
