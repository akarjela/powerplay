import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  BALL_BODY, BALL_RADIUS, BAT_BODY, BAT_CATEGORY, BAT_LENGTH, BAT_WIDTH, BOWLER_X,
  DELIVERY_SHAPE, GRAVITY_Y, GROUND_BODY, GROUND_Y, MAX_SWING_SPEED, PHYSICS_FPS, PIVOT, WIDE_BALL_MASK,
  WORLD_LEFT, WORLD_WIDTH, deliveryAim, kph,
} from "../src/game/config";
import type { Stance } from "../src/game/config";
import { contactDamping, nextAngularVelocity, settlePivot, swingTarget } from "../src/game/physics/swing";
import type { Point } from "../src/game/physics/swing";
import { fieldFor, isRolling, judgeBall, metresDownfield, rollingVelocity } from "../src/game/physics/field";
import type { Fielder } from "../src/game/physics/field";
import { shotBearing } from "../src/game/physics/direction";
import type { Delivery } from "../src/sim/delivery";
import type { Outcome } from "../src/sim/types";
import type { Rng } from "../src/sim/rng";

/**
 * The game's physics, without the game.
 *
 * Phaser bundles Matter as plain CommonJS under its `src/` tree, and nothing in
 * the ball's flight needs a canvas. So this builds the same world the scene
 * does -- the same bodies from the same constants in `config.ts`, the same
 * swing controller from `swing.ts`, the same judge from `field.ts` -- and steps
 * it at PHYSICS_FPS with the controller running once every rendered frame,
 * exactly as the browser would.
 *
 * It exists because the last three false verdicts about this game came from
 * automated playtests whose *own aim* was wrong, and because measuring from a
 * backgrounded browser tab reports a physics that is not running. A harness
 * that shares every constant with the scene cannot be wrong about the world;
 * it can only be wrong about the player, and the player is one small object
 * you can read.
 */

const require = createRequire(import.meta.url);
const matter = (module: string) =>
  require(fileURLToPath(new URL(`../node_modules/phaser/src/physics/matter-js/lib/${module}.js`, import.meta.url)));

/* eslint-disable @typescript-eslint/no-explicit-any */
const Engine: any = matter("core/Engine");
const Events: any = matter("core/Events");
const Bodies: any = matter("factory/Bodies");
const Body: any = matter("body/Body");
const Composite: any = matter("body/Composite");
const Constraint: any = matter("constraint/Constraint");
/* eslint-enable @typescript-eslint/no-explicit-any */

const STEP_MS = 1000 / PHYSICS_FPS;
const STEPS_PER_FRAME = PHYSICS_FPS / 60;
const FRAME_MS = STEP_MS * STEPS_PER_FRAME;

/** How the harness bats: a stance, and where the pointer is at each moment. */
export interface Player {
  stance: Stance;
  /** Pointer position in world space, given milliseconds since release. */
  pointer(elapsedMs: number): Point;
}

export interface Played {
  outcome: Outcome;
  /** Set if the bat met the ball. */
  contact?: {
    /** Pixels in front of the pivot at the moment of contact. */
    aheadPx: number;
    /** The bat's angle at contact, degrees forward of vertical. */
    bladeDegrees: number;
    /** Angular velocity of the blade at contact, per step. What the ball takes from it. */
    angularVelocity: number;
    heightPx: number;
    elapsedMs: number;
  };
  /** Radial metres the ball finished from the bat. */
  distanceM: number;
  bearing: number;
  landingM: number;
  /** Where the delivery pitched, metres in front of the striker. */
  pitchedM: number;
  /** Height when the ball first crossed the pivot, px. The hitting zone. */
  heightAtBatPx: number;
  /**
   * The hardest the blade swung while the ball was live, as a fraction of
   * MAX_SWING_SPEED. What the bridge reads as commitment; measured on the
   * frame, as the scene measures it.
   */
  effort: number;
  elapsedMs: number;
  /** The ball's state when the judge spoke, for debugging a ball that would not resolve. */
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
    // Phaser's setBounds builds 64px-thick walls just outside the bounds.
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

    // One step so every body's deltaTime is the real step, as it is in the
    // scene by the time anyone swings.
    Engine.update(this.engine, STEP_MS);
  }

  /**
   * Bowl one and play it out. Returns when the judge has spoken.
   *
   * The bearing is computed exactly where the scene computes it -- at the
   * moment of contact, from the same `shotBearing` -- so the harness is
   * measuring the direction model the player will meet.
   */
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

    // Six seconds is longer than any ball has ever taken; a ball still live
    // after that is a bug in the world, not a slow shot.
    for (let frame = 0; frame < 360; frame++) {
      settlePivot(this.pivot, this.home, player.stance);
      const target = swingTarget(player.pointer(this.elapsedMs), this.pivot);
      Body.setAngularVelocity(this.bat, nextAngularVelocity(this.bat.angle, this.bat.angularVelocity, target));
      if (!this.struck) effort = Math.max(effort, Math.abs(this.bat.angularVelocity) / MAX_SWING_SPEED);

      // The outfield, once a frame, exactly as the scene applies it.
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
        const soft = contactDamping(this.contact.angularVelocity);
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
        illegal: delivery.illegal,
      });
      if (outcome) {
        return this.finish(outcome, ball, bearing, heightAtBatPx, effort);
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
    // The bat back to hanging still, the pivot back home.
    Body.setAngle(this.bat, 0);
    Body.setAngularVelocity(this.bat, 0);
    this.pivot.x = this.home.x;
    this.pivot.y = this.home.y;
    Body.setPosition(this.bat, { x: this.home.x, y: this.home.y + BAT_LENGTH / 2 });
    Body.setVelocity(this.bat, { x: 0, y: 0 });
  }
}

/** The pointer a blade angle asks for: 100px out from the pivot, along the blade. */
export function pointerForBlade(pivot: Point, bladeDegrees: number): Point {
  const angle = (-bladeDegrees * Math.PI) / 180;
  return { x: pivot.x - Math.sin(angle) * 100, y: pivot.y + Math.cos(angle) * 100 };
}

/** A resting pointer: bat hanging, a touch behind the body. */
export const REST: Point = { x: PIVOT.x - 20, y: PIVOT.y + 60 };

/**
 * A swing: rest until `startMs`, then aim the blade at `bladeDegrees` forward
 * of vertical. Aiming *past* the ball is what a real swing does -- aiming at
 * the contact angle decelerates the blade into the ball and reads as a dead
 * bat, which is the harness mistake that produced 79% dot balls once before.
 */
export function swing(stance: Stance, startMs: number, bladeDegrees: number): Player {
  const aim = pointerForBlade(PIVOT, bladeDegrees);
  return {
    stance,
    pointer: (elapsed) => (elapsed < startMs ? REST : aim),
  };
}

export const phaseField = fieldFor;
