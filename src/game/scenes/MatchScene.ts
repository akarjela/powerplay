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
import { Camera, MATCH_CAMERA, cameraForViewport, depthFor } from "../view/camera";
import type { Viewport } from "../view/camera";
import { BallSprite, drawBatsman, drawFielder, drawStumps, lookFor, makeBat } from "../visuals/figures";
import { drawStadium } from "../visuals/stadium";
import { Radar } from "../visuals/radar";
import { Scoreboard } from "../hud/scoreboard";
import type { ScoreboardModel } from "../hud/scoreboard";
import { clearMoment, showMoment } from "../hud/moments";
import { hideCard, showCard } from "../hud/card";
import { reducedMotion } from "../hud/dom";
import type { Outcome } from "../../sim/types";
import { countsAsBall, runsAgainstBowler } from "../../sim/types";
import { HumanInnings } from "../humanInnings";
import { bowl, phaseOf } from "../../sim/delivery";
import type { Delivery, Line, Phase } from "../../sim/delivery";
import { BALLS_PER_OVER, OVERS, chooseBowler, economyOf, oversOf, simulateInnings, strikeRateOf } from "../../sim/innings";
import type { BowlingLine, InningsResult, InningsSummary } from "../../sim/innings";
import { resultOf, scoreline } from "../../sim/match";
import { makeRng } from "../../sim/rng";
import type { Rng } from "../../sim/rng";
import type { Bowler } from "../../sim/player";
import { FRANCHISES, franchiseById } from "../../data/franchises";
import type { Franchise } from "../../data/franchises";
import { loadSeason, saveSeason } from "../season/store";
import { fixtureById, playedFrom, recordResult } from "../../sim/tournament";
import type { Fixture, Season } from "../../sim/tournament";

/**
 * Where a delivery's line puts it across the pitch, in metres toward leg. The
 * physics has no such axis; the camera does, so a leg-stump ball is drawn a
 * touch nearer the far side and a wide visibly outside off.
 */
const LINE_ACROSS: Record<Line, number> = { leg: 0.3, stumps: 0, off: -0.3, "wide-off": -0.8 };
const WIDE_ACROSS = -1.4;

/**
 * The rate a par first innings runs at: the calibrated ~165 over twenty. When
 * you bat first there is no required rate to be measured against, so the
 * strip measures you against this instead.
 */
const PAR_RATE = 165 / OVERS;

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
 *
 * The world is Phaser; the broadcast layer over it -- the strip, the cards,
 * the moments -- is DOM, under `src/game/hud/`. The scene assembles a model
 * for the strip each ball and otherwise knows nothing about how it looks.
 */
export class MatchScene extends Phaser.Scene {
  /** The camera for the current viewport; rebuilt on resize. */
  private camera: Camera = MATCH_CAMERA;
  private view: Viewport = { width: CANVAS.width, height: CANVAS.height };
  private stadium?: Phaser.GameObjects.Image;
  private stumps: Phaser.GameObjects.Graphics[] = [];
  private standsFlash?: Phaser.GameObjects.Rectangle;

  private bat!: Bat;
  private batGfx!: Phaser.GameObjects.Container;
  private ball?: MatterJS.BodyType;
  private ballSprite!: BallSprite;
  private radar!: Radar;
  private scoreboard!: Scoreboard;

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
  private keys!: Record<"front" | "back" | "frontAlt" | "backAlt", Phaser.Input.Keyboard.Key>;

  private sides = pickSides();
  private season?: Season;
  private fixture?: Fixture;
  private stage: Stage = "toss";
  private youBatFirst = true;
  private theirInnings?: InningsResult;

  private bowler?: Bowler;
  private lastBowler: Bowler | null = null;
  private bowling = new Map<string, BowlingLine>();
  /** Runs conceded by the bowler in the over in progress, for maidens. */
  private overRunsAgainst = 0;
  private currentOver = -1;
  private phase: Phase = "powerplay";
  private field: Fielder[] = fieldFor("powerplay");
  private fielders: Phaser.GameObjects.Container[] = [];

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
    this.bowling = new Map();
    this.overRunsAgainst = 0;
    this.lastBowler = null;
    this.bowler = undefined;
    this.delivery = undefined;
    this.currentOver = -1;
    this.phase = "powerplay";
    this.field = fieldFor("powerplay");
    this.fielders = [];
    this.ball = undefined;
    this.awaitingResult = false;
    this.stance = "neutral";
    this.stage = "toss";
    this.theirInnings = undefined;
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

    this.batsman = drawBatsman(this, PIVOT.y - GROUND_Y, this.sides.you.colours, lookFor(this.sides.you.squad.batters[0].id))
      .setDepth(depthFor(0, 1));
    this.bat = new Bat(this, PIVOT.x, PIVOT.y);
    this.batGfx = makeBat(this).setDepth(depthFor(0, 2));
    this.ballSprite = new BallSprite(this);
    this.radar = new Radar(this, 0, 0, 70);
    this.radar.setField(this.field);
    this.scoreboard = new Scoreboard(() => this.onClick());

    this.stadium = undefined;
    this.stumps = [];
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.scoreboard.destroy();
      hideCard();
      clearMoment();
    });

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
          if (!reducedMotion()) this.cameras.main.shake(90, 0.004);
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
    keyboard.on("keydown-SPACE", () => this.onClick());

    this.toss();
  }

  // -- the viewport -------------------------------------------------------------

  /**
   * Everything that depends on the size of the window: the camera, the baked
   * ground, the stumps and the fielders. Called once from `create` and again
   * on every resize. The batter, the bat and the ball are placed through the
   * camera every frame and need nothing here; the strip is CSS and lays
   * itself out.
   */
  private layout(): void {
    this.view = { width: this.scale.width, height: this.scale.height };
    this.camera = cameraForViewport(this.view);

    this.stadium?.destroy();
    this.stadium = drawStadium(this, this.camera, this.sides.you.colours, this.view);
    for (const g of this.stumps) g.destroy();
    this.stumps = [
      drawStumps(this, this.camera, BATTER_X, Camera.fromPhysics, GROUND_Y),
      drawStumps(this, this.camera, BOWLER_X, Camera.fromPhysics, GROUND_Y),
    ];
    this.setField(this.field);

    // The stands, for a flash of light on a boundary: everything above the rope.
    const rope = this.camera.ground(0, -68)?.sy ?? this.view.height * 0.45;
    this.standsFlash?.destroy();
    this.standsFlash = this.add.rectangle(0, 0, this.view.width, rope, 0xfff2cc, 0)
      .setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-99);

    this.radar.setPosition(this.view.width - 96, 96);
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

    const lines: { text: string; strong?: boolean }[] = [];
    lines.push({ text: `${youWon ? you.name : them.name} won the toss and chose to ${chase ? "field" : "bat"}.` });

    if (!this.youBatFirst) {
      this.theirInnings = simulateInnings(them.squad, you.squad, this.rng);
      this.innings = new HumanInnings(you.squad, this.theirInnings.runs + 1);
      lines.push({ text: `${them.name} ${scoreline(this.theirInnings)}.` });
      lines.push({ text: `You need ${this.theirInnings.runs + 1} to win.`, strong: true });
    } else {
      lines.push({ text: `You bat first. ${them.name} will chase whatever you make.`, strong: true });
    }

    this.stage = "toss";
    showCard({
      title: this.fixture ? this.fixtureTitle() : `${you.name} v ${them.name}`,
      lines,
      prompt: "Take guard",
      colours: you.colours,
    }, () => this.onClick());
    this.renderHud();
  }

  private fixtureTitle(): string {
    const f = this.fixture!;
    const stage = f.stage === "league" ? `Round ${f.round}` : ({
      qualifier1: "Qualifier 1", eliminator: "Eliminator", qualifier2: "Qualifier 2", final: "The final",
    } as const)[f.stage];
    return `${stage}: ${franchiseById(f.home).name} v ${franchiseById(f.away).name}`;
  }

  private onClick(): void {
    if (this.stage === "toss") {
      hideCard();
      this.stage = "batting";
      this.scoreboard.say("Move the mouse to swing. Arrow keys commit a foot.");
      this.renderHud();
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
      { text: `${you.code} ${scoreline(yours)}     ${them.code} ${scoreline(this.theirInnings!)}`, strong: true },
      { text: "" },
      ...this.innings.battingLines
        .slice()
        .sort((a, b) => b.runs - a.runs)
        .slice(0, 3)
        .map((l) => ({ text: `${l.batter.name}  ${l.runs}${l.dismissal ? "" : "*"} (${l.balls})  SR ${strikeRateOf(l).toFixed(0)}` })),
    ];

    if (this.season && this.fixture) {
      const played = playedFrom(this.fixture, first, second);
      this.season = recordResult(this.season, played);
      saveSeason(this.season);
    }

    this.stage = "result";
    showCard({
      title: result.winner ? `${result.winner.name} ${result.margin}` : "Tied",
      lines,
      prompt: this.season ? "Back to the table" : "Back to the teams",
      colours: you.colours,
      tone: won ? "won" : result.winner ? "lost" : "neutral",
    }, () => this.onClick());
    this.renderHud();
  }

  private leave(): void {
    this.scene.start(this.season ? "season" : "select");
  }

  // -- the strip ----------------------------------------------------------------

  private renderHud(): void {
    const innings = this.innings;
    const { you, them } = this.sides;
    const need = innings.required;

    const action: ScoreboardModel["action"] = this.stage === "toss"
      ? { label: "Take guard", enabled: true, waiting: true }
      : this.stage === "result"
        ? { label: this.season ? "To the table" : "To the teams", enabled: true, waiting: true }
        : innings.complete
          ? { label: "Innings over", enabled: false, waiting: false }
          : this.ball
            ? { label: "In play", enabled: false, waiting: false }
            : this.awaitingResult
              ? { label: "Next ball", enabled: false, waiting: false }
              : { label: "Next ball", enabled: true, waiting: true };

    const line = this.bowler ? this.bowlingLine(this.bowler) : undefined;

    this.scoreboard.render({
      team: { code: you.code, primary: you.colours.primary, secondary: you.colours.secondary },
      opponent: them.code,
      runs: innings.runs,
      wickets: innings.wickets,
      allOut: innings.score.indexOf("/") < 0,
      overs: innings.oversText,
      runRate: innings.runRate,
      phase: this.phase,
      target: innings.target,
      need,
      requiredRate: need ? innings.requiredRate : undefined,
      projected: need ? undefined : Math.round(innings.balls === 0 ? 0 : innings.runs + innings.runRate * (OVERS - innings.balls / BALLS_PER_OVER)),
      par: need ? undefined : PAR_RATE,
      batters: innings.atTheCrease.map((l, i) => ({
        name: l.batter.name, runs: l.runs, balls: l.balls, strikeRate: strikeRateOf(l), onStrike: i === 0,
      })),
      over: { number: innings.thisOverNumber, balls: innings.thisOver, runs: innings.thisOverRuns },
      bowler: line && {
        name: line.bowler.name,
        overs: oversOf(line.balls),
        maidens: line.maidens,
        runs: line.runs,
        wickets: line.wickets,
        economy: economyOf(line),
        speedKph: this.delivery?.speed,
      },
      action,
      stance: this.stance,
    });
  }

  private bowlingLine(bowler: Bowler): BowlingLine {
    let line = this.bowling.get(bowler.id);
    if (!line) {
      line = { bowler, balls: 0, runs: 0, wickets: 0, maidens: 0 };
      this.bowling.set(bowler.id, line);
    }
    return line;
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
      if (!p || p.sx < -80 || p.sx > this.view.width + 80 || p.sy > this.view.height + 80) return;
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
    const oversBowled = (b: Bowler) => Math.floor((this.bowling.get(b.id)?.balls ?? 0) / BALLS_PER_OVER);
    this.bowler = chooseBowler(this.sides.them.squad.bowlers, oversBowled, this.lastBowler, this.rng);
    this.lastBowler = this.bowler;
    this.overRunsAgainst = 0;
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
    clearMoment();
    this.renderHud();
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
    this.ballSprite.update(p, shadow, heightPx, this.struck && !this.bouncedAfterStrike);
  }

  private readStance(): void {
    const back = this.keys.back.isDown || this.keys.backAlt.isDown;
    const front = this.keys.front.isDown || this.keys.frontAlt.isDown;
    const stance: Stance = back === front ? "neutral" : back ? "back" : "front";

    if (stance !== this.stance) {
      this.stance = stance;
      this.bat.setStance(stance);
      this.renderHud();
    }
  }

  private resolve(outcome: Outcome): void {
    if (this.awaitingResult) return;
    this.awaitingResult = true;

    const striker = this.innings.atTheCrease[0];
    const runsBefore = striker?.runs ?? 0;
    this.innings.record(outcome);

    if (this.bowler) {
      const line = this.bowlingLine(this.bowler);
      const legal = countsAsBall(outcome);
      if (legal) line.balls++;
      const conceded = runsAgainstBowler(outcome);
      line.runs += conceded;
      this.overRunsAgainst += conceded;
      if (outcome.wicket && outcome.wicket !== "run-out") line.wickets++;
      if (legal && line.balls % BALLS_PER_OVER === 0 && this.overRunsAgainst === 0) line.maidens++;
    }

    if (this.struck && this.ball) {
      const downfield = metresDownfield(this.ball.position.x);
      this.radar.trace(Math.abs(downfield), travelledBearing(downfield, this.bearing), outcome);
    }
    this.radar.hideBall();

    if (this.ball) this.matter.world.remove(this.ball);
    this.ball = undefined;
    this.ballSprite.setVisible(false);

    this.announce(outcome, striker?.batter.id, runsBefore);
    this.renderHud();

    this.time.delayedCall(400, () => {
      this.awaitingResult = false;
      this.renderHud();
    });
    if (this.innings.complete) {
      this.time.delayedCall(1600, () => this.finishMatch());
    }
  }

  /**
   * What the ball was, as a broadcast would say it: the call on the strip,
   * a moment for anything worth one, and the game feel that goes with it.
   * Every effect is under 600ms and none of them run under reduced motion.
   */
  private announce(outcome: Outcome, strikerId: string | undefined, runsBefore: number): void {
    const innings = this.innings;
    const kind = outcome.wicket ? "wicket" : outcome.runs === 6 ? "six" : outcome.runs === 4 ? "four" : "";
    this.scoreboard.say(
      innings.complete ? `${innings.closedBecause}: ${innings.score} (${innings.oversText})` : outcome.description,
      kind,
      innings.complete ? 4000 : 1600,
    );

    const calm = reducedMotion();
    let busyUntil = 0;
    if (outcome.wicket) {
      showMoment({ kind: "wicket", how: outcome.description });
      busyUntil = 1250;
      if (!calm) this.cameras.main.shake(260, 0.009);
    } else if (outcome.runs === 6) {
      showMoment({ kind: "six" });
      busyUntil = 1150;
      this.boundaryFlash(0.3);
      if (!calm) this.pushIn();
    } else if (outcome.runs === 4) {
      showMoment({ kind: "four" });
      busyUntil = 900;
      this.boundaryFlash(0.2);
    }

    // A fifty or a hundred is earned; it follows the boundary that brought it up.
    const after = strikerId ? innings.battingLines.find((l) => l.batter.id === strikerId) : undefined;
    if (after && !outcome.extra) {
      for (const mark of [50, 100] as const) {
        if (runsBefore < mark && after.runs >= mark) {
          this.time.delayedCall(busyUntil, () => showMoment({ kind: "milestone", runs: mark, batter: after.batter.name, balls: after.balls }));
          busyUntil += 1300;
        }
      }
    }

    // End of the over: a lower third, once the ball's own moment has had its say.
    if (countsAsBall(outcome) && innings.balls % BALLS_PER_OVER === 0 && !innings.complete) {
      this.time.delayedCall(Math.max(busyUntil, 350), () => {
        if (!this.ball) showMoment({ kind: "over", number: innings.thisOverNumber, balls: innings.thisOver, runs: innings.thisOverRuns });
      });
    }
  }

  /** The stands light up for a moment on a boundary. */
  private boundaryFlash(peak: number): void {
    if (!this.standsFlash || reducedMotion()) return;
    this.tweens.killTweensOf(this.standsFlash);
    this.standsFlash.setAlpha(peak);
    this.tweens.add({ targets: this.standsFlash, alpha: 0, duration: 420, ease: "Quad.easeOut" });
  }

  /** A slight push-in on a six: 3.5% for a quarter of a second, then back. */
  private pushIn(): void {
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    cam.setZoom(1);
    this.tweens.add({ targets: cam, zoom: 1.035, duration: 240, ease: "Quad.easeOut", yoyo: true, hold: 60 });
  }
}
