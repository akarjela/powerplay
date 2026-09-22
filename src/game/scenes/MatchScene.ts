import Phaser from "phaser";

import {
  BALL_BODY, BALL_RADIUS, BATTER_X, BOWLER_X, CANVAS, DELIVERY_SHAPE, GLOVE_LOCAL_X, GROUND_BODY,
  GROUND_Y, PIVOT, WIDE_BALL_MASK, WORLD_LEFT, WORLD_WIDTH, deliveryAim, kph, m,
} from "../config";
import type { Stance } from "../config";
import { Bat } from "../physics/bat";
import { batSpeedFactor, contactDamping } from "../physics/swing";
import {
  fieldFor, isRolling, judgeBall, metresDownfield, rollingVelocity, runOut,
} from "../physics/field";
import type { Fielder } from "../physics/field";
import { planPosition, shotBearing, travelledBearing } from "../physics/direction";
import type { Bearing } from "../physics/direction";
import { Camera, MATCH_CAMERA, cameraForViewport, depthFor } from "../view/camera";
import type { Viewport } from "../view/camera";
import { BallSprite, drawBatsman, drawFielder, drawKeeper, drawStumps, lookFor, makeBat } from "../visuals/figures";
import { drawStadium } from "../visuals/stadium";
import { Crowd } from "../visuals/crowd";
import { Radar } from "../visuals/radar";
import { Scoreboard } from "../hud/scoreboard";
import type { ScoreboardModel } from "../hud/scoreboard";
import { clearMoment, showMoment } from "../hud/moments";
import { hideCard, showCard } from "../hud/card";
import type { CardSpec } from "../hud/card";
import { hideScoresheet, showScoresheet } from "../hud/scoresheet";
import type { ScoresheetSide } from "../hud/scoresheet";
import { InningsView } from "../hud/inningsView";
import { reducedMotion } from "../hud/dom";
import type { Outcome } from "../../sim/types";
import { countsAsBall } from "../../sim/types";
import { bridge } from "../../sim/bridge";
import { HumanInnings } from "../humanInnings";
import { bowl, phaseOf } from "../../sim/delivery";
import type { Delivery, Line, Phase } from "../../sim/delivery";
import { BALLS_PER_OVER, OVERS, chooseBowler, economyOf, oversOf, simulateInnings, strikeRateOf } from "../../sim/innings";
import type { InningsResult } from "../../sim/innings";
import { resultOf, scoreline } from "../../sim/match";
import { sheetOf } from "../../sim/scorecard";
import { makeRng } from "../../sim/rng";
import type { Rng } from "../../sim/rng";
import type { Batter, Bowler } from "../../sim/player";
import { unit } from "../../sim/player";
import { FRANCHISES, franchiseById, franchiseIn } from "../../data/franchises";
import type { Franchise } from "../../data/franchises";
import { loadSeason, saveSeason } from "../season/store";
import { cardOf, fixtureById, playedFrom, recordResult } from "../../sim/tournament";
import type { InningsCard } from "../../sim/tournament";
import type { Fixture, Season } from "../../sim/tournament";

const LINE_ACROSS: Record<Line, number> = { leg: 0.3, stumps: 0, off: -0.3, "wide-off": -0.8 };
const WIDE_ACROSS = -1.4;

const PAR_RATE = 165 / OVERS;

const PLAYOFF_STAGE = {
  qualifier1: "Qualifier 1", eliminator: "Eliminator", qualifier2: "Qualifier 2", final: "The final",
} as const;

export interface MatchStart {
  bat?: string;
  bowl?: string;
  fixtureId?: string;
}

function pickSides(data?: MatchStart, season?: Season): { you: Franchise; them: Franchise } {
  const params = new URLSearchParams(window.location.search);
  const lookup = (id: string | null | undefined, fallback: Franchise) => {
    try {
      return id ? franchiseIn(season, id) : fallback;
    } catch {
      return fallback;
    }
  };
  const you = lookup(data?.bat ?? params.get("bat"), FRANCHISES[0]);
  let them = lookup(data?.bowl ?? params.get("bowl"), FRANCHISES[2]);
  if (them.id === you.id) them = FRANCHISES.find((f) => f.id !== you.id)!;
  return { you, them };
}

type Stage = "toss" | "watching" | "batting" | "result";

function callKind(outcome: Outcome): "" | "four" | "six" | "wicket" {
  if (outcome.wicket) return "wicket";
  if (outcome.runs === 6) return "six";
  if (outcome.runs === 4) return "four";
  return "";
}

export class MatchScene extends Phaser.Scene {
  private camera: Camera = MATCH_CAMERA;
  private view: Viewport = { width: CANVAS.width, height: CANVAS.height };
  private stadium?: Phaser.GameObjects.Image;
  private crowd?: Crowd;

  private bakedKeys: string[] = [];
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

  private effort = 0;

  private innings = new HumanInnings();
  private rng: Rng = makeRng("powerplay");
  private delivery?: Delivery;
  private batsman!: Phaser.GameObjects.Container;

  private striker?: Batter;
  private stance: Stance = "neutral";
  private keys!: Record<"front" | "back" | "frontAlt" | "backAlt", Phaser.Input.Keyboard.Key>;

  private sides = pickSides();
  private season?: Season;
  private fixture?: Fixture;
  private stage: Stage = "toss";
  private youBatFirst = true;
  private theirInnings?: InningsResult;
  private watching?: InningsView;

  private watched = false;

  private bowler?: Bowler;
  private lastBowler: Bowler | null = null;
  private resultCard?: CardSpec;

  private currentOver = -1;
  private phase: Phase = "powerplay";
  private field: Fielder[] = fieldFor("powerplay");
  private fielders: Phaser.GameObjects.Container[] = [];
  private keeper?: Phaser.GameObjects.Container;

  constructor() {
    super("match");
  }

  init(data?: MatchStart): void {
    this.season = undefined;
    this.fixture = undefined;
    if (data?.fixtureId) {
      const season = loadSeason();
      if (season) {
        this.season = season;
        this.fixture = fixtureById(season, data.fixtureId);
      }
    }
    this.sides = pickSides(data, this.season);

    this.rng = makeRng(this.fixture && this.season ? `${this.season.seed}:${this.fixture.id}` : `quick-${Date.now()}`);
    this.innings = new HumanInnings(this.sides.you.squad);
    this.resultCard = undefined;
    this.lastBowler = null;
    this.bowler = undefined;
    this.delivery = undefined;
    this.currentOver = -1;
    this.phase = "powerplay";
    this.field = fieldFor("powerplay");
    this.fielders = [];
    this.keeper = undefined;
    this.ball = undefined;
    this.awaitingResult = false;
    this.stance = "neutral";

    this.striker = undefined;
    this.stage = "toss";
    this.theirInnings = undefined;
    this.watching = undefined;
    this.watched = false;
  }

  create(): void {
    const width = WORLD_WIDTH - WORLD_LEFT;
    this.matter.world.setBounds(WORLD_LEFT, -3000, width, 4000);

    this.matter.add.rectangle(WORLD_LEFT + width / 2, GROUND_Y + 60, width, 120, {
      isStatic: true,
      label: "ground",
      ...GROUND_BODY,
    });

    this.bat = new Bat(this, PIVOT.x, PIVOT.y);
    this.batGfx = makeBat(this).setDepth(depthFor(0, 2));
    this.takeGuard(this.innings.atTheCrease[0]?.batter ?? this.sides.you.squad.batters[0]);
    this.ballSprite = new BallSprite(this);
    this.radar = new Radar(this, 0, 0, 70);
    this.radar.setField(this.field);
    this.scoreboard = new Scoreboard(() => this.onClick());

    this.stadium = undefined;
    this.crowd = undefined;
    this.bakedKeys = [];
    this.stumps = [];
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.crowd?.destroy();
      this.scoreboard.destroy();
      this.watching?.destroy();
      hideCard();
      hideScoresheet();
      clearMoment();
    });

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

  private layout(): void {
    this.view = { width: this.scale.width, height: this.scale.height };
    this.camera = cameraForViewport(this.view);

    this.stadium?.destroy();
    this.crowd?.destroy();
    const stale = this.bakedKeys;
    this.stadium = drawStadium(this, this.camera, this.sides.you.colours, this.view);
    this.crowd = new Crowd(this, this.camera, this.sides.you.colours, this.view, -98);
    this.bakedKeys = [this.stadium.texture.key, ...this.crowd.textureKeys];

    for (const key of stale) if (!this.bakedKeys.includes(key)) this.textures.remove(key);
    for (const g of this.stumps) g.destroy();
    this.stumps = [

      drawStumps(this, this.camera, BATTER_X, depthFor(0, 0.5)),
      drawStumps(this, this.camera, BOWLER_X, depthFor(0, -0.5)),
    ];
    this.setField(this.field);
    this.placeKeeper();

    const rope = this.camera.ground(0, -68)?.sy ?? this.view.height * 0.45;
    this.standsFlash?.destroy();
    this.standsFlash = this.add.rectangle(0, 0, this.view.width, rope, 0xfff2cc, 0)
      .setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-97);

    this.radar.setPosition(this.view.width - 96, 96);
  }

  private toss(): void {
    const { you, them } = this.sides;
    const youWon = this.rng.chance(0.5);
    this.stage = "toss";
    this.renderHud();

    if (youWon) {
      showCard({
        title: this.matchTitle(),
        lines: [{ text: `${you.name} won the toss.`, strong: true }, { text: "Bat first and set a total, or bowl and chase whatever they make." }],
        prompt: "",
        colours: you.colours,
        choices: [
          { label: "Bat first", onPick: () => this.decide(true, `${you.name} won the toss and chose to bat.`) },
          { label: "Bowl first", primary: true, onPick: () => this.decide(false, `${you.name} won the toss and chose to field.`) },
        ],
      }, () => undefined);
      return;
    }

    const chase = this.rng.chance(0.75);
    this.decide(chase, `${them.name} won the toss and chose to ${chase ? "field" : "bat"}.`);
  }

  private decide(youBatFirst: boolean, said: string): void {
    const { you, them } = this.sides;
    this.youBatFirst = youBatFirst;

    const lines: { text: string; strong?: boolean }[] = [{ text: said }];
    if (!youBatFirst) {
      this.theirInnings = simulateInnings(them.squad, you.squad, this.rng);
      this.innings = new HumanInnings(you.squad, this.theirInnings.runs + 1);
      lines.push({ text: `${them.name} bat first. Whatever they make, you chase.`, strong: true });
    } else {
      lines.push({ text: `You bat first. ${them.name} will chase whatever you make.`, strong: true });
    }

    this.stage = "toss";
    showCard({
      title: this.matchTitle(),
      lines,
      prompt: youBatFirst ? "Take guard" : "Watch their innings",
      colours: you.colours,
    }, () => this.onClick());
    this.renderHud();
  }

  private watch(target: number | undefined, then: () => void): void {
    const { you, them } = this.sides;
    this.stage = "watching";
    hideCard();
    this.scoreboard.setVisible(false);
    this.renderHud();
    this.watching = new InningsView(this.theirInnings!, {
      batting: { code: them.code, name: them.name, primary: them.colours.primary, secondary: them.colours.secondary },
      bowling: { code: you.code, name: you.name },
      target,
    }, () => {
      this.watching = undefined;
      this.scoreboard.setVisible(true);
      then();
      this.renderHud();
    });
  }

  private matchTitle(): string {
    const f = this.fixture;
    if (!f) return `${this.sides.you.name} v ${this.sides.them.name}`;
    const stage = f.stage === "league" ? `Round ${f.round}` : PLAYOFF_STAGE[f.stage];
    return `${stage}: ${franchiseById(f.home).name} v ${franchiseById(f.away).name}`;
  }

  private onClick(): void {
    switch (this.stage) {
      case "toss":
        if (!this.youBatFirst && this.theirInnings && !this.watched) this.watchTheirInnings();
        else this.startBatting();
        return;
      case "watching":
        return;
      case "result":
        this.leave();
        return;
      case "batting":
        if (this.innings.complete) return;
        if (!this.ball && !this.awaitingResult) this.bowl();
        return;
    }
  }

  private watchTheirInnings(): void {
    const total = this.theirInnings!;
    this.watch(undefined, () => {
      this.stage = "toss";
      showCard({
        title: `${this.sides.them.name} ${scoreline(total)}`,
        lines: [{ text: `You need ${total.runs + 1} to win.`, strong: true }],
        prompt: "Take guard",
        colours: this.sides.you.colours,
      }, () => this.onClick());

      this.watched = true;
    });
  }

  private startBatting(): void {
    hideCard();
    this.stage = "batting";
    this.scoreboard.say("Move the mouse to swing. Arrow keys commit a foot.");
    this.renderHud();
  }

  private finishMatch(): void {
    if (!this.youBatFirst) {
      this.settle();
      return;
    }
    const { you, them } = this.sides;
    const target = this.innings.summary.runs + 1;
    this.theirInnings = simulateInnings(them.squad, you.squad, this.rng, { target });
    this.watch(target, () => this.settle());
  }

  private settle(): void {
    const { you, them } = this.sides;
    const yours = this.innings.summary;
    const theirs = this.theirInnings!;
    const first = this.youBatFirst ? yours : theirs;
    const second = this.youBatFirst ? theirs : yours;

    const result = resultOf(first, second);
    const won = result.winner?.id === you.id;
    const best = this.innings.battingLines
      .slice()
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 3);
    const lines = [
      { text: `${you.code} ${scoreline(yours)}     ${them.code} ${scoreline(theirs)}`, strong: true },
      { text: "" },
      ...best.map((l) => ({ text: `${l.batter.name}  ${l.runs}${l.dismissal ? "" : "*"} (${l.balls})  SR ${strikeRateOf(l).toFixed(0)}` })),
    ];

    if (this.season && this.fixture) {
      const yourCard: InningsCard = {
        batting: this.innings.battingLines.filter((l) => l.balls > 0 || l.runs > 0).map((l) => ({
          id: l.batter.id, name: l.batter.name, squad: you.id, runs: l.runs, balls: l.balls,
        })),
        bowling: this.innings.bowlingLines.filter((l) => l.balls > 0).map((l) => ({
          id: l.bowler.id, name: l.bowler.name, squad: them.id, wickets: l.wickets, runs: l.runs, balls: l.balls,
        })),
      };
      const theirCard = cardOf(theirs, you.id);
      const cards = this.youBatFirst ? { first: yourCard, second: theirCard } : { first: theirCard, second: yourCard };
      const yourSheet = this.innings.sheet;
      const theirSheet = sheetOf(theirs);
      const sheets = this.youBatFirst ? { first: yourSheet, second: theirSheet } : { first: theirSheet, second: yourSheet };
      this.season = recordResult(this.season, playedFrom(this.fixture, first, second, cards, sheets));
      saveSeason(this.season);
    }

    this.stage = "result";
    const tone = won ? "won" : result.winner ? "lost" : "neutral";
    const back = this.season ? "Back to the table" : "Back to the teams";
    this.resultCard = {
      title: result.winner ? `${result.winner.name} ${result.margin}` : "Tied",
      lines,
      prompt: back,
      colours: you.colours,
      tone,
      choices: [
        { label: "Full scoresheet", onPick: () => this.showSheet(result.summary, tone, back) },
        { label: back, primary: true, onPick: () => this.leave() },
      ],
    };
    showCard(this.resultCard, () => this.onClick());
    this.renderHud();
  }

  private showSheet(summary: string, tone: "won" | "lost" | "neutral", back: string): void {
    const { you, them } = this.sides;
    const side = (f: Franchise): ScoresheetSide => ({
      id: f.id, code: f.code, name: f.name, primary: f.colours.primary, secondary: f.colours.secondary,
    });
    const yours = { sheet: this.innings.sheet, batting: side(you), bowling: side(them) };
    const theirs = { sheet: sheetOf(this.theirInnings!), batting: side(them), bowling: side(you) };
    const [first, second] = this.youBatFirst ? [yours, theirs] : [theirs, yours];
    this.scoreboard.setVisible(false);
    showScoresheet({
      title: this.matchTitle(),
      result: summary,
      innings: [first, { ...second, target: first.sheet.runs + 1 }],
      you: you.id,
      tone,
      actions: [
        { label: "Back", onPick: () => {
          this.scoreboard.setVisible(true);
          showCard(this.resultCard!, () => this.onClick());
        } },
        { label: back, primary: true, onPick: () => this.leave() },
      ],
    });
  }

  private leave(): void {
    this.scene.start(this.season ? "season" : "select");
  }

  private renderHud(): void {
    const innings = this.innings;
    const { you, them } = this.sides;
    const need = innings.required;

    const line = this.bowler ? this.innings.bowlingLineFor(this.bowler) : undefined;

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
      action: this.actionState(),
      stance: this.stance,
    });
  }

  private actionState(): ScoreboardModel["action"] {
    switch (this.stage) {
      case "toss":
        return { label: "Take guard", enabled: true, waiting: true };
      case "watching":
        return { label: "Watching", enabled: false, waiting: false };
      case "result":
        return { label: this.season ? "To the table" : "To the teams", enabled: true, waiting: true };
      case "batting":
        if (this.innings.complete) return { label: "Innings over", enabled: false, waiting: false };
        if (this.ball) return { label: "In play", enabled: false, waiting: false };
        if (this.awaitingResult) return { label: "Next ball", enabled: false, waiting: false };
        return { label: "Next ball", enabled: true, waiting: true };
    }
  }

  private takeGuard(batter: Batter): void {
    if (this.striker?.id === batter.id) return;
    this.striker = batter;
    this.bat.setSpeed(batSpeedFactor(unit(batter.technique)));
    this.batsman?.destroy();
    this.batsman = drawBatsman(this, PIVOT.y - GROUND_Y, this.sides.you.colours, lookFor(batter.id)).setDepth(depthFor(0, 1));
  }

  private placeKeeper(): void {
    this.keeper?.destroy();
    const p = this.camera.project(Camera.fromPhysics(BATTER_X - m(3.2), GROUND_Y, 0.3));
    if (!p) return;
    const squad = this.sides.them.squad.batters;
    this.keeper = drawKeeper(this, this.sides.them.colours, lookFor(squad[squad.length - 1].id))
      .setPosition(p.sx, p.sy).setScale(p.scale).setDepth(depthFor(0.3, 0));
  }

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
    this.bowler = chooseBowler(this.sides.them.squad.bowlers, (b) => this.innings.oversBowled(b), this.lastBowler, this.rng);
    this.lastBowler = this.bowler;
  }

  private bowl(): void {
    this.retireBall();
    this.struck = false;
    this.justStruck = false;
    this.bouncedAfterStrike = false;
    this.awaitingResult = false;
    this.landingM = 0;
    this.bearing = 0;
    this.effort = 0;

    const over = Math.floor(this.innings.balls / BALLS_PER_OVER);
    if (over !== this.currentOver) this.startOver(over);
    const bowler = this.bowler!;
    const striker = this.innings.atTheCrease[0]?.batter;
    if (striker) this.takeGuard(striker);

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

    if (!this.struck) this.effort = Math.max(this.effort, this.bat.effort());

    if (this.justStruck) {
      this.justStruck = false;
      const soft = contactDamping(this.contactAngularVelocity, unit(this.striker?.power ?? 50), this.bat.speedFactor);
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
      padded: this.stance === "front",
      illegal: this.delivery?.illegal,
    });
    if (outcome) {
      const run = runOut(outcome, this.rng.next());
      this.resolve(this.delivery ? bridge(run, this.delivery, { stance: this.stance, effort: this.effort }) : run);
    }
  }

  private draw(ball: MatterJS.BodyType): void {
    const heightPx = GROUND_Y - ball.position.y;
    let world;
    let acrossM: number;
    if (this.struck) {
      const downfield = metresDownfield(ball.position.x);
      const bearing = travelledBearing(downfield, this.bearing);
      const plan = planPosition(Math.abs(downfield), bearing);
      acrossM = plan.across;
      world = Camera.fromPlan(plan.along, acrossM, heightPx);
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
    this.innings.record(outcome, this.bowler);

    if (this.struck && this.ball) {
      const downfield = metresDownfield(this.ball.position.x);
      this.radar.trace(Math.abs(downfield), travelledBearing(downfield, this.bearing), outcome);
    }

    this.retireBall();

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

  private retireBall(): void {
    if (this.ball) this.matter.world.remove(this.ball);
    this.ball = undefined;
    this.ballSprite.setVisible(false);
    this.radar.hideBall();
  }

  private announce(outcome: Outcome, strikerId: string | undefined, runsBefore: number): void {
    const innings = this.innings;
    const kind = callKind(outcome);
    this.scoreboard.say(
      innings.complete ? `${innings.closedBecause}: ${innings.score} (${innings.oversText})` : outcome.description,
      kind,
      innings.complete ? 4000 : 1600,
    );

    const calm = reducedMotion();
    let busyUntil = 0;
    if (kind === "wicket") {
      showMoment({ kind: "wicket", how: outcome.description });
      busyUntil = 1250;
      this.crowd?.react("wicket");
      if (!calm) this.cameras.main.shake(260, 0.009);
    } else if (kind === "six") {
      showMoment({ kind: "six" });
      busyUntil = 1150;
      this.crowd?.react("six");
      this.boundaryFlash(0.3);
      if (!calm) this.pushIn();
    } else if (kind === "four") {
      showMoment({ kind: "four" });
      busyUntil = 900;
      this.crowd?.react("four");
      this.boundaryFlash(0.2);
    }

    const after = strikerId ? innings.battingLines.find((l) => l.batter.id === strikerId) : undefined;
    if (after && !outcome.extra) {
      for (const mark of [50, 100] as const) {
        if (runsBefore < mark && after.runs >= mark) {
          this.time.delayedCall(busyUntil, () => showMoment({ kind: "milestone", runs: mark, batter: after.batter.name, balls: after.balls }));
          busyUntil += 1300;
        }
      }
    }

    if (countsAsBall(outcome) && innings.balls % BALLS_PER_OVER === 0 && !innings.complete) {
      this.time.delayedCall(Math.max(busyUntil, 350), () => {
        if (!this.ball) showMoment({ kind: "over", number: innings.thisOverNumber, balls: innings.thisOver, runs: innings.thisOverRuns });
      });
    }
  }

  private boundaryFlash(peak: number): void {
    if (!this.standsFlash || reducedMotion()) return;
    this.tweens.killTweensOf(this.standsFlash);
    this.standsFlash.setAlpha(peak);
    this.tweens.add({ targets: this.standsFlash, alpha: 0, duration: 420, ease: "Quad.easeOut" });
  }

  private pushIn(): void {
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    cam.setZoom(1);
    this.tweens.add({ targets: cam, zoom: 1.035, duration: 240, ease: "Quad.easeOut", yoyo: true, hold: 60 });
  }
}
