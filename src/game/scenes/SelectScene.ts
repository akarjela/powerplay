import Phaser from "phaser";

import { CANVAS } from "../config";
import { FRANCHISES } from "../../data/franchises";
import type { Franchise } from "../../data/franchises";
import type { Batter, Bowler } from "../../sim/player";

/**
 * Pick your side, and theirs.
 *
 * Ten cards. The first click is the side you bat for, the second is the side
 * you face; click a chosen card again to unpick it. Both elevens are laid out
 * below with their ratings as bars, because the attributes are the whole
 * point of the squads -- you should be able to see that Hyderabad's quicks
 * will get you out and Bengaluru's will not before you choose to face them.
 */

const FONT = "system-ui, -apple-system, Segoe UI, sans-serif";

const CARD_W = 228;
const CARD_H = 92;
const CARD_GAP = 14;
const GRID_TOP = 92;

export class SelectScene extends Phaser.Scene {
  private batting?: Franchise;
  private bowling?: Franchise;
  private cards = new Map<string, { frame: Phaser.GameObjects.Rectangle; tag: Phaser.GameObjects.Text }>();
  private panels!: Phaser.GameObjects.Container;
  private playButton!: Phaser.GameObjects.Container;

  constructor() {
    super("select");
  }

  create(): void {
    this.add.rectangle(0, 0, CANVAS.width, CANVAS.height, 0x08111f).setOrigin(0);
    this.add.rectangle(0, 0, CANVAS.width, 6, 0x38bdf8).setOrigin(0);

    this.add.text(40, 22, "POWERPLAY", {
      fontFamily: FONT, fontSize: "34px", color: "#ffffff", fontStyle: "bold", letterSpacing: 4,
    });
    this.add.text(CANVAS.width - 40, 34, "Pick the side you bat for, then the side you face.", {
      fontFamily: FONT, fontSize: "14px", color: "#94a3b8",
    }).setOrigin(1, 0.5);

    FRANCHISES.forEach((franchise, i) => this.card(franchise, i));

    this.panels = this.add.container(0, 0);
    this.playButton = this.button();
    this.refresh();
  }

  private card(franchise: Franchise, index: number): void {
    const col = index % 5;
    const row = Math.floor(index / 5);
    const x = 40 + col * (CARD_W + CARD_GAP);
    const y = GRID_TOP + row * (CARD_H + CARD_GAP);

    const frame = this.add.rectangle(x, y, CARD_W, CARD_H, 0x0f1b33).setOrigin(0)
      .setStrokeStyle(2, 0x1e293b).setInteractive({ useHandCursor: true });
    this.add.rectangle(x, y, 10, CARD_H, franchise.colours.primary).setOrigin(0);
    this.add.rectangle(x + 10, y, 4, CARD_H, franchise.colours.secondary).setOrigin(0);

    this.add.text(x + 26, y + 12, franchise.code, {
      fontFamily: FONT, fontSize: "26px", color: "#ffffff", fontStyle: "bold",
    });
    // A swatch of the kit, since the code is white for legibility.
    this.add.rectangle(x + CARD_W - 40, y + CARD_H - 22, 22, 10, franchise.colours.primary).setOrigin(0);
    this.add.rectangle(x + CARD_W - 18, y + CARD_H - 22, 6, 10, franchise.colours.secondary).setOrigin(0);
    this.add.text(x + 26, y + 44, franchise.name, {
      fontFamily: FONT, fontSize: "14px", color: "#e2e8f0", fontStyle: "bold",
    });
    this.add.text(x + 26, y + 64, franchise.ground, {
      fontFamily: FONT, fontSize: "11px", color: "#64748b",
    });
    const tag = this.add.text(x + CARD_W - 12, y + 12, "", {
      fontFamily: FONT, fontSize: "11px", color: "#08111f", fontStyle: "bold",
      backgroundColor: "#fbbf24", padding: { x: 6, y: 3 },
    }).setOrigin(1, 0).setVisible(false);

    frame.on("pointerover", () => { if (!this.isChosen(franchise)) frame.setStrokeStyle(2, 0x475569); });
    frame.on("pointerout", () => { if (!this.isChosen(franchise)) frame.setStrokeStyle(2, 0x1e293b); });
    frame.on("pointerdown", () => this.pick(franchise));

    this.cards.set(franchise.id, { frame, tag });
  }

  private isChosen(f: Franchise): boolean {
    return this.batting?.id === f.id || this.bowling?.id === f.id;
  }

  private pick(f: Franchise): void {
    if (this.batting?.id === f.id) {
      this.batting = this.bowling;
      this.bowling = undefined;
    } else if (this.bowling?.id === f.id) {
      this.bowling = undefined;
    } else if (!this.batting) {
      this.batting = f;
    } else if (!this.bowling) {
      this.bowling = f;
    } else {
      this.bowling = f;
    }
    this.refresh();
  }

  private refresh(): void {
    for (const franchise of FRANCHISES) {
      const { frame, tag } = this.cards.get(franchise.id)!;
      const you = this.batting?.id === franchise.id;
      const them = this.bowling?.id === franchise.id;
      frame.setStrokeStyle(2, you ? 0xfbbf24 : them ? 0x38bdf8 : 0x1e293b);
      frame.setFillStyle(you || them ? 0x162544 : 0x0f1b33);
      tag.setVisible(you || them).setText(you ? "YOU BAT" : "YOU FACE")
        .setBackgroundColor(you ? "#fbbf24" : "#38bdf8");
    }

    this.panels.removeAll(true);
    const top = GRID_TOP + 2 * (CARD_H + CARD_GAP) + 14;
    if (this.batting) this.squadPanel(this.batting, 40, top, "Your batting order", true);
    else this.hint(40, top, "Click a card to choose the side you bat for.");
    if (this.bowling) this.squadPanel(this.bowling, CANVAS.width / 2 + 20, top, "Their attack", false);
    else if (this.batting) this.hint(CANVAS.width / 2 + 20, top, "Now click the side you want to face.");

    const ready = Boolean(this.batting && this.bowling);
    this.playButton.setVisible(ready);
  }

  private hint(x: number, y: number, text: string): void {
    this.panels.add(this.add.text(x, y + 8, text, {
      fontFamily: FONT, fontSize: "14px", color: "#64748b",
    }));
  }

  /**
   * An eleven with rating bars. For the side you bat for that is the batting
   * attributes; for the side you face it is the six bowlers first, with the
   * ball's attributes, because that is what you are about to meet.
   */
  private squadPanel(f: Franchise, x: number, y: number, title: string, batting: boolean): void {
    const c = this.panels;
    const width = CANVAS.width / 2 - 60;
    c.add(this.add.rectangle(x, y, width, 296, 0x0c1730).setOrigin(0).setStrokeStyle(1, 0x1e293b));
    c.add(this.add.rectangle(x, y, 6, 296, f.colours.primary).setOrigin(0));
    c.add(this.add.text(x + 18, y + 10, `${title}  ·  ${f.name}`, {
      fontFamily: FONT, fontSize: "13px", color: "#cbd5e1", fontStyle: "bold",
    }));

    const labels = batting ? ["POW", "TEC", "AGG"] : ["PACE", "ACC", "MOV", "VAR"];
    labels.forEach((label, i) => {
      c.add(this.add.text(x + width - 24 - (labels.length - 1 - i) * 62, y + 12, label, {
        fontFamily: FONT, fontSize: "9px", color: "#64748b",
      }).setOrigin(1, 0));
    });

    const rows: { name: string; values: number[]; role: string }[] = batting
      ? f.squad.batters.map((b: Batter, i) => ({
        name: `${i + 1}. ${b.name}`, values: [b.power, b.technique, b.aggression],
        role: f.squad.bowlers.some((w) => w.id === b.id) ? "all-rounder" : "",
      }))
      : [
        ...f.squad.bowlers.map((w: Bowler) => ({
          name: w.name, values: [w.pace, w.accuracy, w.movement, w.variation],
          role: w.pace < 35 ? "spin" : w.pace > 70 ? "fast" : "seam",
        })),
        ...f.squad.batters.filter((b) => !f.squad.bowlers.some((w) => w.id === b.id)).map((b) => ({
          name: b.name, values: [], role: "bat",
        })),
      ];

    rows.forEach((row, i) => {
      const ry = y + 34 + i * 23;
      c.add(this.add.text(x + 18, ry, row.name, {
        fontFamily: FONT, fontSize: "12px", color: "#e2e8f0",
      }));
      if (row.role) {
        c.add(this.add.text(x + 200, ry + 1, row.role, {
          fontFamily: FONT, fontSize: "10px", color: "#64748b",
        }));
      }
      row.values.forEach((v, j) => {
        const bx = x + width - 24 - (row.values.length - 1 - j) * 62 - 48;
        c.add(this.add.rectangle(bx, ry + 5, 48, 7, 0x1e293b).setOrigin(0));
        const colour = v >= 75 ? 0x22c55e : v >= 55 ? 0xfbbf24 : v >= 40 ? 0xf97316 : 0x64748b;
        c.add(this.add.rectangle(bx, ry + 5, (48 * v) / 100, 7, colour).setOrigin(0));
      });
    });
  }

  private button(): Phaser.GameObjects.Container {
    const w = 200;
    const h = 46;
    const x = CANVAS.width - 40 - w;
    const y = 30;
    const c = this.add.container(0, 0).setDepth(5);
    const frame = this.add.rectangle(x, y, w, h, 0xfbbf24).setOrigin(0).setInteractive({ useHandCursor: true });
    const label = this.add.text(x + w / 2, y + h / 2, "PLAY  ▶", {
      fontFamily: FONT, fontSize: "18px", color: "#08111f", fontStyle: "bold",
    }).setOrigin(0.5);
    frame.on("pointerover", () => frame.setFillStyle(0xfcd34d));
    frame.on("pointerout", () => frame.setFillStyle(0xfbbf24));
    frame.on("pointerdown", () => {
      if (this.batting && this.bowling) {
        this.scene.start("match", { bat: this.batting.id, bowl: this.bowling.id });
      }
    });
    c.add([frame, label]);
    return c;
  }
}
