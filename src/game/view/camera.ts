import { BATTER_X, BOUNDARY, CAMERA, CANVAS, GROUND_Y, PX_PER_METRE } from "../config";

export interface World {
  x: number;
  y: number;
  z: number;
}

export interface Projected {
  sx: number;
  sy: number;

  scale: number;

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

    this.right = normalize(cross({ x: 0, y: 1, z: 0 }, this.forward));
    this.up = cross(this.forward, this.right);
  }

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

  ground(alongM: number, acrossM: number): Projected | null {
    return this.project({ x: alongM * PX_PER_METRE, y: 0, z: acrossM * PX_PER_METRE });
  }

  static fromPhysics(x: number, y: number, acrossM = 0): World {
    return { x: x - BATTER_X, y: GROUND_Y - y, z: acrossM * PX_PER_METRE };
  }

  static fromPlan(alongM: number, acrossM: number, heightPx = 0): World {
    return { x: alongM * PX_PER_METRE, y: heightPx, z: acrossM * PX_PER_METRE };
  }

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

export const MATCH_CAMERA = new Camera(CAMERA.position, CAMERA.lookAt, CAMERA.focal, CAMERA.principal);

export interface Viewport {
  width: number;
  height: number;
}

const DESIGN_FEET = MATCH_CAMERA.project(Camera.fromPhysics(BATTER_X, GROUND_Y))!;
const DESIGN_ROPE = MATCH_CAMERA.project({ x: BOUNDARY, y: 0, z: 0 })!;

const ROPE_MARGIN = 24;

export function viewportScale(view: Viewport): number {
  const cover = Math.max(view.width / CANVAS.width, view.height / CANVAS.height);
  const feetX = view.width * (DESIGN_FEET.sx / CANVAS.width);
  const room = (view.width - ROPE_MARGIN - feetX) / (DESIGN_ROPE.sx - DESIGN_FEET.sx);
  return Math.max(view.width / CANVAS.width, Math.min(cover, room));
}

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

export function depthFor(acrossM: number, layer = 0): number {
  return 500 - acrossM + layer;
}
