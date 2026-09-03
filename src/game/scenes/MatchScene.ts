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
import { BALLS_PER_OVER, chooseBowler, oversOf, simulateInnings, strikeRateOf } from "../../sim/innings";
import type { InningsResult, InningsSummary } from "../../sim/innings";
import { resultOf, scoreline } from "../../sim/match";
import { makeRng } from "../../sim/rng";
import type { Rng } from "../../sim/rng";
import type { Bowler } from "../../sim/player";
import { FRANCHISES, franchiseById } from "../../data/franchises";
import type { Franchise } from "../../data/franchises";
import { loadSeason, saveSeason } from "../season/store";
import { fixtureById, playedFrom, recordResult } from "../../sim/tournament";
import type { Fixture, Season } from "../../sim/tournament";

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

/** What the scene is started with: who bats, who bowls, and which fixture if any. */
export interface MatchStart {
  bat?: string;
  bowl?: string;
  fixtureId?: string;
}

/**
 * Which two sides are playing. You bat; they bowl. The select or season scene
 * passes them in; the URL can still override for a quick look at any attack.
 */
function pickSides(data?: MatchStart): { you: Franchise; them: Franchise } {
  const params = new URLSearchParams(window.location.search);
  const lookup = (id: string | null | undefined, fallback: Franchise) => {
    try {
      return id ? franchiseById(id) : fallback;
    } catch {
      return fallback;
    }
  };
  const you = lookup(data?.bat ?? params.get("bat"), FRANCHISES[0]);
  let them = lookup(data?.bowl ?? params.get("bowl"), FRANCHISES[2]);
  if (them.id === you.id) them = FRANCHISES.find((f) => f.id !== you.id)!;
  return { you, them };
}

type Stage = "toss" | "batting" | "result";

/**
 * A match: a toss, two innings, a result.
 *
 * You bat one of the innings with a bat in your hand; the model plays the
 * other headlessly through `simulateInnings`, exactly as it does for every
 * fixture you are not in. Lose the toss and get put in, and you chase a
 * total that is already on the board, with the required rate on the strip.
 * Win it and bat first, and the model chases you the moment your innings
 * ends. Either way the result comes from `resultOf` on two summaries, one
 * of which happens to be yours, and if this is a fixture it goes straight
 * into the season table.
 */
export class MatchScene extends Phaser.Scene {
  private readonly camera = MATCH_CAMERA;

  private bat!: Bat;
  private batGfx!: Phaser.GameObjects.Container;
  private ball?: MatterJS.BodyType;
  private ballSprite!: BallSprite;
  private radar!: Radar;

  private awaitingResult = false;
  private struck = false;
  private justStruck = false;
  private contactAngularVelocity = 0;
  private struckAt = 0;
  private bouncedAfterStrike = false;
  private landingM = 0;
  private bearing: Bearing = 0;

  private innings = new HumanInnings();
  private rng: Rng = makeRng("powerplay");
  private delivery?: Delivery;
  private batsman!: Phaser.GameObjects.Container;
  private stance: Stance = "neutral";
  private stanceText!: Phaser.GameObjects.Text;
  private keys!: Record<"front" | "back" | "frontAlt" | "backAlt", Phaser.Input.Keyboard.Key>;

  private sides = pickSides();
  private season?: Season;
  private fixture?: Fixture;
  private stage: Stage = "toss";
  private youBatFirst = true;
  private theirInnings?: InningsResult;
  private card?: Phaser.GameObjects.Container;

  private bowler?: Bowler;
  private lastBowler: Bowler | null = null;
  private ballsByBowler = new Map<string, number>();
  private currentOver = -1;
  private phase: Phase = "powerplay";
  private field: Fielder[] = fieldFor("powerplay");
  private fielders: Phaser.GameObjects.Container[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private rateText!: Phaser.GameObjects.Text;
  private creaseText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private overMarks!: Phaser.GameObjects.Text;
  private callText!: Phaser.GameObjects.Text;

  constructor() {
    super("match");
  }

  init(data?: MatchStart): void {
    this.sides = pickSides(data);
    this.season = undefined;
    this.fixture = undefined;
    if (data?.fixtureId) {
      const season = loadSeason();
      if (season) {
        this.season = season;
        this.fixture = fixtureById(season, data.fixtureId);
      }
    }
    // A fixture replays from its seed; a quick match is different every time.
    this.rng = makeRng(this.fixture && this.season ? `${this.season.seed}:${this.fixture.id}` : `quick-${Date.now()}`);
    this.innings = new HumanInnings(this.sides.you.squad);
    this.ballsByBowler = new Map();
    this.lastBowler = null;
    this.currentOver = -1;
    this.phase = "powerplay";
    this.field = fieldFor("powerplay");
    this.fielders = [];
    this.ball = undefined;
    this.awaitingResult = false;
    this.stance = "neutral";
    this.stage = "toss";
    this.theirInnings = undefined;
    this.card = undefined;
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

    drawStadium(this, this.camera, this.sides.you.colours);
    drawStumps(this, this.camera, BATTER_X, Camera.fromPhysics, GROUND_Y);
    drawStumps(this, this.camera, BOWLER_X, Camera.fromPhysics, GROUND_Y);
    this.setField(fieldFor(this.phase));

    this.batsman = drawBatsman(this, PIVOT.y - GROUND_Y, this.sides.you.colours, lookFor(this.sides.you.squad.batters[0].id))
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

    this.input.on("pointerdown", () => this.onClick());

    const keyboard = this.input.keyboard!;
    this.keys = {
      back: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      front: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      backAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      frontAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    keyboard.on("keydown-ESC", () => this.leave());

    this.toss();
  }

  // -- the match --------------------------------------------------------------

  /**
   * The toss, and whatever follows it before you can bat. The side that wins
   * mostly chooses to chase, as sides do; if that leaves you batting second,
   * their innings is rolled now and its total is your target.
   */
  private toss(): void {
    const { you, them } = this.sides;
    const youWon = this.rng.chance(0.5);
    const chase = this.rng.chance(0.75);
    // Whoever won chooses; chasing means the other side bats first.
    this.youBatFirst = youWon ? !chase : chase;

    const lines: string[] = [];
    lines.push(`${youWon ? you.name : them.name} won the toss and chose to ${chase ? "field" : "bat"}.`);

    if (!this.youBatFirst) {
      this.theirInnings = simulateInnings(them.squad, you.squad, this.rng);
      this.innings = new HumanInnings(you.squad, this.theirInnings.runs + 1);
      lines.push(`${them.name} ${scoreline(this.theirInnings)}.`);
      lines.push(`You need ${this.theirInnings.runs + 1} to win.`);
    } else {
      lines.push(`You bat first. ${them.name} will chase whatever you make.`);
    }

    this.stage = "toss";
    this.showCard(this.fixture ? this.fixtureTitle() : `${you.name} v ${them.name}`, lines, "Click to take guard");
    this.updateHud("");
  }

  private fixtureTitle(): string {
    const f = this.fixture!;
    const stage = f.stage === "league" ? `Round ${f.round}` : ({
      qualifier1: "Qualifier 1", eliminator: "Eliminator", qualifier2: "Qualifier 2", final: "THE FINAL",
    } as const)[f.stage];
    return `${stage}  ·  ${franchiseById(f.home).name} v ${franchiseById(f.away).name}`;
  }

  private onClick(): void {
    if (this.stage === "toss") {
      this.hideCard();
      this.stage = "batting";
      this.updateHud("Click to face up. Move the mouse to swing.");
      return;
    }
    if (this.stage === "result") {
      this.leave();
      return;
    }
    if (this.innings.complete) return;
    if (!this.ball && !this.awaitingResult) this.bowl();
  }

  /** Your innings is over. The other one happens now if it has not already. */
  private finishMatch(): void {
    const { you, them } = this.sides;
    const yours: InningsSummary = this.innings.summary;
    let first: InningsSummary;
    let second: InningsSummary;

    if (this.youBatFirst) {
      this.theirInnings = simulateInnings(them.squad, you.squad, this.rng, { target: yours.runs + 1 });
      first = yours;
      second = this.theirInnings;
    } else {
      first = this.theirInnings!;
      second = yours;
    }

    const result = resultOf(first, second);
    const won = result.winner?.id === you.id;
    const lines = [
      `${you.code} ${scoreline(yours)}     ${them.code} ${scoreline(this.theirInnings!)}`,
      "",
      ...this.innings.battingLines
        .slice()
        .sort((a, b) => b.runs - a.runs)
        .slice(0, 3)
        .map((l) => `${l.batter.name}  ${l.runs}${l.dismissal ? "" : "*"} (${l.balls})  SR ${strikeRateOf(l).toFixed(0)}`),
    ];

    if (this.season && this.fixture) {
      const played = playedFrom(this.fixture, first, second);
      this.season = recordResult(this.season, played);
      saveSeason(this.season);
    }

    this.stage = "result";
    this.showCard(
      result.winner ? `${result.winner.name} ${result.margin}` : "Tied",
      lines,
      this.season ? "Click for the table" : "Click for the teams",
      won ? 0x14532d : result.winner ? 0x7f1d1d : 0x1e293b,
    );
  }

  private leave(): void {
    this.scene.start(this.season ? "season" : "select");
  }

  // -- the card ---------------------------------------------------------------

  private showCard(title: string, lines: string[], prompt: string, tint = 0x0f1b33): void {
    this.hideCard();
    const w = 720;
    const h = 120 + lines.length * 24 + 60;
    const x = (CANVAS.width - w) / 2;
    const y = 150;
    const c = this.add.container(0, 0).setDepth(1050);
    c.add(this.add.rectangle(0, 0, CANVAS.width, CANVAS.height, 0x000000, 0.45).setOrigin(0));
    c.add(this.add.rectangle(x, y, w, h, tint, 0.96).setOrigin(0).setStrokeStyle(2, 0x334155));
    c.add(this.add.rectangle(x, y, w, 8, this.sides.you.colours.primary).setOrigin(0));
    c.add(this.add.text(x + w / 2, y + 40, title, {
      fontFamily: FONT, fontSize: "26px", color: "#ffffff", fontStyle: "bold", align: "center", wordWrap: { width: w - 60 },
    }).setOrigin(0.5));
    lines.forEach((line, i) => {
      c.add(this.add.text(x + w / 2, y + 90 + i * 24, line, {
        fontFamily: FONT, fontSize: "16px", color: "#e2e8f0", align: "center",
      }).setOrigin(0.5));
    });
    c.add(this.add.text(x + w / 2, y + h - 30, prompt, {
      fontFamily: FONT, fontSize: "13px", color: "#fbbf24", fontStyle: "bold",
    }).setOrigin(0.5));
    this.card = c;
  }

  private hideCard(): void {
    this.card?.destroy();
    this.card = undefined;
  }

  // -- the hud ----------------------------------------------------------------

  private buildHud(): void {
    const height = 62;
    const top = CANVAS.height - height;
    const { you, them } = this.sides;

    // Everything on the strip sits above the ground and the people on it.
    this.add.rectangle(0, top, CANVAS.width, height, 0x08111f, 0.9).setOrigin(0, 0).setDepth(1000);
    this.add.rectangle(0, top, 6, height, you.colours.primary).setOrigin(0, 0).setDepth(1001);
    this.add.rectangle(6, top, 3, height, you.colours.secondary).setOrigin(0, 0).setDepth(1001);

    this.scoreText = this.add.text(26, top + 10, "", {
      fontFamily: FONT, fontSize: "30px", color: "#ffffff", fontStyle: "bold",
    }).setDepth(1001);
    this.rateText = this.add.text(26, top + 44, "", {
      fontFamily: FONT, fontSize: "12px", color: "#7dd3fc",
    }).setDepth(1001);
    this.creaseText = this.add.text(330, top + 10, "", {
      fontFamily: FONT, fontSize: "13px", color: "#e2e8f0",
    }).setDepth(1001);

    this.overMarks = this.add.text(CANVAS.width - 26, top + 12, "", {
      fontFamily: "ui-monospace, Menlo, monospace", fontSize: "20px", color: "#e2e8f0",
    }).setOrigin(1, 0).setDepth(1001);

    this.stanceText = this.add.text(620, top + 12, STANCE_LABEL.neutral, {
      fontFamily: FONT, fontSize: "14px", color: STANCE_COLOUR.neutral, fontStyle: "bold",
    }).setDepth(1001);
    this.add.text(620, top + 34, "← back   → front   esc leave", {
      fontFamily: FONT, fontSize: "11px", color: "#64748b",
    }).setDepth(1001);

    this.statusText = this.add.text(CANVAS.width - 26, top + 42, "", {
      fontFamily: FONT, fontSize: "12px", color: "#94a3b8",
    }).setOrigin(1, 0).setDepth(1001);

    this.callText = this.add.text(CANVAS.width / 2, 130, "", {
      fontFamily: FONT, fontSize: "44px", color: "#ffffff", fontStyle: "bold",
      stroke: "#0a1428", strokeThickness: 6,
    }).setOrigin(0.5).setDepth(1040).setAlpha(0);

    this.radar = new Radar(this, CANVAS.width - 96, 96, 70);
    this.radar.setField(this.field);
    this.add.text(CANVAS.width - 96, 176, `${you.code} bat  ·  ${them.code} bowl`, {
      fontFamily: FONT, fontSize: "11px", color: "#cbd5e1",
    }).setOrigin(0.5, 0).setDepth(1031);
  }

  private updateHud(status: string): void {
    const innings = this.innings;
    const { you, them } = this.sides;
    this.scoreText.setText(`${you.code}  ${innings.score}   (${innings.oversText})`);

    const need = innings.required;
    const chase = need
      ? `Target ${innings.target}   ·   need ${need.runs} off ${need.balls}   ·   RRR ${innings.requiredRate.toFixed(2)}`
      : `CRR ${innings.runRate.toFixed(2)}   ·   v ${them.code}   ·   ${this.phase}`;
    this.rateText.setText(chase);

    const crease = innings.atTheCrease.map((l, i) => `${l.batter.name.split(" ").pop()} ${l.runs}${i === 0 ? "*" : ""} (${l.balls})`);
    this.creaseText.setText(crease.join("     "));

    this.overMarks.setText(innings.thisOver.map((ball) => ball.label).join(" "));
    this.statusText.setText(status);
  }

  // -- the field and the attack ------------------------------------------------

  private setField(field: Fielder[]): void {
    this.field = field;
    for (const gfx of this.fielders) gfx.destroy();
    this.fielders = [];
    const squad = this.sides.them.squad.batters;
    field.forEach((fielder, i) => {
      const { along, across } = planPosition(fielder.distance, fielder.bearing);
      const p = this.camera.ground(along, across);
      if (!p || p.sx < -80 || p.sx > CANVAS.width + 80 || p.sy > CANVAS.height + 80) return;
      const figure = drawFielder(this, this.sides.them.colours, lookFor(squad[i % squad.length].id))
        .setPosition(p.sx, p.sy).setScale(p.scale).setDepth(depthFor(across));
      this.fielders.push(figure);
    });
    this.radar?.setField(field);
  }

  private startOver(over: number): void {
    this.currentOver = over;
    const phase = phaseOf(over);
    if (phase !== this.phase) {
      this.phase = phase;
      this.setField(fieldFor(phase));
    }
    const oversBowled = (b: Bowler) => Math.floor((this.ballsByBowler.get(b.id) ?? 0) / BALLS_PER_OVER);
    this.bowler = chooseBowler(this.sides.them.squad.bowlers, oversBowled, this.lastBowler, this.rng);
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
      collisionFilter: {
        category: 1,
        mask: delivery.illegal === "wide" ? WIDE_BALL_MASK : 0xffffffff,
        group: 0,
      },
    });

    const pace = kph(delivery.speed);
    this.matter.body.setVelocity(ball, { x: -pace, y: pace * deliveryAim(shape, delivery.speed) });

    this.ball = ball;
    this.ballSprite.setVisible(true);
    this.ballSprite.setGhost(delivery.illegal === "wide");
    const balls = this.ballsByBowler.get(bowler.id) ?? 0;
    this.updateHud(`${bowler.name} (${oversOf(balls)}) in — ${Math.round(delivery.speed)}kph`);
  }

  // -- the frame --------------------------------------------------------------

  update(): void {
    this.readStance();

    const pivot = this.bat.pivotPoint;
    const pivotP = this.camera.project(Camera.fromPhysics(pivot.x, pivot.y))!;
    const pointer = this.input.activePointer;
    this.bat.update(Camera.toPhysicsPlane(pointer.x, pointer.y, {
      physicsX: pivot.x, physicsY: pivot.y, projected: pivotP,
    }));

    const feet = this.camera.project(Camera.fromPhysics(
      pivot.x - GLOVE_LOCAL_X,
      GROUND_Y + (pivot.y - PIVOT.y) * 0.35,
    ))!;
    this.batsman.setPosition(feet.sx, feet.sy).setScale(feet.scale);
    const batP = this.camera.project(Camera.fromPhysics(this.bat.body.position.x, this.bat.body.position.y))!;
    this.batGfx.setPosition(batP.sx, batP.sy).setScale(batP.scale).setRotation(this.bat.body.angle);

    const ball = this.ball;
    if (!ball) return;

    if (this.justStruck) {
      this.justStruck = false;
      const soft = contactDamping(this.contactAngularVelocity);
      this.matter.body.setVelocity(ball, { x: ball.velocity.x * soft, y: ball.velocity.y * soft });
    }
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
    const length = this.delivery && !this.delivery.illegal ? `${this.delivery.length} length   ·   ` : "";
    this.updateHud(this.innings.complete ? "" : `${length}Click for the next ball`);

    if (this.ball) this.matter.world.remove(this.ball);
    this.ball = undefined;
    this.ballSprite.setVisible(false);

    this.time.delayedCall(400, () => {
      this.awaitingResult = false;
    });
    if (this.innings.complete) {
      this.time.delayedCall(1400, () => this.finishMatch());
    }
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
}
