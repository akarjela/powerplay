import Phaser from "phaser";

import {
  BALL_BODY, BALL_RADIUS, BATTER_X, BOWLER_X, CANVAS, DELIVERY_SHAPE, GLOVE_LOCAL_X, GROUND_BODY,
  GROUND_Y, PIVOT, WIDE_BALL_MASK, WORLD_LEFT, WORLD_WIDTH, deliveryAim, kph,
} from "../config";
import type { Stance } from "../config";
import { Bat } from "../physics/bat";
import { contactDamping } from "../physics/swing";
import {
  fieldFor, isRolling, judgeBall, metresDownfield, rollingVelocity,
} from "../physics/field";
import type { Fielder } from "../physics/field";
import { planPosition, shotBearing, travelledBearing } from "../physics/direction";
import type { Bearing } from "../physics/direction";
import { Camera, MATCH_CAMERA, depthFor } from "../view/camera";
import { BallSprite, drawBatsman, drawFielder, drawStumps, lookFor, makeBat } from "../visuals/figures";
import { drawStadium } from "../visuals/stadium";
import { Radar } from "../visuals/radar";
import type { Outcome } from "../../sim/types";
import { HumanInnings } from "../humanInnings";
import { bowl, phaseOf } from "../../sim/delivery";
import type { Delivery, Line, Phase } from "../../sim/delivery";
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
 * Where a delivery's line puts it across the pitch, in metres toward leg. The
 * physics has no such axis; the camera does, so a leg-stump ball is drawn a
 * touch nearer the far side and a wide visibly outside off.
 */
const LINE_ACROSS: Record<Line, number> = { leg: 0.3, stumps: 0, off: -0.3, "wide-off": -0.8 };
const WIDE_ACROSS = -1.4;

const FONT = "system-ui, -apple-system, Segoe UI, sans-serif";

/**
 * Which two sides are playing. You bat; they bowl. The select scene passes
 * them in; the URL can still override for a quick look at any attack.
 */
function pickSides(data?: { bat?: string; bowl?: string }): { batting: Franchise; bowling: Franchise } {
  const params = new URLSearchParams(window.location.search);
  const lookup = (id: string | null | undefined, fallback: Franchise) => {
    try {
      return id ? franchiseById(id) : fallback;
    } catch {
      return fallback;
    }
  };
  const batting = lookup(data?.bat ?? params.get("bat"), FRANCHISES[0]);
  let bowling = lookup(data?.bowl ?? params.get("bowl"), FRANCHISES[2]);
  if (bowling.id === batting.id) bowling = FRANCHISES.find((f) => f.id !== batting.id)!;
  return { batting, bowling };
}

export class MatchScene extends Phaser.Scene {
  private readonly camera = MATCH_CAMERA;

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
  /** Has the ball touched the ground since being hit? Decides a catch, and six against four. */
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

  init(data?: { bat?: string; bowl?: string }): void {
    this.sides = pickSides(data);
    this.innings = new HumanInnings();
    this.rng = makeRng("powerplay");
    this.ballsByBowler = new Map();
    this.lastBowler = null;
    this.currentOver = -1;
    this.phase = "powerplay";
    this.field = fieldFor("powerplay");
    this.fielders = [];
    this.ball = undefined;
    this.awaitingResult = false;
    this.stance = "neutral";
  }

  create(): void {
    const width = WORLD_WIDTH - WORLD_LEFT;
    this.matter.world.setBounds(WORLD_LEFT, -3000, width, 4000);

    /**
     * The outfield, as physics rather than just paint. Without this the ball
     * falls straight through the drawn pitch and passes ~100px below the
     * bat's arc, which reads as "the swing is broken".
     */
    this.matter.add.rectangle(WORLD_LEFT + width / 2, GROUND_Y + 60, width, 120, {
      isStatic: true,
      label: "ground",
      ...GROUND_BODY,
    });

    drawStadium(this, this.camera, this.sides.batting.colours);
    drawStumps(this, this.camera, BATTER_X, Camera.fromPhysics, GROUND_Y);
    drawStumps(this, this.camera, BOWLER_X, Camera.fromPhysics, GROUND_Y);
    this.setField(fieldFor(this.phase));

    // One pivot, two consumers: the figure's hands and the bat's constraint.
    this.batsman = drawBatsman(this, PIVOT.y - GROUND_Y, this.sides.batting.colours, lookFor(this.sides.batting.squad.batters[0].id))
      .setDepth(depthFor(0, 1));
    this.bat = new Bat(this, PIVOT.x, PIVOT.y);
    this.batGfx = makeBat(this).setDepth(depthFor(0, 2));
    this.ballSprite = new BallSprite(this);

    this.buildHud();

    /**
     * Bounce and contact come from collision events, not from sampling. The
     * physics steps 240 times a second and `update()` runs 60; a struck ball
     * can touch down and be airborne again inside one frame.
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

    const keyboard = this.input.keyboard!;
    this.keys = {
      back: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      front: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      backAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      frontAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    keyboard.on("keydown-ESC", () => this.scene.start("select"));
  }

  /**
   * A broadcast strip along the bottom. Score, overs, run rate, the over so
   * far; the batting side's colours on the left, the way television does it.
   */
  private buildHud(): void {
    const height = 62;
    const top = CANVAS.height - height;
    const { batting, bowling } = this.sides;

    this.add.rectangle(0, top, CANVAS.width, height, 0x08111f, 0.9)
      .setOrigin(0, 0).setDepth(20);
    this.add.rectangle(0, top, 6, height, batting.colours.primary).setOrigin(0, 0).setDepth(21);
    this.add.rectangle(6, top, 3, height, batting.colours.secondary).setOrigin(0, 0).setDepth(21);

    this.scoreText = this.add.text(26, top + 12, "", {
      fontFamily: FONT, fontSize: "30px", color: "#ffffff", fontStyle: "bold",
    }).setDepth(21);

    this.rateText = this.add.text(26, top + 44, "", {
      fontFamily: FONT, fontSize: "12px", color: "#7dd3fc",
    }).setDepth(21);

    this.overMarks = this.add.text(CANVAS.width - 26, top + 14, "", {
      fontFamily: "ui-monospace, Menlo, monospace", fontSize: "20px", color: "#e2e8f0",
    }).setOrigin(1, 0).setDepth(21);

    this.stanceText = this.add.text(360, top + 20, STANCE_LABEL.neutral, {
      fontFamily: FONT, fontSize: "15px", color: STANCE_COLOUR.neutral, fontStyle: "bold",
    }).setDepth(21);

    this.add.text(360, top + 40, "← back    → front    esc teams", {
      fontFamily: FONT, fontSize: "11px", color: "#64748b",
    }).setDepth(21);

    this.statusText = this.add.text(CANVAS.width - 26, top + 44, "", {
      fontFamily: FONT, fontSize: "12px", color: "#94a3b8",
    }).setOrigin(1, 0).setDepth(21);

    // Big centred call for the result of a ball -- "SIX!", "Caught at mid-on".
    this.callText = this.add.text(CANVAS.width / 2, 130, "", {
      fontFamily: FONT, fontSize: "44px", color: "#ffffff", fontStyle: "bold",
      stroke: "#0a1428", strokeThickness: 6,
    }).setOrigin(0.5).setDepth(22).setAlpha(0);

    // The plan view, top right.
    this.radar = new Radar(this, CANVAS.width - 96, 96, 70);
    this.radar.setField(this.field);
    this.add.text(CANVAS.width - 96, 176, `${batting.code} bat  ·  ${bowling.code} bowl`, {
      fontFamily: FONT, fontSize: "11px", color: "#cbd5e1",
    }).setOrigin(0.5, 0).setDepth(31);

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

  /**
   * The nine men on the ground, projected. Anyone behind or beside the camera
   * -- deep point, third man -- is not drawn; the radar has them.
   */
  private setField(field: Fielder[]): void {
    this.field = field;
    for (const gfx of this.fielders) gfx.destroy();
    this.fielders = [];
    // Each position is manned by one of the eleven, so the same face stands
    // at mid-off all innings and the men differ from one another.
    const squad = this.sides.bowling.squad.batters;
    field.forEach((fielder, i) => {
      const { along, across } = planPosition(fielder.distance, fielder.bearing);
      const p = this.camera.ground(along, across);
      if (!p || p.sx < -80 || p.sx > CANVAS.width + 80 || p.sy > CANVAS.height + 80) return;
      const figure = drawFielder(this, this.sides.bowling.colours, lookFor(squad[i % squad.length].id))
        .setPosition(p.sx, p.sy).setScale(p.scale).setDepth(depthFor(across));
      this.fielders.push(figure);
    });
    this.radar?.setField(field);
  }

  /**
   * The start of an over: a new bowler, chosen by the same rule the simulation
   * uses, and a field for the phase.
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
      // A wide is a ball the bat cannot reach; it is bowled through the blade.
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
    const overs = this.ballsByBowler.get(bowler.id) ?? 0;
    this.updateHud(`${bowler.name} (${Math.floor(overs / BALLS_PER_OVER)}.${overs % BALLS_PER_OVER}) in — ${Math.round(delivery.speed)}kph`);
  }

  update(): void {
    this.readStance();

    // The pointer, taken back through the camera onto the bat's plane.
    const pivot = this.bat.pivotPoint;
    const pivotP = this.camera.project(Camera.fromPhysics(pivot.x, pivot.y))!;
    const pointer = this.input.activePointer;
    this.bat.update(Camera.toPhysicsPlane(pointer.x, pointer.y, {
      physicsX: pivot.x, physicsY: pivot.y, projected: pivotP,
    }));

    // The figure follows the hands, at a fraction of the travel.
    const feet = this.camera.project(Camera.fromPhysics(
      pivot.x - GLOVE_LOCAL_X,
      GROUND_Y + (pivot.y - PIVOT.y) * 0.35,
    ))!;
    this.batsman.setPosition(feet.sx, feet.sy).setScale(feet.scale);
    const batP = this.camera.project(Camera.fromPhysics(this.bat.body.position.x, this.bat.body.position.y))!;
    this.batGfx.setPosition(batP.sx, batP.sy).setScale(batP.scale).setRotation(this.bat.body.angle);

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
   * Before the shot it is in the physics plane, offset across by the line.
   * After it, the physics distance is *radial* along the bearing, so the ball's
   * world position is the plan position at the physics height, and the camera
   * puts it where it should be: a square cut runs down the screen toward you,
   * a pull recedes into the leg side.
   */
  private draw(ball: MatterJS.BodyType): void {
    const heightPx = GROUND_Y - ball.position.y;
    let world;
    let acrossM: number;
    if (this.struck) {
      const downfield = metresDownfield(ball.position.x);
      const bearing = travelledBearing(downfield, this.bearing);
      const plan = planPosition(Math.abs(downfield), bearing);
      world = Camera.fromPlan(plan.along, plan.across, heightPx);
      acrossM = plan.across;
      this.radar.live(Math.abs(downfield), bearing);
    } else {
      acrossM = this.delivery?.illegal === "wide" ? WIDE_ACROSS : LINE_ACROSS[this.delivery?.line ?? "stumps"];
      world = Camera.fromPhysics(ball.position.x, ball.position.y, acrossM);
    }

    const p = this.camera.project(world);
    const shadow = this.camera.project({ ...world, y: 0 });
    if (!p || !shadow) return;
    this.ballSprite.setDepth(depthFor(acrossM));
    this.ballSprite.update(p, shadow, heightPx);
  }

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
    const length = this.delivery && !this.delivery.illegal ? `${this.delivery.length} length   ·   ` : "";
    this.updateHud(`${length}${next}`);

    if (this.ball) this.matter.world.remove(this.ball);
    this.ball = undefined;
    this.ballSprite.setVisible(false);

    this.time.delayedCall(400, () => {
      this.awaitingResult = false;
    });
  }

  private announce(outcome: Outcome): void {
    const colour = outcome.wicket ? "#f87171" : outcome.runs >= 4 ? "#fbbf24" : "#e2e8f0";
    const text = this.innings.complete
      ? `${this.innings.closedBecause} — ${this.innings.score} (${this.innings.oversText})`
      : outcome.description;
    this.callText.setText(text).setColor(colour).setAlpha(1).setScale(0.85);

    this.tweens.add({ targets: this.callText, scale: 1, duration: 180, ease: "Back.easeOut" });
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
