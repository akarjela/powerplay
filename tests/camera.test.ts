import { describe, expect, it } from "vitest";

import { Camera, MATCH_CAMERA, depthFor, cameraForViewport, viewportScale } from "../src/game/view/camera";
import { BATTER_X, BOUNDARY, CANVAS, GROUND_Y, PX_PER_METRE } from "../src/game/config";

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

describe("cameraForViewport", () => {
  const feet = MATCH_CAMERA.project(Camera.fromPhysics(BATTER_X, GROUND_Y))!;

  it("is the design camera on the design frame", () => {
    const cam = cameraForViewport({ width: CANVAS.width, height: CANVAS.height });
    const p = cam.project(Camera.fromPhysics(BATTER_X, GROUND_Y))!;
    expect(p.sx).toBeCloseTo(feet.sx, 6);
    expect(p.sy).toBeCloseTo(feet.sy, 6);
    expect(viewportScale({ width: CANVAS.width, height: CANVAS.height })).toBe(1);
  });

  it("covers rather than contains, until the straight rope would leave the frame", () => {
    expect(viewportScale({ width: 2560, height: 1080 })).toBe(2);

    const wide = viewportScale({ width: 1440, height: 900 });
    expect(wide).toBeGreaterThan(1440 / 1280);
    expect(wide).toBeLessThan(900 / 720);

    const tall = viewportScale({ width: 1024, height: 768 });
    expect(tall).toBeGreaterThan(1024 / 1280);
    expect(tall).toBeLessThan(768 / 720);
  });

  it("is a uniform scale of the design framing, with the striker's feet anchored", () => {
    for (const view of [{ width: 2560, height: 1080 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      const cam = cameraForViewport(view);
      const s = viewportScale(view);
      const p = cam.project(Camera.fromPhysics(BATTER_X, GROUND_Y))!;

      expect(p.sx / view.width).toBeCloseTo(feet.sx / CANVAS.width, 6);
      expect(p.sy / view.height).toBeCloseTo(feet.sy / CANVAS.height, 6);

      const rope = Camera.fromPlan(BOUNDARY / PX_PER_METRE, 0, 0);
      const r0 = MATCH_CAMERA.project(rope)!;
      const r1 = cam.project(rope)!;
      expect(r1.sx - p.sx).toBeCloseTo((r0.sx - feet.sx) * s, 6);
      expect(r1.sy - p.sy).toBeCloseTo((r0.sy - feet.sy) * s, 6);
      expect(r1.scale / r0.scale).toBeCloseTo(s, 6);
    }
  });

  it("keeps the batter and the straight rope on screen on common viewports", () => {
    for (const view of [{ width: 2560, height: 1080 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1200 }]) {
      const cam = cameraForViewport(view);
      const p = cam.project(Camera.fromPhysics(BATTER_X, GROUND_Y))!;
      const rope = cam.project(Camera.fromPlan(BOUNDARY / PX_PER_METRE, 0, 0))!;
      expect(p.sx).toBeGreaterThan(0);
      expect(p.sy).toBeGreaterThan(0);
      expect(p.sy).toBeLessThan(view.height);
      expect(rope.sx).toBeLessThan(view.width);
    }
  });
});
