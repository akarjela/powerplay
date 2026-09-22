import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  BALL_BODY, BALL_RADIUS, BAT_BODY, BAT_CATEGORY, BAT_LENGTH, BAT_WIDTH, BOWLER_X,
  DELIVERY_SHAPE, GRAVITY_Y, GROUND_BODY, GROUND_Y, MAX_SWING_SPEED, PHYSICS_FPS, PIVOT, WIDE_BALL_MASK,
  WORLD_LEFT, WORLD_WIDTH, deliveryAim, kph,
} from "../src/game/config";
import type { Stance } from "../src/game/config";
import { batSpeedFactor, contactDamping, nextAngularVelocity, settlePivot, swingEffort, swingTarget } from "../src/game/physics/swing";
import type { Point } from "../src/game/physics/swing";
import { isRolling, judgeBall, metresDownfield, rollingVelocity, runOut } from "../src/game/physics/field";
import type { Fielder } from "../src/game/physics/field";
import { shotBearing } from "../src/game/physics/direction";
import type { Delivery } from "../src/sim/delivery";
import type { Outcome } from "../src/sim/types";
import type { Rng } from "../src/sim/rng";

const require = createRequire(import.meta.url);
const matter = (module: string) =>
  require(fileURLToPath(new URL(`../node_modules/phaser/src/physics/matter-js/lib/${module}.js`, import.meta.url)));

const Engine: any = matter("core/Engine");
const Events: any = matter("core/Events");
const Bodies: any = matter("factory/Bodies");
const Body: any = matter("body/Body");
const Composite: any = matter("body/Composite");
const Constraint: any = matter("constraint/Constraint");

const STEP_MS = 1000 / PHYSICS_FPS;
const STEPS_PER_FRAME = PHYSICS_FPS / 60;
const FRAME_MS = STEP_MS * STEPS_PER_FRAME;

export interface Player {
  stance: Stance;

  pointer(elapsedMs: number): Point;

  power?: number;

  technique?: number;
}

export interface Played {
  outcome: Outcome;

  contact?: {
    aheadPx: number;

    bladeDegrees: number;

    angularVelocity: number;
    heightPx: number;
    elapsedMs: number;
  };

  distanceM: number;
  bearing: number;
  landingM: number;

  pitchedM: number;

  heightAtBatPx: number;

  effort: number;
  elapsedMs: number;

  final: { y: number; vx: number; vy: number };
}

export class Headless {
  private readonly engine = Engine.create();
  private readonly bat: MatterJS.BodyType;
  private readonly pivot: Point = { x: PIVOT.x, y: PIVOT.y };
  private readonly home: Point = { x: PIVOT.x, y: PIVOT.y };

  private ball?: MatterJS.BodyType;
  private struck = false;
  private bouncedAfterStrike = false;
  private landingM = 0;
  private pitchedM = 0;
  private contact?: Played["contact"];
  private elapsedMs = 0;

  constructor() {
    this.engine.gravity.y = GRAVITY_Y;

    const width = WORLD_WIDTH - WORLD_LEFT;
    const ground = Bodies.rectangle(WORLD_LEFT + width / 2, GROUND_Y + 60, width, 120, {
      isStatic: true, label: "ground", ...GROUND_BODY,
    });

    const walls = [
      Bodies.rectangle(WORLD_LEFT - 32, -1000, 64, 4128, { isStatic: true, label: "wall" }),
      Bodies.rectangle(WORLD_WIDTH + 32, -1000, 64, 4128, { isStatic: true, label: "wall" }),
      Bodies.rectangle(WORLD_LEFT + width / 2, -3032, width, 64, { isStatic: true, label: "wall" }),
    ];

    this.bat = Bodies.rectangle(PIVOT.x, PIVOT.y + BAT_LENGTH / 2, BAT_WIDTH, BAT_LENGTH, {
      ...BAT_BODY,
      label: "bat",
      ignoreGravity: true,
      collisionFilter: { category: BAT_CATEGORY, mask: 0xffffffff, group: 0 },
    });
    const pin = Constraint.create({
      bodyB: this.bat, pointA: this.pivot, pointB: { x: 0, y: -BAT_LENGTH / 2 }, length: 0, stiffness: 1,
    });

    Composite.add(this.engine.world, [ground, ...walls, this.bat, pin]);

    Events.on(this.engine, "collisionStart", (event: { pairs: { bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }[] }) => {
      for (const pair of event.pairs) {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        if (!labels.includes("ball") || !this.ball) continue;

        if (labels.includes("ground")) {
          if (this.struck && !this.bouncedAfterStrike) {
            this.bouncedAfterStrike = true;
            this.landingM = metresDownfield(this.ball.position.x);
          } else if (!this.struck && this.pitchedM === 0) {
            this.pitchedM = metresDownfield(this.ball.position.x);
          }
        }
        if (labels.includes("bat") && !this.struck) {
          this.struck = true;
          const angle = -this.bat.angle * (180 / Math.PI);
          this.contact = {
            aheadPx: this.ball.position.x - this.pivot.x,
            bladeDegrees: angle,
            angularVelocity: this.bat.angularVelocity,
            heightPx: GROUND_Y - this.ball.position.y,
            elapsedMs: this.elapsedMs,
          };
        }
      }
    });

    Engine.update(this.engine, STEP_MS);
  }

  play(delivery: Delivery, player: Player, field: Fielder[], rng: Rng): Played {
    this.reset();

    const shape = DELIVERY_SHAPE[delivery.length];
    const ball = Bodies.circle(BOWLER_X, GROUND_Y - shape.releaseUp, BALL_RADIUS, {
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
    Body.setVelocity(ball, { x: -pace, y: pace * deliveryAim(shape, delivery.speed) });
    Composite.add(this.engine.world, ball);
    this.ball = ball;

    let bearing = 0;
    let heightAtBatPx = -1;
    let struckAtMs = 0;
    let effort = 0;
    const speed = batSpeedFactor(player.technique ?? 0.5);

    for (let frame = 0; frame < 360; frame++) {
      settlePivot(this.pivot, this.home, player.stance);
      const target = swingTarget(player.pointer(this.elapsedMs), this.pivot);
      Body.setAngularVelocity(this.bat, nextAngularVelocity(this.bat.angle, this.bat.angularVelocity, target, speed));
      if (!this.struck) effort = Math.max(effort, swingEffort(this.bat.angularVelocity, speed));

      if (this.struck && isRolling(ball.position.y, ball.velocity.y)) {
        Body.setVelocity(ball, { x: rollingVelocity(ball.velocity.x), y: ball.velocity.y });
      }

      const struckBefore = this.struck;
      for (let step = 0; step < STEPS_PER_FRAME; step++) {
        Engine.update(this.engine, STEP_MS);
        if (heightAtBatPx < 0 && ball.position.x <= this.pivot.x) {
          heightAtBatPx = GROUND_Y - ball.position.y;
        }
      }
      this.elapsedMs += FRAME_MS;

      if (this.struck && !struckBefore && this.contact) {
        struckAtMs = this.elapsedMs;
        const soft = contactDamping(this.contact.angularVelocity, player.power ?? 0.5, speed);
        Body.setVelocity(ball, { x: ball.velocity.x * soft, y: ball.velocity.y * soft });
        bearing = shotBearing({
          aheadPx: this.contact.aheadPx,
          length: delivery.length,
          line: delivery.line,
          spray: rng.range(-1, 1),
        });
      }

      const outcome = judgeBall({
        x: ball.position.x,
        y: ball.position.y,
        vx: ball.velocity.x,
        vy: ball.velocity.y,
        struck: this.struck,
        bouncedAfterStrike: this.bouncedAfterStrike,
        airborneMs: this.struck ? this.elapsedMs - struckAtMs : 0,
        bearing,
        landingM: this.landingM,
        field,
        padded: player.stance === "front",
        illegal: delivery.illegal,
      });
      if (outcome) {
        return this.finish(runOut(outcome, rng.next()), ball, bearing, heightAtBatPx, effort);
      }
    }

    return this.finish({ runs: 0, description: "harness timeout" }, ball, bearing, heightAtBatPx, effort);
  }

  private finish(outcome: Outcome, ball: MatterJS.BodyType, bearing: number, heightAtBatPx: number, effort: number): Played {
    const played: Played = {
      outcome,
      contact: this.contact,
      distanceM: metresDownfield(ball.position.x),
      bearing,
      landingM: this.landingM,
      pitchedM: this.pitchedM,
      heightAtBatPx,
      effort: Math.min(1, effort),
      elapsedMs: this.elapsedMs,
      final: { y: ball.position.y, vx: ball.velocity.x, vy: ball.velocity.y },
    };
    Composite.remove(this.engine.world, ball);
    this.ball = undefined;
    return played;
  }

  private reset(): void {
    this.struck = false;
    this.bouncedAfterStrike = false;
    this.landingM = 0;
    this.pitchedM = 0;
    this.contact = undefined;
    this.elapsedMs = 0;

    Body.setAngle(this.bat, 0);
    Body.setAngularVelocity(this.bat, 0);
    this.pivot.x = this.home.x;
    this.pivot.y = this.home.y;
    Body.setPosition(this.bat, { x: this.home.x, y: this.home.y + BAT_LENGTH / 2 });
    Body.setVelocity(this.bat, { x: 0, y: 0 });
  }
}

export function pointerForBlade(pivot: Point, bladeDegrees: number): Point {
  const angle = (-bladeDegrees * Math.PI) / 180;
  return { x: pivot.x - Math.sin(angle) * 100, y: pivot.y + Math.cos(angle) * 100 };
}

export const REST: Point = { x: PIVOT.x - 20, y: PIVOT.y + 60 };

export function swing(stance: Stance, startMs: number, bladeDegrees: number): Player {
  const aim = pointerForBlade(PIVOT, bladeDegrees);
  return {
    stance,
    pointer: (elapsed) => (elapsed < startMs ? REST : aim),
  };
}
