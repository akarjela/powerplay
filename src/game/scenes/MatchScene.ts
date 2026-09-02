import Phaser from "phaser";

import {
  BALL_RADIUS, BATTER_X, BOUNDARY, BOWLER_X, CANVAS, GROUND_Y, MAX_SCROLL,
  PX_PER_METRE, STUMP_HEIGHT, STUMP_WIDTH, kph, m,
} from "../config";
import { Bat } from "../physics/bat";
import { FIELD, bowled, catchableBy, caught, metresDownfield, resolveGroundedBall } from "../physics/field";
import { BallSprite, drawBatsman, drawFielder, drawStumps, makeBat } from "../visuals/figures";
import { drawStadium } from "../visuals/stadium";
import type { Outcome } from "../../sim/types";

/** Milestone 1 uses one hardcoded bowler. M3 replaces this with squad data. */
const BOWLER = { name: "Rana", paceKph: 138 };

/** Balls settle slowly; stop waiting once it is clearly finished. */
const SETTLED_SPEED = 0.35;

export class MatchScene extends Phaser.Scene {
  private bat!: Bat;
  private batGfx!: Phaser.GameObjects.Container;
  private ball?: MatterJS.BodyType;
  private ballSprite!: BallSprite;

  private awaitingResult = false;
  private hasBounced = false;
  private struck = false;
  private score = 0;
  private wickets = 0;
  private ballsFaced = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private callText!: Phaser.GameObjects.Text;

  constructor() {
    super("match");
  }

  create(): void {
    const groundWidth = BATTER_X + BOUNDARY + 400;
    // Ceiling and side walls only. The floor is a real body at GROUND_Y, below,
    // because the world bounds sit at the bottom of the whole simulated volume
    // and the outfield is 400px above that.
    this.matter.world.setBounds(0, -3000, groundWidth, 4000);

    /**
     * The outfield, as physics rather than just paint.
     *
     * Without this the ball falls straight through the drawn pitch. It never
     * bounces, and by the time it reaches the crease it is ~100px below the
     * bat's arc -- so the bat cannot touch it at any swing timing, which reads
     * as "the swing is broken" when the swing is fine and the ground is missing.
     */
    this.matter.add.rectangle(groundWidth / 2, GROUND_Y + 60, groundWidth, 120, {
      isStatic: true,
      label: "ground",
      friction: 0.75,
      // A cricket ball off a hard pitch keeps a good deal of pace.
      restitution: 0.42,
    });

    drawStadium(this);
    for (const fielder of FIELD) drawFielder(this, BATTER_X + m(fielder.distance), fielder.name);
    drawStumps(this, BATTER_X);
    drawStumps(this, BOWLER_X);

    const handsY = GROUND_Y - 62;
    drawBatsman(this, BATTER_X + 4, handsY);

    this.bat = new Bat(this, BATTER_X + 22, handsY);
    this.batGfx = makeBat(this);
    this.ballSprite = new BallSprite(this);

    this.buildHud();

    this.input.on("pointerdown", () => {
      if (!this.ball && !this.awaitingResult) this.bowl();
    });
  }

  private buildHud(): void {
    this.add.rectangle(16, 14, 250, 76, 0x0a1428, 0.75)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(20)
      .setStrokeStyle(1, 0xffffff, 0.14);

    this.scoreText = this.add.text(30, 24, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "30px", color: "#ffffff", fontStyle: "bold",
    }).setScrollFactor(0).setDepth(21);

    this.statusText = this.add.text(30, 62, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#8fb8a0",
    }).setScrollFactor(0).setDepth(21);

    // Big centred call for the result of a ball -- "SIX!", "Caught at mid-on".
    this.callText = this.add.text(CANVAS.width / 2, 150, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "44px", color: "#ffffff", fontStyle: "bold",
      stroke: "#0a1428", strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(22).setAlpha(0);

    this.updateHud("Click to face up. Move the mouse to swing.");
  }

  private bowl(): void {
    this.hasBounced = false;
    this.struck = false;
    this.awaitingResult = false;

    const ball = this.matter.add.circle(BOWLER_X, GROUND_Y - 90, BALL_RADIUS, {
      restitution: 0.55,
      friction: 0.04,
      frictionAir: 0.006,
      density: 0.008,
      label: "ball",
    });

    // Aimed slightly down, so it pitches on a length rather than arriving as a
    // full toss.
    this.matter.body.setVelocity(ball, { x: -kph(BOWLER.paceKph), y: kph(BOWLER.paceKph) * 0.09 });

    this.ball = ball;
    this.ballSprite.setVisible(true);
    this.updateHud(`${BOWLER.name} in — ${BOWLER.paceKph}kph`);
  }

  update(): void {
    this.bat.update(this.input.activePointer);
    this.batGfx.setPosition(this.bat.body.position.x, this.bat.body.position.y);
    this.batGfx.setRotation(this.bat.body.angle);

    const ball = this.ball;
    if (!ball) return;

    this.ballSprite.update(ball.position.x, ball.position.y);
    this.cameras.main.scrollX = Phaser.Math.Clamp(
      ball.position.x - CANVAS.width * 0.42, 0, MAX_SCROLL,
    );

    if (!this.struck && ball.velocity.x > 1) {
      this.struck = true;
      this.cameras.main.shake(90, 0.004);
    }

    if (!this.hasBounced && ball.position.y >= GROUND_Y - BALL_RADIUS - 1) this.hasBounced = true;

    if (!this.struck && ball.position.x <= BATTER_X + STUMP_WIDTH && ball.position.y > GROUND_Y - STUMP_HEIGHT) {
      return this.resolve(bowled());
    }

    if (this.struck) {
      const fielder = catchableBy(ball.position.x, ball.position.y);
      if (fielder && ball.velocity.y > 0) return this.resolve(caught(fielder));

      if (!this.hasBounced && metresDownfield(ball.position.x) >= BOUNDARY / PX_PER_METRE) {
        return this.resolve(resolveGroundedBall(ball.position.x, true));
      }
    }

    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    const settled = speed < SETTLED_SPEED && ball.position.y >= GROUND_Y - BALL_RADIUS - 2;
    const gone = metresDownfield(ball.position.x) >= BOUNDARY / PX_PER_METRE;

    if (settled || gone) {
      if (!this.struck) return this.resolve({ runs: 0, description: "Beaten, no shot." });
      return this.resolve(resolveGroundedBall(ball.position.x, false));
    }
  }

  private resolve(outcome: Outcome): void {
    if (this.awaitingResult) return;
    this.awaitingResult = true;

    this.score += outcome.runs;
    this.ballsFaced += 1;
    if (outcome.wicket) this.wickets += 1;

    this.announce(outcome);
    this.updateHud("Click for the next ball");

    if (this.ball) this.matter.world.remove(this.ball);
    this.ball = undefined;
    this.ballSprite.setVisible(false);

    this.time.delayedCall(400, () => {
      this.awaitingResult = false;
      this.cameras.main.scrollX = 0;
    });
  }

  private announce(outcome: Outcome): void {
    const colour = outcome.wicket ? "#f87171" : outcome.runs >= 4 ? "#fbbf24" : "#e2e8f0";
    this.callText.setText(outcome.description).setColor(colour).setAlpha(1).setScale(0.85);

    this.tweens.add({ targets: this.callText, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.callText, alpha: 0, delay: 1100, duration: 400 });
  }

  private updateHud(status: string): void {
    const overs = `${Math.floor(this.ballsFaced / 6)}.${this.ballsFaced % 6}`;
    this.scoreText.setText(`${this.score}/${this.wickets}`);
    this.statusText.setText(`${overs} overs   ·   ${status}`);
  }
}
