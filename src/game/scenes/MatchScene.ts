import Phaser from "phaser";

import {
  BALL_BODY, BALL_RADIUS, BATTER_X, BOWLER_X, CANVAS, DELIVERY_SHAPE, GLOVE_LOCAL_X, GROUND_BODY,
  GROUND_Y, MAX_SCROLL, PIVOT, WIDE_BALL_MASK, WORLD_LEFT, WORLD_WIDTH, deliveryAim, kph,
} from "../config";
import type { Stance } from "../config";
import { Bat } from "../physics/bat";
import { contactDamping } from "../physics/swing";
import {
  fieldFor, isRolling, judgeBall, metresDownfield, rollingVelocity,
} from "../physics/field";
import type { Fielder } from "../physics/field";
import { project, shotBearing, travelledBearing } from "../physics/direction";
import type { Bearing } from "../physics/direction";
import { BallSprite, drawBatsman, drawFielder, drawStumps, makeBat } from "../visuals/figures";
import { drawStadium } from "../visuals/stadium";
import { Radar } from "../visuals/radar";
import type { Outcome } from "../../sim/types";
import { HumanInnings } from "../humanInnings";
import { bowl, phaseOf } from "../../sim/delivery";
import type { Delivery, Phase } from "../../sim/delivery";
import { BALLS_PER_OVER, chooseBowler } from "../../sim/innings";
import { makeRng } from "../../sim/rng";
import type { Rng } from "../../sim/rng";
import type { Bowler } from "../../sim/player";
import { FRANCHISES, franchiseById } from "../../data/franchises";
import type { Franchise } from "../../data/franchises";

const STANCE_LABEL: Record<Stance, string> = {
  front: "FRONT FOOT",
  back: "BACK FOOT",
  neutral: "no stance",
};

const STANCE_COLOUR: Record<Stance, string> = {
  front: "#fbbf24",
  back: "#38bdf8",
  neutral: "#64748b",
};

/**
 * Which two sides are playing. You bat; they bowl.
 *
 * Until M4 hands the scene a fixture, the pair comes from the URL --
 * `?bat=pun&bowl=hyd` -- so every attack in the league can be faced without
 * editing code. The defaults are the league's most even contest.
 */
function pickSides(): { batting: Franchise; bowling: Franchise } {
  const params = new URLSearchParams(window.location.search);
  const lookup = (key: string, fallback: Franchise) => {
    const id = params.get(key);
    try {
      return id ? franchiseById(id) : fallback;
    } catch {
      return fallback;
    }
  };
  const batting = lookup("bat", FRANCHISES[0]);
  let bowling = lookup("bowl", FRANCHISES[2]);
  if (bowling.id === batting.id) bowling = FRANCHISES.find((f) => f.id !== batting.id)!;
  return { batting, bowling };
}

export class MatchScene extends Phaser.Scene {
  private bat!: Bat;
  private batGfx!: Phaser.GameObjects.Container;
  private ball?: MatterJS.BodyType;
  private ballSprite!: BallSprite;
  private radar!: Radar;

  private awaitingResult = false;
  private struck = false;
  /**
   * The bat struck the ball during the last physics frame, and the soft-hands
   * rule has not yet been applied. Matter's solver runs *after* the collision
   * event, so the damping has to wait for the next rendered frame.
   */
  private justStruck = false;
  private contactAngularVelocity = 0;
  private struckAt = 0;
  /**
   * Has the ball touched the ground *since being hit*? This is what decides a
   * catch, and whether a boundary is six or four. There used to be a flag set
   * when the *delivery* pitched, which was already true by the time it could
   * have meant anything.
   */
  private bouncedAfterStrike = false;
  /** Radial metres where the struck ball first landed. */
  private landingM = 0;
  /** Where the shot went. Zero until the bat says otherwise. */
  private bearing: Bearing = 0;

  private innings = new HumanInnings();
  /** Seeded, so an innings can be replayed. The sim's rule, kept on this side. */
  private rng: Rng = makeRng("powerplay");
  private delivery?: Delivery;
  private batsman!: Phaser.GameObjects.Container;
  private stance: Stance = "neutral";
  private stanceText!: Phaser.GameObjects.Text;
  private keys!: Record<"front" | "back" | "frontAlt" | "backAlt", Phaser.Input.Keyboard.Key>;

  private sides = pickSides();
  private bowler?: Bowler;
  private lastBowler: Bowler | null = null;
  private ballsByBowler = new Map<string, number>();
  private currentOver = -1;
  private phase: Phase = "powerplay";
  private field: Fielder[] = fieldFor("powerplay");
  private fielders: Phaser.GameObjects.Container[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private rateText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private overMarks!: Phaser.GameObjects.Text;
  private callText!: Phaser.GameObjects.Text;

  constructor() {
    super("match");
  }

  create(): void {
    // Ceiling and side walls only. The floor is a real body at GROUND_Y, below,
    // because the world bounds sit at the bottom of the whole simulated volume
    // and the outfield is 400px above that. The world starts behind the batter
    // now, because a glance to fine leg goes that way.
    const width = WORLD_WIDTH - WORLD_LEFT;
    this.matter.world.setBounds(WORLD_LEFT, -3000, width, 4000);

    /**
     * The outfield, as physics rather than just paint.
     *
     * Without this the ball falls straight through the drawn pitch. It never
     * bounces, and by the time it reaches the crease it is ~100px below the
     * bat's arc -- so the bat cannot touch it at any swing timing, which reads
     * as "the swing is broken" when the swing is fine and the ground is missing.
     */
    this.matter.add.rectangle(WORLD_LEFT + width / 2, GROUND_Y + 60, width, 120, {
      isStatic: true,
      label: "ground",
      ...GROUND_BODY,
    });

    drawStadium(this);
    this.setField(fieldFor(this.phase));
    drawStumps(this, BATTER_X);
    drawStumps(this, BOWLER_X);

    // One pivot, two consumers. These used to be set independently and were 8px
    // apart, which was invisible while both stood still.
    this.batsman = drawBatsman(this, PIVOT.x - GLOVE_LOCAL_X, PIVOT.y);
    this.bat = new Bat(this, PIVOT.x, PIVOT.y);
    this.batGfx = makeBat(this);
    this.ballSprite = new BallSprite(this);

    this.buildHud();

    /**
     * Bounce and contact come from collision events, not from sampling.
     *
     * `update()` runs once a rendered frame, 60 times a second, while the
     * physics steps 240 times. A struck ball can touch down and be back in the
     * air inside a single frame, so a position test simply never sees it -- and
     * a ball that had bounced still counted as catchable, which kept a third of
     * every shot in the game a catch even after the bounce rule was added.
     * Matter raises the collision at the step, so this cannot miss it. It is the
     * same 60Hz-sampling trap that made the bat pass through the ball.
     */
    this.matter.world.on("collisionstart", (event: { pairs: { bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }[] }) => {
      for (const pair of event.pairs) {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        if (!labels.includes("ball") || !this.ball) continue;

        if (labels.includes("ground") && this.struck && !this.bouncedAfterStrike) {
          this.bouncedAfterStrike = true;
          this.landingM = Math.abs(metresDownfield(this.ball.position.x));
        }
        if (labels.includes("bat") && !this.struck) {
          this.struck = true;
          this.justStruck = true;
          this.struckAt = this.time.now;
          this.contactAngularVelocity = this.bat.body.angularVelocity;
          // Where on the arc the ball was met is the shot's direction. Read it
          // here, at the step it happened, not a frame later.
          this.bearing = shotBearing({
            aheadPx: this.ball.position.x - this.bat.pivotPoint.x,
            length: this.delivery!.length,
            line: this.delivery!.line,
            spray: this.rng.range(-1, 1),
          });
          this.cameras.main.shake(90, 0.004);
        }
      }
    });

    this.input.on("pointerdown", () => {
      if (this.innings.complete) return this.restart();
      if (!this.ball && !this.awaitingResult) this.bowl();
    });

    // The first keys bound in the project. The mouse keeps doing only the swing.
    const keyboard = this.input.keyboard!;
    this.keys = {
      back: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      front: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      backAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      frontAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
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
    const { batting, bowling } = this.sides;

    this.add.rectangle(0, top, CANVAS.width, height, 0x08111f, 0.88)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(20);
    // The batting franchise's colours, where a broadcast graphic puts them.
    this.add.rectangle(0, top, 6, height, batting.colours.primary)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(21);
    this.add.rectangle(6, top, 3, height, batting.colours.secondary)
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

    this.stanceText = this.add.text(330, top + 20, STANCE_LABEL.neutral, {
      fontFamily: "system-ui, sans-serif", fontSize: "15px", color: STANCE_COLOUR.neutral,
      fontStyle: "bold",
    }).setScrollFactor(0).setDepth(21);

    this.add.text(330, top + 40, "← back    → front", {
      fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#64748b",
    }).setScrollFactor(0).setDepth(21);

    this.statusText = this.add.text(CANVAS.width - 26, top + 44, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#94a3b8",
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(21);

    // Big centred call for the result of a ball -- "SIX!", "Caught at mid-on".
    this.callText = this.add.text(CANVAS.width / 2, 150, "", {
      fontFamily: "system-ui, sans-serif", fontSize: "44px", color: "#ffffff", fontStyle: "bold",
      stroke: "#0a1428", strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(22).setAlpha(0);

    // The plan view, top right, out of the way of a lofted six.
    this.radar = new Radar(this, CANVAS.width - 96, 96, 70);
    this.radar.setField(this.field);
    this.add.text(CANVAS.width - 96, 176, `${batting.name} v ${bowling.name}`, {
      fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#cbd5e1",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31);

    this.updateHud("Click to face up. Move the mouse to swing.");
  }

  /** A finished innings is a dead end without this. */
  private restart(): void {
    this.innings = new HumanInnings();
    this.rng = makeRng("powerplay");
    this.ballsByBowler.clear();
    this.lastBowler = null;
    this.currentOver = -1;
    this.radar.clearWheel();
    this.updateHud("Click to face up. Move the mouse to swing.");
    this.callText.setAlpha(0);
  }

  /** Swap the nine men on the ground, and on the radar. */
  private setField(field: Fielder[]): void {
    this.field = field;
    for (const gfx of this.fielders) gfx.destroy();
    this.fielders = field.map((fielder) => {
      const { x, depthY, scale } = project(fielder.distance, fielder.bearing);
      return drawFielder(this, x, GROUND_Y + depthY, scale, fielder.name);
    });
    this.radar?.setField(field);
  }

  /**
   * The start of an over: a new bowler, chosen by the same rule the simulation
   * uses, and a field for the phase. The attack you face is the opposition's
   * real six, rotated legally -- four overs each, never two in a row.
   */
  private startOver(over: number): void {
    this.currentOver = over;
    const phase = phaseOf(over);
    if (phase !== this.phase) {
      this.phase = phase;
      this.setField(fieldFor(phase));
    }
    const oversBowled = (b: Bowler) => Math.floor((this.ballsByBowler.get(b.id) ?? 0) / BALLS_PER_OVER);
    this.bowler = chooseBowler(this.sides.bowling.squad.bowlers, oversBowled, this.lastBowler, this.rng);
    this.lastBowler = this.bowler;
  }

  private bowl(): void {
    this.struck = false;
    this.justStruck = false;
    this.bouncedAfterStrike = false;
    this.awaitingResult = false;
    this.landingM = 0;
    this.bearing = 0;

    const over = Math.floor(this.innings.balls / BALLS_PER_OVER);
    if (over !== this.currentOver) this.startOver(over);
    const bowler = this.bowler!;

    const delivery = bowl(bowler, this.phase, this.rng);
    this.delivery = delivery;

    const shape = DELIVERY_SHAPE[delivery.length];
    const ball = this.matter.add.circle(BOWLER_X, GROUND_Y - shape.releaseUp, BALL_RADIUS, {
      restitution: shape.restitution,
      ...BALL_BODY,
      label: "ball",
      // A wide is a ball the bat cannot reach. The side-on physics has no
      // sideways to put it, so it is bowled through the blade instead.
      collisionFilter: {
        category: 1,
        mask: delivery.illegal === "wide" ? WIDE_BALL_MASK : 0xffffffff,
        group: 0,
      },
    });

    const pace = kph(delivery.speed);
    this.matter.body.setVelocity(ball, {
      x: -pace,
      y: pace * deliveryAim(shape, delivery.speed),
    });

    this.ball = ball;
    this.ballSprite.setVisible(true);
    this.ballSprite.setGhost(delivery.illegal === "wide");
    // The speed is fair to show -- you can see a quick one coming. The length is
    // not, and is only revealed once the ball has been played.
    const overs = this.ballsByBowler.get(bowler.id) ?? 0;
    this.updateHud(`${bowler.name} (${Math.floor(overs / BALLS_PER_OVER)}.${overs % BALLS_PER_OVER}) in — ${Math.round(delivery.speed)}kph`);
  }

  update(): void {
    this.readStance();
    this.bat.update(this.input.activePointer);
    // The figure follows the hands, at a fraction of the travel -- the feet move
    // further than the head does.
    this.batsman.setPosition(
      this.bat.pivotPoint.x - GLOVE_LOCAL_X,
      GROUND_Y + (this.bat.pivotPoint.y - PIVOT.y) * 0.35,
    );
    this.batGfx.setPosition(this.bat.body.position.x, this.bat.body.position.y);
    this.batGfx.setRotation(this.bat.body.angle);

    const ball = this.ball;
    if (!ball) return;

    // Soft hands, the frame after contact; see contactDamping.
    if (this.justStruck) {
      this.justStruck = false;
      const soft = contactDamping(this.contactAngularVelocity);
      this.matter.body.setVelocity(ball, { x: ball.velocity.x * soft, y: ball.velocity.y * soft });
    }
    // The outfield slows a rolling ball. Matter will not do this on its own.
    if (this.struck && isRolling(ball.position.y, ball.velocity.y)) {
      this.matter.body.setVelocity(ball, { x: rollingVelocity(ball.velocity.x), y: ball.velocity.y });
    }

    this.draw(ball);

    const outcome = judgeBall({
      x: ball.position.x,
      y: ball.position.y,
      vx: ball.velocity.x,
      vy: ball.velocity.y,
      struck: this.struck,
      bouncedAfterStrike: this.bouncedAfterStrike,
      airborneMs: this.struck ? this.time.now - this.struckAt : 0,
      bearing: this.bearing,
      landingM: this.landingM,
      field: this.field,
      illegal: this.delivery?.illegal,
    });
    if (outcome) this.resolve(outcome);
  }

  /**
   * Where the ball is drawn.
   *
   * Before the shot the physics position is the picture. After it, the
   * physics distance is *radial* -- how far from the bat along the bearing --
   * and the picture is its projection: the along component on the ground line,
   * the across component as a small drift toward the stands or the camera. The
   * shadow sits on the drifted ground line, which is what separates depth from
   * height for the eye; the radar shows the plan outright.
   */
  private draw(ball: MatterJS.BodyType): void {
    const camera = this.cameras.main;
    let x = ball.position.x;
    let y = ball.position.y;
    let groundY = GROUND_Y;

    if (this.struck) {
      const downfield = metresDownfield(ball.position.x);
      const bearing = travelledBearing(downfield, this.bearing);
      const { x: px, depthY } = project(Math.abs(downfield), bearing);
      x = px;
      y += depthY;
      groundY += depthY;
      this.radar.live(Math.abs(downfield), bearing);
    }

    this.ballSprite.update(x, y, groundY);

    // The camera follows the picture, not the physics; it can only go behind
    // the batter once there is a reason to.
    const minScroll = this.struck ? WORLD_LEFT : 0;
    const target = Phaser.Math.Clamp(x - CANVAS.width * 0.42, minScroll, MAX_SCROLL);
    camera.scrollX += (target - camera.scrollX) * 0.25;
  }

  /**
   * Which foot the player has committed to, this frame.
   *
   * Held rather than latched, but the pivot takes ~150ms to travel, so changing
   * your mind after the ball has pitched does not arrive in time. Holding both
   * is neutral, which is the honest reading of pressing both: no decision.
   */
  private readStance(): void {
    const back = this.keys.back.isDown || this.keys.backAlt.isDown;
    const front = this.keys.front.isDown || this.keys.frontAlt.isDown;
    const stance: Stance = back === front ? "neutral" : back ? "back" : "front";

    if (stance !== this.stance) {
      this.stance = stance;
      this.bat.setStance(stance);
      this.stanceText.setText(STANCE_LABEL[stance]).setColor(STANCE_COLOUR[stance]);
    }
  }

  private resolve(outcome: Outcome): void {
    if (this.awaitingResult) return;
    this.awaitingResult = true;

    this.innings.record(outcome);
    if (this.bowler && outcome.extra !== "wide" && outcome.extra !== "no-ball") {
      this.ballsByBowler.set(this.bowler.id, (this.ballsByBowler.get(this.bowler.id) ?? 0) + 1);
    }

    if (this.struck && this.ball) {
      const downfield = metresDownfield(this.ball.position.x);
      this.radar.trace(Math.abs(downfield), travelledBearing(downfield, this.bearing), outcome);
    }
    this.radar.hideBall();

    this.announce(outcome);
    const next = this.innings.complete ? "Click to start a new innings" : "Click for the next ball";
    // Naming the length afterwards is how a player learns to read the bounce.
    const length = this.delivery && !this.delivery.illegal ? `${this.delivery.length} length   ·   ` : "";
    this.updateHud(`${length}${next}`);

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
    const { batting, bowling } = this.sides;
    this.scoreText.setText(`${batting.code}  ${innings.score}   (${innings.oversText})`);
    this.rateText.setText(`CRR ${innings.runRate.toFixed(2)}    ·    v ${bowling.code}    ·    ${this.phase}`);
    this.overMarks.setText(innings.thisOver.map((ball) => ball.label).join(" "));
    this.statusText.setText(status);
  }
}
