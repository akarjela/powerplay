import { describe, expect, it } from "vitest";

import { Camera, MATCH_CAMERA, depthFor } from "../src/game/view/camera";
import { BATTER_X, BOUNDARY, CANVAS, GROUND_Y, PX_PER_METRE } from "../src/game/config";

/**
 * The camera is arithmetic and the arithmetic has consequences the scene
 * relies on: the pitch stays square to the frame, the leg side recedes, the
 * pointer maps back onto the bat's plane exactly. Pin them here.
 */

const cam = MATCH_CAMERA;

describe("the match camera", () => {
  it("keeps the batter in the left third and the straight rope inside the frame", () => {
    const batter = cam.ground(0, 0)!;
    const rope = cam.ground(BOUNDARY / PX_PER_METRE, 0)!;
    expect(batter.sx).toBeGreaterThan(CANVAS.width * 0.15);
    expect(batter.sx).toBeLessThan(CANVAS.width * 0.4);
    expect(rope.sx).toBeLessThan(CANVAS.width);
    expect(batter.sy).toBeGreaterThan(CANVAS.height * 0.5);
    expect(batter.sy).toBeLessThan(CANVAS.height * 0.75);
  });

  it("sees the pitch square-on: no foreshortening along it", () => {
    // Equal steps along the pitch are equal steps on screen.
    const a = cam.ground(0, 0)!;
    const b = cam.ground(10, 0)!;
    const c = cam.ground(20, 0)!;
    expect(b.sx - a.sx).toBeCloseTo(c.sx - b.sx, 6);
    expect(a.sy).toBeCloseTo(c.sy, 6);
    expect(a.scale).toBeCloseTo(c.scale, 6);
  });

  it("makes the leg side recede: further across is higher, smaller, deeper", () => {
    const near = cam.ground(0, -20)!;
    const at = cam.ground(0, 0)!;
    const far = cam.ground(0, 40)!;
    expect(far.sy).toBeLessThan(at.sy);
    expect(at.sy).toBeLessThan(near.sy);
    expect(far.scale).toBeLessThan(at.scale);
    expect(at.scale).toBeLessThan(near.scale);
    expect(far.depth).toBeGreaterThan(near.depth);
  });

  it("draws the ball at a size you can see", () => {
    // 12px in the physics; the side-on game drew it 1:1.
    const { scale } = cam.project(Camera.fromPhysics(BATTER_X, GROUND_Y - 40))!;
    expect(12 * scale).toBeGreaterThan(9);
    expect(12 * scale).toBeLessThan(14);
  });

  it("puts height up the screen", () => {
    const feet = cam.project(Camera.fromPhysics(BATTER_X, GROUND_Y))!;
    const head = cam.project(Camera.fromPhysics(BATTER_X, GROUND_Y - 100))!;
    expect(head.sy).toBeLessThan(feet.sy);
    expect(head.sx).toBeCloseTo(feet.sx, 6);
  });

  it("refuses to project a point behind itself", () => {
    expect(cam.project({ x: 0, y: 0, z: cam.position.z - 100 })).toBeNull();
  });

  it("maps the pointer back onto the bat's plane exactly", () => {
    const pivot = { physicsX: BATTER_X + 22, physicsY: GROUND_Y - 62 };
    const projected = cam.project(Camera.fromPhysics(pivot.physicsX, pivot.physicsY))!;
    // A point 100px right and 50px down of the pivot in physics space...
    const there = cam.project(Camera.fromPhysics(pivot.physicsX + 100, pivot.physicsY + 50))!;
    const back = Camera.toPhysicsPlane(there.sx, there.sy, { ...pivot, projected });
    expect(back.x).toBeCloseTo(pivot.physicsX + 100, 6);
    expect(back.y).toBeCloseTo(pivot.physicsY + 50, 6);
  });

  it("orders draw depth by distance across", () => {
    expect(depthFor(40)).toBeLessThan(depthFor(-20));
    expect(depthFor(10, 1)).toBeGreaterThan(depthFor(10));
  });
});
