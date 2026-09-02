import Phaser from "phaser";

import {
  BALL_RADIUS, BATTER_X, BOUNDARY, BOWLER_X, CANVAS, GROUND_Y, MAX_SCROLL,
  PX_PER_METRE, STUMP_HEIGHT, STUMP_WIDTH, kph, m,
} from "../config";
import { BAT_LENGTH, BAT_WIDTH } from "../config";
import { Bat } from "../physics/bat";
import { FIELD, bowled, catchableBy, caught, metresDownfield, resolveGroundedBall } from "../physics/field";
import type { Outcome } from "../../sim/types";

/** Milestone 1 uses one hardcoded bowler. M3 replaces this with squad data. */
const BOWLER = { name: "Quick", paceKph: 138 };

/** Balls settle slowly; stop waiting once it is clearly finished. */
const SETTLED_SPEED = 0.35;

export class MatchScene extends Phaser.Scene {
  private bat!: Bat;
  private ball?: MatterJS.BodyType;
  private ballGfx!: Phaser.GameObjects.Arc;
  private batGfx!: Phaser.GameObjects.Rectangle;

  private awaitingResult = false;
  private hasBounced = false;
  private struck = false;
  private score = 0;
  private wickets = 0;
  private ballsFaced = 0;

  private statusText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super("match");
  }

  create(): void {
    this.matter.world.setBounds(0, -2000, CANVAS.width * 4, 3000);
    this.cameras.main.setBackgroundColor("#183b1f");

    this.drawGround();

    this.bat = new Bat(this, BATTER_X + 22, GROUND_Y - 62);
    this.batGfx = this.add.rectangle(0, 0, BAT_WIDTH, BAT_LENGTH, 0xe8d6a0).setDepth(5);

    this.ballGfx = this.add.circle(0, 0, BALL_RADIUS, 0xc4342b).setDepth(6).setVisible(false);

    this.scoreText = this.add.text(20, 16, "", {
      fontFamily: "monospace", fontSize: "26px", color: "#ffffff",
    }).setScrollFactor(0).setDepth(20);

    this.statusText = this.add.text(20, 52, "Drag to swing. Click to face the first ball.", {
      fontFamily: "monospace", fontSize: "17px", color: "#cfe8d2",
    }).setScrollFactor(0).setDepth(20);

    this.updateScore();

    this.input.on("pointerdown", () => {
      if (!this.ball && !this.awaitingResult) this.bowl();
    });
  }

  private drawGround(): void {
    const g = this.add.graphics().setDepth(0);

    g.fillStyle(0x2d6b36).fillRect(0, GROUND_Y, CANVAS.width * 4, 400);
    // The pitch strip.
    g.fillStyle(0xc9b481).fillRect(BATTER_X - m(2), GROUND_Y - 5, BOWLER_X - BATTER_X + m(4), 10);

    // Boundary rope.
    g.lineStyle(4, 0xffffff, 0.9);
    g.lineBetween(BATTER_X + BOUNDARY, GROUND_Y - 30, BATTER_X + BOUNDARY, GROUND_Y);

    // Distance markers every 10m -- makes the physics legible while tuning.
    for (let d = 10; d <= 70; d += 10) {
      const x = BATTER_X + m(d);
      g.lineStyle(1, 0xffffff, 0.18).lineBetween(x, GROUND_Y - 14, x, GROUND_Y);
      this.add.text(x, GROUND_Y + 6, `${d}m`, {
        fontFamily: "monospace", fontSize: "11px", color: "#9fc3a6",
      }).setOrigin(0.5, 0).setDepth(1);
    }

    for (const fielder of FIELD) {
      const x = BATTER_X + m(fielder.distance);
      this.add.circle(x, GROUND_Y - 13, 13, 0x1d4ed8).setDepth(2);
      this.add.text(x, GROUND_Y - 32, fielder.name, {
        fontFamily: "monospace", fontSize: "11px", color: "#dbeafe",
      }).setOrigin(0.5, 1).setDepth(2);
    }

    // Stumps at both ends.
    for (const x of [BATTER_X, BOWLER_X]) {
      this.add.rectangle(x, GROUND_Y - STUMP_HEIGHT / 2, STUMP_WIDTH, STUMP_HEIGHT, 0xf5f5f0).setDepth(3);
    }
  }

  private bowl(): void {
    this.hasBounced = false;
    this.struck = false;
    this.awaitingResult = false;

    // Released from around head height at the bowler's end.
    const ball = this.matter.add.circle(BOWLER_X, GROUND_Y - 90, BALL_RADIUS, {
      restitution: 0.55,
      friction: 0.04,
      frictionAir: 0.006,
      density: 0.008,
      label: "ball",
    });

    // Aimed slightly down, to pitch on a length rather than arrive as a full toss.
    this.matter.body.setVelocity(ball, { x: -kph(BOWLER.paceKph), y: kph(BOWLER.paceKph) * 0.09 });

    this.ball = ball;
    this.ballGfx.setVisible(true);
    this.statusText.setText(`${BOWLER.name} runs in — ${BOWLER.paceKph}kph`);
  }

  update(): void {
    this.bat.update(this.input.activePointer);
    this.batGfx.setPosition(this.bat.body.position.x, this.bat.body.position.y);
    this.batGfx.setRotation(this.bat.body.angle);

    const ball = this.ball;
    if (!ball) return;

    this.ballGfx.setPosition(ball.position.x, ball.position.y);
    this.cameras.main.scrollX = Phaser.Math.Clamp(ball.position.x - CANVAS.width * 0.42, 0, MAX_SCROLL);

    // Struck once it is travelling downfield again.
    if (!this.struck && ball.velocity.x > 1) {
      this.struck = true;
      this.statusText.setText("Middled it!");
    }

    if (!this.hasBounced && ball.position.y >= GROUND_Y - BALL_RADIUS - 1) this.hasBounced = true;

    // Bowled: the ball reaches the stumps without being hit.
    if (!this.struck && ball.position.x <= BATTER_X + STUMP_WIDTH && ball.position.y > GROUND_Y - STUMP_HEIGHT) {
      return this.resolve(bowled());
    }

    if (this.struck) {
      const fielder = catchableBy(ball.position.x, ball.position.y);
      if (fielder && ball.velocity.y > 0) return this.resolve(caught(fielder));

      const clearedOnTheFull = !this.hasBounced && metresDownfield(ball.position.x) >= BOUNDARY / PX_PER_METRE;
      if (clearedOnTheFull) return this.resolve(resolveGroundedBall(ball.position.x, true));
    }

    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    const settled = speed < SETTLED_SPEED && ball.position.y >= GROUND_Y - BALL_RADIUS - 2;
    const gone = metresDownfield(ball.position.x) >= BOUNDARY / PX_PER_METRE;

    if (settled || gone) {
      if (!this.struck) return this.resolve({ runs: 0, description: "Beaten. No shot offered." });
      return this.resolve(resolveGroundedBall(ball.position.x, false));
    }
  }

  private resolve(outcome: Outcome): void {
    if (this.awaitingResult) return;
    this.awaitingResult = true;

    this.score += outcome.runs;
    this.ballsFaced += 1;
    if (outcome.wicket) this.wickets += 1;

    this.updateScore();
    this.statusText.setText(`${outcome.description}   —   click to face the next ball`);

    if (this.ball) this.matter.world.remove(this.ball);
    this.ball = undefined;
    this.ballGfx.setVisible(false);

    this.time.delayedCall(150, () => { this.awaitingResult = false; });
  }

  private updateScore(): void {
    const overs = `${Math.floor(this.ballsFaced / 6)}.${this.ballsFaced % 6}`;
    this.scoreText.setText(`${this.score}/${this.wickets}   (${overs} ov)`);
  }
}
