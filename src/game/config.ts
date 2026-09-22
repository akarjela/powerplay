export const PX_PER_METRE = 14;

export const PHYSICS_FPS = 240;

const BASE_FPS = 60;

export const m = (metres: number) => metres * PX_PER_METRE;

export const kph = (speed: number) => (speed * 1000 / 3600) * PX_PER_METRE / BASE_FPS;

export const PITCH_LENGTH = m(20.12);

export const BOUNDARY = m(68);

export const BAT_LENGTH = 52;
export const BAT_WIDTH = 11;
export const BALL_RADIUS = 6;
export const STUMP_HEIGHT = 30;
export const STUMP_WIDTH = 8;

export const CANVAS = { width: 1280, height: 720 };

export const GROUND_Y = 600;

export const BATTER_X = 160;
export const BOWLER_X = BATTER_X + PITCH_LENGTH;

export const WORLD_LEFT = -m(45);
export const WORLD_WIDTH = BATTER_X + BOUNDARY + 400;

export const KEEPER_X = BATTER_X - m(2);

export const SETTLED_SPEED = 0.35;

export const GRAVITY_Y = 1.15;

export const GROUND_BODY = { friction: 0.75, restitution: 0.42 } as const;
export const BALL_BODY = { friction: 0.04, frictionAir: 0.006, density: 0.008 } as const;

export const BAT_BODY = { density: 0.05, restitution: 0.35, frictionAir: 0 } as const;

export const ROLL_DECEL = 3.5;

export const AIR_DRAG_PER_FRAME = 1 - BALL_BODY.frictionAir;

export const BAT_CATEGORY = 0x0002;
export const WIDE_BALL_MASK = 0xffffffff & ~BAT_CATEGORY;

export const CAMERA = {
  position: { x: m(24), y: m(24), z: -m(80) },
  lookAt: { x: m(24), y: m(24), z: 0 },
  principal: { x: CANVAS.width / 2, y: 118 },
  focal: 1088,
} as const;

export const MAX_SWING_SPEED = 0.42;

export const SWING_RESPONSE = 0.30;

export const SWING_SMOOTHING = 0.45;

export interface DeliveryShape {
  releaseUp: number;

  aim: number;

  aimPerKph: number;
  restitution: number;
}

export const SHAPE_CALIBRATED_KPH = 138;

export const DELIVERY_SHAPE: Record<"yorker" | "full" | "good" | "short", DeliveryShape> = {
  yorker: { releaseUp: 150, aim: -0.019, aimPerKph: 0.0094, restitution: 0.70 },
  full: { releaseUp: 115, aim: -0.007, aimPerKph: 0.0076, restitution: 0.70 },
  good: { releaseUp: 90, aim: 0.083, aimPerKph: 0.0058, restitution: 0.70 },
  short: { releaseUp: 80, aim: 0.169, aimPerKph: 0.0051, restitution: 0.85 },
};

export function deliveryAim(shape: DeliveryShape, speedKph: number): number {
  return Math.max(-0.20, shape.aim + shape.aimPerKph * (speedKph - SHAPE_CALIBRATED_KPH));
}

export type Stance = "front" | "back" | "neutral";

export const STANCE_OFFSET: Record<Stance, { x: number; y: number }> = {
  front: { x: 20, y: 8 },
  neutral: { x: 0, y: 0 },
  back: { x: -12, y: -6 },
};

export const STANCE_RESPONSE = 0.22;

export const PIVOT = { x: BATTER_X + 22, y: GROUND_Y - 62 };

export const GLOVE_LOCAL_X = -4;
