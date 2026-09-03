import { BATTER_X, BOUNDARY, CAMERA, CANVAS, GROUND_Y, PX_PER_METRE } from "../config";

/**
 * A pinhole camera over the ground.
 *
 * Pure: points in, points out. The scene asks it where to draw things and how
 * big; `stadium.ts` asks it where the rope and the stands go. Nothing here
 * knows about Phaser, so its geometry is tested like any other arithmetic.
 *
 * World units are pixels, matching the physics: X along the pitch from the
 * striker's stumps toward the bowler, Y up from the turf, Z across toward the
 * leg side. `fromPhysics` and `fromPlan` build those from the two things the
 * game actually has -- a Matter body in the side-on plane, and a plan position
 * from direction.ts.
 */

export interface World {
  x: number;
  y: number;
  z: number;
}

export interface Projected {
  sx: number;
  sy: number;
  /** Screen pixels per world pixel at this depth. */
  scale: number;
  /** Distance from the camera along its view axis. Larger is further away. */
  depth: number;
}

const sub = (a: World, b: World): World => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: World, b: World) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: World, b: World): World => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = (v: World): World => {
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};

export class Camera {
  readonly position: World;
  readonly focal: number;
  private readonly forward: World;
  private readonly right: World;
  private readonly up: World;
  private readonly cx: number;
  private readonly cy: number;

  constructor(
    position: World,
    lookAt: World,
    focal: number,
    principal: { x: number; y: number } = { x: CANVAS.width / 2, y: CANVAS.height / 2 },
  ) {
    this.position = position;
    this.focal = focal;
    this.cx = principal.x;
    this.cy = principal.y;

    this.forward = normalize(sub(lookAt, position));
    // Screen right is +X (toward the bowler) when the camera looks along +Z.
    this.right = normalize(cross({ x: 0, y: 1, z: 0 }, this.forward));
    this.up = cross(this.forward, this.right);
  }

  /** Null for a point behind the camera, which cannot be drawn. */
  project(point: World): Projected | null {
    const v = sub(point, this.position);
    const depth = dot(v, this.forward);
    if (depth < 1) return null;
    const scale = this.focal / depth;
    return {
      sx: this.cx + dot(v, this.right) * scale,
      sy: this.cy - dot(v, this.up) * scale,
      scale,
      depth,
    };
  }

  /** Where a point on the turf appears. `along` and `across` in metres. */
  ground(alongM: number, acrossM: number): Projected | null {
    return this.project({ x: alongM * PX_PER_METRE, y: 0, z: acrossM * PX_PER_METRE });
  }

  /**
   * The world point for something in the physics' side-on plane at a given
   * across offset. Physics x is measured from the canvas edge with the stumps
   * at BATTER_X; physics y is down with the turf at GROUND_Y.
   */
  static fromPhysics(x: number, y: number, acrossM = 0): World {
    return { x: x - BATTER_X, y: GROUND_Y - y, z: acrossM * PX_PER_METRE };
  }

  /** The world point for a plan position at a height in physics pixels. */
  static fromPlan(alongM: number, acrossM: number, heightPx = 0): World {
    return { x: alongM * PX_PER_METRE, y: heightPx, z: acrossM * PX_PER_METRE };
  }

  /**
   * Convert a screen point back to the physics plane (Z = 0), given where a
   * reference point on that plane projects. The camera looks level, so the
   * plane is parallel to the image plane and the mapping is a similarity:
   * exact, not an approximation. This is how the pointer reaches the bat.
   */
  static toPhysicsPlane(
    sx: number,
    sy: number,
    reference: { physicsX: number; physicsY: number; projected: Projected },
  ): { x: number; y: number } {
    const { physicsX, physicsY, projected } = reference;
    return {
      x: physicsX + (sx - projected.sx) / projected.scale,
      y: physicsY + (sy - projected.sy) / projected.scale,
    };
  }
}

/**
 * The match camera as designed, on the 1280x720 design frame in config. One
 * instance; it does not move. Everything measured about the framing was
 * measured on this camera, and `cameraForViewport` is a uniform scale of it.
 */
export const MATCH_CAMERA = new Camera(CAMERA.position, CAMERA.lookAt, CAMERA.focal, CAMERA.principal);

export interface Viewport {
  width: number;
  height: number;
}

/** Where the striker's feet and the straight rope fall on the design frame. */
const DESIGN_FEET = MATCH_CAMERA.project(Camera.fromPhysics(BATTER_X, GROUND_Y))!;
const DESIGN_ROPE = MATCH_CAMERA.project({ x: BOUNDARY, y: 0, z: 0 })!;
/** Pixels of frame kept beyond the straight rope, so it never sits on the edge. */
const ROPE_MARGIN = 24;

/**
 * How much the design frame is scaled to *cover* a viewport: the larger of the
 * two ratios, so the frame overflows on one axis and is cropped rather than
 * letterboxed. 1 on the design frame itself.
 *
 * Capped so the straight rope stays on screen. On a viewport much taller than
 * 16:9 -- a 4:3 window -- covering by height would crop the off side past the
 * boundary, and a straight six would leave the frame. Past that point the
 * scale holds and the extra height reveals more sky and near outfield instead,
 * which the world has anyway. Never below the width ratio, so the frame is
 * always at least as wide as the window.
 */
export function viewportScale(view: Viewport): number {
  const cover = Math.max(view.width / CANVAS.width, view.height / CANVAS.height);
  const feetX = view.width * (DESIGN_FEET.sx / CANVAS.width);
  const room = (view.width - ROPE_MARGIN - feetX) / (DESIGN_ROPE.sx - DESIGN_FEET.sx);
  return Math.max(view.width / CANVAS.width, Math.min(cover, room));
}

/**
 * The match camera for a real viewport. Full-bleed, no bars.
 *
 * A pinhole camera scaled by `s` about its principal point projects every
 * point to exactly `s` times where the design camera put it, so this is the
 * design framing enlarged to cover the window and then placed. It is placed
 * so the striker's feet keep the same *fraction* of the width and the height
 * they have on the design frame -- the pitch is the anchor, and the crop
 * comes out of the sky and the far outfield rather than out of the crease. On
 * a 16:9 viewport it is the design camera exactly. The world is a ring of
 * stands with no edge, so whatever the viewport reveals beyond the design
 * frame is drawn; nothing is ever black.
 *
 * The pointer mapping is unchanged in kind: `toPhysicsPlane` divides by the
 * projected scale, so a bigger frame asks for a proportionally longer drag,
 * exactly as the old FIT mode did when it stretched the canvas.
 */
export function cameraForViewport(view: Viewport): Camera {
  const s = viewportScale(view);
  const feet = DESIGN_FEET;
  const ox = view.width * (feet.sx / CANVAS.width) - feet.sx * s;
  const oy = view.height * (feet.sy / CANVAS.height) - feet.sy * s;
  return new Camera(CAMERA.position, CAMERA.lookAt, CAMERA.focal * s, {
    x: CAMERA.principal.x * s + ox,
    y: CAMERA.principal.y * s + oy,
  });
}

/** Draw order: further across toward the leg side is further from the camera. */
export function depthFor(acrossM: number, layer = 0): number {
  return 500 - acrossM + layer;
}
