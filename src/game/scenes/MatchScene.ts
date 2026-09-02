import Phaser from "phaser";

import {
  BALL_RADIUS, BATTER_X, BOUNDARY, BOWLER_X, CANVAS, DELIVERY_SHAPE, GROUND_Y,
  MAX_SCROLL, PX_PER_METRE, STUMP_HEIGHT, STUMP_WIDTH, deliveryAim, kph, m,
} from "../config";
import { Bat } from "../physics/bat";
import { FIELD, bowled, catchableBy, caught, metresDownfield, resolveGroundedBall } from "../physics/field";
import { BallSprite, drawBatsman, drawFielder, drawStumps, makeBat } from "../visuals/figures";
import { drawStadium } from "../visuals/stadium";
import type { Outcome } from "../../sim/types";
import { HumanInnings } from "../humanInnings";
import { bowl, phaseOf } from "../../sim/delivery";
import type { Delivery, Phase } from "../../sim/delivery";
import { BALLS_PER_OVER } from "../../sim/innings";
import { makeRng } from "../../sim/rng";
import type { Rng } from "../../sim/rng";
import type { Bowler } from "../../sim/player";

/**
 * One placeholder bowler until squads land in M3.
 *
 * The attributes are real now, not decorative: `bowl()` in the simulation turns
 * them into a length, a line and a speed, and the scene renders whatever it is
 * handed. So the attack you face already changes with the numbers here.
 */
const BOWLER: Bowler = {
  id: "rana", name: "Rana", pace: 62, accuracy: 64, movement: 58, variation: 55,
};

/** Balls settle slowly; stop waiting once it is clearly finished. */
const SETTLED_SPEED = 0.35;

/**
 * Behind this the ball is the keeper's and the delivery is over.
 *
 * Without it a play-and-miss took 2.55s to resolve: the ball carried on past
 * the batter, bounced off the left wall of the world and trickled back before
 * `SETTLED_SPEED` was satisfied. That barely mattered while every miss was
 * bowled, and matters a lot now that most misses are not.
 */
const KEEPER_X = BATTER_X - m(2);

export class MatchScene extends Phaser.Scene {
  private bat!: Bat;
  private batGfx!: Phaser.GameObjects.Container;
  private ball?: MatterJS.BodyType;
  private ballSprite!: BallSprite;

  private awaitingResult = false;
  private hasBounced = false;
  private struck = false;
  private innings = new HumanInnings();
  /** Seeded, so an innings can be replayed. The sim's rule, kept on this side. */
  private rng: Rng = makeRng("powerplay");
  private delivery?: Delivery;

  private scoreText!: Phaser.GameObjects.Text;
  private rateText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private overMarks!: Phaser.GameObjects.Text;
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
      if (this.innings.complete) return this.restart();
      if (!this.ball && !this.awaitingResult) this.bowl();
    });
  }

  /**
   * A broadcast strip along the bottom, rather than a box in the corner.
   *
   * The old HUD printed `44/48` and nobody could tell whether that was a
   * scoring bug or a display one -- it was neither, it was an innings with no
   * end. A strip laid out the way television lays it out makes the state
   * legible at a glance: score, overs, run rate, and the over so far. When the
   * numbers are wrong you can see that they are wrong.
   */
  private buildHud(): void {
    const height = 62;
    const top = CANVAS.height - height;

    this.add.rectangle(0, top, CANVAS.width, height, 0x08111f, 0.88)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(20);
    // A colour bar reads as a broadcast graphic and is where the batting
    // franchise's colours go in M4.
    this.add.rectangle(0, top, 6, height, 0x38bdf8)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(21);

    this.scoreText = this.add.text(26, top + 12, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "30px", color: "#ffffff", fontStyle: "bold",
    }).setScrollFactor(0).setDepth(21);

    this.rateText = this.add.text(26, top + 44, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#7dd3fc",
    }).setScrollFactor(0).setDepth(21);

    this.overMarks = this.add.text(CANVAS.width - 26, top + 14, "", {
      fontFamily: "ui-monospace, Menlo, monospace", fontSize: "20px", color: "#e2e8f0",
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(21);

    this.statusText = this.add.text(CANVAS.width - 26, top + 44, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#94a3b8",
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(21);

    // Big centred call for the result of a ball -- "SIX!", "Caught at mid-on".
    this.callText = this.add.text(CANVAS.width / 2, 150, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "44px", color: "#ffffff", fontStyle: "bold",
      stroke: "#0a1428", strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(22).setAlpha(0);

    this.updateHud("Click to face up. Move the mouse to swing.");
  }

  /** A finished innings is a dead end without this. */
  private restart(): void {
    this.innings = new HumanInnings();
    this.rng = makeRng("powerplay");
    this.updateHud("Click to face up. Move the mouse to swing.");
    this.callText.setAlpha(0);
  }

  private bowl(): void {
    this.hasBounced = false;
    this.struck = false;
    this.awaitingResult = false;

    const over = Math.floor(this.innings.balls / BALLS_PER_OVER);
    const delivery = this.nextDelivery(phaseOf(over));
    this.delivery = delivery;

    const shape = DELIVERY_SHAPE[delivery.length];
    const ball = this.matter.add.circle(BOWLER_X, GROUND_Y - shape.releaseUp, BALL_RADIUS, {
      restitution: shape.restitution,
      friction: 0.04,
      frictionAir: 0.006,
      density: 0.008,
      label: "ball",
    });

    const pace = kph(delivery.speed);
    this.matter.body.setVelocity(ball, {
      x: -pace,
      y: pace * deliveryAim(shape, delivery.speed),
    });

    this.ball = ball;
    this.ballSprite.setVisible(true);
    // The speed is fair to show -- you can see a quick one coming. The length is
    // not, and is only revealed once the ball has been played.
    this.updateHud(`${BOWLER.name} in — ${Math.round(delivery.speed)}kph`);
  }

  /**
   * A legal delivery.
   *
   * The simulation produces wides and no-balls, and this scene cannot yet show
   * one: the view is purely side-on, so there is no leg side to bowl down, and
   * a bouncer over the batter's head does not work either -- measured, even at
   * restitution 0.99 the ball tops out at 69px against a blade that reaches
   * 114px, so it is always playable and would never be called. Rolling them
   * away keeps the scene honest about what it can draw, at the cost of a human
   * innings conceding no extras. Track 3 gives wides somewhere to go.
   */
  private nextDelivery(phase: Phase): Delivery {
    for (let attempt = 0; attempt < 30; attempt++) {
      const delivery = bowl(BOWLER, phase, this.rng);
      if (!delivery.illegal) return delivery;
    }
    throw new Error("bowl() produced 30 illegal deliveries in a row");
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

    /**
     * The stumps are a box, not a half-plane.
     *
     * This used to test `x <= BATTER_X + STUMP_WIDTH` with no lower bound, so
     * it stayed true for every x behind the stumps too: a ball that passed
     * safely over them and then dropped as it carried on to the keeper was
     * scored as bowled, several frames after it had already gone by.
     */
    const overTheStumps = Math.abs(ball.position.x - BATTER_X) <= STUMP_WIDTH;
    if (!this.struck && overTheStumps && ball.position.y > GROUND_Y - STUMP_HEIGHT) {
      return this.resolve(bowled());
    }

    if (!this.struck && ball.position.x < KEEPER_X) {
      return this.resolve({ runs: 0, description: "Beaten — through to the keeper." });
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

    this.innings.record(outcome);

    this.announce(outcome);
    const next = this.innings.complete ? "Click to start a new innings" : "Click for the next ball";
    // Naming the length afterwards is how a player learns to read the bounce.
    this.updateHud(this.delivery ? `${this.delivery.length} length   ·   ${next}` : next);

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
    const text = this.innings.complete
      ? `${this.innings.closedBecause} — ${this.innings.score} (${this.innings.oversText})`
      : outcome.description;
    this.callText.setText(text).setColor(colour).setAlpha(1).setScale(0.85);

    this.tweens.add({ targets: this.callText, scale: 1, duration: 180, ease: "Back.easeOut" });
    // The closing card stays up; every other call fades.
    if (!this.innings.complete) {
      this.tweens.add({ targets: this.callText, alpha: 0, delay: 1100, duration: 400 });
    }
  }

  private updateHud(status: string): void {
    const innings = this.innings;
    this.scoreText.setText(`${innings.score}   (${innings.oversText})`);
    this.rateText.setText(`CRR ${innings.runRate.toFixed(2)}`);
    this.overMarks.setText(innings.thisOver.map((ball) => ball.label).join(" "));
    this.statusText.setText(status);
  }
}
